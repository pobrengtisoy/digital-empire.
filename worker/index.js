/*
 * RZ Digital Empire — API Worker.
 * Serves /api/* and hands every other request to the static assets.
 * Data lives in Cloudflare D1 (binding DB). Tables create themselves on first use.
 * Security: PBKDF2 password hashes, hashed session tokens in HttpOnly cookies,
 * same-origin checks on writes, server-side pricing, size limits and rate limits.
 */

import { MINE_SCHEMA, mineRoutes } from './mine.js';
import { UPA_SCHEMA, upaRoutes } from './upa.js';

const SESSION_DAYS = 30;
const COOKIE = 'rz_sess';
const PBKDF2_ITER = 100000;
const RESERVED = new Set(['admin', 'api', 'dashboard', 'login', 'signup', 'rz', 'rzdigital', 'products', 'assets', 'tools', 'demo', 'www', 'help', 'support']);
const STATUSES = ['new', 'accepted', 'preparing', 'ready', 'completed', 'cancelled'];
const ORDER_TYPES = ['Dine-in', 'Pick-up', 'Delivery'];

// Official RZ prices (pesos). The checkout always charges from here, never from the browser.
// Keep in step with products.js, which only displays them.
const PRICES = {
  menu: { name: 'RZ Menu', setup: 3699, monthly: 449 },
  shop: { name: 'RZ Shop', setup: 4199, monthly: 499 },
  booking: { name: 'RZ Booking', setup: 4199, monthly: 499 },
  stay: { name: 'RZ Stay', setup: 4699, monthly: 549 },
  listahan: { name: 'RZ Listahan', setup: 2199, monthly: 299 },
  invite: { name: 'RZ Invite', setup: 2699, monthly: 0, unit: 'per event' },
  liga: { name: 'RZ Liga', setup: 3199, monthly: 0, unit: 'per season' },
  quote: { name: 'RZ Quote', setup: 2199, monthly: 299 },
  sahod: { name: 'RZ Sahod', setup: 2699, monthly: 349 },
  tindahan: { name: 'RZ Tindahan', setup: 2699, monthly: 349 },
  mine: { name: 'RZ Mine', setup: 2999, monthly: 349 },
  upa: { name: 'RZ Upa', setup: 3999, monthly: 449 },
};
const PURCHASE_STATUSES = ['pending', 'paid', 'setting-up', 'done', 'refunded', 'cancelled'];
const firstPayment = p => p.setup + p.monthly;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS businesses (id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, tagline TEXT DEFAULT '', hours TEXT DEFAULT '', gcash TEXT DEFAULT '', delivery_fee REAL DEFAULT 0, accepting INTEGER DEFAULT 1, notify_email TEXT DEFAULT '', notify_on INTEGER DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, business_id TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS menu_items (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, category TEXT NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '', price REAL NOT NULL, tag TEXT DEFAULT '', available INTEGER DEFAULT 1, sort INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_menu_business ON menu_items (business_id, sort)`,
  `CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, code TEXT NOT NULL, status TEXT NOT NULL, type TEXT NOT NULL, customer_name TEXT NOT NULL, contact TEXT DEFAULT '', location TEXT DEFAULT '', notes TEXT DEFAULT '', items_json TEXT NOT NULL, subtotal REAL NOT NULL, fee REAL NOT NULL, total REAL NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_business ON orders (business_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS ratelimits (k TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS purchases (id TEXT PRIMARY KEY, code TEXT NOT NULL, product TEXT NOT NULL, product_name TEXT NOT NULL, setup REAL NOT NULL, monthly REAL NOT NULL, amount REAL NOT NULL, buyer_name TEXT NOT NULL, business TEXT DEFAULT '', mobile TEXT NOT NULL, email TEXT DEFAULT '', notes TEXT DEFAULT '', reference TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_purchases_created ON purchases (created_at)`,
  ...MINE_SCHEMA,
  ...UPA_SCHEMA,
];

let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) schemaReady = env.DB.batch(SCHEMA.map(s => env.DB.prepare(s))).catch(err => { schemaReady = null; throw err; });
  return schemaReady;
}

/* ---------- small helpers ---------- */
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const now = () => new Date().toISOString();
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n = 16) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const multiline = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const money = v => { const n = Math.round(Number(v) * 100) / 100; return Number.isFinite(n) && n >= 0 ? n : NaN; };

async function readJSON(request, limit = 32_000) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new HttpError(415, 'Send JSON.');
  const body = await request.text();
  if (body.length > limit) throw new HttpError(413, 'Request is too large.');
  try { return JSON.parse(body || '{}'); } catch { throw new HttpError(400, 'Invalid JSON.'); }
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') !== 'cross-site';
  return origin === new URL(request.url).origin;
}

async function rateLimit(env, key, limit, windowSec) {
  const t = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT count, reset_at FROM ratelimits WHERE k = ?').bind(key).first();
  if (!row || row.reset_at <= t) {
    await env.DB.prepare('INSERT OR REPLACE INTO ratelimits (k, count, reset_at) VALUES (?, 1, ?)').bind(key, t + windowSec).run();
    return;
  }
  if (row.count >= limit) throw new HttpError(429, 'Too many requests. Please wait a little and try again.');
  await env.DB.prepare('UPDATE ratelimits SET count = count + 1 WHERE k = ?').bind(key).run();
}

/* ---------- passwords and sessions ---------- */
async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function cookieHeader(token, maxAge, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
async function createSession(env, userId, request) {
  const token = randomHex(32);
  const expires = Date.now() + SESSION_DAYS * 86400_000;
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), userId, expires).run();
  return cookieHeader(token, SESSION_DAYS * 86400, request);
}
async function currentUser(env, request) {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  if (!m) return null;
  const row = await env.DB.prepare(`SELECT u.id AS user_id, u.email, s.expires_at, b.* FROM sessions s JOIN users u ON u.id = s.user_id JOIN businesses b ON b.id = u.business_id WHERE s.token_hash = ?`).bind(await sha256(m[1])).first();
  if (!row || row.expires_at < Date.now()) return null;
  return row;
}
async function requireUser(env, request) {
  const user = await currentUser(env, request);
  if (!user) throw new HttpError(401, 'Please log in.');
  return user;
}

/* ---------- shapes sent to the browser ---------- */
const publicBusiness = b => ({ slug: b.slug, name: b.name, tagline: b.tagline, hours: b.hours, gcash: b.gcash, deliveryFee: b.delivery_fee, accepting: !!b.accepting });
const ownerBusiness = b => ({ ...publicBusiness(b), notifyEmail: b.notify_email, notifyOn: !!b.notify_on });
const itemOut = r => ({ id: r.id, category: r.category, name: r.name, description: r.description, price: r.price, tag: r.tag, available: !!r.available });
const orderOut = r => ({ id: r.id, code: r.code, status: r.status, type: r.type, customerName: r.customer_name, contact: r.contact, location: r.location, notes: r.notes, items: JSON.parse(r.items_json), subtotal: r.subtotal, fee: r.fee, total: r.total, createdAt: r.created_at, updatedAt: r.updated_at });

/* ---------- route handlers ---------- */
async function signup(env, request) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  await rateLimit(env, `signup:${ip}`, 5, 86400);
  const b = await readJSON(request);
  const email = text(b.email, 120).toLowerCase();
  const password = String(b.password || '');
  const name = text(b.businessName, 60);
  const slug = text(b.slug, 40).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (password.length < 10 || password.length > 200) throw new HttpError(400, 'Use a password of at least 10 characters.');
  if (!name) throw new HttpError(400, 'Enter your business name.');
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) || RESERVED.has(slug)) throw new HttpError(400, 'Choose a link name of 3–40 letters, numbers or dashes.');
  if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) throw new HttpError(409, 'That email already has an account. Log in instead.');
  if (await env.DB.prepare('SELECT 1 FROM businesses WHERE slug = ?').bind(slug).first()) throw new HttpError(409, 'That link name is taken. Try another.');
  const bizId = randomHex(12), userId = randomHex(12), salt = randomHex(16);
  const passHash = await hashPassword(password, salt);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO businesses (id, slug, name, created_at) VALUES (?, ?, ?, ?)').bind(bizId, slug, name, now()),
    env.DB.prepare('INSERT INTO users (id, email, pass_hash, salt, business_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(userId, email, passHash, salt, bizId, now()),
  ]);
  return json({ ok: true }, 201, { 'set-cookie': await createSession(env, userId, request) });
}

async function login(env, request) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  await rateLimit(env, `login:${ip}`, 20, 900);
  const b = await readJSON(request);
  const email = text(b.email, 120).toLowerCase();
  const user = await env.DB.prepare('SELECT id, pass_hash, salt FROM users WHERE email = ?').bind(email).first();
  const attempt = await hashPassword(String(b.password || ''), user ? user.salt : '00'.repeat(16));
  if (!user || !safeEqual(attempt, user.pass_hash)) throw new HttpError(401, 'Email or password is not right.');
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run();
  return json({ ok: true }, 200, { 'set-cookie': await createSession(env, user.id, request) });
}

async function logout(env, request) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  if (m) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(m[1])).run();
  return json({ ok: true }, 200, { 'set-cookie': cookieHeader('', 0, request) });
}

// Owner deletes their own account: business, menu, orders and sessions. Password is checked again first.
async function deleteAccount(env, request, user) {
  await rateLimit(env, `delete:${user.user_id}`, 5, 900);
  const b = await readJSON(request);
  const row = await env.DB.prepare('SELECT pass_hash, salt FROM users WHERE id = ?').bind(user.user_id).first();
  const attempt = await hashPassword(String(b.password || ''), row ? row.salt : '00'.repeat(16));
  if (!row || !safeEqual(attempt, row.pass_hash)) throw new HttpError(401, 'That password is not right.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM orders WHERE business_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM menu_items WHERE business_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.user_id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.user_id),
    env.DB.prepare('DELETE FROM businesses WHERE id = ?').bind(user.id),
    ...['mine_claims', 'mine_carts', 'mine_items', 'mine_lives', 'upa_payments', 'upa_bills', 'upa_tenants', 'upa_units', 'upa_settings'].map(t => env.DB.prepare(`DELETE FROM ${t} WHERE business_id = ?`).bind(user.id)),
  ]);
  return json({ ok: true }, 200, { 'set-cookie': cookieHeader('', 0, request) });
}

async function updateBusiness(env, request, user) {
  const b = await readJSON(request);
  const fee = money(b.deliveryFee ?? user.delivery_fee);
  if (!Number.isFinite(fee) || fee > 5000) throw new HttpError(400, 'Delivery fee must be between ₱0 and ₱5,000.');
  const notifyEmail = text(b.notifyEmail ?? user.notify_email, 120).toLowerCase();
  if (notifyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail)) throw new HttpError(400, 'Enter a valid email for notifications.');
  await env.DB.prepare('UPDATE businesses SET name = ?, tagline = ?, hours = ?, gcash = ?, delivery_fee = ?, accepting = ?, notify_email = ?, notify_on = ? WHERE id = ?').bind(
    text(b.name, 60) || user.name, text(b.tagline, 80), text(b.hours, 80), text(b.gcash, 30), fee,
    b.accepting === false ? 0 : 1, notifyEmail, b.notifyOn ? 1 : 0, user.id).run();
  const row = await env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(user.id).first();
  return json({ business: ownerBusiness(row) });
}

async function replaceMenu(env, request, user) {
  const b = await readJSON(request, 120_000);
  if (!Array.isArray(b.items) || b.items.length > 300) throw new HttpError(400, 'Send up to 300 menu items.');
  const items = b.items.map((it, i) => {
    const name = text(it.name, 80); const category = text(it.category, 40) || 'Menu'; const price = money(it.price);
    if (!name) throw new HttpError(400, `Item ${i + 1} needs a name.`);
    if (!Number.isFinite(price) || price > 100000) throw new HttpError(400, `Check the price of “${name}”.`);
    const id = /^[a-f0-9]{16}$/.test(String(it.id || '')) ? it.id : randomHex(8);
    return { id, name, category, price, description: text(it.description, 160), tag: text(it.tag, 24), available: it.available === false ? 0 : 1, sort: i };
  });
  const stmts = [env.DB.prepare('DELETE FROM menu_items WHERE business_id = ?').bind(user.id)];
  for (const it of items) stmts.push(env.DB.prepare('INSERT INTO menu_items (id, business_id, category, name, description, price, tag, available, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(it.id, user.id, it.category, it.name, it.description, it.price, it.tag, it.available, it.sort));
  await env.DB.batch(stmts);
  return json({ items: items.map(it => itemOut({ ...it })) });
}

async function listMenu(env, businessId, onlyAvailable) {
  const { results } = await env.DB.prepare(`SELECT * FROM menu_items WHERE business_id = ?${onlyAvailable ? ' AND available = 1' : ''} ORDER BY sort`).bind(businessId).all();
  return results.map(itemOut);
}

async function placeOrder(env, request, slug) {
  const biz = await env.DB.prepare('SELECT * FROM businesses WHERE slug = ?').bind(slug).first();
  if (!biz) throw new HttpError(404, 'This shop does not exist.');
  if (!biz.accepting) throw new HttpError(409, `${biz.name} is not taking online orders right now.`);
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  await rateLimit(env, `order:${ip}`, 8, 600);
  await rateLimit(env, `orderbiz:${biz.id}`, 400, 86400);
  const b = await readJSON(request);
  const type = ORDER_TYPES.includes(b.type) ? b.type : 'Pick-up';
  const name = text(b.name, 60);
  const contact = text(b.contact, 30);
  const location = text(b.location, 200);
  if (!name) throw new HttpError(400, 'Enter your name.');
  if (type === 'Delivery' && (!location || !contact)) throw new HttpError(400, 'Delivery needs your address and mobile number.');
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50) throw new HttpError(400, 'Your order is empty.');
  const menu = new Map((await listMenu(env, biz.id, true)).map(i => [i.id, i]));
  const lines = [];
  for (const raw of b.items) {
    const item = menu.get(String(raw.id)); const qty = Math.floor(Number(raw.qty));
    if (!item) throw new HttpError(409, 'Something in your order is no longer available. Please refresh the menu.');
    if (!(qty >= 1 && qty <= 99)) throw new HttpError(400, 'Check the quantities in your order.');
    lines.push({ id: item.id, name: item.name, price: item.price, qty, amount: Math.round(item.price * qty * 100) / 100 });
  }
  const subtotal = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const fee = type === 'Delivery' ? biz.delivery_fee : 0;
  const total = Math.round((subtotal + fee) * 100) / 100;
  const id = randomHex(16);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM orders WHERE business_id = ?').bind(biz.id).first();
  const code = `#${String((count?.n || 0) + 1).padStart(4, '0')}`;
  await env.DB.prepare('INSERT INTO orders (id, business_id, code, status, type, customer_name, contact, location, notes, items_json, subtotal, fee, total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, biz.id, code, 'new', type, name, contact, location, multiline(b.notes, 300), JSON.stringify(lines), subtotal, fee, total, now(), now()).run();
  return json({ id, code, status: 'new', total, business: biz.name }, 201);
}

/* ---------- RZ product purchases ---------- */
const isAdmin = (env, user) => String(env.ADMIN_EMAILS || '').toLowerCase().split(/[\s,]+/).filter(Boolean).includes(String(user.email).toLowerCase());
const purchaseOut = r => ({ id: r.id, code: r.code, product: r.product, productName: r.product_name, setup: r.setup, monthly: r.monthly, amount: r.amount, buyerName: r.buyer_name, business: r.business, mobile: r.mobile, email: r.email, notes: r.notes, reference: r.reference, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });

async function createPurchase(env, request) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  await rateLimit(env, `buy:${ip}`, 5, 600);
  await rateLimit(env, 'buy:all', 300, 86400);
  const b = await readJSON(request);
  const price = PRICES[String(b.product || '')];
  if (!price) throw new HttpError(400, 'Choose a product to buy.');
  const name = text(b.name, 60);
  const mobile = text(b.mobile, 20);
  const email = text(b.email, 120).toLowerCase();
  const reference = text(b.reference, 40).toUpperCase();
  if (!name) throw new HttpError(400, 'Enter your name.');
  if (!/^[0-9+()\s-]{7,20}$/.test(mobile)) throw new HttpError(400, 'Enter a valid mobile number.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Check your email address.');
  if (!/^[A-Z0-9-]{6,40}$/.test(reference)) throw new HttpError(400, 'Enter the reference number from your payment receipt.');
  if (await env.DB.prepare('SELECT 1 FROM purchases WHERE reference = ?').bind(reference).first()) throw new HttpError(409, 'That reference number was already submitted. Message us on Telegram if you need help.');
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM purchases').first();
  const code = `RZ-${String((count?.n || 0) + 1).padStart(4, '0')}`;
  const id = randomHex(16);
  await env.DB.prepare('INSERT INTO purchases (id, code, product, product_name, setup, monthly, amount, buyer_name, business, mobile, email, notes, reference, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, code, b.product, price.name, price.setup, price.monthly, firstPayment(price), name, text(b.business, 80), mobile, email, multiline(b.notes, 500), reference, 'pending', now(), now()).run();
  return json({ code, product: price.name, amount: firstPayment(price), status: 'pending' }, 201);
}

/* ---------- RZ Mine ---------- */
const mine = mineRoutes({ json, HttpError, text, multiline, money, randomHex, now, readJSON, rateLimit });
const upa = upaRoutes({ json, HttpError, text, money, randomHex, now, readJSON, rateLimit });

/* ---------- router ---------- */
async function api(request, env, url) {
  if (!env.DB) throw new HttpError(503, 'The database is not connected yet.');
  await ensureSchema(env);
  const { pathname } = url; const method = request.method;
  if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(request)) throw new HttpError(403, 'Blocked: request came from another site.');
  let m;

  if (pathname === '/api/health') return json({ ok: true });

  // Public: menu and orders for a shop.
  if ((m = pathname.match(/^\/api\/public\/([a-z0-9-]{3,40})\/menu$/)) && method === 'GET') {
    const biz = await env.DB.prepare('SELECT * FROM businesses WHERE slug = ?').bind(m[1]).first();
    if (!biz) throw new HttpError(404, 'This shop does not exist.');
    return json({ business: publicBusiness(biz), items: await listMenu(env, biz.id, true) });
  }
  if ((m = pathname.match(/^\/api\/public\/([a-z0-9-]{3,40})\/orders$/)) && method === 'POST') return placeOrder(env, request, m[1]);
  if ((m = pathname.match(/^\/api\/public\/orders\/([a-f0-9]{32})$/)) && method === 'GET') {
    const row = await env.DB.prepare('SELECT o.code, o.status, o.total, o.type, o.updated_at, b.name FROM orders o JOIN businesses b ON b.id = o.business_id WHERE o.id = ?').bind(m[1]).first();
    if (!row) throw new HttpError(404, 'Order not found.');
    return json({ code: row.code, status: row.status, total: row.total, type: row.type, updatedAt: row.updated_at, business: row.name });
  }

  // Accounts.
  // Buying RZ products.
  if (pathname === '/api/public/prices' && method === 'GET') return json({ prices: Object.fromEntries(Object.entries(PRICES).map(([k, p]) => [k, { ...p, firstPayment: firstPayment(p) }])) });
  if (pathname === '/api/public/purchases' && method === 'POST') return createPurchase(env, request);

  if (pathname.startsWith('/api/public/mine/')) { const r = await mine.publicRoute(env, request, pathname, method); if (r) return r; }
  if (pathname.startsWith('/api/public/upa/')) { const r = await upa.publicRoute(env, request, pathname, method); if (r) return r; }

  if (pathname === '/api/auth/signup' && method === 'POST') return signup(env, request);
  if (pathname === '/api/auth/login' && method === 'POST') return login(env, request);
  if (pathname === '/api/auth/logout' && method === 'POST') return logout(env, request);

  // Owner-only.
  const user = await requireUser(env, request);
  if (pathname === '/api/me' && method === 'GET') return json({ email: user.email, business: ownerBusiness(user), isAdmin: isAdmin(env, user) });
  if (pathname.startsWith('/api/admin/')) {
    if (!isAdmin(env, user)) throw new HttpError(403, 'Only RZ admins can see this.');
    if (pathname === '/api/admin/purchases' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM purchases ORDER BY created_at DESC LIMIT 300').all();
      return json({ purchases: results.map(purchaseOut) });
    }
    if ((m = pathname.match(/^\/api\/admin\/purchases\/([a-f0-9]{32})$/)) && method === 'PATCH') {
      const b = await readJSON(request);
      if (!PURCHASE_STATUSES.includes(b.status)) throw new HttpError(400, 'Unknown status.');
      const r = await env.DB.prepare('UPDATE purchases SET status = ?, updated_at = ? WHERE id = ?').bind(b.status, now(), m[1]).run();
      if (!r.meta.changes) throw new HttpError(404, 'Purchase not found.');
      return json({ ok: true });
    }
  }
  if (pathname.startsWith('/api/mine/')) { const r = await mine.owner(env, request, user, pathname, method); if (r) return r; }
  if (pathname === '/api/upa' || pathname.startsWith('/api/upa/')) { const r = await upa.owner(env, request, user, pathname, method); if (r) return r; }
  if (pathname === '/api/account' && method === 'DELETE') return deleteAccount(env, request, user);
  if (pathname === '/api/business' && method === 'PUT') return updateBusiness(env, request, user);
  if (pathname === '/api/menu' && method === 'GET') return json({ items: await listMenu(env, user.id, false) });
  if (pathname === '/api/menu' && method === 'PUT') return replaceMenu(env, request, user);
  if (pathname === '/api/orders' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM orders WHERE business_id = ? ORDER BY created_at DESC LIMIT 200').bind(user.id).all();
    return json({ orders: results.map(orderOut) });
  }
  if ((m = pathname.match(/^\/api\/orders\/([a-f0-9]{32})$/))) {
    if (method === 'PATCH') {
      const b = await readJSON(request);
      if (!STATUSES.includes(b.status)) throw new HttpError(400, 'Unknown status.');
      const r = await env.DB.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(b.status, now(), m[1], user.id).run();
      if (!r.meta.changes) throw new HttpError(404, 'Order not found.');
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM orders WHERE id = ? AND business_id = ?').bind(m[1], user.id).run();
      return json({ ok: true });
    }
  }
  throw new HttpError(404, 'Not found.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(request, env, url); }
      catch (err) {
        if (err instanceof HttpError) return json({ error: err.message }, err.status);
        console.error(err);
        return json({ error: 'Something went wrong on our side. Please try again.' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
