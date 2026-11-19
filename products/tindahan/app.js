/* RZ Tindahan POS. No ?live → a demo store kept in this browser. ?live → the store's real account.
   Sales and shifts are saved on the tablet first and sent to the server when online, so the counter
   never stops when the internet does. Product, staff and store changes need the internet. */
import { METHODS, METHOD_NAME, round, manilaDay, saleTotals, shiftSummary, report, parseImportLine } from './logic.mjs';

const { el, $, $$, peso, download } = window.RZ;
const LIVE = new URLSearchParams(location.search).has('live');
const K = LIVE ? { cache: 'rz-tnd-cache', queue: 'rz-tnd-queue', who: 'rz-tnd-who' } : { db: 'rz-tnd-demo-v2', queue: 'rz-tnd-demo-queue', who: 'rz-tnd-demo-who' };

const hex32 = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('');
const money = n => (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const todayPH = () => manilaDay(new Date().toISOString());
const dayShift = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const timeOf = iso => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

/* ---------------- demo server: the same rules as worker/tindahan.js, in this browser ---------------- */
async function demoSeed() {
  const items = [
    ['Bigas 1 kg', 55, 48, 40, 'Bigas', '4800000000017'], ['Itlog (1 pc)', 10, 8, 60, 'Itlog', ''], ['Sardinas 155g', 26, 22, 24, 'De lata', '4800249010019'],
    ['Pancit canton', 16, 13, 36, 'Noodles', '4807770270017'], ['Kape 3-in-1', 10, 8.5, 50, 'Inumin', '4800016641017'], ['Softdrinks 1.5L', 85, 72, 6, 'Inumin', '4801981116072'],
    ['Pandesal (10 pcs)', 30, 25, 10, 'Tinapay', ''], ['Mantika 250 ml', 40, 34, 3, 'Pantry', '4800361002015'], ['Shampoo sachet', 8, 6, 48, 'Personal', '4800888141019'],
    ['Sabong panlaba', 22, 18, 15, 'Personal', '4800888195012'], ['Asukal ¼ kg', 26, 22, 20, 'Pantry', ''], ['Kandila', 10, 7, 4, 'Iba pa', ''],
  ].map(([name, price, cost, stock, category, barcode]) => ({ id: hex32(), name, price, cost, stock, category, barcode, updatedAt: new Date().toISOString() }));
  const staff = [];
  for (const [name, role, pin] of [['Tonyo', 'owner', '1111'], ['Liza', 'cashier', '2222']]) { const salt = hex32(); staff.push({ id: hex32(), name, role, salt, pinHash: await sha(`${salt}:${pin}`), active: true }); }
  const shift = { id: hex32(), staffId: staff[1].id, openedAt: new Date(Date.now() - 5 * 3600e3).toISOString(), openingCash: 1000, closedAt: null, countedCash: null, note: '' };
  const pick = (i, qty) => ({ itemId: items[i].id, name: items[i].name, price: items[i].price, cost: items[i].cost, qty });
  const sales = [[[6, 1], [4, 2]], [[0, 2], [1, 6]], [[3, 3], [5, 1]], [[2, 2], [8, 4]], [[4, 3], [1, 2]]].map((ls, k) => ({
    id: hex32(), shiftId: shift.id, staffId: staff[1].id, at: new Date(Date.now() - (5 - k) * 3200e3).toISOString(), method: k === 2 ? 'gcash' : 'cash',
    lines: ls.map(([i, q]) => pick(i, q)), discount: 0, cash: 0, reference: k === 2 ? 'GC 7019 2281' : '', customer: '', status: 'ok' }));
  sales.forEach(s => { s.total = saleTotals(s).total; s.lines.forEach(l => { items.find(i => i.id === l.itemId).stock -= l.qty; }); });
  return { store: { name: 'Sari-Sari ni Mang Tonyo', slug: 'demo', low: 5, receiptNote: 'Salamat po! Balik kayo.' }, items, staff, shifts: [shift], sales };
}
function demoServer(db) {
  const fail = m => { const e = new Error(m); e.status = 400; throw e; };
  const save = () => { if (!write(K.db, db)) fail('Demo storage is full. Reset the demo store.'); return structuredClone(db); };
  const item = id => db.items.find(i => i.id === id) || fail('Item not found.');
  const codeFree = (code, except) => { const o = code && db.items.find(i => i.barcode === code && i.id !== except); if (o) fail(`That barcode is already on “${o.name}”.`); };
  const cleanItem = (b, prev = {}) => {
    const name = String(b.name ?? prev.name ?? '').trim().slice(0, 60); if (!name) fail('Name the item.');
    const num = (v, d) => (v === undefined || v === '' ? d : round(Math.max(0, Number(v) || 0)));
    const price = num(b.price, prev.price); if (price === undefined) fail('Enter the price.');
    return { name, barcode: String(b.barcode ?? prev.barcode ?? '').replace(/\s+/g, ''), category: String(b.category ?? prev.category ?? '').trim().slice(0, 30), price, cost: num(b.cost, prev.cost ?? 0), stock: b.stock === undefined || b.stock === '' ? (prev.stock ?? 0) : Math.round(Number(b.stock) || 0) };
  };
  const pinOf = async pin => { if (!/^\d{4,6}$/.test(String(pin))) fail('The PIN is 4 to 6 numbers.'); const salt = hex32(); return { salt, pinHash: await sha(`${salt}:${pin}`) }; };
  const owners = () => db.staff.filter(s => s.role === 'owner' && s.active).length;
  return {
    get: async () => structuredClone(db),
    store: async b => { db.store = { ...db.store, name: String(b.name || db.store.name).slice(0, 80), low: Math.max(0, Math.round(Number(b.low) || 0)), receiptNote: String(b.receiptNote || '').slice(0, 120) }; return save(); },
    addItem: async b => { const it = cleanItem(b); codeFree(it.barcode); db.items.push({ id: hex32(), ...it, updatedAt: new Date().toISOString() }); return save(); },
    editItem: async (id, b) => { const i = item(id); const it = cleanItem(b, i); codeFree(it.barcode, id); Object.assign(i, it, { updatedAt: new Date().toISOString() }); return save(); },
    delItem: async id => { item(id); db.items = db.items.filter(i => i.id !== id); return save(); },
    restock: async (id, add) => { item(id).stock += add; return save(); },
    importItems: async rows => {
      let added = 0; let updated = 0;
      rows.forEach((r, n) => {
        let it; try { it = cleanItem(r); } catch (e) { fail(`Line ${n + 1}: ${e.message}`); }
        const m = (it.barcode && db.items.find(i => i.barcode === it.barcode)) || db.items.find(i => i.name.toLowerCase() === it.name.toLowerCase());
        if (m) { Object.assign(m, it, { barcode: it.barcode || m.barcode, category: it.category || m.category }); updated++; } else { db.items.push({ id: hex32(), ...it }); added++; }
      });
      return { ...save(), imported: { added, updated } };
    },
    addStaff: async b => { const name = String(b.name || '').trim().slice(0, 40); if (!name) fail('Enter the name.'); db.staff.push({ id: hex32(), name, role: owners() ? (b.role === 'owner' ? 'owner' : 'cashier') : 'owner', ...(await pinOf(b.pin)), active: true }); return save(); },
    editStaff: async (id, b) => {
      const s = db.staff.find(x => x.id === id) || fail('Staff not found.');
      const role = b.role || s.role; const active = b.active ?? s.active;
      if (s.role === 'owner' && s.active && owners() <= 1 && (role !== 'owner' || !active)) fail('Keep at least one owner PIN.');
      Object.assign(s, { name: b.name || s.name, role, active }, b.pin ? await pinOf(b.pin) : {}); return save();
    },
    delStaff: async id => {
      const s = db.staff.find(x => x.id === id) || fail('Staff not found.');
      if (s.role === 'owner' && s.active && owners() <= 1) fail('Keep at least one owner PIN.');
      if (db.sales.some(x => x.staffId === id) || db.shifts.some(x => x.staffId === id)) s.active = false; else db.staff = db.staff.filter(x => x.id !== id);
      return save();
    },
    sync: async q => {
      Object.values(q.shifts).forEach(sh => { const o = db.shifts.find(x => x.id === sh.id); if (!o) db.shifts.push({ ...sh }); else if (!o.closedAt && sh.closedAt) Object.assign(o, { closedAt: sh.closedAt, countedCash: sh.countedCash, note: sh.note || o.note }); });
      q.sales.forEach(s => {
        if (db.sales.some(x => x.id === s.id)) return;
        const t = saleTotals(s); db.sales.push({ ...s, discount: t.discount, total: t.total, status: 'ok' });
        s.lines.forEach(l => { const i = db.items.find(x => x.id === l.itemId); if (i) i.stock -= l.qty; });
      });
      db.sales.sort((a, b) => b.at.localeCompare(a.at));
      return save();
    },
    voidSale: async id => {
      const s = db.sales.find(x => x.id === id) || fail('Sale not found.');
      if (s.status === 'void') fail('This sale is already void.');
      s.status = 'void'; s.lines.forEach(l => { const i = db.items.find(x => x.id === l.itemId); if (i) i.stock += l.qty; });
      return save();
    },
  };
}

/* ---------------- live server ---------------- */
async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, { method: opts.method || 'GET', headers: opts.body ? { 'content-type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status}).`); e.status = res.status; throw e; }
  return data;
}
const liveServer = {
  get: () => api('/tindahan'),
  store: b => api('/tindahan/store', { method: 'PUT', body: b }),
  addItem: b => api('/tindahan/items', { method: 'POST', body: b }),
  editItem: (id, b) => api(`/tindahan/items/${id}`, { method: 'PATCH', body: b }),
  delItem: id => api(`/tindahan/items/${id}`, { method: 'DELETE' }),
  restock: (id, add) => api(`/tindahan/items/${id}/restock`, { method: 'POST', body: { add } }),
  importItems: items => api('/tindahan/items/import', { method: 'POST', body: { items } }),
  addStaff: b => api('/tindahan/staff', { method: 'POST', body: b }),
  editStaff: (id, b) => api(`/tindahan/staff/${id}`, { method: 'PATCH', body: b }),
  delStaff: id => api(`/tindahan/staff/${id}`, { method: 'DELETE' }),
  sync: q => api('/tindahan/sync', { method: 'POST', body: { shifts: Object.values(q.shifts), sales: q.sales } }),
  voidSale: id => api(`/tindahan/sales/${id}/void`, { method: 'POST' }),
};

/* ---------------- state: what the server knows + what this tablet has not sent yet ---------------- */
let server = null;          // the server API in use
let base = null;            // last state from the server
let S = null;               // base + queued work, what the screens show
let queue = read(K.queue, { shifts: {}, sales: [] });
let me = null;              // staff at the counter
let cart = []; let disc = { mode: '0', amount: 0 }; let lastSale = null;
const ui = { tab: 'sell', range: 'today', cat: '', editId: null };

function derive() {
  S = structuredClone(base);
  const known = new Set(S.sales.map(s => s.id));
  Object.values(queue.shifts).forEach(sh => { const o = S.shifts.find(x => x.id === sh.id); if (!o) S.shifts.unshift({ ...sh }); else if (!o.closedAt && sh.closedAt) Object.assign(o, sh); });
  queue.sales.filter(s => !known.has(s.id)).forEach(s => {
    S.sales.unshift({ ...s, total: saleTotals(s).total, status: 'ok', pending: true });
    s.lines.forEach(l => { const i = S.items.find(x => x.id === l.itemId); if (i) i.stock -= l.qty; });
  });
  if (me) me = S.staff.find(x => x.id === me.id && x.active) || null;
}
const saveQueue = () => write(K.queue, queue);
const pendingCount = () => queue.sales.length + Object.keys(queue.shifts).length;
const isOwner = () => me?.role === 'owner';
const openShift = () => S.shifts.find(s => s.staffId === me?.id && !s.closedAt);
const staffName = id => S.staff.find(s => s.id === id)?.name || 'Staff';

let syncing = null;
async function sync() {
  if (syncing) return syncing;
  if (!pendingCount()) return null;
  if (LIVE && !navigator.onLine) { renderNet(); return null; }
  syncing = (async () => {
    try {
      // Send in parts the server accepts: up to 300 sales and 50 shifts at a time.
      while (pendingCount()) {
        const part = { shifts: Object.fromEntries(Object.entries(queue.shifts).slice(0, 50)), sales: queue.sales.slice(0, 300) };
        const fresh = await server.sync(part);
        const sentSales = new Set(part.sales.map(s => s.id));
        queue = read(K.queue, queue);
        queue.sales = queue.sales.filter(s => !sentSales.has(s.id));
        Object.keys(part.shifts).forEach(id => { if (JSON.stringify(queue.shifts[id]) === JSON.stringify(part.shifts[id])) delete queue.shifts[id]; });
        saveQueue(); setBase(fresh); if (me) render();
      }
    } catch (e) {
      if (e.status === 401 && LIVE) { showAuth(); return; }
      if (e.status && e.status < 500 && e.status !== 429) toast(`Sync stopped: ${e.message}`, true);
    } finally { syncing = null; renderNet(); }
  })();
  return syncing;
}
function setBase(fresh) { delete fresh.imported; base = fresh; if (LIVE) write(K.cache, base); derive(); }

async function change(fn, okMsg, errEl) {
  if (LIVE && !navigator.onLine) { const m = 'This needs the internet. Sales still work offline.'; if (errEl) errEl.textContent = m; else toast(m, true); return null; }
  try { if (errEl) errEl.textContent = ''; const fresh = await fn(); setBase(fresh); render(); if (okMsg) toast(okMsg); return fresh; }
  catch (e) { if (e.status === 401 && LIVE) { showAuth(); return null; } if (errEl) errEl.textContent = e.message; else toast(e.message, true); return null; }
}

function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = `toast show${bad ? ' bad' : ''}`; clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 3200); }
/* Destructive buttons confirm on the page: the first press arms them, the second acts. */
function disarm(b) { clearTimeout(b._t); if (b.dataset.armed) { b.textContent = b.dataset.text; delete b.dataset.armed; b.classList.remove('armed'); } }
function arm(b, label, fn) { if (b.dataset.armed) { disarm(b); fn(); return; } b.dataset.text = b.textContent; b.dataset.armed = '1'; b.textContent = label; b.classList.add('armed'); b._t = setTimeout(() => disarm(b), 6000); }

/* ---------------- lock: who is at the counter ---------------- */
function showLock() {
  me = null; localStorage.removeItem(K.who);
  $('#appView').hidden = true; $('#authView').hidden = true; $('#lockView').hidden = false;
  $('#lockStore').textContent = S.store.name;
  const staff = S.staff.filter(s => s.active);
  $('#firstForm').hidden = staff.length > 0; $('#lockTitle').hidden = !staff.length;
  $('#pinForm').hidden = true; $('#whoList').hidden = !staff.length;
  $('#whoList').replaceChildren(...staff.map(s => el('button', { type: 'button', class: 'who-btn', onclick: () => askPin(s) }, el('b', {}, s.name), el('span', {}, s.role === 'owner' ? 'Owner' : 'Cashier'))));
  $('#demoPins').textContent = LIVE ? '' : 'Demo PINs: Tonyo (owner) 1111 · Liza (cashier) 2222';
}
let pinFor = null;
function askPin(s) {
  pinFor = s; $('#whoList').hidden = true; $('#pinForm').hidden = false; $('#pinName').textContent = s.name; $('#pinErr').textContent = '';
  $('#pinInput').value = ''; $('#pinInput').focus();
}
$('#pad').replaceChildren(...['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'OK'].map(k => el('button', { type: k === 'OK' ? 'submit' : 'button', class: `key${k === 'OK' ? ' ok-key' : ''}`, onclick: k === 'OK' ? null : () => { const i = $('#pinInput'); i.value = k === 'Clear' ? '' : (i.value + k).slice(0, 6); i.focus(); } }, k)));
$('#pinBack').addEventListener('click', showLock);
$('#pinForm').addEventListener('submit', async e => {
  e.preventDefault();
  const pin = $('#pinInput').value;
  if (pinFor && await sha(`${pinFor.salt}:${pin}`) === pinFor.pinHash) { me = pinFor; write(K.who, me.id); enter(); }
  else { $('#pinErr').textContent = 'Mali ang PIN. Try again.'; $('#pinInput').value = ''; }
});
$('#firstForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements; const name = f.name.value.trim();
  const r = await change(() => server.addStaff({ name, role: 'owner', pin: f.pin.value }), null, $('.err', e.target));
  if (r) { const s = S.staff.find(x => x.name === name); e.target.reset(); if (s) { me = s; write(K.who, me.id); enter(); } }
});
$('#lockBtn').addEventListener('click', () => { cart = []; showLock(); });

function enter() {
  $('#lockView').hidden = true; $('#authView').hidden = true; $('#appView').hidden = false;
  if (!isOwner() && ['stock', 'settings'].includes(ui.tab)) ui.tab = 'sell';
  render(); $('#q').focus();
}

/* ---------------- shifts ---------------- */
$('#openForm').addEventListener('submit', e => {
  e.preventDefault(); const v = e.target.elements.cash.value;
  if (v === '' || !(Number(v) >= 0)) { toast('Enter the starting cash, even if it is 0.', true); return; }
  const sh = { id: hex32(), staffId: me.id, openedAt: new Date().toISOString(), openingCash: round(v), closedAt: null, countedCash: null, note: '' };
  queue.shifts[sh.id] = sh; saveQueue(); derive(); e.target.reset(); render(); sync(); toast('Shift open. Good luck today!');
});
$('#closeShiftBtn').addEventListener('click', () => {
  const sh = openShift(); if (!sh) return;
  const sum = shiftSummary(sh, S.sales);
  $('#closeSum').replaceChildren(...[['Opened', timeOf(sh.openedAt)], ['Starting cash', peso(sh.openingCash)], ['Cash sales', peso(sum.byMethod.cash)], ['GCash / Maya', peso(sum.byMethod.gcash + sum.byMethod.maya)], ['Utang', peso(sum.byMethod.utang)], ['Sales', String(sum.sales)]].map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, v))));
  // The expected cash appears only once a count is typed, so the count is honest.
  $('#closeDiff').textContent = ''; $('#closeForm').reset(); $('#closeDlg').showModal();
});
$('#closeForm').elements.counted.addEventListener('input', e => {
  const sh = openShift(); if (!sh || e.target.value === '') { $('#closeDiff').textContent = ''; return; }
  const sum = shiftSummary({ ...sh, countedCash: Number(e.target.value) }, S.sales);
  $('#closeDiff').textContent = `Expected ${peso(sum.expected)} · ${sum.diff === 0 ? 'exact' : sum.diff > 0 ? `over ${peso(sum.diff)}` : `short ${peso(-sum.diff)}`}`;
  $('#closeDiff').className = `diff ${sum.diff < 0 ? 'short' : sum.diff > 0 ? 'over' : 'even'}`;
});
$('#closeForm').addEventListener('submit', e => {
  e.preventDefault(); const f = e.target.elements; const sh = openShift(); if (!sh) return;
  if (f.counted.value === '') { $('#closeDiff').textContent = 'Count the cash in the drawer first.'; return; }
  const { pending, ...clean } = sh;
  queue.shifts[sh.id] = { ...clean, closedAt: new Date().toISOString(), countedCash: round(f.counted.value), note: f.note.value.trim().slice(0, 120) };
  saveQueue(); derive(); $('#closeDlg').close(); sync(); toast('Shift closed.'); cart = []; showLock();
});

/* ---------------- selling ---------------- */
const methodNow = () => $('input[name=method]:checked').value;
const cartTotals = () => {
  const lines = cart.map(c => ({ ...c }));
  const sub = round(lines.reduce((s, l) => s + l.price * l.qty, 0));
  const discount = disc.mode === '20' ? round(sub * 0.2) : disc.mode === 'custom' ? Math.min(sub, round(disc.amount)) : 0;
  return saleTotals({ lines, discount, method: methodNow(), cash: Number($('#cash').value) || 0 });
};
function addToCart(i, n = 1) {
  const c = cart.find(x => x.itemId === i.id);
  if (c) c.qty += n; else cart.push({ itemId: i.id, name: i.name, price: i.price, cost: i.cost, qty: n });
  $('#sellStatus').textContent = ''; $('#after').hidden = true; renderSell();
}
function findCode(code) { const c = String(code).trim(); return c ? S.items.find(i => i.barcode && i.barcode === c) : null; }

function renderGrid() {
  const q = $('#q').value.trim().toLowerCase();
  const cats = [...new Set(S.items.map(i => i.category).filter(Boolean))].sort();
  $('#cats').replaceChildren(...(cats.length > 1 ? ['', ...cats].map(c => el('button', { type: 'button', 'aria-pressed': String(ui.cat === c), onclick: () => { ui.cat = c; renderGrid(); } }, c || 'Lahat')) : []));
  const list = S.items.filter(i => (!ui.cat || i.category === ui.cat) && (!q || i.name.toLowerCase().includes(q) || i.barcode === q));
  $('#grid').replaceChildren(...(list.length ? list.map(i => {
    const inCart = cart.find(c => c.itemId === i.id)?.qty || 0; const left = i.stock - inCart; const low = i.stock <= S.store.low;
    return el('button', { type: 'button', class: `item${low ? ' low' : ''}`, 'aria-label': `${i.name}, ${peso(i.price)}, ${left} left`, onclick: () => addToCart(i) },
      inCart ? el('span', { class: 'qty' }, inCart) : null,
      el('b', {}, i.name), el('span', { class: 'price' }, money(i.price)),
      el('span', { class: 'stk' }, left <= 0 ? `Stock ${left}` : `${left} left${low ? ' · low' : ''}`));
  }) : [el('p', { class: 'muted empty' }, S.items.length ? 'Walang item na ganyan.' : 'No items yet. The owner adds them under Stock.')]));
}
function renderReceipt() {
  $('#rcStore').textContent = S.store.name;
  $('#rcMeta').textContent = `${new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })} · ${me?.name || ''}`;
  $('#rcLines').replaceChildren(...cart.map(c => el('li', {},
    el('span', { class: 'ln' }, c.name), el('span', { class: 'amt' }, money(c.price * c.qty)),
    el('span', { class: 'sub' },
      el('button', { type: 'button', 'aria-label': `One less ${c.name}`, onclick: () => { c.qty--; if (!c.qty) cart = cart.filter(x => x !== c); renderSell(); } }, '−'),
      `${c.qty} × ${money(c.price)}`,
      el('button', { type: 'button', 'aria-label': `One more ${c.name}`, onclick: () => { c.qty++; renderSell(); } }, '+')))));
  $('#rcEmpty').hidden = cart.length > 0;
  const t = cartTotals();
  $('#rcSubRow').hidden = !t.discount; $('#rcDiscRow').hidden = !t.discount;
  $('#rcSub').textContent = money(t.subtotal); $('#rcDisc').textContent = `−${money(t.discount)}`;
  $('#rcTotal').textContent = money(t.total);
  const quick = [...new Set([20, 50, 100, 200, 500, 1000].filter(v => v >= t.total).slice(0, 3))];
  $('#quick').replaceChildren(el('button', { type: 'button', onclick: () => { $('#cash').value = t.total.toFixed(2); renderChange(); } }, 'Exact'),
    ...quick.map(v => el('button', { type: 'button', onclick: () => { $('#cash').value = v; renderChange(); } }, `₱${v}`)));
  $('#doneSale').disabled = !cart.length || !openShift();
  $('#cartbar').hidden = !cart.length || ui.tab !== 'sell'; $('#cbCount').textContent = `${t.items} item${t.items === 1 ? '' : 's'}`; $('#cbTotal').textContent = peso(t.total);
  renderChange();
}
function renderChange() {
  const t = cartTotals(); const c = $('#rcChange'); const v = $('#cash').value;
  if (!v || !t.total) { c.textContent = '—'; c.classList.remove('short'); return; }
  const diff = round(Number(v) - t.total);
  c.textContent = diff >= 0 ? money(diff) : `kulang ${money(-diff)}`; c.classList.toggle('short', diff < 0);
}
function renderPay() {
  const m = methodNow();
  $('#cashBox').hidden = m !== 'cash'; $('#refBox').hidden = !['gcash', 'maya'].includes(m); $('#custBox').hidden = m !== 'utang';
  $$('.disc button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.disc === disc.mode)));
  $('#discCustom').hidden = disc.mode !== 'custom';
}
function renderSell() { renderGrid(); renderReceipt(); renderPay(); }

$('#q').addEventListener('input', renderGrid);
$('#q').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const v = $('#q').value.trim(); const hit = findCode(v);
  if (hit) { addToCart(hit); $('#q').value = ''; renderGrid(); return; }
  const list = S.items.filter(i => i.name.toLowerCase().includes(v.toLowerCase()));
  if (v && list.length === 1) { addToCart(list[0]); $('#q').value = ''; renderGrid(); } else if (v && /^\d{6,}$/.test(v)) toast(`No item has barcode ${v}. Add it under Stock.`, true);
});
/* A barcode scanner types fast and ends with Enter. Catch it even when the search box is not focused. */
let scanBuf = ''; let scanAt = 0;
document.addEventListener('keydown', e => {
  if ($('#appView').hidden || ui.tab !== 'sell' || e.target.closest('input, textarea, select, dialog')) return;
  const t = performance.now();
  if (t - scanAt > 60) scanBuf = '';
  scanAt = t;
  if (e.key === 'Enter' && scanBuf.length >= 4) { const hit = findCode(scanBuf); scanBuf = ''; if (hit) addToCart(hit); else toast('Unknown barcode.', true); return; }
  if (e.key.length === 1) scanBuf += e.key;
});
$('#cash').addEventListener('input', renderChange);
$('#cbPay').addEventListener('click', () => { $('.receipt').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
$$('input[name=method]').forEach(r => r.addEventListener('change', renderSell));
$$('.disc button').forEach(b => b.addEventListener('click', () => { disc.mode = b.dataset.disc; renderSell(); if (disc.mode === 'custom') $('#discAmt').focus(); }));
$('#discAmt').addEventListener('input', e => { disc.amount = Number(e.target.value) || 0; renderReceipt(); });
$('#clearSale').addEventListener('click', () => { resetSale(); renderSell(); });
function resetSale() { cart = []; disc = { mode: '0', amount: 0 }; $('#cash').value = ''; $('#ref').value = ''; $('#cust').value = ''; $('#discAmt').value = ''; $('input[name=method][value=cash]').checked = true; }

$('#doneSale').addEventListener('click', () => {
  const sh = openShift(); if (!sh || !cart.length) return;
  const m = methodNow(); const t = cartTotals(); const cash = Number($('#cash').value) || 0;
  if (m === 'cash' && $('#cash').value && cash < t.total) { $('#sellStatus').textContent = 'Kulang ang bayad.'; return; }
  if (m === 'utang' && !$('#cust').value.trim()) { $('#sellStatus').textContent = 'Enter the customer’s name for utang.'; $('#cust').focus(); return; }
  const sale = { id: hex32(), shiftId: sh.id, staffId: me.id, at: new Date().toISOString(), method: m, lines: cart.map(c => ({ ...c })), discount: t.discount, cash: m === 'cash' ? cash : 0, reference: ['gcash', 'maya'].includes(m) ? $('#ref').value.trim().slice(0, 40) : '', customer: m === 'utang' ? $('#cust').value.trim().slice(0, 60) : '' };
  queue.sales.push(sale);
  if (!saveQueue()) { toast('This tablet’s storage is full. Connect to the internet to send sales.', true); queue.sales.pop(); return; }
  derive(); lastSale = { ...sale, ...t };
  $('#sellStatus').textContent = `Saved ${peso(t.total)}${m === 'cash' && cash ? ` · sukli ${peso(cash - t.total)}` : ''}${m !== 'cash' ? ` · ${METHOD_NAME[m]}` : ''}`;
  resetSale(); renderSell(); renderBadges(); $('#after').hidden = false; $('#q').focus();
  sync();
});

/* Receipt, printed through the tablet's print service (direct printer and drawer come with the hardware setup). */
$('#printLast').addEventListener('click', () => {
  const s = lastSale; if (!s) return;
  const rows = [el('p', { class: 'pr-c pr-b' }, S.store.name), el('p', { class: 'pr-c' }, new Date(s.at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })), el('p', { class: 'pr-c' }, `Cashier: ${staffName(s.staffId)}`), el('hr', {})];
  s.lines.forEach(l => rows.push(el('p', {}, l.name), el('p', { class: 'pr-r' }, `${l.qty} × ${money(l.price)}   ${money(l.qty * l.price)}`)));
  rows.push(el('hr', {}));
  if (s.discount) rows.push(el('p', { class: 'pr-r' }, `Subtotal ${money(s.subtotal)}`), el('p', { class: 'pr-r' }, `Discount −${money(s.discount)}`));
  rows.push(el('p', { class: 'pr-r pr-b' }, `TOTAL ${money(s.total)}`), el('p', { class: 'pr-r' }, `${METHOD_NAME[s.method]}${s.method === 'cash' && s.cash ? ` ${money(s.cash)} · Sukli ${money(s.cash - s.total)}` : ''}`));
  if (s.reference) rows.push(el('p', { class: 'pr-r' }, `Ref ${s.reference}`));
  if (S.store.receiptNote) rows.push(el('hr', {}), el('p', { class: 'pr-c' }, S.store.receiptNote));
  rows.push(el('p', { class: 'pr-c pr-s' }, 'This is not an official receipt.'));
  $('#printHost').replaceChildren(el('div', { class: 'pr' }, ...rows));
  document.body.classList.add('printing'); window.print(); setTimeout(() => document.body.classList.remove('printing'), 500);
});

/* ---------------- stock ---------------- */
function renderStock() {
  const q = $('#sq').value.trim().toLowerCase();
  const list = S.items.filter(i => !q || i.name.toLowerCase().includes(q) || i.barcode.includes(q) || i.category.toLowerCase().includes(q)).sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
  $('#stockRows').replaceChildren(...(list.length ? list.map(i => el('tr', {},
    el('td', { class: 'tl' }, i.name, el('span', { class: 'meta' }, [i.category, i.barcode].filter(Boolean).join(' · '))),
    el('td', {}, money(i.cost)), el('td', {}, money(i.price)),
    el('td', {}, i.price ? `${Math.round((i.price - i.cost) / i.price * 100)}%` : '—'),
    el('td', { class: i.stock <= S.store.low ? 'low' : '' }, i.stock),
    el('td', {}, el('span', { class: 'restock' }, [1, 6, 12].map(n => el('button', { type: 'button', 'aria-label': `Add ${n} ${i.name}`, onclick: () => change(() => server.restock(i.id, n), `+${n} ${i.name}`) }, `+${n}`)))),
    el('td', {}, el('button', { type: 'button', class: 'link', onclick: () => openItem(i) }, 'Edit')))) : [el('tr', {}, el('td', { colspan: '7', class: 'empty' }, S.items.length ? 'No match.' : 'No items yet. Add one, or import your list.'))]));
  $('#catList').replaceChildren(...[...new Set(S.items.map(i => i.category).filter(Boolean))].map(c => el('option', { value: c })));
}
$('#sq').addEventListener('input', renderStock);
function openItem(i) {
  ui.editId = i?.id || null; const f = $('#itemForm').elements;
  $('#itemTitle').textContent = i ? 'Edit item' : 'New item'; $('#delItem').hidden = !i; disarm($('#delItem'));
  ['name', 'barcode', 'category', 'cost', 'price', 'stock'].forEach(k => { f[k].value = i ? i[k] : ''; });
  $('.err', $('#itemForm')).textContent = ''; $('#itemDlg').showModal(); f.name.focus();
}
$('#newItemBtn').addEventListener('click', () => openItem(null));
$('#itemForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements;
  const b = { name: f.name.value, barcode: f.barcode.value, category: f.category.value, cost: f.cost.value === '' ? 0 : Number(f.cost.value), price: f.price.value === '' ? undefined : Number(f.price.value), stock: f.stock.value === '' ? 0 : Number(f.stock.value) };
  if (b.price === undefined) { $('.err', e.target).textContent = 'Enter the price.'; return; }
  const r = await change(() => (ui.editId ? server.editItem(ui.editId, b) : server.addItem(b)), ui.editId ? 'Item saved.' : 'Item added.', $('.err', e.target));
  if (r) $('#itemDlg').close();
});
$('#delItem').addEventListener('click', e => arm(e.currentTarget, 'Tap again to delete', async () => { const r = await change(() => server.delItem(ui.editId), 'Item deleted.', $('.err', $('#itemForm'))); if (r) $('#itemDlg').close(); }));

/* import */
const parseList = txt => { const rows = []; const errs = []; String(txt).split(/\r?\n/).forEach(line => { if (!line.trim()) return; const r = parseImportLine(line); if (!r) return; if (r.error) errs.push(r.error); else rows.push(r); }); return { rows, errs }; };
$('#importBtn').addEventListener('click', () => { $('#importForm').reset(); $('#impPreview').textContent = ''; $('.err', $('#importForm')).textContent = ''; $('#importDlg').showModal(); });
$('#importForm').elements.list.addEventListener('input', e => { const p = parseList(e.target.value); $('#impPreview').textContent = `${p.rows.length} items ready${p.errs.length ? ` · ${p.errs.length} lines need a price` : ''}`; });
$('#csvFile').addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; if (file.size > 500_000) { toast('That file is too big.', true); return; } const ta = $('#importForm').elements.list; ta.value = await file.text(); ta.dispatchEvent(new Event('input')); });
$('#importForm').addEventListener('submit', async e => {
  e.preventDefault(); const p = parseList(e.target.elements.list.value); const err = $('.err', e.target);
  if (p.errs.length) { err.textContent = `Fix these lines first: ${p.errs.slice(0, 3).join('; ')}${p.errs.length > 3 ? '…' : ''}`; return; }
  if (!p.rows.length) { err.textContent = 'Paste at least one item.'; return; }
  if (p.rows.length > 1000) { err.textContent = 'Import up to 1,000 items at a time.'; return; }
  let note = '';
  const r = await change(async () => { const x = await server.importItems(p.rows); note = `${x.imported?.added || 0} added, ${x.imported?.updated || 0} updated.`; return x; }, null, err);
  if (r) { $('#importDlg').close(); toast(`Imported: ${note}`); }
});

/* ---------------- reports ---------------- */
function rangeDays() {
  const t = todayPH();
  return { today: [t, t], yesterday: [dayShift(t, -1), dayShift(t, -1)], 7: [dayShift(t, -6), t], 30: [dayShift(t, -29), t] }[ui.range];
}
const visibleSales = () => (isOwner() ? S.sales : S.sales.filter(s => s.staffId === me?.id));
function renderReport() {
  const [from, to] = rangeDays(); const sales = visibleSales();
  const r = report(sales, from, to);
  $$('#range button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.r === ui.range)));
  $('#repTitle').textContent = isOwner() ? 'Ulat' : 'Ulat · my sales';
  $('#kRev').textContent = peso(r.revenue); $('#kProfit').textContent = isOwner() ? peso(r.profit) : '—'; $('#kCount').textContent = r.count; $('#kDisc').textContent = peso(r.discounts);
  $('#byMethod').replaceChildren(...METHODS.map(m => el('li', {}, el('span', {}, METHOD_NAME[m]), el('b', {}, peso(r.byMethod[m])))));
  const staffRows = Object.entries(r.byStaff).sort((a, b) => b[1] - a[1]);
  $('#byStaff').replaceChildren(...(staffRows.length ? staffRows.map(([id, v]) => el('li', {}, el('span', {}, staffName(id)), el('b', {}, peso(v)))) : [el('li', { class: 'muted' }, 'Wala pang benta.')]));
  $('#topItems').replaceChildren(...(r.top.length ? r.top.slice(0, 8).map(x => el('li', {}, x.name, el('span', {}, `${x.qty} pcs`))) : [el('li', { class: 'muted' }, 'Wala pang benta.')]));
  const shifts = S.shifts.filter(sh => (isOwner() || sh.staffId === me?.id) && manilaDay(sh.openedAt) >= from && manilaDay(sh.openedAt) <= to);
  $('#shiftList').replaceChildren(...(shifts.length ? shifts.map(sh => {
    const sum = shiftSummary(sh, S.sales);
    const state = sh.closedAt ? (sum.diff === 0 ? 'exact' : sum.diff > 0 ? `over ${peso(sum.diff)}` : `short ${peso(-sum.diff)}`) : 'open';
    return el('li', {}, el('span', {}, `${staffName(sh.staffId)} · ${timeOf(sh.openedAt)}${sh.closedAt ? `–${timeOf(sh.closedAt)}` : ''}`), el('b', { class: sh.closedAt && sum.diff < 0 ? 'short' : '' }, state), el('span', { class: 'meta' }, `Expected cash ${peso(sum.expected)}${sh.closedAt ? ` · counted ${peso(sum.counted)}` : ''}`));
  }) : [el('li', { class: 'muted' }, 'No shifts in this period.')]));
  const log = sales.filter(s => { const d = manilaDay(s.at); return d >= from && d <= to; }).slice(0, 200);
  $('#log').replaceChildren(...(log.length ? log.map(s => el('li', { class: s.status === 'void' ? 'void' : '' },
    el('span', {}, timeOf(s.at)), el('span', { class: 'what' }, `${s.lines.map(l => `${l.qty}× ${l.name}`).join(', ')}${s.customer ? ` · utang: ${s.customer}` : ''}`),
    el('span', { class: 'how' }, `${METHOD_NAME[s.method]}${s.pending ? ' · not sent yet' : ''}${s.status === 'void' ? ' · VOID' : ''}`),
    el('b', {}, money(s.total)),
    isOwner() && !s.pending && s.status !== 'void' ? el('button', { type: 'button', class: 'link danger', onclick: e => arm(e.currentTarget, 'Void?', () => change(() => server.voidSale(s.id), 'Sale voided. Stock returned.')) }, 'Void') : el('span', {}))) : [el('li', { class: 'muted' }, 'Wala pang benta.')]));
}
$$('#range button').forEach(b => b.addEventListener('click', () => { ui.range = b.dataset.r; renderReport(); }));
$('#csvBtn').addEventListener('click', () => {
  const [from, to] = rangeDays(); const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['Date', 'Time', 'Sale', 'Cashier', 'Payment', 'Reference', 'Customer', 'Item', 'Qty', 'Price', 'Amount', 'Cost', 'Discount (sale)', 'Total (sale)', 'Status']];
  visibleSales().filter(s => { const d = manilaDay(s.at); return d >= from && d <= to; }).forEach(s => s.lines.forEach((l, i) => rows.push([manilaDay(s.at), timeOf(s.at), s.id.slice(0, 8), staffName(s.staffId), METHOD_NAME[s.method], s.reference, s.customer, l.name, l.qty, l.price, round(l.qty * l.price), round(l.qty * l.cost), i ? '' : s.discount, i ? '' : saleTotals(s).total, s.status === 'void' ? 'void' : 'ok'])));
  download(`benta-${from}${from === to ? '' : `-to-${to}`}.csv`, rows.map(r => r.map(q).join(',')).join('\r\n'), 'text/csv');
});

/* ---------------- settings ---------------- */
function pinInline(li, s) {
  if ($('.pin-row', li)) return;
  const inp = el('input', { type: 'password', inputmode: 'numeric', maxlength: '6', class: 'pin-mini', 'aria-label': `New PIN for ${s.name}`, placeholder: 'New PIN' });
  const err = el('span', { class: 'err' });
  li.append(el('span', { class: 'pin-row' }, inp, el('button', { type: 'button', class: 'ghost small', onclick: () => change(() => server.editStaff(s.id, { pin: inp.value }), `PIN for ${s.name} changed.`, err) }, 'Save PIN'), err));
  inp.focus();
}
function renderSettings() {
  const f = $('#storeForm').elements;
  if (document.activeElement?.form !== $('#storeForm')) { f.name.value = S.store.name; f.low.value = S.store.low; f.receiptNote.value = S.store.receiptNote || ''; }
  $('#staffList').replaceChildren(...S.staff.map(s => el('li', { class: s.active ? '' : 'off' },
    el('span', {}, el('b', {}, s.name), ` · ${s.role === 'owner' ? 'Owner' : 'Cashier'}${s.active ? '' : ' · inactive'}`),
    el('span', { class: 'row' },
      s.active ? el('button', { type: 'button', class: 'link', onclick: e => pinInline(e.currentTarget.closest('li'), s) }, 'New PIN') : el('button', { type: 'button', class: 'link', onclick: () => change(() => server.editStaff(s.id, { active: true }), `${s.name} is active again.`) }, 'Turn on'),
      s.active ? el('button', { type: 'button', class: 'link danger', onclick: e => arm(e.currentTarget, 'Remove?', () => change(() => server.delStaff(s.id), `${s.name} removed.`)) }, 'Remove') : null))));
  $('#deviceInfo').textContent = LIVE ? `${pendingCount() ? `${queue.sales.length} sales and ${Object.keys(queue.shifts).length} shift updates waiting to be sent.` : 'Everything on this tablet is sent.'} Signed in as ${S.store.name}.` : 'Demo: everything stays in this browser.';
  $('#resetDemo').hidden = LIVE; $('#signOut').hidden = !LIVE;
}
$('#storeForm').addEventListener('submit', e => { e.preventDefault(); const f = e.target.elements; change(() => server.store({ name: f.name.value, low: Number(f.low.value) || 0, receiptNote: f.receiptNote.value }), 'Store saved.', $('.err', e.target)); });
$('#staffForm').addEventListener('submit', async e => { e.preventDefault(); const f = e.target.elements; const r = await change(() => server.addStaff({ name: f.name.value, role: f.role.value, pin: f.pin.value }), `${f.name.value.trim()} added.`, $('.err', e.target)); if (r) e.target.reset(); });
$('#syncNow').addEventListener('click', async () => { await sync(); if (!pendingCount()) { try { setBase(await server.get()); render(); toast('Up to date.'); } catch (e) { toast(e.message, true); } } });
$('#resetDemo').addEventListener('click', e => arm(e.currentTarget, 'Tap again to reset', async () => { [K.queue, K.db, K.who].forEach(k => localStorage.removeItem(k)); queue = { shifts: {}, sales: [] }; await boot(); toast('Demo store reset.'); }));
$('#signOut').addEventListener('click', e => arm(e.currentTarget, pendingCount() ? `${queue.sales.length} sales not sent! Tap again` : 'Tap again to sign out', async () => {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  [K.cache, K.queue, K.who].forEach(k => localStorage.removeItem(k)); queue = { shifts: {}, sales: [] }; showAuth();
}));

/* ---------------- shell ---------------- */
const tabs = $$('[role="tab"]');
tabs.forEach(t => t.addEventListener('click', () => { ui.tab = t.id.slice(2); render(); }));
function renderBadges() { const low = S.items.filter(i => i.stock <= S.store.low).length; const b = $('#lowBadge'); b.hidden = !low; b.textContent = low; }
function renderNet() {
  const n = $('#net'); if (!n || !S) return;
  const p = pendingCount(); const off = LIVE && !navigator.onLine;
  n.textContent = !LIVE ? 'Demo · this browser' : off ? `Offline · ${p ? `${queue.sales.length} sales waiting` : 'selling still works'}` : syncing ? 'Sending…' : p ? `${queue.sales.length} sales waiting to send` : 'Online · all sent';
  n.className = `net${off ? ' off' : p ? ' wait' : ''}`;
}
function render() {
  if (!S || !me) return;
  document.title = `${S.store.name} — RZ Tindahan`;
  $('#storeName').textContent = S.store.name; $('#meName').textContent = `${me.name} · ${isOwner() ? 'Owner' : 'Cashier'}`;
  $$('[data-owner]').forEach(t => { t.hidden = !isOwner(); });
  tabs.forEach(t => { const on = t.id.slice(2) === ui.tab; t.setAttribute('aria-selected', String(on)); $(`#${t.getAttribute('aria-controls')}`).hidden = !on; });
  const sh = openShift();
  $('#shiftOpen').hidden = !!sh || ui.tab !== 'sell'; $('#closeShiftBtn').hidden = !sh;
  $('#v-sell').classList.toggle('closed', !sh);
  renderBadges(); renderNet(); renderSell();
  if (ui.tab === 'stock') renderStock();
  if (ui.tab === 'report') renderReport();
  if (ui.tab === 'settings') renderSettings();
}

/* ---------------- sign in and start ---------------- */
function showAuth() { $('#appView').hidden = true; $('#lockView').hidden = true; $('#authView').hidden = false; }
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements; const err = $('.err', e.target); err.textContent = '';
  try { await api('/auth/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } }); e.target.reset(); await boot(); } catch (ex) { err.textContent = ex.message; }
});
window.addEventListener('online', () => { renderNet(); sync(); });
window.addEventListener('offline', renderNet);
setInterval(() => { if (pendingCount()) sync(); }, 30_000);

async function boot() {
  $('#strip').hidden = LIVE;
  if (LIVE) {
    server = liveServer;
    try { setBase(await server.get()); }
    catch (e) {
      if (e.status === 401) { showAuth(); return; }
      const cached = read(K.cache, null); // offline start: use what this tablet saw last
      if (!cached) { showAuth(); toast('No internet, and this tablet has not been set up yet.', true); return; }
      setBase(cached);
    }
  } else {
    let db = read(K.db, null); if (!db) { db = await demoSeed(); write(K.db, db); }
    server = demoServer(db); setBase(await server.get());
  }
  const who = read(K.who, null);
  me = S.staff.find(s => s.id === who && s.active) || null;
  if (me) enter(); else showLock();
  sync();
}
boot();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
