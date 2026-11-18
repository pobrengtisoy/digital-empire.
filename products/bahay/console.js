/* RZ Bahay agent console. Demo works in this browser; ?live is the real console on the RZ server. */
import { demoLoad, demoSave, photoUrl, priceLabel, specs, TYPES, STATUS_LABEL } from './common.js';

const { $, $$, el, copy } = window.RZ;
const LIVE = new URLSearchParams(location.search).has('live');
const MAX_PHOTOS = 12;
let S = null; let tab = 'listings'; let showInq = 'open'; let editing = null; let edPhotos = []; let uploading = 0;

/* ---------- stores ---------- */
async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, { method: opts.method || 'GET', credentials: 'same-origin', headers: opts.raw ? { 'content-type': opts.type } : opts.body ? { 'content-type': 'application/json' } : {}, body: opts.raw || (opts.body ? JSON.stringify(opts.body) : undefined) });
  let data = {}; try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return data;
}
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
let demo = null;
const demoOut = () => { if (!demoSave(demo)) throw new Error('This browser’s demo storage is full. Remove a demo photo or reset the demo.'); return { profile: demo.profile, listings: demo.listings, inquiries: demo.inquiries, photosReady: true }; };
const store = LIVE ? {
  load: () => api('/bahay'),
  saveProfile: b => api('/bahay/profile', { method: 'PUT', body: b }),
  addListing: b => api('/bahay/listings', { method: 'POST', body: b }),
  editListing: (id, b) => api(`/bahay/listings/${id}`, { method: 'PATCH', body: b }),
  delListing: id => api(`/bahay/listings/${id}`, { method: 'DELETE' }),
  setInquiry: (id, status) => api(`/bahay/inquiries/${id}`, { method: 'PATCH', body: { status } }),
  delInquiry: id => api(`/bahay/inquiries/${id}`, { method: 'DELETE' }),
  async upload(blob) { return (await api('/bahay/photos', { method: 'POST', raw: blob, type: blob.type })).key; },
  site: slug => new URL(`index.html?agent=${encodeURIComponent(slug)}`, location.href).href,
} : {
  load: async () => { demo = demoLoad(); return demoOut(); },
  saveProfile: async b => { Object.assign(demo.profile, b); return demoOut(); },
  addListing: async b => { if (!b.title.trim()) throw new Error('Give the listing a title.'); demo.listings.unshift({ ...b, id: uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); return demoOut(); },
  editListing: async (id, b) => { Object.assign(demo.listings.find(l => l.id === id), b, { updatedAt: new Date().toISOString() }); return demoOut(); },
  delListing: async id => { demo.listings = demo.listings.filter(l => l.id !== id); return demoOut(); },
  setInquiry: async (id, status) => { Object.assign(demo.inquiries.find(i => i.id === id), { status, updatedAt: new Date().toISOString() }); return demoOut(); },
  delInquiry: async id => { demo.inquiries = demo.inquiries.filter(i => i.id !== id); return demoOut(); },
  async upload(blob) { return new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = bad; r.readAsDataURL(blob); }); },
  site: () => new URL('index.html', location.href).href,
};

function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = `toast show${bad ? ' bad' : ''}`; clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 3200); }
async function run(fn, errEl) {
  try { if (errEl) errEl.textContent = ''; const r = await fn(); if (r && r.listings) { S = r; render(); } return r || true; }
  catch (e) { if (e.status === 401 && LIVE) { showAuth(); return null; } if (errEl) errEl.textContent = e.message; else toast(e.message, true); return null; }
}

/* ---------- render ---------- */
function render() {
  $('#cName').textContent = S.profile.name;
  const site = store.site(S.profile.slug);
  $('#siteLink').href = site; $('#siteLink').textContent = site.replace(/^https?:\/\//, '');
  $('#nListings').textContent = S.listings.length || '';
  const fresh = S.inquiries.filter(i => i.status === 'new').length;
  $('#nNew').textContent = fresh || '';
  $('#photoNote').textContent = S.photosReady ? '' : 'Photo uploads are coming soon. You can post listings now and add photos later.';
  renderListings(); renderInbox(); fillProfile();
}

function renderListings() {
  $('#cList').replaceChildren(...S.listings.map(l => {
    const status = el('select', { 'aria-label': `Status of ${l.title}`, onchange: e => run(() => store.editListing(l.id, { status: e.target.value })).then(r => r && toast(`Marked ${STATUS_LABEL[e.target.value].toLowerCase()}.`)) },
      ...Object.entries(STATUS_LABEL).map(([v, t]) => el('option', { value: v }, t)));
    status.value = l.status;
    const n = S.inquiries.filter(i => i.listingId === l.id).length;
    return el('li', { class: `c-item s-${l.status}` },
      el('span', { class: 'c-thumb' }, l.photos[0] ? el('img', { src: photoUrl(l.photos[0]), alt: '', loading: 'lazy' }) : el('span', {}, 'No photo')),
      el('div', { class: 'c-info' },
        el('b', {}, l.title),
        el('span', { class: 'c-price' }, `${priceLabel(l)} · ${l.deal === 'rent' ? 'For rent' : 'For sale'}${l.featured ? ' · Shown first' : ''}`),
        el('span', { class: 'c-meta' }, [l.city, ...specs(l).slice(0, 3)].filter(Boolean).join(' · ')),
        el('span', { class: 'c-meta' }, `${l.photos.length} photo${l.photos.length === 1 ? '' : 's'}${n ? ` · ${n} inquir${n === 1 ? 'y' : 'ies'}` : ''}`)),
      el('div', { class: 'c-act' },
        el('label', { class: 'mini' }, 'Status', status),
        el('button', { type: 'button', class: 'btn small ghost', onclick: () => openEditor(l) }, 'Edit'),
        el('a', { class: 'btn small ghost', href: `${store.site(S.profile.slug)}#l-${l.id}`, target: '_blank', rel: 'noopener' }, 'View')));
  }));
  $('#cEmpty').hidden = S.listings.length > 0;
}

const fmtDate = s => new Date(s).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const INQ = { new: 'New', contacted: 'Contacted', viewing: 'Viewing set', closed: 'Closed' };
function renderInbox() {
  const list = S.inquiries.filter(i => showInq === 'all' || i.status !== 'closed');
  $('#inbox').replaceChildren(...list.map(i => {
    const sel = el('select', { 'aria-label': `Status of ${i.name}’s inquiry`, onchange: e => run(() => store.setInquiry(i.id, e.target.value)) }, ...Object.entries(INQ).map(([v, t]) => el('option', { value: v }, t)));
    sel.value = i.status;
    const tel = String(i.mobile).replace(/[^0-9+]/g, '');
    const reply = `Hi ${i.name.split(' ')[0]}! This is ${S.profile.agentName || S.profile.name}. Thank you for asking about ${i.listingTitle ? `“${i.listingTitle}”` : 'properties'}. When is a good time to call?`;
    const note = el('p', { class: 'ok', role: 'status' });
    return el('li', { class: `inq s-${i.status}` },
      el('div', { class: 'inq-top' }, el('b', {}, i.name), el('span', { class: 'pill' }, INQ[i.status]), el('time', {}, fmtDate(i.createdAt))),
      el('p', { class: 'inq-about' }, i.listingTitle ? `About: ${i.listingTitle}` : 'General request'),
      i.message ? el('p', { class: 'inq-msg' }, i.message) : null,
      el('p', { class: 'inq-meta' }, [i.mobile, i.email, i.visitDate ? `Wants to view on ${i.visitDate}` : ''].filter(Boolean).join(' · ')),
      el('div', { class: 'inq-act' },
        el('a', { class: 'btn small', href: `tel:${tel}` }, 'Call'),
        el('a', { class: 'btn small ghost', href: `sms:${tel}` }, 'Text'),
        el('button', { type: 'button', class: 'btn small ghost', onclick: async () => { note.textContent = (await copy(reply)) ? 'Reply copied.' : ''; } }, 'Copy reply'),
        el('label', { class: 'mini' }, 'Status', sel),
        el('button', { type: 'button', class: 'link danger', onclick: () => { if (confirm(`Delete ${i.name}’s inquiry?`)) run(() => store.delInquiry(i.id)); } }, 'Delete')),
      note);
  }));
  $('#inboxEmpty').hidden = list.length > 0;
}

function fillProfile() {
  const f = $('#profileForm').elements; const p = S.profile;
  if (document.activeElement && $('#profileForm').contains(document.activeElement)) return;
  ['name', 'agentName', 'license', 'mobile', 'messenger', 'areas', 'tagline', 'about'].forEach(k => { f[k].value = p[k] || ''; });
}

/* ---------- listing editor ---------- */
$('#edForm').elements.type.replaceChildren(...TYPES.map(t => el('option', { value: t }, t)));
function openEditor(l) {
  editing = l; const f = $('#edForm').elements;
  $('#edTitle').textContent = l ? 'Edit listing' : 'New listing';
  const v = l || { title: '', deal: 'sale', type: 'House and lot', status: 'available', price: '', priceNote: '', city: '', address: '', beds: '', baths: '', floorArea: '', lotArea: '', parking: '', features: [], description: '', featured: false, photos: [] };
  ['title', 'deal', 'type', 'status', 'price', 'priceNote', 'city', 'address', 'beds', 'baths', 'floorArea', 'lotArea', 'parking', 'description'].forEach(k => { f[k].value = v[k] || (f[k].tagName === 'SELECT' ? f[k].value : ''); });
  f.deal.value = v.deal; f.type.value = v.type; f.status.value = v.status;
  f.features.value = (v.features || []).join(', '); f.featured.checked = !!v.featured;
  edPhotos = [...(v.photos || [])];
  $('#edDelete').hidden = !l; $('#edErr').textContent = ''; $('#phStatus').textContent = '';
  priceHint(); renderPhotos();
  $('#editor').showModal();
}
$('#newListing').addEventListener('click', () => openEditor(null));
function priceHint() { const f = $('#edForm').elements; const n = Number(f.price.value); $('#priceHint').textContent = n ? `= ${priceLabel({ price: n, deal: f.deal.value })}` : ''; }
$('#edForm').elements.price.addEventListener('input', priceHint);
$('#edForm').elements.deal.addEventListener('change', priceHint);

function renderPhotos() {
  $('#phList').replaceChildren(...edPhotos.map((ref, i) => el('li', { class: 'ph' },
    el('img', { src: photoUrl(ref), alt: `Photo ${i + 1}` }),
    i === 0 ? el('span', { class: 'cover' }, 'Cover') : null,
    el('div', { class: 'ph-tools' },
      i > 0 ? el('button', { type: 'button', 'aria-label': `Move photo ${i + 1} earlier`, onclick: () => { [edPhotos[i - 1], edPhotos[i]] = [edPhotos[i], edPhotos[i - 1]]; renderPhotos(); } }, '←') : null,
      el('button', { type: 'button', 'aria-label': `Remove photo ${i + 1}`, onclick: () => { edPhotos.splice(i, 1); renderPhotos(); } }, '×')))));
  const ready = !LIVE || S.photosReady;
  $('.ph-add').hidden = !ready || edPhotos.length >= MAX_PHOTOS;
  if (!ready) $('#phStatus').textContent = 'Photo uploads are coming soon. Save the listing now and add photos later.';
}

/* Shrink each photo in the browser before upload: long side 1600 px (demo: 900 px). */
async function shrink(file) {
  const max = LIVE ? 1600 : 900;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const encode = (type, q) => new Promise(r => canvas.toBlob(r, type, q));
  for (const q of LIVE ? [0.82, 0.7, 0.55] : [0.6, 0.45]) {
    let blob = await encode('image/webp', q);
    if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg', q + 0.05);
    if (blob && blob.size <= (LIVE ? 1_400_000 : 160_000)) return blob;
  }
  throw new Error('That photo is too large even after shrinking.');
}
$('#phInput').addEventListener('change', async e => {
  const files = [...e.target.files].slice(0, MAX_PHOTOS - edPhotos.length); e.target.value = '';
  if (!files.length) return;
  if (LIVE && !S.photosReady) { $('#phStatus').textContent = 'Photo storage is not connected yet.'; return; }
  uploading += files.length; $('#edSave').disabled = true;
  let done = 0; let failed = 0;
  for (const file of files) {
    $('#phStatus').textContent = `Uploading ${done + 1} of ${files.length}…`;
    try { const ref = await store.upload(await shrink(file)); edPhotos.push(ref); renderPhotos(); }
    catch (ex) { failed++; $('#edErr').textContent = ex.message; }
    done++; uploading--;
  }
  $('#edSave').disabled = uploading > 0;
  $('#phStatus').textContent = failed ? `${done - failed} added, ${failed} could not be added.` : `${done} photo${done > 1 ? 's' : ''} added. Save the listing to keep them.`;
});

$('#edForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (uploading) return;
  const f = e.target.elements;
  const body = {
    title: f.title.value.trim(), deal: f.deal.value, type: f.type.value, status: f.status.value, price: Number(f.price.value), priceNote: f.priceNote.value.trim(),
    city: f.city.value.trim(), address: f.address.value.trim(), beds: Number(f.beds.value) || 0, baths: Number(f.baths.value) || 0, floorArea: Number(f.floorArea.value) || 0,
    lotArea: Number(f.lotArea.value) || 0, parking: Number(f.parking.value) || 0, features: f.features.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20),
    description: f.description.value.trim(), featured: f.featured.checked, photos: edPhotos,
  };
  const r = await run(() => (editing ? store.editListing(editing.id, body) : store.addListing(body)), $('#edErr'));
  if (r) { $('#editor').close(); toast(editing ? 'Listing saved.' : 'Listing posted to your website.'); }
});
$('#edDelete').addEventListener('click', async () => {
  if (!confirm(`Delete “${editing.title}” and its photos? To keep it for your records, set it to Sold or Hidden instead.`)) return;
  const r = await run(() => store.delListing(editing.id), $('#edErr'));
  if (r) { $('#editor').close(); toast('Listing deleted.'); }
});

/* ---------- other actions ---------- */
$('#profileForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements;
  const body = Object.fromEntries(['name', 'agentName', 'license', 'mobile', 'messenger', 'areas', 'tagline', 'about'].map(k => [k, f[k].value.trim()]));
  document.activeElement?.blur();
  const r = await run(() => store.saveProfile(body), $('.err', e.target));
  if (r) toast('Profile saved. Your website shows it now.');
});
$('#copySite').addEventListener('click', async () => toast((await copy($('#siteLink').href)) ? 'Website link copied. Share it on Facebook or in your bio.' : 'Could not copy.'));
$$('.c-tabs button').forEach(b => b.addEventListener('click', () => {
  tab = b.dataset.tab;
  $$('.c-tabs button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  $$('.tab').forEach(s => { s.hidden = s.id !== `tab-${tab}`; });
}));
$$('#tab-inquiries .seg button').forEach(b => b.addEventListener('click', () => {
  showInq = b.dataset.show; $$('#tab-inquiries .seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderInbox();
}));

/* ---------- sign in ---------- */
function showAuth() { $('#authView').hidden = false; $('#appView').hidden = true; }
$('#slugPre').textContent = `${location.host}/…?agent=`;
const authTabs = [$('#tabLogin'), $('#tabSignup')];
authTabs.forEach(t => t.addEventListener('click', () => authTabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); $(`#${x.getAttribute('aria-controls')}`).hidden = !on; })));
const su = $('#signupForm').elements;
su.businessName.addEventListener('input', () => { if (!su.slug.dataset.touched) su.slug.value = su.businessName.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); });
su.slug.addEventListener('input', () => { su.slug.dataset.touched = '1'; });
async function auth(form, path, body) {
  const btn = $('button[type="submit"]', form); const err = $('.err', form);
  err.textContent = ''; btn.disabled = true;
  try { await api(path, { method: 'POST', body }); form.reset(); await boot(); }
  catch (ex) { err.textContent = ex.message; }
  finally { btn.disabled = false; }
}
$('#loginForm').addEventListener('submit', e => { e.preventDefault(); const f = e.target.elements; auth(e.target, '/auth/login', { email: f.email.value, password: f.password.value }); });
$('#signupForm').addEventListener('submit', e => { e.preventDefault(); auth(e.target, '/auth/signup', { businessName: su.businessName.value, slug: su.slug.value, email: su.email.value, password: su.password.value }); });
$('#logoutBtn').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); showAuth(); });

async function boot() {
  try {
    if (LIVE) { $('#strip').hidden = true; $('#logoutBtn').hidden = false; await api('/me'); }
    S = await store.load();
    $('#authView').hidden = true; $('#appView').hidden = false;
    render();
  } catch (e) { if (e.status === 401) showAuth(); else toast(e.message, true); }
}
boot();
