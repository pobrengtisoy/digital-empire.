/*
 * RZ Bahay — listing website and inquiry inbox for real estate agents and brokers.
 * Listings and inquiries live in D1. Photos live in Cloudflare R2 (binding PHOTOS),
 * stored under the agent's business id, uploaded only by that agent, and served publicly
 * by key. Only real JPEG/PNG/WebP files under 1.5 MB are accepted.
 */

export const BAHAY_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS bahay_profile (business_id TEXT PRIMARY KEY, agent_name TEXT DEFAULT '', license TEXT DEFAULT '', mobile TEXT DEFAULT '', messenger TEXT DEFAULT '', areas TEXT DEFAULT '', tagline TEXT DEFAULT '', about TEXT DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS bahay_listings (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, title TEXT NOT NULL, deal TEXT NOT NULL, type TEXT NOT NULL, price REAL NOT NULL, price_note TEXT DEFAULT '', city TEXT DEFAULT '', address TEXT DEFAULT '', beds INTEGER DEFAULT 0, baths INTEGER DEFAULT 0, lot_area REAL DEFAULT 0, floor_area REAL DEFAULT 0, parking INTEGER DEFAULT 0, features TEXT DEFAULT '[]', description TEXT DEFAULT '', status TEXT NOT NULL, photos TEXT DEFAULT '[]', featured INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_bahay_listings_biz ON bahay_listings (business_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS bahay_inquiries (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, listing_id TEXT DEFAULT '', listing_title TEXT DEFAULT '', name TEXT NOT NULL, mobile TEXT NOT NULL, email TEXT DEFAULT '', message TEXT DEFAULT '', visit_date TEXT DEFAULT '', status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_bahay_inq_biz ON bahay_inquiries (business_id, created_at)`,
];

export const DEALS = ['sale', 'rent'];
export const TYPES = ['House and lot', 'Condo', 'Townhouse', 'Lot', 'Commercial', 'Apartment'];
export const LISTING_STATUSES = ['available', 'reserved', 'sold', 'hidden'];
export const INQUIRY_STATUSES = ['new', 'contacted', 'viewing', 'closed'];
const LIMITS = { listings: 150, photosPerListing: 12, photoBytes: 1_500_000, photosPerDay: 300, inquiriesPerListingDay: 30 };
const KEY_RE = /^[a-f0-9]{24}\/[a-f0-9]{32}\.(webp|jpg|png)$/;

/* Real image check by the first bytes, never by what the browser says. */
function sniff(bytes) {
  const b = new Uint8Array(bytes.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', type: 'image/png' };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ext: 'webp', type: 'image/webp' };
  return null;
}
const TYPE_OF = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };

const listingOut = r => ({
  id: r.id, title: r.title, deal: r.deal, type: r.type, price: r.price, priceNote: r.price_note, city: r.city, address: r.address,
  beds: r.beds, baths: r.baths, lotArea: r.lot_area, floorArea: r.floor_area, parking: r.parking,
  features: JSON.parse(r.features || '[]'), description: r.description, status: r.status, photos: JSON.parse(r.photos || '[]'),
  featured: !!r.featured, createdAt: r.created_at, updatedAt: r.updated_at,
});
const inquiryOut = r => ({ id: r.id, listingId: r.listing_id, listingTitle: r.listing_title, name: r.name, mobile: r.mobile, email: r.email, message: r.message, visitDate: r.visit_date, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });
const profileOut = (p, biz) => ({ name: biz.name, slug: biz.slug, agentName: p?.agent_name || '', license: p?.license || '', mobile: p?.mobile || '', messenger: p?.messenger || '', areas: p?.areas || '', tagline: p?.tagline || '', about: p?.about || '' });

export function bahayRoutes(h) {
  const { json, HttpError, text, multiline, money, randomHex, now, readJSON, rateLimit } = h;

  const photos = env => { if (!env.PHOTOS) throw new HttpError(503, 'Photo storage is not connected yet.'); return env.PHOTOS; };
  const removePhotos = async (env, keys) => { if (keys.length && env.PHOTOS) await env.PHOTOS.delete(keys); };

  async function ownerState(env, biz) {
    const [p, l, i] = await Promise.all([
      env.DB.prepare('SELECT * FROM bahay_profile WHERE business_id = ?').bind(biz.id).first(),
      env.DB.prepare('SELECT * FROM bahay_listings WHERE business_id = ? ORDER BY featured DESC, created_at DESC').bind(biz.id).all(),
      env.DB.prepare('SELECT * FROM bahay_inquiries WHERE business_id = ? ORDER BY created_at DESC LIMIT 300').bind(biz.id).all(),
    ]);
    return json({ profile: profileOut(p, biz), listings: l.results.map(listingOut), inquiries: i.results.map(inquiryOut), photosReady: !!env.PHOTOS });
  }

  function cleanListing(b, old = {}) {
    const pick = (k, fn) => (b[k] === undefined ? old[k] : fn(b[k]));
    const int = (v, max) => { const n = Math.floor(Number(v) || 0); if (n < 0 || n > max) throw new HttpError(400, 'Check the numbers.'); return n; };
    const area = v => { const n = money(v || 0); if (!Number.isFinite(n) || n > 10_000_000) throw new HttpError(400, 'Check the area.'); return n; };
    const out = {
      title: pick('title', v => text(v, 90)), deal: pick('deal', v => (DEALS.includes(v) ? v : 'sale')), type: pick('type', v => (TYPES.includes(v) ? v : 'House and lot')),
      price: pick('price', v => { const n = money(v); if (!Number.isFinite(n) || n < 1 || n > 10_000_000_000) throw new HttpError(400, 'Enter the price.'); return n; }),
      priceNote: pick('priceNote', v => text(v, 60)), city: pick('city', v => text(v, 60)), address: pick('address', v => text(v, 140)),
      beds: pick('beds', v => int(v, 50)), baths: pick('baths', v => int(v, 50)), parking: pick('parking', v => int(v, 50)),
      lotArea: pick('lotArea', area), floorArea: pick('floorArea', area),
      features: pick('features', v => (Array.isArray(v) ? v.slice(0, 20).map(x => text(x, 40)).filter(Boolean) : [])),
      description: pick('description', v => multiline(v, 3000)),
      status: pick('status', v => (LISTING_STATUSES.includes(v) ? v : 'available')), featured: pick('featured', v => !!v),
    };
    if (!out.title) throw new HttpError(400, 'Give the listing a title, like “3BR house and lot in Bacolod”.');
    return out;
  }

  function checkPhotos(list, bizId) {
    if (!Array.isArray(list) || list.length > LIMITS.photosPerListing) throw new HttpError(400, `Add up to ${LIMITS.photosPerListing} photos per listing.`);
    const keys = [...new Set(list.map(String))];
    if (!keys.every(k => KEY_RE.test(k) && k.startsWith(`${bizId}/`))) throw new HttpError(400, 'One of the photos is not yours.');
    return keys;
  }

  async function owner(env, request, user, pathname, method) {
    let m;
    const biz = user;
    if (pathname === '/api/bahay' && method === 'GET') return ownerState(env, biz);

    if (pathname === '/api/bahay/profile' && method === 'PUT') {
      const b = await readJSON(request);
      const mobile = text(b.mobile, 20);
      if (mobile && !/^[0-9+()\s-]{7,20}$/.test(mobile)) throw new HttpError(400, 'Check the mobile number.');
      await env.DB.prepare('INSERT INTO bahay_profile (business_id, agent_name, license, mobile, messenger, areas, tagline, about) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(business_id) DO UPDATE SET agent_name = excluded.agent_name, license = excluded.license, mobile = excluded.mobile, messenger = excluded.messenger, areas = excluded.areas, tagline = excluded.tagline, about = excluded.about')
        .bind(biz.id, text(b.agentName, 60), text(b.license, 40), mobile, String(b.messenger || '').replace(/^https?:\/\/(www\.)?(m\.me|facebook\.com)\//i, '').replace(/[^a-zA-Z0-9.]/g, '').slice(0, 50), text(b.areas, 120), text(b.tagline, 120), multiline(b.about, 800)).run();
      if (text(b.name, 60)) await env.DB.prepare('UPDATE businesses SET name = ? WHERE id = ?').bind(text(b.name, 60), biz.id).run();
      const fresh = await env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(biz.id).first();
      return ownerState(env, fresh);
    }

    if (pathname === '/api/bahay/photos' && method === 'POST') {
      const bucket = photos(env);
      await rateLimit(env, `bahayphoto:${biz.id}`, LIMITS.photosPerDay, 86400);
      const len = Number(request.headers.get('content-length') || 0);
      if (len > LIMITS.photoBytes) throw new HttpError(413, 'That photo is too large. Keep it under 1.5 MB.');
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > LIMITS.photoBytes) throw new HttpError(413, 'That photo is too large. Keep it under 1.5 MB.');
      const kind = sniff(bytes);
      if (!kind) throw new HttpError(415, 'Only JPEG, PNG or WebP photos.');
      const key = `${biz.id}/${randomHex(16)}.${kind.ext}`;
      await bucket.put(key, bytes, { httpMetadata: { contentType: kind.type, cacheControl: 'public, max-age=31536000, immutable' } });
      return json({ key }, 201);
    }

    if (pathname === '/api/bahay/listings' && method === 'POST') {
      const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM bahay_listings WHERE business_id = ?').bind(biz.id).first())?.n || 0;
      if (n >= LIMITS.listings) throw new HttpError(409, `You can have up to ${LIMITS.listings} listings.`);
      const b = await readJSON(request, 64_000);
      const l = cleanListing(b);
      const keys = checkPhotos(b.photos || [], biz.id);
      await env.DB.prepare('INSERT INTO bahay_listings (id, business_id, title, deal, type, price, price_note, city, address, beds, baths, lot_area, floor_area, parking, features, description, status, photos, featured, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(randomHex(16), biz.id, l.title, l.deal, l.type, l.price, l.priceNote, l.city, l.address, l.beds, l.baths, l.lotArea, l.floorArea, l.parking, JSON.stringify(l.features), l.description, l.status, JSON.stringify(keys), l.featured ? 1 : 0, now(), now()).run();
      return ownerState(env, biz);
    }
    if ((m = pathname.match(/^\/api\/bahay\/listings\/([a-f0-9]{32})$/))) {
      const row = await env.DB.prepare('SELECT * FROM bahay_listings WHERE id = ? AND business_id = ?').bind(m[1], biz.id).first();
      if (!row) throw new HttpError(404, 'Listing not found.');
      const old = listingOut(row);
      if (method === 'PATCH') {
        const b = await readJSON(request, 64_000);
        const l = cleanListing(b, old);
        const keys = b.photos === undefined ? old.photos : checkPhotos(b.photos, biz.id);
        await env.DB.prepare('UPDATE bahay_listings SET title = ?, deal = ?, type = ?, price = ?, price_note = ?, city = ?, address = ?, beds = ?, baths = ?, lot_area = ?, floor_area = ?, parking = ?, features = ?, description = ?, status = ?, photos = ?, featured = ?, updated_at = ? WHERE id = ?')
          .bind(l.title, l.deal, l.type, l.price, l.priceNote, l.city, l.address, l.beds, l.baths, l.lotArea, l.floorArea, l.parking, JSON.stringify(l.features), l.description, l.status, JSON.stringify(keys), l.featured ? 1 : 0, now(), row.id).run();
        await removePhotos(env, old.photos.filter(k => !keys.includes(k)));
        return ownerState(env, biz);
      }
      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM bahay_listings WHERE id = ?').bind(row.id).run();
        await removePhotos(env, old.photos);
        return ownerState(env, biz);
      }
    }

    if ((m = pathname.match(/^\/api\/bahay\/inquiries\/([a-f0-9]{32})$/))) {
      const row = await env.DB.prepare('SELECT id FROM bahay_inquiries WHERE id = ? AND business_id = ?').bind(m[1], biz.id).first();
      if (!row) throw new HttpError(404, 'Inquiry not found.');
      if (method === 'PATCH') {
        const b = await readJSON(request);
        if (!INQUIRY_STATUSES.includes(b.status)) throw new HttpError(400, 'Unknown status.');
        await env.DB.prepare('UPDATE bahay_inquiries SET status = ?, updated_at = ? WHERE id = ?').bind(b.status, now(), row.id).run();
        return ownerState(env, biz);
      }
      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM bahay_inquiries WHERE id = ?').bind(row.id).run();
        return ownerState(env, biz);
      }
    }
    return null;
  }

  /* Public: the agent's site, inquiries, and photos. */
  async function publicRoute(env, request, pathname, method) {
    let m;
    if ((m = pathname.match(/^\/api\/public\/bahay\/photo\/([a-f0-9]{24}\/[a-f0-9]{32}\.(?:webp|jpg|png))$/)) && (method === 'GET' || method === 'HEAD')) {
      const obj = await photos(env).get(m[1]);
      if (!obj) return new Response('Not found', { status: 404 });
      return new Response(method === 'HEAD' ? null : obj.body, { headers: { 'content-type': TYPE_OF[m[1].split('.').pop()], 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" } });
    }
    if ((m = pathname.match(/^\/api\/public\/bahay\/([a-z0-9-]{3,40})$/)) && method === 'GET') {
      const biz = await env.DB.prepare('SELECT * FROM businesses WHERE slug = ?').bind(m[1]).first();
      if (!biz) throw new HttpError(404, 'This agent’s page does not exist.');
      const [p, l] = await Promise.all([
        env.DB.prepare('SELECT * FROM bahay_profile WHERE business_id = ?').bind(biz.id).first(),
        env.DB.prepare("SELECT * FROM bahay_listings WHERE business_id = ? AND status != 'hidden' ORDER BY featured DESC, created_at DESC").bind(biz.id).all(),
      ]);
      return json({ profile: profileOut(p, biz), listings: l.results.map(listingOut) });
    }
    if ((m = pathname.match(/^\/api\/public\/bahay\/([a-z0-9-]{3,40})\/inquiries$/)) && method === 'POST') {
      const ip = request.headers.get('cf-connecting-ip') || 'local';
      await rateLimit(env, `bahayinq:${ip}`, 6, 600);
      const biz = await env.DB.prepare('SELECT id FROM businesses WHERE slug = ?').bind(m[1]).first();
      if (!biz) throw new HttpError(404, 'This agent’s page does not exist.');
      await rateLimit(env, `bahayinqbiz:${biz.id}`, 200, 86400);
      const b = await readJSON(request);
      const name = text(b.name, 60); const mobile = text(b.mobile, 20); const email = text(b.email, 120).toLowerCase();
      if (!name) throw new HttpError(400, 'Enter your name.');
      if (!/^[0-9+()\s-]{7,20}$/.test(mobile)) throw new HttpError(400, 'Enter a valid mobile number.');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Check your email address.');
      const visit = /^20\d\d-\d\d-\d\d$/.test(String(b.visitDate || '')) ? b.visitDate : '';
      let listing = null;
      if (b.listingId) {
        listing = await env.DB.prepare("SELECT id, title FROM bahay_listings WHERE id = ? AND business_id = ? AND status != 'hidden'").bind(String(b.listingId), biz.id).first();
        if (!listing) throw new HttpError(404, 'That listing is no longer available.');
        await rateLimit(env, `bahayinql:${listing.id}`, LIMITS.inquiriesPerListingDay, 86400);
      }
      await env.DB.prepare('INSERT INTO bahay_inquiries (id, business_id, listing_id, listing_title, name, mobile, email, message, visit_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(randomHex(16), biz.id, listing?.id || '', listing?.title || '', name, mobile, email, multiline(b.message, 1000), visit, 'new', now(), now()).run();
      return json({ ok: true }, 201);
    }
    return null;
  }

  /* Remove every photo an agent stored (used when the account is deleted). */
  async function purgePhotos(env, bizId) {
    if (!env.PHOTOS) return;
    let cursor;
    do {
      const list = await env.PHOTOS.list({ prefix: `${bizId}/`, cursor, limit: 1000 });
      if (list.objects.length) await env.PHOTOS.delete(list.objects.map(o => o.key));
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor);
  }

  return { owner, publicRoute, purgePhotos };
}
