/*
 * RZ Eskwela — school office system for small private schools, tutorial and review centres.
 * Two plans, set only by an RZ admin and enforced here: plus (enrolment, fees, parent portal, grades,
 * report cards) and full (plus attendance and announcements).
 * Every office route is scoped to the school's business id. Parents see one student by a private token.
 * Fee and grade maths live in products/eskwela/logic.mjs, shared with the pages.
 */
import { buildCharges, ledger, round, isDate, HOOD_KEYS, QUARTERS } from '../products/eskwela/logic.mjs';

export const ESKWELA_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS esk_schools (business_id TEXT PRIMARY KEY, plan TEXT NOT NULL DEFAULT 'plus', motto TEXT DEFAULT '', address TEXT DEFAULT '', city TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '', principal TEXT DEFAULT '', registrar TEXT DEFAULT '', school_year TEXT DEFAULT '', gcash TEXT DEFAULT '', enrol_open INTEGER DEFAULT 1, released TEXT DEFAULT '[]')`,
  `CREATE TABLE IF NOT EXISTS esk_levels (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, name TEXT NOT NULL, hood TEXT NOT NULL, sort INTEGER NOT NULL, fees TEXT DEFAULT '{}', subjects TEXT DEFAULT '[]')`,
  `CREATE INDEX IF NOT EXISTS idx_esk_levels_biz ON esk_levels (business_id, sort)`,
  `CREATE TABLE IF NOT EXISTS esk_students (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, ref TEXT NOT NULL, lrn TEXT DEFAULT '', last_name TEXT NOT NULL, first_name TEXT NOT NULL, middle_name TEXT DEFAULT '', birthdate TEXT DEFAULT '', sex TEXT DEFAULT '', level_id TEXT NOT NULL, section TEXT DEFAULT '', guardian TEXT DEFAULT '', relation TEXT DEFAULT '', mobile TEXT DEFAULT '', email TEXT DEFAULT '', address TEXT DEFAULT '', previous_school TEXT DEFAULT '', discount REAL DEFAULT 0, discount_note TEXT DEFAULT '', status TEXT NOT NULL, token TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_esk_students_biz ON esk_students (business_id, status)`,
  `CREATE TABLE IF NOT EXISTS esk_charges (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, student_id TEXT NOT NULL, label TEXT NOT NULL, amount REAL NOT NULL, due TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_esk_charges_student ON esk_charges (student_id)`,
  `CREATE TABLE IF NOT EXISTS esk_payments (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, student_id TEXT NOT NULL, amount REAL NOT NULL, paid_on TEXT NOT NULL, method TEXT NOT NULL, reference TEXT DEFAULT '', receipt_no TEXT DEFAULT '', note TEXT DEFAULT '', status TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_esk_payments_student ON esk_payments (student_id)`,
  `CREATE TABLE IF NOT EXISTS esk_grades (business_id TEXT NOT NULL, student_id TEXT NOT NULL, subject TEXT NOT NULL, quarter INTEGER NOT NULL, grade REAL NOT NULL, PRIMARY KEY (student_id, subject, quarter))`,
  `CREATE INDEX IF NOT EXISTS idx_esk_grades_biz ON esk_grades (business_id)`,
  `CREATE TABLE IF NOT EXISTS esk_attendance (business_id TEXT NOT NULL, student_id TEXT NOT NULL, day TEXT NOT NULL, mark TEXT NOT NULL, PRIMARY KEY (student_id, day))`,
  `CREATE INDEX IF NOT EXISTS idx_esk_att_biz ON esk_attendance (business_id, day)`,
  `CREATE TABLE IF NOT EXISTS esk_notices (id TEXT PRIMARY KEY, business_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, level_id TEXT DEFAULT '', created_at TEXT NOT NULL)`,
];

export const PLANS = ['plus', 'full'];
const PLAN_NAME = { plus: 'Plus', full: 'Full' };
const STATUSES = ['applicant', 'enrolled', 'withdrawn', 'declined'];
const METHODS = ['Cash', 'GCash', 'Maya', 'Bank', 'Cheque'];
const MARKS = ['P', 'A', 'L', 'E'];
const LIMITS = { levels: 20, students: 2000, applyPerDay: 120, chargesPerStudent: 40, subjects: 20, notices: 300 };

const manilaToday = () => { const d = new Date(Date.now() + 8 * 3_600_000); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const schoolOut = (s, biz) => ({
  name: biz.name, slug: biz.slug, plan: s?.plan || 'plus', motto: s?.motto || '', address: s?.address || '', city: s?.city || '', phone: s?.phone || '', email: s?.email || '',
  principal: s?.principal || '', registrar: s?.registrar || '', schoolYear: s?.school_year || '', gcash: s?.gcash || '', enrolOpen: s ? !!s.enrol_open : true, released: JSON.parse(s?.released || '[]'),
});
const levelOut = r => ({ id: r.id, name: r.name, hood: r.hood, sort: r.sort, fees: JSON.parse(r.fees || '{}'), subjects: JSON.parse(r.subjects || '[]') });
const studentOut = r => ({
  id: r.id, ref: r.ref, lrn: r.lrn, lastName: r.last_name, firstName: r.first_name, middleName: r.middle_name, birthdate: r.birthdate, sex: r.sex, levelId: r.level_id, section: r.section,
  guardian: r.guardian, relation: r.relation, mobile: r.mobile, email: r.email, address: r.address, previousSchool: r.previous_school, discount: r.discount, discountNote: r.discount_note,
  status: r.status, token: r.token, createdAt: r.created_at, updatedAt: r.updated_at,
});
const chargeOut = r => ({ id: r.id, studentId: r.student_id, label: r.label, amount: r.amount, due: r.due, createdAt: r.created_at });
const paymentOut = r => ({ id: r.id, studentId: r.student_id, amount: r.amount, paidOn: r.paid_on, method: r.method, reference: r.reference, receiptNo: r.receipt_no, note: r.note, status: r.status, createdAt: r.created_at });

export function eskwelaRoutes(h) {
  const { json, HttpError, text, multiline, money, randomHex, now, readJSON, rateLimit } = h;

  const schoolOf = (env, id) => env.DB.prepare('SELECT * FROM esk_schools WHERE business_id = ?').bind(id).first();
  const planOf = async (env, id) => (await schoolOf(env, id))?.plan || 'plus';
  const need = (plan, min) => { if (min === 'full' && plan !== 'full') throw new HttpError(403, `This needs the RZ Eskwela ${PLAN_NAME.full} plan. Ask RZ to upgrade your plan.`); };
  const own = async (env, table, id, bizId, what) => {
    const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND business_id = ?`).bind(String(id || ''), bizId).first();
    if (!row) throw new HttpError(404, `${what} not found.`);
    return row;
  };
  const count = async (env, table, bizId, extra = '', ...a) => (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE business_id = ? ${extra}`).bind(bizId, ...a).first())?.n || 0;
  const peso = (v, label, max = 10_000_000) => { const n = money(v ?? 0); if (!Number.isFinite(n) || n > max) throw new HttpError(400, `Check the ${label}.`); return n; };
  const mobileOk = m => !m || /^[0-9+()\s-]{7,20}$/.test(m);
  async function nextRef(env, bizId) {
    const n = (await count(env, 'esk_students', bizId)) + 1;
    const yr = manilaToday().getFullYear();
    return `${yr}-${String(n).padStart(4, '0')}`;
  }

  function cleanStudent(b, old = { lrn: '', lastName: '', firstName: '', middleName: '', birthdate: '', sex: '', section: '', guardian: '', relation: '', mobile: '', email: '', address: '', previousSchool: '', discount: 0, discountNote: '' }) {
    const pick = (k, fn) => (b[k] === undefined ? old[k] : fn(b[k]));
    const s = {
      lrn: pick('lrn', v => text(v, 12).replace(/\D/g, '')), lastName: pick('lastName', v => text(v, 60)), firstName: pick('firstName', v => text(v, 60)), middleName: pick('middleName', v => text(v, 60)),
      birthdate: pick('birthdate', v => (isDate(v) ? v : '')), sex: pick('sex', v => (['F', 'M'].includes(v) ? v : '')), section: pick('section', v => text(v, 40)),
      guardian: pick('guardian', v => text(v, 80)), relation: pick('relation', v => text(v, 30)), mobile: pick('mobile', v => text(v, 20)), email: pick('email', v => text(v, 120).toLowerCase()),
      address: pick('address', v => text(v, 200)), previousSchool: pick('previousSchool', v => text(v, 120)),
      discount: pick('discount', v => { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 100) throw new HttpError(400, 'Discount must be 0 to 100%.'); return round(n); }),
      discountNote: pick('discountNote', v => text(v, 80)),
    };
    if (!s.lastName || !s.firstName) throw new HttpError(400, 'Enter the student’s first and last name.');
    if (!mobileOk(s.mobile)) throw new HttpError(400, 'Check the mobile number.');
    if (s.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) throw new HttpError(400, 'Check the email address.');
    return s;
  }

  async function state(env, biz) {
    const s = await schoolOf(env, biz.id);
    const plan = s?.plan || 'plus';
    const q = (sql, ...a) => env.DB.prepare(sql).bind(biz.id, ...a).all().then(r => r.results);
    const since = isoOf(new Date(manilaToday().getTime() - 120 * 86_400_000));
    const [levels, students, charges, payments, grades, att, notices] = await Promise.all([
      q('SELECT * FROM esk_levels WHERE business_id = ? ORDER BY sort'),
      q(`SELECT * FROM esk_students WHERE business_id = ? ORDER BY last_name, first_name LIMIT ${LIMITS.students}`),
      q('SELECT * FROM esk_charges WHERE business_id = ?'),
      q('SELECT * FROM esk_payments WHERE business_id = ? ORDER BY paid_on DESC, created_at DESC'),
      q('SELECT student_id, subject, quarter, grade FROM esk_grades WHERE business_id = ?'),
      plan === 'full' ? q('SELECT student_id, day, mark FROM esk_attendance WHERE business_id = ? AND day >= ?', since) : [],
      plan === 'full' ? q('SELECT * FROM esk_notices WHERE business_id = ? ORDER BY created_at DESC LIMIT 100') : [],
    ]);
    return json({
      school: schoolOut(s, biz), today: isoOf(manilaToday()),
      levels: levels.map(levelOut), students: students.map(studentOut), charges: charges.map(chargeOut), payments: payments.map(paymentOut),
      grades: grades.map(g => ({ studentId: g.student_id, subject: g.subject, quarter: g.quarter, grade: g.grade })),
      attendance: att.map(a => ({ studentId: a.student_id, day: a.day, mark: a.mark })),
      notices: notices.map(n => ({ id: n.id, title: n.title, body: n.body, levelId: n.level_id, createdAt: n.created_at })),
    });
  }

  async function enrolStudent(env, biz, st) {
    // Approving creates the fee schedule from the level's plan, once.
    const lvl = await own(env, 'esk_levels', st.level_id, biz.id, 'Grade level');
    const has = await env.DB.prepare('SELECT COUNT(*) AS n FROM esk_charges WHERE student_id = ?').bind(st.id).first();
    const stmts = [env.DB.prepare("UPDATE esk_students SET status = 'enrolled', updated_at = ? WHERE id = ?").bind(now(), st.id)];
    if (!has?.n) buildCharges(levelOut(lvl).fees, st.discount).forEach(c => stmts.push(env.DB.prepare('INSERT INTO esk_charges (id, business_id, student_id, label, amount, due, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(randomHex(16), biz.id, st.id, c.label, c.amount, c.due, now())));
    await env.DB.batch(stmts);
  }

  async function owner(env, request, user, pathname, method) {
    let m;
    const biz = user;
    if (pathname === '/api/eskwela' && method === 'GET') return state(env, biz);
    const plan = await planOf(env, biz.id);

    if (pathname === '/api/eskwela/school' && method === 'PUT') {
      const b = await readJSON(request);
      const released = Array.isArray(b.released) ? [...new Set(b.released.map(Number).filter(n => QUARTERS.includes(n)))].sort() : [];
      for (const [k, v] of [['phone', b.phone], ['gcash', b.gcash]]) if (!mobileOk(text(v, 20))) throw new HttpError(400, `Check the ${k === 'gcash' ? 'GCash / Maya number' : 'phone number'}.`);
      const email = text(b.email, 120).toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Check the school email.');
      await env.DB.prepare(`INSERT INTO esk_schools (business_id, plan, motto, address, city, phone, email, principal, registrar, school_year, gcash, enrol_open, released) VALUES (?, 'plus', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(business_id) DO UPDATE SET motto = excluded.motto, address = excluded.address, city = excluded.city, phone = excluded.phone, email = excluded.email, principal = excluded.principal, registrar = excluded.registrar, school_year = excluded.school_year, gcash = excluded.gcash, enrol_open = excluded.enrol_open, released = excluded.released`)
        .bind(biz.id, text(b.motto, 120), text(b.address, 160), text(b.city, 60), text(b.phone, 20), email, text(b.principal, 80), text(b.registrar, 80), text(b.schoolYear, 20), text(b.gcash, 20), b.enrolOpen === false ? 0 : 1, JSON.stringify(released)).run();
      if (text(b.name, 80)) await env.DB.prepare('UPDATE businesses SET name = ? WHERE id = ?').bind(text(b.name, 80), biz.id).run();
      return state(env, await env.DB.prepare('SELECT * FROM businesses WHERE id = ?').bind(biz.id).first());
    }

    /* grade levels, their fee plans and subjects */
    if (pathname === '/api/eskwela/levels' && method === 'POST') {
      if (await count(env, 'esk_levels', biz.id) >= LIMITS.levels) throw new HttpError(409, `Up to ${LIMITS.levels} grade levels.`);
      const b = await readJSON(request);
      const name = text(b.name, 40); if (!name) throw new HttpError(400, 'Name the grade level, like Grade 1 or Kinder.');
      const hood = HOOD_KEYS.includes(b.hood) ? b.hood : HOOD_KEYS[(await count(env, 'esk_levels', biz.id)) % HOOD_KEYS.length];
      await env.DB.prepare('INSERT INTO esk_levels (id, business_id, name, hood, sort, fees, subjects) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(randomHex(16), biz.id, name, hood, await count(env, 'esk_levels', biz.id), JSON.stringify({ items: [], schedule: [] }), '[]').run();
      return state(env, biz);
    }
    if ((m = pathname.match(/^\/api\/eskwela\/levels\/([a-f0-9]{32})$/))) {
      const row = await own(env, 'esk_levels', m[1], biz.id, 'Grade level');
      if (method === 'PATCH') {
        const b = await readJSON(request, 32_000);
        const lvl = levelOut(row);
        const name = b.name === undefined ? lvl.name : text(b.name, 40);
        if (!name) throw new HttpError(400, 'Name the grade level.');
        const hood = b.hood === undefined ? lvl.hood : (HOOD_KEYS.includes(b.hood) ? b.hood : lvl.hood);
        let fees = lvl.fees;
        if (b.fees !== undefined) {
          const items = (Array.isArray(b.fees?.items) ? b.fees.items : []).slice(0, 20).map(i => ({ label: text(i.label, 60), amount: peso(i.amount, 'fee amount'), discountable: !!i.discountable })).filter(i => i.label && i.amount > 0);
          const schedule = (Array.isArray(b.fees?.schedule) ? b.fees.schedule : []).slice(0, 12).map(s => ({ label: text(s.label, 60), due: isDate(s.due) ? s.due : '', pct: round(Number(s.pct) || 0) })).filter(s => s.label && s.pct > 0);
          const pct = round(schedule.reduce((s, x) => s + x.pct, 0));
          if (schedule.length && Math.abs(pct - 100) > 0.01) throw new HttpError(400, `The payment schedule adds up to ${pct}%. It must add up to 100%.`);
          fees = { items, schedule };
        }
        let subjects = lvl.subjects;
        if (b.subjects !== undefined) subjects = [...new Set((Array.isArray(b.subjects) ? b.subjects : []).map(x => text(x, 40)).filter(Boolean))].slice(0, LIMITS.subjects);
        await env.DB.prepare('UPDATE esk_levels SET name = ?, hood = ?, fees = ?, subjects = ? WHERE id = ?').bind(name, hood, JSON.stringify(fees), JSON.stringify(subjects), row.id).run();
        return state(env, biz);
      }
      if (method === 'DELETE') {
        if (await count(env, 'esk_students', biz.id, 'AND level_id = ?', row.id)) throw new HttpError(409, 'Move or remove the students in this level first.');
        await env.DB.prepare('DELETE FROM esk_levels WHERE id = ?').bind(row.id).run();
        return state(env, biz);
      }
    }

    /* students */
    if (pathname === '/api/eskwela/students' && method === 'POST') {
      if (await count(env, 'esk_students', biz.id) >= LIMITS.students) throw new HttpError(409, 'Student limit reached. Contact RZ.');
      const b = await readJSON(request);
      const s = cleanStudent(b);
      const lvl = await own(env, 'esk_levels', b.levelId, biz.id, 'Grade level');
      const id = randomHex(16);
      await env.DB.prepare('INSERT INTO esk_students (id, business_id, ref, lrn, last_name, first_name, middle_name, birthdate, sex, level_id, section, guardian, relation, mobile, email, address, previous_school, discount, discount_note, status, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, biz.id, await nextRef(env, biz.id), s.lrn, s.lastName, s.firstName, s.middleName, s.birthdate, s.sex, lvl.id, s.section, s.guardian, s.relation, s.mobile, s.email, s.address, s.previousSchool, s.discount, s.discountNote, 'applicant', randomHex(24), now(), now()).run();
      if (b.enrol) await enrolStudent(env, biz, await own(env, 'esk_students', id, biz.id, 'Student'));
      return state(env, biz);
    }
    if ((m = pathname.match(/^\/api\/eskwela\/students\/([a-f0-9]{32})(\/enrol)?$/))) {
      const st = await own(env, 'esk_students', m[1], biz.id, 'Student');
      if (m[2] && method === 'POST') {
        if (st.status === 'enrolled') throw new HttpError(409, 'This student is already enrolled.');
        await enrolStudent(env, biz, st);
        return state(env, biz);
      }
      if (!m[2] && method === 'PATCH') {
        const b = await readJSON(request);
        const s = cleanStudent(b, studentOut(st));
        const levelId = b.levelId ? (await own(env, 'esk_levels', b.levelId, biz.id, 'Grade level')).id : st.level_id;
        const status = b.status === undefined ? st.status : (STATUSES.includes(b.status) && b.status !== 'enrolled' ? b.status : st.status);
        await env.DB.prepare('UPDATE esk_students SET lrn = ?, last_name = ?, first_name = ?, middle_name = ?, birthdate = ?, sex = ?, level_id = ?, section = ?, guardian = ?, relation = ?, mobile = ?, email = ?, address = ?, previous_school = ?, discount = ?, discount_note = ?, status = ?, updated_at = ? WHERE id = ?')
          .bind(s.lrn, s.lastName, s.firstName, s.middleName, s.birthdate, s.sex, levelId, s.section, s.guardian, s.relation, s.mobile, s.email, s.address, s.previousSchool, s.discount, s.discountNote, status, now(), st.id).run();
        return state(env, biz);
      }
      if (!m[2] && method === 'DELETE') {
        const used = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM esk_payments WHERE student_id = ?) + (SELECT COUNT(*) FROM esk_grades WHERE student_id = ?) AS n').bind(st.id, st.id).first();
        if (used?.n) throw new HttpError(409, 'This student has payments or grades. Mark them withdrawn instead, so the records stay.');
        await env.DB.batch(['esk_charges', 'esk_attendance'].map(t => env.DB.prepare(`DELETE FROM ${t} WHERE student_id = ?`).bind(st.id)).concat(env.DB.prepare('DELETE FROM esk_students WHERE id = ?').bind(st.id)));
        return state(env, biz);
      }
    }

    /* charges and payments */
    if (pathname === '/api/eskwela/charges' && method === 'POST') {
      const b = await readJSON(request);
      const st = await own(env, 'esk_students', b.studentId, biz.id, 'Student');
      if ((await count(env, 'esk_charges', biz.id, 'AND student_id = ?', st.id)) >= LIMITS.chargesPerStudent) throw new HttpError(409, 'Too many charges on this account.');
      const label = text(b.label, 60); const amount = peso(b.amount, 'amount');
      if (!label || !(amount > 0)) throw new HttpError(400, 'Enter what the charge is for and its amount.');
      await env.DB.prepare('INSERT INTO esk_charges (id, business_id, student_id, label, amount, due, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(randomHex(16), biz.id, st.id, label, amount, isDate(b.due) ? b.due : null, now()).run();
      return state(env, biz);
    }
    if ((m = pathname.match(/^\/api\/eskwela\/charges\/([a-f0-9]{32})$/)) && method === 'DELETE') {
      const row = await own(env, 'esk_charges', m[1], biz.id, 'Charge');
      await env.DB.prepare('DELETE FROM esk_charges WHERE id = ?').bind(row.id).run();
      return state(env, biz);
    }
    if (pathname === '/api/eskwela/payments' && method === 'POST') {
      const b = await readJSON(request);
      const st = await own(env, 'esk_students', b.studentId, biz.id, 'Student');
      const amount = peso(b.amount, 'amount');
      if (!(amount > 0)) throw new HttpError(400, 'Enter the amount received.');
      if (!isDate(b.paidOn)) throw new HttpError(400, 'Enter the payment date.');
      await env.DB.prepare('INSERT INTO esk_payments (id, business_id, student_id, amount, paid_on, method, reference, receipt_no, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(randomHex(16), biz.id, st.id, amount, b.paidOn, METHODS.includes(b.method) ? b.method : 'Cash', text(b.reference, 40), text(b.receiptNo, 30), text(b.note, 120), 'confirmed', now()).run();
      return state(env, biz);
    }
    if ((m = pathname.match(/^\/api\/eskwela\/payments\/([a-f0-9]{32})$/))) {
      const row = await own(env, 'esk_payments', m[1], biz.id, 'Payment');
      if (method === 'PATCH') {
        const b = await readJSON(request);
        if (!['confirmed', 'rejected', 'void'].includes(b.status)) throw new HttpError(400, 'Unknown status.');
        await env.DB.prepare('UPDATE esk_payments SET status = ?, receipt_no = ? WHERE id = ?').bind(b.status, b.receiptNo === undefined ? row.receipt_no : text(b.receiptNo, 30), row.id).run();
        return state(env, biz);
      }
    }

    /* grades: one subject, one quarter, many students at a time */
    if (pathname === '/api/eskwela/grades' && method === 'PUT') {
      const b = await readJSON(request, 120_000);
      const lvl = levelOut(await own(env, 'esk_levels', b.levelId, biz.id, 'Grade level'));
      const subject = text(b.subject, 40); const quarter = Number(b.quarter);
      if (!lvl.subjects.includes(subject)) throw new HttpError(400, 'Choose a subject of this grade level.');
      if (!QUARTERS.includes(quarter)) throw new HttpError(400, 'Choose a quarter.');
      const entries = Array.isArray(b.entries) ? b.entries.slice(0, 400) : [];
      const ids = new Set((await env.DB.prepare('SELECT id FROM esk_students WHERE business_id = ? AND level_id = ?').bind(biz.id, lvl.id).all()).results.map(r => r.id));
      const del = []; const put = [];
      for (const e of entries) {
        if (!ids.has(String(e.studentId))) throw new HttpError(400, 'A student in the sheet is not in this grade level.');
        if (e.grade === null || e.grade === '') { del.push(String(e.studentId)); continue; }
        const g = Number(e.grade);
        if (!Number.isFinite(g) || g < 60 || g > 100) throw new HttpError(400, 'Grades must be between 60 and 100.');
        put.push({ s: String(e.studentId), g: Math.round(g) });
      }
      // Two statements for the whole class, however large (the free plan allows few queries per request).
      const stmts = [];
      if (del.length) stmts.push(env.DB.prepare('DELETE FROM esk_grades WHERE business_id = ?1 AND subject = ?2 AND quarter = ?3 AND student_id IN (SELECT value FROM json_each(?4))').bind(biz.id, subject, quarter, JSON.stringify(del)));
      if (put.length) stmts.push(env.DB.prepare(`INSERT INTO esk_grades (business_id, student_id, subject, quarter, grade) SELECT ?1, json_extract(value, '$.s'), ?2, ?3, json_extract(value, '$.g') FROM json_each(?4) WHERE true
        ON CONFLICT(student_id, subject, quarter) DO UPDATE SET grade = excluded.grade`).bind(biz.id, subject, quarter, JSON.stringify(put)));
      if (stmts.length) await env.DB.batch(stmts);
      return state(env, biz);
    }

    /* attendance and announcements (Full) */
    if (pathname === '/api/eskwela/attendance' && method === 'PUT') {
      need(plan, 'full');
      const b = await readJSON(request, 120_000);
      if (!isDate(b.day)) throw new HttpError(400, 'Choose the day.');
      if (b.day > isoOf(manilaToday())) throw new HttpError(400, 'Attendance cannot be taken for a future day.');
      const entries = Array.isArray(b.entries) ? b.entries.slice(0, 400) : [];
      const ids = new Set((await env.DB.prepare("SELECT id FROM esk_students WHERE business_id = ? AND status = 'enrolled'").bind(biz.id).all()).results.map(r => r.id));
      const rows = entries.map(e => {
        if (!ids.has(String(e.studentId))) throw new HttpError(400, 'A student in the list is not enrolled here.');
        if (!MARKS.includes(e.mark)) throw new HttpError(400, 'Unknown attendance mark.');
        return { s: String(e.studentId), m: e.mark };
      });
      // One statement for the whole class.
      if (rows.length) await env.DB.prepare(`INSERT INTO esk_attendance (business_id, student_id, day, mark) SELECT ?1, json_extract(value, '$.s'), ?2, json_extract(value, '$.m') FROM json_each(?3) WHERE true
        ON CONFLICT(student_id, day) DO UPDATE SET mark = excluded.mark`).bind(biz.id, b.day, JSON.stringify(rows)).run();
      return state(env, biz);
    }
    if (pathname === '/api/eskwela/notices' && method === 'POST') {
      need(plan, 'full');
      if (await count(env, 'esk_notices', biz.id) >= LIMITS.notices) throw new HttpError(409, 'Delete old announcements first.');
      const b = await readJSON(request);
      const title = text(b.title, 100); const body = multiline(b.body, 1500);
      if (!title || !body) throw new HttpError(400, 'Write a title and the announcement.');
      const levelId = b.levelId ? (await own(env, 'esk_levels', b.levelId, biz.id, 'Grade level')).id : '';
      await env.DB.prepare('INSERT INTO esk_notices (id, business_id, title, body, level_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(randomHex(16), biz.id, title, body, levelId, now()).run();
      return state(env, biz);
    }
    if ((m = pathname.match(/^\/api\/eskwela\/notices\/([a-f0-9]{32})$/)) && method === 'DELETE') {
      need(plan, 'full');
      const row = await own(env, 'esk_notices', m[1], biz.id, 'Announcement');
      await env.DB.prepare('DELETE FROM esk_notices WHERE id = ?').bind(row.id).run();
      return state(env, biz);
    }
    return null;
  }

  /* ---------- public: school page, online enrolment, parent portal ---------- */
  async function publicRoute(env, request, pathname, method) {
    let m;
    if ((m = pathname.match(/^\/api\/public\/eskwela\/parent\/([a-f0-9]{48})(\/payments)?$/))) {
      const st = await env.DB.prepare('SELECT * FROM esk_students WHERE token = ?').bind(m[1]).first();
      if (!st) throw new HttpError(404, 'This link is not valid. Ask the school office for a new one.');
      if (m[2] && method === 'POST') {
        const ip = request.headers.get('cf-connecting-ip') || 'local';
        await rateLimit(env, `eskpay:${ip}`, 10, 600);
        await rateLimit(env, `eskpays:${st.id}`, 10, 86400);
        const pend = await env.DB.prepare("SELECT COUNT(*) AS n FROM esk_payments WHERE student_id = ? AND status = 'pending'").bind(st.id).first();
        if ((pend?.n || 0) >= 5) throw new HttpError(409, 'You already have payments waiting for the school to check.');
        const b = await readJSON(request);
        const amount = money(b.amount); const reference = text(b.reference, 40).toUpperCase().replace(/\s+/g, '');
        if (!Number.isFinite(amount) || amount < 1 || amount > 1_000_000) throw new HttpError(400, 'Enter the amount you paid.');
        if (!/^[A-Z0-9-]{4,40}$/.test(reference)) throw new HttpError(400, 'Enter the reference number from your receipt.');
        await env.DB.prepare('INSERT INTO esk_payments (id, business_id, student_id, amount, paid_on, method, reference, receipt_no, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(randomHex(16), st.business_id, st.id, round(amount), isoOf(manilaToday()), ['GCash', 'Maya', 'Bank'].includes(b.method) ? b.method : 'GCash', reference, '', 'Sent from the parent portal', 'pending', now()).run();
      } else if (method !== 'GET') return null;
      return json(await parentView(env, st));
    }
    if ((m = pathname.match(/^\/api\/public\/eskwela\/([a-z0-9-]{3,40})$/)) && method === 'GET') {
      const biz = await env.DB.prepare('SELECT * FROM businesses WHERE slug = ?').bind(m[1]).first();
      if (!biz) throw new HttpError(404, 'This school’s page does not exist.');
      const s = await schoolOf(env, biz.id);
      const levels = (await env.DB.prepare('SELECT * FROM esk_levels WHERE business_id = ? ORDER BY sort').bind(biz.id).all()).results.map(levelOut);
      const out = schoolOut(s, biz);
      return json({ school: { name: out.name, slug: out.slug, motto: out.motto, address: out.address, city: out.city, phone: out.phone, email: out.email, principal: out.principal, schoolYear: out.schoolYear, enrolOpen: out.enrolOpen }, levels: levels.map(l => ({ id: l.id, name: l.name, hood: l.hood, fees: l.fees, subjects: l.subjects })) });
    }
    if ((m = pathname.match(/^\/api\/public\/eskwela\/([a-z0-9-]{3,40})\/enrol$/)) && method === 'POST') {
      const ip = request.headers.get('cf-connecting-ip') || 'local';
      await rateLimit(env, `eskapply:${ip}`, 5, 3600);
      const biz = await env.DB.prepare('SELECT * FROM businesses WHERE slug = ?').bind(m[1]).first();
      if (!biz) throw new HttpError(404, 'This school’s page does not exist.');
      const s = await schoolOf(env, biz.id);
      if (s && !s.enrol_open) throw new HttpError(409, 'Online enrolment is closed. Please contact the school office.');
      await rateLimit(env, `eskapplybiz:${biz.id}`, LIMITS.applyPerDay, 86400);
      if (await count(env, 'esk_students', biz.id) >= LIMITS.students) throw new HttpError(409, 'The school is not taking online applications right now.');
      const b = await readJSON(request);
      const st = cleanStudent({ ...b, discount: 0, discountNote: '' });
      if (!st.guardian) throw new HttpError(400, 'Enter the parent or guardian’s name.');
      if (!st.mobile) throw new HttpError(400, 'Enter a mobile number the school can reach.');
      if (!st.birthdate) throw new HttpError(400, 'Enter the student’s date of birth.');
      const lvl = await own(env, 'esk_levels', b.levelId, biz.id, 'Grade level');
      const ref = await nextRef(env, biz.id);
      await env.DB.prepare('INSERT INTO esk_students (id, business_id, ref, lrn, last_name, first_name, middle_name, birthdate, sex, level_id, section, guardian, relation, mobile, email, address, previous_school, discount, discount_note, status, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(randomHex(16), biz.id, ref, st.lrn, st.lastName, st.firstName, st.middleName, st.birthdate, st.sex, lvl.id, '', st.guardian, st.relation, st.mobile, st.email, st.address, st.previousSchool, 0, '', 'applicant', randomHex(24), now(), now()).run();
      return json({ ok: true, ref, level: lvl.name, school: biz.name }, 201);
    }
    return null;
  }

  async function parentView(env, st) {
    const [biz, s, lvlRow] = await Promise.all([
      env.DB.prepare('SELECT name, slug FROM businesses WHERE id = ?').bind(st.business_id).first(),
      schoolOf(env, st.business_id),
      env.DB.prepare('SELECT * FROM esk_levels WHERE id = ?').bind(st.level_id).first(),
    ]);
    const school = schoolOut(s, biz || { name: '', slug: '' });
    const lvl = lvlRow ? levelOut(lvlRow) : { name: '', hood: 'slate', subjects: [] };
    const [charges, payments, grades] = await Promise.all([
      env.DB.prepare('SELECT * FROM esk_charges WHERE student_id = ?').bind(st.id).all().then(r => r.results.map(chargeOut)),
      env.DB.prepare("SELECT * FROM esk_payments WHERE student_id = ? AND status IN ('confirmed','pending') ORDER BY paid_on DESC").bind(st.id).all().then(r => r.results.map(paymentOut)),
      env.DB.prepare('SELECT subject, quarter, grade FROM esk_grades WHERE student_id = ?').bind(st.id).all().then(r => r.results),
    ]);
    const l = ledger(charges, payments, manilaToday());
    const released = school.released;
    const view = {
      school: { name: school.name, slug: school.slug, motto: school.motto, address: school.address, city: school.city, phone: school.phone, principal: school.principal, registrar: school.registrar, schoolYear: school.schoolYear, gcash: school.gcash, plan: school.plan },
      student: { ref: st.ref, lrn: st.lrn, lastName: st.last_name, firstName: st.first_name, middleName: st.middle_name, level: lvl.name, hood: lvl.hood, section: st.section, status: st.status, guardian: st.guardian },
      account: { charges: l.charges.map(c => ({ label: c.label, amount: c.amount, due: c.due, paid: c.paid, left: c.left, status: c.status, lateDays: c.lateDays })), billed: l.billed, paid: l.paid, balance: l.balance, pending: l.pending, overdue: l.overdue, lateDays: l.lateDays, next: l.next ? { label: l.next.label, due: l.next.due, left: l.next.left } : null },
      payments: payments.map(p => ({ amount: p.amount, paidOn: p.paidOn, method: p.method, reference: p.reference, receiptNo: p.receiptNo, status: p.status })),
      released, subjects: lvl.subjects,
      grades: grades.filter(g => released.includes(g.quarter)).map(g => ({ subject: g.subject, quarter: g.quarter, grade: g.grade })),
    };
    if (school.plan === 'full') {
      const since = isoOf(new Date(manilaToday().getTime() - 120 * 86_400_000));
      const [att, notices] = await Promise.all([
        env.DB.prepare('SELECT day, mark FROM esk_attendance WHERE student_id = ? AND day >= ? ORDER BY day DESC').bind(st.id, since).all().then(r => r.results),
        env.DB.prepare("SELECT title, body, level_id, created_at FROM esk_notices WHERE business_id = ? AND (level_id = '' OR level_id = ?) ORDER BY created_at DESC LIMIT 10").bind(st.business_id, st.level_id).all().then(r => r.results),
      ]);
      view.attendance = att; view.notices = notices.map(n => ({ title: n.title, body: n.body, createdAt: n.created_at }));
    }
    return view;
  }

  /* RZ admin: set a school's plan once it is paid for. */
  async function admin(env, request, pathname, method) {
    if (pathname !== '/api/admin/eskwela') return null;
    if (method === 'GET') {
      const { results } = await env.DB.prepare('SELECT b.name, b.slug, s.plan FROM esk_schools s JOIN businesses b ON b.id = s.business_id ORDER BY b.name LIMIT 500').all();
      return json({ schools: results });
    }
    if (method === 'PATCH') {
      const b = await readJSON(request);
      if (!PLANS.includes(b.plan)) throw new HttpError(400, 'Choose plus or full.');
      const biz = await env.DB.prepare('SELECT id, name FROM businesses WHERE slug = ?').bind(String(b.slug || '').toLowerCase()).first();
      if (!biz) throw new HttpError(404, 'No school with that link name.');
      await env.DB.prepare("INSERT INTO esk_schools (business_id, plan) VALUES (?, ?) ON CONFLICT(business_id) DO UPDATE SET plan = excluded.plan").bind(biz.id, b.plan).run();
      return json({ ok: true, name: biz.name, plan: b.plan });
    }
    return null;
  }

  return { owner, publicRoute, admin };
}
