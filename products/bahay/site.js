/* RZ Bahay public site. No ?agent → demo agent from this browser; ?agent=slug → a real agent from the RZ server. */
import { demoLoad, demoSave, photoUrl, priceLabel, pesoFull, pesoShort, amortization, specs, mapsLink, TYPES, STATUS_LABEL } from './common.js';

const { $, $$, el, copy } = window.RZ;
const q = new URLSearchParams(location.search);
const SLUG = (q.get('agent') || '').toLowerCase();
const LIVE = /^[a-z0-9-]{3,40}$/.test(SLUG);
let P = null; let L = []; let deal = 'all'; let current = null;

async function load() {
  if (!LIVE) { const d = demoLoad(); P = d.profile; L = d.listings.filter(l => l.status !== 'hidden'); return; }
  const res = await fetch(`/api/public/bahay/${SLUG}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'This agent’s page does not exist.');
  P = data.profile; L = data.listings;
}

function initials(name) { return String(name || 'RZ').split(/\s+/).filter(w => /[A-Za-z]/.test(w[0])).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'RZ'; }

function paintAgent() {
  document.title = `${P.name}${P.agentName ? ` — ${P.agentName}` : ''}`;
  $('#mono').textContent = initials(P.name);
  $('#brandName').textContent = P.name;
  $('#agentLine').textContent = [P.agentName, P.license].filter(Boolean).join(' · ');
  $('#heroTitle').textContent = P.tagline || `Find your next home with ${P.agentName || P.name}.`;
  $('#areas').textContent = P.areas || '';
  $('#aboutTitle').textContent = P.agentName || P.name;
  $('#license').textContent = P.license || '';
  $('#about').textContent = P.about || '';
  $('#footName').textContent = P.name; $('#year').textContent = new Date().getFullYear();
  const tel = String(P.mobile || '').replace(/[^0-9+]/g, '');
  $('#callBtn').hidden = !tel; $('#callBtn').href = tel ? `tel:${tel}` : '#';
  $('#msgBtn').hidden = !P.messenger && !tel;
  $('#msgBtn').href = P.messenger ? `https://m.me/${P.messenger}` : `sms:${tel}`;
  $('#msgBtn').textContent = P.messenger ? 'Messenger' : 'Text';
  if (!LIVE) $('#strip').hidden = false; else $('#strip').hidden = true;
}

function fillFilters() {
  const f = $('#finder').elements;
  const types = TYPES.filter(t => L.some(l => l.type === t));
  f.type.replaceChildren(el('option', { value: '' }, 'Any type'), ...types.map(t => el('option', { value: t }, t)));
  const cities = [...new Set(L.map(l => l.city).filter(Boolean))].sort();
  f.city.replaceChildren(el('option', { value: '' }, 'Anywhere'), ...cities.map(c => el('option', { value: c }, c)));
  setBudgets();
}
function setBudgets() {
  const f = $('#finder').elements; const keep = f.max.value;
  const steps = deal === 'rent' ? [10_000, 15_000, 20_000, 30_000, 50_000, 100_000] : [1_000_000, 2_000_000, 3_000_000, 5_000_000, 8_000_000, 12_000_000, 20_000_000];
  f.max.replaceChildren(el('option', { value: '' }, 'Any price'), ...steps.map(v => el('option', { value: String(v) }, `Up to ${pesoShort(v)}${deal === 'rent' ? '/mo' : ''}`)));
  if (steps.map(String).includes(keep)) f.max.value = keep;
}

const ORDER = { available: 0, reserved: 1, sold: 2 };
function renderGrid() {
  const f = $('#finder').elements;
  const max = Number(f.max.value) || Infinity; const beds = Number(f.beds.value) || 0;
  const list = L.filter(l => (deal === 'all' || l.deal === deal) && (!f.type.value || l.type === f.type.value) && (!f.city.value || l.city === f.city.value) && l.price <= max && (l.beds || 0) >= beds)
    .sort((a, b) => (ORDER[a.status] - ORDER[b.status]) || (b.featured - a.featured) || String(b.createdAt).localeCompare(String(a.createdAt)));
  $('#grid').replaceChildren(...list.map(l => el('li', { class: `card s-${l.status}` },
    el('button', { type: 'button', class: 'card-open', 'aria-label': `${l.title}, ${priceLabel(l)}, ${l.city}`, onclick: () => openListing(l.id) },
      el('span', { class: 'card-photo' },
        l.photos[0] ? el('img', { src: photoUrl(l.photos[0]), alt: '', loading: 'lazy', decoding: 'async', width: '600', height: '450' }) : el('span', { class: 'no-photo' }, l.type),
        l.status !== 'available' ? el('span', { class: 'sash' }, STATUS_LABEL[l.status]) : null,
        el('span', { class: 'tag' }, l.deal === 'rent' ? 'For rent' : 'For sale'),
        l.photos.length > 1 ? el('span', { class: 'pics' }, `${l.photos.length} photos`) : null),
      el('span', { class: 'card-body' },
        el('span', { class: 'card-price' }, priceLabel(l)),
        el('span', { class: 'card-title' }, l.title),
        el('span', { class: 'card-where' }, [l.address, l.city].filter(Boolean).join(', ')),
        el('span', { class: 'card-specs' }, specs(l).slice(0, 4).join(' · ') || l.type))))));
  $('#none').hidden = list.length > 0;
  $('#count').textContent = `${list.length} of ${L.length} ${L.length === 1 ? 'property' : 'properties'}`;
}

/* ---------- detail ---------- */
function openListing(id, fromHash) {
  const l = L.find(x => x.id === id); if (!l) return;
  current = l;
  const pics = l.photos.length ? l.photos : [null];
  $('#slides').replaceChildren(...pics.map((p, i) => el('li', { class: 'slide' }, p ? el('img', { src: photoUrl(p), alt: `${l.title}, photo ${i + 1}`, decoding: 'async', loading: i ? 'lazy' : 'eager' }) : el('span', { class: 'no-photo' }, l.type))));
  $('#thumbs').replaceChildren(...(pics.length > 1 ? pics.map((p, i) => el('li', {}, el('button', { type: 'button', 'aria-label': `Photo ${i + 1}`, onclick: () => goSlide(i) }, el('img', { src: photoUrl(p), alt: '', loading: 'lazy' })))) : []));
  $('#slideCount').textContent = pics.length > 1 ? `1 / ${pics.length}` : '';
  $('#dType').textContent = `${l.type} · ${l.deal === 'rent' ? 'For rent' : 'For sale'}${l.status !== 'available' ? ` · ${STATUS_LABEL[l.status]}` : ''}`;
  $('#dTitle').textContent = l.title;
  $('#dWhere').textContent = [l.address, l.city].filter(Boolean).join(', ') || 'Location on request';
  $('#dMap').href = mapsLink(l);
  $('#dPrice').textContent = `${pesoFull(l.price)}${l.deal === 'rent' ? ' a month' : ''}`;
  $('#dNote').textContent = l.priceNote || '';
  $('#dSpecs').replaceChildren(...specs(l).map(s => el('li', {}, s)));
  $('#dDesc').textContent = l.description || '';
  $('#dFeatures').replaceChildren(...l.features.map(x => el('li', {}, x)));
  $('#calc').hidden = l.deal !== 'sale' || l.status === 'sold';
  calc();
  const f = $('#askForm').elements;
  f.message.value = l.status === 'sold' ? `Hi! I saw “${l.title}” is sold. Do you have something similar?` : `Hi! I’m interested in “${l.title}”. Is it still available?`;
  $('.ok', $('#askForm')).textContent = ''; $('.err', $('#askForm')).textContent = '';
  if (!fromHash) history.replaceState(null, '', `${location.search}#l-${l.id}`);
  if (!$('#detail').open) $('#detail').showModal();
  $('#slides').scrollTo({ left: 0 });
}
function goSlide(i) { const s = $('#slides'); s.scrollTo({ left: s.clientWidth * i, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
$('#slides').addEventListener('scroll', () => {
  const s = $('#slides'); const n = s.children.length; if (n < 2) return;
  const i = Math.round(s.scrollLeft / s.clientWidth);
  $('#slideCount').textContent = `${i + 1} / ${n}`;
  $$('#thumbs button').forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
}, { passive: true });
$('#detail').addEventListener('close', () => { current = null; history.replaceState(null, '', location.search || location.pathname); });

function calc() {
  if (!current) return;
  const a = amortization(current.price, $('#cDown').value, $('#cRate').value, $('#cYears').value);
  $('#cMonthly').textContent = pesoFull(a.monthly);
  $('#cLine').textContent = `${pesoFull(a.down)} down payment, ${pesoFull(a.loan)} loan over ${$('#cYears').value} years.`;
}
['#cDown', '#cRate', '#cYears'].forEach(s => $(s).addEventListener('input', calc));

$('#shareBtn').addEventListener('click', async () => {
  const ok = await copy(`${location.origin}${location.pathname}${location.search}#l-${current.id}`);
  $('.ok', $('#askForm')).textContent = ok ? 'Link copied. Paste it anywhere to share.' : '';
});

/* ---------- inquiries ---------- */
async function sendInquiry(form, listing) {
  const f = form.elements; const err = $('.err', form); const ok = $('.ok', form); const btn = $('button[type="submit"]', form);
  err.textContent = ''; ok.textContent = '';
  const body = { listingId: listing?.id || '', name: f.name.value.trim(), mobile: f.mobile.value.trim(), email: f.email?.value.trim() || '', visitDate: f.visitDate?.value || '', message: f.message.value.trim() };
  if (!body.name) { err.textContent = 'Enter your name.'; f.name.focus(); return; }
  if (!/^[0-9+()\s-]{7,20}$/.test(body.mobile)) { err.textContent = 'Enter a valid mobile number.'; f.mobile.focus(); return; }
  btn.disabled = true;
  try {
    if (!LIVE) {
      const d = demoLoad();
      d.inquiries.unshift({ id: Math.random().toString(36).slice(2, 10), listingId: body.listingId, listingTitle: listing?.title || '', ...body, status: 'new', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      demoSave(d);
    } else {
      const res = await fetch(`/api/public/bahay/${SLUG}/inquiries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send. Please call or message instead.');
    }
    ok.textContent = `Sent! ${P.agentName || P.name} will contact you at ${body.mobile}.${LIVE ? '' : ' (Demo: see it in the agent console.)'}`;
    f.message.value = '';
  } catch (ex) { err.textContent = ex.message; }
  finally { btn.disabled = false; }
}
$('#askForm').addEventListener('submit', e => { e.preventDefault(); sendInquiry(e.target, current); });
$('#generalForm').addEventListener('submit', e => { e.preventDefault(); sendInquiry(e.target, null); });

/* ---------- filters ---------- */
$$('.deal button').forEach(b => b.addEventListener('click', () => {
  deal = b.dataset.deal;
  $$('.deal button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  setBudgets(); renderGrid();
}));
$('#finder').addEventListener('change', renderGrid);

(async () => {
  try { await load(); } catch (e) { $('#missing').hidden = false; $('#missingText').textContent = e.message; $('#strip').hidden = !!LIVE; return; }
  paintAgent(); fillFilters(); renderGrid();
  $('#siteMain').hidden = false;
  const m = location.hash.match(/^#l-([a-z0-9]+)$/i);
  if (m) openListing(m[1], true);
})();
