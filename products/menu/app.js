(() => {
  'use strict';
  const { el, $, $$, peso, load, save, clean, sendMessage, messengerUser } = window.RZ;

  const SAMPLE = { name: 'Kusina ni Aling Nena', tagline: 'Lutong bahay since 1987', hours: 'Open daily · 7:00 AM – 9:00 PM', messenger: '', gcash: '0917 123 4567', fee: 49 };
  let MENU = [
    { id: 'ulam', title: 'Ulam', note: 'Served with one cup of rice', items: [
      ['adobo', 'Chicken Pork Adobo', 'Slow-braised in cane vinegar, soy and garlic', 165, 'Best seller'],
      ['sinigang', 'Sinigang na Baboy', 'Pork belly in tamarind broth with kangkong and labanos', 185],
      ['karekare', 'Kare-Kare', 'Oxtail and tripe in peanut sauce, with bagoong', 245],
      ['lechon', 'Lechon Kawali', 'Crisp pork belly, liver sauce on the side', 195],
    ]},
    { id: 'silog', title: 'Silog', note: 'Garlic rice and sunny-side egg', items: [
      ['tapsilog', 'Tapsilog', 'Cured beef tapa', 145, 'Best seller'],
      ['longsilog', 'Longsilog', 'Sweet Pampanga longganisa', 135],
      ['tocilog', 'Tocilog', 'Homemade pork tocino', 135],
    ]},
    { id: 'merienda', title: 'Merienda', note: 'Afternoon favourites', items: [
      ['canton', 'Pancit Canton', 'Good for 2 to 3, with calamansi', 220],
      ['turon', 'Turon', 'Saba and langka in lumpia wrapper, 3 pcs', 60],
      ['halohalo', 'Halo-Halo', 'Ube, leche flan, sweet beans and shaved ice', 120],
    ]},
    { id: 'drinks', title: 'Drinks', note: '', items: [
      ['calamansi', 'Calamansi Juice', 'Fresh-squeezed, 16 oz', 55],
      ['gulaman', "Sago't Gulaman", 'Brown sugar syrup, 16 oz', 50],
      ['kapebarako', 'Kapeng Barako', 'Brewed, hot', 45],
    ]},
  ];
  const indexItems = () => Object.fromEntries(MENU.flatMap(s => s.items.map(([id, name, desc, price, tag]) => [id, { id, name, desc, price, tag }])));
  let ITEMS = indexItems();

  // Live mode: ?shop=<link-name> loads a real shop from the RZ backend.
  const SLUG = (new URLSearchParams(location.search).get('shop') || '').toLowerCase();
  const LIVE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(SLUG);
  const CART_KEY = LIVE ? `rz-menu-cart-${SLUG}` : 'rz-menu-cart';
  const LAST_KEY = `rz-menu-last-${SLUG}`;

  let shop = LIVE ? { name: '', tagline: '', hours: '', gcash: '', fee: 0, accepting: true } : load('rz-menu-shop', SAMPLE);
  let cart = load(CART_KEY, {});

  /* ---------- shop identity ---------- */
  function applyShop() {
    $('#shopName').textContent = shop.name;
    $('#tagline').textContent = shop.tagline;
    $('#hours').textContent = shop.hours;
    document.title = `${shop.name} — Menu`;
    renderTotals();
  }

  /* ---------- menu ---------- */
  function renderMenu() {
    const nav = $('#cats'); const menu = $('#menu');
    nav.replaceChildren(...MENU.map(s => el('a', { href: `#sec-${s.id}` }, s.title)));
    menu.replaceChildren(...MENU.map(s => el('section', { class: 'menu-sec', id: `sec-${s.id}`, 'aria-labelledby': `h-${s.id}` },
      el('h2', { id: `h-${s.id}` }, s.title),
      s.note ? el('p', { class: 'sec-note' }, s.note) : null,
      s.items.map(([id]) => {
        const it = ITEMS[id];
        return el('button', { type: 'button', class: 'dish', dataset: { id }, 'aria-label': `Add ${it.name}, ${peso(it.price)}` },
          el('span', { class: 'dish-name' }, it.name, it.tag ? el('span', { class: 'tag' }, it.tag) : null),
          el('span', { class: 'dish-price' }, peso(it.price, true)),
          el('span', { class: 'dish-desc' }, it.desc),
          el('span', { class: 'dish-add' }, cart[id] ? `${cart[id]} in order` : 'Add'));
      }))));
    $$('.dish', menu).forEach(b => b.classList.toggle('in', !!cart[b.dataset.id]));
  }

  $('#menu').addEventListener('click', e => {
    const dish = e.target.closest('.dish'); if (!dish) return;
    cart[dish.dataset.id] = (cart[dish.dataset.id] || 0) + 1;
    commit();
    const add = $('.dish-add', dish); dish.classList.add('in');
    add.textContent = `${cart[dish.dataset.id]} in order`;
    add.animate?.([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.16,1,.3,1)' });
  });

  /* ---------- cart ---------- */
  const form = $('#orderForm');
  const orderType = () => form.elements.type.value;
  const subtotal = () => Object.entries(cart).reduce((s, [id, q]) => s + (ITEMS[id]?.price || 0) * q, 0);
  const fee = () => (orderType() === 'Delivery' ? Number(shop.fee) || 0 : 0);
  const count = () => Object.values(cart).reduce((a, b) => a + b, 0);

  function renderCart() {
    const list = $('#cartList');
    const lines = Object.entries(cart).filter(([id, q]) => ITEMS[id] && q > 0);
    list.replaceChildren(...lines.map(([id, q]) => el('li', {},
      el('span', { class: 'ln-name' }, ITEMS[id].name),
      el('span', { class: 'qty' },
        el('button', { type: 'button', 'aria-label': `One less ${ITEMS[id].name}`, onclick: () => bump(id, -1) }, '−'),
        el('span', {}, q),
        el('button', { type: 'button', 'aria-label': `One more ${ITEMS[id].name}`, onclick: () => bump(id, 1) }, '+')),
      el('span', { class: 'ln-sum' }, peso(ITEMS[id].price * q, true)))));
    $('#cartEmpty').hidden = lines.length > 0 || !$('#placed').hidden;
    $('#sendBtn').disabled = lines.length === 0 || (LIVE && !shop.accepting);
    const fab = $('#cartFab');
    fab.hidden = lines.length === 0;
    $('#fabCount').textContent = count();
    $('#fabTotal').textContent = peso(subtotal() + fee(), true);
    renderTotals();
  }

  function renderTotals() {
    $('#subtotal').textContent = peso(subtotal());
    $('#feeRow').hidden = orderType() !== 'Delivery';
    $('#fee').textContent = peso(fee());
    $('#total').textContent = peso(subtotal() + fee());
    $('#payNote').textContent = shop.gcash ? `Pay by GCash to ${shop.gcash} or cash on ${orderType() === 'Delivery' ? 'delivery' : 'pick-up'}.` : '';
  }

  function bump(id, d) {
    cart[id] = Math.max(0, (cart[id] || 0) + d);
    if (!cart[id]) delete cart[id];
    commit(); renderMenu();
  }
  function commit() { save(CART_KEY, cart); renderCart(); }

  form.addEventListener('change', e => {
    if (e.target.name !== 'type') return;
    const t = orderType();
    $('#whereLabel').textContent = t === 'Delivery' ? 'Delivery address' : t === 'Pick-up' ? 'Pick-up time' : 'Table number';
    form.elements.where.required = t === 'Delivery';
    renderTotals(); renderCart();
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!count()) return;
    if (LIVE) { placeLiveOrder(); return; }
    const d = new FormData(form);
    const lines = Object.entries(cart).map(([id, q]) => `${q} × ${ITEMS[id].name} — ${peso(ITEMS[id].price * q)}`);
    const where = clean(d.get('where'), 160);
    const msg = [
      `NEW ORDER for ${shop.name}`,
      `${orderType()} · ${clean(d.get('name'), 60)}${where ? ` · ${where}` : ''}`,
      '', ...lines, '',
      `Subtotal: ${peso(subtotal())}`,
      fee() ? `Delivery fee: ${peso(fee())}` : null,
      `TOTAL: ${peso(subtotal() + fee())}`,
      clean(d.get('notes'), 300) ? `Notes: ${clean(d.get('notes'), 300)}` : null,
    ].filter(x => x !== null).join('\n');
    sendMessage(msg, shop.messenger, $('#status'));
  });

  /* ---------- live ordering ---------- */
  async function placeLiveOrder() {
    const d = new FormData(form); const btn = $('#sendBtn'); const st = $('#status');
    const type = orderType();
    btn.disabled = true; st.textContent = 'Sending your order…';
    try {
      const res = await fetch(`/api/public/${SLUG}/orders`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, name: d.get('name'), contact: d.get('contact'), location: d.get('where'), notes: d.get('notes'),
          items: Object.entries(cart).filter(([id, q]) => ITEMS[id] && q > 0).map(([id, qty]) => ({ id, qty })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send your order. Please try again.');
      cart = {}; commit(); renderMenu(); form.reset(); st.textContent = '';
      save(LAST_KEY, { id: data.id, code: data.code, type });
      showPlaced(data.id, data.code, type);
    } catch (err) { st.textContent = err.message; btn.disabled = false; }
  }

  const STATUS_TEXT = { new: 'Waiting for the kitchen to accept', accepted: 'Accepted', preparing: 'Being prepared', ready: 'Ready!', completed: 'Completed — thank you!', cancelled: 'Cancelled by the shop' };
  let statusTimer = null;
  function showPlaced(id, code, type) {
    form.hidden = true; $('#placed').hidden = false; $('#cartEmpty').hidden = true; $('#placedCode').textContent = code;
    const pay = type === 'Delivery' ? 'delivery' : 'pick-up';
    $('#placedNote').textContent = shop.gcash ? `Pay by GCash to ${shop.gcash}, or cash on ${pay}. Keep this page open to see updates.` : 'Keep this page open to see updates.';
    const check = async () => {
      try {
        const r = await fetch(`/api/public/orders/${id}`);
        if (!r.ok) throw new Error('unavailable');
        const o = await r.json();
        $('#placedText').textContent = STATUS_TEXT[o.status] || o.status;
        const pip = $('#placedPip');
        pip.classList.toggle('done', ['ready', 'completed'].includes(o.status));
        pip.classList.toggle('stop', o.status === 'cancelled');
        if (['completed', 'cancelled'].includes(o.status)) clearInterval(statusTimer);
      } catch { $('#placedText').textContent = 'Checking…'; }
    };
    check(); clearInterval(statusTimer); statusTimer = setInterval(check, 15000);
  }
  $('#newOrder').addEventListener('click', () => { clearInterval(statusTimer); save(LAST_KEY, null); $('#placed').hidden = true; form.hidden = false; renderCart(); });

  async function loadLive() {
    $('[data-open="settings"]').hidden = true;
    $('.rz-strip-note').textContent = 'Powered by RZ Menu';
    $('#contactField').hidden = false;
    $('#sendBtn').textContent = 'Place order';
    $('#privacy').hidden = false;
    $('#menu').replaceChildren(el('p', { class: 'sec-note' }, 'Loading the menu…'));
    try {
      const r = await fetch(`/api/public/${SLUG}/menu`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'This menu could not be loaded.');
      const b = data.business;
      shop = { name: b.name, tagline: b.tagline, hours: b.hours, gcash: b.gcash, fee: b.deliveryFee, accepting: b.accepting };
      $('#privacy').textContent = `Your name, number and address are shared only with ${b.name} to prepare your order.`;
      const cats = new Map();
      data.items.forEach(it => { if (!cats.has(it.category)) cats.set(it.category, []); cats.get(it.category).push([it.id, it.name, it.description, it.price, it.tag]); });
      MENU = [...cats].map(([title, items], i) => ({ id: `c${i}`, title, note: '', items }));
      ITEMS = indexItems();
      Object.keys(cart).forEach(id => { if (!ITEMS[id]) delete cart[id]; });
      if (MENU.length) renderMenu();
      else $('#menu').replaceChildren(el('p', { class: 'sec-note' }, 'The menu is being prepared. Please check back soon.'));
      const closed = $('#closedNote');
      closed.hidden = shop.accepting;
      closed.textContent = `${shop.name} is not taking online orders right now.`;
      applyShop(); renderCart();
      if (io) $$('.menu-sec').forEach(sec => io.observe(sec));
      const last = load(LAST_KEY, null);
      if (last && last.id) showPlaced(last.id, last.code, last.type);
    } catch (err) {
      $('#shopName').textContent = 'Menu not found'; $('#tagline').textContent = ''; $('#hours').textContent = '';
      $('#menu').replaceChildren(el('p', { class: 'sec-note' }, err.message));
      $('#cart').hidden = true;
    }
  }

  /* mobile sheet */
  const cartEl = $('#cart');
  $('#cartFab').addEventListener('click', () => { cartEl.classList.add('open'); $('#cartClose').focus(); });
  $('#cartClose').addEventListener('click', () => { cartEl.classList.remove('open'); $('#cartFab').focus(); });

  /* settings */
  const sForm = $('#settingsForm');
  $('[data-open="settings"]').addEventListener('click', () => {
    Object.entries(shop).forEach(([k, v]) => { if (sForm.elements[k]) sForm.elements[k].value = v; });
  });
  sForm.addEventListener('submit', () => {
    const f = sForm.elements;
    shop = { name: clean(f.name.value, 50) || SAMPLE.name, tagline: clean(f.tagline.value, 60), hours: clean(f.hours.value, 60),
      messenger: messengerUser(f.messenger.value), gcash: clean(f.gcash.value, 20), fee: Math.min(2000, Math.max(0, Number(f.fee.value) || 0)) };
    save('rz-menu-shop', shop); applyShop();
  });
  $('#resetSettings').addEventListener('click', () => {
    shop = structuredClone(SAMPLE); save('rz-menu-shop', shop); applyShop(); $('#settings').close();
  });

  /* highlight current section */
  const io = 'IntersectionObserver' in window && new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) $$('#cats a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === `#${en.target.id}`)); });
  }, { rootMargin: '-40% 0px -55% 0px' });

  if (LIVE) loadLive();
  else { renderMenu(); applyShop(); renderCart(); if (io) $$('.menu-sec').forEach(sec => io.observe(sec)); }
})();
