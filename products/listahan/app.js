(() => {
  'use strict';
  const { el, $, $$, peso, load, save, clean, copy, download, readJSONFile, id: newId, today, addDays, iso } = window.RZ;

  const KEY = 'rz-listahan';
  const d = n => iso(addDays(today(), -n));
  const SAMPLE = {
    store: 'Tindahan ni Aling Rosa',
    people: [
      { id: 'a1', name: 'Mang Jun', tag: 'Tricycle driver', entries: [[d(41), 'utang', '1 kaha yosi, 2 kape', 186], [d(33), 'utang', '5 kg bigas', 275], [d(12), 'bayad', 'GCash', 200], [d(3), 'utang', 'Load ₱50', 50]] },
      { id: 'a2', name: 'Aling Celia', tag: 'Kapitbahay', entries: [[d(52), 'utang', 'Mantika, toyo, suka', 142], [d(47), 'utang', '1 tray itlog', 240]] },
      { id: 'a3', name: 'Kuya Dennis', tag: 'Construction', entries: [[d(9), 'utang', '3 sardinas, 2 noodles', 96], [d(2), 'bayad', 'Cash', 96]] },
      { id: 'a4', name: 'Bea (bahay 14)', tag: '', entries: [[d(6), 'utang', 'Shampoo, sabon', 88], [d(1), 'utang', 'Softdrinks 1.5L', 75]] },
      { id: 'a5', name: 'Lolo Ben', tag: 'Suki since 2015', entries: [[d(20), 'utang', 'Gatas, tinapay', 130], [d(15), 'bayad', 'Pension', 130]] },
    ],
  };

  let data = load(KEY, SAMPLE);
  let openId = null; let sortBy = 'balance';

  const persist = () => save(KEY, data);
  const balance = p => p.entries.reduce((s, [, k, , a]) => s + (k === 'utang' ? a : -a), 0);
  const lastPay = p => { const pays = p.entries.filter(e => e[1] === 'bayad').map(e => e[0]).sort(); return pays.at(-1) || null; };
  // Days since the oldest unpaid credit started (approximation: since last payment, or since first credit).
  const daysLate = p => {
    if (balance(p) <= 0) return 0;
    const since = lastPay(p) || p.entries.map(e => e[0]).sort()[0];
    return since ? Math.round((today() - new Date(`${since}T00:00`)) / 86400000) : 0;
  };
  const fmtDate = s => new Date(`${s}T00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

  function renderStats() {
    const owing = data.people.filter(p => balance(p) > 0);
    $('#storeName').textContent = data.store;
    $('#statTotal').textContent = peso(owing.reduce((s, p) => s + balance(p), 0), true);
    $('#statPeople').textContent = owing.length;
    $('#statLate').textContent = owing.filter(p => daysLate(p) > 30).length;
    document.title = `${data.store} — Listahan`;
  }

  function renderPeople() {
    const q = $('#search').value.trim().toLowerCase();
    const list = data.people.filter(p => p.name.toLowerCase().includes(q));
    list.sort((a, b) => sortBy === 'name' ? a.name.localeCompare(b.name) : sortBy === 'late' ? daysLate(b) - daysLate(a) : balance(b) - balance(a));
    $('#people').replaceChildren(...list.map(p => {
      const bal = balance(p); const late = daysLate(p);
      return el('li', {}, el('button', { type: 'button', class: 'person', 'aria-current': String(p.id === openId), onclick: () => openPerson(p.id) },
        el('b', {}, p.name),
        el('span', { class: `amt${bal <= 0 ? ' zero' : ''}` }, bal <= 0 ? 'Bayad na' : peso(bal, true)),
        el('small', { class: late > 30 ? 'late' : '' }, bal > 0 ? (late > 30 ? `${late} araw na` : `${late} araw`) : (p.tag || 'Walang utang'))));
    }));
    if (!list.length) $('#people').append(el('li', { class: 'fine' }, 'Walang nahanap.'));
  }

  function openPerson(pid, fresh) {
    openId = pid;
    const p = data.people.find(x => x.id === pid);
    $('#emptyPage').hidden = !!p; $('#page').hidden = !p;
    $('#book').classList.toggle('reading', !!p);
    renderPeople();
    if (!p) return;
    const bal = balance(p);
    $('#pName').textContent = p.name;
    $('#pSub').textContent = [p.tag, lastPay(p) ? `Huling bayad ${fmtDate(lastPay(p))}` : 'Wala pang bayad'].filter(Boolean).join(' · ');
    const b = $('#pBal'); b.textContent = peso(Math.max(bal, 0)); b.classList.toggle('zero', bal <= 0);
    const rows = p.entries.map((e, i) => ({ e, i })).sort((a, b2) => (a.e[0] < b2.e[0] ? 1 : -1));
    $('#lines').replaceChildren(...(rows.length ? rows.map(({ e: [date, kind, note, amt], i }) => el('li', { class: fresh === i ? 'fresh' : '' },
      el('span', { class: 'd' }, fmtDate(date)),
      el('span', {}, note || (kind === 'bayad' ? 'Bayad' : 'Utang')),
      el('span', { class: `v${kind === 'bayad' ? ' pay' : ''}` }, `${kind === 'bayad' ? '− ' : ''}${peso(amt)}`),
      el('button', { type: 'button', class: 'x', 'aria-label': 'Burahin ang linya', onclick: () => { p.entries.splice(i, 1); persist(); openPerson(pid); renderStats(); } }, '×')))
      : [el('li', {}, el('span', { class: 'none' }, 'Wala pang nakasulat.'))]));
    $('#pStatus').textContent = '';
  }

  $('#entryForm').addEventListener('submit', e => {
    e.preventDefault();
    const p = data.people.find(x => x.id === openId); if (!p) return;
    const f = e.target.elements;
    const amount = Math.round(Math.min(100000, Math.max(0, Number(f.amount.value) || 0)) * 100) / 100;
    if (!amount) return;
    p.entries.push([iso(today()), f.kind.value, clean(f.note.value, 60), amount]);
    persist();
    f.note.value = ''; f.amount.value = '';
    openPerson(p.id, p.entries.length - 1); renderStats();
    f.note.focus();
  });

  $('#remind').addEventListener('click', async () => {
    const p = data.people.find(x => x.id === openId); if (!p) return;
    const bal = balance(p);
    const text = bal > 0
      ? `Hi ${p.name}! Paalala lang po mula sa ${data.store}: ang balanse ninyo ay ${peso(bal)}. Pwede pong bayaran nang paunti-unti. Salamat po!`
      : `Hi ${p.name}! Salamat po, bayad na kayo sa ${data.store}.`;
    $('#pStatus').textContent = (await copy(text)) ? 'Nakopya na. I-paste sa text o Messenger.' : 'Hindi ma-copy. Subukan ulit.';
  });

  $('#delPerson').addEventListener('click', () => {
    const p = data.people.find(x => x.id === openId); if (!p) return;
    if (!confirm(`Burahin si ${p.name} at lahat ng listahan niya?`)) return;
    data.people = data.people.filter(x => x.id !== p.id); persist(); openId = null;
    openPerson(null); renderStats();
  });

  $('#back').addEventListener('click', () => { openId = null; openPerson(null); });
  $('#search').addEventListener('input', renderPeople);
  $$('[data-sort]').forEach(b => b.addEventListener('click', () => { sortBy = b.dataset.sort; $$('[data-sort]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderPeople(); }));

  $('#personForm').addEventListener('submit', e => {
    const f = e.target.elements; const name = clean(f.name.value, 40); if (!name) return;
    const p = { id: newId(), name, tag: clean(f.tag.value, 40), entries: [] };
    data.people.push(p); persist(); e.target.reset(); renderStats(); openPerson(p.id);
  });

  const sf = $('#settingsForm');
  document.querySelector('[data-open="settings"]').addEventListener('click', () => { sf.elements.store.value = data.store; $('#sStatus').textContent = ''; });
  sf.addEventListener('submit', () => { data.store = clean(sf.elements.store.value, 40) || data.store; persist(); renderStats(); });
  $('#exportBtn').addEventListener('click', () => { download(`listahan-${iso(today())}.json`, JSON.stringify({ app: 'rz-listahan', v: 1, data }, null, 2)); $('#sStatus').textContent = 'Backup saved to your downloads.'; });
  $('#importFile').addEventListener('change', async e => {
    try {
      const json = await readJSONFile(e.target.files[0]);
      const incoming = json && json.app === 'rz-listahan' ? json.data : null;
      const valid = incoming && typeof incoming.store === 'string' && Array.isArray(incoming.people) && incoming.people.every(p => typeof p.name === 'string' && Array.isArray(p.entries) && p.entries.every(x => Array.isArray(x) && x.length === 4 && typeof x[3] === 'number'));
      if (!valid) throw new Error('This is not an RZ Listahan backup.');
      data = { store: clean(incoming.store, 40), people: incoming.people.slice(0, 2000).map(p => ({ id: newId(), name: clean(p.name, 40), tag: clean(p.tag, 40), entries: p.entries.slice(0, 5000).map(([dt, k, n, a]) => [String(dt).slice(0, 10), k === 'bayad' ? 'bayad' : 'utang', clean(n, 60), Math.max(0, Number(a) || 0)]) })) };
      persist(); openId = null; openPerson(null); renderStats();
      $('#sStatus').textContent = 'Backup restored.';
    } catch (err) { $('#sStatus').textContent = err.message; }
    e.target.value = '';
  });
  $('#resetBtn').addEventListener('click', () => { if (!confirm('Palitan ang lahat ng sample na listahan?')) return; data = structuredClone(SAMPLE); persist(); openId = null; openPerson(null); renderStats(); $('#sStatus').textContent = 'Sample restored.'; });

  renderStats();
  if (window.matchMedia('(min-width: 761px)').matches && data.people[0]) openPerson(data.people[0].id); else openPerson(null);
})();
