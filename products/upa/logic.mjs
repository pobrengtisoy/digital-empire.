/*
 * RZ Upa billing logic. One file, used by the RZ server (worker/upa.js) and by the page,
 * so the bill a landlord sees, the bill a tenant sees and the bill stored are always the same.
 */

export const round = n => Math.round((Number(n) || 0) * 100) / 100;

/* ---------- months ---------- */
export const periodOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const validPeriod = p => /^20\d\d-(0[1-9]|1[0-2])$/.test(String(p));
export function periodLabel(p) {
  const [y, m] = String(p).split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}
export function shiftPeriod(p, n) {
  const [y, m] = String(p).split('-').map(Number);
  return periodOf(new Date(y, m - 1 + n, 1));
}
/* Due date of a bill: the tenant's due day in that month (day 31 becomes the month's last day). */
export function dueDate(period, dueDay) {
  const [y, m] = String(period).split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return new Date(y, m - 1, Math.min(Math.max(1, Number(dueDay) || 1), last));
}
export const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DAY = 86_400_000;
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/* ---------- one bill ---------- */
/*
 * Electricity and metered water are read per room and split equally among the tenants
 * billed in that room this month (bedspacers). Rent and extra charges are per tenant.
 */
export function computeBill(b) {
  const share = Math.max(1, Math.floor(Number(b.share) || 1));
  const elecUse = Math.max(0, round(Number(b.elecCurr) - Number(b.elecPrev)));
  const elec = round(elecUse * (Number(b.elecRate) || 0) / share);
  let waterUse = 0; let water = 0;
  if (b.waterMode === 'fixed') water = round(b.waterFixed);
  else if (b.waterMode === 'meter') { waterUse = Math.max(0, round(Number(b.waterCurr) - Number(b.waterPrev))); water = round(waterUse * (Number(b.waterRate) || 0) / share); }
  const extras = (Array.isArray(b.extras) ? b.extras : []).map(x => ({ label: String(x.label || '').slice(0, 40), amount: round(x.amount) })).filter(x => x.label && x.amount);
  const extrasTotal = round(extras.reduce((s, x) => s + x.amount, 0));
  const rent = round(b.rent);
  return { rent, elecUse, elec, waterUse, water, extras, extrasTotal, share, total: round(rent + elec + water + extrasTotal) };
}

/* ---------- a tenant's ledger ---------- */
/*
 * Confirmed payments pay the oldest bills first. Returns every bill with what is paid and left,
 * whether it is late and by how many days, plus the tenant's balance (negative = advance credit).
 */
export function ledger(bills, payments, dueDay, today = new Date()) {
  const sorted = bills.slice().sort((a, b) => String(a.period).localeCompare(String(b.period)));
  let pool = round(payments.filter(p => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount || 0), 0));
  const t = startOfDay(today);
  const rows = sorted.map(b => {
    const paid = round(Math.min(pool, b.total)); pool = round(pool - paid);
    const left = round(b.total - paid);
    const due = dueDate(b.period, dueDay);
    const lateDays = left > 0 && t > due ? Math.round((t - due) / DAY) : 0;
    return { ...b, paid, left, due: isoDay(due), lateDays, status: left <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid' };
  });
  const billed = round(sorted.reduce((s, b) => s + b.total, 0));
  const confirmed = round(payments.filter(p => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount || 0), 0));
  const open = rows.filter(r => r.left > 0);
  return {
    bills: rows.reverse(),
    billed, confirmed,
    balance: round(billed - confirmed),
    pending: round(payments.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount || 0), 0)),
    lateDays: open.reduce((m, r) => Math.max(m, r.lateDays), 0),
    nextDue: open.length ? open[0].due : null,
  };
}

/* ---------- friendly reminder ---------- */
export function reminder({ property, tenant, unit, balance, lateDays, link, gcash }) {
  const peso = n => `₱${round(n).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const late = lateDays > 0 ? ` It is ${lateDays} day${lateDays > 1 ? 's' : ''} past due.` : '';
  return `Hi ${tenant}! This is ${property}. Your balance for ${unit} is ${peso(balance)}.${late}\n`
    + `${gcash ? `You can pay by GCash or Maya to ${gcash}. ` : ''}See your bill and send your payment reference here:\n${link}\nSalamat po!`;
}

/* ---------- the whole rent book ---------- */
/* raw = { biz, settings, units, tenants, bills, payments } exactly as stored. */
export function buildState(raw, today = new Date()) {
  const { biz, settings, units, tenants, bills, payments } = raw;
  const period = periodOf(today);
  const unitName = new Map(units.map(u => [u.id, u.name]));
  const tenantsOut = tenants.map(t => {
    const tb = bills.filter(b => b.tenantId === t.id).map(b => ({ ...b, ...computeBill(b) }));
    const tp = payments.filter(p => p.tenantId === t.id).sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn)) || String(b.createdAt).localeCompare(String(a.createdAt)));
    const l = ledger(tb, tp, t.dueDay, today);
    return { ...t, unitName: unitName.get(t.unitId) || '—', ...l, payments: tp };
  });
  const active = tenantsOut.filter(t => t.active);
  const monthBills = tenantsOut.flatMap(t => t.bills.filter(b => b.period === period));
  const monthPaid = payments.filter(p => p.status === 'confirmed' && String(p.paidOn).startsWith(period));
  return {
    property: biz.name, gcash: biz.gcash || '', settings, period,
    units: units.map(u => {
      const here = active.filter(t => t.unitId === u.id);
      return { ...u, tenants: here.map(t => ({ id: t.id, name: t.name, balance: t.balance, lateDays: t.lateDays })), occupied: here.length > 0, billedThisMonth: bills.some(b => b.unitId === u.id && b.period === period) };
    }),
    tenants: tenantsOut,
    month: {
      billed: round(monthBills.reduce((s, b) => s + b.total, 0)),
      collected: round(monthPaid.reduce((s, p) => s + Number(p.amount), 0)),
      outstanding: round(tenantsOut.reduce((s, t) => s + Math.max(0, t.balance), 0)),
      late: active.filter(t => t.lateDays > 0).sort((a, b) => b.lateDays - a.lateDays).map(t => ({ id: t.id, name: t.name, unitName: t.unitName, balance: t.balance, lateDays: t.lateDays })),
      pending: payments.filter(p => p.status === 'pending').map(p => ({ ...p, tenantName: tenantsOut.find(t => t.id === p.tenantId)?.name || '—' })),
      occupied: units.filter(u => active.some(t => t.unitId === u.id)).length,
      units: units.length, people: active.length,
    },
  };
}

/* ---------- make a month's bills from meter readings ---------- */
/*
 * readings: [{ unitId, elec, water }]. Each room is billed once per month: its active tenants
 * share the electricity and metered water equally. Returns new bills, new meter readings, and problems.
 */
export function makeBills({ period, readings, units, tenants, bills, settings }) {
  const create = []; const meters = []; const problems = [];
  for (const r of readings) {
    const u = units.find(x => x.id === r.unitId);
    if (!u) continue;
    if (bills.some(b => b.unitId === u.id && b.period === period)) { problems.push(`${u.name} already has bills for ${periodLabel(period)}.`); continue; }
    const here = tenants.filter(t => t.unitId === u.id && t.active && String(t.moveIn || '') <= `${period}-31`);
    if (!here.length) continue;
    const elec = Number(r.elec); const water = Number(r.water);
    if (!Number.isFinite(elec) || elec < Number(u.elecMeter)) { problems.push(`${u.name}: the new electric reading must be at least ${u.elecMeter}.`); continue; }
    if (settings.waterMode === 'meter' && (!Number.isFinite(water) || water < Number(u.waterMeter))) { problems.push(`${u.name}: the new water reading must be at least ${u.waterMeter}.`); continue; }
    for (const t of here) {
      create.push({
        tenantId: t.id, unitId: u.id, period, rent: round(t.rent), share: here.length,
        elecPrev: Number(u.elecMeter), elecCurr: elec, elecRate: Number(settings.elecRate) || 0,
        waterMode: settings.waterMode, waterPrev: Number(u.waterMeter) || 0, waterCurr: settings.waterMode === 'meter' ? water : Number(u.waterMeter) || 0,
        waterRate: Number(settings.waterRate) || 0, waterFixed: Number(settings.waterFixed) || 0, extras: [],
      });
    }
    meters.push({ unitId: u.id, elec, water: settings.waterMode === 'meter' ? water : Number(u.waterMeter) || 0 });
  }
  return { create, meters, problems };
}
