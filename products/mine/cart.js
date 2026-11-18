/* RZ Mine buyer page: ?c=<token> loads a real cart; ?demo=<live>.<cart> shows a demo cart from this browser. */
(() => {
  'use strict';
  const { $, el, peso } = window.RZ;
  const M = window.RZMine;
  const q = new URLSearchParams(location.search);
  const token = q.get('c');
  const demoRef = q.get('demo');
  const php = n => peso(n, true);
  const KEY = 'rz-mine-demo-v1';

  let view = null;

  function line(l, wait) {
    return el('li', { class: 'bag-item' },
      el('span', { class: 'tag-code' }, l.code),
      el('span', { class: 'bi-name' }, l.qty > 1 ? `${l.qty} × ${l.name}` : l.name),
      el('span', { class: 'bi-amt' }, wait ? `Backup #${l.position}` : php(l.amount)));
  }

  const STATE = {
    submitted: 'Sent. The seller will check your payment and confirm.',
    paid: 'Payment confirmed. Your items are being packed.',
    shipped: 'Shipped! Message the seller if you have questions.',
    cancelled: 'This order was cancelled. Message the seller if this is a mistake.',
  };

  function render() {
    document.title = `Your mine list — ${view.shop}`;
    $('#bShop').textContent = view.shop; $('#bShop2').textContent = view.shop;
    $('#bSub').textContent = `${view.buyer}${view.live ? ` · ${view.live}` : ''}`;
    $('#bItems').replaceChildren(...(view.items.length ? view.items.map(l => line(l)) : [el('li', { class: 'bag-none' }, 'No confirmed items yet.')]));
    $('#bWaitBox').hidden = !view.waiting.length;
    $('#bWait').replaceChildren(...view.waiting.map(l => line(l, true)));
    $('#bSubtotal').textContent = php(view.subtotal);
    $('#bShip').textContent = view.shipFee ? php(view.shipFee) : 'Free';
    $('#bTotal').textContent = php(view.total);
    $('#bAmt').textContent = php(view.total);
    $('#bGcash').textContent = view.gcash || 'the number the seller gave you';
    $('#copyNum').hidden = !view.gcash;
    const s = STATE[view.status];
    $('#bState').hidden = !s; $('#bState').textContent = s || '';
    $('#bState').className = `state s-${view.status}`;
    const canPay = ['open', 'submitted'].includes(view.status) && view.items.length > 0;
    $('#bPay').hidden = !canPay;
    const f = $('#payForm').elements;
    if (view.status === 'submitted') { f.contact.value = view.contact; f.address.value = view.address; f.reference.value = view.reference; f.notes.value = view.notes; $('#sendPay').textContent = 'Update my details'; }
    $('#bag').hidden = false;
  }

  function missing(msg) { $('#missing').hidden = false; if (msg) $('#missingText').textContent = msg; }

  /* Demo cart, read from the demo kept in this browser. */
  function demoLoad() {
    const data = window.RZ.load(KEY, null);
    const [liveId, cartId] = String(demoRef).split('.');
    const live = data?.lives?.find(l => l.id === liveId);
    return { data, live, cartId, view: live ? M.buyerView(live, data.biz, cartId) : null };
  }

  async function load() {
    if (demoRef) {
      $('#strip').hidden = false;
      const d = demoLoad();
      if (!d.view) return missing('This demo cart is not on this device. Open it from the RZ Mine demo.');
      view = d.view; return render();
    }
    if (!token || !/^[a-f0-9]{48}$/.test(token)) return missing();
    try {
      const res = await fetch(`/api/public/mine/${token}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return missing(data.error);
      view = data; render();
    } catch { missing('Could not load your list. Check your connection and try again.'); }
  }

  $('#copyNum').addEventListener('click', async () => {
    const ok = await window.RZ.copy(String(view.gcash).replace(/\s+/g, ''));
    $('#copyNum').textContent = ok ? 'Copied' : view.gcash;
    setTimeout(() => { $('#copyNum').textContent = 'Copy number'; }, 1800);
  });

  $('#payForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.elements; const err = $('#payErr'); const btn = $('#sendPay');
    err.textContent = '';
    const body = { contact: f.contact.value.trim(), address: f.address.value.trim(), reference: f.reference.value.replace(/\s+/g, '').toUpperCase(), notes: f.notes.value.trim() };
    if (!/^[0-9+()\s-]{7,20}$/.test(body.contact)) { err.textContent = 'Enter a valid mobile number.'; f.contact.focus(); return; }
    if (!body.address) { err.textContent = 'Enter your delivery address, or write “Meet-up”.'; f.address.focus(); return; }
    if (!/^[A-Z0-9-]{4,40}$/.test(body.reference)) { err.textContent = 'Enter the reference number from your payment receipt.'; f.reference.focus(); return; }
    btn.disabled = true;
    try {
      if (demoRef) {
        const d = demoLoad(); const cart = d.live.carts.find(c => c.id === d.cartId);
        Object.assign(cart, body, { status: 'submitted', updatedAt: new Date().toISOString() });
        window.RZ.save(KEY, d.data); view = M.buyerView(d.live, d.data.biz, d.cartId);
      } else {
        const res = await fetch(`/api/public/mine/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not send. Please try again.');
        view = data;
      }
      render(); $('#bState').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; }
  });

  load();
})();
