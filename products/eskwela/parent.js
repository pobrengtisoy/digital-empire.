/* Parent portal: ?p=<token> from the RZ server, or ?demo=<student id> from the demo school in this browser. */
import { demoLoad, demoSave, parentViewFrom, peso, longDate, shortDate, hood, uid } from './common.js';
import { reportCard, statement, printDoc } from './docs.js';
import { isoDay } from './logic.mjs';

const { $, $$, el, copy } = window.RZ;
const q = new URLSearchParams(location.search);
const token = q.get('p'); const demoId = q.get('demo');
let V = null; let stDoc = null; let rcDoc = null;

const initials = n => String(n || 'RZ').split(/\s+/).filter(w => /^[A-Z]/.test(w)).slice(0, 3).map(w => w[0]).join('') || 'RZ';
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.className = 'toast show'; clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = 'toast'; }, 2800); }

function render() {
  const s = V.student; const sc = V.school; const a = V.account;
  document.title = `${s.firstName} ${s.lastName} — ${sc.name}`;
  $('#band').style.setProperty('--hood', hood(s.hood).hex);
  $('#pSeal').textContent = initials(sc.name); $('#pSchool').textContent = sc.name;
  $('#pSy').textContent = [sc.motto, sc.schoolYear ? `School year ${sc.schoolYear}` : ''].filter(Boolean).join(' · ');
  $('#pName').textContent = `${s.firstName} ${s.middleName ? `${s.middleName[0]}. ` : ''}${s.lastName}`;
  $('#pMeta').textContent = [`${s.level}${s.section ? ` · ${s.section}` : ''}`, `Student no. ${s.ref}`, s.status === 'enrolled' ? 'Enrolled' : s.status === 'applicant' ? 'Application received' : s.status].join(' · ');
  // balance
  const box = $('#balBox');
  box.className = `p-balance${a.overdue > 0 ? ' late' : a.balance <= 0 && a.billed > 0 ? ' clear' : ''}`;
  box.replaceChildren(
    el('div', {}, el('p', { class: 'p-label' }, 'Balance'), el('p', { class: 'p-amt' }, peso(Math.max(0, a.balance))),
      a.balance < 0 ? el('p', { class: 'fine' }, `Advance payment of ${peso(-a.balance)}`) : null),
    el('div', { class: 'p-next' },
      a.overdue > 0 ? [el('span', { class: 'stamp late' }, `Past due ${a.lateDays} day${a.lateDays === 1 ? '' : 's'}`), el('p', {}, `${peso(a.overdue)} is past due.`)]
        : a.next ? [el('p', { class: 'p-label' }, 'Next payment'), el('p', {}, `${peso(a.next.left)} · ${a.next.label}`), el('p', { class: 'fine' }, a.next.due ? `Due ${longDate(a.next.due)}` : '')]
          : a.billed > 0 ? [el('span', { class: 'stamp paid' }, 'Paid in full')] : [el('p', { class: 'fine' }, 'Fees appear here once enrolment is approved.')],
      a.pending > 0 ? el('p', { class: 'fine' }, `${peso(a.pending)} you sent is waiting for the office to verify.`) : null));
  const view = { school: sc, student: s, levelName: s.level, hoodKey: s.hood };
  stDoc = statement(el, { ...view, account: a, payments: V.payments });
  $('#stmt').replaceChildren(stDoc);
  // pay
  $('#payLine').replaceChildren(sc.gcash ? 'Send your payment to ' : 'Pay at the school cashier, or send your payment and ', sc.gcash ? el('b', {}, sc.gcash) : '', sc.gcash ? ' ' : '', sc.gcash ? el('button', { type: 'button', class: 'linkbtn', onclick: async () => toast((await copy(sc.gcash.replace(/\s+/g, ''))) ? 'Number copied.' : sc.gcash) }, 'Copy number') : '', sc.gcash ? ', then tell the office here.' : 'tell the office here.');
  $('#pay').hidden = s.status !== 'enrolled' || a.billed <= 0;
  const f = $('#payForm').elements;
  const toPay = Math.round(((a.overdue > 0 ? a.overdue : a.next?.left || 0)) * 100) / 100;
  if (!f.amount.value && toPay > 0 && a.balance - a.pending > 0) f.amount.value = toPay;
  // report card
  const att = V.attendance ? { present: V.attendance.filter(x => x.mark === 'P').length, late: V.attendance.filter(x => x.mark === 'L').length, absent: V.attendance.filter(x => x.mark === 'A').length, excused: V.attendance.filter(x => x.mark === 'E').length } : null;
  rcDoc = reportCard(el, { ...view, subjects: V.subjects, grades: V.grades, released: V.released, attendance: att });
  $('#rc').replaceChildren(rcDoc);
  // full plan
  const full = sc.plan === 'full';
  $$('[data-full]').forEach(n => { n.hidden = !full; });
  if (full) {
    const recent = V.attendance.slice(0, 20);
    const sum = (k, v) => el('div', {}, el('dt', {}, k), el('dd', {}, String(v)));
    $('#attSum').replaceChildren(sum('Present', att.present), sum('Late', att.late), sum('Absent', att.absent), sum('Excused', att.excused));
    const word = { P: 'Present', L: 'Late', A: 'Absent', E: 'Excused' };
    $('#attDays').replaceChildren(...(recent.length ? recent.map(x => el('li', { class: `m-${x.mark}` }, el('span', {}, shortDate(x.day)), el('b', {}, word[x.mark]))) : [el('li', {}, el('span', {}, 'No attendance recorded yet.'))]));
    $('#notices').replaceChildren(...(V.notices.length ? V.notices.map(n => el('li', {}, el('h3', {}, n.title), el('p', {}, n.body), el('p', { class: 'fine' }, longDate(n.createdAt.slice(0, 10))))) : [el('li', {}, el('p', { class: 'fine' }, 'No announcements.'))]));
  }
  $('#pFoot').textContent = [sc.name, [sc.address, sc.city].filter(Boolean).join(', '), sc.phone].filter(Boolean).join(' · ');
  $('#portal').hidden = false;
}
function missing(msg) { $('#missing').hidden = false; if (msg) $('#missingText').textContent = msg; }

async function load() {
  if (demoId) { $('#strip').hidden = false; const d = demoLoad(); V = parentViewFrom(d, demoId); return V ? render() : missing('This demo student is not on this device. Open it from the RZ Eskwela demo office.'); }
  if (!token || !/^[a-f0-9]{48}$/.test(token)) return missing();
  try {
    const res = await fetch(`/api/public/eskwela/parent/${token}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return missing(data.error);
    V = data; render();
  } catch { missing('Could not load the portal. Check your connection and try again.'); }
}

$('#printStmt').addEventListener('click', () => printDoc(stDoc));
$('#printRc').addEventListener('click', () => printDoc(rcDoc));
$('#payForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target.elements; const err = $('#payErr'); const btn = $('#paySend');
  err.textContent = ''; $('#payOk').textContent = '';
  const body = { amount: Number(f.amount.value), method: f.method.value, reference: f.reference.value.replace(/\s+/g, '').toUpperCase() };
  if (!(body.amount >= 1)) { err.textContent = 'Enter the amount you sent.'; f.amount.focus(); return; }
  if (!/^[A-Z0-9-]{4,40}$/.test(body.reference)) { err.textContent = 'Enter the reference number from your receipt.'; f.reference.focus(); return; }
  btn.disabled = true;
  try {
    if (demoId) {
      const d = demoLoad();
      d.payments.unshift({ id: uid(), studentId: demoId, amount: body.amount, paidOn: isoDay(new Date()), method: body.method, reference: body.reference, receiptNo: '', note: 'Sent from the parent portal', status: 'pending', createdAt: new Date().toISOString() });
      demoSave(d); V = parentViewFrom(d, demoId);
    } else {
      const res = await fetch(`/api/public/eskwela/parent/${token}/payments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not send. Please try again.');
      V = data;
    }
    f.reference.value = ''; f.amount.value = '';
    render();
    $('#payOk').textContent = 'Sent. The school office will verify it and issue your official receipt.';
  } catch (ex) { err.textContent = ex.message; }
  finally { btn.disabled = false; }
});

load();
