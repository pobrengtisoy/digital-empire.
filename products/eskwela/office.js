/* RZ Eskwela school office. Demo school in this browser; ?live is the real office on the RZ server. */
import { ledger, round, isoDay, descriptor, HOODS, HOOD_KEYS, QUARTERS, feeTotals, reminder } from './logic.mjs';
import { demoLoad, demoSave, demoActions, peso, pesoShort, fullName, displayName, longDate, shortDate, hoodMark, hood } from './common.js';
import { reportCard, statement, printDoc } from './docs.js';

const { $, $$, el, copy } = window.RZ;
const LIVE = new URLSearchParams(location.search).has('live');
const TG = 'https://t.me/BRZBSST';
let S = null; let D = null; let acc = new Map();
const ui = { status: 'enrolled', level: '', q: '', feeLevel: '', gLevel: '', gSubject: '', gQuarter: 1, aLevel: '', aDay: '', jMonth: '' };

/* ---------- data ---------- */
async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, { method: opts.method || 'GET', credentials: 'same-origin', headers: opts.body ? { 'content-type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = {}; try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return data;
}
const demoPlan = () => sessionStorage.getItem('rz-eskwela-preview') || 'full';
const demoState = () => {
  const p = demoPlan();
  return { school: { ...D.school, plan: p }, today: isoDay(new Date()), levels: D.levels, students: D.students, charges: D.charges, payments: D.payments, grades: D.grades, attendance: p === 'full' ? D.attendance : [], notices: p === 'full' ? D.notices : [] };
};
let A = null;
const LIVE_ROUTES = {
  school: b => api('/eskwela/school', { method: 'PUT', body: b }),
  addLevel: b => api('/eskwela/levels', { method: 'POST', body: b }), editLevel: (id, b) => api(`/eskwela/levels/${id}`, { method: 'PATCH', body: b }), delLevel: id => api(`/eskwela/levels/${id}`, { method: 'DELETE' }),
  addStudent: b => api('/eskwela/students', { method: 'POST', body: b }), editStudent: (id, b) => api(`/eskwela/students/${id}`, { method: 'PATCH', body: b }),
  enrol: id => api(`/eskwela/students/${id}/enrol`, { method: 'POST', body: {} }), delStudent: id => api(`/eskwela/students/${id}`, { method: 'DELETE' }),
  addCharge: b => api('/eskwela/charges', { method: 'POST', body: b }), delCharge: id => api(`/eskwela/charges/${id}`, { method: 'DELETE' }),
  addPayment: b => api('/eskwela/payments', { method: 'POST', body: b }), setPayment: (id, b) => api(`/eskwela/payments/${id}`, { method: 'PATCH', body: b }),
  saveGrades: b => api('/eskwela/grades', { method: 'PUT', body: b }), saveAttendance: b => api('/eskwela/attendance', { method: 'PUT', body: b }),
  addNotice: b => api('/eskwela/notices', { method: 'POST', body: b }), delNotice: id => api(`/eskwela/notices/${id}`, { method: 'DELETE' }),
};
async function act(name, ...args) {
  if (LIVE) return LIVE_ROUTES[name](...args);
  A[name](...args);
  if (!demoSave(D)) throw new Error('Demo storage is full. Reset the demo.');
  return demoState();
}
function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = `toast show${bad ? ' bad' : ''}`; clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 3200); }
async function run(fn, errEl, okMsg) {
  try { if (errEl) errEl.textContent = ''; const r = await fn(); if (r && r.school) { S = r; derive(); render(); } if (okMsg) toast(okMsg); return r || true; }
  catch (e) { if (e.status === 401 && LIVE) { showAuth(); return null; } if (errEl) errEl.textContent = e.message; else toast(e.message, true); return null; }
}
const full = () => S.school.plan === 'full';
const lvlOf = id => S.levels.find(l => l.id === id);
const stOf = id => S.students.find(s => s.id === id);
function derive() {
  acc = new Map();
  const today = new Date();
  const byS = new Map(); S.charges.forEach(c => (byS.get(c.studentId) || byS.set(c.studentId, { c: [], p: [] }).get(c.studentId)).c.push(c));
  S.payments.forEach(p => (byS.get(p.studentId) || byS.set(p.studentId, { c: [], p: [] }).get(p.studentId)).p.push(p));
  S.students.forEach(s => { const x = byS.get(s.id) || { c: [], p: [] }; acc.set(s.id, ledger(x.c, x.p, today)); });
}
const parentLink = s => (LIVE ? new URL(`parent.html?p=${encodeURIComponent(s.token)}`, location.href).href : new URL(`parent.html?demo=${encodeURIComponent(s.id)}`, location.href).href);

/* ---------- shell ---------- */
const initials = n => String(n || 'RZ').split(/\s+/).filter(w => /^[A-Z]/.test(w)).slice(0, 3).map(w => w[0]).join('') || 'RZ';
function renderShell() {
  $('#railSeal').textContent = initials(S.school.name);
  $('#railSchool').textContent = S.school.name;
  $('#railSy').textContent = S.school.schoolYear ? `School year ${S.school.schoolYear}` : 'Set the school year in settings';
  $('#railPlan').textContent = `RZ Eskwela ${full() ? 'Full' : 'Plus'} plan`;
  $('#publicLink').href = LIVE ? new URL(`index.html?school=${encodeURIComponent(S.school.slug)}`, location.href).href : 'index.html';
  $$('[data-full]').forEach(n => { n.hidden = full(); });
  const apps = S.students.filter(s => s.status === 'applicant').length;
  $('#cApplicants').textContent = apps || '';
  $('#cPending').textContent = S.payments.filter(p => p.status === 'pending').length || '';
  $$('.plan-preview button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.plan === S.school.plan)));
  document.title = `${S.school.name} — school office`;
}
function lvlCell(levelId, section) {
  const l = lvlOf(levelId);
  return el('span', { class: 'lvl' }, hoodMark(el, l?.hood), `${l?.name || '—'}${section ? ` · ${section}` : ''}`);
}
/* Destructive actions confirm on the page: the first press arms the button (solid red, new wording), the second acts. It disarms after 6 s or when focus leaves. */
const disarm = b => { if (!b.dataset.armed) return; clearTimeout(b._t); delete b.dataset.armed; b.textContent = b.dataset.text; b.classList.remove('armed'); };
const arm = (label, fn) => e => {
  const b = e.currentTarget;
  if (b.dataset.armed) { disarm(b); fn(); return; }
  b.dataset.armed = '1'; b.dataset.text = b.textContent; b.textContent = label; b.classList.add('armed');
  b._t = setTimeout(() => disarm(b), 6000); b.addEventListener('blur', () => disarm(b), { once: true });
};
const xIcon = () => {
  const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); const path = document.createElementNS(ns, 'path');
  [['viewBox', '0 0 14 14'], ['width', '14'], ['height', '14'], ['aria-hidden', 'true'], ['focusable', 'false']].forEach(([k, v]) => svg.setAttribute(k, v));
  [['d', 'M3 3l8 8M11 3l-8 8'], ['stroke', 'currentColor'], ['stroke-width', '1.5'], ['stroke-linecap', 'round'], ['fill', 'none']].forEach(([k, v]) => path.setAttribute(k, v));
  svg.append(path); return svg;
};
/* Confirming a parent payment asks for the official receipt number in the row itself. */
function confirmInRow(cell, p) {
  const restore = [...cell.childNodes];
  const or = el('input', { class: 'ctl or', maxlength: '30', placeholder: 'OR number', 'aria-label': 'Official receipt number (optional)' });
  const ok = el('button', { type: 'button', class: 'btn primary small', onclick: () => run(() => act('setPayment', p.id, { status: 'confirmed', receiptNo: or.value.trim().slice(0, 30) }), null, `Payment of ${peso(p.amount)} confirmed.`) }, 'Confirm payment');
  const cancel = el('button', { type: 'button', class: 'linkbtn', onclick: () => cell.replaceChildren(...restore) }, 'Cancel');
  cell.replaceChildren(el('div', { class: 'row end confirm-row' }, or, ok, cancel));
  or.addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); if (e.key === 'Escape') cancel.click(); });
  or.focus();
}
const levelOptions = (all, sel) => [...(all ? [el('option', { value: '' }, all)] : []), ...S.levels.map(l => el('option', { value: l.id, selected: l.id === sel }, l.name))];

/* ---------- today ---------- */
function renderToday() {
  $('#todayDate').textContent = `${longDate(S.today)} · School year ${S.school.schoolYear || '—'}`;
  const enrolled = S.students.filter(s => s.status === 'enrolled');
  const month = S.today.slice(0, 7);
  const collected = S.payments.filter(p => p.status === 'confirmed' && p.paidOn.startsWith(month)).reduce((s, p) => s + p.amount, 0);
  const recv = enrolled.reduce((s, x) => s + Math.max(0, acc.get(x.id).balance), 0);
  const late = enrolled.filter(x => acc.get(x.id).overdue > 0);
  const overdue = late.reduce((s, x) => s + acc.get(x.id).overdue, 0);
  const fig = (k, v, sub, cls) => el('div', { class: cls || '' }, el('dt', {}, k), el('dd', {}, v, sub ? el('small', {}, sub) : null));
  $('#figs').replaceChildren(
    fig('Enrolled', String(enrolled.length), `${S.students.filter(s => s.status === 'applicant').length} applications waiting`),
    fig('Collected this month', pesoShort(collected), new Date(S.today).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })),
    fig('Receivable', pesoShort(recv), 'Balance of all enrolled accounts'),
    fig('Past due', pesoShort(overdue), `${late.length} account${late.length === 1 ? '' : 's'}`, overdue ? 'warn' : ''));
  const apps = S.students.filter(s => s.status === 'applicant').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  $('#appsBody').replaceChildren(...(apps.length ? apps.map(s => el('tr', {},
    el('td', {}, el('a', { class: 'name', href: `#student/${s.id}` }, fullName(s)), el('span', { class: 'sub' }, s.guardian ? `${s.guardian} · ${s.mobile}` : s.mobile), el('span', { class: 'sub show-s' }, lvlCell(s.levelId))),
    el('td', { class: 'hide-s' }, lvlCell(s.levelId)), el('td', { class: 'hide-s' }, shortDate(s.createdAt.slice(0, 10))),
    el('td', { class: 'num' }, el('div', { class: 'row end' }, el('button', { type: 'button', class: 'btn primary small', onclick: () => run(() => act('enrol', s.id), null, `${displayName(s)} is enrolled. The fee schedule was created.`) }, 'Approve'),
      el('button', { type: 'button', class: 'btn small', onclick: arm('Confirm decline', () => run(() => act('editStudent', s.id, { status: 'declined' }), null, 'Application declined.')) }, 'Decline'))))) : [el('tr', { class: 'empty-row' }, el('td', { colspan: '4' }, S.school.enrolOpen ? 'No applications waiting. Families apply from your school page.' : 'Online enrolment is closed in School settings.'))]));
  $('#lateBody').replaceChildren(...(late.length ? late.sort((a, b) => acc.get(b.id).overdue - acc.get(a.id).overdue).slice(0, 12).map(s => {
    const a = acc.get(s.id);
    return el('tr', {},
      el('td', {}, el('a', { class: 'name', href: `#student/${s.id}` }, fullName(s)), el('span', { class: 'sub' }, lvlOf(s.levelId)?.name || '')),
      el('td', { class: 'num' }, peso(a.overdue)), el('td', { class: 'num' }, String(a.lateDays)),
      el('td', { class: 'num' }, el('div', { class: 'row end' }, el('button', { type: 'button', class: 'btn primary small', onclick: () => openPay(s) }, 'Record payment'), el('button', { type: 'button', class: 'btn small', onclick: () => copyReminder(s) }, 'Copy reminder'))));
  }) : [el('tr', { class: 'empty-row' }, el('td', { colspan: '4' }, 'No accounts are past due.'))]));
  const pend = S.payments.filter(p => p.status === 'pending');
  $('#verifyBody').replaceChildren(...(pend.length ? pend.map(p => {
    const s = stOf(p.studentId);
    return el('tr', {},
      el('td', {}, s ? el('a', { class: 'name', href: `#student/${s.id}` }, fullName(s)) : '—'), el('td', {}, longDate(p.paidOn)), el('td', {}, `${p.method} · ${p.reference}`), el('td', { class: 'num' }, peso(p.amount)),
      el('td', { class: 'num' }, el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn primary small', onclick: e => confirmInRow(e.currentTarget.closest('td'), p) }, 'Confirm'),
        el('button', { type: 'button', class: 'btn danger small', title: 'Only if it is not in your account', onclick: arm('Confirm reject', () => run(() => act('setPayment', p.id, { status: 'rejected' }), null, 'Payment rejected.')) }, 'Reject'))));
  }) : [el('tr', { class: 'empty-row' }, el('td', { colspan: '5' }, 'Nothing to verify.'))]));
}
function copyReminder(s) {
  const a = acc.get(s.id);
  const msg = reminder({ school: S.school.name, student: displayName(s), guardian: s.guardian, balance: a.balance, overdue: a.overdue, lateDays: a.lateDays, link: parentLink(s), gcash: S.school.gcash });
  copy(msg).then(ok => toast(ok ? `Reminder for ${displayName(s)} copied. Paste it in a text or Messenger.` : 'Could not copy.', !ok));
}

/* ---------- students ---------- */
function renderStudents() {
  $('#sLevel').replaceChildren(...levelOptions('All grade levels', ui.level));
  $$('#sStatus button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === ui.status)));
  const q = ui.q.trim().toLowerCase();
  const list = S.students.filter(s => (ui.status === 'all' || s.status === ui.status) && (!ui.level || s.levelId === ui.level) && (!q || `${s.lastName} ${s.firstName} ${s.middleName} ${s.ref} ${s.lrn}`.toLowerCase().includes(q)))
    .sort((a, b) => (lvlOf(a.levelId)?.sort ?? 99) - (lvlOf(b.levelId)?.sort ?? 99) || a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  $('#studentsSub').textContent = `${S.students.filter(s => s.status === 'enrolled').length} enrolled · ${S.students.filter(s => s.status === 'applicant').length} applications`;
  $('#studentsBody').replaceChildren(...(list.length ? list.map(s => {
    const a = acc.get(s.id);
    const tr = el('tr', { class: 'link', tabindex: '0', onclick: () => { location.hash = `student/${s.id}`; }, onkeydown: e => { if (e.key === 'Enter') location.hash = `student/${s.id}`; } },
      el('td', {}, el('span', { class: 'name' }, fullName(s)), el('span', { class: 'sub' }, `No. ${s.ref}${s.lrn ? ` · LRN ${s.lrn}` : ''}`)),
      el('td', {}, lvlCell(s.levelId, s.section)),
      el('td', {}, s.guardian || '—', el('span', { class: 'sub' }, s.mobile || '')),
      el('td', { class: 'num' }, s.status === 'enrolled' ? peso(a.balance) : '—', a.overdue > 0 ? el('span', { class: 'sub' }, el('span', { class: 'stamp late' }, `Late ${a.lateDays}d`)) : null),
      el('td', {}, el('span', { class: `stamp ${s.status === 'enrolled' ? (a.balance <= 0 ? 'paid' : 'open') : s.status}` }, s.status === 'enrolled' ? (a.balance <= 0 ? 'Paid in full' : 'Enrolled') : s.status === 'applicant' ? 'Applicant' : s.status)));
    return tr;
  }) : [el('tr', { class: 'empty-row' }, el('td', { colspan: '5' }, ui.q ? 'No student matches your search.' : 'No students here yet.'))]));
}
$('#sSearch').addEventListener('input', e => { ui.q = e.target.value; renderStudents(); });
$('#sLevel').addEventListener('change', e => { ui.level = e.target.value; renderStudents(); });
$$('#sStatus button').forEach(b => b.addEventListener('click', () => { ui.status = b.dataset.v; renderStudents(); }));
$('#addStudentBtn').addEventListener('click', () => { const f = $('#addStudentForm'); f.hidden = false; f.elements.levelId.replaceChildren(...levelOptions(null, ui.level)); f.elements.lastName.focus(); });
$('#addStudentCancel').addEventListener('click', () => { $('#addStudentForm').hidden = true; });
$('#addStudentForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements;
  if (!S.levels.length) { $('.err', e.target).textContent = 'Add a grade level in School settings first.'; return; }
  const b = { lastName: f.lastName.value.trim(), firstName: f.firstName.value.trim(), middleName: f.middleName.value.trim(), levelId: f.levelId.value, section: f.section.value.trim(), lrn: f.lrn.value.trim(), guardian: f.guardian.value.trim(), mobile: f.mobile.value.trim(), discount: Number(f.discount.value) || 0, enrol: f.enrol.checked };
  const r = await run(() => act('addStudent', b), $('.err', e.target), `${b.firstName} ${b.lastName} was added.`);
  if (r) { e.target.reset(); e.target.hidden = true; }
});

/* ---------- one student ---------- */
let current = null;
function renderStudent(id) {
  const s = stOf(id); if (!s) { location.hash = 'students'; return; }
  current = s; const a = acc.get(s.id); const l = lvlOf(s.levelId);
  $('#h-student').textContent = displayName(s);
  $('#stSub').replaceChildren(lvlCell(s.levelId, s.section), ` · No. ${s.ref}${s.lrn ? ` · LRN ${s.lrn}` : ''} · `, el('span', { class: `stamp ${s.status === 'enrolled' ? 'open' : s.status}` }, s.status));
  const actions = [];
  if (s.status === 'applicant') actions.push(el('button', { type: 'button', class: 'btn primary', onclick: () => run(() => act('enrol', s.id), null, `${displayName(s)} is enrolled.`) }, 'Approve enrolment'));
  if (s.status === 'enrolled') actions.push(el('button', { type: 'button', class: 'btn primary', onclick: () => openPay(s) }, 'Record payment'));
  actions.push(el('button', { type: 'button', class: 'btn', onclick: () => copyReminder(s), disabled: a.balance <= 0 }, 'Copy reminder'),
    el('button', { type: 'button', class: 'btn', onclick: async () => toast((await copy(parentLink(s))) ? 'Parent portal link copied. Send it to the family privately.' : 'Could not copy.') }, 'Copy parent link'),
    el('a', { class: 'btn', href: parentLink(s), target: '_blank', rel: 'noopener' }, 'Open parent portal'));
  $('#stActions').replaceChildren(...actions);
  const view = { school: S.school, student: s, levelName: l?.name || '', hoodKey: l?.hood };
  const st = statement(el, { ...view, account: a, payments: S.payments.filter(p => p.studentId === s.id && p.status !== 'rejected').map(p => p) });
  $('#stStatement').replaceChildren(st, el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn small', onclick: () => printDoc(st) }, 'Print statement')));
  $('#chargeForm').hidden = s.status !== 'enrolled';
  const pays = S.payments.filter(p => p.studentId === s.id);
  $('#stPayments').replaceChildren(...(pays.length ? pays.map(p => el('tr', {},
    el('td', {}, longDate(p.paidOn)), el('td', {}, [p.receiptNo, `${p.method}${p.reference ? ` ${p.reference}` : ''}`].filter(Boolean).join(' · ')),
    el('td', { class: 'num' }, peso(p.amount)), el('td', {}, el('span', { class: `stamp ${p.status === 'confirmed' ? 'paid' : p.status}` }, p.status === 'confirmed' ? 'Received' : p.status === 'pending' ? 'To verify' : p.status)),
    el('td', { class: 'num' }, p.status === 'confirmed' ? el('button', { type: 'button', class: 'linkbtn danger', title: 'It stays on record, stamped void', onclick: arm('Confirm void', () => run(() => act('setPayment', p.id, { status: 'void' }), null, 'Payment voided.')) }, 'Void') : ''))) : [el('tr', { class: 'empty-row' }, el('td', { colspan: '5' }, 'No payments yet.'))]));
  const att = full() ? (() => { const x = S.attendance.filter(r => r.studentId === s.id); return { present: x.filter(r => r.mark === 'P').length, late: x.filter(r => r.mark === 'L').length, absent: x.filter(r => r.mark === 'A').length, excused: x.filter(r => r.mark === 'E').length }; })() : null;
  const rc = reportCard(el, { ...view, subjects: l?.subjects || [], grades: S.grades.filter(g => g.studentId === s.id), released: QUARTERS, officeCopy: S.school.released, attendance: att });
  $('#stReport').replaceChildren(rc, el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn small', onclick: () => printDoc(rc) }, 'Print report card'), el('p', { class: 'fine' }, 'The office copy shows every quarter entered. Parents see released quarters only.')));
  const f = $('#stForm').elements;
  if (!$('#stForm').contains(document.activeElement)) {
    ['lastName', 'firstName', 'middleName', 'lrn', 'birthdate', 'sex', 'section', 'guardian', 'relation', 'mobile', 'email', 'address', 'previousSchool', 'discount', 'discountNote'].forEach(k => { f[k].value = s[k] ?? ''; });
    f.levelId.replaceChildren(...levelOptions(null, s.levelId));
  }
  $('#stWithdraw').textContent = s.status === 'withdrawn' ? 'Return to applicant list' : 'Withdraw student';
  $('#stWithdraw').hidden = s.status === 'applicant' || s.status === 'declined';
  $('#stDelete').hidden = s.status !== 'applicant' && s.status !== 'declined';
}
function openPay(s) {
  const f = $('#payForm'); const a = acc.get(s.id);
  f.hidden = false; f.elements.amount.value = a.next ? a.next.left : ''; f.elements.paidOn.value = S.today; f.elements.receiptNo.value = ''; f.elements.reference.value = ''; f.elements.note.value = '';
  $('.err', f).textContent = ''; f.scrollIntoView({ block: 'nearest' }); f.elements.amount.focus();
}
$('#payCancel').addEventListener('click', () => { $('#payForm').hidden = true; });
$('#payForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements;
  const b = { studentId: current.id, amount: Number(f.amount.value), paidOn: f.paidOn.value, method: f.method.value, receiptNo: f.receiptNo.value.trim(), reference: f.reference.value.trim(), note: f.note.value.trim() };
  const r = await run(() => act('addPayment', b), $('.err', e.target), `${peso(b.amount)} recorded for ${displayName(current)}.`);
  if (r) e.target.hidden = true;
});
$('#chargeForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements;
  const r = await run(() => act('addCharge', { studentId: current.id, label: f.label.value.trim(), amount: Number(f.amount.value), due: f.due.value }), $('#chargeErr'), 'Charge added to the account.');
  if (r) e.target.reset();
});
$('#stForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements;
  const b = Object.fromEntries(['lastName', 'firstName', 'middleName', 'lrn', 'birthdate', 'sex', 'section', 'guardian', 'relation', 'mobile', 'email', 'address', 'previousSchool', 'discountNote'].map(k => [k, f[k].value.trim()]));
  b.discount = Number(f.discount.value) || 0; b.levelId = f.levelId.value;
  document.activeElement?.blur();
  await run(() => act('editStudent', current.id, b), $('.err', e.target), 'Student record saved.');
});
const doWithdraw = () => {
  const back = current.status === 'withdrawn';
  run(() => act('editStudent', current.id, { status: back ? 'applicant' : 'withdrawn' }), null, back ? 'Moved back to applicants.' : 'Student withdrawn.');
};
const withdrawArmed = arm('Confirm withdraw', doWithdraw);
$('#stWithdraw').addEventListener('click', e => (current.status === 'withdrawn' ? doWithdraw() : withdrawArmed(e)));
$('#stDelete').addEventListener('click', arm('Confirm delete — cannot be undone', async () => {
  const r = await run(() => act('delStudent', current.id), null, 'Application deleted.');
  if (r) location.hash = 'students';
}));

/* ---------- fees and journal ---------- */
function renderFees() {
  if (!S.levels.some(l => l.id === ui.feeLevel)) ui.feeLevel = S.levels[0]?.id || '';
  $('#feeTabs').replaceChildren(...S.levels.map(l => el('button', { type: 'button', role: 'tab', 'aria-selected': String(l.id === ui.feeLevel), onclick: () => { ui.feeLevel = l.id; renderFees(); } }, hoodMark(el, l.hood), l.name)));
  const l = lvlOf(ui.feeLevel);
  $('#feeForm').hidden = !l;
  if (l && !$('#feeForm').contains(document.activeElement)) {
    $('#feeItems').replaceChildren(...(l.fees.items || []).map(feeRow));
    $('#feeSched').replaceChildren(...(l.fees.schedule || []).map(schedRow));
  }
  feeTotal();
  // journal
  const months = [...new Set(S.payments.map(p => p.paidOn.slice(0, 7)))].sort().reverse();
  if (!ui.jMonth || !months.includes(ui.jMonth)) ui.jMonth = months[0] || S.today.slice(0, 7);
  $('#jMonth').replaceChildren(...(months.length ? months : [ui.jMonth]).map(m => el('option', { value: m, selected: m === ui.jMonth }, new Date(`${m}-01T00:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' }))));
  const rows = journal();
  $('#jTotal').textContent = `${rows.filter(p => p.status === 'confirmed').length} received · ${peso(rows.filter(p => p.status === 'confirmed').reduce((s, p) => s + p.amount, 0))}`;
  $('#journalBody').replaceChildren(...(rows.length ? rows.map(p => { const s = stOf(p.studentId); return el('tr', {}, el('td', { class: 'nowrap hide-s' }, shortDate(p.paidOn)), el('td', { class: 'hide-s' }, p.receiptNo || '—'), el('td', {}, s ? el('a', { class: 'name', href: `#student/${s.id}` }, fullName(s)) : '—', el('span', { class: 'sub show-s' }, [shortDate(p.paidOn), p.receiptNo, p.method].filter(Boolean).join(' · '))), el('td', { class: 'hide-s' }, `${p.method}${p.reference ? ` · ${p.reference}` : ''}`), el('td', { class: 'num' }, peso(p.amount)), el('td', {}, el('span', { class: `stamp ${p.status === 'confirmed' ? 'paid' : p.status}` }, p.status === 'confirmed' ? 'Received' : p.status === 'pending' ? 'To verify' : p.status))); }) : [el('tr', { class: 'empty-row' }, el('td', { colspan: '6' }, 'No payments this month.'))]));
}
const journal = () => S.payments.filter(p => p.paidOn.startsWith(ui.jMonth)).sort((a, b) => a.paidOn.localeCompare(b.paidOn) || String(a.receiptNo).localeCompare(String(b.receiptNo)));
const feeRow = i => el('tr', {},
  el('td', {}, el('input', { class: 'ctl', name: 'label', value: i?.label || '', maxlength: '60', 'aria-label': 'Fee item', oninput: feeTotal })),
  el('td', { class: 'num' }, el('input', { class: 'ctl amt', name: 'amount', type: 'number', min: '0', step: '0.01', value: i?.amount ?? '', inputmode: 'decimal', 'aria-label': 'Amount', oninput: feeTotal })),
  el('td', {}, el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'discountable', checked: !!i?.discountable, onchange: feeTotal, 'aria-label': 'Discount applies to this item' }), el('span', { class: 'show-s', 'aria-hidden': 'true' }, 'Discount'))),
  el('td', { class: 'num' }, el('button', { type: 'button', class: 'x', 'aria-label': 'Remove fee item', onclick: e => { e.currentTarget.closest('tr').remove(); feeTotal(); } }, xIcon())));
const schedRow = x => el('tr', {},
  el('td', {}, el('input', { class: 'ctl', name: 'label', value: x?.label || '', maxlength: '60', 'aria-label': 'Instalment' })),
  el('td', {}, el('input', { class: 'ctl', name: 'due', type: 'date', value: x?.due || '', 'aria-label': 'Due date' })),
  el('td', { class: 'num' }, el('input', { class: 'ctl pct', name: 'pct', type: 'number', min: '0', max: '100', step: '0.01', value: x?.pct ?? '', inputmode: 'decimal', 'aria-label': 'Share in percent', oninput: feeTotal })),
  el('td', { class: 'num' }, el('button', { type: 'button', class: 'x', 'aria-label': 'Remove instalment', onclick: e => { e.currentTarget.closest('tr').remove(); feeTotal(); } }, xIcon())));
function readFees() {
  const items = $$('#feeItems tr').map(tr => ({ label: $('[name=label]', tr).value.trim(), amount: Number($('[name=amount]', tr).value) || 0, discountable: $('[name=discountable]', tr).checked })).filter(i => i.label && i.amount > 0);
  const schedule = $$('#feeSched tr').map(tr => ({ label: $('[name=label]', tr).value.trim(), due: $('[name=due]', tr).value, pct: Number($('[name=pct]', tr).value) || 0 })).filter(s => s.label && s.pct > 0);
  return { items, schedule };
}
function feeTotal() {
  const f = readFees(); const t = feeTotals(f, 0); const pct = round(f.schedule.reduce((s, x) => s + x.pct, 0));
  const bad = f.schedule.length && Math.abs(pct - 100) > 0.01;
  const box = $('#feeTotal'); box.className = `fee-total${bad ? ' bad' : ''}`;
  box.textContent = `Total for the school year ${peso(t.gross)} · ${f.schedule.length} instalment${f.schedule.length === 1 ? '' : 's'} adding up to ${pct}%${bad ? ' (must be 100%)' : ''}`;
}
$('#addFeeItem').addEventListener('click', () => { $('#feeItems').append(feeRow(null)); $('#feeItems tr:last-child input').focus(); });
$('#addSched').addEventListener('click', () => { $('#feeSched').append(schedRow(null)); $('#feeSched tr:last-child input').focus(); });
$('#feeForm').addEventListener('submit', async e => { e.preventDefault(); document.activeElement?.blur(); await run(() => act('editLevel', ui.feeLevel, { fees: readFees() }), $('.err', e.target), 'Fee schedule saved. It applies to students you enrol from now on.'); });
$('#jMonth').addEventListener('change', e => { ui.jMonth = e.target.value; renderFees(); });
$('#jCsv').addEventListener('click', () => {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Date', 'Receipt no.', 'Student no.', 'Student', 'Level', 'Method', 'Reference', 'Amount', 'Status'].map(q).join(',')]
    .concat(journal().map(p => { const s = stOf(p.studentId); return [p.paidOn, p.receiptNo, s?.ref, s ? fullName(s) : '', lvlOf(s?.levelId)?.name, p.method, p.reference, p.amount.toFixed(2), p.status].map(q).join(','); }));
  window.RZ.download(`payments-${ui.jMonth}.csv`, lines.join('\n'), 'text/csv');
});

/* ---------- grades ---------- */
function renderGrades() {
  if (!S.levels.some(l => l.id === ui.gLevel)) ui.gLevel = S.levels[0]?.id || '';
  const l = lvlOf(ui.gLevel);
  $('#gLevel').replaceChildren(...levelOptions(null, ui.gLevel));
  if (!l?.subjects.includes(ui.gSubject)) ui.gSubject = l?.subjects[0] || '';
  $('#gSubject').replaceChildren(...(l?.subjects.length ? l.subjects.map(s => el('option', { value: s, selected: s === ui.gSubject }, s)) : [el('option', { value: '' }, 'Add learning areas in School settings')]));
  $$('#gQuarter button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.q) === ui.gQuarter)));
  const kids = S.students.filter(s => s.levelId === ui.gLevel && s.status === 'enrolled').sort((a, b) => a.lastName.localeCompare(b.lastName));
  const got = new Map(S.grades.filter(g => g.subject === ui.gSubject && g.quarter === ui.gQuarter).map(g => [g.studentId, g.grade]));
  $('#gradeBody').replaceChildren(...(kids.length && ui.gSubject ? kids.map(s => {
    const d = el('td', { class: 'desc hide-s' }, descriptor(got.get(s.id))); const d2 = el('span', { class: 'sub show-s' }, descriptor(got.get(s.id)));
    const inp = el('input', { class: 'grade', type: 'number', min: '60', max: '100', step: '1', inputmode: 'numeric', value: got.has(s.id) ? String(got.get(s.id)) : '', 'aria-label': `Grade of ${displayName(s)}`, dataset: { id: s.id } });
    inp.addEventListener('input', () => { const v = Number(inp.value); const bad = inp.value !== '' && (!(v >= 60 && v <= 100)); inp.classList.toggle('bad', bad); d.textContent = inp.value === '' ? '' : bad ? 'Enter 60 to 100' : descriptor(v); d2.textContent = d.textContent; });
    return el('tr', {}, el('td', { class: 'name' }, el('span', { class: 'nowrap' }, fullName(s)), d2), el('td', { class: 'hide-s' }, s.section || '—'), el('td', { class: 'num' }, inp), d);
  }) : [el('tr', { class: 'empty-row' }, el('td', { colspan: '4' }, kids.length ? 'This grade level has no learning areas yet.' : 'No enrolled learners in this grade level.'))]));
  const filled = kids.filter(s => got.has(s.id)).length;
  $('#gradeInfo').textContent = kids.length ? `${filled} of ${kids.length} learners graded for ${ui.gSubject}, Q${ui.gQuarter}.` : '';
  $('#releaseBox').replaceChildren(...QUARTERS.map(n => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: S.school.released.includes(n), onchange: e => release(n, e.target.checked) }), `Quarter ${n}`)));
}
function release(n, on) {
  const r = new Set(S.school.released); on ? r.add(n) : r.delete(n);
  run(() => act('school', { ...schoolBody(), released: [...r].sort() }), null, on ? `Quarter ${n} grades are now visible to parents.` : `Quarter ${n} grades are hidden from parents.`);
}
$('#gLevel').addEventListener('change', e => { ui.gLevel = e.target.value; renderGrades(); });
$('#gSubject').addEventListener('change', e => { ui.gSubject = e.target.value; renderGrades(); });
$$('#gQuarter button').forEach(b => b.addEventListener('click', () => { ui.gQuarter = Number(b.dataset.q); renderGrades(); }));
$('#gradeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const entries = $$('#gradeBody input.grade').map(i => ({ studentId: i.dataset.id, grade: i.value === '' ? null : Number(i.value) }));
  if ($$('#gradeBody input.grade.bad').length) { $('.err', e.target).textContent = 'Grades must be between 60 and 100.'; return; }
  await run(() => act('saveGrades', { levelId: ui.gLevel, subject: ui.gSubject, quarter: ui.gQuarter, entries }), $('.err', e.target), `${ui.gSubject}, Q${ui.gQuarter} grades saved.`);
});

/* ---------- attendance (Full) ---------- */
function lockPanel(view, title, lines) {
  const box = $(`#v-${view} [data-locked]`); const body = $(`#v-${view} [data-unlocked]`);
  box.hidden = full(); body.hidden = !full();
  if (!full()) box.replaceChildren(el('h2', {}, title), el('p', { class: 'muted' }, 'Included in the RZ Eskwela Full plan.'), el('ul', {}, ...lines.map(x => el('li', {}, x))), el('a', { class: 'btn primary', href: TG, target: '_blank', rel: 'noopener' }, 'Ask RZ to upgrade'));
  return full();
}
function renderAttendance() {
  if (!lockPanel('attendance', 'Daily attendance', ['Mark each class present, late, absent or excused in a minute', 'Attendance totals printed on the report card', 'Parents see their child’s attendance in the portal'])) return;
  if (!ui.aDay) ui.aDay = S.today;
  if (!S.levels.some(l => l.id === ui.aLevel)) ui.aLevel = S.levels[0]?.id || '';
  $('#aDay').value = ui.aDay; $('#aDay').max = S.today;
  $('#aLevel').replaceChildren(...levelOptions(null, ui.aLevel));
  const kids = S.students.filter(s => s.levelId === ui.aLevel && s.status === 'enrolled').sort((a, b) => a.lastName.localeCompare(b.lastName));
  const day = new Map(S.attendance.filter(a => a.day === ui.aDay).map(a => [a.studentId, a.mark]));
  const days = [...new Set(S.attendance.map(a => a.day))].sort().reverse().slice(0, 14);
  $('#attBody').replaceChildren(...(kids.length ? kids.map(s => {
    const mark = day.get(s.id) || 'P';
    const mine = S.attendance.filter(a => a.studentId === s.id && days.includes(a.day));
    const seg = el('div', { class: 'mark-seg', role: 'radiogroup', 'aria-label': `Attendance of ${displayName(s)}` }, ...[['P', 'Present'], ['L', 'Late'], ['A', 'Absent'], ['E', 'Excused']].map(([v, t]) => el('label', { title: t }, el('input', { type: 'radio', name: `m-${s.id}`, value: v, checked: v === mark, 'aria-label': t, dataset: { id: s.id } }), el('span', {}, v))));
    const tally = mine.length ? `${mine.filter(a => a.mark === 'P' || a.mark === 'L').length} of ${mine.length}` : '—';
    return el('tr', {}, el('td', { class: 'name' }, el('span', { class: 'nowrap' }, fullName(s)), el('span', { class: 'sub show-s' }, `Present ${tally}, last 14 days`)), el('td', {}, seg), el('td', { class: 'num hide-s' }, tally));
  }) : [el('tr', { class: 'empty-row' }, el('td', { colspan: '3' }, 'No enrolled learners in this grade level.'))]));
}
$('#aDay').addEventListener('change', e => { ui.aDay = e.target.value; renderAttendance(); });
$('#aLevel').addEventListener('change', e => { ui.aLevel = e.target.value; renderAttendance(); });
$('#aAllPresent').addEventListener('click', () => $$('#attBody input[value="P"]').forEach(i => { i.checked = true; }));
$('#attForm').addEventListener('submit', async e => {
  e.preventDefault();
  const entries = $$('#attBody input:checked').map(i => ({ studentId: i.dataset.id, mark: i.value }));
  await run(() => act('saveAttendance', { day: ui.aDay, entries }), $('.err', e.target), `Attendance for ${longDate(ui.aDay)} saved.`);
});

/* ---------- announcements (Full) ---------- */
function renderNotices() {
  if (!lockPanel('notices', 'Announcements to parents', ['Post school-wide or per grade level', 'Shown to every family in the parent portal', 'No group chat needed for official notices'])) return;
  const f = $('#noticeForm').elements;
  if (!$('#noticeForm').contains(document.activeElement)) f.levelId.replaceChildren(el('option', { value: '' }, 'All families'), ...S.levels.map(l => el('option', { value: l.id }, `${l.name} families`)));
  $('#noticeList').replaceChildren(...(S.notices.length ? S.notices.map(n => el('li', { class: 'notice' },
    el('h3', {}, n.title), el('p', {}, n.body),
    el('div', { class: 'meta' }, el('span', {}, `${n.levelId ? `${lvlOf(n.levelId)?.name || 'One level'} families` : 'All families'} · ${longDate(n.createdAt.slice(0, 10))}`),
      el('button', { type: 'button', class: 'linkbtn danger', onclick: arm('Confirm delete', () => run(() => act('delNotice', n.id), null, 'Announcement deleted.')) }, 'Delete')))) : [el('li', { class: 'notice' }, el('p', {}, 'No announcements yet.'))]));
}
$('#noticeForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements;
  const r = await run(() => act('addNotice', { title: f.title.value.trim(), body: f.body.value.trim(), levelId: f.levelId.value }), $('.err', e.target), 'Announcement posted to the parent portal.');
  if (r) { f.title.value = ''; f.body.value = ''; }
});

/* ---------- settings ---------- */
const SCHOOL_FIELDS = ['name', 'motto', 'address', 'city', 'phone', 'email', 'principal', 'registrar', 'schoolYear', 'gcash'];
const schoolBody = () => ({ ...Object.fromEntries(SCHOOL_FIELDS.map(k => [k, S.school[k] || ''])), enrolOpen: S.school.enrolOpen, released: S.school.released });
function renderSettings() {
  const f = $('#schoolForm').elements;
  if (!$('#schoolForm').contains(document.activeElement)) { SCHOOL_FIELDS.forEach(k => { f[k].value = S.school[k] || ''; }); f.enrolOpen.checked = !!S.school.enrolOpen; }
  if ($('#levelList').contains(document.activeElement)) return;
  $('#levelList').replaceChildren(...S.levels.map(l => {
    const name = el('input', { class: 'ctl', value: l.name, maxlength: '40', 'aria-label': 'Grade level name' });
    const subs = el('textarea', { class: 'ctl', maxlength: '900', 'aria-label': `Learning areas of ${l.name}, one per line` }); subs.value = l.subjects.join('\n');
    const sw = el('div', { class: 'swatches', role: 'radiogroup', 'aria-label': `Hood colour of ${l.name}` }, ...HOOD_KEYS.map(k => { const span = el('span', {}); span.style.setProperty('--hood', HOODS[k].hex); return el('label', { title: HOODS[k].name }, el('input', { type: 'radio', name: `h-${l.id}`, value: k, checked: k === l.hood, 'aria-label': HOODS[k].name }), span); }));
    return el('li', { class: 'level' },
      el('label', { class: 'fld' }, 'Name', name),
      el('div', { class: 'fld' }, 'Hood colour', sw),
      el('label', { class: 'fld' }, 'Learning areas, one per line', subs),
      el('div', { class: 'stack' },
        el('button', { type: 'button', class: 'btn dark small', onclick: () => run(() => act('editLevel', l.id, { name: name.value.trim(), hood: $('input:checked', sw)?.value || l.hood, subjects: subs.value.split('\n').map(x => x.trim()).filter(Boolean) }), $('#levelErr'), `${name.value.trim()} saved.`) }, 'Save'),
        el('button', { type: 'button', class: 'btn danger small', onclick: arm(`Confirm remove ${l.name}`, () => run(() => act('delLevel', l.id), $('#levelErr'), 'Grade level removed.')) }, 'Remove')));
  }));
}
$('#schoolForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target.elements;
  const b = { ...Object.fromEntries(SCHOOL_FIELDS.map(k => [k, f[k].value.trim()])), enrolOpen: f.enrolOpen.checked, released: S.school.released };
  document.activeElement?.blur();
  await run(() => act('school', b), $('.err', e.target), 'School profile saved.');
});
$('#levelAdd').addEventListener('submit', async e => { e.preventDefault(); const n = e.target.elements.name.value.trim(); const r = await run(() => act('addLevel', { name: n }), $('#levelErr'), `${n} added. Set its fees in Fees and payments.`); if (r) e.target.reset(); });

/* ---------- router ---------- */
const VIEWS = ['today', 'students', 'student', 'fees', 'grades', 'attendance', 'notices', 'settings'];
function route() {
  const [v, id] = (location.hash.slice(1) || 'today').split('/');
  const view = VIEWS.includes(v) ? v : 'today';
  $$('.view').forEach(s => { s.hidden = s.id !== `v-${view}`; });
  $$('.rail-nav a').forEach(a => { if ((a.dataset.view === view) || (view === 'student' && a.dataset.view === 'students')) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  ({ today: renderToday, students: renderStudents, student: () => renderStudent(id), fees: renderFees, grades: renderGrades, attendance: renderAttendance, notices: renderNotices, settings: renderSettings })[view]();
  return view;
}
let lastView = '';
window.addEventListener('hashchange', () => { $('#payForm').hidden = true; const v = route(); if (v !== lastView) { $('#work').scrollTo?.(0, 0); window.scrollTo(0, 0); } lastView = v; });
function render() { renderShell(); lastView = route(); }

$$('.plan-preview button').forEach(b => b.addEventListener('click', () => { sessionStorage.setItem('rz-eskwela-preview', b.dataset.plan); S = demoState(); derive(); render(); }));

/* ---------- sign in ---------- */
function showAuth() { $('#authView').hidden = false; $('#appView').hidden = true; }
const tabs = [$('#tabLogin'), $('#tabSignup')];
tabs.forEach(t => t.addEventListener('click', () => tabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); $(`#${x.getAttribute('aria-controls')}`).hidden = !on; })));
const su = $('#signupForm').elements;
su.businessName.addEventListener('input', () => { if (!su.slug.dataset.touched) su.slug.value = su.businessName.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); });
su.slug.addEventListener('input', () => { su.slug.dataset.touched = '1'; });
async function auth(form, path, body) {
  const btn = $('button[type="submit"]', form); const err = $('.err', form); err.textContent = ''; btn.disabled = true;
  try { await api(path, { method: 'POST', body }); form.reset(); await boot(); } catch (ex) { err.textContent = ex.message; } finally { btn.disabled = false; }
}
$('#loginForm').addEventListener('submit', e => { e.preventDefault(); const f = e.target.elements; auth(e.target, '/auth/login', { email: f.email.value, password: f.password.value }); });
$('#signupForm').addEventListener('submit', e => { e.preventDefault(); auth(e.target, '/auth/signup', { businessName: su.businessName.value, slug: su.slug.value, email: su.email.value, password: su.password.value }); });
$('#logoutBtn').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); showAuth(); });

async function boot() {
  try {
    if (LIVE) { $('#strip').hidden = true; $('#logoutBtn').hidden = false; S = await api('/eskwela'); }
    else { D = demoLoad(); A = demoActions(D, demoPlan); S = demoState(); }
    derive();
    $('#authView').hidden = true; $('#appView').hidden = false;
    render();
  } catch (e) { if (e.status === 401) showAuth(); else toast(e.message, true); }
}
boot();
