(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const pesoFmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
  const peso = n => pesoFmt.format(Number(n) || 0);
  const catalog = Array.isArray(window.DECatalog) ? window.DECatalog : [];

  // Prices shown from the catalog first, then replaced by the server's official list.
  // Products with plans (RZ Gabi) are bought by plan key; the product key opens its first plan.
  const prices = Object.fromEntries(catalog.flatMap(p => (p.plans
    ? p.plans.map(pl => [pl.key, { name: `${p.name} · ${pl.label} plan`, setup: pl.setup, monthly: pl.monthly, unit: '' }])
    : [[p.key, { name: p.name, setup: p.setup, monthly: p.monthly, unit: p.unit }]])));
  const productOf = k => catalog.find(p => p.key === k || p.plans?.some(pl => pl.key === k)) || {};
  let key = new URLSearchParams(location.search).get('p');
  if (catalog.find(p => p.key === key)?.plans) key = productOf(key).plans[0].key;
  if (!prices[key]) key = catalog[0]?.plans ? catalog[0].plans[0].key : catalog[0]?.key || 'menu';

  const select = $('#pSelect');
  select.replaceChildren(...catalog.map(p => { const o = document.createElement('option'); o.value = p.key; o.textContent = `${p.name} — ${p.kind}`; return o; }));

  function due(p) { return (Number(p.setup) || 0) + (Number(p.monthly) || 0); }

  function render() {
    const p = prices[key]; const c = productOf(key);
    select.value = c.key;
    renderPlans(c);
    $('#pName').textContent = p.name;
    $('#pKind').textContent = c.kind ? `For ${c.kind.toLowerCase()}` : '';
    $('#setupLabel').textContent = p.unit ? `Price (${p.unit})` : 'One-time setup';
    $('#pSetup').textContent = peso(p.setup);
    $('#monthRow').hidden = !p.monthly;
    $('#pMonth').textContent = peso(p.monthly);
    $('#pDue').textContent = peso(due(p));
    $('#amt').textContent = peso(due(p));
    $('#amt2').textContent = peso(due(p));
    $('#pAfter').textContent = p.monthly ? `Then ${peso(p.monthly)} a month from the second month. To stop, tell us before your next due date.` : `One payment ${p.unit || ''}. No monthly fee.`;
    $('#getMonthly').hidden = !p.monthly;
    $('#pDemo').href = c.href ? `../${c.href}` : '../index.html';
    document.title = `Buy ${p.name} — RZ Digital Empire`;
  }

  function renderPlans(c) {
    const box = $('#planPick'); box.hidden = !c.plans;
    if (!c.plans) { box.replaceChildren(); return; }
    box.replaceChildren(...c.plans.map(pl => {
      const label = document.createElement('label'); label.className = 'plan';
      const input = document.createElement('input'); input.type = 'radio'; input.name = 'plan'; input.value = pl.key; input.checked = pl.key === key;
      input.addEventListener('change', () => { key = pl.key; render(); history.replaceState(null, '', `?p=${encodeURIComponent(key)}`); });
      const card = document.createElement('span'); card.className = 'plan-in';
      const top = document.createElement('b'); top.textContent = pl.label;
      const pr = document.createElement('em'); pr.textContent = `${peso(prices[pl.key].setup)} + ${peso(prices[pl.key].monthly)}/mo`;
      const ul = document.createElement('ul');
      pl.features.forEach(f => { const li = document.createElement('li'); li.textContent = f; ul.append(li); });
      card.append(top, pr, ul); label.append(input, card); return label;
    }));
  }

  select.addEventListener('change', () => {
    const c = catalog.find(x => x.key === select.value);
    key = c?.plans ? c.plans[0].key : select.value; render();
    history.replaceState(null, '', `?p=${encodeURIComponent(key)}`);
  });

  $('#copyAmt').addEventListener('click', async () => {
    const amount = String(due(prices[key]));
    try { await navigator.clipboard.writeText(amount); $('#copyAmt').textContent = 'Copied'; }
    catch { $('#copyAmt').textContent = amount; }
    setTimeout(() => { $('#copyAmt').textContent = 'Copy'; }, 1800);
  });

  fetch('/api/public/prices').then(r => (r.ok ? r.json() : null)).then(d => {
    if (!d || !d.prices) return;
    Object.entries(d.prices).forEach(([k, p]) => { prices[k] = { name: p.name, setup: p.setup, monthly: p.monthly, unit: p.unit || '' }; });
    render();
  }).catch(() => { /* keep catalog prices */ });

  const form = $('#buyForm');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#err'); const btn = $('#sendBtn');
    const f = form.elements;
    err.textContent = '';
    if (!f.name.value.trim()) { err.textContent = 'Enter your name.'; f.name.focus(); return; }
    if (!f.mobile.value.trim()) { err.textContent = 'Enter your mobile number.'; f.mobile.focus(); return; }
    if (!f.reference.value.trim()) { err.textContent = 'Enter the reference number from your payment receipt.'; f.reference.focus(); return; }
    if (!f.agree.checked) { err.textContent = 'Please confirm that you paid the amount shown.'; return; }
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const res = await fetch('/api/public/purchases', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ product: key, name: f.name.value, business: f.business.value, mobile: f.mobile.value, email: f.email.value, reference: f.reference.value.replace(/\s+/g, ''), notes: f.notes.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send your order. Please try again, or message us on Telegram.');
      form.hidden = true;
      $('#done').hidden = false;
      $('#doneCode').textContent = data.code;
      $('#doneText').textContent = `${data.product} · ${peso(data.amount)}. Keep this order number. We’ll message you on ${f.mobile.value.trim()} to confirm.`;
      $('#done').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (ex) {
      err.textContent = ex.message; btn.disabled = false; btn.textContent = 'Send my order';
    }
  });

  render();
})();
