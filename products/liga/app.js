(() => {
  'use strict';
  const { el, $, $$, load, save, clean, download, today, addDays } = window.RZ;

  const COLORS = ['#c0392b', '#1f5fae', '#1d7a4c', '#7b3fa0', '#d4860b', '#0e7c86', '#a8325e', '#4f5b6b', '#2f6f3a', '#9c4a1a', '#2b4a8a', '#6d2f8a'];
  const SAMPLE_TEAMS = ['Purok 1 Agila', 'Purok 2 Tamaraw', 'Purok 3 Lawin', 'Purok 4 Kalabaw', 'Purok 5 Buwaya', 'Purok 6 Pating'];
  const KEY = 'rz-liga';

  // Circle-method round robin.
  function schedule(n) {
    const ids = [...Array(n).keys()]; if (n % 2) ids.push(-1);
    const m = ids.length; const rounds = [];
    for (let r = 0; r < m - 1; r++) {
      const games = [];
      for (let i = 0; i < m / 2; i++) {
        const a = ids[i], b = ids[m - 1 - i];
        if (a !== -1 && b !== -1) games.push({ h: r % 2 ? b : a, a: r % 2 ? a : b, hs: null, as: null });
      }
      rounds.push(games);
      ids.splice(1, 0, ids.pop());
    }
    return rounds;
  }

  function sample() {
    const rounds = schedule(SAMPLE_TEAMS.length);
    const scores = [[[78, 71], [65, 69], [88, 80]], [[72, 74], [90, 77], [61, 58]], [[70, 66], [83, 85], [79, 64]]];
    scores.forEach((r, ri) => r.forEach(([x, y], gi) => { if (rounds[ri][gi]) { rounds[ri][gi].hs = x; rounds[ri][gi].as = y; } }));
    return { name: 'Liga ng Barangay San Roque', season: 'Season 2026 · Seniors Division', teams: SAMPLE_TEAMS, rounds, start: today().toISOString() };
  }

  let lg = load(KEY, null) || sample();
  const persist = () => save(KEY, lg);
  const abbr = n => n.split(/\s+/).filter(w => !/^purok$/i.test(w)).map(w => w[0]).join('').slice(0, 3).toUpperCase() || n.slice(0, 2).toUpperCase();
  const color = i => COLORS[i % COLORS.length];
  const played = g => Number.isFinite(g.hs) && Number.isFinite(g.as) && g.hs !== g.as;

  function table() {
    const t = lg.teams.map((name, i) => ({ i, name, gp: 0, w: 0, l: 0, pf: 0, pa: 0 }));
    lg.rounds.flat().filter(played).forEach(g => {
      const H = t[g.h], A = t[g.a];
      H.gp++; A.gp++; H.pf += g.hs; H.pa += g.as; A.pf += g.as; A.pa += g.hs;
      if (g.hs > g.as) { H.w++; A.l++; } else { A.w++; H.l++; }
    });
    return t.sort((x, y) => (y.w / (y.gp || 1)) - (x.w / (x.gp || 1)) || y.w - x.w || (y.pf - y.pa) - (x.pf - x.pa) || x.name.localeCompare(y.name));
  }

  const chip = i => { const c = el('span', { class: 'chip', 'aria-hidden': 'true' }, abbr(lg.teams[i])); c.style.setProperty('--c', color(i)); return c; };

  function renderHead() {
    $('#leagueName').textContent = lg.name; $('#season').textContent = lg.season;
    document.title = `${lg.name} — Standings`;
    const recent = lg.rounds.flat().filter(played).slice(-6).reverse();
    $('#ticker').replaceChildren(el('span', { class: 'tick-label' }, recent.length ? 'Latest' : 'No games yet'), ...recent.map(g => el('div', { class: 'tick' },
      el('span', { class: g.hs > g.as ? 'w' : '' }, lg.teams[g.h]), el('b', {}, g.hs),
      el('span', { class: g.as > g.hs ? 'w' : '' }, lg.teams[g.a]), el('b', {}, g.as))));
  }

  function renderStand() {
    $('#standBody').replaceChildren(...table().map((r, k) => {
      const diff = r.pf - r.pa;
      return el('tr', { class: k < 4 ? 'top' : '' },
        el('td', { class: 'rank' }, k + 1),
        el('td', { class: 'tl' }, el('span', { class: 'team-cell' }, chip(r.i), r.name)),
        el('td', {}, r.gp), el('td', {}, r.w), el('td', {}, r.l),
        el('td', { class: 'pct' }, r.gp ? (r.w / r.gp).toFixed(3).replace(/^0/, '') : '.000'),
        el('td', { class: 'hide-s' }, r.pf), el('td', { class: 'hide-s' }, r.pa),
        el('td', { class: diff > 0 ? 'pos' : diff < 0 ? 'neg' : '' }, diff > 0 ? `+${diff}` : diff));
    }));
  }

  function renderRounds() {
    const start = new Date(lg.start);
    $('#rounds').replaceChildren(...lg.rounds.map((games, ri) => el('section', { class: 'round', 'aria-label': `Round ${ri + 1}` },
      el('h3', {}, `Round ${ri + 1}`, el('small', {}, addDays(start, ri * 7).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }))),
      games.map((g, gi) => {
        const inp = (side) => el('input', { type: 'number', min: 0, max: 300, inputmode: 'numeric', value: g[side] ?? '', 'aria-label': `${lg.teams[side === 'hs' ? g.h : g.a]} score, round ${ri + 1}`,
          onchange: e => { const v = e.target.value === '' ? null : Math.max(0, Math.min(300, Math.round(Number(e.target.value)))); g[side] = Number.isFinite(v) ? v : null; persist(); renderHead(); renderStand(); renderRounds(); } });
        return el('div', { class: 'game' },
          el('span', { class: `home${played(g) && g.hs > g.as ? ' won' : ''}` }, lg.teams[g.h]), inp('hs'), el('span', { class: 'vs' }, '–'), inp('as'),
          el('span', { class: `away${played(g) && g.as > g.hs ? ' won' : ''}` }, lg.teams[g.a]));
      }))));
  }

  function renderTeams() {
    const t = table();
    $('#teams').replaceChildren(...lg.teams.map((name, i) => {
      const r = t.find(x => x.i === i); const rank = t.indexOf(r) + 1;
      const card = el('article', { class: 'tcard', 'data-abbr': abbr(name) }, el('h3', {}, name), el('p', {}, `${r.w}–${r.l} · Rank ${rank}`));
      card.style.setProperty('--c', color(i)); return card;
    }));
  }

  function renderAll() { renderHead(); renderStand(); renderRounds(); renderTeams(); }

  // tabs
  const tabs = $$('[role="tab"]');
  tabs.forEach(tab => tab.addEventListener('click', () => {
    tabs.forEach(t => { const on = t === tab; t.setAttribute('aria-selected', String(on)); $(`#${t.getAttribute('aria-controls')}`).hidden = !on; });
  }));

  const sf = $('#settingsForm');
  document.querySelector('[data-open="settings"]').addEventListener('click', () => { sf.elements.name.value = lg.name; sf.elements.season.value = lg.season; sf.elements.teams.value = lg.teams.join('\n'); $('#sStatus').textContent = ''; });
  sf.addEventListener('submit', e => {
    const teams = sf.elements.teams.value.split('\n').map(s => clean(s, 30)).filter(Boolean).slice(0, 12);
    if (teams.length < 4) { e.preventDefault(); $('#sStatus').textContent = 'Add at least 4 teams.'; return; }
    const changed = teams.join('|') !== lg.teams.join('|');
    if (changed && !confirm('New teams make a new schedule and clear all scores. Continue?')) { e.preventDefault(); return; }
    lg.name = clean(sf.elements.name.value, 50) || lg.name; lg.season = clean(sf.elements.season.value, 60);
    if (changed) { lg.teams = teams; lg.rounds = schedule(teams.length); lg.start = today().toISOString(); }
    persist(); renderAll();
  });
  $('#exportBtn').addEventListener('click', () => { download('liga-backup.json', JSON.stringify({ app: 'rz-liga', v: 1, league: lg }, null, 2)); $('#sStatus').textContent = 'Backup saved to your downloads.'; });
  $('#resetBtn').addEventListener('click', () => { lg = sample(); persist(); renderAll(); $('#settings').close(); });

  renderAll();
})();
