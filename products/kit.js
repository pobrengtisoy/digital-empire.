/* RZ product kit: tiny shared helpers for the browser-only product demos. */
(() => {
  'use strict';
  const RZ = {};

  RZ.load = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : structuredClone(fallback);
    } catch { return structuredClone(fallback); }
  };
  RZ.save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  };

  const pesoFmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 });
  const pesoShort = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
  RZ.peso = (n, short) => (short ? pesoShort : pesoFmt).format(Number(n) || 0);

  /* el('div', {class: 'x', onclick: fn}, 'text', childNode) — text is always inserted as text. */
  RZ.el = (tag, attrs, ...kids) => {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, String(v));
    });
    kids.flat().forEach(kid => { if (kid != null && kid !== false) node.append(kid instanceof Node ? kid : String(kid)); });
    return node;
  };
  RZ.$ = (sel, root = document) => root.querySelector(sel);
  RZ.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  RZ.clean = (value, max = 80) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  RZ.id = () => Math.random().toString(36).slice(2, 10);

  RZ.copy = async text => {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      const area = document.createElement('textarea');
      area.value = text; area.setAttribute('readonly', '');
      area.className = 'rz-offscreen';
      document.body.append(area); area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      area.remove();
      return ok;
    }
  };

  /* Messenger usernames: letters, numbers and dots only. */
  RZ.messengerUser = value => String(value || '').replace(/^https?:\/\/(www\.)?(m\.me|facebook\.com)\//i, '').replace(/[^a-zA-Z0-9.]/g, '').slice(0, 50);
  RZ.messengerLink = user => (RZ.messengerUser(user) ? `https://m.me/${RZ.messengerUser(user)}` : '');

  /* Copy the message, then open the owner's Messenger chat so the customer can paste it. */
  RZ.sendMessage = async (text, user, statusEl) => {
    const copied = await RZ.copy(text);
    const link = RZ.messengerLink(user);
    if (statusEl) {
      statusEl.textContent = copied
        ? (link ? 'Order copied. Paste it in the Messenger chat that just opened.' : 'Copied. Paste it in a message to the shop.')
        : 'Could not copy automatically. Select the text and copy it.';
    }
    if (link) window.open(link, '_blank', 'noopener');
    return copied;
  };

  RZ.download = (filename, text, type = 'application/json') => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = RZ.el('a', { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  RZ.readJSONFile = file => new Promise((resolve, reject) => {
    if (!file || file.size > 2_000_000) { reject(new Error('File is missing or larger than 2 MB.')); return; }
    const reader = new FileReader();
    reader.onload = () => { try { resolve(JSON.parse(String(reader.result))); } catch { reject(new Error('That file is not a valid backup.')); } };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsText(file);
  });

  RZ.today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  RZ.iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  RZ.addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  /* Simple open/close for <dialog> elements with data-open / data-close attributes. */
  document.addEventListener('click', event => {
    const opener = event.target.closest('[data-open]');
    if (opener) { const dlg = document.getElementById(opener.dataset.open); if (dlg && dlg.showModal) dlg.showModal(); }
    const closer = event.target.closest('[data-close]');
    if (closer) closer.closest('dialog')?.close();
    if (event.target instanceof HTMLDialogElement) {
      const r = event.target.getBoundingClientRect();
      const outside = event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
      if (outside) event.target.close();
    }
  });

  window.RZ = RZ;
})();
