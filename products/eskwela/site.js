/* School page and online enrolment: no ?school → the demo school in this browser; ?school=slug → a real school. */
import { demoLoad, demoSave, demoActions, peso, longDate, hoodMark, hood } from './common.js';
import { feeTotals, buildCharges } from './logic.mjs';

const { $, el } = window.RZ;
const q = new URLSearchParams(location.search);
const SLUG = (q.get('school') || '').toLowerCase();
const LIVE = /^[a-z0-9-]{3,40}$/.test(SLUG);
let S = null; let L = [];

const initials = n => String(n || 'RZ').split(/\s+/).filter(w => /^[A-Z]/.test(w)).slice(0, 3).map(w => w[0]).join('') || 'RZ';

async function load() {
  if (!LIVE) { const d = demoLoad(); S = d.school; L = d.levels; return; }
  const res = await fetch(`/api/public/eskwela/${SLUG}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'This school’s page does not exist.');
  S = data.school; L = data.levels;
}

function paint() {
  document.title = `${S.name}${S.schoolYear ? ` — Enrolment ${S.schoolYear}` : ''}`;
  $('#sSeal').textContent = initials(S.name); $('#sName').textContent = S.name; $('#sMotto').textContent = S.motto || '';
  const yr = el('span', { class: 'nowrap' }, S.schoolYear || '');
  $('#leadTitle').replaceChildren(...(S.enrolOpen ? ['Enrolment for school year ', yr, ' is open.'] : ['School year ', yr]));
  $('#leadSub').textContent = S.enrolOpen ? 'Apply online in a few minutes. The registrar confirms every application and guides you through the requirements.' : 'Online enrolment is closed at the moment. Please contact the school office.';
  const fact = (k, v) => (v ? [el('dt', {}, k), el('dd', {}, v)] : []);
  $('#facts').replaceChildren(...fact('Grade levels', L.map(l => l.name).join(', ')), ...fact('Address', [S.address, S.city].filter(Boolean).join(', ')), ...fact('School principal', S.principal), ...fact('Telephone', S.phone));
  $('#feeNote').textContent = 'Fees for the whole school year, payable in instalments. Discounts, if any, are applied by the registrar.';
  $('#lvGrid').replaceChildren(...L.map(l => {
    const t = feeTotals(l.fees, 0); const sched = buildCharges(l.fees, 0);
    const card = el('article', { class: 'lv' },
      el('header', { class: 'lv-head' }, hoodMark(el, l.hood), el('h3', {}, l.name)),
      el('table', { class: 'lv-fees' }, el('tbody', {},
        ...(l.fees.items || []).map(i => el('tr', {}, el('td', {}, i.label), el('td', { class: 'num' }, peso(i.amount)))),
        el('tr', { class: 'tot' }, el('th', { scope: 'row' }, 'Total for the year'), el('td', { class: 'num' }, peso(t.gross))))),
      sched.length > 1 ? el('p', { class: 'lv-sched' }, `${sched.length} instalments: ${sched.map(s => `${peso(s.amount)}${s.due ? ` by ${longDate(s.due).replace(/, \d{4}$/, '')}` : ''}`).join(' · ')}`) : null,
      l.subjects?.length ? el('p', { class: 'lv-subj' }, l.subjects.join(' · ')) : null);
    card.style.setProperty('--hood', hood(l.hood).hex);
    return card;
  }));
  $('#enrolForm').elements.levelId.replaceChildren(el('option', { value: '' }, 'Select a grade level'), ...L.map(l => el('option', { value: l.id }, l.name)));
  $('#enrol').hidden = !S.enrolOpen;
  syncEnrolLinks();
  const v = (k, val) => (val ? [el('div', {}, el('dt', {}, k), el('dd', {}, val))] : []);
  $('#visit').replaceChildren(...v('Address', [S.address, S.city].filter(Boolean).join(', ')), ...v('Telephone', S.phone), ...v('Email', S.email), ...v('School principal', S.principal), ...v('School year', S.schoolYear));
  $('#foot').replaceChildren(el('p', {}, `${S.name} · ${[S.address, S.city].filter(Boolean).join(', ')}`), el('p', { class: 'fine' }, 'School page, enrolment and parent portal by RZ Eskwela.'));
  $('#strip').hidden = LIVE;
}
function syncEnrolLinks() { document.querySelectorAll('.s-nav a[href="#enrol"], .s-lead a[href="#enrol"]').forEach(a => { a.hidden = !S.enrolOpen; }); }

$('#enrolForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.elements; const err = $('#enrolErr'); err.textContent = '';
  const b = Object.fromEntries(['lastName', 'firstName', 'middleName', 'birthdate', 'sex', 'lrn', 'levelId', 'previousSchool', 'guardian', 'relation', 'mobile', 'email', 'address'].map(k => [k, f[k].value.trim()]));
  const need = [['lastName', 'the learner’s last name'], ['firstName', 'the learner’s first name'], ['birthdate', 'the date of birth'], ['levelId', 'the grade level'], ['guardian', 'the parent or guardian’s name'], ['mobile', 'a mobile number']].find(([k]) => !b[k]);
  if (need) { err.textContent = `Enter ${need[1]}.`; f[need[0]].focus(); return; }
  if (!/^[0-9+()\s-]{7,20}$/.test(b.mobile)) { err.textContent = 'Check the mobile number.'; f.mobile.focus(); return; }
  if (!f.consent.checked) { err.textContent = 'Please give your consent so the school can process the application.'; return; }
  $('#enrolBtn').disabled = true;
  try {
    let ref; let level;
    if (!LIVE) {
      const d = demoLoad(); demoActions(d, () => 'full').addStudent({ ...b, enrol: false }); demoSave(d);
      const st = d.students[d.students.length - 1]; ref = st.ref; level = L.find(l => l.id === b.levelId)?.name;
    } else {
      const res = await fetch(`/api/public/eskwela/${SLUG}/enrol`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send the application. Please call the school office.');
      ref = data.ref; level = data.level;
    }
    e.target.hidden = true;
    const done = $('#enrolDone'); done.hidden = false;
    done.replaceChildren(
      el('p', { class: 'p-label' }, 'Application received'),
      el('p', { class: 'ref inscr' }, ref),
      el('p', {}, `${b.firstName} ${b.lastName} · ${level}. Keep this application number. The registrar will contact ${b.guardian} at ${b.mobile} about the requirements and the first payment.`),
      LIVE ? null : el('p', { class: 'fine' }, 'Demo: the application is now waiting in the school office under Today.'),
      el('ol', {}, el('li', {}, 'The registrar reviews the application.'), el('li', {}, 'You submit the requirements and pay the first instalment.'), el('li', {}, 'You receive the parent portal link for your child’s account and report card.')));
    done.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  } catch (ex) { err.textContent = ex.message; }
  finally { $('#enrolBtn').disabled = false; }
});

(async () => {
  try { await load(); } catch (e) { $('#missing').hidden = false; $('#missingText').textContent = e.message; $('#top').hidden = true; $('#strip').hidden = LIVE; return; }
  paint();
  $('#main').hidden = false;
})();
