/* RZ Gabi shared helpers: plans, dates, photos and the demo club SINAG (kept in this browser). */

export const DEMO_KEY = 'rz-gabi-demo-v1';
export const LEVEL = { site: 1, vip: 2, full: 3 };
export const PLAN_NAME = { site: 'Site', vip: 'VIP', full: 'Full' };
export const has = (plan, min) => LEVEL[plan || 'site'] >= LEVEL[min];

export function photoUrl(ref) {
  if (!ref) return '';
  if (ref.startsWith('demo:')) return `../../assets/gabi/${ref.slice(5)}.webp`;
  return `/api/public/bahay/photo/${ref}`;
}

const pesoFmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
export const peso = n => pesoFmt.format(Number(n) || 0);

/* Dates are plain YYYY-MM-DD in Philippine time. */
export function manilaToday(offset = 0) { return new Date(Date.now() + 8 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10); }
const asDate = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const dayName = iso => asDate(iso).toLocaleDateString('en-PH', { weekday: 'short', timeZone: 'UTC' });
export const dayNum = iso => asDate(iso).getUTCDate();
export const monthName = iso => asDate(iso).toLocaleDateString('en-PH', { month: 'short', timeZone: 'UTC' });
export const longDate = iso => asDate(iso).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
export function whenLabel(iso, today = manilaToday()) {
  if (iso === today) return 'Tonight';
  if (iso === manilaToday(1)) return 'Tomorrow';
  return dayName(iso);
}

const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const passCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CODE_ABC[b % CODE_ABC.length]).join('');
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
export { uid };

/* ---------- demo club ---------- */
export function demoSeed() {
  const d = n => manilaToday(n);
  const ev = (id, n, title, lineup, genre, doors, cover, featured = false) => ({ id, date: d(n), title, lineup, genre, doors, cover, note: '', featured, status: 'on' });
  return {
    club: {
      name: 'SINAG', slug: 'demo', plan: 'full', tagline: 'Where the night turns gold.',
      about: 'Two floors of sound, a skybox above the dance floor and a bar that pours till sunrise. Resident DJs every Thursday to Saturday, guest headliners every month.',
      address: 'Lacson Street', city: 'Bacolod City', hours: 'Thu–Sat · 10 PM until late', dressCode: 'Smart casual. No slippers, sando or basketball shorts.',
      age: '21+', mobile: '0917 555 0199', messenger: '', instagram: '', photos: ['demo:hero', 'demo:dj', 'demo:vip', 'demo:bar', 'demo:rooftop', 'demo:door'],
    },
    events: [
      ev('e1', 0, 'Neon Heat', ['DJ Kidlat', 'Mara Vee'], 'House · Tech house', '10 PM', '₱500 with 1 drink', true),
      ev('e2', 1, 'Throwback Gold', ['DJ Lolo Beats', 'Ria Santos'], '2000s · R&B · OPM hits', '10 PM', '₱300'),
      ev('e3', 2, 'Sinag Saturdays', ['Kaiju Bass', 'DJ Kidlat', 'Luna Ray'], 'EDM · Big room', '10 PM', '₱800 with 2 drinks', true),
      ev('e4', 6, 'Latin Night', ['DJ Sol'], 'Reggaeton · Latin pop', '10 PM', '₱400'),
      ev('e5', 8, 'Headliner: Aurora Lane', ['Aurora Lane', 'Mara Vee'], 'Melodic techno', '9 PM', '₱1,500 · limited'),
    ],
    tables: [
      { id: 't1', name: 'VIP 1', zone: 'Main floor', capacity: 6, minSpend: 8000, x: 16, y: 30 },
      { id: 't2', name: 'VIP 2', zone: 'Main floor', capacity: 6, minSpend: 8000, x: 16, y: 58 },
      { id: 't3', name: 'VIP 3', zone: 'Main floor', capacity: 8, minSpend: 12000, x: 84, y: 30 },
      { id: 't4', name: 'VIP 4', zone: 'Main floor', capacity: 8, minSpend: 12000, x: 84, y: 58 },
      { id: 't5', name: 'Booth A', zone: 'Mezzanine', capacity: 10, minSpend: 18000, x: 30, y: 86 },
      { id: 't6', name: 'Booth B', zone: 'Mezzanine', capacity: 10, minSpend: 18000, x: 70, y: 86 },
      { id: 't7', name: 'Skybox', zone: 'Above the DJ', capacity: 16, minSpend: 40000, x: 50, y: 12 },
    ],
    packages: [
      { id: 'p1', name: 'Silver', price: 8000, pax: 6, inclusions: '1 bottle of premium vodka or whisky, mixers, ice and a fruit platter' },
      { id: 'p2', name: 'Gold', price: 15000, pax: 8, inclusions: '2 premium bottles, mixers, sparkler service and priority entry' },
      { id: 'p3', name: 'Black', price: 30000, pax: 12, inclusions: '3 premium bottles, 1 champagne, sparkler parade, private host and skip-the-line' },
    ],
    reservations: [
      { id: 'r1', date: d(0), tableId: 't3', tableName: 'VIP 3', packageId: 'p2', packageName: 'Gold', price: 15000, name: 'Paolo Reyes', mobile: '0918 555 0102', guests: 7, reference: '4021889012', notes: 'Birthday, cake at 12', promo: 'KIDLAT', status: 'confirmed', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'r2', date: d(0), tableId: 't5', tableName: 'Booth A', packageId: 'p1', packageName: 'Silver', price: 8000, name: 'Kim Santos', mobile: '0919 555 0103', guests: 6, reference: '', notes: '', promo: '', status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'r3', date: d(2), tableId: 't7', tableName: 'Skybox', packageId: 'p3', packageName: 'Black', price: 40000, name: 'Mark Gomez', mobile: '0922 555 0106', guests: 14, reference: 'BPI-77120', notes: 'Company party', promo: 'MARA', status: 'confirmed', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ],
    promoters: [{ id: 'm1', name: 'Kidlat Crew', code: 'KIDLAT' }, { id: 'm2', name: 'Mara Vee', code: 'MARA' }, { id: 'm3', name: 'Campus Reps', code: 'CAMPUS' }],
    guests: [
      ...[['Ana Villanueva', 2, 'KIDLAT', 'in'], ['Bea Lim', 1, 'KIDLAT', 'in'], ['Joy Cruz', 0, 'MARA', 'listed'], ['Carlo Mendoza', 3, 'CAMPUS', 'listed'], ['Liza Tan', 1, '', 'in'], ['Rico Dela Paz', 0, 'MARA', 'listed']]
        .map(([name, plus, promo, status], i) => ({ id: `g${i}`, eventId: 'e1', eventDate: d(0), name, mobile: `0917 555 01${10 + i}`, plus, promo, code: ['K7Q2MX', 'HB4N8P', 'T3WZ6R', 'M9CJ2E', 'V5LQ7A', 'P8XE3N'][i], token: `g${i}`, status, checkedInAt: status === 'in' ? new Date().toISOString() : '', createdAt: new Date().toISOString() })),
    ],
  };
}
export function demoLoad() {
  const x = window.RZ.load(DEMO_KEY, null);
  if (x && x.club && x.events?.[0] && x.events[0].date >= manilaToday(-1)) return x;
  const fresh = demoSeed(); window.RZ.save(DEMO_KEY, fresh); return fresh; // reseed when the sample nights are in the past
}
export const demoSave = x => window.RZ.save(DEMO_KEY, x);

/* Draw a QR code on a canvas from the vendored generator (no HTML strings). */
export function drawQR(canvas, value, { dark = '#0b0912', light = '#ffffff', size = 260 } = {}) {
  const qr = window.qrcode(0, 'M'); qr.addData(value); qr.make();
  const n = qr.getModuleCount(); const quiet = 3; const cell = Math.floor(size / (n + quiet * 2)); const px = cell * (n + quiet * 2);
  canvas.width = px; canvas.height = px;
  const g = canvas.getContext('2d'); g.fillStyle = light; g.fillRect(0, 0, px, px); g.fillStyle = dark;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
}
