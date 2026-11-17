(() => {
  'use strict';
  const { el, $, load, save, clean, sendMessage, messengerUser, download } = window.RZ;

  const SAMPLE = {
    kind: 'debut', who: 'Sofia Isabelle', date: '2027-02-13T18:00', venue: 'The Glass Garden',
    address: 'Ortigas Avenue Extension, Pasig City', hosts: 'The Reyes Family', messenger: '',
  };
  const KINDS = {
    debut: { pre: 'You are warmly invited to the eighteenth birthday of', program: [['6:00 PM', 'Arrival & cocktails', 'Photo wall and welcome drinks'], ['7:00 PM', 'Grand entrance', 'With her escort and court'], ['7:30 PM', 'Dinner', 'Plated, four courses'], ['8:30 PM', '18 Roses & 18 Candles', 'Dances and wishes from her loved ones'], ['9:30 PM', '18 Treasures', 'Gifts and messages'], ['10:00 PM', 'Party', 'Until the last song']] },
    wedding: { pre: 'Together with their families, we invite you to celebrate the marriage of', program: [['3:00 PM', 'Ceremony', 'Please be seated by 2:45 PM'], ['4:30 PM', 'Cocktails', 'Garden terrace'], ['6:00 PM', 'Reception', 'Dinner and toasts'], ['8:00 PM', 'First dance', 'Then the dance floor opens']] },
    christening: { pre: 'Please join us as we welcome into the Church', program: [['10:00 AM', 'Baptism', 'Parish church'], ['12:00 NN', 'Lunch reception', 'With family and godparents']] },
    birthday: { pre: 'Come celebrate the birthday of', program: [['6:00 PM', 'Arrival', ''], ['7:00 PM', 'Dinner', ''], ['8:00 PM', 'Cake & wishes', '']] },
  };
  const LABEL = { debut: 'Sofia', wedding: 'the couple', christening: 'the family', birthday: 'the celebrant' };

  let ev = load('rz-invite-event', SAMPLE);
  const when = () => new Date(ev.date);

  function render() {
    const k = KINDS[ev.kind] || KINDS.debut; const d = when();
    $('#pre').textContent = k.pre;
    $('#who').textContent = ev.who;
    $('#when').textContent = isNaN(d) ? '' : `${d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`;
    $('#where').textContent = ev.venue;
    $('#venueFull').textContent = [ev.venue, ev.address].filter(Boolean).join(', ');
    $('#mapLink').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([ev.venue, ev.address].filter(Boolean).join(', '))}`;
    $('#hosts').textContent = ev.hosts;
    $('#msgWho').textContent = ev.kind === 'debut' ? ev.who.split(' ')[0] : LABEL[ev.kind];
    $('#program').replaceChildren(...k.program.map(([t, title, note]) => el('li', {}, el('time', {}, t), el('span', {}, el('b', {}, title), note ? el('small', {}, note) : null))));
    const deadline = new Date(d); deadline.setDate(deadline.getDate() - 14);
    $('#deadline').textContent = isNaN(deadline) ? '' : `Please reply by ${deadline.toLocaleDateString('en-PH', { month: 'long', day: 'numeric' })}.`;
    document.title = `${ev.who} — Invitation`;
    tick();
  }

  function tick() {
    const ms = Math.max(0, when() - new Date());
    $('#cD').textContent = Math.floor(ms / 86400000);
    $('#cH').textContent = Math.floor(ms / 3600000) % 24;
    $('#cM').textContent = Math.floor(ms / 60000) % 60;
  }
  setInterval(tick, 30000);

  const form = $('#rsvpForm');
  form.addEventListener('change', () => { $('#seatsFld').hidden = form.elements.going.value === 'no'; });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(form); const yes = f.get('going') === 'yes';
    const msg = [
      `RSVP — ${ev.who}`,
      `${clean(f.get('name'), 60)} ${yes ? `will attend (${f.get('seats')} seat${f.get('seats') === '1' ? '' : 's'})` : 'cannot attend'}`,
      clean(f.get('note'), 300) ? `Message: ${clean(f.get('note'), 300)}` : null,
    ].filter(Boolean).join('\n');
    sendMessage(msg, ev.messenger, $('#status')).then(ok => { if (ok && !ev.messenger) $('#status').textContent = 'Reply copied. Send it to the host by text or Messenger.'; });
  });

  // .ics calendar file, built from plain text fields.
  $('#calBtn').addEventListener('click', () => {
    const d = when(); if (isNaN(d)) return;
    const stamp = x => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const end = new Date(d.getTime() + 5 * 3600000);
    const esc = s => String(s).replace(/[\\;,]/g, m => `\\${m}`).replace(/\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RZ Digital Empire//RZ Invite//EN', 'BEGIN:VEVENT',
      `UID:${Date.now()}@rz-invite`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(d)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(ev.who)}`, `LOCATION:${esc([ev.venue, ev.address].filter(Boolean).join(', '))}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    download('invitation.ics', ics, 'text/calendar');
  });

  const sf = $('#settingsForm');
  document.querySelector('[data-open="settings"]').addEventListener('click', () => Object.entries(ev).forEach(([k, v]) => { if (sf.elements[k]) sf.elements[k].value = v; }));
  sf.addEventListener('submit', () => {
    const f = sf.elements;
    ev = { kind: KINDS[f.kind.value] ? f.kind.value : 'debut', who: clean(f.who.value, 50) || SAMPLE.who, date: f.date.value || SAMPLE.date,
      venue: clean(f.venue.value, 60), address: clean(f.address.value, 120), hosts: clean(f.hosts.value, 60), messenger: messengerUser(f.messenger.value) };
    save('rz-invite-event', ev); render();
  });
  $('#resetSettings').addEventListener('click', () => { ev = structuredClone(SAMPLE); save('rz-invite-event', ev); render(); $('#settings').close(); });

  render();
  document.querySelectorAll('.cover > *, .count').forEach((n, i) => { n.classList.add('reveal'); n.style.animationDelay = `${i * 120}ms`; });
})();
