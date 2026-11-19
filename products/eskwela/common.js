/* RZ Eskwela front end: formatting, the demo school (kept in this browser) and the demo's office actions. */
import { HOODS, HOOD_KEYS, buildCharges, ledger, round, isoDay, isDate, QUARTERS } from './logic.mjs';

export const DEMO_KEY = 'rz-eskwela-demo-v1';
const pesoFmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 });
const pesoShortFmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
export const peso = n => pesoFmt.format(Number(n) || 0);
export const pesoShort = n => pesoShortFmt.format(Number(n) || 0);
export const hood = key => HOODS[key] || HOODS.slate;
export const fullName = s => `${s.lastName}, ${s.firstName}${s.middleName ? ` ${s.middleName[0]}.` : ''}`;
export const displayName = s => `${s.firstName} ${s.middleName ? `${s.middleName[0]}. ` : ''}${s.lastName}`;
export function longDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}
export function shortDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}
export const uid = (n = 16) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');

/* Hood mark: the small regalia hood shown beside a grade level's name, in that level's colour. */
export function hoodMark(el, key, label) {
  const m = el('span', { class: 'hood', role: label ? 'img' : null, 'aria-label': label || null, 'aria-hidden': label ? null : 'true' });
  m.style.setProperty('--hood', hood(key).hex);
  return m;
}

/* ---------- demo school ---------- */
function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
export function demoSeed() {
  const r = rng(20262027);
  const today = new Date(); const t = isoDay(today);
  const sy = today.getMonth() >= 5 ? today.getFullYear() : today.getFullYear() - 1;
  const d = (y, m, day) => isoDay(new Date(y, m - 1, day));
  const sched = [
    { label: 'Upon enrolment', due: d(sy, 6, 8), pct: 25 }, { label: 'Second instalment', due: d(sy, 8, 5), pct: 25 },
    { label: 'Third instalment', due: d(sy, 10, 5), pct: 25 }, { label: 'Fourth instalment', due: d(sy + 1, 1, 5), pct: 25 },
  ];
  const gs = ['Filipino', 'English', 'Mathematics', 'Science', 'Araling Panlipunan', 'MAPEH', 'Edukasyon sa Pagpapakatao'];
  const L = (id, name, hoodKey, tuition, misc, books, subjects) => ({ id, name, hood: hoodKey, sort: 0, subjects, fees: { items: [{ label: 'Tuition', amount: tuition, discountable: true }, { label: 'Miscellaneous fees', amount: misc, discountable: false }, { label: 'Books and learning materials', amount: books, discountable: false }], schedule: sched } });
  const levels = [
    L('lk', 'Kindergarten', 'saffron', 28000, 6500, 2800, ['Language and Literacy', 'Numeracy', 'Arts and Music', 'Values Education']),
    L('l1', 'Grade 1', 'maroon', 36000, 9000, 4000, gs.slice(0, 7)),
    L('l2', 'Grade 2', 'emerald', 36000, 9000, 4200, gs.slice(0, 7)),
    L('l3', 'Grade 3', 'sapphire', 38000, 9500, 4400, gs.slice(0, 7)),
    L('l4', 'Grade 4', 'violet', 38000, 9500, 4600, gs.slice(0, 7)),
  ].map((l, i) => ({ ...l, sort: i }));
  const kids = [
    ['Santos', 'Andrea', 'Mae', 'F', 'lk'], ['Reyes', 'Gabriel', 'Luis', 'M', 'lk'], ['Dela Cruz', 'Sofia', 'Isabel', 'F', 'lk'], ['Bautista', 'Miguel', 'Anton', 'M', 'lk'],
    ['Villanueva', 'Bianca', 'Rose', 'F', 'l1'], ['Garcia', 'Paolo', 'Jose', 'M', 'l1'], ['Mendoza', 'Katrina', 'Joy', 'F', 'l1'], ['Ramos', 'Elijah', 'Marco', 'M', 'l1'], ['Castillo', 'Ysabel', 'Grace', 'F', 'l1'],
    ['Torres', 'Nathan', 'Rey', 'M', 'l2'], ['Aquino', 'Clarisse', 'Ann', 'F', 'l2'], ['Navarro', 'Joaquin', 'Paul', 'M', 'l2'], ['Flores', 'Margarita', 'Lou', 'F', 'l2'], ['Gonzales', 'Rafael', 'Tomas', 'M', 'l2'],
    ['Lim', 'Chloe', 'Anne', 'F', 'l3'], ['Tan', 'Lucas', 'Matthew', 'M', 'l3'], ['Domingo', 'Hannah', 'Faith', 'F', 'l3'], ['Salazar', 'Adrian', 'Kyle', 'M', 'l3'], ['Pascual', 'Leah', 'Marie', 'F', 'l3'],
    ['Aguilar', 'Daniel', 'James', 'M', 'l4'], ['Cruz', 'Patricia', 'Jean', 'F', 'l4'], ['Morales', 'Ethan', 'Carl', 'M', 'l4'], ['Rivera', 'Samantha', 'Kate', 'F', 'l4'], ['Ocampo', 'Jerome', 'Luis', 'M', 'l4'],
  ];
  const parents = ['Maricel', 'Roberto', 'Jennifer', 'Antonio', 'Liza', 'Ramon', 'Cristina', 'Eduardo', 'Rowena', 'Fernando'];
  const sections = { lk: 'Sampaguita', l1: 'Narra', l2: 'Molave', l3: 'Yakal', l4: 'Kamagong' };
  const students = []; const charges = []; const payments = []; const grades = []; const attendance = [];
  kids.forEach(([last, first, middle, sex, lv], i) => {
    const id = `s${i + 1}`;
    const disc = i % 9 === 2 ? 10 : i % 11 === 5 ? 5 : 0;
    const by = (lv === 'lk' ? 2021 : 2020) - Number(lv.slice(1) || 0);
    students.push({ id, ref: `${sy}-${String(i + 1).padStart(4, '0')}`, lrn: lv === 'lk' ? '' : String(117000000000 + Math.floor(r() * 899999999)).slice(0, 12), lastName: last, firstName: first, middleName: middle, birthdate: d(by, 1 + (i % 12), 3 + (i % 25)), sex, levelId: lv, section: sections[lv], guardian: `${parents[i % parents.length]} ${last}`, relation: i % 2 ? 'Father' : 'Mother', mobile: `0917 555 ${String(1100 + i).slice(-4)}`, email: '', address: `${10 + i} Rizal Street, Barangay ${['Taloc', 'Ma-ao', 'Poblacion', 'Abuanan'][i % 4]}, Bago City`, previousSchool: '', discount: disc, discountNote: disc === 10 ? 'Sibling discount' : disc === 5 ? 'Early payment' : '', status: 'enrolled', token: id, createdAt: `${d(sy, 5, 20)}T09:00:00Z`, updatedAt: `${d(sy, 5, 20)}T09:00:00Z` });
    const lvl = levels.find(l => l.id === lv);
    buildCharges(lvl.fees, disc).forEach((c, k) => charges.push({ id: `${id}c${k}`, studentId: id, ...c, createdAt: `${d(sy, 5, 20)}T09:0${k}:00Z` }));
    const mine = charges.filter(c => c.studentId === id);
    // Most families are on schedule; a few are behind, one paid the year in full.
    const paidUpTo = i === 7 ? 4 : [3, 11, 17, 22].includes(i) ? 1 : [5, 14].includes(i) ? 2 : mine.filter(c => c.due && c.due <= t).length;
    mine.slice(0, paidUpTo).forEach((c, k) => payments.push({ id: `${id}p${k}`, studentId: id, amount: c.amount, paidOn: c.due < t ? c.due : t, method: ['Cash', 'GCash', 'Maya', 'Bank'][(i + k) % 4], reference: (i + k) % 4 ? `40${(i * 7919 + k * 104729) % 100000000}` : '', receiptNo: `OR-${String(1001 + payments.length)}`, note: '', status: 'confirmed', createdAt: `${c.due}T10:00:00Z` }));
    if (i === 22) payments.push({ id: `${id}px`, studentId: id, amount: 5000, paidOn: d(sy, 9, 12), method: 'Cash', reference: '', receiptNo: `OR-${String(1001 + payments.length)}`, note: 'Partial payment', status: 'confirmed', createdAt: `${d(sy, 9, 12)}T10:00:00Z` });
    if (i === 11 || i === 17) payments.push({ id: `${id}pend`, studentId: id, amount: mine[1].amount, paidOn: t, method: 'GCash', reference: `5${(i * 3571) % 1000000000}`.padEnd(10, '7'), receiptNo: '', note: 'Sent from the parent portal', status: 'pending', createdAt: new Date().toISOString() });
    lvl.subjects.forEach((sub, k) => {
      const base = 80 + Math.floor(r() * 15) + (i % 5 === 0 ? 3 : 0);
      grades.push({ studentId: id, subject: sub, quarter: 1, grade: Math.min(98, base) });
      if (k < 4) grades.push({ studentId: id, subject: sub, quarter: 2, grade: Math.min(98, base + Math.round(r() * 4 - 1)) });
    });
    for (let back = 1; back <= 14; back++) {
      const day = new Date(today); day.setDate(today.getDate() - back);
      if (day.getDay() === 0 || day.getDay() === 6) continue;
      const x = r(); attendance.push({ studentId: id, day: isoDay(day), mark: x < 0.9 ? 'P' : x < 0.95 ? 'L' : x < 0.98 ? 'A' : 'E' });
    }
  });
  [['Fernandez', 'Isabella', 'Joy', 'F', 'l1', 'Teresa Fernandez', 'Mother', 'St. Jude Preschool'], ['Uy', 'Marcus', 'Lee', 'M', 'l3', 'Henry Uy', 'Father', 'Bago City Central School'], ['De Leon', 'Alyssa', 'Mae', 'F', 'lk', 'Grace De Leon', 'Mother', '']]
    .forEach(([last, first, middle, sex, lv, guardian, relation, prev], k) => students.push({ id: `a${k + 1}`, ref: `${sy}-${String(25 + k).padStart(4, '0')}`, lrn: '', lastName: last, firstName: first, middleName: middle, birthdate: d(lv === 'lk' ? 2021 : 2018 - k, 3 + k, 14), sex, levelId: lv, section: '', guardian, relation, mobile: `0918 555 ${String(2200 + k)}`, email: '', address: `Purok ${k + 2}, Barangay Lag-asan, Bago City`, previousSchool: prev, discount: 0, discountNote: '', status: 'applicant', token: `a${k + 1}`, createdAt: new Date(Date.now() - (k + 1) * 86_400_000).toISOString(), updatedAt: new Date().toISOString() }));
  return {
    school: { name: 'Bagong Liwanag Academy', slug: 'demo', plan: 'full', motto: 'Lumen et Virtus', address: 'Rizal Street, Barangay Poblacion', city: 'Bago City, Negros Occidental', phone: '(034) 461 0210', email: 'registrar@example.com', principal: 'Dr. Teresita M. Lacson', registrar: 'Ms. Carmela R. Ledesma', schoolYear: `${sy}–${sy + 1}`, gcash: '0917 123 4567', enrolOpen: true, released: [1] },
    levels, students, charges, payments, grades, attendance,
    notices: [
      { id: 'n1', title: 'Second quarter examinations', body: 'Second quarter examinations are scheduled on the first week of January. Please settle the third instalment before the examination week so your child can receive the examination permit.', levelId: '', createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
      { id: 'n2', title: 'Kindergarten Family Day', body: 'Kindergarten families are invited to Family Day on Saturday, 8:00 AM, at the school covered court. Wear the class colour.', levelId: 'lk', createdAt: new Date(Date.now() - 6 * 86_400_000).toISOString() },
    ],
  };
}
export function demoLoad() {
  const x = window.RZ.load(DEMO_KEY, null);
  if (x && x.school && Array.isArray(x.students)) return x;
  const fresh = demoSeed(); window.RZ.save(DEMO_KEY, fresh); return fresh;
}
export const demoSave = x => window.RZ.save(DEMO_KEY, x);

/* Demo copies of the office actions the RZ server performs, with the same rules. */
const fail = msg => { throw new Error(msg); };
export function demoActions(D, plan) {
  const lvl = id => D.levels.find(l => l.id === id) || fail('Grade level not found.');
  const stu = id => D.students.find(s => s.id === id) || fail('Student not found.');
  const nextRef = () => `${D.school.schoolYear.slice(0, 4)}-${String(D.students.length + 1).padStart(4, '0')}`;
  const enrol = s => {
    if (!D.charges.some(c => c.studentId === s.id)) buildCharges(lvl(s.levelId).fees, s.discount).forEach(c => D.charges.push({ id: uid(), studentId: s.id, ...c, createdAt: new Date().toISOString() }));
    s.status = 'enrolled'; s.updatedAt = new Date().toISOString();
  };
  const needFull = () => { if (plan() !== 'full') fail('This needs the RZ Eskwela Full plan. Ask RZ to upgrade your plan.'); };
  return {
    school: b => { const { name, ...rest } = b; Object.assign(D.school, rest, name ? { name } : {}); },
    addLevel: b => { if (!b.name) fail('Name the grade level, like Grade 1 or Kinder.'); D.levels.push({ id: uid(), name: b.name, hood: HOOD_KEYS.includes(b.hood) ? b.hood : HOOD_KEYS[D.levels.length % HOOD_KEYS.length], sort: D.levels.length, fees: { items: [], schedule: [] }, subjects: [] }); },
    editLevel: (id, b) => {
      const l = lvl(id);
      if (b.fees) { const pct = round(b.fees.schedule.reduce((s, x) => s + Number(x.pct || 0), 0)); if (b.fees.schedule.length && Math.abs(pct - 100) > 0.01) fail(`The payment schedule adds up to ${pct}%. It must add up to 100%.`); }
      Object.assign(l, b);
    },
    delLevel: id => { if (D.students.some(s => s.levelId === id)) fail('Move or remove the students in this level first.'); D.levels = D.levels.filter(l => l.id !== id); },
    addStudent: b => { if (!b.lastName || !b.firstName) fail('Enter the student’s first and last name.'); lvl(b.levelId); const s = { id: uid(), ref: nextRef(), lrn: '', middleName: '', birthdate: '', sex: '', section: '', guardian: '', relation: '', mobile: '', email: '', address: '', previousSchool: '', discount: 0, discountNote: '', ...b, status: 'applicant', token: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; s.token = s.id; delete s.enrol; D.students.push(s); if (b.enrol) enrol(s); },
    editStudent: (id, b) => { const s = stu(id); if (b.status === 'enrolled') delete b.status; Object.assign(s, b, { updatedAt: new Date().toISOString() }); },
    enrol: id => { const s = stu(id); if (s.status === 'enrolled') fail('This student is already enrolled.'); enrol(s); },
    delStudent: id => { if (D.payments.some(p => p.studentId === id) || D.grades.some(g => g.studentId === id)) fail('This student has payments or grades. Mark them withdrawn instead, so the records stay.'); D.students = D.students.filter(s => s.id !== id); D.charges = D.charges.filter(c => c.studentId !== id); },
    addCharge: b => { stu(b.studentId); if (!b.label || !(b.amount > 0)) fail('Enter what the charge is for and its amount.'); D.charges.push({ id: uid(), studentId: b.studentId, label: b.label, amount: round(b.amount), due: isDate(b.due) ? b.due : null, createdAt: new Date().toISOString() }); },
    delCharge: id => { D.charges = D.charges.filter(c => c.id !== id); },
    addPayment: b => { stu(b.studentId); if (!(b.amount > 0)) fail('Enter the amount received.'); if (!isDate(b.paidOn)) fail('Enter the payment date.'); D.payments.unshift({ id: uid(), studentId: b.studentId, amount: round(b.amount), paidOn: b.paidOn, method: b.method, reference: b.reference || '', receiptNo: b.receiptNo || '', note: b.note || '', status: 'confirmed', createdAt: new Date().toISOString() }); },
    setPayment: (id, b) => { Object.assign(D.payments.find(p => p.id === id) || fail('Payment not found.'), b); },
    saveGrades: b => {
      const l = lvl(b.levelId); if (!l.subjects.includes(b.subject)) fail('Choose a subject of this grade level.'); if (!QUARTERS.includes(Number(b.quarter))) fail('Choose a quarter.');
      b.entries.forEach(e => {
        D.grades = D.grades.filter(g => !(g.studentId === e.studentId && g.subject === b.subject && g.quarter === Number(b.quarter)));
        if (e.grade === null || e.grade === '') return;
        const g = Number(e.grade); if (!Number.isFinite(g) || g < 60 || g > 100) fail('Grades must be between 60 and 100.');
        D.grades.push({ studentId: e.studentId, subject: b.subject, quarter: Number(b.quarter), grade: Math.round(g) });
      });
    },
    saveAttendance: b => { needFull(); b.entries.forEach(e => { D.attendance = D.attendance.filter(a => !(a.studentId === e.studentId && a.day === b.day)); D.attendance.push({ studentId: e.studentId, day: b.day, mark: e.mark }); }); },
    addNotice: b => { needFull(); if (!b.title || !b.body) fail('Write a title and the announcement.'); D.notices.unshift({ id: uid(), title: b.title, body: b.body, levelId: b.levelId || '', createdAt: new Date().toISOString() }); },
    delNotice: id => { needFull(); D.notices = D.notices.filter(n => n.id !== id); },
  };
}

/* Parent view of one student, computed the same way the RZ server does. */
export function parentViewFrom(D, studentId) {
  const st = D.students.find(s => s.id === studentId); if (!st) return null;
  const lvl = D.levels.find(l => l.id === st.levelId) || { name: '', hood: 'slate', subjects: [] };
  const payments = D.payments.filter(p => p.studentId === st.id && ['confirmed', 'pending'].includes(p.status));
  const l = ledger(D.charges.filter(c => c.studentId === st.id), payments, new Date());
  const S = D.school;
  const view = {
    school: { name: S.name, slug: 'demo', motto: S.motto, address: S.address, city: S.city, phone: S.phone, principal: S.principal, registrar: S.registrar, schoolYear: S.schoolYear, gcash: S.gcash, plan: S.plan },
    student: { ref: st.ref, lrn: st.lrn, lastName: st.lastName, firstName: st.firstName, middleName: st.middleName, level: lvl.name, hood: lvl.hood, section: st.section, status: st.status, guardian: st.guardian },
    account: { charges: l.charges, billed: l.billed, paid: l.paid, balance: l.balance, pending: l.pending, overdue: l.overdue, lateDays: l.lateDays, next: l.next },
    payments: payments.slice().sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn))), released: S.released, subjects: lvl.subjects,
    grades: D.grades.filter(g => g.studentId === st.id && S.released.includes(g.quarter)),
  };
  if (S.plan === 'full') {
    view.attendance = D.attendance.filter(a => a.studentId === st.id).sort((a, b) => b.day.localeCompare(a.day));
    view.notices = D.notices.filter(n => !n.levelId || n.levelId === st.levelId).slice(0, 10);
  }
  return view;
}
