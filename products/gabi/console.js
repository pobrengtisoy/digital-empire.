/* RZ Gabi club console. Demo club in this browser; ?live is the real console on the RZ server. */
import { demoLoad, demoSave, photoUrl, peso, has, PLAN_NAME, manilaToday, longDate, whenLabel, dayNum, monthName, uid } from './common.js';

const { $, $$, el, copy } = window.RZ;
const LIVE = new URLSearchParams(location.search).has('live');
const TG = 'https://t.me/BRZBSST';
let S = null; let tab = 'door'; let doorNight = null; let selTable = null; let edPhotos = []; let uploading = 0;

/* ---------- stores ---------- */
async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, { method: opts.method || 'GET', credentials: 'same-origin', headers: opts.raw ? { 'content-type': opts.type } : opts.body ? { 'content-type': 'application/json' } : {}, body: opts.raw || (opts.body ? JSON.stringify(opts.body) : undefined) });
  let data = {}; try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return data;
}
let D = null;
const demoPlan = () => sessionStorage.getItem('rz-gabi-preview') || 'full';
const out = () => { if (!demoSave(D)) throw new Error('Demo storage is full. Reset the demo.'); const p = demoPlan(); return { club: { ...D.club, plan: p }, today: manilaToday(), photosReady: true, events: D.events.slice().sort((a, b) => a.date.localeCompare(b.date)), tables: has(p, 'vip') ? D.tables : [], packages: has(p, 'vip') ? D.packages : [], reservations: has(p, 'vip') ? D.reservations : [], promoters: has(p, 'full') ? D.promoters : [], guests: has(p, 'full') ? D.guests : [] }; };
const need = (ok, msg) => { if (!ok) throw new Error(msg); };
const store = LIVE ? {
  load: () => api('/gabi'),
  profile: b => api('/gabi/profile', { method: 'PUT', body: b }),
  addEvent: b => api('/gabi/events', { method: 'POST', body: b }), editEvent: (id, b) => api(`/gabi/events/${id}`, { method: 'PATCH', body: b }), delEvent: id => api(`/gabi/events/${id}`, { method: 'DELETE' }),
  addTable: b => api('/gabi/tables', { method: 'POST', body: b }), editTable: (id, b) => api(`/gabi/tables/${id}`, { method: 'PATCH', body: b }), delTable: id => api(`/gabi/tables/${id}`, { method: 'DELETE' }),
  addPkg: b => api('/gabi/packages', { method: 'POST', body: b }), editPkg: (id, b) => api(`/gabi/packages/${id}`, { method: 'PATCH', body: b }), delPkg: id => api(`/gabi/packages/${id}`, { method: 'DELETE' }),
  setRes: (id, status) => api(`/gabi/reservations/${id}`, { method: 'PATCH', body: { status } }),
  addPromo: b => api('/gabi/promoters', { method: 'POST', body: b }), delPromo: id => api(`/gabi/promoters/${id}`, { method: 'DELETE' }),
  setGuest: (id, status) => api(`/gabi/guests/${id}`, { method: 'PATCH', body: { status } }),
  checkin: code => api('/gabi/checkin', { method: 'POST', body: { code } }),
  upload: async blob => (await api('/photos', { method: 'POST', raw: blob, type: blob.type })).key,
  site: slug => new URL(`index.html?club=${encodeURIComponent(slug)}`, location.href).href,
} : {
  load: async () => { D = demoLoad(); return out(); },
  profile: async b => { const { name, ...rest } = b; Object.assign(D.club, rest, { name: name || D.club.name }); return out(); },
  addEvent: async b => { need(b.title, 'Name the night.'); D.events.push({ ...b, id: uid() }); return out(); },
  editEvent: async (id, b) => { Object.assign(D.events.find(e => e.id === id), b); return out(); },
  delEvent: async id => { D.events = D.events.filter(e => e.id !== id); D.guests = D.guests.filter(g => g.eventId !== id); return out(); },
  addTable: async b => { D.tables.push({ ...b, id: uid(), x: 50, y: 50 }); return out(); },
  editTable: async (id, b) => { Object.assign(D.tables.find(t => t.id === id), b); return out(); },
  delTable: async id => { D.tables = D.tables.filter(t => t.id !== id); return out(); },
  addPkg: async b => { D.packages.push({ ...b, id: uid() }); return out(); },
  editPkg: async (id, b) => { Object.assign(D.packages.find(p => p.id === id), b); return out(); },
  delPkg: async id => { D.packages = D.packages.filter(p => p.id !== id); return out(); },
  setRes: async (id, status) => {
    const r = D.reservations.find(x => x.id === id);
    if (['pending', 'confirmed', 'arrived'].includes(status) && !['pending', 'confirmed', 'arrived'].includes(r.status)) need(!D.reservations.some(x => x.id !== id && x.date === r.date && x.tableId === r.tableId && ['pending', 'confirmed', 'arrived'].includes(x.status)), `${r.tableName} is already booked that night.`);
    r.status = status; r.updatedAt = new Date().toISOString(); return out();
  },
  addPromo: async b => { const code = String(b.code).toUpperCase().replace(/[^A-Z0-9]/g, ''); need(code.length >= 3, 'Use a promo code of 3 to 16 letters or numbers.'); need(!D.promoters.some(p => p.code === code), `Code ${code} is already used.`); D.promoters.push({ id: uid(), name: b.name, code }); return out(); },
  delPromo: async id => { D.promoters = D.promoters.filter(p => p.id !== id); return out(); },
  setGuest: async (id, status) => { Object.assign(D.guests.find(g => g.id === id), { status, checkedInAt: status === 'in' ? new Date().toISOString() : '' }); return out(); },
  checkin: async code => {
    const c = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-6);
    need(c.length === 6, 'Scan the QR or type the 6-letter pass code.');
    const g = D.guests.find(x => x.code === c); need(g, `No pass with code ${c}.`);
    if (g.status === 'cancelled') return { result: 'cancelled', guest: g };
    if (g.eventDate !== manilaToday() && g.eventDate !== manilaToday(-1)) return { result: 'wrong-night', guest: g };
    if (g.status === 'in') return { result: 'already', guest: g };
    g.status = 'in'; g.checkedInAt = new Date().toISOString(); demoSave(D); return { result: 'in', guest: g };
  },
  upload: blob => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(blob); }),
  site: () => new URL('index.html', location.href).href,
};
const purl = ref => (ref && ref.startsWith('data:image/') ? ref : photoUrl(ref));

function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = `toast show${bad ? ' bad' : ''}`; clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 3000); }
async function run(fn, errEl) {
  try { if (errEl) errEl.textContent = ''; const r = await fn(); if (r && r.club) { S = r; render(); } return r || true; }
  catch (e) { if (e.status === 401 && LIVE) { showAuth(); return null; } if (errEl) errEl.textContent = e.message; else toast(e.message, true); return null; }
}
const plan = () => S.club.plan;

/* ---------- render ---------- */
function render() {
  $('#cName').textContent = S.club.name; $('#planName').textContent = PLAN_NAME[plan()];
  const site = store.site(S.club.slug); $('#siteLink').href = site; $('#siteLink').textContent = site.replace(/^https?:\/\//, '');
  $$('.c-tabs [data-min]').forEach(b => b.classList.toggle('locked', !has(plan(), b.dataset.min)));
  $$('[data-min]').filter(n => !n.closest('.c-tabs')).forEach(n => { n.hidden = !has(plan(), n.dataset.min); });
  $$('[data-only]').forEach(n => { n.hidden = !n.dataset.only.split(' ').includes(plan()); });
  $$('.plan-preview button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.plan === plan())));
  $('#nPending').textContent = S.reservations.filter(r => r.status === 'pending' && r.date >= S.today).length || '';
  renderDoor(); renderEvents(); renderBookings(); renderCrowd(); renderProfile();
  showTab(tab);
}

function upsell(min, lines) {
  return el('div', { class: 'upsell' }, el('h3', {}, `Unlock with the ${PLAN_NAME[min]} plan`), el('ul', {}, ...lines.map(l => el('li', {}, l))),
    el('a', { class: 'cta small', href: TG, target: '_blank', rel: 'noopener' }, 'Ask RZ to upgrade'));
}

/* Tonight / door */
function nightsList() { return S.events.filter(e => e.date >= manilaToday(-1)).sort((a, b) => a.date.localeCompare(b.date)); }
function renderDoor() {
  const list = nightsList();
  if (!doorNight || !list.some(e => e.id === doorNight)) doorNight = (list.find(e => e.date >= S.today) || list[0])?.id || null;
  $('#doorNight').replaceChildren(...list.map(e => el('option', { value: e.id }, `${whenLabel(e.date, S.today)} ${dayNum(e.date)} ${monthName(e.date)} · ${e.title}`)));
  if (doorNight) $('#doorNight').value = doorNight;
  const ev = S.events.find(e => e.id === doorNight);
  const guests = S.guests.filter(g => g.eventId === doorNight && g.status !== 'cancelled');
  const heads = g => 1 + (g.plus || 0);
  const res = ev ? S.reservations.filter(r => r.date === ev.date && !['declined', 'cancelled'].includes(r.status)) : [];
  const stat = (k, v) => el('div', {}, el('dt', {}, k), el('dd', {}, String(v)));
  $('#doorStats').replaceChildren(
    stat('On the list', has(plan(), 'full') ? guests.reduce((s, g) => s + heads(g), 0) : '—'),
    stat('Came in', has(plan(), 'full') ? guests.filter(g => g.status === 'in').reduce((s, g) => s + heads(g), 0) : '—'),
    stat('Tables', has(plan(), 'vip') ? res.length : '—'),
    stat('Table spend', has(plan(), 'vip') ? peso(res.reduce((s, r) => s + r.price, 0)) : '—'));
  $('#doorUpsell').replaceChildren(plan() === 'site'
    ? upsell('vip', ['VIP table booking on a live floor plan', 'Packages and deposits', 'Booking inbox for your team'])
    : upsell('full', ['Guest list with QR passes', 'Door check-in from any phone', 'Promoter codes and nightly reports']));
  $('#doorTables').replaceChildren(...res.map(resCard));
  $('#doorTablesEmpty').hidden = res.length > 0;
  const qtxt = $('#guestSearch').value.trim().toUpperCase();
  const shown = guests.filter(g => !qtxt || g.name.toUpperCase().includes(qtxt) || g.code.includes(qtxt)).sort((a, b) => (a.status === 'in') - (b.status === 'in') || a.name.localeCompare(b.name));
  $('#doorGuests').replaceChildren(...shown.slice(0, 300).map(g => el('li', { class: g.status },
    el('span', { class: 'g-name' }, el('b', {}, g.name), el('span', {}, [g.plus ? `+${g.plus}` : 'solo', g.promo ? `via ${g.promo}` : ''].filter(Boolean).join(' · '))),
    el('code', {}, g.code),
    g.status === 'in' ? el('button', { type: 'button', class: 'pill in', onclick: () => run(() => store.setGuest(g.id, 'listed')) }, 'In ✓') : el('button', { type: 'button', class: 'mini-cta', onclick: () => run(() => store.setGuest(g.id, 'in')).then(r => r && toast(`${g.name} is in.`)) }, 'Check in'))));
}
$('#doorNight').addEventListener('change', e => { doorNight = e.target.value; renderDoor(); });
$('#guestSearch').addEventListener('input', renderDoor);

function verdict(kind, title, line) {
  const v = $('#verdict'); v.hidden = false; v.className = `verdict ${kind}`;
  v.replaceChildren(el('b', {}, title), el('span', {}, line));
}
async function doCheckin(code) {
  try {
    const r = await store.checkin(code);
    const g = r.guest; const who = `${g.name}${g.plus ? ` + ${g.plus}` : ''}${g.promo ? ` · via ${g.promo}` : ''}`;
    if (r.result === 'in') verdict('in', 'Let in', who);
    else if (r.result === 'already') verdict('already', 'Already inside', `${who} · checked in ${new Date(g.checkedInAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`);
    else if (r.result === 'wrong-night') verdict('bad', 'Wrong night', `${who} · pass is for ${longDate(g.eventDate)}`);
    else verdict('bad', 'Cancelled pass', who);
    if (r.result === 'in') { S = await store.load(); render(); }
  } catch (e) { verdict('bad', 'Not found', e.message); }
  $('#scanCode').value = ''; $('#scanCode').focus();
}
$('#scanForm').addEventListener('submit', e => { e.preventDefault(); const c = $('#scanCode').value.trim(); if (c) doCheckin(c); });

/* QR scanning with the phone camera where the browser supports it (Android Chrome); typing the code works everywhere. */
let camStream = null; let detector = null;
if ('BarcodeDetector' in window) { $('#camBtn').hidden = false; }
$('#camBtn').addEventListener('click', async () => {
  if (camStream) { stopCam(); return; }
  try {
    detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const v = $('#cam'); v.srcObject = camStream; v.hidden = false; await v.play();
    $('#camBtn').textContent = 'Stop camera';
    const tick = async () => {
      if (!camStream) return;
      try { const codes = await detector.detect(v); if (codes[0]) { await doCheckin(codes[0].rawValue); await new Promise(r => setTimeout(r, 1500)); } } catch { /* keep scanning */ }
      requestAnimationFrame(tick);
    };
    tick();
  } catch { toast('Camera not available. Type the pass code instead.', true); stopCam(); }
});
function stopCam() { camStream?.getTracks().forEach(t => t.stop()); camStream = null; $('#cam').hidden = true; $('#camBtn').textContent = 'Scan QR'; }

/* Reservations */
const RES = { pending: 'Pending', confirmed: 'Confirmed', arrived: 'Arrived', declined: 'Declined', cancelled: 'Cancelled' };
function resCard(r) {
  const sel = el('select', { 'aria-label': `Status of ${r.name}’s booking`, onchange: e => run(() => store.setRes(r.id, e.target.value)).then(x => x && toast(`${r.tableName}: ${RES[e.target.value]}.`)) }, ...Object.entries(RES).map(([v, t]) => el('option', { value: v }, t)));
  sel.value = r.status;
  const tel = String(r.mobile).replace(/[^0-9+]/g, '');
  const msg = `Hi ${r.name.split(' ')[0]}! ${S.club.name} here. Your table ${r.tableName} on ${longDate(r.date)} is CONFIRMED${r.packageName ? ` (${r.packageName} package)` : ''}. Minimum spend ${peso(r.price)}. See you tonight!`;
  return el('li', { class: `card s-${r.status}` },
    el('div', { class: 'card-top' }, el('b', {}, r.tableName), el('span', { class: `pill ${r.status}` }, RES[r.status])),
    el('p', {}, `${longDate(r.date)} · ${r.name} · ${r.guests} guests`),
    el('p', {}, el('span', { class: 'amt' }, peso(r.price)), r.packageName ? ` · ${r.packageName}` : '', r.promo ? ` · via ${r.promo}` : ''),
    r.reference ? el('p', {}, `Deposit ref: ${r.reference}`) : null,
    r.notes ? el('p', {}, `“${r.notes}”`) : null,
    el('div', { class: 'card-act' }, sel,
      el('a', { class: 'mini-cta ghost', href: `tel:${tel}` }, 'Call'),
      el('button', { type: 'button', class: 'mini-cta ghost', onclick: async () => toast((await copy(msg)) ? 'Confirmation text copied.' : 'Could not copy.') }, 'Copy confirmation')));
}
function renderBookings() {
  const up = S.reservations.filter(r => r.date >= S.today).sort((a, b) => (a.status !== 'pending') - (b.status !== 'pending') || a.date.localeCompare(b.date));
  $('#resList').replaceChildren(...up.map(resCard)); $('#resEmpty').hidden = up.length > 0;
  $('#editSpots').replaceChildren(...S.tables.map(t => {
    const b = el('button', { type: 'button', class: `spot${t.capacity >= 12 ? ' big' : ''}${selTable === t.id ? ' sel' : ''}`, onclick: ev => { ev.stopPropagation(); selTable = t.id; renderBookings(); } }, el('span', {}, t.name));
    b.style.setProperty('--x', `${t.x}%`); b.style.setProperty('--y', `${t.y}%`);
    return el('li', {}, b);
  }));
  $('#tableList').replaceChildren(...S.tables.map(t => el('li', { class: selTable === t.id ? 'sel' : '' },
    el('div', {}, el('b', {}, t.name), el('span', {}, `${t.zone || 'Floor'} · up to ${t.capacity} · min ${peso(t.minSpend)}`)),
    el('button', { type: 'button', class: 'mini-cta ghost', onclick: () => openTable(t) }, 'Edit'))));
  $('#pkgList').replaceChildren(...S.packages.map(p => el('li', {},
    el('div', {}, el('b', {}, `${p.name} · ${peso(p.price)}`), el('span', {}, `Up to ${p.pax} · ${p.inclusions}`)),
    el('button', { type: 'button', class: 'mini-cta ghost', onclick: () => openPkg(p) }, 'Edit'))));
}
$('#editFloor').addEventListener('click', e => {
  if (!selTable) { toast('Select a table first, then tap where it goes.'); return; }
  const r = $('#editFloor').getBoundingClientRect();
  const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 10; const y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 10;
  run(() => store.editTable(selTable, { x, y }));
});

/* Promoters & reports */
function renderCrowd() {
  const spend = list => peso(list.reduce((s, r) => s + r.price, 0));
  const okRes = S.reservations.filter(r => !['declined', 'cancelled'].includes(r.status));
  const okG = S.guests.filter(g => g.status !== 'cancelled');
  $('#promoReport tbody').replaceChildren(...S.promoters.map(p => {
    const g = okG.filter(x => x.promo === p.code); const r = okRes.filter(x => x.promo === p.code);
    return el('tr', {}, el('td', {}, p.name), el('td', {}, el('code', {}, p.code)), el('td', { class: 'num' }, String(g.length)), el('td', { class: 'num' }, String(g.filter(x => x.status === 'in').length)), el('td', { class: 'num' }, String(r.length)), el('td', { class: 'num' }, spend(r)),
      el('td', {}, el('button', { type: 'button', class: 'linkbtn danger', onclick: () => { if (confirm(`Remove ${p.name}? Their past guests keep the code.`)) run(() => store.delPromo(p.id)); } }, 'Remove')));
  }));
  $('#nightReport tbody').replaceChildren(...S.events.filter(e => e.date <= S.today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(e => {
    const g = okG.filter(x => x.eventId === e.id); const inn = g.filter(x => x.status === 'in').length; const r = okRes.filter(x => x.date === e.date);
    return el('tr', {}, el('td', {}, `${dayNum(e.date)} ${monthName(e.date)} · ${e.title}`), el('td', { class: 'num' }, String(g.length)), el('td', { class: 'num' }, String(inn)), el('td', { class: 'num' }, g.length ? `${Math.round((inn / g.length) * 100)}%` : '—'), el('td', { class: 'num' }, String(r.length)), el('td', { class: 'num' }, spend(r)));
  }));
}
$('#promoForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements;
  const r = await run(() => store.addPromo({ name: f.name.value.trim(), code: f.code.value.trim() }), $('#promoErr'));
  if (r) { e.target.reset(); toast('Promoter added. Their code works on the guest list and table booking.'); }
});

/* Events */
function renderEvents() {
  const list = S.events.slice().sort((a, b) => a.date.localeCompare(b.date)).filter(e => e.date >= manilaToday(-7));
  $('#evList').replaceChildren(...list.map(e => el('li', { class: `card${e.status === 'off' ? ' off' : ''}` },
    el('div', { class: 'card-top' }, el('b', {}, e.title), el('span', { class: 'pill' }, `${whenLabel(e.date, S.today)} ${dayNum(e.date)} ${monthName(e.date)}`)),
    el('p', {}, e.lineup.join(' · ') || 'Line-up to follow'),
    el('p', {}, [e.genre, e.doors ? `Doors ${e.doors}` : '', e.cover, e.featured ? 'Featured' : '', e.status === 'off' ? 'Hidden' : ''].filter(Boolean).join(' · ')),
    el('div', { class: 'card-act' }, el('button', { type: 'button', class: 'mini-cta ghost', onclick: () => openEvent(e) }, 'Edit')))));
}
let editing = null;
function openEvent(e) {
  editing = e; const f = $('#evForm').elements;
  f.date.value = e?.date || manilaToday(); f.title.value = e?.title || ''; f.lineup.value = (e?.lineup || []).join(', '); f.genre.value = e?.genre || ''; f.doors.value = e?.doors || '10 PM'; f.cover.value = e?.cover || ''; f.note.value = e?.note || ''; f.featured.checked = !!e?.featured; f.off.checked = e?.status === 'off';
  $('#evDelete').hidden = !e; $('.err', $('#evForm')).textContent = ''; $('#evDlgTitle').textContent = e ? 'Edit night' : 'New night'; $('#evDlg').showModal();
}
$('#newEvent').addEventListener('click', () => openEvent(null));
$('#evForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements;
  const body = { date: f.date.value, title: f.title.value.trim(), lineup: f.lineup.value.split(',').map(s => s.trim()).filter(Boolean), genre: f.genre.value.trim(), doors: f.doors.value.trim(), cover: f.cover.value.trim(), note: f.note.value.trim(), featured: f.featured.checked, status: f.off.checked ? 'off' : 'on' };
  const r = await run(() => (editing ? store.editEvent(editing.id, body) : store.addEvent(body)), $('.err', e.target));
  if (r) { $('#evDlg').close(); toast(editing ? 'Night saved.' : 'Night added to your website.'); }
});
$('#evDelete').addEventListener('click', async () => { if (!confirm(`Delete ${editing.title} and its guest list?`)) return; const r = await run(() => store.delEvent(editing.id), $('.err', $('#evForm'))); if (r) $('#evDlg').close(); });

/* Tables & packages */
let edTable = null; let edPkg = null;
function openTable(t) { edTable = t; const f = $('#tbForm').elements; f.name.value = t?.name || `VIP ${S.tables.length + 1}`; f.zone.value = t?.zone || 'Main floor'; f.capacity.value = t?.capacity || 6; f.minSpend.value = t?.minSpend ?? 8000; $('#tbDelete').hidden = !t; $('.err', $('#tbForm')).textContent = ''; $('#tbDlg').showModal(); }
$('#newTable').addEventListener('click', () => openTable(null));
$('#tbForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements;
  const body = { name: f.name.value.trim(), zone: f.zone.value.trim(), capacity: Number(f.capacity.value), minSpend: Number(f.minSpend.value) };
  const r = await run(() => (edTable ? store.editTable(edTable.id, body) : store.addTable({ ...body, x: 50, y: 50 })), $('.err', e.target));
  if (r) { $('#tbDlg').close(); if (!edTable) { selTable = S.tables[S.tables.length - 1]?.id; renderBookings(); toast('Table added in the middle. Tap the floor plan to move it.'); } }
});
$('#tbDelete').addEventListener('click', async () => { if (!confirm(`Delete ${edTable.name}?`)) return; const r = await run(() => store.delTable(edTable.id), $('.err', $('#tbForm'))); if (r) $('#tbDlg').close(); });
function openPkg(p) { edPkg = p; const f = $('#pkForm').elements; f.name.value = p?.name || ''; f.price.value = p?.price ?? ''; f.pax.value = p?.pax || 6; f.inclusions.value = p?.inclusions || ''; $('#pkDelete').hidden = !p; $('.err', $('#pkForm')).textContent = ''; $('#pkDlg').showModal(); }
$('#newPkg').addEventListener('click', () => openPkg(null));
$('#pkForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements;
  const body = { name: f.name.value.trim(), price: Number(f.price.value), pax: Number(f.pax.value), inclusions: f.inclusions.value.trim() };
  const r = await run(() => (edPkg ? store.editPkg(edPkg.id, body) : store.addPkg(body)), $('.err', e.target));
  if (r) $('#pkDlg').close();
});
$('#pkDelete').addEventListener('click', async () => { if (!confirm(`Delete ${edPkg.name}?`)) return; const r = await run(() => store.delPkg(edPkg.id), $('.err', $('#pkForm'))); if (r) $('#pkDlg').close(); });

/* Club page & photos */
function renderProfile() {
  const f = $('#profileForm').elements; const c = S.club;
  if ($('#profileForm').contains(document.activeElement)) return;
  ['name', 'tagline', 'about', 'address', 'city', 'hours', 'dressCode', 'mobile', 'messenger', 'instagram'].forEach(k => { f[k].value = c[k] || ''; });
  f.age.value = c.age || '18+';
  if (!uploading) { edPhotos = [...(c.photos || [])]; renderPhotos(); }
}
function renderPhotos() {
  $('#phList').replaceChildren(...edPhotos.map((ref, i) => el('li', { class: 'ph' }, el('img', { src: purl(ref), alt: `Photo ${i + 1}` }), i === 0 ? el('span', { class: 'cover' }, 'Hero') : null,
    el('div', { class: 'ph-tools' },
      i > 0 ? el('button', { type: 'button', 'aria-label': `Move photo ${i + 1} earlier`, onclick: () => { [edPhotos[i - 1], edPhotos[i]] = [edPhotos[i], edPhotos[i - 1]]; renderPhotos(); } }, '←') : null,
      el('button', { type: 'button', 'aria-label': `Remove photo ${i + 1}`, onclick: () => { edPhotos.splice(i, 1); renderPhotos(); } }, '×')))));
  const ready = !LIVE || S.photosReady;
  $('.ph-add').hidden = !ready || edPhotos.length >= 16;
}
async function shrink(file) {
  const max = LIVE ? 1800 : 900;
  const bmp = await createImageBitmap(file); const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); bmp.close?.();
  const enc = (t, q) => new Promise(r => cv.toBlob(r, t, q));
  for (const q of LIVE ? [0.82, 0.7, 0.55] : [0.6, 0.45]) {
    let b = await enc('image/webp', q); if (!b || b.type !== 'image/webp') b = await enc('image/jpeg', q + 0.05);
    if (b && b.size <= (LIVE ? 1_400_000 : 160_000)) return b;
  }
  throw new Error('That photo is too large even after shrinking.');
}
$('#phInput').addEventListener('change', async e => {
  const files = [...e.target.files].slice(0, 16 - edPhotos.length); e.target.value = '';
  uploading += files.length; let n = 0; let bad = 0;
  for (const file of files) {
    $('#phStatus').textContent = `Uploading ${n + 1} of ${files.length}…`;
    try { edPhotos.push(await store.upload(await shrink(file))); renderPhotos(); } catch (ex) { bad++; toast(ex.message, true); }
    n++; uploading--;
  }
  $('#phStatus').textContent = bad ? `${n - bad} added, ${bad} failed.` : `${n} added. Save the club page to keep them.`;
});
$('#profileForm').addEventListener('submit', async e => {
  e.preventDefault(); if (uploading) return; const f = e.target.elements;
  const body = Object.fromEntries(['name', 'tagline', 'about', 'address', 'city', 'hours', 'dressCode', 'age', 'mobile', 'messenger', 'instagram'].map(k => [k, f[k].value.trim()]));
  body.photos = edPhotos; document.activeElement?.blur();
  const r = await run(() => store.profile(body), $('.err', e.target));
  if (r) toast('Club page saved. Your website shows it now.');
});
$('#copySite').addEventListener('click', async () => toast((await copy($('#siteLink').href)) ? 'Website link copied.' : 'Could not copy.'));

/* Tabs & plan preview */
const LOCK_INFO = { bookings: ['vip', ['Guests pick a table on your floor plan', 'Bottle packages with prices', 'Pending, confirmed and arrived in one list']], crowd: ['full', ['Promoter codes for guest list and tables', 'Who brought how many, and table spend', 'Show rate for every night']] };
function showTab(name) {
  tab = name;
  $$('.c-tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === name)));
  $$('.tab').forEach(s => { s.hidden = s.id !== `tab-${name}`; });
  Object.entries(LOCK_INFO).forEach(([id, [min, lines]]) => {
    const sec = $(`#tab-${id}`); const locked = !has(plan(), min);
    $('.tab-body', sec).hidden = locked;
    $('.lock-slot', sec).replaceChildren(...(locked ? [upsell(min, lines)] : []));
  });
}
$$('.c-tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
$$('.plan-preview button').forEach(b => b.addEventListener('click', async () => { sessionStorage.setItem('rz-gabi-preview', b.dataset.plan); S = await store.load(); render(); }));

/* ---------- sign in ---------- */
function showAuth() { $('#authView').hidden = false; $('#appView').hidden = true; }
const authTabs = [$('#tabLogin'), $('#tabSignup')];
authTabs.forEach(t => t.addEventListener('click', () => authTabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); $(`#${x.getAttribute('aria-controls')}`).hidden = !on; })));
const su = $('#signupForm').elements;
su.businessName.addEventListener('input', () => { if (!su.slug.dataset.touched) su.slug.value = su.businessName.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); });
su.slug.addEventListener('input', () => { su.slug.dataset.touched = '1'; });
async function auth(form, path, body) {
  const btn = $('button[type="submit"]', form); const err = $('.err', form); err.textContent = ''; btn.disabled = true;
  try { await api(path, { method: 'POST', body }); form.reset(); await boot(); } catch (ex) { err.textContent = ex.message; } finally { btn.disabled = false; }
}
$('#loginForm').addEventListener('submit', e => { e.preventDefault(); const f = e.target.elements; auth(e.target, '/auth/login', { email: f.email.value, password: f.password.value }); });
$('#signupForm').addEventListener('submit', e => { e.preventDefault(); auth(e.target, '/auth/signup', { businessName: su.businessName.value, slug: su.slug.value, email: su.email.value, password: su.password.value }); });
$('#logoutBtn').addEventListener('click', async () => { stopCam(); await api('/auth/logout', { method: 'POST' }).catch(() => {}); showAuth(); });

async function boot() {
  try {
    if (LIVE) { $('#strip').hidden = true; $('#logoutBtn').hidden = false; await api('/me'); }
    S = await store.load();
    $('#authView').hidden = true; $('#appView').hidden = false;
    render();
  } catch (e) { if (e.status === 401) showAuth(); else toast(e.message, true); }
}
boot();
