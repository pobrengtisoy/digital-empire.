/* RZ Upa tenant statement: ?t=<token> from the RZ server, or ?demo=<tenant id> from the demo in this browser. */
import { buildState, periodLabel, isoDay } from './logic.mjs';

const { $, el, peso, copy } = window.RZ;
const q = new URLSearchParams(location.search);
const token = q.get('t');
const demoId = q.get('demo');
const KEY = 'rz-upa-demo-v1';
const php = n => peso(n);
const ordinal = n => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1) && n % 10] || 'th'}`;
let V = null;

function demoView() {
  const raw = window.RZ.load(KEY, null);
  if (!raw) return null;
  const S = buildState(raw, new Date());
  const t = S.tenants.find(x => x.id === demoId);
  if (!t) return null;
  return { property: S.property, gcash: S.gcash, tenant: t.name, unit: t.unitName, dueDay: t.dueDay, active: t.active, balance: t.balance, pending: t.pending, lateDays: t.lateDays, nextDue: t.nextDue, bills: t.bills.slice(0, 12), payments: t.payments.filter(p => p.status !== 'rejected').slice(0, 24) };
}

function line(label, value) { return el('div', {}, el('dt', {}, label), el('dd', {}, value)); }
function render() {
  document.title = `Statement — ${V.property}`;
  $('#sProp').textContent = V.property; $('#sProp2').textContent = V.property;
  $('#sName').textContent = V.tenant; $('#sUnit').textContent = V.unit;
  $('#sBal').textContent = V.balance < 0 ? `${php(-V.balance)} advance` : php(Math.max(0, V.balance));
  $('#sBal').className = `big${V.balance > 0 ? ' owe' : ''}`;
  $('#sDue').textContent = V.balance > 0
    ? `${V.nextDue ? `Oldest unpaid bill was due ${V.nextDue}. ` : ''}Rent is due every ${ordinal(V.dueDay)} of the month.${V.pending ? ` ${php(V.pending)} you sent is waiting for your landlord to check.` : ''}`
    : `Rent is due every ${ordinal(V.dueDay)} of the month.${V.pending ? ` ${php(V.pending)} you sent is waiting for your landlord to check.` : ''}`;
  $('#sLate').hidden = !V.lateDays; $('#sLate').textContent = V.lateDays ? `Late ${V.lateDays} day${V.lateDays > 1 ? 's' : ''}` : '';
  $('#sOk').hidden = V.balance > 0 || !V.bills.length;
  $('#sBills').replaceChildren(...(V.bills.length ? V.bills.map(b => el('li', { class: `soa-bill ${b.status}` },
    el('div', { class: 'sb-top' },
      el('h3', {}, periodLabel(b.period)),
      el('b', {}, php(b.total)),
      el('span', { class: `pill ${b.status}` }, b.status === 'paid' ? 'Paid' : b.status === 'partial' ? `${php(b.left)} left` : b.lateDays ? `Late · due ${b.due}` : `Due ${b.due}`)),
    el('dl', { class: 'sb-lines' },
      line('Rent', php(b.rent)),
      line(`Electricity · ${b.elecPrev} → ${b.elecCurr} = ${b.elecUse} kWh × ₱${b.elecRate}${b.share > 1 ? ` ÷ ${b.share}` : ''}`, php(b.elec)),
      b.waterMode === 'meter' ? line(`Water · ${b.waterUse} m³ × ₱${b.waterRate}${b.share > 1 ? ` ÷ ${b.share}` : ''}`, php(b.water)) : null,
      b.waterMode === 'fixed' ? line('Water', php(b.water)) : null,
      ...(b.extras || []).map(x => line(x.label, php(x.amount)))))) : [el('li', { class: 'empty' }, 'No bills yet.')]));
  $('#sPays').replaceChildren(...(V.payments.length ? V.payments.map(p => el('li', { class: 'row' },
    el('div', { class: 'row-main' }, el('b', {}, p.paidOn), el('span', {}, `${p.method}${p.reference ? ` · Ref ${p.reference}` : ''}`)),
    el('span', { class: `pill ${p.status === 'confirmed' ? 'paid' : 'partial'}` }, p.status === 'confirmed' ? 'Received' : 'Being checked'),
    el('b', { class: 'amt' }, php(p.amount)))) : [el('li', { class: 'empty' }, 'No payments yet.')]));
  $('#sGcash').textContent = V.gcash || 'the number your landlord gave you';
  $('#copyNum').hidden = !V.gcash;
  $('#sPay').hidden = !V.active && V.balance <= 0;
  const f = $('#sForm').elements;
  const toPay = Math.round((V.balance - V.pending) * 100) / 100;
  if (!f.amount.value && toPay > 0) f.amount.value = toPay;
  $('#soa').hidden = false;
}

function missing(msg) { $('#missing').hidden = false; if (msg) $('#missingText').textContent = msg; }

async function load() {
  if (demoId) { $('#strip').hidden = false; V = demoView(); return V ? render() : missing('This demo tenant is not on this device. Open it from the RZ Upa demo.'); }
  if (!token || !/^[a-f0-9]{48}$/.test(token)) return missing();
  try {
    const res = await fetch(`/api/public/upa/${token}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return missing(data.error);
    V = data; render();
  } catch { missing('Could not load your statement. Check your connection and try again.'); }
}

$('#copyNum').addEventListener('click', async () => { const ok = await copy(String(V.gcash).replace(/\s+/g, '')); $('#copyNum').textContent = ok ? 'Copied' : V.gcash; setTimeout(() => { $('#copyNum').textContent = 'Copy number'; }, 1800); });

$('#sForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.elements; const err = $('#sErr'); const btn = $('#sSend');
  err.textContent = ''; $('#sOkMsg').textContent = '';
  const body = { amount: Number(f.amount.value), method: f.method.value, reference: f.reference.value.replace(/\s+/g, '').toUpperCase() };
  if (!(body.amount >= 1)) { err.textContent = 'Enter the amount you sent.'; f.amount.focus(); return; }
  if (!/^[A-Z0-9-]{4,40}$/.test(body.reference)) { err.textContent = 'Enter the reference number from your receipt.'; f.reference.focus(); return; }
  btn.disabled = true;
  try {
    if (demoId) {
      const raw = window.RZ.load(KEY, null);
      raw.payments.push({ id: Math.random().toString(36).slice(2, 10), tenantId: demoId, amount: body.amount, paidOn: isoDay(new Date()), method: body.method, reference: body.reference, note: 'Sent by tenant', status: 'pending', createdAt: new Date().toISOString() });
      window.RZ.save(KEY, raw); V = demoView();
    } else {
      const res = await fetch(`/api/public/upa/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send. Please try again.');
      V = data;
    }
    f.reference.value = ''; f.amount.value = '';
    render();
    $('#sOkMsg').textContent = 'Sent. Your landlord will check it and mark it received.';
  } catch (ex) { err.textContent = ex.message; }
  finally { btn.disabled = false; }
});

load();
