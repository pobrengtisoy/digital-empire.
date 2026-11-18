(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const pesoFmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
  const peso = n => pesoFmt.format(Number(n) || 0);
  const catalog = Array.isArray(window.DECatalog) ? window.DECatalog : [];

  // Prices shown from the catalog first, then replaced by the server's official list.
  const prices = Object.fromEntries(catalog.map(p => [p.key, { name: p.name, setup: p.setup, monthly: p.monthly, unit: p.unit }]));
  let key = new URLSearchParams(location.search).get('p');
  if (!prices[key]) key = catalog[0]?.key || 'menu';

  const select = $('#pSelect');
  select.replaceChildren(...catalog.map(p => { const o = document.createElement('option'); o.value = p.key; o.textContent = `${p.name} — ${p.kind}`; return o; }));

  function due(p) { return (Number(p.setup) || 0) + (Number(p.monthly) || 0); }

  function render() {
    const p = prices[key]; const c = catalog.find(x => x.key === key) || {};
    select.value = key;
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

  select.addEventListener('change', () => {
    key = select.value; render();
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
