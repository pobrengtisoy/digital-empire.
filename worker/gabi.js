/*
 * RZ Gabi — website, VIP tables, guest list and door check-in for clubs and bars.
 * One system, three plans. The plan is set only by an RZ admin and checked on the
 * server for every feature: site < vip (tables, packages, reservations) < full
 * (guest list, QR passes, door check-in, promoters, reports).
 * Club photos reuse the RZ photo store (R2) and its upload checks.
 */

export const GABI_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS gabi_clubs (business_id TEXT PRIMARY KEY, plan TEXT NOT NULL DEFAULT 'site', tagline TEXT DEFAULT '', about TEXT DEFAULT '', address TEXT DEFAULT '', city TEXT DEFAULT '', hours TEXT DEFAULT '', dress_code TEXT DEFAULT '', age TEXT DEFAULT '18+', mobile TEXT DEFAULT '', messenger TEXT DEFAULT '', instagram TEXT DEFAULT '', photos TEXT DEFAULT '[]')`,
  `CREATE TABLE IF NOT EXISTS gabi_events (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, date TEXT NOT NULL, title TEXT NOT NULL, lineup TEXT DEFAULT '[]', genre TEXT DEFAULT '', doors TEXT DEFAULT '', cover TEXT DEFAULT '', note TEXT DEFAULT '', featured INTEGER DEFAULT 0, status TEXT NOT NULL DEFAULT 'on', created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_gabi_events_biz ON gabi_events (business_id, date)`,
  `CREATE TABLE IF NOT EXISTS gabi_tables (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL, zone TEXT DEFAULT '', capacity INTEGER NOT NULL, min_spend REAL NOT NULL, x REAL NOT NULL, y REAL NOT NULL, sort INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS gabi_packages (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL, price REAL NOT NULL, pax INTEGER NOT NULL, inclusions TEXT DEFAULT '', sort INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS gabi_reservations (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, date TEXT NOT NULL, table_id TEXT NOT NULL, table_name TEXT NOT NULL, package_id TEXT DEFAULT '', package_name TEXT DEFAULT '', price REAL NOT NULL, name TEXT NOT NULL, mobile TEXT NOT NULL, guests INTEGER NOT NULL, reference TEXT DEFAULT '', notes TEXT DEFAULT '', promo TEXT DEFAULT '', status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_gabi_res_biz ON gabi_reservations (business_id, date)`,
  `CREATE TABLE IF NOT EXISTS gabi_promoters (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL, code TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_gabi_promo_code ON gabi_promoters (business_id, code)`,
  `CREATE TABLE IF NOT EXISTS gabi_guests (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, event_id TEXT NOT NULL, event_date TEXT NOT NULL, name TEXT NOT NULL, mobile TEXT NOT NULL, plus INTEGER NOT NULL, promo TEXT DEFAULT '', code TEXT NOT NULL, token TEXT UNIQUE NOT NULL, status TEXT NOT NULL, checked_in_at TEXT DEFAULT '', created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_gabi_guests_event ON gabi_guests (event_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_gabi_guests_code ON gabi_guests (business_id, code)`,
];

export const PLANS = ['site', 'vip', 'full'];
const LEVEL = { site: 1, vip: 2, full: 3 };
const PLAN_NAME = { site: 'Site', vip: 'VIP', full: 'Full' };
const RES_STATUSES = ['pending', 'confirmed', 'arrived', 'declined', 'cancelled'];
const HOLDS = ['pending', 'confirmed', 'arrived'];
const LIMITS = { events: 400, tables: 60, packages: 20, promoters: 80, photos: 16, guestsPerEvent: 1500 };
const KEY_RE = /^[a-f0-9]{24}\/[a-f0-9]{32}\.(webp|jpg|png)$/;
const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function manilaDay(offsetDays = 0) {
  const d = new Date(Date.now() + 8 * 3_600_000 + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}
const isDate = s => /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(s));
const passCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CODE_ABC[b % CODE_ABC.length]).join('');

const clubOut = (c, biz) => ({
  name: biz.name, slug: biz.slug, plan: c?.plan || 'site', tagline: c?.tagline || '', about: c?.about || '', address: c?.address || '', city: c?.city || '',
  hours: c?.hours || '', dressCode: c?.dress_code || '', age: c?.age || '18+', mobile: c?.mobile || '', messenger: c?.messenger || '', instagram: c?.instagram || '',
  photos: JSON.parse(c?.photos || '[]'),
});
const eventOut = r => ({ id: r.id, date: r.date, title: r.title, lineup: JSON.parse(r.lineup || '[]'), genre: r.genre, doors: r.doors, cover: r.cover, note: r.note, featured: !!r.featured, status: r.status });
const tableOut = r => ({ id: r.id, name: r.name, zone: r.zone, capacity: r.capacity, minSpend: r.min_spend, x: r.x, y: r.y, sort: r.sort });
const packageOut = r => ({ id: r.id, name: r.name, price: r.price, pax: r.pax, inclusions: r.inclusions, sort: r.sort });
const resOut = r => ({ id: r.id, date: r.date, tableId: r.table_id, tableName: r.table_name, packageId: r.package_id, packageName: r.package_name, price: r.price, name: r.name, mobile: r.mobile, guests: r.guests, reference: r.reference, notes: r.notes, promo: r.promo, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });
const guestOut = r => ({ id: r.id, eventId: r.event_id, eventDate: r.event_date, name: r.name, mobile: r.mobile, plus: r.plus, promo: r.promo, code: r.code, token: r.token, status: r.status, checkedInAt: r.checked_in_at, createdAt: r.created_at });

export function gabiRoutes(h) {
  const { json, HttpError, text, multiline, money, randomHex, now, readJSON, rateLimit } = h;

  const clubOf = (env, bizId) => env.DB.prepare('SELECT * FROM gabi_clubs WHERE business_id = ?').bind(bizId).first();
  async function planOf(env, bizId) { return (await clubOf(env, bizId))?.plan || 'site'; }
  function need(plan, min) {
    if (LEVEL[plan] < LEVEL[min]) throw new HttpError(403, `This needs the RZ Gabi ${PLAN_NAME[min]} plan. Ask RZ to upgrade your plan.`);
  }
  const own = async (env, table, id, bizId, what) => {
    const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND business_id = ?`).bind(id, bizId).first();
    if (!row) throw new HttpError(404, `${what} not found.`);
    return row;
  };
  const count = async (env, table, bizId, extra = '', ...args) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE business_id = ? ${extra}`).bind(bizId, ...args).first())?.n || 0;

  async function ownerState(env, biz) {
    const c = await clubOf(env, biz.id);
    const plan = c?.plan || 'site';
    const from = manilaDay(-30);
    const q = (sql, ...a) => env.DB.prepare(sql).bind(biz.id, ...a).all().then(r => r.results);
    const [events, tables, packages, reservations, promoters, guests] = await Promise.all([
      q('SELECT * FROM gabi_events WHERE business_id = ? AND date >= ? ORDER BY date LIMIT 200', from),
      LEVEL[plan] >= 2 ? q('SELECT * FROM gabi_tables WHERE business_id = ? ORDER BY sort') : [],
      LEVEL[plan] >= 2 ? q('SELECT * FROM gabi_packages WHERE business_id = ? ORDER BY sort') : [],
      LEVEL[plan] >= 2 ? q('SELECT * FROM gabi_reservations WHERE business_id = ? AND date >= ? ORDER BY date, created_at LIMIT 600', from) : [],
      LEVEL[plan] >= 3 ? q('SELECT * FROM gabi_promoters WHERE business_id = ? ORDER BY created_at') : [],
      LEVEL[plan] >= 3 ? q('SELECT * FROM gabi_guests WHERE business_id = ? AND event_date >= ? ORDER BY created_at LIMIT 3000', from) : [],
    ]);
    return json({
      club: clubOut(c, biz), today: manilaDay(), photosReady: !!env.PHOTOS,
      events: events.map(eventOut), tables: tables.map(tableOut), packages: packages.map(packageOut),
      reservations: reservations.map(resOut), promoters: promoters.map(r => ({ id: r.id, name: r.name, code: r.code })), guests: guests.map(guestOut),
    });
  }

  function cleanEvent(b, old = { title: '', lineup: [], genre: '', doors: '', cover: '', note: '', featured: false, status: 'on' }) {
    const pick = (k, fn) => (b[k] === undefined ? old[k] : fn(b[k]));
    const e = {
      date: pick('date', v => { if (!isDate(v)) throw new HttpError(400, 'Choose the event date.'); return v; }) || (() => { throw new HttpError(400, 'Choose the event date.'); })(),
      title: pick('title', v => text(v, 80)),
      lineup: pick('lineup', v => (Array.isArray(v) ? v.slice(0, 12).map(x => text(x, 50)).filter(Boolean) : [])),
      genre: pick('genre', v => text(v, 60)), doors: pick('doors', v => text(v, 40)), cover: pick('cover', v => text(v, 60)), note: pick('note', v => multiline(v, 400)),
      featured: pick('featured', v => !!v), status: pick('status', v => (v === 'off' ? 'off' : 'on')),
    };
    if (!e.title) throw new HttpError(400, 'Name the night, like “Friday Heat”.');
    return e;
  }
  function cleanTable(b, old = { name: '', zone: '', capacity: 6, minSpend: 0, x: 50, y: 50 }) {
    const pick = (k, fn) => (b[k] === undefined ? old[k] : fn(b[k]));
    const pct = v => { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 100) throw new HttpError(400, 'Check the table position.'); return Math.round(n * 10) / 10; };
    const t = {
      name: pick('name', v => text(v, 30)), zone: pick('zone', v => text(v, 30)),
      capacity: pick('capacity', v => { const n = Math.floor(Number(v)); if (!(n >= 1 && n <= 60)) throw new HttpError(400, 'Capacity must be 1 to 60.'); return n; }),
      minSpend: pick('minSpend', v => { const n = money(v); if (!Number.isFinite(n) || n > 10_000_000) throw new HttpError(400, 'Check the minimum spend.'); return n; }),
      x: pick('x', pct), y: pick('y', pct),
    };
    if (!t.name) throw new HttpError(400, 'Name the table, like “VIP 1”.');
    return t;
  }
  function cleanPackage(b, old = { name: '', price: 0, pax: 6, inclusions: '' }) {
    const pick = (k, fn) => (b[k] === undefined ? old[k] : fn(b[k]));
    const p = {
      name: pick('name', v => text(v, 50)),
      price: pick('price', v => { const n = money(v); if (!Number.isFinite(n) || n < 1 || n > 10_000_000) throw new HttpError(400, 'Enter the package price.'); return n; }) || (() => { throw new HttpError(400, 'Enter the package price.'); })(),
      pax: pick('pax', v => { const n = Math.floor(Number(v)); if (!(n >= 1 && n <= 60)) throw new HttpError(400, 'Guests must be 1 to 60.'); return n; }),
      inclusions: pick('inclusions', v => multiline(v, 400)),
    };
    if (!p.name) throw new HttpError(400, 'Name the package.');
    return p;
  }

  async function owner(env, request, user, pathname, method) {
    let m;
    const biz = user;
    if (pathname === '/api/gabi' && method === 'GET') return ownerState(env, biz);
    const plan = await planOf(env, biz.id);

    if (pathname === '/api/gabi/profile' && method === 'PUT') {
      const b = await readJSON(request, 32_000);
      const photos = Array.isArray(b.photos) ? [...new Set(b.photos.map(String))].slice(0, LIMITS.photos) : [];
      if (!photos.every(k => KEY_RE.test(k) && k.startsWith(`${biz.id}/`))) throw new HttpError(400, 'One of the photos is not yours.');
      const mobile = text(b.mobile, 20);
      if (mobile && !/^[0-9+()\s-]{7,20}$/.test(mobile)) throw new HttpError(400, 'Check the mobile number.');
      const old = JSON.parse((await clubOf(env, biz.id))?.photos || '[]');
      await env.DB.prepare(`INSERT INTO gabi_clubs (business_id, plan, tagline, about, address, city, hours, dress_code, age, mobile, messenger, instagram, photos) VALUES (?, 'site', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(business_id) DO UPDATE SET tagline = excluded.tagline, about = excluded.about, address = excluded.address, city = excluded.city, hours = excluded.hours, dress_code = excluded.dress_code, age = excluded.age, mobile = excluded.mobile, messenger = excluded.messenger, instagram = excluded.instagram, photos = excluded.photos`)
        .bind(biz.id, text(b.tagline, 120), multiline(b.about, 800), text(b.address, 140), text(b.city, 60), text(b.hours, 80), text(b.dressCode, 120), ['18+', '21+'].includes(b.age) ? b.age : '18+', mobile,
          String(b.messenger || '').replace(/^https?:\/\/(www\.)?(m\.me|facebook\.com)\//i, '').replace(/[^a-zA-Z0-9.]/g, '').slice(0, 50),
          String(b.instagram || '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[^a-zA-Z0-9._]/g, '').slice(0, 30), JSON.stringify(photos)).run();
      if (text(b.name, 60)) await env.DB.prepare('UPDATE businesses SET name = ? WHERE id = ?').bind(text(b.name, 60), biz.id).run();
      const gone = old.filter(k => !photos.includes(k));
      if (gone.length && env.PHOTOS) await env.PHOTOS.delete(gone);
      return ownerState(env, await env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(biz.id).first());
    }

    /* events (every plan) */
    if (pathname === '/api/gabi/events' && method === 'POST') {
      if (await count(env, 'gabi_events', biz.id) >= LIMITS.events) throw new HttpError(409, 'Event limit reached. Delete old events first.');
      const e = cleanEvent(await readJSON(request));
      await env.DB.prepare('INSERT INTO gabi_events (id, business_id, date, title, lineup, genre, doors, cover, note, featured, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(randomHex(16), biz.id, e.date, e.title, JSON.stringify(e.lineup), e.genre, e.doors, e.cover, e.note, e.featured ? 1 : 0, e.status, now()).run();
      return ownerState(env, biz);
    }
    if ((m = pathname.match(/^\/api\/gabi\/events\/([a-f0-9]{32})$/))) {
      const row = await own(env, 'gabi_events', m[1], biz.id, 'Event');
      if (method === 'PATCH') {
        const e = cleanEvent(await readJSON(request), eventOut(row));
        await env.DB.prepare('UPDATE gabi_events SET date = ?, title = ?, lineup = ?, genre = ?, doors = ?, cover = ?, note = ?, featured = ?, status = ? WHERE id = ?')
          .bind(e.date, e.title, JSON.stringify(e.lineup), e.genre, e.doors, e.cover, e.note, e.featured ? 1 : 0, e.status, row.id).run();
        return ownerState(env, biz);
      }
      if (method === 'DELETE') {
        await env.DB.batch([env.DB.prepare('DELETE FROM gabi_guests WHERE event_id = ?').bind(row.id), env.DB.prepare('DELETE FROM gabi_events WHERE id = ?').bind(row.id)]);
        return ownerState(env, biz);
      }
    }

    /* tables and packages (VIP) */
    if (pathname === '/api/gabi/tables' && method === 'POST') {
      need(plan, 'vip');
      if (await count(env, 'gabi_tables', biz.id) >= LIMITS.tables) throw new HttpError(409, `Up to ${LIMITS.tables} tables.`);
      const t = cleanTable(await readJSON(request));
      await env.DB.prepare('INSERT INTO gabi_tables (id, business_id, name, zone, capacity, min_spend, x, y, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(randomHex(16), biz.id, t.name, t.zone, t.capacity, t.minSpend, t.x, t.y, await count(env, 'gabi_tables', biz.id)).run();
      return ownerState(env, biz);
    }
    if ((m = pathname.match(/^\/api\/gabi\/tables\/([a-f0-9]{32})$/))) {
      need(plan, 'vip');
      const row = await own(env, 'gabi_tables', m[1], biz.id, 'Table');
      if (method === 'PATCH') {
        const t = cleanTable(await readJSON(request), tableOut(row));
        await env.DB.prepare('UPDATE gabi_tables SET name = ?, zone = ?, capacity = ?, min_spend = ?, x = ?, y = ? WHERE id = ?').bind(t.name, t.zone, t.capacity, t.minSpend, t.x, t.y, row.id).run();
        return ownerState(env, biz);
      }
      if (method === 'DELETE') { await env.DB.prepare('DELETE FROM gabi_tables WHERE id = ?').bind(row.id).run(); return ownerState(env, biz); }
    }
    if (pathname === '/api/gabi/packages' && method === 'POST') {
      need(plan, 'vip');
      if (await count(env, 'gabi_packages', biz.id) >= LIMITS.packages) throw new HttpError(409, `Up to ${LIMITS.packages} packages.`);
      const p = cleanPackage(await readJSON(request));
      await env.DB.prepare('INSERT INTO gabi_packages (id, business_id, name, price, pax, inclusions, sort) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(randomHex(16), biz.id, p.name, p.price, p.pax, p.inclusions, await count(env, 'gabi_packages', biz.id)).run();
      return ownerState(env, biz);
    }
    if ((m = pathname.match(/^\/api\/gabi\/packages\/([a-f0-9]{32})$/))) {
      need(plan, 'vip');
      const row = await own(env, 'gabi_packages', m[1], biz.id, 'Package');
      if (method === 'PATCH') {
        const p = cleanPackage(await readJSON(request), packageOut(row));
        await env.DB.prepare('UPDATE gabi_packages SET name = ?, price = ?, pax = ?, inclusions = ? WHERE id = ?').bind(p.name, p.price, p.pax, p.inclusions, row.id).run();
        return ownerState(env, biz);
      }
      if (method === 'DELETE') { await env.DB.prepare('DELETE FROM gabi_packages WHERE id = ?').bind(row.id).run(); return ownerState(env, biz); }
    }
    if ((m = pathname.match(/^\/api\/gabi\/reservations\/([a-f0-9]{32})$/)) && method === 'PATCH') {
      need(plan, 'vip');
      const row = await own(env, 'gabi_reservations', m[1], biz.id, 'Reservation');
      const b = await readJSON(request);
      if (!RES_STATUSES.includes(b.status)) throw new HttpError(400, 'Unknown status.');
      if (HOLDS.includes(b.status) && !HOLDS.includes(row.status)) {
        const clash = await env.DB.prepare(`SELECT 1 FROM gabi_reservations WHERE business_id = ? AND date = ? AND table_id = ? AND id != ? AND status IN ('pending','confirmed','arrived')`).bind(biz.id, row.date, row.table_id, row.id).first();
        if (clash) throw new HttpError(409, `${row.table_name} is already booked that night.`);
      }
      await env.DB.prepare('UPDATE gabi_reservations SET status = ?, updated_at = ? WHERE id = ?').bind(b.status, now(), row.id).run();
      return ownerState(env, biz);
    }

    /* guest list, promoters, door (Full) */
    if (pathname === '/api/gabi/promoters' && method === 'POST') {
      need(plan, 'full');
      if (await count(env, 'gabi_promoters', biz.id) >= LIMITS.promoters) throw new HttpError(409, `Up to ${LIMITS.promoters} promoters.`);
      const b = await readJSON(request);
      const name = text(b.name, 50); const code = text(b.code, 16).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!name) throw new HttpError(400, 'Enter the promoter’s name.');
      if (code.length < 3) throw new HttpError(400, 'Use a promo code of 3 to 16 letters or numbers.');
      if (await env.DB.prepare('SELECT 1 FROM gabi_promoters WHERE business_id = ? AND code = ?').bind(biz.id, code).first()) throw new HttpError(409, `Code ${code} is already used.`);
      await env.DB.prepare('INSERT INTO gabi_promoters (id, business_id, name, code, created_at) VALUES (?, ?, ?, ?, ?)').bind(randomHex(16), biz.id, name, code, now()).run();
      return ownerState(env, biz);
    }
    if ((m = pathname.match(/^\/api\/gabi\/promoters\/([a-f0-9]{32})$/)) && method === 'DELETE') {
      need(plan, 'full');
      const row = await own(env, 'gabi_promoters', m[1], biz.id, 'Promoter');
      await env.DB.prepare('DELETE FROM gabi_promoters WHERE id = ?').bind(row.id).run();
      return ownerState(env, biz);
    }
    if ((m = pathname.match(/^\/api\/gabi\/guests\/([a-f0-9]{32})$/)) && method === 'PATCH') {
      need(plan, 'full');
      const row = await own(env, 'gabi_guests', m[1], biz.id, 'Guest');
      const b = await readJSON(request);
      if (!['listed', 'in', 'cancelled'].includes(b.status)) throw new HttpError(400, 'Unknown status.');
      await env.DB.prepare('UPDATE gabi_guests SET status = ?, checked_in_at = ? WHERE id = ?').bind(b.status, b.status === 'in' ? now() : '', row.id).run();
      return ownerState(env, biz);
    }
    if (pathname === '/api/gabi/checkin' && method === 'POST') {
      need(plan, 'full');
      await rateLimit(env, `gabidoor:${biz.id}`, 900, 3600);
      const b = await readJSON(request);
      const code = text(b.code, 64).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-6);
      if (code.length !== 6) throw new HttpError(400, 'Scan the QR or type the 6-letter pass code.');
      const g = await env.DB.prepare('SELECT * FROM gabi_guests WHERE business_id = ? AND code = ?').bind(biz.id, code).first();
      if (!g) throw new HttpError(404, `No pass with code ${code}.`);
      const today = manilaDay(); const yesterday = manilaDay(-1);
      if (g.status === 'cancelled') return json({ result: 'cancelled', guest: guestOut(g) });
      if (g.event_date !== today && g.event_date !== yesterday) return json({ result: 'wrong-night', guest: guestOut(g) });
      if (g.status === 'in') return json({ result: 'already', guest: guestOut(g) });
      await env.DB.prepare("UPDATE gabi_guests SET status = 'in', checked_in_at = ? WHERE id = ?").bind(now(), g.id).run();
      return json({ result: 'in', guest: { ...guestOut(g), status: 'in' } });
    }
    return null;
  }

  /* ---------- public ---------- */
  async function clubBySlug(env, slug) {
    const biz = await env.DB.prepare('SELECT * FROM businesses WHERE slug = ?').bind(slug).first();
    if (!biz) throw new HttpError(404, 'This club’s page does not exist.');
    return { biz, club: await clubOf(env, biz.id) };
  }

  async function publicRoute(env, request, pathname, method) {
    let m;
    if ((m = pathname.match(/^\/api\/public\/gabi\/pass\/([a-f0-9]{48})$/)) && method === 'GET') {
      const g = await env.DB.prepare('SELECT * FROM gabi_guests WHERE token = ?').bind(m[1]).first();
      if (!g) throw new HttpError(404, 'This pass is not valid.');
      const [biz, ev] = await Promise.all([
        env.DB.prepare('SELECT name, slug FROM businesses WHERE id = ?').bind(g.business_id).first(),
        env.DB.prepare('SELECT * FROM gabi_events WHERE id = ?').bind(g.event_id).first(),
      ]);
      return json({ club: biz?.name || '', slug: biz?.slug || '', event: ev ? { title: ev.title, date: ev.date, doors: ev.doors, lineup: JSON.parse(ev.lineup || '[]') } : null, name: g.name, plus: g.plus, code: g.code, status: g.status });
    }
    if ((m = pathname.match(/^\/api\/public\/gabi\/([a-z0-9-]{3,40})$/)) && method === 'GET') {
      const { biz, club } = await clubBySlug(env, m[1]);
      const plan = club?.plan || 'site';
      const today = manilaDay();
      const evs = (await env.DB.prepare("SELECT * FROM gabi_events WHERE business_id = ? AND date >= ? AND status = 'on' ORDER BY date LIMIT 40").bind(biz.id, today).all()).results.map(eventOut);
      let tables = []; let packages = []; const taken = {};
      if (LEVEL[plan] >= 2) {
        tables = (await env.DB.prepare('SELECT * FROM gabi_tables WHERE business_id = ? ORDER BY sort').bind(biz.id).all()).results.map(tableOut);
        packages = (await env.DB.prepare('SELECT * FROM gabi_packages WHERE business_id = ? ORDER BY sort').bind(biz.id).all()).results.map(packageOut);
        const holds = (await env.DB.prepare("SELECT date, table_id FROM gabi_reservations WHERE business_id = ? AND date >= ? AND status IN ('pending','confirmed','arrived')").bind(biz.id, today).all()).results;
        holds.forEach(r => { (taken[r.date] ||= []).push(r.table_id); });
      }
      return json({ club: clubOut(club, biz), today, events: evs, tables, packages, taken });
    }
    if ((m = pathname.match(/^\/api\/public\/gabi\/([a-z0-9-]{3,40})\/reservations$/)) && method === 'POST') {
      const ip = request.headers.get('cf-connecting-ip') || 'local';
      await rateLimit(env, `gabires:${ip}`, 6, 600);
      const { biz, club } = await clubBySlug(env, m[1]);
      need(club?.plan || 'site', 'vip');
      await rateLimit(env, `gabiresbiz:${biz.id}`, 300, 86400);
      const b = await readJSON(request);
      const ev = await env.DB.prepare("SELECT * FROM gabi_events WHERE business_id = ? AND date = ? AND status = 'on'").bind(biz.id, String(b.date || '')).first();
      if (!ev || ev.date < manilaDay()) throw new HttpError(400, 'Choose an upcoming night.');
      const table = await env.DB.prepare('SELECT * FROM gabi_tables WHERE id = ? AND business_id = ?').bind(String(b.tableId || ''), biz.id).first();
      if (!table) throw new HttpError(404, 'Choose a table.');
      const pkg = b.packageId ? await env.DB.prepare('SELECT * FROM gabi_packages WHERE id = ? AND business_id = ?').bind(String(b.packageId), biz.id).first() : null;
      if (b.packageId && !pkg) throw new HttpError(404, 'That package is no longer offered.');
      const name = text(b.name, 60); const mobile = text(b.mobile, 20); const guests = Math.floor(Number(b.guests));
      if (!name) throw new HttpError(400, 'Enter your name.');
      if (!/^[0-9+()\s-]{7,20}$/.test(mobile)) throw new HttpError(400, 'Enter a valid mobile number.');
      if (!(guests >= 1 && guests <= table.capacity)) throw new HttpError(400, `${table.name} fits up to ${table.capacity} guests.`);
      const reference = text(b.reference, 40).toUpperCase().replace(/\s+/g, '');
      if (reference && !/^[A-Z0-9-]{4,40}$/.test(reference)) throw new HttpError(400, 'Check the deposit reference number.');
      let promo = text(b.promo, 16).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (promo && !(await env.DB.prepare('SELECT 1 FROM gabi_promoters WHERE business_id = ? AND code = ?').bind(biz.id, promo).first())) promo = '';
      const clash = await env.DB.prepare("SELECT 1 FROM gabi_reservations WHERE business_id = ? AND date = ? AND table_id = ? AND status IN ('pending','confirmed','arrived')").bind(biz.id, ev.date, table.id).first();
      if (clash) throw new HttpError(409, `${table.name} was just booked. Please choose another table.`);
      const price = pkg ? pkg.price : table.min_spend;
      await env.DB.prepare('INSERT INTO gabi_reservations (id, business_id, date, table_id, table_name, package_id, package_name, price, name, mobile, guests, reference, notes, promo, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(randomHex(16), biz.id, ev.date, table.id, table.name, pkg?.id || '', pkg?.name || '', price, name, mobile, guests, reference, multiline(b.notes, 300), promo, 'pending', now(), now()).run();
      return json({ ok: true, table: table.name, date: ev.date, price }, 201);
    }
    if ((m = pathname.match(/^\/api\/public\/gabi\/([a-z0-9-]{3,40})\/guestlist$/)) && method === 'POST') {
      const ip = request.headers.get('cf-connecting-ip') || 'local';
      await rateLimit(env, `gabigl:${ip}`, 8, 600);
      const { biz, club } = await clubBySlug(env, m[1]);
      need(club?.plan || 'site', 'full');
      const b = await readJSON(request);
      const ev = await env.DB.prepare("SELECT * FROM gabi_events WHERE id = ? AND business_id = ? AND status = 'on'").bind(String(b.eventId || ''), biz.id).first();
      if (!ev || ev.date < manilaDay()) throw new HttpError(400, 'Choose an upcoming night.');
      const name = text(b.name, 60); const mobile = text(b.mobile, 20).replace(/\s+/g, ''); const plus = Math.floor(Number(b.plus) || 0);
      if (!name) throw new HttpError(400, 'Enter your name.');
      if (!/^[0-9+()-]{7,20}$/.test(mobile)) throw new HttpError(400, 'Enter a valid mobile number.');
      if (!(plus >= 0 && plus <= 5)) throw new HttpError(400, 'You can bring up to 5 friends.');
      const existing = await env.DB.prepare("SELECT token, code FROM gabi_guests WHERE event_id = ? AND mobile = ? AND status != 'cancelled'").bind(ev.id, mobile).first();
      if (existing) return json({ token: existing.token, code: existing.code, again: true });
      if (await count(env, 'gabi_guests', biz.id, 'AND event_id = ?', ev.id) >= LIMITS.guestsPerEvent) throw new HttpError(409, 'The guest list for this night is full.');
      let promo = text(b.promo, 16).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (promo && !(await env.DB.prepare('SELECT 1 FROM gabi_promoters WHERE business_id = ? AND code = ?').bind(biz.id, promo).first())) promo = '';
      const token = randomHex(24);
      for (let i = 0; i < 5; i++) {
        const code = passCode();
        try {
          await env.DB.prepare('INSERT INTO gabi_guests (id, business_id, event_id, event_date, name, mobile, plus, promo, code, token, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(randomHex(16), biz.id, ev.id, ev.date, name, mobile, plus, promo, code, token, 'listed', now()).run();
          return json({ token, code }, 201);
        } catch (e) { if (!/UNIQUE/i.test(String(e.message))) throw e; }
      }
      throw new HttpError(503, 'Please try again.');
    }
    return null;
  }

  /* RZ admin: set a club's plan after it is paid for. */
  async function admin(env, request, pathname, method) {
    if (pathname === '/api/admin/gabi' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT b.name, b.slug, COALESCE(c.plan, \'site\') AS plan FROM gabi_clubs c JOIN businesses b ON b.id = c.business_id ORDER BY b.name LIMIT 500').all();
      return json({ clubs: results });
    }
    if (pathname === '/api/admin/gabi' && method === 'PATCH') {
      const b = await readJSON(request);
      if (!PLANS.includes(b.plan)) throw new HttpError(400, 'Choose site, vip or full.');
      const biz = await env.DB.prepare('SELECT id, name FROM businesses WHERE slug = ?').bind(String(b.slug || '').toLowerCase()).first();
      if (!biz) throw new HttpError(404, 'No club with that link name.');
      await env.DB.prepare("INSERT INTO gabi_clubs (business_id, plan) VALUES (?, ?) ON CONFLICT(business_id) DO UPDATE SET plan = excluded.plan").bind(biz.id, b.plan).run();
      return json({ ok: true, name: biz.name, plan: b.plan });
    }
    return null;
  }

  return { owner, publicRoute, admin };
}
