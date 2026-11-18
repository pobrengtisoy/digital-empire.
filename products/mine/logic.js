/* RZ Mine logic shared by the console and the buyer page. Mirrors worker/mine.js. */
(() => {
  'use strict';
  const round = n => Math.round(n * 100) / 100;
  const M = {};

  M.code = v => String(v ?? '').toUpperCase().replace(/\s+/g, '').slice(0, 12);
  M.key = s => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

  /* First claims that fit in the stock win; the rest wait in line as backups. */
  M.allocate = (items, claims) => {
    const left = new Map(items.map(i => [i.id, i.stock]));
    const queue = new Map();
    return claims.map(c => {
      const room = left.get(c.itemId) ?? 0;
      if (c.qty <= room) { left.set(c.itemId, room - c.qty); return { ...c, won: true, position: 0 }; }
      const pos = (queue.get(c.itemId) || 0) + 1; queue.set(c.itemId, pos);
      return { ...c, won: false, position: pos };
    });
  };

  /* Same shape as the API's live state, computed from a demo live kept in the browser. */
  M.state = (live, biz) => {
    const items = live.items; const carts = live.carts;
    const itemMap = new Map(items.map(i => [i.id, i]));
    const cartMap = new Map(carts.map(c => [c.id, c]));
    const allocated = M.allocate(items, live.claims);
    const wonQty = new Map(); const backups = new Map(); const lines = new Map();
    allocated.forEach(c => {
      if (c.won) {
        wonQty.set(c.itemId, (wonQty.get(c.itemId) || 0) + c.qty);
        const it = itemMap.get(c.itemId); const l = lines.get(c.cartId) || { count: 0, subtotal: 0 };
        l.count += c.qty; l.subtotal = round(l.subtotal + it.price * c.qty); lines.set(c.cartId, l);
      } else backups.set(c.itemId, (backups.get(c.itemId) || 0) + 1);
    });
    const cartsOut = carts.map(c => {
      const l = lines.get(c.id) || { count: 0, subtotal: 0 };
      const shipFee = l.count ? (c.shipFee ?? biz.deliveryFee ?? 0) : 0;
      return { id: c.id, buyer: c.buyer, token: `${live.id}.${c.id}`, status: c.status, items: l.count, subtotal: l.subtotal, shipFee, customShip: c.shipFee != null, total: round(l.subtotal + shipFee), contact: c.contact || '', address: c.address || '', reference: c.reference || '', notes: c.notes || '', updatedAt: c.updatedAt };
    });
    const active = cartsOut.filter(c => c.status !== 'cancelled');
    return {
      live: { id: live.id, title: live.title, status: live.status, createdAt: live.createdAt },
      items: items.map(i => ({ id: i.id, code: i.code, name: i.name, price: i.price, stock: i.stock, claimed: wonQty.get(i.id) || 0, backups: backups.get(i.id) || 0 })),
      claims: allocated.slice().reverse().map(c => {
        const it = itemMap.get(c.itemId); const cart = cartMap.get(c.cartId);
        return { id: c.id, itemId: c.itemId, code: it?.code, itemName: it?.name, price: it?.price, qty: c.qty, cartId: c.cartId, buyer: cart?.buyer, won: c.won, position: c.position, at: c.at };
      }),
      carts: cartsOut,
      totals: {
        claims: allocated.length, buyers: active.filter(c => c.items).length,
        sales: round(active.reduce((s, c) => s + c.total, 0)),
        paid: round(active.filter(c => c.status === 'paid' || c.status === 'shipped').reduce((s, c) => s + c.total, 0)),
      },
    };
  };

  /* Buyer view of one cart, for the demo checkout page. */
  M.buyerView = (live, biz, cartId) => {
    const cart = live.carts.find(c => c.id === cartId);
    if (!cart) return null;
    const itemMap = new Map(live.items.map(i => [i.id, i]));
    const mine = M.allocate(live.items, live.claims).filter(c => c.cartId === cartId);
    const line = c => { const it = itemMap.get(c.itemId); return { code: it.code, name: it.name, price: it.price, qty: c.qty, amount: round(it.price * c.qty), position: c.position }; };
    const items = mine.filter(c => c.won).map(line);
    const subtotal = round(items.reduce((s, l) => s + l.amount, 0));
    const shipFee = items.length ? (cart.shipFee ?? biz.deliveryFee ?? 0) : 0;
    return { shop: biz.name, gcash: biz.gcash, live: live.title, buyer: cart.buyer, status: cart.status, items, waiting: mine.filter(c => !c.won).map(line), subtotal, shipFee, total: round(subtotal + shipFee), contact: cart.contact || '', address: cart.address || '', reference: cart.reference || '', notes: cart.notes || '' };
  };

  /*
   * Read pasted live comments. Understands:
   *   "Maria Santos: mine A3"   "Maria Santos - mine a3 x2"   "mine A3 Maria Santos"
   *   a name on one line and "mine A3" on the next (how Facebook comments copy).
   */
  const MINE = /\bmine\b\s*[:#-]?\s*([a-z]{0,3}-?\d{1,4}[a-z]?)\b/i;
  const QTY = /\bx\s*(\d{1,2})\b|×\s*(\d{1,2})\b|\b(\d{1,2})\s*(?:pcs?|pieces?)\b/i;
  const NOISE = /^(?:\d{1,2}[smhdw]|like|reply|follow|see more|top fan|author|edited|\d+\s*(?:min|hr|h|m)s?|·)+$/i;
  M.parseComments = textBlock => {
    const rows = []; let lastName = '';
    String(textBlock || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(line => {
      if (NOISE.test(line.replace(/[·\s]+/g, ' ').trim())) return;
      const m = line.match(MINE);
      if (!m) { if (line.length <= 60 && !/\d{3,}/.test(line)) lastName = line.replace(/[:\-–]+$/, '').trim(); return; }
      const q = line.match(QTY); const qty = q ? Number(q[1] || q[2] || q[3]) : 1;
      let name = line.slice(0, m.index).replace(/[:\-–,]+\s*$/, '').trim();
      if (!name) name = line.slice(m.index + m[0].length).replace(QTY, '').replace(/^[\s:\-–,]+/, '').trim();
      if (!name || /^\d+$/.test(name)) name = lastName;
      rows.push({ buyer: name.slice(0, 60), code: M.code(m[1]), qty: qty >= 1 && qty <= 99 ? qty : 1, ok: !!name });
    });
    return rows;
  };

  M.slug = name => {
    const base = String(name || 'shop').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'shop';
    return `${base.length < 3 ? `${base}-shop` : base}-${Math.random().toString(36).slice(2, 6)}`;
  };

  window.RZMine = M;
})();
