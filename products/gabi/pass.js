/* Guest list pass: ?t=<token> from the RZ server, ?demo=<token> from the demo in this browser. The QR holds only the pass code. */
import { demoLoad, drawQR, longDate } from './common.js';

const { $ } = window.RZ;
const q = new URLSearchParams(location.search);
const token = q.get('t'); const demo = q.get('demo');

function show(v) {
  document.title = `${v.club} pass — ${v.name}`;
  $('#pClub').textContent = v.club;
  $('#pEvent').textContent = v.event?.title || 'Guest list';
  $('#pDate').textContent = v.event ? longDate(v.event.date) : '';
  $('#pCode').textContent = v.code;
  $('#pName').textContent = v.name;
  $('#pPlus').textContent = v.plus ? `You + ${v.plus}` : 'Just you';
  $('#pDoors').textContent = v.event?.doors || '—';
  const st = { listed: 'On the list', in: 'Checked in · enjoy the night', cancelled: 'Cancelled' }[v.status] || '';
  $('#pStatus').textContent = st; $('#pStatus').className = `t-status s-${v.status}`;
  drawQR($('#qr'), `RZGABI:${v.code}`);
  if (v.slug && v.slug !== 'demo') $('#backLink').href = `index.html?club=${encodeURIComponent(v.slug)}`;
  $('#pass').hidden = false;
}
function missing(msg) { $('#missing').hidden = false; if (msg) $('#missingText').textContent = msg; }

(async () => {
  if (demo) {
    $('#strip').hidden = false;
    const d = demoLoad(); const g = d.guests.find(x => x.token === demo);
    if (!g) return missing('This demo pass is not on this device.');
    const ev = d.events.find(e => e.id === g.eventId);
    return show({ club: d.club.name, slug: 'demo', event: ev, name: g.name, plus: g.plus, code: g.code, status: g.status });
  }
  if (!token || !/^[a-f0-9]{48}$/.test(token)) return missing();
  try {
    const res = await fetch(`/api/public/gabi/pass/${token}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return missing(data.error);
    show(data);
  } catch { missing('Could not load your pass. Check your connection.'); }
})();
