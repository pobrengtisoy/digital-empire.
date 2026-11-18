/*
 * RZ Upa — rent book for boarding houses, apartments and room rentals.
 * Billing maths lives in products/upa/logic.mjs and is shared with the page.
 * Everything an owner reads or changes is scoped to their own business.
 * Tenants see only their own statement, by a private random token.
 */
import { buildState, makeBills, computeBill, ledger, validPeriod, round } from '../products/upa/logic.mjs';

export const UPA_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS upa_settings (business_id TEXT PRIMARY KEY, elec_rate REAL NOT NULL, water_mode TEXT NOT NULL, water_rate REAL NOT NULL, water_fixed REAL NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS upa_units (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL, rent REAL NOT NULL, elec_meter REAL NOT NULL, water_meter REAL NOT NULL, sort INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_upa_units_biz ON upa_units (business_id, sort)`,
  `CREATE TABLE IF NOT EXISTS upa_tenants (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, unit_id TEXT NOT NULL, name TEXT NOT NULL, mobile TEXT DEFAULT '', rent REAL NOT NULL, due_day INTEGER NOT NULL, deposit REAL NOT NULL, move_in TEXT NOT NULL, active INTEGER NOT NULL, token TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_upa_tenants_biz ON upa_tenants (business_id)`,
  `CREATE TABLE IF NOT EXISTS upa_bills (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, tenant_id TEXT NOT NULL, unit_id TEXT NOT NULL, period TEXT NOT NULL, data TEXT NOT NULL, total REAL NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_upa_bills_tp ON upa_bills (tenant_id, period)`,
  `CREATE INDEX IF NOT EXISTS idx_upa_bills_biz ON upa_bills (business_id, period)`,
  `CREATE TABLE IF NOT EXISTS upa_payments (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, tenant_id TEXT NOT NULL, amount REAL NOT NULL, paid_on TEXT NOT NULL, method TEXT NOT NULL, reference TEXT DEFAULT '', note TEXT DEFAULT '', status TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_upa_pay_tenant ON upa_payments (tenant_id, paid_on)`,
];

const LIMITS = { units: 200, tenants: 400, bills: 5000, payments: 8000, pending: 5 };
const METHODS = ['Cash', 'GCash', 'Maya', 'Bank'];
const DEFAULT_SETTINGS = { elecRate: 13.5, waterMode: 'meter', waterRate: 45, waterFixed: 150 };

/* "Today" in the Philippines, as a plain local date for the shared logic. */
function manilaToday() {
  const d = new Date(Date.now() + 8 * 3_600_000);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
const isDate = s => /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(s));

const unitIn = r => ({ id: r.id, name: r.name, rent: r.rent, elecMeter: r.elec_meter, waterMeter: r.water_meter, sort: r.sort });
const tenantIn = r => ({ id: r.id, unitId: r.unit_id, name: r.name, mobile: r.mobile, rent: r.rent, dueDay: r.due_day, deposit: r.deposit, moveIn: r.move_in, active: !!r.active, token: r.token, createdAt: r.created_at });
const billIn = r => ({ ...JSON.parse(r.data), id: r.id, tenantId: r.tenant_id, unitId: r.unit_id, period: r.period });
const payIn = r => ({ id: r.id, tenantId: r.tenant_id, amount: r.amount, paidOn: r.paid_on, method: r.method, reference: r.reference, note: r.note, status: r.status, createdAt: r.created_at });

export function upaRoutes(h) {
  const { json, HttpError, text, money, randomHex, now, readJSON, rateLimit } = h;

  async function settingsOf(env, bizId) {
    const s = await env.DB.prepare('SELECT * FROM upa_settings WHERE business_id = ?').bind(bizId).first();
    return s ? { elecRate: s.elec_rate, waterMode: s.water_mode, waterRate: s.water_rate, waterFixed: s.water_fixed } : { ...DEFAULT_SETTINGS };
  }

  async function raw(env, biz) {
    const q = (sql) => env.DB.prepare(sql).bind(biz.id).all();
    const [units, tenants, bills, payments] = await Promise.all([
      q('SELECT * FROM upa_units WHERE business_id = ? ORDER BY sort, created_at'),
      q('SELECT * FROM upa_tenants WHERE business_id = ? ORDER BY created_at'),
      q(`SELECT * FROM upa_bills WHERE business_id = ? ORDER BY period DESC LIMIT ${LIMITS.bills}`),
      q(`SELECT * FROM upa_payments WHERE business_id = ? ORDER BY paid_on DESC LIMIT ${LIMITS.payments}`),
    ]);
    return {
      biz: { name: biz.name, gcash: biz.gcash }, settings: await settingsOf(env, biz.id),
      units: units.results.map(unitIn), tenants: tenants.results.map(tenantIn),
      bills: bills.results.map(billIn), payments: payments.results.map(payIn),
    };
  }
  const state = async (env, biz) => json(buildState(await raw(env, biz), manilaToday()));

  async function own(env, table, id, bizId, what) {
    const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND business_id = ?`).bind(id, bizId).first();
    if (!row) throw new HttpError(404, `${what} not found.`);
    return row;
  }
  const count = async (env, table, bizId, extra = '') => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE business_id = ? ${extra}`).bind(bizId).first())?.n || 0;

  function reading(v, label) {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n) || n < 0 || n > 99_999_999) throw new HttpError(400, `Check the ${label} reading.`);
    return Math.round(n * 100) / 100;
  }
  function peso(v, label, max = 1_000_000) {
    const n = money(v ?? 0);
    if (!Number.isFinite(n) || n > max) throw new HttpError(400, `Check the ${label}.`);
    return n;
  }

  /* Owner routes. Returns a Response, or null when the path is not an RZ Upa route. */
  async function owner(env, request, user, pathname, method) {
    let m;
    const biz = user; // currentUser row carries the business columns; user.id is the business id
    if (pathname === '/api/upa' && method === 'GET') return state(env, biz);

    if (pathname === '/api/upa/settings' && method === 'PUT') {
      const b = await readJSON(request);
      const mode = ['meter', 'fixed', 'none'].includes(b.waterMode) ? b.waterMode : 'meter';
      await env.DB.prepare('INSERT INTO upa_settings (business_id, elec_rate, water_mode, water_rate, water_fixed) VALUES (?, ?, ?, ?, ?) ON CONFLICT(business_id) DO UPDATE SET elec_rate = excluded.elec_rate, water_mode = excluded.water_mode, water_rate = excluded.water_rate, water_fixed = excluded.water_fixed')
        .bind(biz.id, peso(b.elecRate, 'electricity rate', 1000), mode, peso(b.waterRate, 'water rate', 1000), peso(b.waterFixed, 'water fee', 20000)).run();
      return state(env, biz);
    }

    if (pathname === '/api/upa/units' && method === 'POST') {
      if (await count(env, 'upa_units', biz.id) >= LIMITS.units) throw new HttpError(409, `You can have up to ${LIMITS.units} rooms.`);
      const b = await readJSON(request);
      const name = text(b.name, 40);
      if (!name) throw new HttpError(400, 'Name the room, like Room 1 or Unit 2A.');
      const sort = await count(env, 'upa_units', biz.id);
      await env.DB.prepare('INSERT INTO upa_units (id, business_id, name, rent, elec_meter, water_meter, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(randomHex(16), biz.id, name, peso(b.rent, 'rent'), reading(b.elecMeter, 'electric meter'), reading(b.waterMeter, 'water meter'), sort, now()).run();
      return state(env, biz);
    }
    if ((m = pathname.match(/^\/api\/upa\/units\/([a-f0-9]{32})$/))) {
      const u = await own(env, 'upa_units', m[1], biz.id, 'Room');
      if (method === 'PATCH') {
        const b = await readJSON(request);
        await env.DB.prepare('UPDATE upa_units SET name = ?, rent = ?, elec_meter = ?, water_meter = ? WHERE id = ?')
          .bind(text(b.name, 40) || u.name, b.rent == null ? u.rent : peso(b.rent, 'rent'), b.elecMeter == null ? u.elec_meter : reading(b.elecMeter, 'electric meter'), b.waterMeter == null ? u.water_meter : reading(b.waterMeter, 'water meter'), u.id).run();
        return state(env, biz);
      }
      if (method === 'DELETE') {
        if (await env.DB.prepare('SELECT 1 FROM upa_tenants WHERE unit_id = ? AND active = 1').bind(u.id).first()) throw new HttpError(409, 'Move the tenants out of this room first.');
        await env.DB.prepare('DELETE FROM upa_units WHERE id = ?').bind(u.id).run();
        return state(env, biz);
      }
    }

    if (pathname === '/api/upa/tenants' && method === 'POST') {
      if (await count(env, 'upa_tenants', biz.id) >= LIMITS.tenants) throw new HttpError(409, `You can have up to ${LIMITS.tenants} tenants.`);
      const b = await readJSON(request);
      const u = await own(env, 'upa_units', String(b.unitId || ''), biz.id, 'Room');
      const name = text(b.name, 60);
      const dueDay = Math.floor(Number(b.dueDay));
      if (!name) throw new HttpError(400, 'Enter the tenant’s name.');
      if (!(dueDay >= 1 && dueDay <= 31)) throw new HttpError(400, 'Due day must be 1 to 31.');
      if (!isDate(b.moveIn)) throw new HttpError(400, 'Enter the move-in date.');
      const mobile = text(b.mobile, 20);
      if (mobile && !/^[0-9+()\s-]{7,20}$/.test(mobile)) throw new HttpError(400, 'Check the mobile number.');
      await env.DB.prepare('INSERT INTO upa_tenants (id, business_id, unit_id, name, mobile, rent, due_day, deposit, move_in, active, token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
        .bind(randomHex(16), biz.id, u.id, name, mobile, b.rent == null || b.rent === '' ? u.rent : peso(b.rent, 'rent'), dueDay, peso(b.deposit, 'deposit'), b.moveIn, randomHex(24), now()).run();
      return state(env, biz);
    }
    if ((m = pathname.match(/^\/api\/upa\/tenants\/([a-f0-9]{32})$/))) {
      const t = await own(env, 'upa_tenants', m[1], biz.id, 'Tenant');
      if (method === 'PATCH') {
        const b = await readJSON(request);
        const unitId = b.unitId ? (await own(env, 'upa_units', String(b.unitId), biz.id, 'Room')).id : t.unit_id;
        const dueDay = b.dueDay == null ? t.due_day : Math.floor(Number(b.dueDay));
        if (!(dueDay >= 1 && dueDay <= 31)) throw new HttpError(400, 'Due day must be 1 to 31.');
        const mobile = b.mobile == null ? t.mobile : text(b.mobile, 20);
        if (mobile && !/^[0-9+()\s-]{7,20}$/.test(mobile)) throw new HttpError(400, 'Check the mobile number.');
        await env.DB.prepare('UPDATE upa_tenants SET unit_id = ?, name = ?, mobile = ?, rent = ?, due_day = ?, deposit = ?, active = ? WHERE id = ?')
          .bind(unitId, text(b.name, 60) || t.name, mobile, b.rent == null ? t.rent : peso(b.rent, 'rent'), dueDay, b.deposit == null ? t.deposit : peso(b.deposit, 'deposit'), b.active == null ? t.active : (b.active ? 1 : 0), t.id).run();
        return state(env, biz);
      }
      if (method === 'DELETE') {
        const used = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM upa_bills WHERE tenant_id = ?) + (SELECT COUNT(*) FROM upa_payments WHERE tenant_id = ?) AS n').bind(t.id, t.id).first();
        if (used?.n) throw new HttpError(409, 'This tenant has bills or payments. Mark them as moved out instead, so your records stay.');
        await env.DB.prepare('DELETE FROM upa_tenants WHERE id = ?').bind(t.id).run();
        return state(env, biz);
      }
    }

    if (pathname === '/api/upa/bills' && method === 'POST') {
      await rateLimit(env, `upabill:${biz.id}`, 60, 3600);
      const b = await readJSON(request, 64_000);
      if (!validPeriod(b.period)) throw new HttpError(400, 'Choose the month to bill.');
      if (!Array.isArray(b.readings) || !b.readings.length || b.readings.length > LIMITS.units) throw new HttpError(400, 'Enter at least one meter reading.');
      const r = await raw(env, biz);
      const readings = b.readings.map(x => ({ unitId: String(x.unitId || ''), elec: reading(x.elec, 'electric'), water: reading(x.water, 'water') }));
      const { create, meters, problems } = makeBills({ period: b.period, readings, units: r.units, tenants: r.tenants, bills: r.bills, settings: r.settings });
      if (!create.length) throw new HttpError(400, problems[0] || 'No occupied rooms to bill for that month.');
      const stmts = create.map(x => {
        const { tenantId, unitId, period, ...data } = x;
        return env.DB.prepare('INSERT INTO upa_bills (id, business_id, tenant_id, unit_id, period, data, total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(randomHex(16), biz.id, tenantId, unitId, period, JSON.stringify(data), computeBill(x).total, now());
      }).concat(meters.map(mt => env.DB.prepare('UPDATE upa_units SET elec_meter = ?, water_meter = ? WHERE id = ? AND business_id = ?').bind(mt.elec, mt.water, mt.unitId, biz.id)));
      await env.DB.batch(stmts);
      const res = await state(env, biz);
      const body = await res.json();
      return json({ ...body, created: create.length, problems });
    }
    if ((m = pathname.match(/^\/api\/upa\/bills\/([a-f0-9]{32})$/))) {
      const row = await own(env, 'upa_bills', m[1], biz.id, 'Bill');
      const bill = billIn(row);
      if (method === 'PATCH') {
        const b = await readJSON(request);
        if (b.rent != null) bill.rent = peso(b.rent, 'rent');
        if (b.extras != null) {
          if (!Array.isArray(b.extras) || b.extras.length > 10) throw new HttpError(400, 'Add up to 10 extra charges.');
          bill.extras = b.extras.map(x => ({ label: text(x.label, 40), amount: peso(x.amount, 'charge') })).filter(x => x.label && x.amount);
        }
        const { id, tenantId, unitId, period, ...data } = bill;
        await env.DB.prepare('UPDATE upa_bills SET data = ?, total = ? WHERE id = ?').bind(JSON.stringify(data), computeBill(bill).total, row.id).run();
        return state(env, biz);
      }
      if (method === 'DELETE') {
        // Removing a room's bills for its latest month also puts the meter back.
        await env.DB.prepare('DELETE FROM upa_bills WHERE id = ?').bind(row.id).run();
        const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM upa_bills WHERE unit_id = ? AND period = ?').bind(row.unit_id, row.period).first();
        const later = await env.DB.prepare('SELECT 1 FROM upa_bills WHERE unit_id = ? AND period > ?').bind(row.unit_id, row.period).first();
        if (!left?.n && !later) await env.DB.prepare('UPDATE upa_units SET elec_meter = ?, water_meter = ? WHERE id = ? AND business_id = ?').bind(bill.elecPrev, bill.waterPrev, row.unit_id, biz.id).run();
        return state(env, biz);
      }
    }

    if (pathname === '/api/upa/payments' && method === 'POST') {
      if (await count(env, 'upa_payments', biz.id) >= LIMITS.payments) throw new HttpError(409, 'Payment limit reached. Contact RZ.');
      const b = await readJSON(request);
      const t = await own(env, 'upa_tenants', String(b.tenantId || ''), biz.id, 'Tenant');
      const amount = peso(b.amount, 'amount');
      if (!(amount > 0)) throw new HttpError(400, 'Enter the amount paid.');
      if (!isDate(b.paidOn)) throw new HttpError(400, 'Enter the payment date.');
      await env.DB.prepare('INSERT INTO upa_payments (id, business_id, tenant_id, amount, paid_on, method, reference, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(randomHex(16), biz.id, t.id, amount, b.paidOn, METHODS.includes(b.method) ? b.method : 'Cash', text(b.reference, 40), text(b.note, 120), 'confirmed', now()).run();
      return state(env, biz);
    }
    if ((m = pathname.match(/^\/api\/upa\/payments\/([a-f0-9]{32})$/))) {
      const p = await own(env, 'upa_payments', m[1], biz.id, 'Payment');
      if (method === 'PATCH') {
        const b = await readJSON(request);
        if (!['confirmed', 'rejected', 'pending'].includes(b.status)) throw new HttpError(400, 'Unknown status.');
        await env.DB.prepare('UPDATE upa_payments SET status = ? WHERE id = ?').bind(b.status, p.id).run();
        return state(env, biz);
      }
      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM upa_payments WHERE id = ?').bind(p.id).run();
        return state(env, biz);
      }
    }
    return null;
  }

  /* Public tenant routes, by private token. */
  async function tenantView(env, token) {
    const t = await env.DB.prepare('SELECT * FROM upa_tenants WHERE token = ?').bind(token).first();
    if (!t) throw new HttpError(404, 'This link is not valid. Ask your landlord for a new one.');
    const biz = await env.DB.prepare('SELECT name, gcash FROM businesses WHERE id = ?').bind(t.business_id).first();
    const unit = await env.DB.prepare('SELECT name FROM upa_units WHERE id = ?').bind(t.unit_id).first();
    const [bills, pays] = await Promise.all([
      env.DB.prepare('SELECT * FROM upa_bills WHERE tenant_id = ? ORDER BY period DESC LIMIT 36').bind(t.id).all(),
      env.DB.prepare('SELECT * FROM upa_payments WHERE tenant_id = ? ORDER BY paid_on DESC LIMIT 120').bind(t.id).all(),
    ]);
    const tb = bills.results.map(billIn).map(b => ({ ...b, ...computeBill(b) }));
    const tp = pays.results.map(payIn).filter(p => p.status !== 'rejected');
    const l = ledger(tb, tp, t.due_day, manilaToday());
    return {
      t, out: {
        property: biz?.name || 'Your landlord', gcash: biz?.gcash || '', tenant: t.name, unit: unit?.name || '', dueDay: t.due_day, active: !!t.active,
        balance: l.balance, pending: l.pending, lateDays: l.lateDays, nextDue: l.nextDue,
        bills: l.bills.slice(0, 12).map(b => ({ period: b.period, rent: b.rent, elec: b.elec, elecUse: b.elecUse, elecPrev: b.elecPrev, elecCurr: b.elecCurr, elecRate: b.elecRate, water: b.water, waterUse: b.waterUse, waterMode: b.waterMode, waterRate: b.waterRate, share: b.share, extras: b.extras, total: b.total, paid: b.paid, left: b.left, status: b.status, due: b.due, lateDays: b.lateDays })),
        payments: tp.slice(0, 24).map(p => ({ amount: p.amount, paidOn: p.paidOn, method: p.method, status: p.status, reference: p.reference })),
      },
    };
  }

  async function publicRoute(env, request, pathname, method) {
    const m = pathname.match(/^\/api\/public\/upa\/([a-f0-9]{48})$/);
    if (!m) return null;
    if (method === 'GET') return json((await tenantView(env, m[1])).out);
    if (method === 'POST') {
      const ip = request.headers.get('cf-connecting-ip') || 'local';
      await rateLimit(env, `upapay:${ip}`, 10, 600);
      const { t } = await tenantView(env, m[1]);
      await rateLimit(env, `upapayt:${t.id}`, 10, 86400);
      const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM upa_payments WHERE tenant_id = ? AND status = 'pending'").bind(t.id).first();
      if ((pending?.n || 0) >= LIMITS.pending) throw new HttpError(409, 'You already have payments waiting for your landlord to check.');
      const b = await readJSON(request);
      const amount = money(b.amount);
      const reference = text(b.reference, 40).toUpperCase().replace(/\s+/g, '');
      if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) throw new HttpError(400, 'Enter the amount you paid.');
      if (!/^[A-Z0-9-]{4,40}$/.test(reference)) throw new HttpError(400, 'Enter the reference number from your receipt.');
      const method_ = ['GCash', 'Maya', 'Bank'].includes(b.method) ? b.method : 'GCash';
      const today = manilaToday();
      const paidOn = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      await env.DB.prepare('INSERT INTO upa_payments (id, business_id, tenant_id, amount, paid_on, method, reference, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(randomHex(16), t.business_id, t.id, round(amount), paidOn, method_, reference, 'Sent by tenant', 'pending', now()).run();
      return json((await tenantView(env, m[1])).out, 201);
    }
    return null;
  }

  return { owner, publicRoute };
}
