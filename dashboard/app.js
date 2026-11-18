(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  const peso = n => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(n) || 0);
  const menuUrl = slug => new URL(`../products/menu/?shop=${encodeURIComponent(slug)}`, location.href).href;

  async function api(path, opts = {}) {
    const res = await fetch(`/api${path}`, {
      method: opts.method || 'GET', credentials: 'same-origin',
      headers: opts.body ? { 'content-type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = {}; try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
    return data;
  }

  let me = null; let orders = []; let seen = new Set(); let show = 'active'; let items = []; let pollTimer = null;

  /* ---------- auth ---------- */
  $('#slugPre').textContent = `${location.host}/products/menu/?shop=`;
  const authTabs = [$('#tabLogin'), $('#tabSignup')];
  authTabs.forEach(t => t.addEventListener('click', () => authTabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); $(`#${x.getAttribute('aria-controls')}`).hidden = !on; })));
  const signupForm = $('#signupForm');
  signupForm.elements.businessName.addEventListener('input', e => {
    const s = signupForm.elements.slug;
    if (s.dataset.touched) return;
    s.value = e.target.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  });
  signupForm.elements.slug.addEventListener('input', e => { e.target.dataset.touched = '1'; });

  async function submitAuth(form, path) {
    const btn = $('button[type="submit"]', form); const err = $('.err', form);
    err.textContent = ''; btn.disabled = true;
    try { await api(path, { method: 'POST', body: Object.fromEntries(new FormData(form)) }); form.reset(); await boot(); }
    catch (e) { err.textContent = e.message; }
    finally { btn.disabled = false; }
  }
  $('#loginForm').addEventListener('submit', e => { e.preventDefault(); submitAuth(e.target, '/auth/login'); });
  signupForm.addEventListener('submit', e => { e.preventDefault(); submitAuth(e.target, '/auth/signup'); });
  $('#logoutBtn').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); clearInterval(pollTimer); me = null; showAuth(); });

  function showAuth() { $('#authView').hidden = false; $('#appView').hidden = true; $('#topRight').hidden = true; document.title = 'RZ Dashboard'; }

  /* ---------- tabs ---------- */
  const tabs = $$('.tabs [role="tab"]');
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); $(`#${x.getAttribute('aria-controls')}`).hidden = !on; });
    if (t.id === 't-menu') loadMenu();
    if (t.id === 't-sales') loadSales();
  }));

  /* ---------- business header and settings ---------- */
  function paintBusiness() {
    const b = me.business;
    $('#bizName').textContent = b.name;
    $('#openDot').classList.toggle('off', !b.accepting);
    $('#openText').textContent = b.accepting ? 'Taking online orders' : 'Online orders paused';
    $('#viewMenu').href = menuUrl(b.slug);
    $('#menuLink').textContent = menuUrl(b.slug);
    const f = $('#settingsForm').elements;
    f.name.value = b.name; f.tagline.value = b.tagline; f.hours.value = b.hours; f.gcash.value = b.gcash; f.deliveryFee.value = b.deliveryFee;
    f.accepting.checked = b.accepting; f.notifyOn.checked = b.notifyOn; f.notifyEmail.value = b.notifyEmail || me.email;
    document.title = `${newOrders().length ? `(${newOrders().length}) ` : ''}${b.name} — RZ Dashboard`;
  }
  $('#settingsForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.elements; const st = $('#setStatus');
    try {
      const { business } = await api('/business', { method: 'PUT', body: { name: f.name.value, tagline: f.tagline.value, hours: f.hours.value, gcash: f.gcash.value, deliveryFee: Number(f.deliveryFee.value) || 0, accepting: f.accepting.checked, notifyOn: f.notifyOn.checked, notifyEmail: f.notifyEmail.value } });
      me.business = business; paintBusiness(); st.textContent = 'Saved.';
    } catch (err) { st.textContent = err.message; }
  });
  $('#deleteForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target; const err = $('.err', form); const btn = $('button[type="submit"]', form);
    err.textContent = '';
    if (!confirm(`Delete ${me.business.name} and all its orders for good? This cannot be undone.`)) return;
    btn.disabled = true;
    try {
      await api('/account', { method: 'DELETE', body: { password: form.elements.password.value } });
      form.reset(); clearInterval(pollTimer); me = null; showAuth();
      $('#loginForm .err').textContent = 'Your account was deleted.';
    } catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; }
  });
  $('#copyLink').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(menuUrl(me.business.slug)); $('#setStatus').textContent = 'Link copied.'; }
    catch { $('#setStatus').textContent = 'Select the link and copy it.'; }
  });

  /* ---------- orders ---------- */
  const ACTIVE = ['new', 'accepted', 'preparing', 'ready'];
  const NEXT = { new: ['accepted', 'Accept'], accepted: ['preparing', 'Start preparing'], preparing: ['ready', 'Mark ready'], ready: ['completed', 'Complete'] };
  const LABEL = { new: 'New', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled' };
  const newOrders = () => orders.filter(o => o.status === 'new');
  const ago = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };

  function renderOrders(fresh = new Set()) {
    const list = orders.filter(o => (show === 'active' ? ACTIVE.includes(o.status) : !ACTIVE.includes(o.status)));
    const ul = $('#orders');
    if (!list.length) { ul.replaceChildren(el('li', 'empty', show === 'active' ? 'No active orders. New ones appear here by themselves.' : 'No finished orders yet.')); }
    else ul.replaceChildren(...list.map(o => {
      const li = el('li', `order${fresh.has(o.id) ? ' is-new' : ''}`);
      const head = el('div', 'o-head'); head.append(el('span', 'o-code', o.code), el('span', `pill ${o.status}`, LABEL[o.status]));
      const who = el('p', 'o-who', `${o.customerName} · ${o.type}`);
      const sub = [o.contact, o.location].filter(Boolean).join(' · ');
      if (sub) who.append(el('small', '', sub));
      const lines = el('ul', 'o-lines'); o.items.forEach(l => { const r = el('li'); r.append(el('span', '', `${l.qty} × ${l.name}`), el('span', '', peso(l.amount))); lines.append(r); });
      const total = el('p', 'o-total'); total.append(el('span', '', o.fee ? `Total (incl. ${peso(o.fee)} delivery)` : 'Total'), el('span', '', peso(o.total)));
      const time = el('span', 'o-time', ago(o.createdAt));
      li.append(head, time, who, lines);
      if (o.notes) li.append(el('p', 'o-notes', o.notes));
      li.append(total);
      if (ACTIVE.includes(o.status)) {
        const acts = el('div', 'o-actions');
        const [to, label] = NEXT[o.status];
        const go = el('button', 'btn', label); go.type = 'button'; go.addEventListener('click', () => setStatus(o, to, go));
        const cancel = el('button', 'btn cancel', 'Cancel'); cancel.type = 'button'; cancel.setAttribute('aria-label', `Cancel order ${o.code}`);
        cancel.addEventListener('click', () => { if (confirm(`Cancel order ${o.code}?`)) setStatus(o, 'cancelled', cancel); });
        acts.append(go, cancel); li.append(acts);
      }
      return li;
    }));
    const n = newOrders().length; const c = $('#newCount'); c.hidden = !n; c.textContent = n;
    if (me) document.title = `${n ? `(${n}) ` : ''}${me.business.name} — RZ Dashboard`;
  }

  async function setStatus(o, status, btn) {
    btn.disabled = true;
    try { await api(`/orders/${o.id}`, { method: 'PATCH', body: { status } }); o.status = status; renderOrders(); }
    catch (e) { alert(e.message); btn.disabled = false; }
  }

  $$('[data-show]').forEach(b => b.addEventListener('click', () => { show = b.dataset.show; $$('[data-show]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderOrders(); }));

  async function poll(first) {
    try {
      const data = await api('/orders');
      const fresh = new Set(data.orders.filter(o => !seen.has(o.id)).map(o => o.id));
      orders = data.orders; data.orders.forEach(o => seen.add(o.id));
      renderOrders(first ? new Set() : fresh);
      if (!first && [...fresh].some(id => orders.find(o => o.id === id)?.status === 'new')) alertNewOrder(fresh.size);
      $('#lastSync').textContent = `Updated ${new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`;
    } catch (e) { if (e.status === 401) { clearInterval(pollTimer); showAuth(); } else $('#lastSync').textContent = 'Offline — retrying…'; }
  }

  /* ---------- alerts: sound + system notification while the dashboard is open ---------- */
  let audio = null;
  function beep() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, .18].forEach(t => { const o = audio.createOscillator(); const g = audio.createGain(); o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
        g.gain.setValueAtTime(.0001, audio.currentTime + t); g.gain.exponentialRampToValueAtTime(.3, audio.currentTime + t + .02); g.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + t + .16);
        o.start(audio.currentTime + t); o.stop(audio.currentTime + t + .18); });
    } catch { /* sound not available */ }
  }
  function alertNewOrder(n) {
    beep();
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(`${n} new order${n > 1 ? 's' : ''}`, { body: me.business.name, tag: 'rz-order' }); } catch { /* ignore */ }
    }
  }
  $('#alertsBtn').addEventListener('click', async () => {
    beep();
    if ('Notification' in window && Notification.permission !== 'granted') { try { await Notification.requestPermission(); } catch { /* ignore */ } }
    $('#alertsBtn').textContent = ('Notification' in window && Notification.permission === 'granted') ? 'Alerts on ✓' : 'Sound alerts on ✓';
  });

  /* ---------- menu editor ---------- */
  const SAMPLE = [
    ['Ulam', 'Chicken Pork Adobo', 'Slow-braised in cane vinegar, soy and garlic', 165, 'Best seller'],
    ['Ulam', 'Sinigang na Baboy', 'Pork belly in tamarind broth', 185, ''],
    ['Silog', 'Tapsilog', 'Beef tapa, garlic rice, egg', 145, ''],
    ['Drinks', 'Calamansi Juice', '16 oz', 55, ''],
  ].map(([category, name, description, price, tag]) => ({ category, name, description, price, tag, available: true }));

  async function loadMenu() { try { items = (await api('/menu')).items; renderItems(); } catch (e) { $('#menuStatus').textContent = e.message; } }

  function renderItems() {
    $('#menuEmpty').hidden = items.length > 0;
    $('#items').replaceChildren(...items.map((it, i) => {
      const li = el('li', `item${it.available ? '' : ' off'}`);
      const input = (cls, key, attrs = {}) => { const lab = el('label', cls); const sr = el('span', '', attrs.label); sr.hidden = true; const inp = document.createElement('input');
        inp.value = it[key] ?? ''; Object.entries(attrs).forEach(([k, v]) => { if (k !== 'label') inp.setAttribute(k, v); }); inp.setAttribute('aria-label', `${attrs.label} for item ${i + 1}`);
        inp.addEventListener('input', () => { it[key] = attrs.type === 'number' ? Number(inp.value) : inp.value; }); lab.append(sr, inp); return lab; };
      li.append(input('cat', 'category', { label: 'Category', placeholder: 'Category', maxlength: 40 }),
        input('', 'name', { label: 'Name', placeholder: 'Dish name', maxlength: 80 }),
        input('', 'price', { label: 'Price', type: 'number', min: 0, step: 'any', inputmode: 'decimal', placeholder: '₱' }),
        input('desc', 'description', { label: 'Description', placeholder: 'Short description (optional)', maxlength: 160 }),
        input('', 'tag', { label: 'Tag', placeholder: 'Tag e.g. Best seller', maxlength: 24 }));
      const row = el('div', 'row');
      const chk = el('label', 'check'); const box = document.createElement('input'); box.type = 'checkbox'; box.checked = it.available;
      box.addEventListener('change', () => { it.available = box.checked; li.classList.toggle('off', !box.checked); }); chk.append(box, ' Available today');
      const btn = (t, label, fn) => { const b = el('button', 'icon-btn', t); b.type = 'button'; b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; };
      row.append(chk,
        btn('↑', `Move item ${i + 1} up`, () => { if (i) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; renderItems(); } }),
        btn('↓', `Move item ${i + 1} down`, () => { if (i < items.length - 1) { [items[i + 1], items[i]] = [items[i], items[i + 1]]; renderItems(); } }),
        btn('Delete', `Delete item ${i + 1}`, () => { items.splice(i, 1); renderItems(); }));
      li.append(row); return li;
    }));
  }
  $('#addItem').addEventListener('click', () => { items.push({ category: items.at(-1)?.category || 'Menu', name: '', description: '', price: 0, tag: '', available: true }); renderItems(); $('#items').lastElementChild.querySelector('input:not(.cat input)')?.focus(); });
  $('#sampleMenu').addEventListener('click', () => { items = structuredClone(SAMPLE); renderItems(); });
  $('#saveMenu').addEventListener('click', async () => {
    const st = $('#menuStatus'); st.textContent = 'Saving…';
    try { items = (await api('/menu', { method: 'PUT', body: { items } })).items; renderItems(); st.textContent = 'Menu saved. Customers see it now.'; }
    catch (e) { st.textContent = e.message; }
  });

  /* ---------- RZ Sales (admins only) ---------- */
  let sales = [];
  const SALE_LABEL = { pending: 'Check payment', paid: 'Paid', 'setting-up': 'Setting up', done: 'Done', refunded: 'Refunded', cancelled: 'Cancelled' };
  let salesReq = 0;
  /* RZ Gabi plans: set after a club pays. */
  async function loadGabiClubs() {
    try {
      const { clubs } = await api('/admin/gabi');
      $('#gabiClubs').replaceChildren(...clubs.map(c => el('li', '', `${c.name} · ${c.slug} · ${c.plan.toUpperCase()}`)));
    } catch { /* not an admin or no clubs yet */ }
  }
  $('#gabiPlanForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.elements; const msg = $('#gabiPlanMsg');
    try {
      const r = await api('/admin/gabi', { method: 'PATCH', body: { slug: f.slug.value.trim().toLowerCase(), plan: f.plan.value } });
      msg.textContent = `${r.name} is now on the ${r.plan.toUpperCase()} plan.`; f.slug.value = ''; loadGabiClubs();
    } catch (ex) { msg.textContent = ex.message; }
  });

  async function loadSales() {
    loadGabiClubs();
    const mine = ++salesReq; // ignore answers to older requests
    try { const list = (await api('/admin/purchases')).purchases; if (mine === salesReq) { sales = list; renderSales(); } }
    catch (e) { if (mine === salesReq) $('#sales').replaceChildren(el('li', 'empty', e.message)); }
  }
  function renderSales() {
    const pending = sales.filter(s => s.status === 'pending').length;
    const c = $('#salesCount'); c.hidden = !pending; c.textContent = pending;
    if (!sales.length) { $('#sales').replaceChildren(el('li', 'empty', 'No purchases yet. They appear here when someone pays on the Buy page.')); return; }
    $('#sales').replaceChildren(...sales.map(s => {
      const li = el('li', `order${s.status === 'pending' ? ' is-new' : ''}`);
      const head = el('div', 'o-head'); head.append(el('span', 'o-code', s.code), el('span', `pill ${s.status === 'pending' ? 'new' : s.status === 'paid' ? 'accepted' : s.status === 'setting-up' ? 'preparing' : s.status === 'done' ? 'completed' : 'cancelled'}`, SALE_LABEL[s.status]));
      const who = el('p', 'o-who', `${s.buyerName}${s.business ? ` · ${s.business}` : ''}`);
      who.append(el('small', '', [s.mobile, s.email].filter(Boolean).join(' · ')));
      const lines = el('ul', 'o-lines');
      const l1 = el('li'); l1.append(el('span', '', s.productName), el('span', '', peso(s.amount)));
      const l2 = el('li'); l2.append(el('span', '', 'Reference'), el('b', '', s.reference));
      lines.append(l1, l2);
      li.append(head, el('span', 'o-time', ago(s.createdAt)), who, lines);
      if (s.notes) li.append(el('p', 'o-notes', s.notes));
      const lab = el('label', 'fld'); lab.append('Status');
      const sel = document.createElement('select');
      Object.entries(SALE_LABEL).forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; o.selected = v === s.status; sel.append(o); });
      sel.addEventListener('change', async () => {
        salesReq++; // a list refresh already in flight must not overwrite this change
        try { await api(`/admin/purchases/${s.id}`, { method: 'PATCH', body: { status: sel.value } }); s.status = sel.value; renderSales(); }
        catch (e) { alert(e.message); sel.value = s.status; }
      });
      lab.append(sel); li.append(lab);
      return li;
    }));
  }
  $('#salesCsv').addEventListener('click', () => {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Order', 'Date', 'Product', 'Amount', 'Name', 'Business', 'Mobile', 'Email', 'Reference', 'Status', 'Notes'],
      ...sales.map(s => [s.code, s.createdAt, s.productName, s.amount, s.buyerName, s.business, s.mobile, s.email, s.reference, s.status, s.notes])];
    const url = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' }));
    const a = el('a'); a.href = url; a.download = 'rz-sales.csv'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  /* ---------- start ---------- */
  async function boot() {
    try { me = await api('/me'); }
    catch (e) { showAuth(); if (e.status !== 401) $('#loginForm .err').textContent = e.message; return; }
    $('#authView').hidden = true; $('#appView').hidden = false; $('#topRight').hidden = false;
    paintBusiness();
    $('#t-sales').hidden = !me.isAdmin;
    if (me.isAdmin) loadSales();
    await poll(true);
    clearInterval(pollTimer); pollTimer = setInterval(() => poll(false), 10000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && me) poll(false); });
  boot();
})();
