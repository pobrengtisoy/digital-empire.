(() => {
  'use strict';
  const { el, $, peso, load, save, clean, download, id: newId } = window.RZ;

  const KEY = 'rz-sahod';
  const y = new Date().getFullYear();
  const SAMPLE = () => ({
    co: 'Kainan sa Kanto', ot: 1.25, dpm: 26,
    staff: [
      { id: 's1', name: 'Maricel Santos', role: 'Cook', rate: 695, since: `${y - 3}-02`, days: 13, ot: 6, late: 0, dues: 712, adv: 1000 },
      { id: 's2', name: 'Jomar Dela Rosa', role: 'Kitchen helper', rate: 645, since: `${y}-03`, days: 12, ot: 2, late: 35, dues: 640, adv: 0 },
      { id: 's3', name: 'Angelica Ramos', role: 'Cashier', rate: 645, since: `${y - 1}-08`, days: 13, ot: 0, late: 12, dues: 640, adv: 500 },
      { id: 's4', name: 'Rodel Bautista', role: 'Delivery rider', rate: 645, since: `${y}-06`, days: 11, ot: 4, late: 0, dues: 640, adv: 0 },
      { id: 's5', name: 'Liza Mercado', role: 'Server', rate: 645, since: `${y - 2}-01`, days: 13, ot: 3, late: 0, dues: 640, adv: 300 },
    ],
  });

  let data = load(KEY, SAMPLE());
  const persist = () => save(KEY, data);
  const now = new Date();
  let period = { y: now.getFullYear(), m: now.getMonth(), half: now.getDate() <= 15 ? 1 : 2 };

  const n = v => Math.max(0, Number(v) || 0);
  function calc(s) {
    const hourly = s.rate / 8;
    const basic = s.rate * n(s.days);
    const ot = hourly * n(data.ot) * n(s.ot);
    const late = (hourly / 60) * n(s.late);
    const gross = basic + ot;
    const ded = late + n(s.dues) + n(s.adv);
    return { hourly, basic, ot, late, gross, ded, net: gross - ded };
  }

  function periodText() {
    const last = new Date(period.y, period.m + 1, 0).getDate();
    const mon = new Date(period.y, period.m, 1).toLocaleDateString('en-PH', { month: 'short' });
    return period.half === 1 ? `${mon} 1–15, ${period.y}` : `${mon} 16–${last}, ${period.y}`;
  }

  function renderHead() {
    $('#coName').textContent = data.co;
    $('#periodRange').textContent = periodText();
    $('#periodLabel').textContent = period.half === 1 ? '· 1st half' : '· 2nd half';
    const totals = data.staff.map(calc);
    $('#sGross').textContent = peso(totals.reduce((s, t) => s + t.gross, 0), true);
    $('#sDed').textContent = peso(totals.reduce((s, t) => s + t.ded, 0), true);
    $('#sNet').textContent = peso(totals.reduce((s, t) => s + t.net, 0), true);
    $('#sStaff').textContent = data.staff.length;
    document.title = `${data.co} — Payroll ${periodText()}`;
  }

  const FIELDS = [['rate', 'Daily rate', ''], ['days', 'Days worked', 's'], ['ot', 'Overtime hours', 's'], ['late', 'Late minutes', 's'], ['dues', 'Government dues', ''], ['adv', 'Cash advance', '']];

  function renderRows() {
    $('#rows').replaceChildren(...data.staff.map(s => {
      const c = calc(s);
      const tr = el('tr', {},
        el('td', { class: 'tl who' }, el('b', {}, s.name), el('small', {}, s.role || '')),
        ...FIELDS.map(([k, label, cls]) => el('td', {}, el('input', { type: 'number', min: 0, step: 'any', inputmode: 'decimal', class: cls, value: s[k], 'aria-label': `${label} for ${s.name}`,
          oninput: e => { s[k] = n(e.target.value); persist(); const cc = calc(s); tr.querySelector('.gross').textContent = peso(cc.gross); const nn = tr.querySelector('.net'); nn.textContent = peso(cc.net); nn.classList.toggle('neg', cc.net < 0); renderHead(); render13(); } }))),
        el('td', { class: 'gross' }, peso(c.gross)),
        el('td', { class: `net${c.net < 0 ? ' neg' : ''}` }, peso(c.net)),
        el('td', {}, el('span', { class: 'row-act' },
          el('button', { type: 'button', class: 'icon', onclick: () => openSlip(s) }, 'Payslip'),
          el('button', { type: 'button', class: 'icon rm', 'aria-label': `Remove ${s.name}`, onclick: () => { if (confirm(`Remove ${s.name}?`)) { data.staff = data.staff.filter(x => x.id !== s.id); persist(); renderAll(); } } }, '×'))));
      return tr;
    }));
  }

  function render13() {
    const thisYear = new Date().getFullYear(); const nowM = new Date().getMonth() + 1;
    $('#t13list').replaceChildren(...data.staff.map(s => {
      const [sy, sm] = String(s.since || `${thisYear}-01`).split('-').map(Number);
      const notYet = sy > thisYear || (sy === thisYear && (sm || 1) > nowM);
      const months = notYet ? 0 : sy < thisYear ? 12 : 12 - (sm || 1) + 1;
      const est = (s.rate * n(data.dpm) * months) / 12;
      return el('li', {}, el('b', {}, peso(est, true)), el('span', {}, `${s.name.split(' ')[0]} · ${months} mo${months === 1 ? '' : 's'} this year${notYet ? ' (not started)' : ''}`));
    }));
  }

  function openSlip(s) {
    const c = calc(s);
    $('#slipCo').textContent = data.co; $('#slipName').textContent = s.name; $('#slipPeriod').textContent = `${s.role ? `${s.role} · ` : ''}${periodText()}`;
    const line = (label, v, cls) => el('div', { class: cls || '' }, el('dt', {}, label), el('dd', {}, v));
    $('#slipLines').replaceChildren(
      line(`Basic (${n(s.days)} days × ${peso(s.rate)})`, peso(c.basic)),
      line(`Overtime (${n(s.ot)} hrs × ${peso(c.hourly * n(data.ot))})`, peso(c.ot)),
      line('Gross pay', peso(c.gross), 'sep'),
      line(`Late (${n(s.late)} min)`, `− ${peso(c.late)}`, 'minus'),
      line('SSS, PhilHealth, Pag-IBIG', `− ${peso(n(s.dues))}`, 'minus'),
      line('Cash advance', `− ${peso(n(s.adv))}`, 'minus'));
    $('#slipNet').textContent = peso(c.net);
    $('#slip').showModal();
  }
  $('#printSlip').addEventListener('click', () => window.print());

  $('#csvBtn').addEventListener('click', () => {
    const q = v => `"${String(v).replace(/"/g, '""')}"`;
    const head = ['Name', 'Position', 'Daily rate', 'Days', 'OT hrs', 'Late min', 'Gov dues', 'Cash advance', 'Gross', 'Net'];
    const rows = data.staff.map(s => { const c = calc(s); return [s.name, s.role, s.rate, s.days, s.ot, s.late, s.dues, s.adv, c.gross.toFixed(2), c.net.toFixed(2)]; });
    download(`payroll-${periodText().replace(/[^\w]+/g, '-')}.csv`, [head, ...rows].map(r => r.map(q).join(',')).join('\r\n'), 'text/csv');
  });

  $('#prevP').addEventListener('click', () => { if (period.half === 2) period.half = 1; else { period.half = 2; period.m -= 1; if (period.m < 0) { period.m = 11; period.y -= 1; } } renderHead(); });
  $('#nextP').addEventListener('click', () => { if (period.half === 1) period.half = 2; else { period.half = 1; period.m += 1; if (period.m > 11) { period.m = 0; period.y += 1; } } renderHead(); });

  $('#staffForm').addEventListener('submit', e => {
    const f = e.target.elements; const name = clean(f.name.value, 40); if (!name) return;
    data.staff.push({ id: newId(), name, role: clean(f.role.value, 40), rate: Math.min(20000, n(f.rate.value)), since: f.since.value || `${new Date().getFullYear()}-01`, days: 0, ot: 0, late: 0, dues: 0, adv: 0 });
    persist(); e.target.reset(); renderAll();
  });

  const sf = $('#settingsForm');
  document.querySelector('[data-open="settings"]').addEventListener('click', () => { sf.elements.co.value = data.co; sf.elements.ot.value = data.ot; sf.elements.dpm.value = data.dpm; });
  sf.addEventListener('submit', () => {
    data.co = clean(sf.elements.co.value, 50) || data.co;
    data.ot = Math.min(3, Math.max(1, Number(sf.elements.ot.value) || 1.25));
    data.dpm = Math.min(31, Math.max(20, Math.round(Number(sf.elements.dpm.value) || 26)));
    persist(); renderAll();
  });
  $('#resetBtn').addEventListener('click', () => { if (!confirm('Replace everything with the sample payroll?')) return; data = SAMPLE(); persist(); renderAll(); $('#settings').close(); });

  function renderAll() { renderHead(); renderRows(); render13(); }
  renderAll();
})();
