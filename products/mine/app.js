/* RZ Mine console. Demo mode keeps a sample live in this browser; ?seller opens the real console on the RZ server. */
(() => {
  'use strict';
  const { $, $$, el, peso } = window.RZ;
  const M = window.RZMine;
  const SELLER = new URLSearchParams(location.search).has('seller');
  const KEY = 'rz-mine-demo-v1';
  const php = n => peso(n, true);

  /* ---------- demo data ---------- */
  function seed() {
    const t0 = Date.now() - 38 * 60_000;
    const items = [
      ['A1', 'Floral wrap dress, M', 150, 1], ['A2', 'Denim jacket, L', 280, 1], ['A3', 'Korean puff blouse', 120, 1],
      ['A4', 'Cargo pants, 30', 200, 1], ['A5', 'Kids’ terno set', 99, 3], ['B1', 'Hair scrunchies, 5 pcs', 35, 10],
      ['B2', 'Linen polo, XL', 160, 1], ['B3', 'Knit cardigan, cream', 190, 1], ['B4', 'Maong shorts, 28', 130, 1],
    ].map(([code, name, price, stock], i) => ({ id: `i${i}`, code, name, price, stock }));
    const buyers = ['Maria Santos', 'Jen dela Cruz', 'Rose Ann Villanueva', 'Kristine Bautista', 'Joy Mendoza', 'Mark Reyes'];
    const carts = buyers.map((buyer, i) => ({ id: `c${i}`, buyer, status: 'open', shipFee: null, updatedAt: new Date(t0).toISOString() }));
    carts[0].status = 'paid'; carts[1].status = 'submitted';
    Object.assign(carts[1], { contact: '0917 555 0142', address: 'Blk 4 Lot 9, Mabini St., Bacolod City', reference: '4021 889 1203' });
    const claims = [[0, 0], [1, 0], [2, 2], [3, 1], [0, 5, 2], [4, 3], [5, 4], [1, 7], [2, 5], [3, 0], [4, 6, 1]]
      .map(([cart, item, qty], i) => ({ id: `k${i}`, cartId: `c${cart}`, itemId: `i${item}`, qty: qty || 1, at: t0 + i * 150_000 }));
    return {
      biz: { name: 'Ukay ni Ate Joy', gcash: '0917 123 4567', deliveryFee: 80 },
      lives: [{ id: 'l1', title: 'Friday ukay live', status: 'open', createdAt: new Date(t0).toISOString(), items, carts, claims }],
    };
  }
  let demo = window.RZ.load(KEY, null);
  if (!demo || !Array.isArray(demo.lives)) { demo = seed(); window.RZ.save(KEY, demo); }
  const saveDemo = () => window.RZ.save(KEY, demo);
  const uid = () => Math.random().toString(36).slice(2, 10);

  /* ---------- stores: same methods, demo (browser) or seller (server) ---------- */
  const demoStore = {
    biz: () => demo.biz,
    async lives() { return demo.lives.map(l => ({ id: l.id, title: l.title, status: l.status, createdAt: l.createdAt, claims: l.claims.length })).reverse(); },
    find(id) { const l = demo.lives.find(x => x.id === id); if (!l) throw new Error('Live not found.'); return l; },
    out(l) { saveDemo(); return M.state(l, demo.biz); },
    async get(id) { return this.out(this.find(id)); },
    async create(title) { const l = { id: uid(), title: title || 'New live', status: 'open', createdAt: new Date().toISOString(), items: [], carts: [], claims: [] }; demo.lives.push(l); return this.out(l); },
    async patchLive(id, body) { const l = this.find(id); Object.assign(l, body); return this.out(l); },
    async addItem(id, b) {
      const l = this.find(id); const code = M.code(b.code);
      if (!/^[A-Z0-9-]{1,12}$/.test(code)) throw new Error('Use a short code like A1 or 12 (letters and numbers).');
      if (l.items.some(i => i.code === code)) throw new Error(`Code ${code} is already on the rack.`);
      l.items.push({ id: uid(), code, name: String(b.name).trim().slice(0, 60), price: Number(b.price) || 0, stock: Math.max(1, Math.floor(b.stock) || 1) });
      return this.out(l);
    },
    async patchItem(itemId, b) { const l = demo.lives.find(x => x.items.some(i => i.id === itemId)); Object.assign(l.items.find(i => i.id === itemId), b); return this.out(l); },
    async delItem(itemId) { const l = demo.lives.find(x => x.items.some(i => i.id === itemId)); l.items = l.items.filter(i => i.id !== itemId); l.claims = l.claims.filter(c => c.itemId !== itemId); return this.out(l); },
    async addClaims(id, list) {
      const l = this.find(id); const errors = []; let added = 0;
      list.forEach((raw, n) => {
        const code = M.code(raw.code); const buyer = String(raw.buyer || '').trim().slice(0, 60);
        const item = l.items.find(i => i.code === code);
        const fail = msg => { if (list.length === 1) throw new Error(msg); errors.push({ line: n + 1, error: msg }); };
        if (!buyer) return fail('Enter the buyer’s name.');
        if (!item) return fail(`No item with code ${code} on this live.`);
        let cart = l.carts.find(c => M.key(c.buyer) === M.key(buyer));
        if (!cart) { cart = { id: uid(), buyer, status: 'open', shipFee: null }; l.carts.push(cart); }
        if (cart.status === 'cancelled') cart.status = 'open';
        cart.updatedAt = new Date().toISOString();
        l.claims.push({ id: uid(), cartId: cart.id, itemId: item.id, qty: Math.min(99, Math.max(1, Math.floor(raw.qty) || 1)), at: Date.now() + n });
        added++;
      });
      return { ...this.out(l), added, errors };
    },
    async delClaim(claimId) { const l = demo.lives.find(x => x.claims.some(c => c.id === claimId)); l.claims = l.claims.filter(c => c.id !== claimId); return this.out(l); },
    async patchCart(cartId, b) { const l = demo.lives.find(x => x.carts.some(c => c.id === cartId)); const c = l.carts.find(x => x.id === cartId); Object.assign(c, b, { updatedAt: new Date().toISOString() }); return this.out(l); },
    async saveBiz(b) { Object.assign(demo.biz, b); saveDemo(); return demo.biz; },
    link: token => new URL(`cart.html?demo=${encodeURIComponent(token)}`, location.href).href,
  };

  async function api(path, opts = {}) {
    const res = await fetch(`/api${path}`, { method: opts.method || 'GET', credentials: 'same-origin', headers: opts.body ? { 'content-type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let data = {}; try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
    return data;
  }
  let me = null;
  const sellerStore = {
    biz: () => ({ name: me.business.name, gcash: me.business.gcash, deliveryFee: me.business.deliveryFee }),
    async lives() { return (await api('/mine/lives')).lives; },
    get: id => api(`/mine/lives/${id}`),
    create: title => api('/mine/lives', { method: 'POST', body: { title } }),
    patchLive: (id, body) => api(`/mine/lives/${id}`, { method: 'PATCH', body }),
    addItem: (id, body) => api(`/mine/lives/${id}/items`, { method: 'POST', body }),
    patchItem: (itemId, body) => api(`/mine/items/${itemId}`, { method: 'PATCH', body }),
    delItem: itemId => api(`/mine/items/${itemId}`, { method: 'DELETE' }),
    addClaims: (id, claims) => api(`/mine/lives/${id}/claims`, { method: 'POST', body: { claims } }),
    delClaim: claimId => api(`/mine/claims/${claimId}`, { method: 'DELETE' }),
    patchCart: (cartId, body) => api(`/mine/carts/${cartId}`, { method: 'PATCH', body }),
    async saveBiz(b) {
      const cur = me.business;
      const { business } = await api('/business', { method: 'PUT', body: { name: b.name, gcash: b.gcash, deliveryFee: b.deliveryFee, tagline: cur.tagline, hours: cur.hours, accepting: cur.accepting, notifyOn: cur.notifyOn, notifyEmail: cur.notifyEmail } });
      me.business = business; return this.biz();
    },
    link: token => new URL(`cart.html?c=${encodeURIComponent(token)}`, location.href).href,
  };
  const store = SELLER ? sellerStore : demoStore;

  /* ---------- state and rendering ---------- */
  let S = null; let lives = []; let showCarts = 'all';

  function flash(msg, kind) { const f = $('#flash'); f.textContent = msg; f.className = `flash ${kind || ''}`; }
  async function run(fn, errEl) {
    try { if (errEl) errEl.textContent = ''; const r = await fn(); if (r && r.live) { S = r; render(); } return r; }
    catch (e) { if (e.status === 401 && SELLER) { showAuth(); return null; } if (errEl) errEl.textContent = e.message; else flash(e.message, 'bad'); return null; }
  }

  function renderHeader() {
    const b = store.biz();
    $('#shopName').textContent = b.name;
    const open = S.live.status === 'open';
    $('#onAir').classList.toggle('off', !open);
    $('#onAirText').textContent = open ? 'LIVE' : 'ENDED';
    $('#endLive').textContent = open ? 'End live' : 'Reopen live';
    $('#livePick').replaceChildren(...lives.map(l => el('option', { value: l.id }, `${l.title} · ${new Date(l.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`)));
    $('#livePick').value = S.live.id;
    $('#stClaims').textContent = S.totals.claims;
    $('#stBuyers').textContent = S.totals.buyers;
    $('#stSales').textContent = php(S.totals.sales);
    $('#stPaid').textContent = php(S.totals.paid);
    const toCollect = S.carts.filter(c => c.items && ['open', 'submitted'].includes(c.status)).length;
    $('#buyerBadge').textContent = toCollect ? String(toCollect) : '';
  }

  function renderRack() {
    const list = $('#tags');
    list.replaceChildren(...S.items.slice().reverse().map(it => {
      const sold = it.claimed >= it.stock;
      return el('li', { class: `tag${sold ? ' sold' : ''}` },
        el('button', { type: 'button', class: 'tag-pick', 'aria-label': `Record a mine for ${it.code} ${it.name}`, onclick: () => { const f = $('#mineForm').elements; f.code.value = it.code; showPane('feed'); f.buyer.focus(); } },
          el('span', { class: 'tag-code' }, it.code),
          el('span', { class: 'tag-name' }, it.name),
          el('span', { class: 'tag-price' }, php(it.price))),
        el('p', { class: 'tag-meta' },
          el('span', {}, it.stock > 1 ? `${it.claimed}/${it.stock} taken` : (sold ? 'Taken' : 'Available')),
          it.backups ? el('span', { class: 'backup' }, `${it.backups} backup${it.backups > 1 ? 's' : ''}`) : null),
        sold ? el('span', { class: 'stamp', 'aria-hidden': 'true' }, 'SOLD') : null,
        el('div', { class: 'tag-tools' },
          el('button', { type: 'button', 'aria-label': `One more ${it.code} in stock`, onclick: () => run(() => store.patchItem(it.id, { stock: it.stock + 1 })) }, '+1'),
          it.stock > 1 ? el('button', { type: 'button', 'aria-label': `One less ${it.code} in stock`, onclick: () => run(() => store.patchItem(it.id, { stock: it.stock - 1 })) }, '−1') : null,
          el('button', { type: 'button', class: 'del', 'aria-label': `Remove ${it.code}`, onclick: () => { if (confirm(`Remove ${it.code} ${it.name} and its mines?`)) run(() => store.delItem(it.id)); } }, 'Remove')));
    }));
    $('#rackEmpty').hidden = S.items.length > 0;
    $('#codeList').replaceChildren(...S.items.map(i => el('option', { value: i.code }, i.name)));
    const f = $('#itemForm').elements;
    if (!f.code.value) f.code.value = nextCode();
  }

  function nextCode() {
    const last = S.items[S.items.length - 1];
    if (!last) return 'A1';
    const m = last.code.match(/^(.*?)(\d+)$/);
    if (!m) return '';
    let n = Number(m[2]) + 1; let code = `${m[1]}${n}`;
    while (S.items.some(i => i.code === code)) { n++; code = `${m[1]}${n}`; }
    return code;
  }

  const timeFmt = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' });
  function renderFeed() {
    $('#claims').replaceChildren(...S.claims.slice(0, 200).map(c => el('li', { class: `claim ${c.won ? 'won' : 'wait'}` },
      el('span', { class: 'c-code' }, c.code),
      el('span', { class: 'c-body' },
        el('b', {}, c.buyer),
        el('span', {}, `${c.qty > 1 ? `${c.qty} × ` : ''}${c.itemName} · ${php(c.price * c.qty)}`)),
      el('span', { class: 'c-state' }, c.won ? 'Got it' : `Backup #${c.position}`),
      el('time', { class: 'c-time' }, timeFmt.format(new Date(c.at))),
      el('button', { type: 'button', class: 'c-x', 'aria-label': `Undo ${c.buyer}’s mine on ${c.code}`, onclick: () => run(() => store.delClaim(c.id)).then(r => r && flash(c.won ? `Removed. The next backup for ${c.code} moves up.` : 'Removed.')) }, '×'))));
    $('#feedEmpty').hidden = S.claims.length > 0;
    $('#buyerList').replaceChildren(...S.carts.map(c => el('option', { value: c.buyer })));
  }

  const STATUS = { open: 'To pay', submitted: 'Sent payment', paid: 'Paid', shipped: 'Shipped', cancelled: 'Cancelled' };
  function message(c) {
    const b = store.biz();
    return `Hi ${c.buyer}! Thank you for your mine at ${b.name}.\n${c.items} item${c.items > 1 ? 's' : ''} · Total ${php(c.total)}${c.shipFee ? ` (incl. ${php(c.shipFee)} shipping)` : ''}\nSee your items, pay and send your address here:\n${store.link(c.token)}`;
  }
  function renderCarts() {
    const show = c => showCarts === 'all' || (showCarts === 'paid' ? ['paid', 'shipped'].includes(c.status) : ['open', 'submitted'].includes(c.status) && c.items);
    const list = S.carts.filter(show).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    $('#carts').replaceChildren(...list.map(c => {
      const status = el('select', { 'aria-label': `Status for ${c.buyer}`, onchange: e => run(() => store.patchCart(c.id, { status: e.target.value })) },
        ...Object.entries(STATUS).map(([v, label]) => el('option', { value: v }, label)));
      status.value = c.status;
      const ship = el('input', { type: 'number', min: '0', max: '5000', step: '1', inputmode: 'numeric', value: String(c.shipFee), 'aria-label': `Shipping for ${c.buyer}` });
      ship.addEventListener('change', () => run(() => store.patchCart(c.id, { shipFee: ship.value === '' ? null : Number(ship.value) })));
      const note = el('p', { class: 'cart-note', role: 'status' });
      return el('li', { class: `cart s-${c.status}` },
        el('div', { class: 'cart-top' },
          el('h3', {}, c.buyer),
          el('span', { class: 'pill' }, STATUS[c.status])),
        el('p', { class: 'cart-sum' }, el('span', {}, c.items ? `${c.items} item${c.items > 1 ? 's' : ''}` : 'No items now'), el('b', {}, php(c.total))),
        c.reference ? el('dl', { class: 'paid-info' },
          el('div', {}, el('dt', {}, 'Ref no.'), el('dd', {}, c.reference)),
          el('div', {}, el('dt', {}, 'Mobile'), el('dd', {}, c.contact)),
          el('div', {}, el('dt', {}, 'Ship to'), el('dd', {}, c.address))) : null,
        el('div', { class: 'cart-tools' },
          el('label', { class: 'mini' }, 'Status', status),
          el('label', { class: 'mini ship' }, 'Shipping ₱', ship)),
        el('div', { class: 'cart-actions' },
          el('button', { type: 'button', class: 'btn small', disabled: !c.items, onclick: async () => { note.textContent = (await window.RZ.copy(message(c))) ? 'Message copied. Paste it in Messenger.' : 'Could not copy.'; } }, 'Copy message'),
          el('a', { class: 'btn small ghost', href: store.link(c.token), target: '_blank', rel: 'noopener' }, 'Open link')),
        note);
    }));
    $('#cartsEmpty').hidden = list.length > 0;
  }

  function render() { renderHeader(); renderRack(); renderFeed(); renderCarts(); }

  /* ---------- panes (phone) ---------- */
  function showPane(name) {
    $$('.panes-nav button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pane === name)));
    $('.panes').dataset.pane = name;
  }
  $$('.panes-nav button').forEach(b => b.addEventListener('click', () => showPane(b.dataset.pane)));
  showPane('feed');
  $$('.buyers .seg button').forEach(b => b.addEventListener('click', () => {
    showCarts = b.dataset.show;
    $$('.buyers .seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderCarts();
  }));

  /* ---------- actions ---------- */
  $('#mineForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.elements;
    const claim = { code: f.code.value, buyer: f.buyer.value, qty: Number(f.qty.value) || 1 };
    const r = await run(() => store.addClaims(S.live.id, [claim]));
    if (!r) return;
    const c = r.claims[0];
    flash(c.won ? `${c.buyer} got ${c.code} ${c.itemName}.` : `${c.code} is taken. ${c.buyer} is backup #${c.position}.`, c.won ? 'good' : 'warn');
    f.code.value = ''; f.buyer.value = ''; f.qty.value = '1'; f.code.focus();
  });

  $('#itemForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.elements;
    const r = await run(() => store.addItem(S.live.id, { code: f.code.value, name: f.name.value, price: Number(f.price.value), stock: Number(f.stock.value) || 1 }), $('#itemErr'));
    if (!r) return;
    f.name.value = ''; f.price.value = ''; f.stock.value = '1'; f.code.value = nextCode(); f.name.focus();
  });

  $('#livePick').addEventListener('change', e => run(() => store.get(e.target.value)));
  $('#newLive').addEventListener('click', async () => {
    const title = prompt('Name this live', `Live ${new Date().toLocaleDateString('en-PH', { weekday: 'long' })}`);
    if (title === null) return;
    const r = await run(() => store.create(title.trim()));
    if (r) { lives = await store.lives(); renderHeader(); showPane('rack'); }
  });
  $('#endLive').addEventListener('click', async () => {
    const open = S.live.status === 'open';
    const r = await run(() => store.patchLive(S.live.id, { status: open ? 'closed' : 'open' }));
    if (r) { lives = await store.lives(); renderHeader(); if (open) { showPane('buyers'); flash('Live ended. Send each buyer their message.', 'good'); } }
  });

  /* Paste comments */
  let parsed = [];
  $('#pasteText').addEventListener('input', e => {
    parsed = M.parseComments(e.target.value);
    const codes = new Set(S.items.map(i => i.code));
    $('#parsed').replaceChildren(...parsed.map(p => el('li', { class: p.ok && codes.has(p.code) ? '' : 'bad' },
      el('span', { class: 'c-code' }, p.code), el('span', {}, p.buyer || 'No name found'), p.qty > 1 ? el('span', {}, `× ${p.qty}`) : null,
      codes.has(p.code) ? null : el('em', {}, 'not on the rack'))));
    const good = parsed.filter(p => p.ok && codes.has(p.code));
    $('#pasteAdd').disabled = !good.length;
    $('#pasteAdd').textContent = good.length ? `Add ${good.length} mine${good.length > 1 ? 's' : ''}` : 'Add mines';
  });
  $('#pasteAdd').addEventListener('click', async () => {
    const codes = new Set(S.items.map(i => i.code));
    const good = parsed.filter(p => p.ok && codes.has(p.code)).map(({ buyer, code, qty }) => ({ buyer, code, qty }));
    const r = await run(() => store.addClaims(S.live.id, good), $('#pasteErr'));
    if (!r) return;
    $('#pasteDlg').close(); $('#pasteText').value = ''; $('#parsed').replaceChildren(); parsed = [];
    flash(`Added ${r.added} mine${r.added === 1 ? '' : 's'}${r.errors.length ? `, ${r.errors.length} skipped` : ''}.`, 'good');
  });

  /* Settings */
  $('[data-open="settings"]').addEventListener('click', () => {
    const b = store.biz(); const f = $('#setForm').elements;
    f.name.value = b.name; f.gcash.value = b.gcash || ''; f.fee.value = b.deliveryFee ?? 0;
  });
  if (SELLER) $('#setNote').textContent = 'Buyers see these on their checkout link. They are shared with your RZ dashboard.';
  $('#setForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.elements; const err = $('.err', e.target);
    try { await store.saveBiz({ name: f.name.value.trim().slice(0, 60) || 'My shop', gcash: f.gcash.value.trim().slice(0, 30), deliveryFee: Math.min(5000, Math.max(0, Number(f.fee.value) || 0)) }); $('#settings').close(); S = await store.get(S.live.id); render(); }
    catch (ex) { err.textContent = ex.message; }
  });

  /* ---------- seller sign in ---------- */
  function showAuth() { $('#authView').hidden = false; $('#appView').hidden = true; }
  const tabs = [$('#tabLogin'), $('#tabSignup')];
  tabs.forEach(t => t.addEventListener('click', () => tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); $(`#${x.getAttribute('aria-controls')}`).hidden = !on; })));
  async function auth(form, path, body) {
    const btn = $('button[type="submit"]', form); const err = $('.err', form);
    err.textContent = ''; btn.disabled = true;
    try { await api(path, { method: 'POST', body }); form.reset(); await boot(); }
    catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; }
  }
  $('#loginForm').addEventListener('submit', e => { e.preventDefault(); const f = e.target.elements; auth(e.target, '/auth/login', { email: f.email.value, password: f.password.value }); });
  $('#signupForm').addEventListener('submit', e => { e.preventDefault(); const f = e.target.elements; auth(e.target, '/auth/signup', { businessName: f.businessName.value, slug: M.slug(f.businessName.value), email: f.email.value, password: f.password.value }); });
  $('#logoutBtn').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); me = null; showAuth(); });

  /* ---------- start ---------- */
  async function boot() {
    try {
      if (SELLER) {
        $('#strip').hidden = true; $('#logoutBtn').hidden = false;
        document.title = 'RZ Mine — seller console';
        me = await api('/me');
      }
      lives = await store.lives();
      if (!lives.length) { await store.create(`Live ${new Date().toLocaleDateString('en-PH', { weekday: 'long' })}`); lives = await store.lives(); }
      S = await store.get(lives[0].id);
      $('#authView').hidden = true; $('#appView').hidden = false;
      render();
      if (SELLER && !S.items.length) showPane('rack');
    } catch (e) {
      if (e.status === 401) showAuth(); else { $('#appView').hidden = false; flash(e.message, 'bad'); }
    }
  }
  boot();
})();
