/* RZ Gabi club website. No ?club → demo club SINAG (this browser); ?club=slug → a real club from the RZ server. */
import { demoLoad, demoSave, photoUrl, peso, has, PLAN_NAME, manilaToday, dayName, dayNum, monthName, longDate, whenLabel, passCode, uid } from './common.js';

const { $, $$, el } = window.RZ;
const q = new URLSearchParams(location.search);
const SLUG = (q.get('club') || '').toLowerCase();
const LIVE = /^[a-z0-9-]{3,40}$/.test(SLUG);
let C = null; let E = []; let T = []; let P = []; let taken = {}; let today = manilaToday();
let plan = 'full'; let night = null; let table = null; let pkg = null;

async function load() {
  if (!LIVE) {
    const d = demoLoad();
    C = d.club; E = d.events.filter(e => e.status === 'on' && e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    T = d.tables; P = d.packages; taken = {};
    d.reservations.filter(r => ['pending', 'confirmed', 'arrived'].includes(r.status)).forEach(r => { (taken[r.date] ||= []).push(r.tableId); });
    plan = ['site', 'vip', 'full'].includes(q.get('plan')) ? q.get('plan') : (sessionStorage.getItem('rz-gabi-preview') || 'full');
    return;
  }
  const res = await fetch(`/api/public/gabi/${SLUG}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'This club’s page does not exist.');
  C = data.club; E = data.events; T = data.tables; P = data.packages; taken = data.taken || {}; today = data.today || today; plan = C.plan;
}

/* ---------- plan gates ---------- */
function applyPlan() {
  $$('[data-min]').forEach(n => { n.hidden = !has(plan, n.dataset.min); });
  $$('[data-max]').forEach(n => { n.hidden = plan !== n.dataset.max; });
  $$('.plan-tag').forEach(n => { n.hidden = LIVE; });
  $$('.plan-preview button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.plan === plan)));
}
$$('.plan-preview button').forEach(b => b.addEventListener('click', () => {
  plan = b.dataset.plan; sessionStorage.setItem('rz-gabi-preview', plan);
  applyPlan(); renderEvents();
}));

/* ---------- paint ---------- */
function paint() {
  document.title = `${C.name} — ${C.tagline || 'Nights, tables and guest list'}`;
  $('#navName').textContent = C.name; $('#clubName').textContent = C.name; $('#clubName').dataset.text = C.name;
  $('#tagline').textContent = C.tagline;
  const photos = C.photos || [];
  if (photos[0]) $('#heroImg').src = photoUrl(photos[0]);
  const door = photos.find(p => /door/.test(p)) || photos[photos.length - 1];
  if (door) $('#listImg').src = photoUrl(door);
  $('#heroMeta').textContent = [C.hours, C.city, C.age ? `${C.age} only` : ''].filter(Boolean).join(' · ');
  const t = E.find(e => e.date === today) || null;
  $('#tonight').hidden = !t;
  if (t) $('#tonightText').textContent = `Tonight · ${t.title}${t.doors ? ` · doors ${t.doors}` : ''}`;
  $('#shots').replaceChildren(...photos.map((p, i) => el('li', { class: `shot s${i % 6}` }, el('img', { src: photoUrl(p), alt: '', loading: 'lazy', decoding: 'async' }))));
  $('#gallery').hidden = !photos.length;
  $('#viTitle').textContent = C.name; $('#about').textContent = C.about;
  const fact = (k, v) => (v ? [el('dt', {}, k), el('dd', {}, v)] : []);
  $('#facts').replaceChildren(...fact('Where', [C.address, C.city].filter(Boolean).join(', ')), ...fact('Open', C.hours), ...fact('Dress code', C.dressCode), ...fact('Age', C.age ? `${C.age} · valid ID at the door` : ''));
  const tel = String(C.mobile || '').replace(/[^0-9+]/g, '');
  const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([C.name, C.address, C.city, 'Philippines'].filter(Boolean).join(', '))}`;
  $('#contact').replaceChildren(...[
    el('a', { class: 'cta ghost', href: map, target: '_blank', rel: 'noopener' }, 'Directions'),
    tel ? el('a', { class: 'cta ghost', href: `tel:${tel}` }, 'Call') : null,
    C.messenger ? el('a', { class: 'cta ghost', href: `https://m.me/${C.messenger}`, target: '_blank', rel: 'noopener' }, 'Messenger') : null,
    C.instagram ? el('a', { class: 'cta ghost', href: `https://instagram.com/${C.instagram}`, target: '_blank', rel: 'noopener' }, 'Instagram') : null].filter(Boolean));
  $('#footName').textContent = C.name; $('#year').textContent = new Date().getFullYear();
  $('#strip').hidden = LIVE;
}

function renderEvents() {
  $('#posters').replaceChildren(...E.slice(0, 12).map((e, i) => el('li', { class: `poster p${i % 4}${e.featured ? ' feat' : ''}` },
    el('div', { class: 'p-date' }, el('span', { class: 'p-when' }, whenLabel(e.date, today)), el('b', {}, String(dayNum(e.date))), el('span', {}, monthName(e.date))),
    el('h3', {}, e.title),
    e.lineup.length ? el('ul', { class: 'p-lineup' }, ...e.lineup.map(n => el('li', {}, n))) : null,
    el('p', { class: 'p-meta' }, [e.genre, e.doors ? `Doors ${e.doors}` : '', e.cover].filter(Boolean).join(' · ')),
    el('div', { class: 'p-act' },
      has(plan, 'vip') && T.length ? el('a', { class: 'mini-cta', href: '#tables', onclick: () => pickNight(e.date) }, 'Book a table') : null,
      has(plan, 'full') ? el('a', { class: 'mini-cta ghost', href: '#list', onclick: () => { $('#glForm').elements.eventId.value = e.id; } }, 'Guest list') : null))));
  $('#noEvents').hidden = E.length > 0;
  const sel = $('#glForm').elements.eventId;
  sel.replaceChildren(...E.map(e => el('option', { value: e.id }, `${whenLabel(e.date, today)} ${dayNum(e.date)} ${monthName(e.date)} · ${e.title}`)));
  renderNights();
}

/* ---------- table booking ---------- */
function renderNights() {
  $('#nights').replaceChildren(...E.slice(0, 10).map(e => el('button', { type: 'button', 'aria-pressed': String(e.date === night), onclick: () => pickNight(e.date) },
    el('span', {}, whenLabel(e.date, today)), el('b', {}, `${dayNum(e.date)} ${monthName(e.date)}`), el('small', {}, e.title))));
  if (!night && E[0]) pickNight(E[0].date);
}
function pickNight(date) {
  night = date; table = null; pkg = null;
  $$('#nights button').forEach((b, i) => b.setAttribute('aria-pressed', String(E[i]?.date === date)));
  renderFloor(); renderPick();
}
function renderFloor() {
  const busy = new Set(taken[night] || []);
  $('#spots').replaceChildren(...T.map(t => {
    const isTaken = busy.has(t.id); const mine = table?.id === t.id;
    const b = el('button', { type: 'button', class: `spot${isTaken ? ' taken' : ''}${mine ? ' mine' : ''}${t.capacity >= 12 ? ' big' : ''}`, disabled: isTaken, 'aria-pressed': String(mine), 'aria-label': `${t.name}, ${t.zone}, up to ${t.capacity} guests, minimum ${peso(t.minSpend)}${isTaken ? ', taken' : ''}`, onclick: () => { table = t; pkg = null; renderFloor(); renderPick(); } },
      el('span', {}, t.name));
    b.style.setProperty('--x', `${t.x}%`); b.style.setProperty('--y', `${t.y}%`);
    return el('li', {}, b);
  }));
}
function renderPick() {
  const box = $('#pickInfo'); const ev = E.find(e => e.date === night);
  $('#bookDone').hidden = true;
  if (!table) {
    box.replaceChildren(el('p', { class: 'muted' }, ev ? `${longDate(night)} · ${ev.title}. Tap a gold table on the floor plan.` : 'Choose a night first.'));
    $('#pkgBox').hidden = true; $('#bookFields').hidden = true; return;
  }
  box.replaceChildren(
    el('p', { class: 'kicker' }, `${longDate(night)} · ${ev?.title || ''}`),
    el('h3', {}, table.name), el('p', { class: 'muted' }, `${table.zone} · up to ${table.capacity} guests · minimum spend ${peso(table.minSpend)}`));
  const fits = P.filter(p => p.pax <= table.capacity);
  $('#pkgs').replaceChildren(...fits.map(p => el('label', { class: 'pkg' },
    el('input', { type: 'radio', name: 'pkg', value: p.id, checked: pkg?.id === p.id, onchange: () => { pkg = p; updateDeposit(); } }),
    el('span', { class: 'pkg-in' }, el('b', {}, p.name), el('em', {}, peso(Math.max(p.price, table.minSpend))), el('small', {}, `Up to ${p.pax} · ${p.inclusions}`)))));
  $('#pkgBox').hidden = !fits.length; $('#bookFields').hidden = false;
  const f = $('#bookForm').elements; f.guests.max = String(table.capacity); if (!f.guests.value) f.guests.value = String(Math.min(4, table.capacity));
  updateDeposit();
}
function updateDeposit() {
  const total = Math.max(pkg?.price || 0, table?.minSpend || 0);
  $('#depositNote').textContent = `Spend: ${peso(total)}${C.mobile ? `. To hold the table, the club may ask for a deposit by GCash or Maya to ${C.mobile}.` : '.'} You pay the rest on the night.`;
}

$('#bookForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.elements; const err = $('.err', e.target); err.textContent = '';
  if (!table) { err.textContent = 'Tap a table on the floor plan.'; return; }
  const body = { date: night, tableId: table.id, packageId: pkg?.id || '', name: f.name.value.trim(), mobile: f.mobile.value.trim(), guests: Number(f.guests.value), reference: f.reference.value.trim(), promo: f.promo.value.trim(), notes: f.notes.value.trim() };
  if (!body.name) { err.textContent = 'Enter your name.'; f.name.focus(); return; }
  if (!/^[0-9+()\s-]{7,20}$/.test(body.mobile)) { err.textContent = 'Enter a valid mobile number.'; f.mobile.focus(); return; }
  if (!(body.guests >= 1 && body.guests <= table.capacity)) { err.textContent = `${table.name} fits up to ${table.capacity} guests.`; return; }
  $('#bookBtn').disabled = true;
  try {
    if (!LIVE) {
      const d = demoLoad();
      if (d.reservations.some(r => r.date === night && r.tableId === table.id && ['pending', 'confirmed', 'arrived'].includes(r.status))) throw new Error(`${table.name} was just booked. Please choose another table.`);
      d.reservations.push({ id: uid(), date: night, tableId: table.id, tableName: table.name, packageId: pkg?.id || '', packageName: pkg?.name || '', price: Math.max(pkg?.price || 0, table.minSpend), name: body.name, mobile: body.mobile, guests: body.guests, reference: body.reference.toUpperCase(), notes: body.notes, promo: body.promo.toUpperCase(), status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      demoSave(d);
    } else {
      const res = await fetch(`/api/public/gabi/${SLUG}/reservations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send. Please message the club.');
    }
    (taken[night] ||= []).push(table.id);
    const t = table;
    table = null; renderFloor();
    $('#pickInfo').replaceChildren(); $('#pkgBox').hidden = true; $('#bookFields').hidden = true;
    $('#bookDone').hidden = false;
    $('#bookDone').replaceChildren(el('p', { class: 'kicker' }, 'Request sent'), el('h3', {}, `${t.name} · ${longDate(night)}`),
      el('p', {}, `${C.name} will text ${body.mobile} to confirm your table.${LIVE ? '' : ' (Demo: see it in the club console.)'}`),
      el('button', { type: 'button', class: 'mini-cta ghost', onclick: () => renderPick() }, 'Book another table'));
    f.name.value = ''; f.notes.value = ''; f.reference.value = '';
  } catch (ex) { err.textContent = ex.message; }
  finally { $('#bookBtn').disabled = false; }
});

/* ---------- guest list ---------- */
$('#glForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.elements; const err = $('.err', e.target); err.textContent = '';
  const body = { eventId: f.eventId.value, name: f.name.value.trim(), mobile: f.mobile.value.trim().replace(/\s+/g, ''), plus: Number(f.plus.value), promo: f.promo.value.trim() };
  if (!body.eventId) { err.textContent = 'Choose a night.'; return; }
  if (!body.name) { err.textContent = 'Enter your name.'; f.name.focus(); return; }
  if (!/^[0-9+()-]{7,20}$/.test(body.mobile)) { err.textContent = 'Enter a valid mobile number.'; f.mobile.focus(); return; }
  try {
    let token;
    if (!LIVE) {
      const d = demoLoad(); const ev = d.events.find(x => x.id === body.eventId);
      const again = d.guests.find(g => g.eventId === body.eventId && g.mobile.replace(/\s+/g, '') === body.mobile && g.status !== 'cancelled');
      if (again) token = again.token;
      else { token = uid(); d.guests.push({ id: token, eventId: ev.id, eventDate: ev.date, name: body.name, mobile: body.mobile, plus: body.plus, promo: body.promo.toUpperCase(), code: passCode(), token, status: 'listed', checkedInAt: '', createdAt: new Date().toISOString() }); demoSave(d); }
      location.href = `pass.html?demo=${encodeURIComponent(token)}`;
      return;
    }
    const res = await fetch(`/api/public/gabi/${SLUG}/guestlist`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not add you. Please message the club.');
    token = data.token;
    location.href = `pass.html?t=${encodeURIComponent(token)}`;
  } catch (ex) { err.textContent = ex.message; }
});

(async () => {
  try { await load(); } catch (e) { $('#missing').hidden = false; $('#missingText').textContent = e.message; $('#strip').hidden = !!LIVE; $('#nav').hidden = true; return; }
  paint(); applyPlan(); renderEvents();
  $('#top').hidden = false;
  if (!LIVE) $('.pp-label').textContent = `Preview plan`;
  document.documentElement.dataset.plan = PLAN_NAME[plan];
})();
