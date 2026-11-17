(() => {
  'use strict';
  const { el, $, $$, peso, load, save, clean, sendMessage, messengerUser } = window.RZ;

  const SAMPLE = { name: 'Mira Atelier', tagline: 'Made in Cebu · Small batches', messenger: '', gcash: '0917 555 0142', ship: 120 };
  const C = { sand: ['Sand', '#c9b395'], olive: ['Olive', '#6f6b45'], ink: ['Ink', '#26272e'], rose: ['Dusty rose', '#c79a92'], cream: ['Bone', '#d9d1c4'], rust: ['Rust', '#a5532f'], sage: ['Sage', '#94a08a'], abaca: ['Natural abaca', '#b89a6a'] };
  const SIZES = ['XS', 'S', 'M', 'L', 'XL'];
  const PRODUCTS = [
    { id: 'p1', cat: 'Tops', name: 'Linen button-down', price: 890, colors: ['sand', 'olive', 'ink'], sizes: SIZES, desc: 'Breathable washed linen with a relaxed shoulder. Made in our Mandaue workroom.', badge: 'Best seller' },
    { id: 'p2', cat: 'Dresses', name: 'Wrap midi dress', price: 1250, colors: ['rose', 'ink', 'sage'], sizes: SIZES, desc: 'A tie-waist wrap in soft rayon crepe. Fully lined to the knee.' },
    { id: 'p3', cat: 'Bottoms', name: 'Wide-leg trousers', price: 980, colors: ['cream', 'ink', 'olive'], sizes: SIZES, desc: 'High-rise, pleated front and an elastic back waistband.' },
    { id: 'p4', cat: 'Tops', name: 'Cropped knit cardigan', price: 1100, colors: ['cream', 'rust', 'sage'], sizes: ['S', 'M', 'L'], desc: 'Cotton knit for air-conditioned offices. Mother-of-pearl buttons.', badge: 'New' },
    { id: 'p5', cat: 'Dresses', name: 'Linen shift dress', price: 1180, colors: ['sand', 'rust'], sizes: SIZES, desc: 'Straight cut with side pockets. Falls just below the knee.' },
    { id: 'p6', cat: 'Accessories', name: 'Abaca woven tote', price: 650, colors: ['abaca'], sizes: [], desc: 'Hand-woven abaca from Catanduanes, leather handles, cotton lining.' },
    { id: 'p7', cat: 'Bottoms', name: 'Linen drawstring shorts', price: 690, colors: ['sand', 'sage', 'ink'], sizes: SIZES, desc: 'Easy weekend shorts with a 5-inch inseam.' },
    { id: 'p8', cat: 'Accessories', name: 'Shell drop earrings', price: 420, colors: ['cream'], sizes: [], desc: 'Capiz shell drops on hypoallergenic hooks.' },
  ];
  const CATS = ['All', 'Tops', 'Dresses', 'Bottoms', 'Accessories'];

  let shop = load('rz-shop-shop', SAMPLE);
  let bag = load('rz-shop-bag', []);
  let cat = 'All';
  let current = null; let pick = { color: '', size: '' };

  const paint = (node, key) => { node.style.setProperty('--c', C[key][1]); return node; };

  function applyShop() {
    $('#shopName').textContent = shop.name;
    $('#tagline').textContent = shop.tagline;
    document.title = `${shop.name} — Shop`;
  }

  function renderFilters() {
    $('#filters').replaceChildren(...CATS.map(c => el('button', { type: 'button', 'aria-pressed': String(c === cat), onclick: () => { cat = c; renderFilters(); renderGrid(); } }, c)));
  }

  function renderGrid() {
    const list = PRODUCTS.filter(p => cat === 'All' || p.cat === cat);
    $('#grid').replaceChildren(...list.map(p => {
      const sw = paint(el('span', { class: 'swatch' }, p.badge ? el('em', { class: 'badge' }, p.badge) : null, el('img', { src: `img/${p.id}.webp`, alt: '', width: 640, height: 800, loading: 'lazy', decoding: 'async' })), p.colors[0]);
      return el('button', { type: 'button', class: 'card', 'aria-label': `${p.name}, ${peso(p.price, true)}`, onclick: () => openProduct(p) },
        sw,
        el('span', { class: 'card-name' }, p.name),
        el('span', { class: 'card-meta' }, el('span', {}, peso(p.price, true)), el('span', { class: 'dots' }, p.colors.map(k => paint(el('i', { title: C[k][0] }), k)))));
    }));
  }

  function openProduct(p) {
    current = p; pick = { color: p.colors[0], size: '' };
    $('#pName').textContent = p.name;
    $('#pPrice').textContent = peso(p.price);
    $('#pDesc').textContent = p.desc;
    $('#pImg').src = `img/${p.id}.webp`;
    $('#pImg').alt = p.name;
    $('#pNote').textContent = '';
    $('#pSizesSet').hidden = !p.sizes.length;
    renderOptions();
    $('#product').showModal();
  }

  function renderOptions() {
    const p = current;
    paint($('#pSwatch'), pick.color);
    $('#pColorName').textContent = C[pick.color][0];
    $('#pColors').replaceChildren(...p.colors.map(k => paint(el('button', { type: 'button', 'aria-label': C[k][0], 'aria-pressed': String(k === pick.color), onclick: () => { pick.color = k; renderOptions(); } }), k)));
    $('#pSizes').replaceChildren(...p.sizes.map(s => el('button', { type: 'button', 'aria-pressed': String(s === pick.size), onclick: () => { pick.size = s; renderOptions(); } }, s)));
  }

  $('#addBag').addEventListener('click', () => {
    const p = current;
    if (p.sizes.length && !pick.size) { $('#pNote').textContent = 'Choose a size first.'; return; }
    const key = `${p.id}|${pick.color}|${pick.size}`;
    const line = bag.find(l => l.key === key);
    if (line) line.qty += 1; else bag.push({ key, id: p.id, color: pick.color, size: pick.size, qty: 1 });
    save('rz-shop-bag', bag);
    renderBag();
    $('#pNote').textContent = `Added to your bag.`;
    const b = $('#bagBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  });

  const byId = id => PRODUCTS.find(p => p.id === id);
  const items = () => bag.reduce((s, l) => s + (byId(l.id)?.price || 0) * l.qty, 0);
  const shipping = () => ($('#checkout').elements.ship.value === 'Ship nationwide' ? Number(shop.ship) || 0 : 0);

  function renderBag() {
    $('#bagCount').textContent = bag.reduce((s, l) => s + l.qty, 0);
    $('#bagList').replaceChildren(...bag.map((l, i) => {
      const p = byId(l.id); if (!p) return '';
      return el('li', {},
        paint(el('span', { class: 'mini', 'aria-hidden': 'true' }), l.color),
        el('span', {}, el('span', { class: 'b-name' }, p.name), el('br'), el('span', { class: 'b-meta' }, [C[l.color][0], l.size, `Qty ${l.qty}`].filter(Boolean).join(' · '))),
        el('span', { class: 'b-right' }, peso(p.price * l.qty, true), el('br'),
          el('button', { type: 'button', class: 'rm', onclick: () => { bag.splice(i, 1); save('rz-shop-bag', bag); renderBag(); } }, 'Remove')));
    }));
    $('#bagEmpty').hidden = bag.length > 0;
    $('#placeBtn').disabled = bag.length === 0;
    $('#sumItems').textContent = peso(items());
    $('#shipRow').hidden = !shipping();
    $('#sumShip').textContent = peso(shipping());
    $('#sumTotal').textContent = peso(items() + shipping());
    $('#payNote').textContent = shop.gcash ? `Pay by GCash to ${shop.gcash} after we confirm stock.` : '';
  }

  $('#bagBtn').addEventListener('click', () => { renderBag(); $('#bag').showModal(); });

  const co = $('#checkout');
  co.addEventListener('change', e => {
    if (e.target.name !== 'ship') return;
    const far = co.elements.ship.value === 'Ship nationwide';
    $('#addrFld').hidden = !far; co.elements.address.required = far;
    renderBag();
  });
  co.addEventListener('submit', e => {
    e.preventDefault();
    if (!bag.length) return;
    const d = new FormData(co);
    const msg = [
      `ORDER for ${shop.name}`,
      `${clean(d.get('name'), 60)} · ${clean(d.get('phone'), 20)}`,
      `${d.get('ship')}${d.get('ship') === 'Ship nationwide' ? ` to: ${clean(d.get('address'), 240)}` : ''}`,
      '',
      ...bag.map(l => { const p = byId(l.id); return `${l.qty} × ${p.name} (${[C[l.color][0], l.size].filter(Boolean).join(', ')}) — ${peso(p.price * l.qty)}`; }),
      '',
      shipping() ? `Shipping: ${peso(shipping())}` : null,
      `TOTAL: ${peso(items() + shipping())}`,
    ].filter(x => x !== null).join('\n');
    sendMessage(msg, shop.messenger, $('#status'));
  });

  const sf = $('#settingsForm');
  $('[data-open="settings"]').addEventListener('click', () => Object.entries(shop).forEach(([k, v]) => { if (sf.elements[k]) sf.elements[k].value = v; }));
  sf.addEventListener('submit', () => {
    const f = sf.elements;
    shop = { name: clean(f.name.value, 40) || SAMPLE.name, tagline: clean(f.tagline.value, 60), messenger: messengerUser(f.messenger.value), gcash: clean(f.gcash.value, 20), ship: Math.min(2000, Math.max(0, Number(f.ship.value) || 0)) };
    save('rz-shop-shop', shop); applyShop(); renderBag();
  });
  $('#resetSettings').addEventListener('click', () => { shop = structuredClone(SAMPLE); save('rz-shop-shop', shop); applyShop(); $('#settings').close(); });

  applyShop(); renderFilters(); renderGrid(); renderBag();
})();
