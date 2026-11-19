/*
 * RZ Tindahan POS — products, staff PINs, shifts and sales for small stores.
 * Counting rules live in products/tindahan/logic.mjs and are shared with the page.
 *
 * The store's tablet is signed in with the owner's account (HttpOnly session). Sales and shifts are
 * made on the tablet, even offline, and sent here with /sync. Each sale has an id made on the tablet,
 * so sending the same sale twice never counts it twice. Stock goes down only when a sale is first saved.
 * Staff PINs choose who is at the counter on a shared tablet; they are not a second password.
 */
import { METHODS, saleTotals, round } from '../products/tindahan/logic.mjs';

export const TINDAHAN_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS tnd_stores (business_id TEXT PRIMARY KEY, low INTEGER NOT NULL DEFAULT 5, receipt_note TEXT DEFAULT '', created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS tnd_items (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL, barcode TEXT DEFAULT '', category TEXT DEFAULT '', cost REAL NOT NULL, price REAL NOT NULL, stock INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_tnd_items_biz ON tnd_items (business_id, name)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_tnd_items_code ON tnd_items (business_id, barcode) WHERE barcode <> ''`,
  `CREATE TABLE IF NOT EXISTS tnd_staff (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, salt TEXT NOT NULL, pin_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_tnd_staff_biz ON tnd_staff (business_id)`,
  `CREATE TABLE IF NOT EXISTS tnd_shifts (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, staff_id TEXT NOT NULL, opened_at TEXT NOT NULL, opening_cash REAL NOT NULL, closed_at TEXT, counted_cash REAL, note TEXT DEFAULT '')`,
  `CREATE INDEX IF NOT EXISTS idx_tnd_shifts_biz ON tnd_shifts (business_id, opened_at)`,
  `CREATE TABLE IF NOT EXISTS tnd_sales (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, shift_id TEXT NOT NULL, staff_id TEXT NOT NULL, at TEXT NOT NULL, method TEXT NOT NULL, lines TEXT NOT NULL, discount REAL NOT NULL, cash REAL NOT NULL, reference TEXT DEFAULT '', customer TEXT DEFAULT '', total REAL NOT NULL, cost REAL NOT NULL, status TEXT NOT NULL, tok TEXT NOT NULL, synced_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_tnd_sales_biz ON tnd_sales (business_id, at)`,
];

/* Moves stock for every line of the sales carrying token ?2: one statement, however many lines. */
const STOCK_MOVE = sign => `UPDATE tnd_items SET stock = stock ${sign} (
    SELECT SUM(json_extract(l.value, '$.qty')) FROM tnd_sales s, json_each(s.lines) l WHERE s.business_id = ?1 AND s.tok = ?2 AND json_extract(l.value, '$.itemId') = tnd_items.id
  ), updated_at = ?3
  WHERE business_id = ?1 AND id IN (SELECT json_extract(l.value, '$.itemId') FROM tnd_sales s, json_each(s.lines) l WHERE s.business_id = ?1 AND s.tok = ?2)`;

const LIMITS = { items: 3000, staff: 30, importLines: 1000, syncSales: 300, syncShifts: 50, lines: 200, days: 45 };
const HEX32 = /^[a-f0-9]{32}$/;
const ROLES = ['owner', 'cashier'];

const itemOut = r => ({ id: r.id, name: r.name, barcode: r.barcode || '', category: r.category || '', cost: r.cost, price: r.price, stock: r.stock, updatedAt: r.updated_at });
const staffOut = r => ({ id: r.id, name: r.name, role: r.role, salt: r.salt, pinHash: r.pin_hash, active: !!r.active });
const shiftOut = r => ({ id: r.id, staffId: r.staff_id, openedAt: r.opened_at, openingCash: r.opening_cash, closedAt: r.closed_at || null, countedCash: r.counted_cash ?? null, note: r.note || '' });
const saleOut = r => ({ id: r.id, shiftId: r.shift_id, staffId: r.staff_id, at: r.at, method: r.method, lines: JSON.parse(r.lines), discount: r.discount, cash: r.cash, reference: r.reference || '', customer: r.customer || '', total: r.total, status: r.status });

export function tindahanRoutes(h) {
  const { json, HttpError, text, money, randomHex, now, readJSON } = h;
  const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

  const amount = (v, label, max = 1_000_000) => {
    const n = money(v ?? 0);
    if (!Number.isFinite(n) || n > max) throw new HttpError(400, `Check the ${label}.`);
    return n;
  };
  const whole = (v, label, min, max) => {
    const n = Number(v ?? 0);
    if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `Check the ${label}.`);
    return n;
  };
  const barcodeOf = v => {
    const b = String(v ?? '').replace(/\s+/g, '');
    if (b && !/^[A-Za-z0-9-]{3,32}$/.test(b)) throw new HttpError(400, 'A barcode is 3 to 32 letters or numbers.');
    return b;
  };
  const isoOk = s => typeof s === 'string' && !Number.isNaN(Date.parse(s)) && s.length <= 40;

  async function own(env, table, id, bizId, what) {
    const row = HEX32.test(String(id)) ? await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND business_id = ?`).bind(id, bizId).first() : null;
    if (!row) throw new HttpError(404, `${what} not found.`);
    return row;
  }
  const count = async (env, table, bizId, extra = '') => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE business_id = ? ${extra}`).bind(bizId).first())?.n || 0;

  async function storeOf(env, biz) {
    let s = await env.DB.prepare('SELECT * FROM tnd_stores WHERE business_id = ?').bind(biz.id).first();
    if (!s) { await env.DB.prepare('INSERT OR IGNORE INTO tnd_stores (business_id, low, receipt_note, created_at) VALUES (?, 5, ?, ?)').bind(biz.id, '', now()).run(); s = { low: 5, receipt_note: '' }; }
    return { name: biz.name, slug: biz.slug, low: s.low, receiptNote: s.receipt_note || '' };
  }

  async function state(env, biz) {
    const since = new Date(Date.now() - LIMITS.days * 86_400_000).toISOString();
    const [store, items, staff, shifts, sales] = await Promise.all([
      storeOf(env, biz),
      env.DB.prepare('SELECT * FROM tnd_items WHERE business_id = ? ORDER BY name COLLATE NOCASE').bind(biz.id).all(),
      env.DB.prepare('SELECT * FROM tnd_staff WHERE business_id = ? ORDER BY created_at').bind(biz.id).all(),
      env.DB.prepare('SELECT * FROM tnd_shifts WHERE business_id = ? AND (opened_at >= ? OR closed_at IS NULL) ORDER BY opened_at DESC LIMIT 500').bind(biz.id, since).all(),
      env.DB.prepare('SELECT * FROM tnd_sales WHERE business_id = ? AND at >= ? ORDER BY at DESC LIMIT 6000').bind(biz.id, since).all(),
    ]);
    return json({ store, items: items.results.map(itemOut), staff: staff.results.map(staffOut), shifts: shifts.results.map(shiftOut), sales: sales.results.map(saleOut), serverTime: now() });
  }

  function cleanItem(b, prev = {}) {
    const name = b.name === undefined ? prev.name : text(b.name, 60);
    if (!name) throw new HttpError(400, 'Name the item.');
    return {
      name,
      barcode: b.barcode === undefined ? (prev.barcode || '') : barcodeOf(b.barcode),
      category: b.category === undefined ? (prev.category || '') : text(b.category, 30),
      price: b.price === undefined ? prev.price : amount(b.price, 'price'),
      cost: b.cost === undefined ? (prev.cost ?? 0) : amount(b.cost, 'cost'),
      stock: b.stock === undefined ? (prev.stock ?? 0) : whole(b.stock, 'stock', -99_999, 999_999),
    };
  }
  async function barcodeFree(env, bizId, code, exceptId = '') {
    if (!code) return;
    const row = await env.DB.prepare("SELECT id, name FROM tnd_items WHERE business_id = ? AND barcode = ? AND id <> ?").bind(bizId, code, exceptId).first();
    if (row) throw new HttpError(409, `That barcode is already on “${row.name}”.`);
  }

  async function pinFields(pin) {
    const p = String(pin ?? '');
    if (!/^\d{4,6}$/.test(p)) throw new HttpError(400, 'The PIN is 4 to 6 numbers.');
    const salt = randomHex(16);
    return { salt, hash: await sha(`${salt}:${p}`) };
  }

  /* ---------- offline sync: shifts first, then sales ---------- */
  async function sync(env, request, biz) {
    const b = await readJSON(request, 600_000);
    const shifts = Array.isArray(b.shifts) ? b.shifts : []; const sales = Array.isArray(b.sales) ? b.sales : [];
    if (shifts.length > LIMITS.syncShifts || sales.length > LIMITS.syncSales) throw new HttpError(413, 'Too much at once. The tablet will send the rest next.');
    const staffIds = new Set((await env.DB.prepare('SELECT id FROM tnd_staff WHERE business_id = ?').bind(biz.id).all()).results.map(r => r.id));
    const oldest = Date.now() - 60 * 86_400_000; const newest = Date.now() + 86_400_000;
    const timeOk = s => isoOk(s) && Date.parse(s) >= oldest && Date.parse(s) <= newest;

    const shiftRows = shifts.map(s => {
      if (!HEX32.test(String(s.id)) || !staffIds.has(String(s.staffId)) || !timeOk(s.openedAt)) throw new HttpError(400, 'A shift from the tablet is not valid.');
      const closedAt = s.closedAt == null ? null : (timeOk(s.closedAt) ? s.closedAt : null);
      return { id: s.id, staffId: s.staffId, openedAt: s.openedAt, openingCash: amount(s.openingCash, 'opening cash', 10_000_000), closedAt, countedCash: closedAt && s.countedCash != null ? amount(s.countedCash, 'cash count', 10_000_000) : null, note: text(s.note, 120) };
    });
    // One statement for all shifts (the free plan allows few queries per request): insert, or close an open shift.
    // A shift id that belongs to another store is never touched.
    if (shiftRows.length) {
      await env.DB.prepare(`INSERT INTO tnd_shifts (id, business_id, staff_id, opened_at, opening_cash, closed_at, counted_cash, note)
        SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.staffId'), json_extract(value, '$.openedAt'), json_extract(value, '$.openingCash'), json_extract(value, '$.closedAt'), json_extract(value, '$.countedCash'), json_extract(value, '$.note') FROM json_each(?2) WHERE true
        ON CONFLICT(id) DO UPDATE SET closed_at = COALESCE(tnd_shifts.closed_at, excluded.closed_at), counted_cash = COALESCE(tnd_shifts.counted_cash, excluded.counted_cash), note = CASE WHEN excluded.note <> '' THEN excluded.note ELSE tnd_shifts.note END
        WHERE tnd_shifts.business_id = excluded.business_id`).bind(biz.id, JSON.stringify(shiftRows)).run();
    }

    if (sales.length) {
      const since = new Date(Date.now() - 62 * 86_400_000).toISOString();
      const shiftIds = new Set((await env.DB.prepare('SELECT id FROM tnd_shifts WHERE business_id = ? AND (opened_at >= ? OR closed_at IS NULL)').bind(biz.id, since).all()).results.map(r => r.id));
      const itemIds = new Set((await env.DB.prepare('SELECT id FROM tnd_items WHERE business_id = ?').bind(biz.id).all()).results.map(r => r.id));
      const rows = sales.map(s => {
        if (!HEX32.test(String(s.id))) throw new HttpError(400, 'A sale from the tablet has no valid id.');
        if (!shiftIds.has(String(s.shiftId)) || !staffIds.has(String(s.staffId))) throw new HttpError(400, 'A sale from the tablet is not from this store.');
        if (!timeOk(s.at)) throw new HttpError(400, 'A sale from the tablet has a wrong date. Check the tablet’s clock.');
        if (!METHODS.includes(s.method)) throw new HttpError(400, 'Unknown payment method.');
        const raw = Array.isArray(s.lines) ? s.lines : [];
        if (!raw.length || raw.length > LIMITS.lines) throw new HttpError(400, 'A sale needs 1 to 200 lines.');
        const lines = raw.map(l => ({
          itemId: itemIds.has(String(l.itemId)) ? String(l.itemId) : null,
          name: text(l.name, 60) || 'Item', price: amount(l.price, 'price'), cost: amount(l.cost, 'cost'), qty: whole(l.qty, 'quantity', 1, 9999),
        }));
        const sale = { lines, method: s.method, discount: amount(s.discount, 'discount'), cash: amount(s.cash, 'cash received', 10_000_000) };
        const t = saleTotals(sale);
        const customer = text(s.customer, 60);
        if (s.method === 'utang' && !customer) throw new HttpError(400, 'A credit (utang) sale needs the customer’s name.');
        return { id: s.id, shiftId: s.shiftId, staffId: s.staffId, at: s.at, method: s.method, lines: JSON.stringify(lines), discount: t.discount, cash: sale.cash, reference: text(s.reference, 40), customer, total: t.total, cost: t.cost };
      });
      const tok = randomHex(16); const at = now(); const data = JSON.stringify(rows);
      // Two statements in one transaction. A sale already saved is ignored, and keeps its old token,
      // so stock goes down only for sales this request saved: re-sending a sale changes nothing.
      await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO tnd_sales (id, business_id, shift_id, staff_id, at, method, lines, discount, cash, reference, customer, total, cost, status, tok, synced_at)
          SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.shiftId'), json_extract(value, '$.staffId'), json_extract(value, '$.at'), json_extract(value, '$.method'), json_extract(value, '$.lines'), json_extract(value, '$.discount'), json_extract(value, '$.cash'), json_extract(value, '$.reference'), json_extract(value, '$.customer'), json_extract(value, '$.total'), json_extract(value, '$.cost'), 'ok', ?2, ?3 FROM json_each(?4)`).bind(biz.id, tok, at, data),
        env.DB.prepare(STOCK_MOVE('-')).bind(biz.id, tok, at),
      ]);
    }
    return state(env, biz);
  }

  async function owner(env, request, user, pathname, method) {
    const biz = user; let m;
    if (pathname === '/api/tindahan' && method === 'GET') return state(env, biz);
    if (pathname === '/api/tindahan/sync' && method === 'POST') return sync(env, request, biz);

    if (pathname === '/api/tindahan/store' && method === 'PUT') {
      const b = await readJSON(request);
      await storeOf(env, biz);
      await env.DB.prepare('UPDATE tnd_stores SET low = ?, receipt_note = ? WHERE business_id = ?').bind(whole(b.low ?? 5, 'low-stock level', 0, 1000), text(b.receiptNote, 120), biz.id).run();
      const name = text(b.name, 80); if (name) await env.DB.prepare('UPDATE businesses SET name = ? WHERE id = ?').bind(name, biz.id).run();
      return state(env, await env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(biz.id).first());
    }

    /* products */
    if (pathname === '/api/tindahan/items' && method === 'POST') {
      if (await count(env, 'tnd_items', biz.id) >= LIMITS.items) throw new HttpError(409, `Up to ${LIMITS.items} items.`);
      const it = cleanItem(await readJSON(request));
      if (it.price === undefined) throw new HttpError(400, 'Enter the price.');
      await barcodeFree(env, biz.id, it.barcode);
      await env.DB.prepare('INSERT INTO tnd_items (id, business_id, name, barcode, category, cost, price, stock, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(randomHex(16), biz.id, it.name, it.barcode, it.category, it.cost, it.price, it.stock, now(), now()).run();
      return state(env, biz);
    }
    if (pathname === '/api/tindahan/items/import' && method === 'POST') {
      const b = await readJSON(request, 400_000);
      const rows = Array.isArray(b.items) ? b.items : [];
      if (!rows.length || rows.length > LIMITS.importLines) throw new HttpError(400, `Import 1 to ${LIMITS.importLines} items at a time.`);
      const existing = (await env.DB.prepare('SELECT * FROM tnd_items WHERE business_id = ?').bind(biz.id).all()).results;
      const byCode = new Map(existing.filter(r => r.barcode).map(r => [r.barcode, r])); const byName = new Map(existing.map(r => [r.name.toLowerCase(), r]));
      const seenCodes = new Set(); const out = []; let added = 0; let updated = 0;
      for (const [i, raw] of rows.entries()) {
        let it;
        try { it = cleanItem(raw); } catch (e) { throw new HttpError(400, `Line ${i + 1}: ${e.message}`); }
        if (it.price === undefined) throw new HttpError(400, `Line ${i + 1}: enter the price.`);
        if (it.barcode) { if (seenCodes.has(it.barcode)) throw new HttpError(400, `Line ${i + 1}: barcode ${it.barcode} is used twice in the list.`); seenCodes.add(it.barcode); }
        const byBarcode = it.barcode ? byCode.get(it.barcode) : null;
        const match = byBarcode || byName.get(it.name.toLowerCase());
        if (match && match.id === 'new') throw new HttpError(400, `Line ${i + 1}: “${it.name}” is in the list twice.`);
        if (match) {
          if (it.barcode && match.barcode && match.barcode !== it.barcode && byCode.get(it.barcode)) throw new HttpError(409, `Line ${i + 1}: that barcode is already on “${byCode.get(it.barcode).name}”.`);
          out.push({ ...it, id: match.id, barcode: it.barcode || match.barcode || '', category: it.category || match.category || '' }); updated++;
        } else {
          out.push({ ...it, id: randomHex(16) }); byName.set(it.name.toLowerCase(), { id: 'new' }); added++;
        }
      }
      if (existing.length + added > LIMITS.items) throw new HttpError(409, `Up to ${LIMITS.items} items.`);
      // One statement for the whole list (the free plan allows few queries per request).
      await env.DB.prepare(`INSERT INTO tnd_items (id, business_id, name, barcode, category, cost, price, stock, created_at, updated_at)
        SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.name'), json_extract(value, '$.barcode'), json_extract(value, '$.category'), json_extract(value, '$.cost'), json_extract(value, '$.price'), json_extract(value, '$.stock'), ?2, ?2 FROM json_each(?3) WHERE true
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, barcode = excluded.barcode, category = excluded.category, cost = excluded.cost, price = excluded.price, stock = excluded.stock, updated_at = excluded.updated_at
        WHERE tnd_items.business_id = excluded.business_id`).bind(biz.id, now(), JSON.stringify(out)).run();
      const res = await state(env, biz); const data = await res.json();
      return json({ ...data, imported: { added, updated } });
    }
    if ((m = pathname.match(/^\/api\/tindahan\/items\/([a-f0-9]{32})(\/restock)?$/))) {
      const row = await own(env, 'tnd_items', m[1], biz.id, 'Item');
      if (m[2] && method === 'POST') {
        const b = await readJSON(request);
        const add = whole(b.add, 'quantity', -99_999, 99_999);
        await env.DB.prepare('UPDATE tnd_items SET stock = stock + ?, updated_at = ? WHERE id = ?').bind(add, now(), row.id).run();
        return state(env, biz);
      }
      if (!m[2] && method === 'PATCH') {
        const it = cleanItem(await readJSON(request), itemOut(row));
        await barcodeFree(env, biz.id, it.barcode, row.id);
        await env.DB.prepare('UPDATE tnd_items SET name = ?, barcode = ?, category = ?, cost = ?, price = ?, stock = ?, updated_at = ? WHERE id = ?').bind(it.name, it.barcode, it.category, it.cost, it.price, it.stock, now(), row.id).run();
        return state(env, biz);
      }
      if (!m[2] && method === 'DELETE') {
        // Past sales keep the item's name and price in their own lines, so the item can go.
        await env.DB.prepare('DELETE FROM tnd_items WHERE id = ?').bind(row.id).run();
        return state(env, biz);
      }
    }

    /* staff and PINs */
    if (pathname === '/api/tindahan/staff' && method === 'POST') {
      if (await count(env, 'tnd_staff', biz.id) >= LIMITS.staff) throw new HttpError(409, `Up to ${LIMITS.staff} staff.`);
      const b = await readJSON(request);
      const name = text(b.name, 40); if (!name) throw new HttpError(400, 'Enter the name.');
      const hasOwner = await count(env, 'tnd_staff', biz.id, "AND role = 'owner' AND active = 1");
      const role = hasOwner ? (ROLES.includes(b.role) ? b.role : 'cashier') : 'owner';
      const p = await pinFields(b.pin);
      await env.DB.prepare('INSERT INTO tnd_staff (id, business_id, name, role, salt, pin_hash, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)').bind(randomHex(16), biz.id, name, role, p.salt, p.hash, now()).run();
      return state(env, biz);
    }
    if ((m = pathname.match(/^\/api\/tindahan\/staff\/([a-f0-9]{32})$/))) {
      const row = await own(env, 'tnd_staff', m[1], biz.id, 'Staff');
      const owners = await count(env, 'tnd_staff', biz.id, "AND role = 'owner' AND active = 1");
      const lastOwner = row.role === 'owner' && row.active && owners <= 1;
      if (method === 'PATCH') {
        const b = await readJSON(request);
        const name = b.name === undefined ? row.name : text(b.name, 40); if (!name) throw new HttpError(400, 'Enter the name.');
        const role = ROLES.includes(b.role) ? b.role : row.role;
        const active = b.active === undefined ? !!row.active : !!b.active;
        if (lastOwner && (role !== 'owner' || !active)) throw new HttpError(409, 'Keep at least one owner PIN.');
        const p = b.pin ? await pinFields(b.pin) : { salt: row.salt, hash: row.pin_hash };
        await env.DB.prepare('UPDATE tnd_staff SET name = ?, role = ?, active = ?, salt = ?, pin_hash = ? WHERE id = ?').bind(name, role, active ? 1 : 0, p.salt, p.hash, row.id).run();
        return state(env, biz);
      }
      if (method === 'DELETE') {
        if (lastOwner) throw new HttpError(409, 'Keep at least one owner PIN.');
        const used = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM tnd_sales WHERE staff_id = ?) + (SELECT COUNT(*) FROM tnd_shifts WHERE staff_id = ?) AS n').bind(row.id, row.id).first();
        if (used?.n) await env.DB.prepare('UPDATE tnd_staff SET active = 0 WHERE id = ?').bind(row.id).run(); // keep the name on old sales
        else await env.DB.prepare('DELETE FROM tnd_staff WHERE id = ?').bind(row.id).run();
        return state(env, biz);
      }
    }

    /* void a sale: stamped void, stock goes back, once */
    if ((m = pathname.match(/^\/api\/tindahan\/sales\/([a-f0-9]{32})\/void$/)) && method === 'POST') {
      const row = await own(env, 'tnd_sales', m[1], biz.id, 'Sale');
      if (row.status === 'void') throw new HttpError(409, 'This sale is already void.');
      const tok = randomHex(16);
      // The status change carries a new token; stock comes back only if this request made the sale void.
      await env.DB.batch([
        env.DB.prepare("UPDATE tnd_sales SET status = 'void', tok = ? WHERE id = ? AND status = 'ok'").bind(tok, row.id),
        env.DB.prepare(STOCK_MOVE('+')).bind(biz.id, tok, now()),
      ]);
      return state(env, biz);
    }
    return null;
  }

  return { owner, round };
}
