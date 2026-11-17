(() => {
  'use strict';
  const { el, $, peso, load, save, clean, today, addDays, iso } = window.RZ;

  const KEY = 'rz-quote-doc';
  const SAMPLE = () => ({
    type: 'Quotation', biz: 'Dela Cruz Builders & Renovation', bizAddr: '27 Mabini St., Brgy. San Isidro, Antipolo, Rizal', bizContact: '0917 803 2214 · delacruzbuilders@email.ph', tin: '',
    client: 'Mr. & Mrs. Ramon Villanueva', project: 'Kitchen renovation, 12 sqm', no: 'Q-2026-041', date: iso(today()), until: iso(addDays(today(), 15)),
    items: [['Demolition and hauling of old cabinets', 1, 'lot', 6500], ['Ceramic floor tiles 60×60, supply and install', 12, 'sqm', 1450], ['Modular kitchen cabinets, laminated marine plywood', 4.5, 'lm', 9800], ['Granite countertop, black galaxy', 3.2, 'lm', 7200], ['Plumbing re-routing and fixtures', 1, 'lot', 8500]],
    disc: 5, vat: false, pay: '50% downpayment, 50% upon turnover · BDO 0012-3456-789 · GCash 0917 803 2214',
    notes: 'Work duration: 12 working days.\nPrices include labor and materials listed.\nChanges in scope are quoted separately.',
  });

  let doc = load(KEY, SAMPLE());
  const form = $('#ed');
  const num = v => Math.max(0, Number(v) || 0);
  const fmtD = s => (s ? new Date(`${s}T00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '—');

  function fill() {
    ['biz', 'bizAddr', 'bizContact', 'tin', 'client', 'project', 'no', 'date', 'until', 'disc', 'pay', 'notes'].forEach(k => { form.elements[k].value = doc[k] ?? ''; });
    form.elements.vat.checked = !!doc.vat;
    form.querySelector(`input[name="type"][value="${doc.type}"]`).checked = true;
    renderItems();
  }

  function renderItems() {
    $('#items').replaceChildren(...doc.items.map((it, i) => el('div', { class: 'item' },
      el('input', { value: it[0], maxlength: 90, 'aria-label': `Item ${i + 1} description`, placeholder: 'Description', oninput: e => { it[0] = clean(e.target.value, 90); update(); } }),
      el('input', { type: 'number', min: 0, step: 'any', value: it[1], 'aria-label': `Item ${i + 1} quantity`, inputmode: 'decimal', oninput: e => { it[1] = num(e.target.value); update(); } }),
      el('input', { class: 'unit', value: it[2], maxlength: 8, 'aria-label': `Item ${i + 1} unit`, placeholder: 'unit', oninput: e => { it[2] = clean(e.target.value, 8); update(); } }),
      el('input', { type: 'number', min: 0, step: 'any', value: it[3], 'aria-label': `Item ${i + 1} rate`, inputmode: 'decimal', oninput: e => { it[3] = num(e.target.value); update(); } }),
      el('button', { type: 'button', class: 'del', 'aria-label': `Remove item ${i + 1}`, onclick: () => { doc.items.splice(i, 1); renderItems(); update(); } }, '×'))));
  }

  function totals() {
    const sub = doc.items.reduce((s, [, q, , r]) => s + q * r, 0);
    const disc = sub * Math.min(100, num(doc.disc)) / 100;
    const vat = doc.vat ? (sub - disc) * 0.12 : 0;
    return { sub, disc, vat, total: sub - disc + vat };
  }

  function update() {
    const f = form.elements;
    ['biz', 'bizAddr', 'bizContact', 'tin', 'client', 'project', 'no', 'pay'].forEach(k => { doc[k] = clean(f[k].value, 120); });
    doc.notes = String(f.notes.value).slice(0, 500);
    doc.date = f.date.value; doc.until = f.until.value; doc.disc = num(f.disc.value); doc.vat = f.vat.checked;
    doc.type = form.querySelector('input[name="type"]:checked').value;
    save(KEY, doc); paint();
  }

  function paint() {
    const inv = doc.type === 'Invoice'; const t = totals();
    $('#dBiz').textContent = doc.biz || 'Your business';
    $('#dBizAddr').textContent = doc.bizAddr; $('#dBizContact').textContent = doc.bizContact;
    $('#dType').textContent = inv ? 'Invoice' : 'Quotation';
    $('#dNo').textContent = doc.no || '—'; $('#dDate').textContent = fmtD(doc.date);
    $('#untilLabel').textContent = inv ? 'Due date' : 'Valid until';
    $('#dUntilLabel').textContent = inv ? 'Due' : 'Valid until';
    $('#dUntil').textContent = fmtD(doc.until);
    $('#dToLabel').textContent = inv ? 'Billed to' : 'Prepared for';
    $('#dClient').textContent = doc.client || 'Client name'; $('#dProject').textContent = doc.project;
    $('#dLines').replaceChildren(...doc.items.filter(it => it[0] || it[1] * it[3]).map(([d, q, u, r]) => el('tr', {},
      el('td', {}, d), el('td', {}, q.toLocaleString('en-PH')), el('td', {}, u), el('td', {}, peso(r)), el('td', {}, peso(q * r)))));
    $('#dSub').textContent = peso(t.sub);
    $('#dDiscRow').hidden = !t.disc; $('#dDiscLabel').textContent = `Discount ${num(doc.disc)}%`; $('#dDisc').textContent = `− ${peso(t.disc)}`;
    $('#dVatRow').hidden = !doc.vat; $('#dVat').textContent = peso(t.vat);
    $('#dGrandLabel').textContent = inv ? 'Amount due' : 'Total';
    $('#dTotal').textContent = peso(t.total);
    $('#dPay').textContent = doc.pay || '—'; $('#dNotes').textContent = doc.notes || '—';
    $('#dTin').textContent = doc.tin ? `TIN ${doc.tin} · Billing statement, not an official receipt.` : 'Billing statement, not an official receipt.';
    $('#convert').hidden = inv;
    document.title = `${inv ? 'Invoice' : 'Quotation'} ${doc.no} — ${doc.biz}`;
  }

  form.addEventListener('input', e => { if (!e.target.closest('.item')) update(); });
  form.addEventListener('change', e => { if (e.target.name === 'type' || e.target.name === 'vat') update(); });
  $('#addItem').addEventListener('click', () => { doc.items.push(['', 1, 'pc', 0]); renderItems(); update(); $('#items').lastElementChild.querySelector('input').focus(); });
  $('#convert').addEventListener('click', () => {
    doc.type = 'Invoice'; doc.no = String(doc.no || '').replace(/^Q/i, 'INV') || 'INV-001';
    doc.date = iso(today()); doc.until = iso(addDays(today(), 7));
    save(KEY, doc); fill(); paint();
  });
  $('#newDoc').addEventListener('click', () => {
    if (!confirm('Start a new blank document? Your business details stay.')) return;
    const keep = { biz: doc.biz, bizAddr: doc.bizAddr, bizContact: doc.bizContact, tin: doc.tin, pay: doc.pay };
    doc = { ...keep, type: 'Quotation', client: '', project: '', no: `Q-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`, date: iso(today()), until: iso(addDays(today(), 15)), items: [['', 1, 'pc', 0]], disc: 0, vat: false, notes: '' };
    save(KEY, doc); fill(); paint();
  });
  $('#printBtn').addEventListener('click', () => window.print());

  fill(); paint();
})();
