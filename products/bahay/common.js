/* RZ Bahay shared helpers: demo data, photo addresses, prices and the loan calculator. */

export const DEMO_KEY = 'rz-bahay-demo-v1';
export const TYPES = ['House and lot', 'Condo', 'Townhouse', 'Lot', 'Commercial', 'Apartment'];
export const STATUS_LABEL = { available: 'Available', reserved: 'Reserved', sold: 'Sold', hidden: 'Hidden' };

/* Photo reference → address. Real photos are R2 keys; demo photos are "demo:name" or small data: images. */
export function photoUrl(ref, base = '') {
  if (!ref) return '';
  if (ref.startsWith('demo:')) return `${base}../../assets/bahay/${ref.slice(5)}.webp`;
  if (ref.startsWith('data:image/')) return ref;
  return `/api/public/bahay/photo/${ref}`;
}

const full = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
export const pesoFull = n => full.format(Number(n) || 0);
/* ₱6.8M, ₱850K, ₱18,000 — how agents write prices. */
export function pesoShort(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}M`;
  if (v >= 100_000) return `₱${Math.round(v / 1000)}K`;
  return full.format(v);
}
export const priceLabel = l => `${pesoShort(l.price)}${l.deal === 'rent' ? '/mo' : ''}`;

/* Monthly amortization: loan × r / (1 − (1 + r)^−n). */
export function amortization(price, downPct, ratePct, years) {
  const loan = Math.max(0, (Number(price) || 0) * (1 - (Number(downPct) || 0) / 100));
  const n = Math.max(1, Math.round((Number(years) || 1) * 12));
  const r = (Number(ratePct) || 0) / 100 / 12;
  const monthly = r ? loan * r / (1 - (1 + r) ** -n) : loan / n;
  return { loan: Math.round(loan), monthly: Math.round(monthly), down: Math.round((Number(price) || 0) - loan), total: Math.round(monthly * n) };
}

export function specs(l) {
  const out = [];
  if (l.beds) out.push(`${l.beds} bed${l.beds > 1 ? 's' : ''}`);
  if (l.baths) out.push(`${l.baths} bath${l.baths > 1 ? 's' : ''}`);
  if (l.floorArea) out.push(`${l.floorArea} m² floor`);
  if (l.lotArea) out.push(`${l.lotArea} m² lot`);
  if (l.parking) out.push(`${l.parking} parking`);
  return out;
}

export function mapsLink(l) {
  const q = [l.address, l.city, 'Philippines'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/* ---------- demo agent ---------- */
const D = (id, x) => ({ id, priceNote: '', address: '', beds: 0, baths: 0, lotArea: 0, floorArea: 0, parking: 0, features: [], status: 'available', featured: false, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', ...x });
export function demoSeed() {
  return {
    profile: { name: 'Reyes Homes & Lots', slug: 'demo', agentName: 'Isabel Reyes', license: 'PRC REB No. 0012345', mobile: '0917 555 0188', messenger: '', areas: 'Bacolod · Talisay · Silay · Bago City', tagline: 'Houses, lots and condos in Negros Occidental, shown honestly.', about: 'Licensed real estate broker helping families find their first home since 2015. Viewings every day, including Sundays. I help with Pag-IBIG and bank loan papers.' },
    listings: [
      D('l1', { title: '4BR modern house and lot in a gated subdivision', deal: 'sale', type: 'House and lot', price: 8_950_000, priceNote: 'Bank or Pag-IBIG financing', city: 'Bacolod City', address: 'Mandalagan', beds: 4, baths: 3, lotArea: 180, floorArea: 220, parking: 2, features: ['Gated community', 'Carport for 2', 'Maid’s room', 'Garden', 'Near schools'], description: 'Brand-new two-storey home with a bright kitchen that opens to the garden. Master bedroom with its own bath and balcony. Clean title, ready for occupancy.', photos: ['demo:house', 'demo:kitchen'], featured: true }),
      D('l2', { title: '1BR condo with city view, fully furnished', deal: 'rent', type: 'Condo', price: 22_000, priceNote: '1 month advance, 2 months deposit', city: 'Bacolod City', address: 'Lacson Street', beds: 1, baths: 1, floorArea: 34, parking: 0, features: ['Fully furnished', 'Balcony', 'Pool and gym', '24/7 security'], description: 'High floor, quiet unit with a balcony facing the city. Walk to malls and coffee shops. Minimum 6-month lease.', photos: ['demo:condo'] }),
      D('l3', { title: '3-storey townhouse, 3BR, near the highway', deal: 'sale', type: 'Townhouse', price: 4_380_000, priceNote: 'Pag-IBIG accredited', city: 'Talisay City', address: 'Zone 12', beds: 3, baths: 2, lotArea: 60, floorArea: 120, parking: 1, features: ['Gated', 'Own parking', 'Balcony'], description: 'End unit with extra windows and a roof deck. 10 minutes to Bacolod.', photos: ['demo:townhouse'], status: 'reserved' }),
      D('l4', { title: '1,200 m² residential lot with mango trees', deal: 'sale', type: 'Lot', price: 2_400_000, priceNote: '₱2,000 per m², negotiable', city: 'Bago City', address: 'Brgy. Taloc', lotArea: 1200, features: ['Clean title', 'Road access', 'Fenced', 'Mountain view'], description: 'Flat, fenced lot along a paved barangay road. Electricity and water lines nearby. Good for a farmhouse or rest house.', photos: ['demo:lot'] }),
      D('l5', { title: 'Cozy 2BR bungalow with garden', deal: 'sale', type: 'House and lot', price: 3_250_000, city: 'Silay City', address: 'Brgy. Rizal', beds: 2, baths: 1, lotArea: 250, floorArea: 85, parking: 1, features: ['Big garden', 'Front porch', 'Quiet street'], description: 'Well-kept single-storey home on a wide lot, room to extend. A short tricycle ride to the plaza.', photos: ['demo:bungalow'], status: 'sold' }),
    ],
    inquiries: [
      { id: 'q1', listingId: 'l1', listingTitle: '4BR modern house and lot in a gated subdivision', name: 'Carlo Mendoza', mobile: '0918 555 0123', email: '', message: 'Is this still available? We have a Pag-IBIG pre-approval. Can we view this Saturday?', visitDate: '2026-11-22', status: 'new', createdAt: '2026-11-17T09:12:00Z', updatedAt: '2026-11-17T09:12:00Z' },
      { id: 'q2', listingId: 'l2', listingTitle: '1BR condo with city view, fully furnished', name: 'Mae Tan', mobile: '0927 555 0456', email: 'mae@example.com', message: 'Can I move in December 1? Is parking available for rent?', visitDate: '', status: 'contacted', createdAt: '2026-11-15T14:30:00Z', updatedAt: '2026-11-16T08:00:00Z' },
    ],
  };
}
export function demoLoad() {
  const d = window.RZ.load(DEMO_KEY, null);
  if (d && Array.isArray(d.listings)) return d;
  const fresh = demoSeed(); window.RZ.save(DEMO_KEY, fresh); return fresh;
}
export const demoSave = d => window.RZ.save(DEMO_KEY, d);
