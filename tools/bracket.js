(() => {
  'use strict';
  const STORAGE_KEY = 'de-bracket-engine-v1';
  const FORMAT = 'de-bracket-v1';
  const SAMPLE = ['NORTH DIVISION', 'RED NOVA', 'LAST ROUND', 'ECHO SQUAD', 'FULL SEND', 'MIDNIGHT FIVE', 'BLACKOUT', 'ZERO HOUR'];
  const $ = id => document.getElementById(id);
  const initial = () => ({ title: 'FRIDAY NIGHT FINALS', teams: [...SAMPLE], draftTeams: SAMPLE.join('\n'), scores: {} });
  let state = initial();
  const status = message => { $('toolStatus').textContent = message; };
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); $('saveState').textContent = 'SAVED ON DEVICE'; }
    catch { $('saveState').textContent = 'STORAGE UNAVAILABLE'; status('Browser storage is unavailable. Export your bracket JSON to keep it.'); }
  }
  function validateTeams(names) {
    if (!Array.isArray(names) || names.length < 2 || names.length > 16) throw Error('Enter between 2 and 16 team names.');
    const clean = names.map(v => typeof v === 'string' ? v.trim() : '');
    if (clean.some(v => !v || v.length > 40)) throw Error('Each team needs a name of 1–40 characters.');
    const unique = new Set(clean.map(v => v.toLocaleLowerCase()));
    if (unique.size !== clean.length) throw Error('Each team needs a unique name.');
    return clean;
  }
  function normalizeScores(data, count) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid scores.');
    const size = 2 ** Math.ceil(Math.log2(count));
    const roundCount = Math.log2(size);
    const result = {};
    const entries = Object.entries(data);
    if (entries.length > 64) throw Error('Too many score records.');
    for (const [key, pair] of entries) {
      if (!/^\d{1,2}:\d{1,2}$/.test(key)) throw Error('Invalid match key.');
      const [r, m] = key.split(':').map(Number);
      if (r >= roundCount || m >= size / (2 ** (r + 1)) || !Array.isArray(pair) || pair.length !== 2) throw Error('Invalid match.');
      const cleanPair = pair.map(v => v === null ? null : (Number.isInteger(v) && v >= 0 && v <= 999 ? v : NaN));
      if (cleanPair.some(Number.isNaN)) throw Error('Scores must be whole numbers from 0 to 999.');
      result[key] = cleanPair;
    }
    return result;
  }
  function seedPositions(size) {
    let positions = [1, 2];
    for (let s = 4; s <= size; s *= 2) positions = positions.flatMap(n => [n, s + 1 - n]);
    return positions;
  }
  function calculate() {
    const count = state.teams.length;
    const size = 2 ** Math.ceil(Math.log2(count));
    const positions = seedPositions(size);
    const firstRound = positions.map(seed => seed <= count ? { type: 'team', name: state.teams[seed - 1], seed } : { type: 'bye', name: 'BYE' });
    const rounds = [];
    let played = 0;
    const roundCount = Math.log2(size);
    for (let r = 0; r < roundCount; r++) {
      const matches = [];
      const matchCount = size / (2 ** (r + 1));
      for (let m = 0; m < matchCount; m++) {
        const slots = r === 0 ? [firstRound[m * 2], firstRound[m * 2 + 1]] : [rounds[r - 1][m * 2].winner, rounds[r - 1][m * 2 + 1].winner].map(w => w || {type: 'pending', name: 'TO BE DECIDED'});
        const teams = slots.filter(s => s.type === 'team');
        const key = `${r}:${m}`;
        const scores = state.scores[key] || [null, null];
        let winner = null, outcome = 'AWAITING SCORES', resultType = '';
        if (teams.length === 1 && slots.some(s => s.type === 'bye')) {
          winner = teams[0]; outcome = 'ADVANCES / BYE'; resultType = 'bye';
        } else if (teams.length === 2) {
          if (scores[0] !== null && scores[1] !== null) {
            if (scores[0] === scores[1]) { outcome = 'TIE — ENTER A WINNER'; resultType = 'error'; }
            else { winner = slots[scores[0] > scores[1] ? 0 : 1]; outcome = 'WINNER ADVANCES →'; resultType = 'won'; played++; }
          }
        } else if (teams.length < 2) { outcome = 'WAITING FOR PREVIOUS ROUND'; }
        matches.push({ r, m, slots, scores, winner, outcome, resultType });
      }
      rounds.push(matches);
    }
    const final = rounds.at(-1)[0];
    return { rounds, played, total: count - 1, champion: final?.winner?.name || null };
  }
  function element(tag, className, textContent) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent !== undefined) node.textContent = textContent;
    return node;
  }
  function draw() {
    const { rounds, played, total, champion } = calculate();
    $('statTeams').textContent = String(state.teams.length).padStart(2, '0');
    $('statRounds').textContent = String(rounds.length).padStart(2, '0');
    $('statComplete').textContent = `${played}/${total}`;
    $('statChampion').textContent = champion || 'TBD';
    $('arenaStatus').textContent = champion ? '● CHAMPION CROWNED' : played ? '● TOURNAMENT IN PROGRESS' : '● READY FOR FIRST MATCH';
    const grid = $('bracketGrid');
    grid.replaceChildren();
    const names = ['OPENING ROUND', 'QUARTERFINALS', 'SEMIFINALS', 'GRAND FINAL'];
    rounds.forEach((matches, r) => {
      const round = element('section', 'round-column');
      round.setAttribute('aria-label', `Round ${r + 1}`);
      const top = element('div', 'round-head');
      top.append(element('b', '', r === rounds.length - 1 ? 'THE FINAL' : (matches.length === 2 ? 'SEMIFINALS' : matches.length === 4 ? 'QUARTERFINALS' : names[0])));
      top.append(element('span', '', `ROUND ${String(r + 1).padStart(2, '0')}`));
      round.append(top);
      const matchList = element('div', 'round-matches');
      matches.forEach(match => {
        const matchEl = element('div', 'match');
        const id = `R${r + 1} / M${match.m + 1}`;
        matchEl.append(element('span', 'match-no', id));
        const canScore = match.slots.every(s => s.type === 'team');
        match.slots.forEach((slot, si) => {
          const isWinner = match.winner && match.winner.name === slot.name && slot.type === 'team';
          const line = element('div', 'competitor' + (isWinner ? ' is-winner' : '') + (slot.type === 'bye' ? ' is-bye' : '') + (slot.type === 'pending' ? ' is-pending' : ''));
          const label = element('span', 'competitor-name', `${slot.seed ? String(slot.seed).padStart(2, '0') + ' / ' : ''}${slot.name}`);
          label.title = slot.name;
          const input = document.createElement('input');
          input.type = 'number'; input.min = '0'; input.max = '999'; input.step = '1';
          input.inputMode = 'numeric'; input.value = canScore && match.scores[si] !== null ? String(match.scores[si]) : '';
          input.disabled = !canScore;
          input.dataset.r = String(r); input.dataset.m = String(match.m); input.dataset.s = String(si);
          input.setAttribute('aria-label', `${slot.name} score, ${id}`);
          line.append(label, input); matchEl.append(line);
        });
        matchEl.append(element('div', 'match-result ' + match.resultType, match.outcome));
        matchList.append(matchEl);
      });
      round.append(matchList); grid.append(round);
    });
  }
  function fillEditor() { $('tournamentName').value = state.title; $('teamNames').value = state.draftTeams; }
  function generate() {
    try {
      const teams = validateTeams($('teamNames').value.split(/\r?\n/).filter(v => v.trim()));
      if (Object.keys(state.scores).length && !confirm('Generating a new bracket will clear existing match scores. Continue?')) return;
      state.teams = teams; state.draftTeams = teams.join('\n'); state.title = $('tournamentName').value.trim().slice(0, 65) || 'UNTITLED TOURNAMENT'; state.scores = {};
      fillEditor(); draw(); save(); status(`BRACKET GENERATED / ${teams.length} TEAMS / ${calculate().rounds.length} ROUNDS.`);
    } catch (error) { status(error.message); }
  }
  function exportFile() {
    const output = { format: FORMAT, exportedAt: new Date().toISOString(), data: { title: state.title, teams: state.teams, scores: state.scores } };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${(state.title || 'tournament').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}-bracket.json`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('TOURNAMENT EXPORTED AS A JSON BACKUP.');
  }
  $('generateBtn').addEventListener('click', generate);
  $('sampleBtn').addEventListener('click', () => {
    $('teamNames').value = SAMPLE.join('\n'); $('tournamentName').value = 'FRIDAY NIGHT FINALS';
    status('SAMPLE TEAMS LOADED. SELECT GENERATE BRACKET TO APPLY.');
  });
  $('tournamentName').addEventListener('input', e => { state.title = e.target.value.slice(0,65); save(); });
  $('teamNames').addEventListener('input', e => { state.draftTeams = e.target.value.slice(0,700); save(); });
  $('bracketGrid').addEventListener('keydown', e => { if (e.target.matches('input') && e.key === 'Enter') e.target.blur(); });
  $('bracketGrid').addEventListener('change', e => {
    const input = e.target.closest('input[data-r][data-m][data-s]'); if (!input) return;
    const {r,m,s} = input.dataset;
    const value = input.value.trim();
    if (value && (!/^\d{1,3}$/.test(value) || Number(value) > 999)) { status('SCORES MUST BE WHOLE NUMBERS FROM 0 TO 999.'); draw(); return; }
    const round = Number(r), match = Number(m), side = Number(s), key = `${round}:${match}`;
    const pair = [...(state.scores[key] || [null, null])];
    const newScore = value === '' ? null : Number(value);
    if (pair[side] === newScore) return;
    pair[side] = newScore;
    state.scores[key] = pair;
    // Prevent results being attributed to different teams when an earlier winner changes.
    for (const name of Object.keys(state.scores)) if (Number(name.split(':')[0]) > round) delete state.scores[name];
    draw(); save();
    const progress = calculate();
    status(progress.champion ? `CHAMPION: ${progress.champion.toUpperCase()}` : 'SCORE UPDATED. FUTURE-ROUND SCORES WERE CLEARED IF PRESENT.');
  });
  $('exportBtn').addEventListener('click', exportFile);
  $('printBtn').addEventListener('click', () => window.print());
  $('resetBtn').addEventListener('click', () => {
    if (!Object.keys(state.scores).length) {status('NO SCORES TO CLEAR.');return;}
    if (!confirm('Clear all match scores and keep the teams?')) return;
    state.scores = {}; save(); draw(); status('MATCH SCORES CLEARED.');
  });
  $('importFile').addEventListener('change', async e => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 100000) throw Error('JSON file is too large.');
      const parsed = JSON.parse(await file.text());
      if (parsed.format !== FORMAT || !parsed.data) throw Error('Unsupported file. Import a Bracket Engine JSON export.');
      const data = parsed.data;
      const teams = validateTeams(data.teams);
      const scores = normalizeScores(data.scores, teams.length);
      if (typeof data.title !== 'string' || data.title.length > 65) throw Error('Invalid tournament name.');
      state = { title: data.title.trim() || 'UNTITLED TOURNAMENT', teams, draftTeams: teams.join('\n'), scores };
      fillEditor(); draw(); save(); status('TOURNAMENT IMPORTED.');
    } catch (error) { status(`IMPORT FAILED: ${error.message}`); }
    e.target.value = '';
  });
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); }
  catch { status('BROWSER STORAGE UNAVAILABLE. EXPORT JSON TO KEEP YOUR BRACKET.'); $('saveState').textContent = 'LOCAL SAVE UNAVAILABLE'; }
  try {
    if (raw) {
      const saved = JSON.parse(raw);
      const teams = validateTeams(saved.teams);
      const scores = normalizeScores(saved.scores, teams.length);
      state = {
        title: typeof saved.title === 'string' ? saved.title.slice(0,65) : 'UNTITLED TOURNAMENT',
        teams,
        draftTeams: typeof saved.draftTeams === 'string' ? saved.draftTeams.slice(0,700) : teams.join('\n'),
        scores
      };
    }
  } catch { state = initial(); status('SAVED BRACKET WAS INVALID. SAMPLE TEAMS ARE READY.'); }
  $('brYear').textContent = String(new Date().getFullYear());
  fillEditor(); draw();
})();
