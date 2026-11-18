/* RZ Upa console. Demo keeps a sample boarding house in this browser; ?owner opens the real rent book. */
import { buildState, makeBills, computeBill, periodOf, periodLabel, shiftPeriod, isoDay, reminder } from './logic.mjs';

const { $, $$, el, peso, copy } = window.RZ;
const OWNER = new URLSearchParams(location.search).has('owner');
const KEY = 'rz-upa-demo-v1';
const php = n => peso(n, true);
const php2 = n => peso(n);
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');

/* ---------- demo data: a small boarding house, two months in ---------- */
function seed() {
  const now = new Date(); const cur = periodOf(now); const prev = shiftPeriod(cur, -1);
  const units = [
    { id: 'u1', name: 'Room 1', rent: 3500, elecMeter: 0, waterMeter: 0, sort: 0 },
    { id: 'u2', name: 'Room 2', rent: 3500, elecMeter: 0, waterMeter: 0, sort: 1 },
    { id: 'u3', name: 'Room 3 · bedspace', rent: 1800, elecMeter: 0, waterMeter: 0, sort: 2 },
    { id: 'u4', name: 'Studio 4', rent: 6500, elecMeter: 0, waterMeter: 0, sort: 3 },
    { id: 'u5', name: 'Room 5', rent: 3800, elecMeter: 2210, waterMeter: 140, sort: 4 },
  ];
  const T = (id, unitId, name, mobile, rent, dueDay, deposit, moveIn) => ({ id, unitId, name, mobile, rent, dueDay, deposit, moveIn, active: true, token: id, createdAt: moveIn });
  const tenants = [
    T('t1', 'u1', 'Ana Villanueva', '0917 555 0101', 3500, 5, 3500, '2025-06-01'),
    T('t2', 'u2', 'Paolo Reyes', '0918 555 0102', 3500, 10, 3500, '2026-02-15'),
    T('t3', 'u3', 'Kim Santos', '0919 555 0103', 1800, 5, 1800, '2026-06-01'),
    T('t4', 'u3', 'Bea Lim', '0920 555 0104', 1800, 5, 1800, '2026-06-01'),
    T('t5', 'u3', 'Joy Cruz', '0921 555 0105', 1800, 5, 1800, '2026-08-01'),
    T('t6', 'u4', 'Mark & Liza Gomez', '0922 555 0106', 6500, 1, 13000, '2025-11-01'),
  ];
  const settings = { elecRate: 13.5, waterMode: 'meter', waterRate: 45, waterFixed: 150 };
  const reads = { u1: [1520, 1608, 1702], u2: [3310, 3405, 3486], u3: [880, 1031, 1190], u4: [5120, 5341, 5560] };
  const water = { u1: [210, 216, 223], u2: [330, 337, 343], u3: [95, 109, 124], u4: [512, 528, 545] };
  const bills = [];
  [[prev, 0], [cur, 1]].forEach(([period, i]) => {
    Object.keys(reads).forEach(u => {
      const here = tenants.filter(t => t.unitId === u);
      here.forEach(t => bills.push({ id: uid(), tenantId: t.id, unitId: u, period, rent: t.rent, share: here.length, elecPrev: reads[u][i], elecCurr: reads[u][i + 1], elecRate: 13.5, waterMode: 'meter', waterPrev: water[u][i], waterCurr: water[u][i + 1], waterRate: 45, waterFixed: 150, extras: u === 'u4' && i === 1 ? [{ label: 'Aircon cleaning', amount: 450 }] : [] }));
    });
  });
  Object.keys(reads).forEach(u => { const x = units.find(y => y.id === u); x.elecMeter = reads[u][2]; x.waterMeter = water[u][2]; });
  const total = (tid, p) => computeBill(bills.find(b => b.tenantId === tid && b.period === p)).total;
  const day = (p, d) => `${p}-${String(d).padStart(2, '0')}`;
  const P = (tenantId, amount, paidOn, method, reference, status = 'confirmed') => ({ id: uid(), tenantId, amount, paidOn, method, reference, note: '', status, createdAt: paidOn });
  const payments = [
    ...tenants.map(t => P(t.id, total(t.id, prev), day(prev, Math.min(t.dueDay + 1, 28)), t.id === 't6' ? 'Bank' : 'GCash', `40${t.id.slice(1)}118${t.id.slice(1)}20`)),
    P('t1', total('t1', cur), day(cur, 4), 'GCash', '4021889001'),
    P('t6', total('t6', cur), day(cur, 1), 'Bank', 'BPI-77120'),
    P('t3', 1000, day(cur, 6), 'Cash', ''),
    P('t4', total('t4', cur), day(cur, 7), 'GCash', '4011223344', 'pending'),
  ];
  return { biz: { name: 'Casa Rosario Boarding House', gcash: '0917 123 4567' }, settings, units, tenants, bills, payments };
}

/* ---------- stores ---------- */
let demo = window.RZ.load(KEY, null);
if (!demo || !Array.isArray(demo.units)) { demo = seed(); window.RZ.save(KEY, demo); }
const out = () => { window.RZ.save(KEY, demo); return buildState(demo, new Date()); };
const need = (cond, msg) => { if (!cond) throw new Error(msg); };
const demoStore = {
  load: async () => out(),
  saveSettings: async b => { demo.settings = { elecRate: +b.elecRate || 0, waterMode: b.waterMode, waterRate: +b.waterRate || 0, waterFixed: +b.waterFixed || 0 }; demo.biz = { name: b.name, gcash: b.gcash }; return out(); },
  addUnit: async b => { need(String(b.name).trim(), 'Name the room, like Room 1 or Unit 2A.'); demo.units.push({ id: uid(), name: b.name.trim(), rent: +b.rent || 0, elecMeter: +b.elecMeter || 0, waterMeter: +b.waterMeter || 0, sort: demo.units.length }); return out(); },
  editUnit: async (id, b) => { Object.assign(demo.units.find(u => u.id === id), { name: b.name.trim(), rent: +b.rent || 0, elecMeter: +b.elecMeter || 0, waterMeter: +b.waterMeter || 0 }); return out(); },
  delUnit: async id => { need(!demo.tenants.some(t => t.unitId === id && t.active), 'Move the tenants out of this room first.'); demo.units = demo.units.filter(u => u.id !== id); return out(); },
  addTenant: async b => { need(String(b.name).trim(), 'Enter the tenant’s name.'); demo.tenants.push({ id: uid(), unitId: b.unitId, name: b.name.trim(), mobile: b.mobile, rent: +b.rent || 0, dueDay: +b.dueDay || 1, deposit: +b.deposit || 0, moveIn: b.moveIn, active: true, token: '', createdAt: new Date().toISOString() }); const t = demo.tenants[demo.tenants.length - 1]; t.token = t.id; return out(); },
  editTenant: async (id, b) => { const t = demo.tenants.find(x => x.id === id); Object.assign(t, b.active == null ? { name: b.name.trim(), unitId: b.unitId, mobile: b.mobile, rent: +b.rent || 0, dueDay: +b.dueDay || 1, deposit: +b.deposit || 0 } : { active: !!b.active }); return out(); },
  delTenant: async id => { need(!demo.bills.some(b => b.tenantId === id) && !demo.payments.some(p => p.tenantId === id), 'This tenant has bills or payments. Mark them as moved out instead, so your records stay.'); demo.tenants = demo.tenants.filter(t => t.id !== id); return out(); },
  makeBills: async (period, readings) => {
    const r = makeBills({ period, readings, units: demo.units, tenants: demo.tenants, bills: demo.bills, settings: demo.settings });
    need(r.create.length, r.problems[0] || 'No occupied rooms to bill for that month.');
    r.create.forEach(b => demo.bills.push({ ...b, id: uid() }));
    r.meters.forEach(m => Object.assign(demo.units.find(u => u.id === m.unitId), { elecMeter: m.elec, waterMeter: m.water }));
    return { ...out(), created: r.create.length, problems: r.problems };
  },
  editBill: async (id, b) => { Object.assign(demo.bills.find(x => x.id === id), { rent: +b.rent || 0, extras: b.extras }); return out(); },
  delBill: async id => {
    const bill = demo.bills.find(x => x.id === id); demo.bills = demo.bills.filter(x => x.id !== id);
    if (!demo.bills.some(x => x.unitId === bill.unitId && x.period >= bill.period)) Object.assign(demo.units.find(u => u.id === bill.unitId) || {}, { elecMeter: bill.elecPrev, waterMeter: bill.waterPrev });
    return out();
  },
  addPayment: async b => { need(+b.amount > 0, 'Enter the amount paid.'); demo.payments.push({ id: uid(), tenantId: b.tenantId, amount: +b.amount, paidOn: b.paidOn, method: b.method, reference: b.reference, note: b.note, status: 'confirmed', createdAt: new Date().toISOString() }); return out(); },
  setPayment: async (id, status) => { demo.payments.find(p => p.id === id).status = status; return out(); },
  delPayment: async id => { demo.payments = demo.payments.filter(p => p.id !== id); return out(); },
  link: token => new URL(`tenant.html?demo=${encodeURIComponent(token)}`, location.href).href,
};

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, { method: opts.method || 'GET', credentials: 'same-origin', headers: opts.body ? { 'content-type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = {}; try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return data;
}
let me = null;
const ownerStore = {
  load: () => api('/upa'),
  async saveSettings(b) {
    const cur = me.business;
    const { business } = await api('/business', { method: 'PUT', body: { name: b.name, gcash: b.gcash, deliveryFee: cur.deliveryFee, tagline: cur.tagline, hours: cur.hours, accepting: cur.accepting, notifyOn: cur.notifyOn, notifyEmail: cur.notifyEmail } });
    me.business = business;
    return api('/upa/settings', { method: 'PUT', body: { elecRate: b.elecRate, waterMode: b.waterMode, waterRate: b.waterRate, waterFixed: b.waterFixed } });
  },
  addUnit: b => api('/upa/units', { method: 'POST', body: b }),
  editUnit: (id, b) => api(`/upa/units/${id}`, { method: 'PATCH', body: b }),
  delUnit: id => api(`/upa/units/${id}`, { method: 'DELETE' }),
  addTenant: b => api('/upa/tenants', { method: 'POST', body: b }),
  editTenant: (id, b) => api(`/upa/tenants/${id}`, { method: 'PATCH', body: b }),
  delTenant: id => api(`/upa/tenants/${id}`, { method: 'DELETE' }),
  makeBills: (period, readings) => api('/upa/bills', { method: 'POST', body: { period, readings } }),
  editBill: (id, b) => api(`/upa/bills/${id}`, { method: 'PATCH', body: b }),
  delBill: id => api(`/upa/bills/${id}`, { method: 'DELETE' }),
  addPayment: b => api('/upa/payments', { method: 'POST', body: b }),
  setPayment: (id, status) => api(`/upa/payments/${id}`, { method: 'PATCH', body: { status } }),
  delPayment: id => api(`/upa/payments/${id}`, { method: 'DELETE' }),
  link: token => new URL(`tenant.html?t=${encodeURIComponent(token)}`, location.href).href,
};
const store = OWNER ? ownerStore : demoStore;

/* ---------- state ---------- */
let S = null; let tab = 'overview'; let billPeriod = periodOf(new Date()); let openTenant = null;
let issued = 0; let drawn = 0;

function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = `toast show${bad ? ' bad' : ''}`; clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 3200); }
async function run(fn, errEl) {
  const seq = ++issued;
  try {
    if (errEl) errEl.textContent = '';
    const r = await fn();
    if (r && r.units && seq > drawn) { drawn = seq; S = r; render(); }
    return r || true;
  } catch (e) {
    if (e.status === 401 && OWNER) { showAuth(); return null; }
    if (errEl) errEl.textContent = e.message; else toast(e.message, true);
    return null;
  }
}
const tenantById = id => S.tenants.find(t => t.id === id);

/* ---------- render ---------- */
function render() {
  $('#propName').textContent = S.property;
  document.title = OWNER ? `${S.property} — RZ Upa` : document.title;
  renderOverview(); renderRooms(); renderBilling(); renderPayments();
  if (openTenant && $('#cardDlg').open) renderCard(openTenant);
}

function lateStamp(days) { return el('span', { class: 'stamp late' }, `Late ${days} day${days > 1 ? 's' : ''}`); }

function renderOverview() {
  const m = S.month;
  $('#ovMonth').textContent = periodLabel(S.period);
  $('#mBilled').textContent = php(m.billed);
  $('#mCollected').textContent = php(m.collected);
  $('#mOutstanding').textContent = php(m.outstanding);
  $('#mOcc').textContent = `${m.occupied} of ${m.units}`;
  const unbilled = S.units.some(u => u.occupied && !u.billedThisMonth);
  $('#billNudge').hidden = !unbilled;
  $('#nudgeMonth').textContent = periodLabel(S.period);
  $('#pendingBlock').hidden = !m.pending.length;
  $('#pendingList').replaceChildren(...m.pending.map(p => el('li', { class: 'row' },
    el('div', { class: 'row-main' }, el('b', {}, p.tenantName), el('span', {}, `${p.method} · Ref ${p.reference || '—'} · ${p.paidOn}`)),
    el('b', { class: 'amt' }, php2(p.amount)),
    el('div', { class: 'row-act' },
      el('button', { type: 'button', class: 'btn small', onclick: () => run(() => store.setPayment(p.id, 'confirmed')).then(r => r && toast(`Confirmed ${php2(p.amount)} from ${p.tenantName}.`)) }, 'Confirm'),
      el('button', { type: 'button', class: 'btn small ghost', onclick: () => { if (confirm(`Reject this payment from ${p.tenantName}? Only do this if it is not in your account.`)) run(() => store.setPayment(p.id, 'rejected')); } }, 'Reject')))));
  $('#lateList').replaceChildren(...m.late.map(t => el('li', { class: 'row' },
    el('button', { type: 'button', class: 'row-main as-link', onclick: () => openCard(t.id) }, el('b', {}, t.name), el('span', {}, t.unitName)),
    lateStamp(t.lateDays),
    el('b', { class: 'amt owe' }, php2(t.balance)),
    el('div', { class: 'row-act' }, el('button', { type: 'button', class: 'btn small ghost', onclick: () => copyReminder(t.id) }, 'Copy reminder')))));
  $('#lateEmpty').hidden = m.late.length > 0;
}

function renderRooms() {
  $('#doors').replaceChildren(...S.units.map(u => el('li', { class: `door${u.occupied ? '' : ' vacant'}` },
    el('div', { class: 'plate' },
      el('h3', {}, u.name),
      el('span', {}, `${php(u.rent)} a month`)),
    el('p', { class: 'meters' }, el('span', {}, `⚡ ${u.elecMeter} kWh`), S.settings.waterMode === 'meter' ? el('span', {}, `💧 ${u.waterMeter} m³`) : null),
    u.tenants.length
      ? el('ul', { class: 'occupants' }, ...u.tenants.map(t => el('li', {},
        el('button', { type: 'button', class: 'occ', onclick: () => openCard(t.id) },
          el('span', {}, t.name),
          t.balance > 0 ? el('b', { class: t.lateDays ? 'owe' : '' }, php(t.balance)) : el('b', { class: 'paid' }, 'Paid')))))
      : el('p', { class: 'vacant-tag' }, 'Vacant'),
    el('div', { class: 'door-act' },
      el('button', { type: 'button', class: 'link', onclick: () => openTenantForm(null, u.id) }, '+ Tenant'),
      el('button', { type: 'button', class: 'link', onclick: () => openRoomForm(u) }, 'Edit room')))));
  $('#roomsEmpty').hidden = S.units.length > 0;
  const past = S.tenants.filter(t => !t.active);
  $('#pastBox').hidden = !past.length;
  $('#pastCount').textContent = past.length;
  $('#pastList').replaceChildren(...past.map(t => el('li', { class: 'row' },
    el('button', { type: 'button', class: 'row-main as-link', onclick: () => openCard(t.id) }, el('b', {}, t.name), el('span', {}, t.unitName)),
    el('b', { class: `amt${t.balance > 0 ? ' owe' : ''}` }, t.balance > 0 ? php2(t.balance) : 'Settled'))));
}

/* Meter sheet */
function renderBilling() {
  const sel = $('#billPeriod');
  const opts = [-2, -1, 0, 1].map(n => shiftPeriod(periodOf(new Date()), n));
  if (sel.options.length !== opts.length) sel.replaceChildren(...opts.map(p => el('option', { value: p }, periodLabel(p))));
  sel.value = billPeriod;
  const st = S.settings; const wm = st.waterMode;
  $('#rateNote').textContent = `Electricity ₱${st.elecRate}/kWh${wm === 'meter' ? ` · Water ₱${st.waterRate}/m³` : wm === 'fixed' ? ` · Water ₱${st.waterFixed} fixed per tenant` : ' · Water included in rent'}. Shared rooms split the meter equally. Change rates in Settings.`;
  $('#readTable').classList.toggle('no-water', wm !== 'meter');
  const allBills = S.tenants.flatMap(t => t.bills.map(b => ({ ...b, tenantName: t.name, tenantId: t.id })));
  const rooms = S.units.filter(u => u.tenants.length && !allBills.some(b => b.unitId === u.id && b.period === billPeriod));
  const rows = rooms.map(u => {
    const tr = el('tr', { dataset: { unit: u.id } });
    const elec = el('input', { type: 'number', min: String(u.elecMeter), step: '0.01', inputmode: 'decimal', 'aria-label': `New electric reading for ${u.name}`, placeholder: String(u.elecMeter) });
    const water = el('input', { type: 'number', min: String(u.waterMeter), step: '0.01', inputmode: 'decimal', 'aria-label': `New water reading for ${u.name}`, placeholder: String(u.waterMeter) });
    const each = el('td', { class: 'num each' }, '—');
    const use = el('span', { class: 'use' });
    const wuse = el('span', { class: 'use' });
    const calc = () => {
      const share = u.tenants.length;
      const t0 = S.tenants.find(t => t.id === u.tenants[0].id);
      if (elec.value === '') { each.textContent = '—'; use.textContent = ''; wuse.textContent = ''; return; }
      const b = computeBill({ rent: t0.rent, share, elecPrev: u.elecMeter, elecCurr: +elec.value, elecRate: st.elecRate, waterMode: wm, waterPrev: u.waterMeter, waterCurr: water.value === '' ? u.waterMeter : +water.value, waterRate: st.waterRate, waterFixed: st.waterFixed });
      const bad = +elec.value < u.elecMeter || (wm === 'meter' && water.value !== '' && +water.value < u.waterMeter);
      use.textContent = bad ? 'too low' : `${b.elecUse} kWh`;
      wuse.textContent = wm === 'meter' && water.value !== '' ? `${b.waterUse} m³` : '';
      each.textContent = bad ? 'Check reading' : `${php(b.total)}${share > 1 ? ' each' : ''}`;
      tr.classList.toggle('bad', bad);
    };
    elec.addEventListener('input', calc); water.addEventListener('input', calc);
    tr.append(
      el('th', { scope: 'row' }, el('b', {}, u.name), el('span', { class: 'who' }, u.tenants.map(t => t.name).join(', '))),
      el('td', {}, el('span', { class: 'prev' }, `${u.elecMeter} →`), elec, use),
      el('td', { class: 'w-col' }, el('span', { class: 'prev' }, `${u.waterMeter} →`), water, wuse),
      each);
    return tr;
  });
  $('#readRows').replaceChildren(...rows);
  $('#readEmpty').hidden = rooms.length > 0;
  $('#readTable').hidden = !rooms.length;
  $('#makeBills').hidden = !rooms.length;
  $('#makeBills').textContent = `Create bills for ${periodLabel(billPeriod)}`;
  $('#billsMonth').textContent = periodLabel(billPeriod);
  const monthBills = allBills.filter(b => b.period === billPeriod).sort((a, b) => a.unitId.localeCompare(b.unitId));
  $('#billList').replaceChildren(...monthBills.map(b => el('li', { class: 'row' },
    el('div', { class: 'row-main' }, el('b', {}, b.tenantName), el('span', {}, breakdown(b))),
    el('span', { class: `pill ${b.status}` }, b.status === 'paid' ? 'Paid' : b.status === 'partial' ? `${php(b.left)} left` : 'Unpaid'),
    el('b', { class: 'amt' }, php2(b.total)),
    el('div', { class: 'row-act' }, el('button', { type: 'button', class: 'btn small ghost', onclick: () => openBill(b) }, 'Edit')))));
  $('#billsEmpty').hidden = monthBills.length > 0;
}

function breakdown(b) {
  const parts = [`Rent ${php(b.rent)}`, `Electric ${b.elecUse} kWh ${php(b.elec)}`];
  if (b.waterMode === 'meter') parts.push(`Water ${b.waterUse} m³ ${php(b.water)}`);
  else if (b.waterMode === 'fixed') parts.push(`Water ${php(b.water)}`);
  (b.extras || []).forEach(x => parts.push(`${x.label} ${php(x.amount)}`));
  if (b.share > 1) parts.push(`meter shared by ${b.share}`);
  return parts.join(' · ');
}

function renderPayments() {
  const sel = $('#payForm').elements.tenantId;
  const keep = sel.value;
  const active = S.tenants.filter(t => t.active || t.balance > 0);
  sel.replaceChildren(el('option', { value: '' }, 'Choose a tenant'), ...active.map(t => el('option', { value: t.id }, `${t.name} · ${t.unitName}${t.balance > 0 ? ` · owes ${php(t.balance)}` : ''}`)));
  sel.value = active.some(t => t.id === keep) ? keep : '';
  const all = S.tenants.flatMap(t => t.payments.map(p => ({ ...p, tenantName: t.name, unitName: t.unitName }))).sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  $('#stubs').replaceChildren(...all.slice(0, 120).map((p, i) => el('li', { class: `stub ${p.status} ${i % 2 ? 'pink' : 'yellow'}` },
    el('p', { class: 'stub-no' }, `No. ${String(all.length - i).padStart(4, '0')}`),
    el('p', { class: 'stub-amt' }, php2(p.amount)),
    el('p', { class: 'stub-who' }, el('b', {}, p.tenantName), ` · ${p.unitName}`),
    el('p', { class: 'stub-meta' }, `${p.paidOn} · ${p.method}${p.reference ? ` · Ref ${p.reference}` : ''}${p.note ? ` · ${p.note}` : ''}`),
    p.status !== 'confirmed' ? el('span', { class: `stamp ${p.status === 'pending' ? 'wait' : 'void'}` }, p.status === 'pending' ? 'To check' : 'Rejected') : el('span', { class: 'stamp ok' }, 'Received'),
    el('button', { type: 'button', class: 'stub-x', 'aria-label': `Delete payment ${php2(p.amount)} from ${p.tenantName}`, onclick: () => { if (confirm(`Delete this ${php2(p.amount)} payment from ${p.tenantName}?`)) run(() => store.delPayment(p.id)); } }, '×'))));
  $('#stubsEmpty').hidden = all.length > 0;
}

/* ---------- tenant card ---------- */
function openCard(id) { openTenant = id; renderCard(id); if (!$('#cardDlg').open) $('#cardDlg').showModal(); }
function renderCard(id) {
  const t = tenantById(id); if (!t) { $('#cardDlg').close(); return; }
  $('#cardRoom').textContent = t.active ? t.unitName : `${t.unitName} · moved out`;
  $('#cardName').textContent = t.name;
  $('#cardBal').textContent = t.balance < 0 ? `${php2(-t.balance)} advance` : php2(t.balance);
  $('#cardBal').className = t.balance > 0 ? 'owe' : 'paid';
  $('#cardLate').hidden = !t.lateDays; $('#cardLate').textContent = t.lateDays ? `Late ${t.lateDays} day${t.lateDays > 1 ? 's' : ''}` : '';
  $('#cardMeta').textContent = [t.mobile, `Rent ${php(t.rent)} due every ${ordinal(t.dueDay)}`, `Deposit ${php(t.deposit)}`, `Since ${t.moveIn}`, t.pending ? `${php(t.pending)} waiting for your check` : ''].filter(Boolean).join(' · ');
  $('#cardOpen').href = store.link(t.token);
  $('#cardNote').textContent = '';
  $('#cardBills').replaceChildren(...(t.bills.length ? t.bills.map(b => el('li', { class: 'row' },
    el('div', { class: 'row-main' }, el('b', {}, periodLabel(b.period)), el('span', {}, breakdown(b))),
    b.lateDays ? lateStamp(b.lateDays) : el('span', { class: `pill ${b.status}` }, b.status === 'paid' ? 'Paid' : b.status === 'partial' ? `${php(b.left)} left` : `Due ${b.due}`),
    el('b', { class: 'amt' }, php2(b.total)))) : [el('li', { class: 'empty' }, 'No bills yet.')]));
  $('#cardPays').replaceChildren(...(t.payments.length ? t.payments.map(p => el('li', { class: 'row' },
    el('div', { class: 'row-main' }, el('b', {}, p.paidOn), el('span', {}, `${p.method}${p.reference ? ` · Ref ${p.reference}` : ''}`)),
    el('span', { class: `pill ${p.status === 'confirmed' ? 'paid' : p.status === 'pending' ? 'partial' : 'unpaid'}` }, p.status === 'confirmed' ? 'Received' : p.status === 'pending' ? 'To check' : 'Rejected'),
    el('b', { class: 'amt' }, php2(p.amount)))) : [el('li', { class: 'empty' }, 'No payments yet.')]));
  $('#cardMove').textContent = t.active ? 'Mark as moved out' : 'Move back in';
  $('#cardDelete').textContent = t.bills.length || t.payments.length ? '' : 'Delete tenant';
  $('#cardDelete').hidden = !!(t.bills.length || t.payments.length);
}
const ordinal = n => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1) && n % 10] || 'th'}`;

function copyReminder(id) {
  const t = tenantById(id);
  const msg = reminder({ property: S.property, tenant: t.name, unit: t.unitName, balance: t.balance, lateDays: t.lateDays, link: store.link(t.token), gcash: S.gcash });
  copy(msg).then(ok => { toast(ok ? `Reminder for ${t.name} copied. Paste it in Messenger or SMS.` : 'Could not copy.'); if ($('#cardDlg').open) $('#cardNote').textContent = ok ? 'Reminder copied.' : ''; });
}
$('#cardRemind').addEventListener('click', () => copyReminder(openTenant));
$('#cardLink').addEventListener('click', async () => { const ok = await copy(store.link(tenantById(openTenant).token)); $('#cardNote').textContent = ok ? 'Statement link copied.' : 'Could not copy.'; });
$('#cardPay').addEventListener('click', () => { const t = tenantById(openTenant); $('#cardDlg').close(); showTab('payments'); const f = $('#payForm').elements; f.tenantId.value = t.id; f.amount.value = t.balance > 0 ? String(t.balance) : ''; f.amount.focus(); });
$('#cardEdit').addEventListener('click', () => { const t = tenantById(openTenant); $('#cardDlg').close(); openTenantForm(t); });
$('#cardMove').addEventListener('click', () => {
  const t = tenantById(openTenant);
  if (t.active && !confirm(`Mark ${t.name} as moved out? Their records and balance stay.`)) return;
  run(() => store.editTenant(t.id, { active: !t.active })).then(r => r && toast(t.active ? `${t.name} moved out.` : `${t.name} is back in.`));
});
$('#cardDelete').addEventListener('click', () => { const t = tenantById(openTenant); if (confirm(`Delete ${t.name}?`)) run(() => store.delTenant(t.id)).then(r => r && $('#cardDlg').close()); });

/* ---------- forms ---------- */
let editingRoom = null;
function openRoomForm(u) {
  editingRoom = u; const f = $('#roomForm').elements;
  $('#roomDlgTitle').textContent = u ? `Edit ${u.name}` : 'Add a room';
  f.name.value = u?.name || `Room ${S.units.length + 1}`; f.rent.value = u?.rent ?? ''; f.elecMeter.value = u?.elecMeter ?? 0; f.waterMeter.value = u?.waterMeter ?? 0;
  $('#roomDelete').hidden = !u; $('.err', $('#roomForm')).textContent = '';
  $('#roomDlg').showModal();
}
$('#addRoomBtn').addEventListener('click', () => openRoomForm(null));
$('#roomForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements;
  const body = { name: f.name.value, rent: Number(f.rent.value), elecMeter: Number(f.elecMeter.value), waterMeter: Number(f.waterMeter.value) || 0 };
  const r = await run(() => (editingRoom ? store.editUnit(editingRoom.id, body) : store.addUnit(body)), $('.err', e.target));
  if (r) { $('#roomDlg').close(); toast(editingRoom ? 'Room saved.' : `${body.name} added.`); }
});
$('#roomDelete').addEventListener('click', async () => { if (!confirm(`Remove ${editingRoom.name}?`)) return; const r = await run(() => store.delUnit(editingRoom.id), $('.err', $('#roomForm'))); if (r) $('#roomDlg').close(); });

let editingTenant = null;
function openTenantForm(t, unitId) {
  editingTenant = t; const f = $('#tenantForm').elements;
  $('#tenantDlgTitle').textContent = t ? `Edit ${t.name}` : 'Add a tenant';
  f.unitId.replaceChildren(...S.units.map(u => el('option', { value: u.id }, u.name)));
  const u = S.units.find(x => x.id === (t?.unitId || unitId)) || S.units[0];
  f.unitId.value = u?.id || '';
  f.name.value = t?.name || ''; f.mobile.value = t?.mobile || ''; f.rent.value = t?.rent ?? u?.rent ?? '';
  f.dueDay.value = t?.dueDay ?? new Date().getDate(); f.deposit.value = t?.deposit ?? u?.rent ?? 0; f.moveIn.value = t?.moveIn || isoDay(new Date());
  f.moveIn.disabled = !!t; $('.err', $('#tenantForm')).textContent = '';
  if (!S.units.length) { toast('Add a room first.', true); return; }
  $('#tenantDlg').showModal();
}
$('#tenantForm').elements.unitId.addEventListener('change', e => { if (!editingTenant) { const u = S.units.find(x => x.id === e.target.value); if (u) { $('#tenantForm').elements.rent.value = u.rent; } } });
$('#tenantForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements;
  const body = { name: f.name.value, unitId: f.unitId.value, mobile: f.mobile.value.trim(), rent: Number(f.rent.value), dueDay: Number(f.dueDay.value), deposit: Number(f.deposit.value) || 0, moveIn: f.moveIn.value };
  const r = await run(() => (editingTenant ? store.editTenant(editingTenant.id, body) : store.addTenant(body)), $('.err', e.target));
  if (r) { $('#tenantDlg').close(); toast(editingTenant ? 'Tenant saved.' : `${body.name} added. Copy their statement link from their card.`); }
});

/* Meter → bills */
$('#billPeriod').addEventListener('change', e => { billPeriod = e.target.value; renderBilling(); });
$('#goBill').addEventListener('click', () => { billPeriod = S.period; showTab('billing'); });
$('#makeBills').addEventListener('click', async () => {
  const readings = $$('#readRows tr').map(tr => {
    const [elec, water] = $$('input', tr);
    return elec.value === '' ? null : { unitId: tr.dataset.unit, elec: Number(elec.value), water: water.value === '' ? Number(water.placeholder) : Number(water.value) };
  }).filter(Boolean);
  if (!readings.length) { $('#billErr').textContent = 'Type at least one new electric reading.'; return; }
  const r = await run(() => store.makeBills(billPeriod, readings), $('#billErr'));
  if (r && r.created) toast(`${r.created} bill${r.created > 1 ? 's' : ''} created for ${periodLabel(billPeriod)}.${r.problems?.length ? ` ${r.problems.join(' ')}` : ''}`);
});

let editingBill = null;
function extraRow(x = {}) {
  return el('div', { class: 'extra' },
    el('input', { 'aria-label': 'Charge', placeholder: 'Wifi', maxlength: '40', value: x.label || '' }),
    el('input', { type: 'number', min: '0', step: '0.01', inputmode: 'decimal', 'aria-label': 'Amount', placeholder: '₱', value: x.amount ?? '' }),
    el('button', { type: 'button', class: 'link', 'aria-label': 'Remove charge', onclick: e => e.target.closest('.extra').remove() }, '×'));
}
function openBill(b) {
  editingBill = b;
  $('#billDlgTitle').textContent = `${b.tenantName} · ${periodLabel(b.period)}`;
  $('#billDlgSub').textContent = breakdown(b);
  $('#billForm').elements.rent.value = b.rent;
  $('#extraRows').replaceChildren(...(b.extras || []).map(extraRow));
  $('.err', $('#billForm')).textContent = '';
  $('#billDlg').showModal();
}
$('#addExtra').addEventListener('click', () => $('#extraRows').append(extraRow()));
$('#billForm').addEventListener('submit', async e => {
  e.preventDefault();
  const extras = $$('#extraRows .extra').map(row => { const [l, a] = $$('input', row); return { label: l.value.trim(), amount: Number(a.value) || 0 }; }).filter(x => x.label && x.amount);
  const r = await run(() => store.editBill(editingBill.id, { rent: Number(e.target.elements.rent.value), extras }), $('.err', e.target));
  if (r) { $('#billDlg').close(); toast('Bill saved.'); }
});
$('#billDelete').addEventListener('click', async () => {
  if (!confirm('Delete this bill? If it is the room’s latest, the meter goes back to the old reading.')) return;
  const r = await run(() => store.delBill(editingBill.id), $('.err', $('#billForm')));
  if (r) $('#billDlg').close();
});

/* Payments */
$('#payForm').elements.paidOn.value = isoDay(new Date());
$('#payForm').elements.tenantId.addEventListener('change', e => { const t = tenantById(e.target.value); if (t && t.balance > 0) $('#payForm').elements.amount.value = t.balance; });
$('#payForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements;
  const body = { tenantId: f.tenantId.value, amount: Number(f.amount.value), paidOn: f.paidOn.value, method: f.method.value, reference: f.reference.value.trim(), note: f.note.value.trim() };
  const t = tenantById(body.tenantId);
  const r = await run(() => store.addPayment(body), $('.err', e.target));
  if (r) { toast(`Recorded ${php2(body.amount)} from ${t.name}.`); f.amount.value = ''; f.reference.value = ''; f.note.value = ''; f.tenantId.value = ''; }
});

/* Settings */
$('#openSettings').addEventListener('click', () => {
  const f = $('#setForm').elements; const st = S.settings;
  f.name.value = S.property; f.gcash.value = S.gcash; f.elecRate.value = st.elecRate; f.waterMode.value = st.waterMode; f.waterRate.value = st.waterRate; f.waterFixed.value = st.waterFixed;
  $('#setDlg').showModal();
});
$('#resetDemo').addEventListener('click', () => { if (confirm('Start the demo over with the sample boarding house?')) { localStorage.removeItem(KEY); location.reload(); } });
if (OWNER) $('#setNote').textContent = 'New rates apply to bills you create from now on. Bills already made keep their rates.';
$('#setForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements;
  const r = await run(() => store.saveSettings({ name: f.name.value.trim(), gcash: f.gcash.value.trim(), elecRate: Number(f.elecRate.value), waterMode: f.waterMode.value, waterRate: Number(f.waterRate.value) || 0, waterFixed: Number(f.waterFixed.value) || 0 }), $('.err', e.target));
  if (r) { $('#setDlg').close(); toast('Settings saved.'); }
});

/* Tabs */
function showTab(name) {
  tab = name;
  $$('.tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === name)));
  $$('.tab').forEach(s => { s.hidden = s.id !== `tab-${name}`; });
}
$$('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

/* ---------- sign in ---------- */
function showAuth() { $('#authView').hidden = false; $('#appView').hidden = true; }
const authTabs = [$('#tabLogin'), $('#tabSignup')];
authTabs.forEach(t => t.addEventListener('click', () => authTabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); $(`#${x.getAttribute('aria-controls')}`).hidden = !on; })));
const slug = name => `${(String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'rent')}-${Math.random().toString(36).slice(2, 6)}`;
async function auth(form, path, body) {
  const btn = $('button[type="submit"]', form); const err = $('.err', form);
  err.textContent = ''; btn.disabled = true;
  try { await api(path, { method: 'POST', body }); form.reset(); await boot(); }
  catch (ex) { err.textContent = ex.message; }
  finally { btn.disabled = false; }
}
$('#loginForm').addEventListener('submit', e => { e.preventDefault(); const f = e.target.elements; auth(e.target, '/auth/login', { email: f.email.value, password: f.password.value }); });
$('#signupForm').addEventListener('submit', e => { e.preventDefault(); const f = e.target.elements; auth(e.target, '/auth/signup', { businessName: f.businessName.value, slug: slug(f.businessName.value), email: f.email.value, password: f.password.value }); });
$('#logoutBtn').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); me = null; showAuth(); });

async function boot() {
  try {
    if (OWNER) { $('#strip').hidden = true; $('#logoutBtn').hidden = false; me = await api('/me'); }
    S = await store.load();
    $('#authView').hidden = true; $('#appView').hidden = false;
    render();
    if (OWNER && !S.units.length) { showTab('rooms'); }
  } catch (e) {
    if (e.status === 401) showAuth(); else { $('#appView').hidden = false; toast(e.message, true); }
  }
}
boot();
