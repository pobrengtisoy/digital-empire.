/*
 * RZ Mine — live-selling "mine" tracker.
 * Sellers run a live, add items to the rack and record each "mine" claim.
 * Who wins an item is worked out from claim order and stock every time it is read,
 * so removing a claim automatically moves the next buyer in line up.
 * Each buyer gets a private checkout link (random token) showing only their own cart.
 */

export const MINE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS mine_lives (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_mine_lives_biz ON mine_lives (business_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS mine_items (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, live_id TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, price REAL NOT NULL, stock INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_mine_items_code ON mine_items (live_id, code)`,
  `CREATE TABLE IF NOT EXISTS mine_carts (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, live_id TEXT NOT NULL, buyer TEXT NOT NULL, buyer_key TEXT NOT NULL, token TEXT UNIQUE NOT NULL, status TEXT NOT NULL, ship_fee REAL, contact TEXT DEFAULT '', address TEXT DEFAULT '', reference TEXT DEFAULT '', notes TEXT DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_mine_carts_buyer ON mine_carts (live_id, buyer_key)`,
  `CREATE TABLE IF NOT EXISTS mine_claims (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, live_id TEXT NOT NULL, item_id TEXT NOT NULL, cart_id TEXT NOT NULL, qty INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_mine_claims_live ON mine_claims (live_id, created_at)`,
];

export const CART_STATUSES = ['open', 'submitted', 'paid', 'shipped', 'cancelled'];
const LIMITS = { items: 500, claims: 3000, lives: 60 };
const round = n => Math.round(n * 100) / 100;
const buyerKey = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
const codeOf = (v, text) => text(v, 12).toUpperCase().replace(/\s+/g, '');

/* Work out winners: first claims that fit in the stock win, the rest wait as backups. */
export function allocate(items, claims) {
  const left = new Map(items.map(i => [i.id, i.stock]));
  const queue = new Map();
  return claims.map(c => {
    const room = left.get(c.item_id) ?? 0;
    if (c.qty <= room) { left.set(c.item_id, room - c.qty); return { ...c, won: true, position: 0 }; }
    const pos = (queue.get(c.item_id) || 0) + 1; queue.set(c.item_id, pos);
    return { ...c, won: false, position: pos };
  });
}

export function mineRoutes(h) {
  const { json, HttpError, text, multiline, money, randomHex, now, readJSON, rateLimit } = h;

  async function getLive(env, user, id) {
    const live = await env.DB.prepare('SELECT * FROM mine_lives WHERE id = ? AND business_id = ?').bind(id, user.id).first();
    if (!live) throw new HttpError(404, 'Live not found.');
    return live;
  }

  async function liveState(env, user, live) {
    const [items, carts, claims] = await Promise.all([
      env.DB.prepare('SELECT * FROM mine_items WHERE live_id = ? ORDER BY created_at, rowid').bind(live.id).all(),
      env.DB.prepare('SELECT * FROM mine_carts WHERE live_id = ? ORDER BY created_at, rowid').bind(live.id).all(),
      env.DB.prepare('SELECT * FROM mine_claims WHERE live_id = ? ORDER BY created_at, rowid').bind(live.id).all(),
    ]);
    const itemMap = new Map(items.results.map(i => [i.id, i]));
    const cartMap = new Map(carts.results.map(c => [c.id, c]));
    const allocated = allocate(items.results, claims.results);
    const wonQty = new Map(); const backups = new Map(); const cartLines = new Map();
    for (const c of allocated) {
      if (c.won) {
        wonQty.set(c.item_id, (wonQty.get(c.item_id) || 0) + c.qty);
        const it = itemMap.get(c.item_id);
        const line = cartLines.get(c.cart_id) || { count: 0, subtotal: 0 };
        line.count += c.qty; line.subtotal = round(line.subtotal + it.price * c.qty);
        cartLines.set(c.cart_id, line);
      } else backups.set(c.item_id, (backups.get(c.item_id) || 0) + 1);
    }
    const cartsOut = carts.results.map(c => {
      const line = cartLines.get(c.id) || { count: 0, subtotal: 0 };
      const shipFee = line.count ? (c.ship_fee ?? user.delivery_fee ?? 0) : 0;
      return { id: c.id, buyer: c.buyer, token: c.token, status: c.status, items: line.count, subtotal: line.subtotal, shipFee, customShip: c.ship_fee != null, total: round(line.subtotal + shipFee), contact: c.contact, address: c.address, reference: c.reference, notes: c.notes, updatedAt: c.updated_at };
    });
    const active = cartsOut.filter(c => c.status !== 'cancelled');
    return {
      live: { id: live.id, title: live.title, status: live.status, createdAt: live.created_at },
      items: items.results.map(i => ({ id: i.id, code: i.code, name: i.name, price: i.price, stock: i.stock, claimed: wonQty.get(i.id) || 0, backups: backups.get(i.id) || 0 })),
      claims: allocated.slice().reverse().map(c => {
        const it = itemMap.get(c.item_id); const cart = cartMap.get(c.cart_id);
        return { id: c.id, itemId: c.item_id, code: it?.code, itemName: it?.name, price: it?.price, qty: c.qty, cartId: c.cart_id, buyer: cart?.buyer, won: c.won, position: c.position, at: c.created_at };
      }),
      carts: cartsOut,
      totals: {
        claims: allocated.length, buyers: active.filter(c => c.items).length,
        sales: round(active.reduce((s, c) => s + c.total, 0)),
        paid: round(active.filter(c => c.status === 'paid' || c.status === 'shipped').reduce((s, c) => s + c.total, 0)),
      },
    };
  }

  async function addClaim(env, user, live, raw, stamp) {
    const code = codeOf(raw.code, text);
    const buyer = text(raw.buyer, 60);
    const qty = Math.floor(Number(raw.qty ?? 1));
    if (!code) throw new HttpError(400, 'Enter the item code.');
    if (!buyer) throw new HttpError(400, 'Enter the buyer’s name.');
    if (!(qty >= 1 && qty <= 99)) throw new HttpError(400, 'Quantity must be 1 to 99.');
    const item = await env.DB.prepare('SELECT id FROM mine_items WHERE live_id = ? AND code = ?').bind(live.id, code).first();
    if (!item) throw new HttpError(404, `No item with code ${code} on this live.`);
    const key = buyerKey(buyer);
    let cart = await env.DB.prepare('SELECT id, status FROM mine_carts WHERE live_id = ? AND buyer_key = ?').bind(live.id, key).first();
    if (!cart) {
      cart = { id: randomHex(16) };
      await env.DB.prepare('INSERT INTO mine_carts (id, business_id, live_id, buyer, buyer_key, token, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(cart.id, user.id, live.id, buyer, key, randomHex(24), 'open', now(), now()).run();
    } else if (cart.status === 'cancelled') {
      await env.DB.prepare('UPDATE mine_carts SET status = ?, updated_at = ? WHERE id = ?').bind('open', now(), cart.id).run();
    }
    await env.DB.prepare('INSERT INTO mine_claims (id, business_id, live_id, item_id, cart_id, qty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(randomHex(16), user.id, live.id, item.id, cart.id, qty, stamp).run();
  }

  async function count(env, table, liveId) {
    return (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE live_id = ?`).bind(liveId).first())?.n || 0;
  }

  /* Owner routes. Returns a Response, or null when the path is not an RZ Mine route. */
  async function owner(env, request, user, pathname, method) {
    let m;
    if (pathname === '/api/mine/lives' && method === 'GET') {
      const { results } = await env.DB.prepare(`SELECT l.*, (SELECT COUNT(*) FROM mine_claims c WHERE c.live_id = l.id) AS claims FROM mine_lives l WHERE l.business_id = ? ORDER BY l.created_at DESC LIMIT ${LIMITS.lives}`).bind(user.id).all();
      return json({ lives: results.map(l => ({ id: l.id, title: l.title, status: l.status, createdAt: l.created_at, claims: l.claims })) });
    }
    if (pathname === '/api/mine/lives' && method === 'POST') {
      await rateLimit(env, `minelive:${user.id}`, 30, 86400);
      const b = await readJSON(request);
      const title = text(b.title, 60) || `Live ${new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })}`;
      const id = randomHex(16);
      await env.DB.prepare('INSERT INTO mine_lives (id, business_id, title, status, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, user.id, title, 'open', now()).run();
      return json(await liveState(env, user, await getLive(env, user, id)), 201);
    }
    if ((m = pathname.match(/^\/api\/mine\/lives\/([a-f0-9]{32})$/))) {
      const live = await getLive(env, user, m[1]);
      if (method === 'GET') return json(await liveState(env, user, live));
      if (method === 'PATCH') {
        const b = await readJSON(request);
        const status = b.status === 'closed' ? 'closed' : b.status === 'open' ? 'open' : live.status;
        await env.DB.prepare('UPDATE mine_lives SET title = ?, status = ? WHERE id = ?').bind(text(b.title, 60) || live.title, status, live.id).run();
        return json(await liveState(env, user, await getLive(env, user, live.id)));
      }
      if (method === 'DELETE') {
        await env.DB.batch(['mine_claims', 'mine_carts', 'mine_items'].map(t => env.DB.prepare(`DELETE FROM ${t} WHERE live_id = ?`).bind(live.id))
          .concat(env.DB.prepare('DELETE FROM mine_lives WHERE id = ?').bind(live.id)));
        return json({ ok: true });
      }
    }
    if ((m = pathname.match(/^\/api\/mine\/lives\/([a-f0-9]{32})\/items$/)) && method === 'POST') {
      const live = await getLive(env, user, m[1]);
      if (await count(env, 'mine_items', live.id) >= LIMITS.items) throw new HttpError(409, `A live can have up to ${LIMITS.items} items.`);
      const b = await readJSON(request);
      const code = codeOf(b.code, text); const name = text(b.name, 60); const price = money(b.price); const stock = Math.floor(Number(b.stock ?? 1));
      if (!/^[A-Z0-9-]{1,12}$/.test(code)) throw new HttpError(400, 'Use a short code like A1 or 12 (letters and numbers).');
      if (!name) throw new HttpError(400, 'Name the item.');
      if (!Number.isFinite(price) || price > 1_000_000) throw new HttpError(400, 'Enter a price.');
      if (!(stock >= 1 && stock <= 999)) throw new HttpError(400, 'Stock must be 1 to 999.');
      if (await env.DB.prepare('SELECT 1 FROM mine_items WHERE live_id = ? AND code = ?').bind(live.id, code).first()) throw new HttpError(409, `Code ${code} is already on the rack.`);
      await env.DB.prepare('INSERT INTO mine_items (id, business_id, live_id, code, name, price, stock, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(randomHex(16), user.id, live.id, code, name, price, stock, Date.now()).run();
      return json(await liveState(env, user, live), 201);
    }
    if ((m = pathname.match(/^\/api\/mine\/items\/([a-f0-9]{32})$/))) {
      const item = await env.DB.prepare('SELECT * FROM mine_items WHERE id = ? AND business_id = ?').bind(m[1], user.id).first();
      if (!item) throw new HttpError(404, 'Item not found.');
      const live = await getLive(env, user, item.live_id);
      if (method === 'PATCH') {
        const b = await readJSON(request);
        const price = b.price == null ? item.price : money(b.price);
        const stock = b.stock == null ? item.stock : Math.floor(Number(b.stock));
        if (!Number.isFinite(price) || price > 1_000_000) throw new HttpError(400, 'Enter a price.');
        if (!(stock >= 0 && stock <= 999)) throw new HttpError(400, 'Stock must be 0 to 999.');
        await env.DB.prepare('UPDATE mine_items SET name = ?, price = ?, stock = ? WHERE id = ?').bind(text(b.name, 60) || item.name, price, stock, item.id).run();
        return json(await liveState(env, user, live));
      }
      if (method === 'DELETE') {
        await env.DB.batch([env.DB.prepare('DELETE FROM mine_claims WHERE item_id = ?').bind(item.id), env.DB.prepare('DELETE FROM mine_items WHERE id = ?').bind(item.id)]);
        return json(await liveState(env, user, live));
      }
    }
    if ((m = pathname.match(/^\/api\/mine\/lives\/([a-f0-9]{32})\/claims$/)) && method === 'POST') {
      const live = await getLive(env, user, m[1]);
      const b = await readJSON(request, 64_000);
      const list = Array.isArray(b.claims) ? b.claims : [b];
      if (!list.length || list.length > 200) throw new HttpError(400, 'Send 1 to 200 claims at a time.');
      if (await count(env, 'mine_claims', live.id) + list.length > LIMITS.claims) throw new HttpError(409, `A live can have up to ${LIMITS.claims} claims.`);
      const errors = []; let added = 0; const base = Date.now();
      for (const [i, raw] of list.entries()) {
        try { await addClaim(env, user, live, raw, base + i); added++; }
        catch (e) { if (list.length === 1) throw e; errors.push({ line: i + 1, error: e.message }); }
      }
      return json({ ...(await liveState(env, user, live)), added, errors }, 201);
    }
    if ((m = pathname.match(/^\/api\/mine\/claims\/([a-f0-9]{32})$/)) && method === 'DELETE') {
      const claim = await env.DB.prepare('SELECT live_id FROM mine_claims WHERE id = ? AND business_id = ?').bind(m[1], user.id).first();
      if (!claim) throw new HttpError(404, 'Claim not found.');
      await env.DB.prepare('DELETE FROM mine_claims WHERE id = ?').bind(m[1]).run();
      return json(await liveState(env, user, await getLive(env, user, claim.live_id)));
    }
    if ((m = pathname.match(/^\/api\/mine\/carts\/([a-f0-9]{32})$/)) && method === 'PATCH') {
      const cart = await env.DB.prepare('SELECT * FROM mine_carts WHERE id = ? AND business_id = ?').bind(m[1], user.id).first();
      if (!cart) throw new HttpError(404, 'Buyer not found.');
      const b = await readJSON(request);
      const status = b.status == null ? cart.status : b.status;
      if (!CART_STATUSES.includes(status)) throw new HttpError(400, 'Unknown status.');
      let ship = cart.ship_fee;
      if (b.shipFee === null) ship = null;
      else if (b.shipFee != null) { ship = money(b.shipFee); if (!Number.isFinite(ship) || ship > 5000) throw new HttpError(400, 'Shipping must be ₱0 to ₱5,000.'); }
      await env.DB.prepare('UPDATE mine_carts SET status = ?, ship_fee = ?, updated_at = ? WHERE id = ?').bind(status, ship, now(), cart.id).run();
      return json(await liveState(env, user, await getLive(env, user, cart.live_id)));
    }
    return null;
  }

  /* Public buyer routes, by private token. */
  async function buyerCart(env, token) {
    const cart = await env.DB.prepare('SELECT * FROM mine_carts WHERE token = ?').bind(token).first();
    if (!cart) throw new HttpError(404, 'This checkout link is not valid. Ask the seller for a new one.');
    const biz = await env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(cart.business_id).first();
    const live = await env.DB.prepare('SELECT * FROM mine_lives WHERE id = ?').bind(cart.live_id).first();
    const [items, claims] = await Promise.all([
      env.DB.prepare('SELECT * FROM mine_items WHERE live_id = ?').bind(cart.live_id).all(),
      env.DB.prepare('SELECT * FROM mine_claims WHERE live_id = ? ORDER BY created_at, rowid').bind(cart.live_id).all(),
    ]);
    const itemMap = new Map(items.results.map(i => [i.id, i]));
    const mine = allocate(items.results, claims.results).filter(c => c.cart_id === cart.id);
    const line = c => { const it = itemMap.get(c.item_id); return { code: it.code, name: it.name, price: it.price, qty: c.qty, amount: round(it.price * c.qty), position: c.position }; };
    const won = mine.filter(c => c.won).map(line);
    const waiting = mine.filter(c => !c.won).map(line);
    const subtotal = round(won.reduce((s, l) => s + l.amount, 0));
    const shipFee = won.length ? (cart.ship_fee ?? biz?.delivery_fee ?? 0) : 0;
    return {
      cart, out: {
        shop: biz?.name || 'Seller', gcash: biz?.gcash || '', live: live?.title || '', buyer: cart.buyer, status: cart.status,
        items: won, waiting, subtotal, shipFee, total: round(subtotal + shipFee),
        contact: cart.contact, address: cart.address, reference: cart.reference, notes: cart.notes,
      },
    };
  }

  async function publicRoute(env, request, pathname, method) {
    const m = pathname.match(/^\/api\/public\/mine\/([a-f0-9]{48})$/);
    if (!m) return null;
    if (method === 'GET') return json((await buyerCart(env, m[1])).out);
    if (method === 'POST') {
      const ip = request.headers.get('cf-connecting-ip') || 'local';
      await rateLimit(env, `minepay:${ip}`, 12, 600);
      const { cart, out } = await buyerCart(env, m[1]);
      if (!['open', 'submitted'].includes(cart.status)) throw new HttpError(409, 'The seller already confirmed this order. Message them for changes.');
      if (!out.items.length) throw new HttpError(409, 'You have no confirmed items yet.');
      const b = await readJSON(request);
      const contact = text(b.contact, 30); const address = multiline(b.address, 300); const reference = text(b.reference, 40).toUpperCase().replace(/\s+/g, '');
      if (!/^[0-9+()\s-]{7,20}$/.test(contact)) throw new HttpError(400, 'Enter a valid mobile number.');
      if (!address) throw new HttpError(400, 'Enter your delivery address, or write “Meet-up”.');
      if (!/^[A-Z0-9-]{4,40}$/.test(reference)) throw new HttpError(400, 'Enter the reference number from your payment receipt.');
      await env.DB.prepare('UPDATE mine_carts SET contact = ?, address = ?, reference = ?, notes = ?, status = ?, updated_at = ? WHERE id = ?')
        .bind(contact, address, reference, multiline(b.notes, 300), 'submitted', now(), cart.id).run();
      return json((await buyerCart(env, m[1])).out);
    }
    return null;
  }

  return { owner, publicRoute };
}
