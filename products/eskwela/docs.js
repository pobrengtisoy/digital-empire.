/* The two formal documents of RZ Eskwela, drawn the same in the office and in the parent portal. */
import { QUARTERS, finalGrade, generalAverage, descriptor, remark } from './logic.mjs';
import { peso, longDate, shortDate, hood } from './common.js';

const initials = name => String(name || 'RZ').split(/\s+/).filter(w => /^[A-Z]/.test(w)).slice(0, 3).map(w => w[0]).join('') || 'RZ';

function band(el, school, hoodKey) {
  const b = el('header', { class: 'doc-band' },
    el('span', { class: 'seal', 'aria-hidden': 'true' }, initials(school.name)),
    el('div', {}, el('p', { class: 'doc-school' }, school.name), el('p', { class: 'doc-addr' }, [school.address, school.city].filter(Boolean).join(', '))));
  b.style.setProperty('--hood', hood(hoodKey).hex);
  return b;
}
const who = (el, pairs) => el('dl', { class: 'doc-who' }, ...pairs.map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, v || '—'))));

/* Report card: quarter grades the school has released, final grade once all four are in. */
export function reportCard(el, { school, student, levelName, hoodKey, subjects, grades, released, attendance, officeCopy = null }) {
  const q = {};
  grades.forEach(g => { (q[g.subject] ||= {})[g.quarter] = g.grade; });
  const finals = subjects.map(s => finalGrade(q[s]));
  const ga = generalAverage(finals);
  const shown = QUARTERS.filter(n => released.includes(n));
  const rel = officeCopy ? QUARTERS.filter(n => officeCopy.includes(n)) : shown;
  const rows = subjects.map((s, i) => el('tr', {},
    el('td', { class: 'name' }, s),
    ...QUARTERS.map(n => el('td', { class: 'num' }, shown.includes(n) && typeof q[s]?.[n] === 'number' ? String(q[s][n]) : '')),
    el('td', { class: 'num' }, finals[i] == null ? '' : String(finals[i])),
    el('td', { class: 'hide-s' }, finals[i] == null ? '' : remark(finals[i]))));
  const card = el('article', { class: 'doc report' },
    band(el, school, hoodKey),
    el('h2', { class: 'doc-title' }, 'Report card'),
    el('p', { class: 'doc-sub' }, `School year ${school.schoolYear || ''}`),
    who(el, [['Learner', `${student.lastName}, ${student.firstName}${student.middleName ? ` ${student.middleName}` : ''}`], ['Grade and section', `${levelName}${student.section ? ` · ${student.section}` : ''}`], ['LRN', student.lrn], ['Student no.', student.ref]]),
    el('div', { class: 'doc-body' },
      el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Learning area'), ...QUARTERS.map(n => el('th', { scope: 'col', class: 'num' }, `Q${n}`)), el('th', { scope: 'col', class: 'num' }, 'Final'), el('th', { scope: 'col', class: 'hide-s' }, 'Remarks'))),
        el('tbody', {}, ...(rows.length ? rows : [el('tr', { class: 'empty-row' }, el('td', { colspan: '7' }, 'No learning areas set for this grade level yet.'))]))),
      el('p', { class: 'doc-avg' }, el('span', {}, 'General average'), el('b', {}, ga == null ? '—' : ga.toFixed(2)), el('span', {}, ga == null ? 'Shown when all four quarters are in' : descriptor(ga))),
      attendance ? el('p', { class: 'fine' }, `Attendance this school year so far: ${attendance.present} present, ${attendance.late} late, ${attendance.absent} absent, ${attendance.excused} excused.`) : null,
      el('ul', { class: 'legend' }, ...['90–100 Outstanding', '85–89 Very satisfactory', '80–84 Satisfactory', '75–79 Fairly satisfactory', 'Below 75 Did not meet expectations'].map(t => el('li', {}, t)))),
    el('div', { class: 'signs' }, el('div', {}, el('b', {}, ' '), 'Class adviser'), el('div', {}, el('b', {}, school.principal || ' '), 'School principal')),
    el('p', { class: 'doc-foot' }, `Quarters released${officeCopy ? ' to parents' : ''}: ${rel.length ? rel.map(n => `Q${n}`).join(', ') : 'none yet'}.${officeCopy ? ' Office copy.' : ''} This report card is issued by ${school.name}.`));
  return card;
}

/* Statement of account: every charge with its due date, paid and remaining; payments received. */
export function statement(el, { school, student, levelName, hoodKey, account, payments }) {
  const st = { paid: 'Paid', late: 'Past due', partial: 'Part paid', open: 'Upcoming' };
  return el('article', { class: 'doc statement' },
    band(el, school, hoodKey),
    el('h2', { class: 'doc-title' }, 'Statement of account'),
    el('p', { class: 'doc-sub' }, `School year ${school.schoolYear || ''} · as of ${longDate(new Date().toISOString().slice(0, 10))}`),
    who(el, [['Learner', `${student.lastName}, ${student.firstName}`], ['Grade and section', `${levelName}${student.section ? ` · ${student.section}` : ''}`], ['Student no.', student.ref], ['Balance', peso(account.balance)]]),
    el('div', { class: 'doc-body' },
      el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Particulars'), el('th', { scope: 'col' }, 'Due'), el('th', { scope: 'col', class: 'num hide-s' }, 'Amount'), el('th', { scope: 'col', class: 'num hide-s' }, 'Paid'), el('th', { scope: 'col', class: 'num' }, 'Balance'), el('th', { scope: 'col' }, 'Status'))),
        el('tbody', {}, ...account.charges.map(c => el('tr', {},
          el('td', { class: 'name' }, c.label), el('td', { class: 'due' }, c.due ? shortDate(c.due) : '—'),
          el('td', { class: 'num hide-s' }, peso(c.amount)), el('td', { class: 'num hide-s' }, peso(c.paid)), el('td', { class: 'num' }, peso(c.left)),
          el('td', {}, el('span', { class: `stamp ${c.status}` }, c.status === 'late' ? `Late ${c.lateDays}d` : st[c.status]))))),
        el('tfoot', {}, el('tr', {}, el('th', { scope: 'row', colspan: '2' }, 'Totals'), el('td', { class: 'num hide-s' }, peso(account.billed)), el('td', { class: 'num hide-s' }, peso(account.paid)), el('td', { class: 'num' }, el('b', {}, peso(account.balance))), el('td', {})))),
      payments.length ? el('h3', { class: 'doc-h3' }, 'Payments received') : null,
      payments.length ? el('table', { class: 'tbl' },
        el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Date'), el('th', { scope: 'col', class: 'hide-s' }, 'Method'), el('th', { scope: 'col', class: 'hide-s' }, 'Reference / receipt'), el('th', { scope: 'col', class: 'num' }, 'Amount'), el('th', { scope: 'col' }, 'Status'))),
        el('tbody', {}, ...payments.map(p => el('tr', {}, el('td', { class: 'due' }, shortDate(p.paidOn)), el('td', { class: 'hide-s' }, p.method), el('td', { class: 'hide-s' }, [p.receiptNo, p.reference].filter(Boolean).join(' · ') || '—'), el('td', { class: 'num' }, peso(p.amount)), el('td', {}, el('span', { class: `stamp ${p.status === 'confirmed' ? 'paid' : p.status}` }, p.status === 'confirmed' ? 'Received' : p.status === 'pending' ? 'To verify' : p.status)))))) : null),
    el('p', { class: 'doc-foot' }, `${school.name} · ${school.phone || ''}${school.registrar ? ` · Registrar: ${school.registrar}` : ''}`));
}

/* Print one document by itself. */
export function printDoc(doc) {
  let host = document.querySelector('.print-host');
  if (!host) { host = document.createElement('div'); host.className = 'print-host'; document.body.append(host); }
  host.replaceChildren(doc.cloneNode(true));
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}
