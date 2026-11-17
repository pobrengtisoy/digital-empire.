(() => {
  'use strict';
  const { el, $, peso, load, save, clean, sendMessage, messengerUser, today, iso } = window.RZ;

  const SAMPLE = { name: 'Casa Alon', loc: 'Private pool resort · San Juan, Batangas', messenger: '' };
  const PACKAGES = [
    { id: 'day', name: 'Day swim', time: '8:00 AM – 5:00 PM', rate: 6500, peak: 7500, pax: 15 },
    { id: 'night', name: 'Overnight', time: '7:00 PM – 6:00 AM', rate: 8500, peak: 9500, pax: 15 },
    { id: 'full', name: '22-hour stay', time: '2:00 PM – 12:00 NN next day', rate: 12500, peak: 14000, pax: 20 },
  ];
  const EXTRA = 300;

  let biz = load('rz-stay-biz', SAMPLE);
  const base = today();
  let view = new Date(base.getFullYear(), base.getMonth(), 1);
  let state = { pkg: 'full', date: null };

  const booked = d => { let h = 7; for (const c of iso(d)) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h % 100 < (d.getDay() === 6 ? 55 : 22); };
  const isPeak = d => d.getDay() === 5 || d.getDay() === 6 || d.getDay() === 0;
  const pkg = () => PACKAGES.find(p => p.id === state.pkg);

  function applyBiz() {
    $('#resName').textContent = biz.name; $('#footName').textContent = biz.name; $('#loc').textContent = biz.loc;
    document.title = `${biz.name} — Rates & dates`;
  }

  function renderPackages() {
    $('#packages').replaceChildren(...PACKAGES.map(p => el('button', { type: 'button', class: 'pkg', role: 'radio', 'aria-checked': String(p.id === state.pkg), onclick: () => { state.pkg = p.id; renderPackages(); renderQuote(); } },
      el('b', {}, p.name), el('span', { class: 'pkg-rate' }, peso(p.rate, true)),
      el('small', {}, `${p.time} · up to ${p.pax} guests`), el('small', { class: 'pkg-rate' }, `${peso(p.peak, true)} Fri–Sun`))));
  }

  function renderCal() {
    $('#monthLabel').textContent = view.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    $('#prevM').disabled = view.getFullYear() === base.getFullYear() && view.getMonth() === base.getMonth();
    const first = view.getDay(); const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const cells = Array.from({ length: first }, () => el('span', { class: 'blank' }));
    for (let n = 1; n <= days; n++) {
      const d = new Date(view.getFullYear(), view.getMonth(), n); const id = iso(d);
      const past = d < base; const taken = !past && booked(d);
      cells.push(el('button', {
        type: 'button', class: `day${past ? ' past' : ''}${isPeak(d) && !past ? ' peak' : ''}`, disabled: past || taken,
        'aria-pressed': String(state.date === id),
        'aria-label': `${d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}${taken ? ', booked' : past ? ', past' : ''}`,
        onclick: () => { state.date = id; renderCal(); renderQuote(); },
      }, n));
    }
    $('#cal').replaceChildren(...cells);
  }

  const qf = $('#quoteForm');
  function totals() {
    const p = pkg(); const d = state.date ? new Date(`${state.date}T00:00`) : null;
    const rate = d && isPeak(d) ? p.peak : p.rate;
    const guests = Math.max(1, Math.min(40, Number(qf.elements.guests.value) || 1));
    const extra = Math.max(0, guests - p.pax) * EXTRA;
    return { p, d, rate, guests, extra, total: rate + extra };
  }
  function renderQuote() {
    const t = totals();
    $('#qDate').textContent = t.d ? t.d.toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric' }) : 'Pick a date';
    $('#qPkg').textContent = t.p.name;
    $('#qBase').textContent = peso(t.rate) + (t.d && isPeak(t.d) ? ' (weekend)' : '');
    $('#qExtra').textContent = t.extra ? `${t.guests - t.p.pax} × ${peso(EXTRA, true)} = ${peso(t.extra)}` : 'None';
    $('#qTotal').textContent = t.d ? peso(t.total) : '—';
    $('#qDown').textContent = t.d ? peso(t.total / 2) : '—';
    $('#inqBtn').disabled = !t.d;
  }
  qf.elements.guests.addEventListener('input', renderQuote);

  $('#prevM').addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCal(); });
  $('#nextM').addEventListener('click', () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCal(); });

  qf.addEventListener('submit', e => {
    e.preventDefault();
    const t = totals(); if (!t.d) return;
    const f = new FormData(qf);
    const msg = [
      `RESERVATION INQUIRY — ${biz.name}`,
      `${t.p.name} (${t.p.time})`,
      `Date: ${t.d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`,
      `Guests: ${t.guests}`,
      `Total: ${peso(t.total)} · Downpayment: ${peso(t.total / 2)}`,
      `Name: ${clean(f.get('name'), 60)} · ${clean(f.get('phone'), 20)}`,
    ].join('\n');
    sendMessage(msg, biz.messenger, $('#status'));
  });

  const sf = $('#settingsForm');
  document.querySelector('[data-open="settings"]').addEventListener('click', () => Object.entries(biz).forEach(([k, v]) => { if (sf.elements[k]) sf.elements[k].value = v; }));
  sf.addEventListener('submit', () => {
    const f = sf.elements;
    biz = { name: clean(f.name.value, 40) || SAMPLE.name, loc: clean(f.loc.value, 70), messenger: messengerUser(f.messenger.value) };
    save('rz-stay-biz', biz); applyBiz();
  });
  $('#resetSettings').addEventListener('click', () => { biz = structuredClone(SAMPLE); save('rz-stay-biz', biz); applyBiz(); $('#settings').close(); });

  applyBiz(); renderPackages(); renderCal(); renderQuote();
})();
