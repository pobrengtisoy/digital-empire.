(() => {
  'use strict';
  const { el, $, $$, peso, load, save, clean, download, id: newId, iso, today } = window.RZ;

  const KEY = 'rz-tindahan';
  const SAMPLE = () => {
    const items = [
      ['Bigas 1 kg', 48, 55, 40], ['Itlog (1 pc)', 8, 10, 60], ['Sardinas 155g', 22, 26, 24], ['Instant pancit canton', 13, 16, 36],
      ['Kape 3-in-1 sachet', 8.5, 10, 50], ['Softdrinks 1.5L', 72, 85, 6], ['Pandesal (10 pcs)', 25, 30, 10], ['Mantika 250 ml', 34, 40, 3],
      ['Shampoo sachet', 6, 8, 48], ['Sabong panlaba', 18, 22, 15], ['Asukal ¼ kg', 22, 26, 20], ['Kandila', 7, 10, 4],
    ].map(([name, cost, price, stock]) => ({ id: newId(), name, cost, price, stock }));
    const t = iso(today());
    const pick = (i, q) => ({ id: items[i].id, name: items[i].name, price: items[i].price, cost: items[i].cost, qty: q });
    const sales = [
      { t: `${t}T07:12`, lines: [pick(6, 1), pick(4, 2)] }, { t: `${t}T08:40`, lines: [pick(0, 2), pick(1, 6)] },
      { t: `${t}T10:05`, lines: [pick(3, 3), pick(5, 1)] }, { t: `${t}T11:30`, lines: [pick(2, 2), pick(8, 4)] },
      { t: `${t}T13:18`, lines: [pick(4, 3), pick(1, 2)] },
    ];
    return { store: 'Sari-Sari ni Mang Tonyo', low: 5, items, sales };
  };

  let data = load(KEY, SAMPLE());
  let cart = {};
  const persist = () => save(KEY, data);
  const byId = id => data.items.find(i => i.id === id);
  const money = n => (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cartTotal = () => Object.entries(cart).reduce((s, [id, q]) => s + (byId(id)?.price || 0) * q, 0);

  /* ---------- sell ---------- */
  function renderGrid() {
    const q = $('#q').value.trim().toLowerCase();
    $('#grid').replaceChildren(...data.items.filter(i => i.name.toLowerCase().includes(q)).map(i => {
      const left = i.stock - (cart[i.id] || 0); const low = i.stock <= data.low;
      return el('button', { type: 'button', class: `item${low ? ' low' : ''}`, disabled: left <= 0, 'aria-label': `${i.name}, ${peso(i.price)}, ${left} left`, onclick: () => { cart[i.id] = (cart[i.id] || 0) + 1; renderSell(); } },
        cart[i.id] ? el('span', { class: 'qty' }, cart[i.id]) : null,
        el('b', {}, i.name), el('span', { class: 'price' }, money(i.price)),
        el('span', { class: 'stk' }, left <= 0 ? 'Out of stock' : `${left} left${low ? ' · low' : ''}`));
    }));
  }

  function renderReceipt() {
    $('#rcStore').textContent = data.store;
    $('#rcMeta').textContent = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
    const lines = Object.entries(cart).filter(([, q]) => q > 0);
    $('#rcLines').replaceChildren(...lines.map(([id, q]) => { const i = byId(id); return el('li', {},
      el('span', { class: 'ln' }, i.name), el('span', { class: 'amt' }, money(i.price * q)),
      el('span', { class: 'sub' },
        el('button', { type: 'button', 'aria-label': `One less ${i.name}`, onclick: () => { cart[id]--; if (!cart[id]) delete cart[id]; renderSell(); } }, '−'),
        `${q} × ${money(i.price)}`,
        el('button', { type: 'button', 'aria-label': `One more ${i.name}`, disabled: q >= i.stock, onclick: () => { cart[id]++; renderSell(); } }, '+'))); }));
    $('#rcEmpty').hidden = lines.length > 0;
    const total = cartTotal();
    $('#rcTotal').textContent = money(total);
    const quick = [...new Set([20, 50, 100, 200, 500, 1000].filter(v => v >= total).slice(0, 3))];
    $('#quick').replaceChildren(el('button', { type: 'button', onclick: () => { $('#cash').value = total.toFixed(2); renderChange(); } }, 'Exact'),
      ...quick.map(v => el('button', { type: 'button', onclick: () => { $('#cash').value = v; renderChange(); } }, `₱${v}`)));
    $('#doneSale').disabled = !lines.length;
    renderChange();
  }

  function renderChange() {
    const cash = Number($('#cash').value); const total = cartTotal(); const c = $('#rcChange');
    if (!$('#cash').value || !total) { c.textContent = '—'; c.classList.remove('short'); return; }
    const diff = cash - total;
    c.textContent = diff >= 0 ? money(diff) : `kulang ${money(-diff)}`;
    c.classList.toggle('short', diff < 0);
  }

  function renderSell() { renderGrid(); renderReceipt(); }

  $('#q').addEventListener('input', renderGrid);
  $('#cash').addEventListener('input', renderChange);
  $('#clearSale').addEventListener('click', () => { cart = {}; $('#cash').value = ''; renderSell(); });
  $('#doneSale').addEventListener('click', () => {
    const total = cartTotal(); const cash = Number($('#cash').value) || 0;
    if (!total) return;
    if ($('#cash').value && cash < total) { $('#sellStatus').textContent = 'Kulang ang bayad.'; return; }
    const lines = Object.entries(cart).map(([id, qty]) => { const i = byId(id); i.stock = Math.max(0, i.stock - qty); return { id, name: i.name, price: i.price, cost: i.cost, qty }; });
    const now = new Date();
    data.sales.push({ t: `${iso(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, lines });
    persist(); cart = {}; $('#cash').value = '';
    $('#sellStatus').textContent = `Sale saved: ${peso(total)}${cash ? ` · sukli ${peso(cash - total)}` : ''}`;
    renderAll();
  });

  /* ---------- stock ---------- */
  function renderStock() {
    const lowCount = data.items.filter(i => i.stock <= data.low).length;
    const b = $('#lowBadge'); b.hidden = !lowCount; b.textContent = lowCount;
    const sorted = [...data.items].sort((a, c) => a.stock - c.stock);
    $('#stockRows').replaceChildren(...sorted.map(i => el('tr', {},
      el('td', { class: 'tl' }, i.name),
      el('td', {}, money(i.cost)), el('td', {}, money(i.price)),
      el('td', {}, i.price ? `${Math.round((i.price - i.cost) / i.price * 100)}%` : '—'),
      el('td', { class: i.stock <= data.low ? 'low' : '' }, i.stock),
      el('td', {}, el('span', { class: 'restock' }, [1, 6, 12].map(n => el('button', { type: 'button', 'aria-label': `Add ${n} ${i.name}`, onclick: () => { i.stock += n; persist(); renderAll(); } }, `+${n}`)))))));
  }

  /* ---------- today ---------- */
  const todays = () => data.sales.filter(s => s.t.startsWith(iso(today())));
  function renderToday() {
    const list = todays();
    const rev = list.reduce((s, x) => s + x.lines.reduce((a, l) => a + l.price * l.qty, 0), 0);
    const cost = list.reduce((s, x) => s + x.lines.reduce((a, l) => a + l.cost * l.qty, 0), 0);
    $('#todayTitle').textContent = today().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
    $('#kRev').textContent = peso(rev, true); $('#kProfit').textContent = peso(rev - cost, true); $('#kCount').textContent = list.length;
    const tally = {};
    list.forEach(s => s.lines.forEach(l => { tally[l.name] = (tally[l.name] || 0) + l.qty; }));
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5);
    $('#topItems').replaceChildren(...(top.length ? top.map(([n, q]) => el('li', {}, n, el('span', {}, `${q} pcs`))) : [el('li', { class: 'muted' }, 'Wala pang benta.')]));
    $('#log').replaceChildren(...[...list].reverse().map(s => el('li', {},
      el('span', {}, s.t.slice(11, 16)), el('span', {}, s.lines.map(l => `${l.qty}× ${l.name}`).join(', ')), el('b', {}, money(s.lines.reduce((a, l) => a + l.price * l.qty, 0))))));
  }

  $('#csvBtn').addEventListener('click', () => {
    const q = v => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['Time', 'Item', 'Qty', 'Price', 'Amount', 'Cost']];
    todays().forEach(s => s.lines.forEach(l => rows.push([s.t.replace('T', ' '), l.name, l.qty, l.price, (l.price * l.qty).toFixed(2), (l.cost * l.qty).toFixed(2)])));
    download(`benta-${iso(today())}.csv`, rows.map(r => r.map(q).join(',')).join('\r\n'), 'text/csv');
  });

  /* ---------- tabs, dialogs ---------- */
  const tabs = $$('[role="tab"]');
  tabs.forEach(t => t.addEventListener('click', () => tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); $(`#${x.getAttribute('aria-controls')}`).hidden = !on; })));

  $('#itemForm').addEventListener('submit', e => {
    const f = e.target.elements; const name = clean(f.name.value, 40); if (!name) return;
    data.items.push({ id: newId(), name, cost: Math.max(0, Number(f.cost.value) || 0), price: Math.max(0, Number(f.price.value) || 0), stock: Math.max(0, Math.round(Number(f.stock.value) || 0)) });
    persist(); e.target.reset(); renderAll();
  });
  const sf = $('#settingsForm');
  document.querySelector('[data-open="settings"]').addEventListener('click', () => { sf.elements.store.value = data.store; sf.elements.low.value = data.low; });
  sf.addEventListener('submit', () => { data.store = clean(sf.elements.store.value, 40) || data.store; data.low = Math.max(0, Math.min(100, Math.round(Number(sf.elements.low.value) || 0))); persist(); renderAll(); });
  $('#exportBtn').addEventListener('click', () => download(`tindahan-backup-${iso(today())}.json`, JSON.stringify({ app: 'rz-tindahan', v: 1, data }, null, 2)));
  $('#resetBtn').addEventListener('click', () => { if (!confirm('Replace everything with the sample store?')) return; data = SAMPLE(); cart = {}; persist(); renderAll(); $('#settings').close(); });

  function renderAll() { $('#storeName').textContent = data.store; document.title = `${data.store} — Tindahan`; renderSell(); renderStock(); renderToday(); }
  renderAll();
})();
