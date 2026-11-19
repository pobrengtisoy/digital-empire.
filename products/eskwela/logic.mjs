/*
 * RZ Eskwela school logic, shared by the RZ server (worker/eskwela.js), the office console and the
 * parent portal, so a balance or a grade is computed the same way everywhere.
 */

export const round = n => Math.round((Number(n) || 0) * 100) / 100;
export const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const isDate = s => /^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(s));
const DAY = 86_400_000;
const at = iso => { const [y, m, d] = String(iso).split('-').map(Number); return new Date(y, m - 1, d); };

/* Each grade level wears a hood colour, as on academic regalia. Ink is the readable text tone on white. */
export const HOODS = {
  maroon: { name: 'Maroon', hex: '#7a1f2b', ink: '#7a1f2b' },
  emerald: { name: 'Emerald', hex: '#1d6b4f', ink: '#1a5f46' },
  sapphire: { name: 'Sapphire', hex: '#1f4e8c', ink: '#1f4e8c' },
  violet: { name: 'Violet', hex: '#5b3a8c', ink: '#5b3a8c' },
  saffron: { name: 'Saffron', hex: '#b4651c', ink: '#8f4f12' },
  slate: { name: 'Slate', hex: '#3d4b5c', ink: '#3d4b5c' },
  crimson: { name: 'Crimson', hex: '#a3263a', ink: '#9a2336' },
  teal: { name: 'Teal', hex: '#1d6f73', ink: '#185f63' },
};
export const HOOD_KEYS = Object.keys(HOODS);

/* ---------- fees ---------- */
/*
 * plan = { items: [{ label, amount, discountable }], schedule: [{ label, due, pct }] }
 * The discount applies to discountable items (usually tuition). Instalments split the net total by
 * percentage; the last instalment takes any centavo remainder so the schedule always adds up exactly.
 */
export function feeTotals(plan, discountPct = 0) {
  const items = Array.isArray(plan?.items) ? plan.items : [];
  const gross = round(items.reduce((s, i) => s + (Number(i.amount) || 0), 0));
  const base = round(items.filter(i => i.discountable).reduce((s, i) => s + (Number(i.amount) || 0), 0));
  const discount = round(base * Math.min(100, Math.max(0, Number(discountPct) || 0)) / 100);
  return { gross, discount, net: round(gross - discount) };
}
export function buildCharges(plan, discountPct = 0) {
  const { net } = feeTotals(plan, discountPct);
  const sched = (Array.isArray(plan?.schedule) ? plan.schedule : []).filter(s => Number(s.pct) > 0);
  if (!sched.length) return net > 0 ? [{ label: 'School fees', amount: net, due: null }] : [];
  const pctSum = sched.reduce((s, x) => s + Number(x.pct), 0) || 100;
  let left = net;
  return sched.map((s, i) => {
    const amount = i === sched.length - 1 ? round(left) : round(net * Number(s.pct) / pctSum);
    left = round(left - amount);
    return { label: String(s.label || `Instalment ${i + 1}`).slice(0, 60), amount, due: isDate(s.due) ? s.due : null };
  });
}

/* ---------- a student's account ---------- */
/*
 * Confirmed payments settle the earliest charges first (by due date, then creation). Returns each charge
 * with what is paid and left, whether it is late and by how many days, and the account totals.
 */
export function ledger(charges, payments, today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const sorted = charges.slice().sort((a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const confirmed = round(payments.filter(p => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount || 0), 0));
  let pool = confirmed;
  const rows = sorted.map(c => {
    const paid = round(Math.min(pool, c.amount)); pool = round(pool - paid);
    const left = round(c.amount - paid);
    const lateDays = left > 0 && c.due && t > at(c.due) ? Math.round((t - at(c.due)) / DAY) : 0;
    return { ...c, paid, left, lateDays, status: left <= 0 ? 'paid' : lateDays ? 'late' : paid > 0 ? 'partial' : 'open' };
  });
  const billed = round(sorted.reduce((s, c) => s + c.amount, 0));
  const open = rows.filter(r => r.left > 0);
  return {
    charges: rows, billed, paid: confirmed, balance: round(billed - confirmed),
    pending: round(payments.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount || 0), 0)),
    overdue: round(open.filter(r => r.lateDays).reduce((s, r) => s + r.left, 0)),
    lateDays: open.reduce((m, r) => Math.max(m, r.lateDays), 0),
    next: open.find(r => r.due) || open[0] || null,
  };
}

/* ---------- grades ---------- */
export const QUARTERS = [1, 2, 3, 4];
/* The final grade of a subject is the average of four quarter grades, shown once all four are in. */
export function finalGrade(q) {
  const v = QUARTERS.map(n => q?.[n]).filter(x => typeof x === 'number' && Number.isFinite(x));
  if (v.length < 4) return null;
  return Math.round(v.reduce((s, x) => s + x, 0) / 4);
}
export function generalAverage(finals) {
  const v = finals.filter(x => typeof x === 'number');
  if (!v.length || v.length < finals.length) return null;
  return round(v.reduce((s, x) => s + x, 0) / v.length);
}
export function descriptor(g) {
  if (typeof g !== 'number') return '';
  if (g >= 90) return 'Outstanding';
  if (g >= 85) return 'Very satisfactory';
  if (g >= 80) return 'Satisfactory';
  if (g >= 75) return 'Fairly satisfactory';
  return 'Did not meet expectations';
}
export const remark = g => (typeof g !== 'number' ? '' : g >= 75 ? 'Passed' : 'Failed');

/* ---------- reminders ---------- */
export function reminder({ school, student, guardian, balance, overdue, lateDays, link, gcash }) {
  const peso = n => `₱${round(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `Good day${guardian ? `, ${guardian}` : ''}. This is ${school}. ${student}’s account shows a balance of ${peso(balance)}`
    + `${overdue > 0 ? `, of which ${peso(overdue)} is past due${lateDays ? ` (${lateDays} day${lateDays > 1 ? 's' : ''})` : ''}` : ''}.`
    + `${gcash ? ` You may pay by GCash or Maya to ${gcash}.` : ''} View the statement and send your payment reference here: ${link}\nThank you.`;
}
