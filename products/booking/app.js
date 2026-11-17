(() => {
  'use strict';
  const { el, $, peso, load, save, clean, sendMessage, messengerUser, today, addDays, iso } = window.RZ;

  const SAMPLE = { name: 'Lumen Salon & Spa', line: 'Hair, nails and massage · BGC, Taguig', hours: 'Tue–Sun · 10:00 AM – 8:00 PM', messenger: '' };
  const SERVICES = [
    { group: 'Hair', items: [['cut', 'Haircut & blow-dry', 60, 650], ['color', 'Full colour', 150, 3200], ['keratin', 'Keratin treatment', 180, 4500]] },
    { group: 'Nails', items: [['mani', 'Classic manicure', 45, 350], ['gel', 'Gel manicure', 75, 850], ['pedi', 'Spa pedicure', 60, 550]] },
    { group: 'Spa', items: [['hilot', 'Hilot massage', 60, 900], ['swedish', 'Swedish massage', 90, 1300], ['facial', 'Hydrating facial', 60, 1200]] },
  ];
  const STAFF = ['Any available', 'Ate Joy', 'Mika', 'Carlo', 'Bea'];
  const OPEN = 10 * 60, CLOSE = 20 * 60, STEP = 30;
  const ALL = Object.fromEntries(SERVICES.flatMap(g => g.items.map(([id, name, mins, price]) => [id, { id, name, mins, price, group: g.group }])));

  let biz = load('rz-booking-biz', SAMPLE);
  let state = { svc: null, day: null, time: null };

  // Deterministic "already booked" slots so the demo looks lived-in.
  const taken = (dayIso, m) => {
    let h = 0; for (const c of dayIso + m) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h % 100 < 32;
  };
  const fmtTime = m => { const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  const fmtDay = d => d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });

  function applyBiz() {
    $('#bizName').textContent = biz.name;
    $('#bizLine').textContent = biz.line;
    $('#bizHours').textContent = biz.hours;
    document.title = `${biz.name} — Book`;
  }

  function renderServices() {
    $('#services').replaceChildren(...SERVICES.map(g => el('div', { class: 'svc-group' },
      el('h3', {}, g.group),
      g.items.map(([id]) => { const s = ALL[id]; return el('button', { type: 'button', class: 'svc', 'aria-pressed': String(state.svc === id), onclick: () => { state.svc = id; state.time = null; renderAll(); } },
        el('b', {}, s.name), el('span', { class: 'svc-price' }, peso(s.price, true)), el('small', {}, `${s.mins} minutes`)); }))));
  }

  function renderDays() {
    const start = today();
    if (!state.day) { let d = new Date().getHours() >= 16 ? addDays(start, 1) : start; while (d.getDay() === 1) d = addDays(d, 1); state.day = iso(d); }
    $('#days').replaceChildren(...Array.from({ length: 14 }, (_, i) => {
      const d = addDays(start, i); const closed = d.getDay() === 1; const id = iso(d);
      return el('button', { type: 'button', class: 'day', disabled: closed, 'aria-pressed': String(state.day === id), 'aria-label': `${fmtDay(d)}${closed ? ', closed' : ''}`, onclick: () => { state.day = id; state.time = null; renderAll(); } },
        el('span', {}, i === 0 ? 'Today' : d.toLocaleDateString('en-PH', { weekday: 'short' })), el('b', {}, d.getDate()));
    }));
  }

  function renderSlots() {
    const box = $('#slots');
    if (!state.svc) { box.replaceChildren(el('p', { class: 'hint' }, 'Choose a service to see open times.')); return; }
    const mins = ALL[state.svc].mins;
    const now = new Date(); const isToday = state.day === iso(today());
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const slots = [];
    for (let m = OPEN; m + mins <= CLOSE; m += STEP) {
      let busy = false;
      for (let k = m; k < m + mins; k += STEP) if (taken(state.day, k)) busy = true;
      if (isToday && m <= nowMin + 30) busy = true;
      slots.push(el('button', { type: 'button', class: 'slot', disabled: busy, 'aria-pressed': String(state.time === m), 'aria-label': `${fmtTime(m)}${busy ? ', booked' : ''}`, onclick: () => { state.time = m; renderAll(); } }, fmtTime(m)));
    }
    box.replaceChildren(...(slots.some(s => !s.disabled) ? slots : [el('p', { class: 'hint' }, 'Fully booked. Try another day.'), ...slots]));
  }

  function renderTicket() {
    const ready = state.svc && state.day && state.time != null;
    $('#tEmpty').hidden = ready; $('#tBody').hidden = !ready; $('#bookBtn').disabled = !ready;
    if (!ready) return;
    const s = ALL[state.svc]; const d = new Date(`${state.day}T00:00`);
    $('#tService').textContent = s.name;
    $('#tWhen').textContent = `${fmtDay(d)}, ${fmtTime(state.time)}`;
    $('#tDur').textContent = `${s.mins} min · ends ${fmtTime(state.time + s.mins)}`;
    $('#tPrice').textContent = peso(s.price, true);
  }

  function renderAll() { renderServices(); renderDays(); renderSlots(); renderTicket(); }

  $('#staff').replaceChildren(...STAFF.map(s => el('option', {}, s)));

  $('#bookForm').addEventListener('submit', e => {
    e.preventDefault();
    const d = new FormData(e.target); const s = ALL[state.svc];
    const msg = [
      `APPOINTMENT REQUEST — ${biz.name}`,
      `${s.name} (${s.mins} min) · ${peso(s.price)}`,
      `${fmtDay(new Date(`${state.day}T00:00`))}, ${fmtTime(state.time)}`,
      `Staff: ${d.get('staff')}`,
      `Name: ${clean(d.get('name'), 60)} · ${clean(d.get('phone'), 20)}`,
      clean(d.get('notes'), 300) ? `Notes: ${clean(d.get('notes'), 300)}` : null,
    ].filter(Boolean).join('\n');
    sendMessage(msg, biz.messenger, $('#status'));
  });

  const sf = $('#settingsForm');
  document.querySelector('[data-open="settings"]').addEventListener('click', () => Object.entries(biz).forEach(([k, v]) => { if (sf.elements[k]) sf.elements[k].value = v; }));
  sf.addEventListener('submit', () => {
    const f = sf.elements;
    biz = { name: clean(f.name.value, 50) || SAMPLE.name, line: clean(f.line.value, 70), hours: clean(f.hours.value, 60), messenger: messengerUser(f.messenger.value) };
    save('rz-booking-biz', biz); applyBiz();
  });
  $('#resetSettings').addEventListener('click', () => { biz = structuredClone(SAMPLE); save('rz-booking-biz', biz); applyBiz(); $('#settings').close(); });

  applyBiz(); renderAll();
})();
