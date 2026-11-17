(() => {
  'use strict';

  const SAMPLE = 'Kape ni Lola';
  const STORE = 'rz-proof-name';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------- Name printing ---------- */
  const tarp = $('#leadTarp');
  const ink = $('#proofName');
  const form = $('#pressForm');
  const input = $('#nameInput');
  const button = $('.press-button', form);
  const carriage = $('#carriage');
  let printing = false;

  const cleanName = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 40);

  function setInk(name) {
    ink.replaceChildren();
    name.split(' ').forEach((word, i, words) => {
      const span = document.createElement('span');
      span.textContent = word;
      if (i % 2 === 1) span.className = 'w-alt';
      ink.append(span);
      if (i < words.length - 1) ink.append(document.createTextNode(' '));
    });
    fitInk();
  }

  // Shrink long names so they always fit on the tarp.
  function fitInk() {
    tarp.style.removeProperty('--name-size');
    const box = tarp.clientWidth * 0.92;
    const width = ink.scrollWidth;
    if (width > box) {
      const current = parseFloat(getComputedStyle(ink.parentElement).fontSize);
      tarp.style.setProperty('--name-size', `${Math.max(18, current * box / width)}px`);
    }
  }

  function setEverywhere(name) {
    $$('[data-name]').forEach(el => { el.textContent = name; });
  }

  function railX(fraction) {
    // carriage is 10.2% of rail width; translate is in % of its own width
    const travel = (100 - 10.2) / 10.2 * 100;
    return `${(travel * fraction).toFixed(1)}%`;
  }

  const REST = 0.69;
  carriage.style.setProperty('--carriage-x', railX(REST));

  async function print(name) {
    if (printing) return;
    printing = true;
    button.disabled = true;
    setInk(name);

    if (reduceMotion.matches || !ink.animate) {
      setEverywhere(name);
      printing = false;
      button.disabled = false;
      return;
    }

    const duration = Math.min(1500, 700 + name.length * 30);
    const toStart = carriage.animate(
      [{ translate: `${railX(REST)} -36%` }, { translate: `${railX(0)} -36%` }],
      { duration: 380, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' }
    );
    ink.classList.add('is-printing');
    await toStart.finished;

    const sweep = { duration, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' };
    const head = carriage.animate(
      [{ translate: `${railX(0)} -36%` }, { translate: `${railX(1)} -36%` }], sweep
    );
    const reveal = ink.animate(
      [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], sweep
    );
    await Promise.all([head.finished, reveal.finished]);
    ink.classList.remove('is-printing');
    reveal.cancel();

    setEverywhere(name);
    $$('.wall-right .tarp-for, .tarp-arena .tarp-for').forEach((el, i) => {
      el.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
        { duration: 420, delay: i * 90, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
    });

    const home = carriage.animate(
      [{ translate: `${railX(1)} -36%` }, { translate: `${railX(REST)} -36%` }],
      { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }
    );
    await home.finished;
    toStart.cancel(); head.cancel(); home.cancel();
    printing = false;
    button.disabled = false;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const name = cleanName(input.value) || SAMPLE;
    try {
      if (name === SAMPLE) localStorage.removeItem(STORE);
      else localStorage.setItem(STORE, name);
    } catch { /* storage unavailable: keep it for this visit only */ }
    print(name);
  });

  let saved = '';
  try { saved = cleanName(localStorage.getItem(STORE)); } catch { saved = ''; }
  const startName = saved || SAMPLE;
  if (saved) input.value = saved;
  setInk(startName);
  setEverywhere(startName);

  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitInk, 120); });
  if (document.fonts) document.fonts.ready.then(fitInk);

  /* ---------- Product board ---------- */
  const products = Array.isArray(window.DECatalog) ? window.DECatalog : [];
  const list = $('#productList');
  const search = $('#catalogSearch');
  const chips = $$('[data-filter]');
  let filter = 'all';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function drawBoard() {
    const q = search.value.trim().toLocaleLowerCase();
    const found = products.filter(p =>
      (filter === 'all' || p.category === filter) &&
      [p.name, p.kind, p.description, ...(p.tags || [])].join(' ').toLocaleLowerCase().includes(q));

    list.replaceChildren();
    if (!found.length) {
      const li = el('li', 'board-empty', 'Nothing matches that. ');
      const reset = el('button', '', 'Show everything');
      reset.type = 'button';
      reset.addEventListener('click', () => { search.value = ''; setFilter('all'); });
      li.append(reset);
      list.append(li);
      return;
    }
    found.forEach(p => {
      const li = el('li', 'card');
      const img = document.createElement('img');
      img.src = p.shot; img.alt = `${p.name} screenshot`; img.width = 960; img.height = 600; img.loading = 'lazy'; img.decoding = 'async';
      const shot = el('a', 'card-shot'); shot.href = p.href; shot.setAttribute('aria-hidden', 'true'); shot.tabIndex = -1; shot.append(img);
      const body = el('div', 'card-body');
      body.append(el('p', 'card-kind', `${p.id} · ${p.kind}`), el('h3', 'card-name', p.name), el('p', 'card-desc', p.description));
      const actions = el('div', 'card-actions');
      const open = el('a', 'card-open', 'Try the demo'); open.href = p.href;
      const more = el('button', 'card-more', 'Details'); more.type = 'button'; more.dataset.product = p.id;
      more.setAttribute('aria-label', `Details about ${p.name}`);
      actions.append(open, more); body.append(actions);
      li.append(shot, body); list.append(li);
    });
  }

  function setFilter(value) {
    filter = value;
    chips.forEach(c => { const on = c.dataset.filter === value; c.classList.toggle('is-on', on); c.setAttribute('aria-pressed', String(on)); });
    drawBoard();
  }

  chips.forEach(c => c.addEventListener('click', () => setFilter(c.dataset.filter)));
  search.addEventListener('input', drawBoard);

  /* ---------- Dialogs ---------- */
  const productDialog = $('#productDialog');
  const briefDialog = $('#briefDialog');

  list.addEventListener('click', event => {
    const slip = event.target.closest('[data-product]');
    if (!slip) return;
    const p = products.find(item => item.id === slip.dataset.product);
    if (!p) return;
    const live = true;
    const status = $('#dialogStatus');
    status.textContent = `Working demo · ${p.kind}`;
    status.classList.toggle('planned', !live);
    $('#dialogTitle').textContent = p.name;
    $('#dialogLede').textContent = p.description;
    $('#dialogDetail').textContent = p.detail || '';
    const tags = $('#dialogTags');
    tags.replaceChildren(...(p.tags || []).map(t => el('li', '', t)));
    const open = $('#dialogOpen');
    open.hidden = !live;
    if (live && p.href) open.href = p.href;
    $('#dialogBrief').hidden = live;
    $('#dialogNote').textContent = 'Free to try. Not sold online yet; we set it up for your business directly.';
    productDialog.showModal();
  });

  productDialog.addEventListener('click', event => {
    if (event.target === productDialog || event.target.closest('[data-close-dialog]')) productDialog.close();
  });
  $('#dialogBrief').addEventListener('click', () => { productDialog.close(); briefDialog.showModal(); });

  $$('[data-open-brief]').forEach(btn => btn.addEventListener('click', () => {
    const project = $('input[name="project"]', briefDialog);
    const name = cleanName(input.value) || saved;
    if (name && !project.value) project.value = name;
    briefDialog.showModal();
  }));
  briefDialog.addEventListener('click', event => {
    if (event.target === briefDialog || event.target.closest('[data-close-brief]')) briefDialog.close();
  });

  const briefForm = $('#briefForm');
  briefForm.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(briefForm);
    const brief = `RZ DIGITAL EMPIRE — PROJECT BRIEF\n\nPROJECT: ${data.get('project')}\nTYPE: ${data.get('category')}\nBUDGET: ${data.get('budget')}\n\nWHAT IT SHOULD DO:\n${data.get('description')}\n\nPrepared on the RZ Digital Empire website.`;
    const status = $('#briefStatus');
    try {
      await navigator.clipboard.writeText(brief);
      status.textContent = 'Brief copied. Paste it into a message to send it.';
    } catch {
      let area = $('.clipboard-fallback', briefForm);
      if (!area) { area = document.createElement('textarea'); area.className = 'clipboard-fallback'; area.readOnly = true; briefForm.append(area); }
      area.value = brief;
      area.focus(); area.select();
      status.textContent = 'Copy the selected text above to keep your brief.';
    }
  });

  $('#copyrightYear').textContent = String(new Date().getFullYear());
  drawBoard();
})();
