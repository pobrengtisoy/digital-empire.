/* RZ Tindahan POS — the counting rules, shared by the page and the server (worker/tindahan.js).
   Change sale totals, shift cash counts or reports here only. */

export const METHODS = ['cash', 'gcash', 'maya', 'utang'];
export const METHOD_NAME = { cash: 'Cash', gcash: 'GCash', maya: 'Maya', utang: 'Utang' };
export const round = n => Math.round((Number(n) || 0) * 100) / 100;

/* The calendar day in the Philippines (UTC+8) for an ISO time. */
export const manilaDay = iso => new Date(Date.parse(iso) + 8 * 3_600_000).toISOString().slice(0, 10);

/* Totals of one sale. The discount is an amount, never more than the subtotal. */
export function saleTotals(sale) {
  const lines = sale.lines || [];
  const subtotal = round(lines.reduce((s, l) => s + l.price * l.qty, 0));
  const discount = Math.min(subtotal, round(sale.discount || 0));
  const total = round(subtotal - discount);
  const cost = round(lines.reduce((s, l) => s + (l.cost || 0) * l.qty, 0));
  const change = sale.method === 'cash' && sale.cash ? round(sale.cash - total) : 0;
  return { subtotal, discount, total, cost, profit: round(total - cost), change, items: lines.reduce((s, l) => s + l.qty, 0) };
}

/* Expected cash in the drawer for a shift: the opening cash plus cash sales that were not voided. */
export function shiftSummary(shift, sales) {
  const mine = sales.filter(s => s.shiftId === shift.id && s.status !== 'void');
  const by = Object.fromEntries(METHODS.map(m => [m, 0]));
  mine.forEach(s => { by[s.method] = round(by[s.method] + saleTotals(s).total); });
  const expected = round((shift.openingCash || 0) + by.cash);
  const counted = shift.countedCash == null ? null : round(shift.countedCash);
  return { sales: mine.length, byMethod: by, total: round(METHODS.reduce((s, m) => s + by[m], 0)), expected, counted, diff: counted == null ? null : round(counted - expected) };
}

/* A report over sales between two Manila days (inclusive). */
export function report(sales, from, to) {
  const list = sales.filter(s => s.status !== 'void').filter(s => { const d = manilaDay(s.at); return d >= from && d <= to; });
  const byMethod = Object.fromEntries(METHODS.map(m => [m, 0]));
  const byStaff = {}; const byItem = {};
  let revenue = 0; let cost = 0; let discounts = 0;
  list.forEach(s => {
    const t = saleTotals(s);
    revenue += t.total; cost += t.cost; discounts += t.discount;
    byMethod[s.method] = round(byMethod[s.method] + t.total);
    byStaff[s.staffId] = round((byStaff[s.staffId] || 0) + t.total);
    s.lines.forEach(l => { const k = l.itemId || l.name; const x = byItem[k] || (byItem[k] = { name: l.name, qty: 0, amount: 0 }); x.qty += l.qty; x.amount = round(x.amount + l.price * l.qty); });
  });
  const top = Object.values(byItem).sort((a, b) => b.qty - a.qty || b.amount - a.amount);
  return { count: list.length, revenue: round(revenue), cost: round(cost), profit: round(revenue - cost), discounts: round(discounts), byMethod, byStaff, top, voids: sales.filter(s => s.status === 'void' && manilaDay(s.at) >= from && manilaDay(s.at) <= to).length };
}

/* One line of a pasted product list: "name, price, cost, stock, barcode" (tabs or commas; cost, stock and barcode optional). */
export function parseImportLine(line) {
  const parts = String(line).split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(p => p.trim().replace(/^"|"$/g, '').trim());
  if (!parts[0] || /^(name|item|pangalan)$/i.test(parts[0])) return null;
  const num = v => { const t = String(v ?? '').replace(/[₱,\s]/g, ''); if (!t) return null; const n = Number(t); return Number.isFinite(n) && n >= 0 ? n : null; };
  const price = num(parts[1]);
  if (price == null) return { error: `“${parts[0]}”: no price` };
  return { name: parts[0], price: round(price), cost: round(num(parts[2]) ?? 0), stock: Math.round(num(parts[3]) ?? 0), barcode: String(parts[4] || '').replace(/\s+/g, '') };
}
