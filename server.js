const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error('ОШИБКА: SUPABASE_URL или SUPABASE_KEY не заданы');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/* =========================================================
   I18N
========================================================= */

const I18N = {
  ru: {
    homework_created: 'Домашнее задание создано',
    homework_saved: 'Задание сохранено',
    homework_reviewed: 'Домашнее задание проверено',
    news_published: 'Новость опубликована',
    news_updated: 'Новость обновлена',
    news_deleted: 'Новость удалена',
    comment_added: 'Комментарий добавлен',
    comment_deleted: 'Комментарий удалён',
    schedule_saved: 'Расписание сохранено',
    grade_saved: 'Оценка сохранена',
    server_ok: 'API Электронного журнала работает 🚀',
    errors: {
      required_login: 'Введите ИИН и пароль',
      bad_login: 'Неверный ИИН или пароль',
      forbidden: 'Нет доступа',
      group_required: 'group_id обязателен',
      title_required: 'title обязателен',
      description_required: 'description обязателен',
      deadline_required: 'deadline обязателен',
      student_required: 'student_id обязателен',
      teacher_required: 'teacherId обязателен',
      empty_comment: 'Комментарий не может быть пустым',
      bad_reaction: 'Некорректная реакция'
    }
  },
  kz: {
    homework_created: 'Үй тапсырмасы жасалды',
    homework_saved: 'Тапсырма сақталды',
    homework_reviewed: 'Үй тапсырмасы тексерілді',
    news_published: 'Жаңалық жарияланды',
    news_updated: 'Жаңалық жаңартылды',
    news_deleted: 'Жаңалық жойылды',
    comment_added: 'Пікір қосылды',
    comment_deleted: 'Пікір жойылды',
    schedule_saved: 'Кесте сақталды',
    grade_saved: 'Баға сақталды',
    server_ok: 'Электронды журнал API жұмыс істеп тұр 🚀',
    errors: {
      required_login: 'ИИН мен құпиясөзді енгізіңіз',
      bad_login: 'ИИН немесе құпиясөз қате',
      forbidden: 'Қолжетімділік жоқ',
      group_required: 'group_id міндетті',
      title_required: 'title міндетті',
      description_required: 'description міндетті',
      deadline_required: 'deadline міндетті',
      student_required: 'student_id міндетті',
      teacher_required: 'teacherId міндетті',
      empty_comment: 'Пікір бос болмауы керек',
      bad_reaction: 'Реакция қате'
    }
  },
  en: {
    homework_created: 'Homework created',
    homework_saved: 'Submission saved',
    homework_reviewed: 'Homework reviewed',
    news_published: 'News published',
    news_updated: 'News updated',
    news_deleted: 'News deleted',
    comment_added: 'Comment added',
    comment_deleted: 'Comment deleted',
    schedule_saved: 'Schedule saved',
    grade_saved: 'Grade saved',
    server_ok: 'Electronic journal API is running 🚀',
    errors: {
      required_login: 'Enter IIN and password',
      bad_login: 'Invalid IIN or password',
      forbidden: 'Access denied',
      group_required: 'group_id is required',
      title_required: 'title is required',
      description_required: 'description is required',
      deadline_required: 'deadline is required',
      student_required: 'student_id is required',
      teacher_required: 'teacherId is required',
      empty_comment: 'Comment cannot be empty',
      bad_reaction: 'Invalid reaction'
    }
  }
};

function getLang(req) {
  const raw = (req.headers['x-language'] || req.query.lang || req.headers['accept-language'] || 'ru').toString().slice(0, 2).toLowerCase();
  return ['ru', 'kz', 'en'].includes(raw) ? raw : 'ru';
}

function t(req, key, fallback = key) {
  const lang = getLang(req);
  const parts = key.split('.');
  let value = I18N[lang];
  for (const part of parts) value = value?.[part];
  return value || fallback;
}

app.get('/api/i18n/:lang', (req, res) => {
  const lang = ['ru', 'kz', 'en'].includes(req.params.lang) ? req.params.lang : 'ru';
  res.json(I18N[lang]);
});

/* =========================================================
   HELPERS
========================================================= */

function sendServerError(res, routeName, err) {
  console.error(`Ошибка ${routeName}:`, err);
  return res.status(500).json({ error: err.message || 'Внутренняя ошибка сервера' });
}

function sendBadRequest(res, error) {
  return res.status(400).json({
    error: typeof error === 'string' ? error : error?.message || 'Некорректный запрос'
  });
}

function sendForbidden(req, res, message) {
  return res.status(403).json({ error: message || t(req, 'errors.forbidden', 'Нет доступа') });
}

function parseNumber(value, fieldName, { required = false, allowNull = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${fieldName} обязателен`);
    return allowNull ? null : undefined;
  }
  const num = Number(value);
  if (Number.isNaN(num)) throw new Error(`${fieldName} должен быть числом`);
  return num;
}

function parseString(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function parseBoolean(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

function getMonthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month должен быть в формате YYYY-MM');
  const [year, monthNum] = month.split('-').map(Number);
  const startDate = new Date(Date.UTC(year, monthNum - 1, 1));
  const endDate = new Date(Date.UTC(year, monthNum, 1));
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  return {
    year,
    monthNum,
    startISO: startDate.toISOString(),
    endISO: endDate.toISOString(),
    daysInMonth,
    monthLabel: `${String(monthNum).padStart(2, '0')}.${year}`
  };
}

async function removeTempFile(filePath) {
  if (!filePath) return;
  try { await fs.promises.unlink(filePath); } catch {}
}

async function getOrCreateSubjectId(subjectTitle, subjectId = null) {
  if (subjectId) return Number(subjectId);
  const title = parseString(subjectTitle);
  if (!title) return null;

  const { data: existing, error: findError } = await supabase
    .from('subjects')
    .select('id, title')
    .ilike('title', title)
    .maybeSingle();

  if (!findError && existing?.id) return existing.id;

  const { data: created, error: insertError } = await supabase
    .from('subjects')
    .insert([{ title }])
    .select('id')
    .single();

  if (insertError) {
    console.warn('Не удалось создать subject, используем null:', insertError.message);
    return null;
  }
  return created.id;
}

function normalizeScheduleRows(rows, groupId) {
  return (Array.isArray(rows) ? rows : []).map(row => ({
    group_id: Number(row.group_id || groupId),
    day_of_week: Number(row.day_of_week),
    lesson_number: Number(row.lesson_number),
    subject_id: row.subject_id ? Number(row.subject_id) : null,
    room: parseString(row.room) || ''
  })).filter(row => row.group_id && row.day_of_week && row.lesson_number);
}

/* =========================================================
   UPLOADS
========================================================= */

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads', 'submissions');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const safeOriginal = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/[^\wа-яА-ЯёЁ.\- ]/g, '_');
    cb(null, `${Date.now()}-${safeOriginal}`);
  }
});

const upload = multer({ storage });

/* =========================================================
   ROOT / LOGIN
========================================================= */

app.get('/', (req, res) => res.send(t(req, 'server_ok', 'API работает')));

app.post('/api/login', async (req, res) => {
  try {
    let { iin, password } = req.body;
    iin = parseString(iin);
    password = parseString(password);

    if (!iin || !password) return sendBadRequest(res, t(req, 'errors.required_login'));

    const { data: user, error } = await supabase
      .from('profiles')
      .select('id, role, full_name, group_id, course, specialization, iin, password, can_edit_news, can_edit_schedule, avatar_url')
      .eq('iin', iin)
      .maybeSingle();

    if (error) return sendBadRequest(res, error);
    if (!user || String(user.password) !== password) return res.status(401).json({ error: t(req, 'errors.bad_login') });

    delete user.password;
    return res.json(user);
  } catch (err) {
    return sendServerError(res, '/api/login', err);
  }
});

/* =========================================================
   SUBJECTS
========================================================= */

app.get('/api/groups', async (req, res) => {
  try {
    const { data, error } = await supabase.from('groups').select('id, name').order('name', { ascending: true });
    if (error) return sendBadRequest(res, error);
    return res.json(data || []);
  } catch (err) {
    return sendServerError(res, '/api/groups', err);
  }
});

app.get('/api/subjects', async (req, res) => {
  try {
    const fallback = [
      'Математика', 'Информатика', 'Физика', 'Английский язык', 'Русский язык',
      'Казахский язык', 'История Казахстана', 'Всемирная история',
      'База данных', 'Веб-разработка', 'JavaScript', 'C#', 'Python',
      'Операционные системы', 'Компьютерные сети'
    ];

    const { data, error } = await supabase
      .from('subjects')
      .select('id, title')
      .order('title', { ascending: true });

    if (error || !data?.length) {
      return res.json(fallback.map((title, i) => ({ id: null, title, sort: i + 1 })));
    }

    return res.json(data);
  } catch (err) {
    return sendServerError(res, '/api/subjects', err);
  }
});

/* =========================================================
   JOURNAL / GRADES
========================================================= */

function parseGradeInput(value) {
  const raw = String(value ?? '').trim().toUpperCase();
  if (['Н', 'У', 'О'].includes(raw)) return raw;
  const number = Number(raw);
  if (!Number.isNaN(number) && number >= 0 && number <= 100) return String(number);
  return null;
}


app.get('/api/journal/:groupId', async (req, res) => {
  try {
    const groupId = parseNumber(req.params.groupId, 'groupId', { required: true });
    const studentId = parseString(req.query.studentId);

    let query = supabase
      .from('journal')
      .select('id, student_id, subject_id, grade, created_at, comment, group_id, subjects(title), profiles:student_id(full_name)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    if (studentId) query = query.eq('student_id', studentId);

    const { data, error } = await query;
    if (error) return sendBadRequest(res, error);
    return res.json(data || []);
  } catch (err) {
    return sendServerError(res, '/api/journal/:groupId', err);
  }
});

app.post('/api/journal', async (req, res) => {
  try {
    const group_id = parseNumber(req.body.group_id, 'group_id', { required: true });
    const student_id = parseString(req.body.student_id);
    const grade = parseGradeInput(req.body.grade);
    const comment = parseString(req.body.comment);
    const created_at = parseString(req.body.created_at) || new Date().toISOString();
    const subject_id = await getOrCreateSubjectId(req.body.subject_title, req.body.subject_id);

    if (!student_id) return sendBadRequest(res, t(req, 'errors.student_required'));
    if (grade === null) return sendBadRequest(res, 'grade должен быть 0-100, Н, У или О');

    const payload = { group_id, student_id, subject_id, grade, comment, created_at };

    const { data, error } = await supabase
      .from('journal')
      .insert([payload])
      .select('id, student_id, subject_id, grade, created_at, comment, group_id, subjects(title)')
      .single();

    if (error) return sendBadRequest(res, error);
    return res.status(201).json({ message: t(req, 'grade_saved'), grade: data });
  } catch (err) {
    return sendServerError(res, 'POST /api/journal', err);
  }
});

app.put('/api/journal/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const payload = {};
    if (req.body.grade !== undefined) {
      const nextGrade = parseGradeInput(req.body.grade);
      if (nextGrade === null) return sendBadRequest(res, 'grade должен быть 0-100, Н, У или О');
      payload.grade = nextGrade;
    }
    if (req.body.comment !== undefined) payload.comment = parseString(req.body.comment);
    if (req.body.created_at !== undefined) payload.created_at = parseString(req.body.created_at);

    const subject_id = await getOrCreateSubjectId(req.body.subject_title, req.body.subject_id);
    if (subject_id) payload.subject_id = subject_id;

    const { data, error } = await supabase
      .from('journal')
      .update(payload)
      .eq('id', id)
      .select('id, student_id, subject_id, grade, created_at, comment, group_id, subjects(title)')
      .single();

    if (error) return sendBadRequest(res, error);
    return res.json({ message: t(req, 'grade_saved'), grade: data });
  } catch (err) {
    return sendServerError(res, 'PUT /api/journal/:id', err);
  }
});

app.delete('/api/journal/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const { error } = await supabase.from('journal').delete().eq('id', id);
    if (error) return sendBadRequest(res, error);
    return res.json({ message: 'Оценка удалена' });
  } catch (err) {
    return sendServerError(res, 'DELETE /api/journal/:id', err);
  }
});

/* =========================================================
   HOMEWORK MODULES / COURSE TREE V2
========================================================= */

function normalizeSection(section) {
  return {
    ...section,
    materials: [],
    homework: [],
    tests: [],
    subsections: []
  };
}

function buildHomeworkModules({ sections = [], materials = [], homework = [], submissions = [], tests = [], testAttempts = [] }) {
  const sectionMap = new Map();
  const result = [];

  (sections || []).forEach(section => {
    const normalized = normalizeSection(section);
    sectionMap.set(Number(section.id), normalized);
  });

  (sections || []).forEach(section => {
    const normalized = sectionMap.get(Number(section.id));
    const parentId = Number(section.parent_id);
    const parent = Number.isFinite(parentId) ? sectionMap.get(parentId) : null;
    if (parent && parent.id !== normalized.id) parent.subsections.push(normalized);
    else result.push(normalized);
  });

  const legacyHomework = [];

  (materials || []).forEach(material => {
    const section = sectionMap.get(Number(material.section_id));
    if (section) section.materials.push(material);
  });

  (homework || []).forEach(hw => {
    const submission = (submissions || []).find(sub => Number(sub.homework_id) === Number(hw.id)) || null;
    const normalizedHw = { ...hw, submission };
    const section = hw.section_id ? sectionMap.get(Number(hw.section_id)) : null;

    if (section) section.homework.push(normalizedHw);
    else legacyHomework.push(normalizedHw);
  });

  (tests || []).forEach(test => {
    const attempts = (testAttempts || [])
      .filter(item => Number(item.test_id) === Number(test.id))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const attempt = attempts[0] || null;
    const attemptsCount = attempts.length;
    const attemptsLimit = Number(test.attempts_limit || 1);
    const canAttempt = attemptsLimit <= 0 || attemptsCount < attemptsLimit;
    const normalizedTest = { ...test, attempt, attempts_count: attemptsCount, can_attempt: canAttempt };
    const section = test.section_id ? sectionMap.get(Number(test.section_id)) : null;
    if (section) section.tests.push(normalizedTest);
  });

  if (legacyHomework.length) {
    result.push({
      id: 'legacy',
      group_id: legacyHomework[0]?.group_id || null,
      subject_id: null,
      subject_title: 'Без раздела',
      title: 'Без раздела',
      description: 'Старые задания, которые были созданы до модульной структуры.',
      order_index: 999999,
      created_by: null,
      created_at: null,
      updated_at: null,
      is_virtual: true,
      materials: [],
      homework: legacyHomework,
      tests: []
    });
  }

  result.forEach(section => {
    section.materials.sort((a, b) => (a.order_index || 0) - (b.order_index || 0) || Number(a.id) - Number(b.id));
    section.homework.sort((a, b) => (a.order_index || 0) - (b.order_index || 0) || Number(a.id) - Number(b.id));
    section.tests.sort((a, b) => (a.order_index || 0) - (b.order_index || 0) || Number(a.id) - Number(b.id));
  });

  return result;
}

app.get('/api/homework-modules/:groupId', async (req, res) => {
  try {
    const groupId = parseNumber(req.params.groupId, 'groupId', { required: true });
    const studentId = parseString(req.query.studentId);

    const [sectionsResult, homeworkResult] = await Promise.all([
      supabase
        .from('homework_sections')
        .select('*')
        .eq('group_id', groupId)
        .order('order_index', { ascending: true })
        .order('id', { ascending: true }),
      supabase
        .from('homework')
        .select('*')
        .eq('group_id', groupId)
        .order('order_index', { ascending: true })
        .order('id', { ascending: true })
    ]);

    if (sectionsResult.error) return sendBadRequest(res, sectionsResult.error);
    if (homeworkResult.error) return sendBadRequest(res, homeworkResult.error);

    const sections = sectionsResult.data || [];
    const homeworkData = homeworkResult.data || [];
    const sectionIds = sections.map(section => section.id);
    const homeworkIds = homeworkData.map(hw => hw.id);

    let materials = [];
    if (sectionIds.length) {
      const { data, error } = await supabase
        .from('homework_materials')
        .select('*')
        .in('section_id', sectionIds)
        .order('order_index', { ascending: true })
        .order('id', { ascending: true });
      if (error) return sendBadRequest(res, error);
      materials = data || [];
    }

    let tests = [];
    let testAttempts = [];
    if (sectionIds.length) {
      const { data: testsData, error: testsError } = await supabase
        .from('lms_tests')
        .select('*, questions:lms_test_questions(*)')
        .in('section_id', sectionIds)
        .order('order_index', { ascending: true })
        .order('id', { ascending: true });
      if (!testsError) tests = testsData || [];
    }

    if (studentId && tests.length) {
      const { data: attemptsData, error: attemptsError } = await supabase
        .from('lms_test_attempts')
        .select('*')
        .eq('student_id', studentId)
        .in('test_id', tests.map(test => test.id))
        .order('created_at', { ascending: false });
      if (!attemptsError) testAttempts = attemptsData || [];
    }

    let submissions = [];
    if (studentId && homeworkIds.length) {
      const { data, error } = await supabase
        .from('homework_submissions')
        .select('*')
        .eq('student_id', studentId)
        .in('homework_id', homeworkIds);
      if (error) return sendBadRequest(res, error);
      submissions = data || [];
    }

    return res.json({ sections: buildHomeworkModules({ sections, materials, homework: homeworkData, submissions, tests, testAttempts }) });
  } catch (err) {
    return sendServerError(res, '/api/homework-modules/:groupId', err);
  }
});


app.post('/api/lms-tests', async (req, res) => {
  try {
    const section_id = parseNumber(req.body.section_id, 'section_id', { required: true });
    const title = parseString(req.body.title) || 'Новый тест';
    const description = parseString(req.body.description) || '';
    const time_limit_minutes = parseNumber(req.body.time_limit_minutes, 'time_limit_minutes') ?? 20;
    const attempts_limit = parseNumber(req.body.attempts_limit, 'attempts_limit') ?? 1;
    const order_index = parseNumber(req.body.order_index, 'order_index') ?? 0;
    const created_by = parseString(req.body.created_by);
    const is_published = req.body.is_published === true || req.body.is_published === 'true';

    const { data: section, error: sectionError } = await supabase
      .from('homework_sections')
      .select('*')
      .eq('id', section_id)
      .maybeSingle();
    if (sectionError) return sendBadRequest(res, sectionError);
    if (!section) return sendBadRequest(res, 'Раздел не найден');

    const payload = {
      section_id,
      group_id: section.group_id,
      subject_title: section.subject_title,
      title,
      description,
      time_limit_minutes,
      attempts_limit,
      order_index,
      created_by,
      is_published
    };
    Object.keys(payload).forEach(key => payload[key] === null && delete payload[key]);
    const { data, error } = await supabase.from('lms_tests').insert([payload]).select().single();
    if (error) return sendBadRequest(res, error);
    return res.status(201).json({ message: 'Тест создан', test: data });
  } catch (err) {
    return sendServerError(res, 'POST /api/lms-tests', err);
  }
});

app.put('/api/lms-tests/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const payload = {
      title: parseString(req.body.title),
      description: parseString(req.body.description),
      time_limit_minutes: parseNumber(req.body.time_limit_minutes, 'time_limit_minutes'),
      attempts_limit: parseNumber(req.body.attempts_limit, 'attempts_limit'),
      is_published: req.body.is_published === undefined ? undefined : (req.body.is_published === true || req.body.is_published === 'true'),
      updated_at: new Date().toISOString()
    };
    Object.keys(payload).forEach(key => (payload[key] === null || payload[key] === undefined) && delete payload[key]);
    const { data, error } = await supabase.from('lms_tests').update(payload).eq('id', id).select().single();
    if (error) return sendBadRequest(res, error);
    return res.json({ message: 'Тест обновлён', test: data });
  } catch (err) {
    return sendServerError(res, 'PUT /api/lms-tests/:id', err);
  }
});

app.delete('/api/lms-tests/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const { error } = await supabase.from('lms_tests').delete().eq('id', id);
    if (error) return sendBadRequest(res, error);
    return res.json({ message: 'Тест удалён' });
  } catch (err) {
    return sendServerError(res, 'DELETE /api/lms-tests/:id', err);
  }
});

app.post('/api/lms-tests/:id/questions', async (req, res) => {
  try {
    const test_id = parseNumber(req.params.id, 'id', { required: true });
    const text = parseString(req.body.text) || 'Новый вопрос';
    const type = parseString(req.body.type) || 'single';
    const options = Array.isArray(req.body.options) ? req.body.options.map(String) : ['Вариант 1', 'Вариант 2'];
    const correct_answers = Array.isArray(req.body.correct_answers) ? req.body.correct_answers.map(Number) : [0];
    const points = parseNumber(req.body.points, 'points') ?? 1;
    const order_index = parseNumber(req.body.order_index, 'order_index') ?? 0;
    const { data, error } = await supabase.from('lms_test_questions').insert([{ test_id, text, type, options, correct_answers, points, order_index }]).select().single();
    if (error) return sendBadRequest(res, error);
    return res.status(201).json({ message: 'Вопрос добавлен', question: data });
  } catch (err) {
    return sendServerError(res, 'POST /api/lms-tests/:id/questions', err);
  }
});

app.put('/api/lms-test-questions/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const payload = {
      text: parseString(req.body.text),
      type: parseString(req.body.type),
      options: Array.isArray(req.body.options) ? req.body.options.map(String) : undefined,
      correct_answers: Array.isArray(req.body.correct_answers) ? req.body.correct_answers.map(Number) : undefined,
      points: parseNumber(req.body.points, 'points'),
      order_index: parseNumber(req.body.order_index, 'order_index')
    };
    Object.keys(payload).forEach(key => (payload[key] === null || payload[key] === undefined) && delete payload[key]);
    const { data, error } = await supabase.from('lms_test_questions').update(payload).eq('id', id).select().single();
    if (error) return sendBadRequest(res, error);
    return res.json({ message: 'Вопрос обновлён', question: data });
  } catch (err) {
    return sendServerError(res, 'PUT /api/lms-test-questions/:id', err);
  }
});

app.delete('/api/lms-test-questions/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const { error } = await supabase.from('lms_test_questions').delete().eq('id', id);
    if (error) return sendBadRequest(res, error);
    return res.json({ message: 'Вопрос удалён' });
  } catch (err) {
    return sendServerError(res, 'DELETE /api/lms-test-questions/:id', err);
  }
});

app.post('/api/student/tests/:id/submit', async (req, res) => {
  try {
    const test_id = parseNumber(req.params.id, 'id', { required: true });
    const student_id = parseString(req.body.student_id);
    if (!student_id) return sendBadRequest(res, 'student_id обязателен');
    const answers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
    const duration_seconds = parseNumber(req.body.duration_seconds, 'duration_seconds') ?? 0;

    const { data: test, error: testError } = await supabase
      .from('lms_tests')
      .select('*, questions:lms_test_questions(*)')
      .eq('id', test_id)
      .maybeSingle();
    if (testError) return sendBadRequest(res, testError);
    if (!test) return sendBadRequest(res, 'Тест не найден');

    const questions = test.questions || [];
    let total = 0;
    let score = 0;
    questions.forEach(question => {
      const points = Number(question.points || 1);
      total += points;
      const correct = (question.correct_answers || []).map(Number).sort((a, b) => a - b);
      const givenRaw = answers[String(question.id)] ?? answers[question.id] ?? [];
      const given = (Array.isArray(givenRaw) ? givenRaw : [givenRaw]).map(Number).sort((a, b) => a - b);
      if (JSON.stringify(correct) === JSON.stringify(given)) score += points;
    });
    const percent = total > 0 ? Math.round((score / total) * 100) : 0;

    const { data: previous } = await supabase
      .from('lms_test_attempts')
      .select('*')
      .eq('test_id', test_id)
      .eq('student_id', student_id);
    const attemptsCount = (previous || []).length;
    const limit = Number(test.attempts_limit || 1);
    if (limit > 0 && attemptsCount >= limit) return sendBadRequest(res, 'Попытки закончились');

    const payload = { test_id, student_id, answers, score, total_score: total, percent, duration_seconds, status: 'completed' };
    const { data, error } = await supabase.from('lms_test_attempts').insert([payload]).select().single();
    if (error) return sendBadRequest(res, error);
    return res.status(201).json({ message: 'Тест отправлен', attempt: data });
  } catch (err) {
    return sendServerError(res, 'POST /api/student/tests/:id/submit', err);
  }
});

app.get('/api/homework/:groupId', async (req, res) => {
  try {
    const groupId = parseNumber(req.params.groupId, 'groupId', { required: true });
    const { data, error } = await supabase
      .from('homework')
      .select('*')
      .eq('group_id', groupId)
      .order('order_index', { ascending: true })
      .order('id', { ascending: false });
    if (error) return sendBadRequest(res, error);
    return res.json(data || []);
  } catch (err) {
    return sendServerError(res, '/api/homework/:groupId', err);
  }
});

app.get('/api/student/homework/:groupId/:studentId', async (req, res) => {
  try {
    const groupId = parseNumber(req.params.groupId, 'groupId', { required: true });
    const studentId = parseString(req.params.studentId);
    if (!studentId) return sendBadRequest(res, t(req, 'errors.student_required'));

    const { data: homeworkData, error: hwError } = await supabase
      .from('homework')
      .select('*')
      .eq('group_id', groupId)
      .order('order_index', { ascending: true })
      .order('id', { ascending: false });
    if (hwError) return sendBadRequest(res, hwError);

    const homeworkIds = (homeworkData || []).map(item => item.id);
    let submissions = [];

    if (homeworkIds.length > 0) {
      const { data: subData, error: subError } = await supabase
        .from('homework_submissions')
        .select('*')
        .eq('student_id', studentId)
        .in('homework_id', homeworkIds);
      if (subError) return sendBadRequest(res, subError);
      submissions = subData || [];
    }

    return res.json((homeworkData || []).map(hw => ({ ...hw, submission: submissions.find(sub => sub.homework_id === hw.id) || null })));
  } catch (err) {
    return sendServerError(res, '/api/student/homework/:groupId/:studentId', err);
  }
});

app.post('/api/homework-sections', async (req, res) => {
  try {
    const group_id = parseNumber(req.body.group_id, 'group_id', { required: true });
    const subject_title = parseString(req.body.subject_title);
    const subject_id = await getOrCreateSubjectId(subject_title, req.body.subject_id);
    const title = parseString(req.body.title);
    const description = parseString(req.body.description);
    const order_index = parseNumber(req.body.order_index, 'order_index') ?? 0;
    const created_by = parseString(req.body.created_by);

    if (!title) return sendBadRequest(res, t(req, 'errors.title_required'));

    const parent_id = parseNumber(req.body.parent_id, 'parent_id');
    const payload = { group_id, subject_id, subject_title, title, description, parent_id, order_index, created_by };
    Object.keys(payload).forEach(key => payload[key] === null && delete payload[key]);
    const { data, error } = await supabase.from('homework_sections').insert([payload]).select().single();
    if (error) return sendBadRequest(res, error);
    return res.status(201).json({ message: 'Раздел создан', section: data });
  } catch (err) {
    return sendServerError(res, 'POST /api/homework-sections', err);
  }
});

app.put('/api/homework-sections/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const payload = {
      title: parseString(req.body.title),
      description: parseString(req.body.description),
      subject_title: parseString(req.body.subject_title),
      parent_id: parseNumber(req.body.parent_id, 'parent_id'),
      order_index: parseNumber(req.body.order_index, 'order_index') ?? 0,
      updated_at: new Date().toISOString()
    };
    Object.keys(payload).forEach(key => payload[key] === null && delete payload[key]);

    const { data, error } = await supabase.from('homework_sections').update(payload).eq('id', id).select().single();
    if (error) return sendBadRequest(res, error);
    return res.json({ message: 'Раздел обновлён', section: data });
  } catch (err) {
    return sendServerError(res, 'PUT /api/homework-sections/:id', err);
  }
});

app.delete('/api/homework-sections/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const { error } = await supabase.from('homework_sections').delete().eq('id', id);
    if (error) return sendBadRequest(res, error);
    return res.json({ message: 'Раздел удалён' });
  } catch (err) {
    return sendServerError(res, 'DELETE /api/homework-sections/:id', err);
  }
});

app.post('/api/homework-materials', async (req, res) => {
  try {
    const section_id = parseNumber(req.body.section_id, 'section_id', { required: true });
    const title = parseString(req.body.title);
    const type = parseString(req.body.type) || 'file';
    const file_url = parseString(req.body.file_url);
    const file_name = parseString(req.body.file_name);
    const content = parseString(req.body.content);
    const order_index = parseNumber(req.body.order_index, 'order_index') ?? 0;
    const created_by = parseString(req.body.created_by);

    if (!title) return sendBadRequest(res, t(req, 'errors.title_required'));

    const payload = { section_id, title, type, file_url, file_name, content, order_index, created_by };
    Object.keys(payload).forEach(key => payload[key] === null && delete payload[key]);
    const { data, error } = await supabase.from('homework_materials').insert([payload]).select().single();
    if (error) return sendBadRequest(res, error);
    return res.status(201).json({ message: 'Материал добавлен', material: data });
  } catch (err) {
    return sendServerError(res, 'POST /api/homework-materials', err);
  }
});

app.put('/api/homework-materials/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const payload = {
      title: parseString(req.body.title),
      type: parseString(req.body.type),
      file_url: parseString(req.body.file_url),
      file_name: parseString(req.body.file_name),
      content: parseString(req.body.content),
      order_index: parseNumber(req.body.order_index, 'order_index'),
      updated_at: new Date().toISOString()
    };
    Object.keys(payload).forEach(key => payload[key] === null && delete payload[key]);

    const { data, error } = await supabase.from('homework_materials').update(payload).eq('id', id).select().single();
    if (error) return sendBadRequest(res, error);
    return res.json({ message: 'Материал обновлён', material: data });
  } catch (err) {
    return sendServerError(res, 'PUT /api/homework-materials/:id', err);
  }
});

app.delete('/api/homework-materials/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const { error } = await supabase.from('homework_materials').delete().eq('id', id);
    if (error) return sendBadRequest(res, error);
    return res.json({ message: 'Материал удалён' });
  } catch (err) {
    return sendServerError(res, 'DELETE /api/homework-materials/:id', err);
  }
});

app.post('/api/homework-materials/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendBadRequest(res, 'Файл не выбран');
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/submissions/${req.file.filename}`;
    const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    return res.status(201).json({ file_url: fileUrl, file_name: fileName });
  } catch (err) {
    return sendServerError(res, 'POST /api/homework-materials/upload', err);
  }
});

app.post('/api/homework-attachments/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendBadRequest(res, 'Файл не выбран');
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/submissions/${req.file.filename}`;
    const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    return res.status(201).json({ attachment_url: fileUrl, attachment_name: fileName, file_url: fileUrl, file_name: fileName });
  } catch (err) {
    return sendServerError(res, 'POST /api/homework-attachments/upload', err);
  }
});

app.post('/api/homework', async (req, res) => {
  try {
    const section_id = parseNumber(req.body.section_id, 'section_id');
    if (!section_id) return sendBadRequest(res, 'Выберите раздел: section_id обязателен для нового формата ДЗ');

    const { data: section, error: sectionError } = await supabase
      .from('homework_sections')
      .select('*')
      .eq('id', section_id)
      .maybeSingle();

    if (sectionError) return sendBadRequest(res, sectionError);
    if (!section) return sendBadRequest(res, 'Раздел не найден');

    const group_id = Number(section.group_id);
    const subject_title = section.subject_title || parseString(req.body.subject_title);
    const subject_id = section.subject_id || await getOrCreateSubjectId(subject_title, req.body.subject_id);
    const title = parseString(req.body.title);
    const description = parseString(req.body.description);
    const format = parseString(req.body.format) || 'онлайн';
    const deadline = parseString(req.body.deadline);
    const attachment_url = parseString(req.body.attachment_url);
    const attachment_name = parseString(req.body.attachment_name);
    const order_index = parseNumber(req.body.order_index, 'order_index') ?? 0;
    const created_by = parseString(req.body.created_by);

    if (!title) return sendBadRequest(res, t(req, 'errors.title_required'));
    if (!description) return sendBadRequest(res, t(req, 'errors.description_required'));
    if (!deadline) return sendBadRequest(res, t(req, 'errors.deadline_required'));

    const payload = {
      group_id,
      section_id,
      subject_id,
      subject_title,
      title,
      description,
      format,
      deadline,
      attachment_url,
      attachment_name,
      order_index,
      created_by
    };
    Object.keys(payload).forEach(key => payload[key] === null && delete payload[key]);

    const { data, error } = await supabase.from('homework').insert([payload]).select().single();

    if (error) return sendBadRequest(res, error);
    return res.status(201).json({ message: t(req, 'homework_created'), homework: data });
  } catch (err) {
    return sendServerError(res, 'POST /api/homework', err);
  }
});

app.put('/api/homework/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const payload = {
      section_id: parseNumber(req.body.section_id, 'section_id'),
      subject_title: parseString(req.body.subject_title),
      title: parseString(req.body.title),
      description: parseString(req.body.description),
      deadline: parseString(req.body.deadline),
      format: parseString(req.body.format),
      attachment_url: parseString(req.body.attachment_url),
      attachment_name: parseString(req.body.attachment_name),
      order_index: parseNumber(req.body.order_index, 'order_index'),
      updated_at: new Date().toISOString()
    };
    Object.keys(payload).forEach(key => payload[key] === null && delete payload[key]);

    const { data, error } = await supabase.from('homework').update(payload).eq('id', id).select().single();
    if (error) return sendBadRequest(res, error);
    return res.json({ message: 'Задание обновлено', homework: data });
  } catch (err) {
    return sendServerError(res, 'PUT /api/homework/:id', err);
  }
});

app.delete('/api/homework/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const { error } = await supabase.from('homework').delete().eq('id', id);
    if (error) return sendBadRequest(res, error);
    return res.json({ message: 'Задание удалено' });
  } catch (err) {
    return sendServerError(res, 'DELETE /api/homework/:id', err);
  }
});

app.post('/api/submit-homework', upload.single('file'), async (req, res) => {
  try {
    const homework_id = parseNumber(req.body.homework_id, 'homework_id', { required: true });
    const student_id = parseString(req.body.student_id);
    const answer_text = parseString(req.body.answer_text);
    const file = req.file;

    if (!student_id) {
      if (file?.path) await removeTempFile(file.path);
      return sendBadRequest(res, t(req, 'errors.student_required'));
    }

    if (!answer_text && !file) {
      return sendBadRequest(res, 'Добавьте текст ответа или файл');
    }

    const fileUrl = file ? `${req.protocol}://${req.get('host')}/uploads/submissions/${file.filename}` : null;
    const fileName = file ? Buffer.from(file.originalname, 'latin1').toString('utf8') : null;

    const { data: existing, error: existingError } = await supabase
      .from('homework_submissions')
      .select('*')
      .eq('homework_id', homework_id)
      .eq('student_id', student_id)
      .maybeSingle();

    if (existingError) {
      if (file?.path) await removeTempFile(file.path);
      return sendBadRequest(res, existingError);
    }

    const now = new Date().toISOString();
    const payload = {
      homework_id,
      student_id,
      answer_text,
      status: 'submitted',
      grade: null,
      teacher_comment: null,
      submitted_at: existing?.submitted_at || now,
      updated_at: now,
      reviewed_at: null
    };

    if (fileName && fileUrl) {
      payload.file_name = fileName;
      payload.file_path = fileUrl;
    } else if (!existing) {
      payload.file_name = null;
      payload.file_path = null;
    }

    let result, error;
    if (existing) {
      ({ data: result, error } = await supabase.from('homework_submissions').update(payload).eq('id', existing.id).select().single());
    } else {
      ({ data: result, error } = await supabase.from('homework_submissions').insert([payload]).select().single());
    }

    if (error) {
      if (file?.path) await removeTempFile(file.path);
      return sendBadRequest(res, error);
    }

    return res.json({ message: t(req, 'homework_saved'), submission: result });
  } catch (err) {
    if (req.file?.path) await removeTempFile(req.file.path);
    return sendServerError(res, '/api/submit-homework', err);
  }
});

app.delete('/api/homework-submissions/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const studentId = parseString(req.query.studentId);

    let query = supabase.from('homework_submissions').delete().eq('id', id);
    if (studentId) query = query.eq('student_id', studentId);

    const { error } = await query;
    if (error) return sendBadRequest(res, error);
    return res.json({ message: 'Ответ удалён' });
  } catch (err) {
    return sendServerError(res, 'DELETE /api/homework-submissions/:id', err);
  }
});

app.get('/api/teacher/homework/submissions/:homeworkId', async (req, res) => {
  try {
    const homeworkId = parseNumber(req.params.homeworkId, 'homeworkId', { required: true });
    const { data: submissions, error } = await supabase
      .from('homework_submissions')
      .select('*')
      .eq('homework_id', homeworkId)
      .order('submitted_at', { ascending: false });
    if (error) return sendBadRequest(res, error);

    const studentIds = [...new Set((submissions || []).map(item => item.student_id).filter(Boolean))];
    let students = [];
    if (studentIds.length) {
      const { data, error: stError } = await supabase
        .from('profiles')
        .select('id, full_name, group_id')
        .in('id', studentIds);
      if (stError) return sendBadRequest(res, stError);
      students = data || [];
    }

    return res.json((submissions || []).map(sub => ({
      ...sub,
      student: students.find(student => student.id === sub.student_id) || null
    })));
  } catch (err) {
    return sendServerError(res, '/api/teacher/homework/submissions/:homeworkId', err);
  }
});

app.get('/api/teacher/homework/pending/:teacherId', async (req, res) => {
  try {
    const teacherId = parseString(req.params.teacherId);
    const role = parseString(req.query.role);
    if (!teacherId) return sendBadRequest(res, t(req, 'errors.teacher_required'));

    let groupIds = [];
    if (role === 'admin' || role === 'администратор') {
      const { data: allGroups, error: allGroupsError } = await supabase.from('groups').select('id');
      if (allGroupsError) return sendBadRequest(res, allGroupsError);
      groupIds = (allGroups || []).map(item => item.id).filter(Boolean);
    } else {
      const { data: teacherGroups, error: tgError } = await supabase
        .from('teacher_groups')
        .select('group_id')
        .eq('teacher_id', teacherId);
      if (tgError) return sendBadRequest(res, tgError);
      groupIds = (teacherGroups || []).map(item => item.group_id).filter(Boolean);
    }

    if (!groupIds.length) return res.json([]);

    const [{ data: homeworkData, error: hwError }, { data: testsData, error: testsError }, { data: groupsData, error: groupsError }] = await Promise.all([
      supabase.from('homework').select('*').in('group_id', groupIds),
      supabase.from('lms_tests').select('*').in('group_id', groupIds),
      supabase.from('groups').select('id, name').in('id', groupIds)
    ]);
    if (hwError) return sendBadRequest(res, hwError);
    if (testsError) return sendBadRequest(res, testsError);
    if (groupsError) return sendBadRequest(res, groupsError);

    const homeworkIds = (homeworkData || []).map(item => item.id);
    const testIds = (testsData || []).map(item => item.id);

    let submissions = [];
    if (homeworkIds.length) {
      const { data, error } = await supabase
        .from('homework_submissions')
        .select('*')
        .in('homework_id', homeworkIds)
        .eq('status', 'submitted')
        .is('grade', null)
        .order('submitted_at', { ascending: false });
      if (error) return sendBadRequest(res, error);
      submissions = data || [];
    }

    let testAttempts = [];
    if (testIds.length) {
      const { data, error } = await supabase
        .from('lms_test_attempts')
        .select('*')
        .in('test_id', testIds)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });
      if (error) return sendBadRequest(res, error);
      testAttempts = data || [];
    }

    const studentIds = [...new Set([
      ...submissions.map(item => item.student_id),
      ...testAttempts.map(item => item.student_id)
    ].filter(Boolean))];

    let students = [];
    if (studentIds.length) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, group_id')
        .in('id', studentIds);
      if (error) return sendBadRequest(res, error);
      students = data || [];
    }

    const homeworkRows = submissions.map(sub => {
      const hw = (homeworkData || []).find(item => Number(item.id) === Number(sub.homework_id));
      const student = (students || []).find(item => String(item.id) === String(sub.student_id));
      const group = (groupsData || []).find(item => Number(item.id) === Number(hw?.group_id));
      return {
        kind: 'homework',
        submission_id: sub.id,
        homework_id: sub.homework_id,
        homework_title: hw?.title || 'Без названия',
        homework_description: hw?.description || '',
        subject_title: hw?.subject_title || '',
        group_id: hw?.group_id || null,
        group_name: group?.name || '',
        student_id: sub.student_id,
        student_name: student?.full_name || 'Без имени',
        answer_text: sub.answer_text || '',
        file_name: sub.file_name || '',
        file_path: sub.file_path || '',
        file_url: sub.file_path || '',
        submitted_at: sub.submitted_at,
        status: sub.status
      };
    });

    const testRows = testAttempts.map(attempt => {
      const test = (testsData || []).find(item => Number(item.id) === Number(attempt.test_id));
      const student = (students || []).find(item => String(item.id) === String(attempt.student_id));
      const groupId = test?.group_id || student?.group_id || null;
      const group = (groupsData || []).find(item => Number(item.id) === Number(groupId));
      return {
        kind: 'test',
        attempt_id: attempt.id,
        submission_id: `test-${attempt.id}`,
        test_id: attempt.test_id,
        homework_title: test?.title || 'Тест',
        test_title: test?.title || 'Тест',
        subject_title: test?.subject_title || '',
        group_id: groupId,
        group_name: group?.name || '',
        student_id: attempt.student_id,
        student_name: student?.full_name || 'Без имени',
        percent: attempt.percent || 0,
        score: attempt.score || 0,
        total_score: attempt.total_score || 0,
        duration_seconds: attempt.duration_seconds || 0,
        submitted_at: attempt.created_at,
        status: attempt.status || 'completed'
      };
    });

    return res.json([...homeworkRows, ...testRows].sort((a, b) => Date.parse(b.submitted_at || 0) - Date.parse(a.submitted_at || 0)));
  } catch (err) {
    return sendServerError(res, '/api/teacher/homework/pending/:teacherId', err);
  }
});

app.put('/api/teacher/homework/review/:submissionId', async (req, res) => {
  try {
    const submissionId = parseNumber(req.params.submissionId, 'submissionId', { required: true });
    const grade = parseGradeInput(req.body.grade);
    const teacher_comment = parseString(req.body.teacher_comment);
    const reviewedAt = new Date().toISOString();

    if (grade === null) return sendBadRequest(res, 'grade должен быть 0-100, Н, У или О');

    const { data, error } = await supabase
      .from('homework_submissions')
      .update({ grade, teacher_comment, status: 'reviewed', reviewed_at: reviewedAt, updated_at: reviewedAt })
      .eq('id', submissionId)
      .select()
      .single();

    if (error) return sendBadRequest(res, error);

    let journalResult = null;
    let journalWarning = null;

    try {
      const { data: homework, error: hwError } = await supabase
        .from('homework')
        .select('id, title, group_id, subject_id, subject_title')
        .eq('id', data.homework_id)
        .maybeSingle();

      if (hwError) {
        journalWarning = hwError.message || hwError;
      } else if (homework?.group_id && data.student_id) {
        const subjectId = await getOrCreateSubjectId(homework.subject_title, homework.subject_id);
        const journalComment = teacher_comment || `Оценка за ДЗ: ${homework.title || 'домашнее задание'}`;
        const journalPayload = {
          group_id: homework.group_id,
          student_id: data.student_id,
          subject_id: subjectId,
          grade,
          comment: journalComment,
          created_at: reviewedAt,
          source_type: 'homework',
          source_id: submissionId
        };

        const { data: existing, error: existingError } = await supabase
          .from('journal')
          .select('id')
          .eq('source_type', 'homework')
          .eq('source_id', submissionId)
          .maybeSingle();

        if (!existingError && existing?.id) {
          const { data: updatedJournal, error: updateJournalError } = await supabase
            .from('journal')
            .update(journalPayload)
            .eq('id', existing.id)
            .select('id, student_id, subject_id, grade, created_at, comment, group_id, subjects(title)')
            .single();
          if (updateJournalError) throw updateJournalError;
          journalResult = updatedJournal;
        } else if (existingError && String(existingError.message || '').includes('source_type')) {
          const fallbackPayload = { ...journalPayload };
          delete fallbackPayload.source_type;
          delete fallbackPayload.source_id;
          const { data: insertedJournal, error: insertJournalError } = await supabase
            .from('journal')
            .insert([fallbackPayload])
            .select('id, student_id, subject_id, grade, created_at, comment, group_id, subjects(title)')
            .single();
          if (insertJournalError) throw insertJournalError;
          journalResult = insertedJournal;
        } else {
          const { data: insertedJournal, error: insertJournalError } = await supabase
            .from('journal')
            .insert([journalPayload])
            .select('id, student_id, subject_id, grade, created_at, comment, group_id, subjects(title)')
            .single();
          if (insertJournalError) throw insertJournalError;
          journalResult = insertedJournal;
        }
      } else {
        journalWarning = 'Не удалось создать запись в журнале: у ДЗ нет group_id или student_id.';
      }
    } catch (journalError) {
      journalWarning = journalError.message || String(journalError);
      console.warn('Домашнее задание проверено, но оценка не попала в журнал:', journalWarning);
    }

    return res.json({ message: t(req, 'homework_reviewed'), submission: data, journal: journalResult, journalWarning });
  } catch (err) {
    return sendServerError(res, '/api/teacher/homework/review/:submissionId', err);
  }
});

/* =========================================================
   SCHEDULE
========================================================= */


app.get('/api/schedule/:groupId', async (req, res) => {
  try {
    const groupId = parseNumber(req.params.groupId, 'groupId', { required: true });
    const { data, error } = await supabase
      .from('schedule')
      .select('id, group_id, day_of_week, lesson_number, room, subject_id, subjects(id, title)')
      .eq('group_id', groupId)
      .order('day_of_week', { ascending: true })
      .order('lesson_number', { ascending: true });

    if (error) return sendBadRequest(res, error);
    return res.json(data || []);
  } catch (err) {
    return sendServerError(res, '/api/schedule/:groupId', err);
  }
});

app.post('/api/schedule', async (req, res) => {
  try {
    const groupId = parseNumber(req.body.group_id, 'group_id', { required: true });
    const rows = normalizeScheduleRows(req.body.lessons, groupId);

    const { error: deleteError } = await supabase.from('schedule').delete().eq('group_id', groupId);
    if (deleteError) return sendBadRequest(res, deleteError);

    if (!rows.length) return res.json({ message: t(req, 'schedule_saved'), schedule: [] });

    const { data, error } = await supabase.from('schedule').insert(rows).select('id, group_id, day_of_week, lesson_number, room, subject_id, subjects(id, title)');
    if (error) return sendBadRequest(res, error);

    return res.status(201).json({ message: t(req, 'schedule_saved'), schedule: data || [] });
  } catch (err) {
    return sendServerError(res, 'POST /api/schedule', err);
  }
});

app.put('/api/schedule/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const payload = {};
    ['group_id', 'day_of_week', 'lesson_number', 'subject_id'].forEach(field => {
      if (req.body[field] !== undefined) payload[field] = Number(req.body[field]) || null;
    });
    if (req.body.room !== undefined) payload.room = parseString(req.body.room) || '';

    const { data, error } = await supabase.from('schedule').update(payload).eq('id', id).select('id, group_id, day_of_week, lesson_number, room, subject_id, subjects(id, title)').single();
    if (error) return sendBadRequest(res, error);
    return res.json({ message: t(req, 'schedule_saved'), lesson: data });
  } catch (err) {
    return sendServerError(res, 'PUT /api/schedule/:id', err);
  }
});



/* =========================================================
   LMS PLUS: SCHEDULE IMPORT, ATTENDANCE, QUIZZES, NOTIFICATIONS
   These endpoints are additive. Existing demo functions keep working.
========================================================= */

function xmlDecode(value = '') {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function columnNameToIndex(name = 'A') {
  let result = 0;
  for (const ch of String(name).toUpperCase()) {
    result = result * 26 + (ch.charCodeAt(0) - 64);
  }
  return result - 1;
}

function readZipEntries(buffer) {
  const zlib = require('zlib');
  const entries = new Map();
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Не найден конец ZIP. Файл не похож на XLSX.');
  const total = buffer.readUInt16LE(eocd + 10);
  let ptr = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < total; i++) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localOffset = buffer.readUInt32LE(ptr + 42);
    const name = buffer.slice(ptr + 46, ptr + 46 + nameLen).toString('utf8');

    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = compressed;
    else if (method === 8) data = zlib.inflateRawSync(compressed);
    else data = Buffer.alloc(0);
    entries.set(name, data.toString('utf8'));
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function parseSharedStrings(xml = '') {
  const result = [];
  const siRegex = /<si[\s\S]*?<\/si>/g;
  let match;
  while ((match = siRegex.exec(xml))) {
    const si = match[0];
    const chunks = [];
    const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tRegex.exec(si))) chunks.push(xmlDecode(t[1]));
    result.push(chunks.join(''));
  }
  return result;
}

function parseSheetRows(xml = '', sharedStrings = []) {
  const rows = [];
  const rowRegex = /<row\s([^>]*)>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(xml))) {
    const rowBody = rowMatch[2] || '';
    const cellRegex = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let match;
    while ((match = cellRegex.exec(rowBody))) {
      const attrs = match[1] || '';
      const body = match[2] || '';
      const ref = /r="([A-Z]+)(\d+)"/.exec(attrs);
      if (!ref) continue;
      const col = columnNameToIndex(ref[1]);
      const row = Number(ref[2]) - 1;
      const type = (/t="([^"]+)"/.exec(attrs) || [])[1];
      let value = '';
      if (type === 'inlineStr') {
        const chunks = [];
        const tr = /<t[^>]*>([\s\S]*?)<\/t>/g;
        let tm;
        while ((tm = tr.exec(body))) chunks.push(xmlDecode(tm[1]));
        value = chunks.join('');
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(body);
        value = v ? xmlDecode(v[1]) : '';
        if (type === 's') value = sharedStrings[Number(value)] || '';
      }
      if (value !== '') {
        if (!rows[row]) rows[row] = [];
        rows[row][col] = String(value).replace(/\s+/g, ' ').trim();
      }
    }
  }
  return rows;
}

function parseXlsxWorkbook(filePath) {
  const buffer = fs.readFileSync(filePath);
  const entries = readZipEntries(buffer);
  const sharedStrings = parseSharedStrings(entries.get('xl/sharedStrings.xml') || '');
  const sheets = [...entries.keys()]
    .filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => Number((a.match(/sheet(\d+)/) || [0, 0])[1]) - Number((b.match(/sheet(\d+)/) || [0, 0])[1]))
    .map((name, index) => ({ name: `Лист ${index + 1}`, rows: parseSheetRows(entries.get(name), sharedStrings) }));
  if (!sheets.length) throw new Error('В XLSX не найдены листы.');
  return sheets;
}

function cleanLessonText(raw = '') {
  return String(raw || '')
    .replace(/Кабинет\s*:?\s*№?\s*[\w\-А-Яа-яЁё/]+/gi, '')
    .replace(/№\s*\d+[А-Яа-яA-Za-z]?/g, '')
    .replace(/Преподаватель\s*:?\s*[^\n]+/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[.:;,\-\s]+$/g, '')
    .trim();
}

function extractRoom(raw = '') {
  const text = String(raw || '');
  const match = text.match(/(?:Кабинет|аудитория|аудит\.)\s*:?\s*№?\s*([\w\-А-Яа-яЁё/]+)/i) || text.match(/№\s*(\d{2,4}[А-Яа-яA-Za-z]?)/);
  return match ? match[1].trim() : '';
}

function extractTeacher(raw = '') {
  const text = String(raw || '');
  const match = text.match(/Преподаватель\s*:?\s*([^№\n]+?)(?:\s+Кабинет|$)/i);
  return match ? match[1].trim() : '';
}

function parseScheduleWorkbook(filePath) {
  const workbook = parseXlsxWorkbook(filePath);
  const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  const lessons = [];
  const groups = new Set();
  const subjects = new Set();

  for (const sheet of workbook) {
    const rows = sheet.rows;
    const dayBlocks = [];
    for (let r = 0; r < Math.min(rows.length, 20); r++) {
      const row = rows[r] || [];
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim();
        const dayIndex = days.findIndex(d => val.toLowerCase().startsWith(d.toLowerCase().slice(0, 5)));
        if (dayIndex >= 0) dayBlocks.push({ day_of_week: dayIndex + 1, day_title: days[dayIndex], day_col: c, lesson_start_col: c, group_col: Math.max(0, c - 2) });
      }
    }

    for (const block of dayBlocks) {
      const timeRowIndex = 6;
      const times = [];
      for (let i = 0; i < 8; i++) times.push((rows[timeRowIndex] || [])[block.lesson_start_col + i] || '');

      for (let r = 8; r < rows.length; r++) {
        const row = rows[r] || [];
        const groupName = String(row[block.group_col] || '').trim();
        if (!groupName || /курс|неделя|смена|пара/i.test(groupName)) continue;

        for (let i = 0; i < 8; i++) {
          const raw = String(row[block.lesson_start_col + i] || '').trim();
          if (!raw || raw.length < 2) continue;
          const subject_title = cleanLessonText(raw);
          if (!subject_title) continue;
          const item = {
            sheet: sheet.name,
            group_name: groupName,
            day_of_week: block.day_of_week,
            day_title: block.day_title,
            lesson_number: i + 1,
            time: times[i] || '',
            subject_title,
            teacher: extractTeacher(raw),
            room: extractRoom(raw),
            raw
          };
          lessons.push(item);
          groups.add(groupName);
          subjects.add(subject_title);
        }
      }
    }
  }

  const byGroup = {};
  for (const lesson of lessons) {
    byGroup[lesson.group_name] = byGroup[lesson.group_name] || 0;
    byGroup[lesson.group_name]++;
  }
  return {
    groups: [...groups].sort(),
    subjects: [...subjects].sort(),
    lessons,
    summary: {
      sheets: workbook.length,
      groups: groups.size,
      subjects: subjects.size,
      lessons: lessons.length,
      byGroup
    }
  };
}

async function findGroupIdByName(groupName, groupsCache = null) {
  const normalized = String(groupName || '').trim().toLowerCase();
  if (!normalized) return null;
  const groups = groupsCache || (await supabase.from('groups').select('id, name')).data || [];
  const direct = groups.find(g => String(g.name || '').trim().toLowerCase() === normalized);
  if (direct) return direct.id;
  const soft = groups.find(g => normalized.includes(String(g.name || '').trim().toLowerCase()) || String(g.name || '').trim().toLowerCase().includes(normalized));
  return soft?.id || null;
}

app.post('/api/schedule/import-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file?.path) return sendBadRequest(res, 'Прикрепите XLSX-файл расписания');
    const parsed = parseScheduleWorkbook(req.file.path);
    const shouldSave = parseBoolean(req.query.save || req.body.save);

    if (!shouldSave) {
      await removeTempFile(req.file.path);
      return res.json(parsed);
    }

    const { data: allGroups } = await supabase.from('groups').select('id, name');
    const savedGroups = [];
    const skippedGroups = [];

    for (const groupName of parsed.groups) {
      const groupId = await findGroupIdByName(groupName, allGroups || []);
      if (!groupId) { skippedGroups.push(groupName); continue; }
      const groupLessons = parsed.lessons.filter(x => x.group_name === groupName);
      const rows = [];
      for (const lesson of groupLessons) {
        const subjectId = await getOrCreateSubjectId(lesson.subject_title);
        rows.push({
          group_id: Number(groupId),
          day_of_week: Number(lesson.day_of_week),
          lesson_number: Number(lesson.lesson_number),
          subject_id: subjectId,
          room: lesson.room || ''
        });
      }
      await supabase.from('schedule').delete().eq('group_id', groupId);
      if (rows.length) {
        const { error } = await supabase.from('schedule').insert(rows);
        if (error) throw error;
      }
      savedGroups.push({ group_name: groupName, group_id: groupId, lessons: rows.length });
    }

    await removeTempFile(req.file.path);
    return res.json({ message: 'Расписание импортировано', summary: parsed.summary, savedGroups, skippedGroups });
  } catch (err) {
    if (req.file?.path) await removeTempFile(req.file.path);
    return sendServerError(res, 'POST /api/schedule/import-excel', err);
  }
});

app.get('/api/notifications/:userId', async (req, res) => {
  try {
    const userId = parseNumber(req.params.userId, 'userId', { required: true });
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return res.json([]);
    return res.json(data || []);
  } catch (err) { return sendServerError(res, '/api/notifications/:userId', err); }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const userId = parseNumber(req.body.user_id, 'user_id', { required: true });
    const payload = { user_id: userId, title: parseString(req.body.title) || 'Уведомление', body: parseString(req.body.body) || '', is_read: false };
    const { data, error } = await supabase.from('notifications').insert([payload]).select('*').single();
    if (error) return sendBadRequest(res, error);
    return res.status(201).json(data);
  } catch (err) { return sendServerError(res, 'POST /api/notifications', err); }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const { data, error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id).select('*').single();
    if (error) return sendBadRequest(res, error);
    return res.json(data);
  } catch (err) { return sendServerError(res, 'PUT /api/notifications/:id/read', err); }
});

app.get('/api/attendance/:groupId', async (req, res) => {
  try {
    const groupId = parseNumber(req.params.groupId, 'groupId', { required: true });
    const date = parseString(req.query.date);
    let query = supabase.from('attendance').select('*, profiles(id, name), subjects(id, title)').eq('group_id', groupId).order('date', { ascending: false });
    if (date) query = query.eq('date', date);
    const { data, error } = await query.limit(200);
    if (error) return res.json([]);
    return res.json(data || []);
  } catch (err) { return sendServerError(res, '/api/attendance/:groupId', err); }
});

app.post('/api/attendance', async (req, res) => {
  try {
    const payload = {
      group_id: parseNumber(req.body.group_id, 'group_id', { required: true }),
      student_id: parseNumber(req.body.student_id, 'student_id', { required: true }),
      subject_id: parseNumber(req.body.subject_id, 'subject_id'),
      date: parseString(req.body.date) || new Date().toISOString().slice(0, 10),
      lesson_number: parseNumber(req.body.lesson_number, 'lesson_number') || 1,
      status: parseString(req.body.status) || 'present',
      comment: parseString(req.body.comment) || ''
    };
    const { data, error } = await supabase.from('attendance').insert([payload]).select('*').single();
    if (error) return sendBadRequest(res, error);
    return res.status(201).json(data);
  } catch (err) { return sendServerError(res, 'POST /api/attendance', err); }
});

app.get('/api/quizzes', async (req, res) => {
  try {
    let query = supabase.from('quizzes').select('*').order('created_at', { ascending: false });
    if (req.query.group_id) query = query.eq('group_id', Number(req.query.group_id));
    const { data, error } = await query.limit(100);
    if (error) return res.json([]);
    return res.json(data || []);
  } catch (err) { return sendServerError(res, '/api/quizzes', err); }
});

app.post('/api/quizzes', async (req, res) => {
  try {
    const payload = {
      title: parseString(req.body.title) || 'Новый тест',
      description: parseString(req.body.description) || '',
      group_id: parseNumber(req.body.group_id, 'group_id'),
      subject_id: parseNumber(req.body.subject_id, 'subject_id'),
      created_by: parseNumber(req.body.created_by, 'created_by'),
      deadline: parseString(req.body.deadline)
    };
    const { data, error } = await supabase.from('quizzes').insert([payload]).select('*').single();
    if (error) return sendBadRequest(res, error);
    return res.status(201).json(data);
  } catch (err) { return sendServerError(res, 'POST /api/quizzes', err); }
});

/* =========================================================
   ADMIN / USERS / TEACHER
========================================================= */

app.get('/api/admin/users', async (req, res) => {
  try {
    const { data, error } = await supabase.from('profiles').select('id, full_name, email, role, group_id, course, can_edit_news, can_edit_schedule').order('full_name', { ascending: true });
    if (error) return sendBadRequest(res, error);
    return res.json(data || []);
  } catch (err) {
    return sendServerError(res, '/api/admin/users', err);
  }
});


app.put('/api/admin/users/access/bulk', async (req, res) => {
  try {
    const userIds = Array.isArray(req.body.user_ids) ? req.body.user_ids.map(parseString).filter(Boolean) : [];
    if (!userIds.length) return sendBadRequest(res, 'Выберите пользователей');

    const payload = {};
    const role = parseString(req.body.role);
    if (role) {
      if (!['student', 'teacher', 'admin'].includes(role)) return sendBadRequest(res, 'Некорректная роль');
      payload.role = role;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'group_id')) {
      payload.group_id = req.body.group_id === null || req.body.group_id === ''
        ? null
        : parseNumber(req.body.group_id, 'group_id', { required: false, allowNull: true });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'can_edit_news')) {
      payload.can_edit_news = parseBoolean(req.body.can_edit_news);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'can_edit_schedule')) {
      payload.can_edit_schedule = parseBoolean(req.body.can_edit_schedule);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'course_delta')) {
      const delta = Number(req.body.course_delta);
      if (!Number.isFinite(delta)) return sendBadRequest(res, 'course_delta должен быть числом');
      for (const userId of userIds) {
        const { data: current, error: readError } = await supabase
          .from('profiles')
          .select('course')
          .eq('id', userId)
          .maybeSingle();
        if (readError) return sendBadRequest(res, readError);
        const currentCourse = Number(current?.course || 0);
        const nextCourse = Math.max(0, currentCourse + delta);
        const { error: updateCourseError } = await supabase
          .from('profiles')
          .update({ course: nextCourse })
          .eq('id', userId);
        if (updateCourseError) return sendBadRequest(res, updateCourseError);
      }
    }

    if (Object.keys(payload).length) {
      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .in('id', userIds);
      if (error) return sendBadRequest(res, error);
    }

    const { data, error: selectError } = await supabase
      .from('profiles')
      .select('id, full_name, role, group_id, course, can_edit_news, can_edit_schedule')
      .in('id', userIds);
    if (selectError) return sendBadRequest(res, selectError);

    return res.json({ message: 'Права пользователей обновлены', users: data || [] });
  } catch (err) {
    return sendServerError(res, '/api/admin/users/access/bulk', err);
  }
});

app.put('/api/admin/users/:userId/access', async (req, res) => {
  try {
    const userId = parseString(req.params.userId);
    const role = parseString(req.body.role);
    const can_edit_news = parseBoolean(req.body.can_edit_news);
    const can_edit_schedule = parseBoolean(req.body.can_edit_schedule);
    if (!userId) return sendBadRequest(res, 'userId обязателен');
    if (!role || !['student', 'teacher', 'admin'].includes(role)) return sendBadRequest(res, 'Некорректная роль');

    const group_id = req.body.group_id !== undefined && req.body.group_id !== null && req.body.group_id !== ''
      ? parseNumber(req.body.group_id, 'group_id', { required: false, allowNull: true })
      : null;

    const { data, error } = await supabase
      .from('profiles')
      .update({ role, group_id, can_edit_news, can_edit_schedule })
      .eq('id', userId)
      .select('id, full_name, role, group_id, can_edit_news, can_edit_schedule')
      .single();

    if (error) return sendBadRequest(res, error);
    return res.json({ message: 'Права пользователя обновлены', user: data });
  } catch (err) {
    return sendServerError(res, '/api/admin/users/:userId/access', err);
  }
});

app.get('/api/teacher/groups/:teacherId', async (req, res) => {
  try {
    const teacherId = parseString(req.params.teacherId);
    const role = parseString(req.query.role);
    if (!teacherId) return sendBadRequest(res, 'Некорректный teacherId');

    if (role === 'admin' || role === 'администратор') {
      const { data, error } = await supabase.from('groups').select('id, name').order('name', { ascending: true });
      if (error) return sendBadRequest(res, error);
      return res.json(data || []);
    }

    const { data, error } = await supabase
      .from('teacher_groups')
      .select('group_id, groups(id, name)')
      .eq('teacher_id', teacherId);

    if (error) return sendBadRequest(res, error);
    return res.json((data || []).map(item => item.groups).filter(Boolean));
  } catch (err) {
    return sendServerError(res, '/api/teacher/groups/:teacherId', err);
  }
});

app.get('/api/teacher/students/:groupId', async (req, res) => {
  try {
    const groupId = parseNumber(req.params.groupId, 'groupId', { required: true });
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, course, specialization')
      .eq('group_id', groupId)
      .eq('role', 'student')
      .order('full_name', { ascending: true });
    if (error) return sendBadRequest(res, error);
    return res.json(data || []);
  } catch (err) {
    return sendServerError(res, '/api/teacher/students/:groupId', err);
  }
});

/* =========================================================
   STATISTICS
========================================================= */

app.get('/api/statistics/:groupId', async (req, res) => {
  try {
    const groupId = parseNumber(req.params.groupId, 'groupId', { required: true });
    const teacherId = parseString(req.query.teacherId);
    const requestRole = parseString(req.query.role);
    const isAdminRequest = requestRole === 'admin' || requestRole === 'администратор';
    const month = parseString(req.query.month);

    const monthInfo = getMonthRange(month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);

    if (teacherId && !isAdminRequest) {
      const { data: teacherGroup, error: tgError } = await supabase
        .from('teacher_groups')
        .select('group_id, groups(name)')
        .eq('teacher_id', teacherId)
        .eq('group_id', groupId)
        .maybeSingle();
      if (tgError) return sendBadRequest(res, tgError);
      if (!teacherGroup) return sendForbidden(req, res, 'Эта группа не принадлежит преподавателю');
    }

    const [{ data: groupData }, { data: studentsData, error: studentsError }, { data: gradesData, error: gradesError }, { data: subjectsData }] = await Promise.all([
      supabase.from('groups').select('name').eq('id', groupId).maybeSingle(),
      supabase.from('profiles').select('id, full_name').eq('group_id', groupId).eq('role', 'student').order('full_name', { ascending: true }),
      supabase.from('journal').select('id, student_id, subject_id, grade, created_at, comment, subjects(id, title)').eq('group_id', groupId).gte('created_at', monthInfo.startISO).lt('created_at', monthInfo.endISO).order('created_at', { ascending: true }),
      supabase.from('subjects').select('id, title').order('title', { ascending: true })
    ]);

    if (studentsError) return sendBadRequest(res, studentsError);
    if (gradesError) return sendBadRequest(res, gradesError);

    const days = Array.from({ length: monthInfo.daysInMonth }, (_, i) => i + 1);
    const grades = gradesData || [];
    const students = (studentsData || []).map(student => {
      const studentGrades = grades.filter(item => item.student_id === student.id);
      const gradesByDay = {};
      const subjects = {};

      for (const item of studentGrades) {
        const day = new Date(item.created_at).getDate();
        if (!gradesByDay[day]) gradesByDay[day] = [];
        gradesByDay[day].push({
          id: item.id,
          grade: item.grade,
          subject_id: item.subject_id,
          subject_title: item.subjects?.title || 'Предмет',
          comment: item.comment || ''
        });

        const subjectTitle = item.subjects?.title || 'Предмет';
        if (!subjects[subjectTitle]) subjects[subjectTitle] = [];
        subjects[subjectTitle].push(Number(item.grade));
      }

      const flatGrades = studentGrades.map(item => Number(item.grade)).filter(item => !Number.isNaN(item));
      const averageGrade = flatGrades.length ? Math.round(flatGrades.reduce((sum, grade) => sum + grade, 0) / flatGrades.length) : 0;

      return {
        student_id: student.id,
        full_name: student.full_name,
        grades_by_day: gradesByDay,
        subjects: Object.entries(subjects).map(([title, arr]) => ({
          title,
          average_grade: arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0,
          grades: arr
        })),
        average_grade: averageGrade
      };
    });

    const allGrades = grades.map(item => Number(item.grade)).filter(item => !Number.isNaN(item));
    const groupAvg = allGrades.length ? Math.round(allGrades.reduce((sum, grade) => sum + grade, 0) / allGrades.length) : 0;

    return res.json({
      group_id: groupId,
      group_name: groupData?.name || `Группа ${groupId}`,
      month: month || null,
      month_label: monthInfo.monthLabel,
      days,
      average_grade: groupAvg,
      subjects: subjectsData || [],
      students
    });
  } catch (err) {
    return sendServerError(res, '/api/statistics/:groupId', err);
  }
});

/* =========================================================
   PROFILE / AVATAR
========================================================= */

app.post('/api/avatar/upload', upload.single('avatar'), async (req, res) => {
  try {
    const userId = parseString(req.body.userId);
    const file = req.file;
    if (!userId) {
      if (file?.path) await removeTempFile(file.path);
      return sendBadRequest(res, 'userId обязателен');
    }
    if (!file) return sendBadRequest(res, 'Файл не загружен');

    const fileBuffer = await fs.promises.readFile(file.path);
    const fileExt = path.extname(file.originalname) || '';
    const fileName = `${userId}_${Date.now()}${fileExt}`;

    const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, fileBuffer, { contentType: file.mimetype, upsert: true });
    await removeTempFile(file.path);
    if (uploadError) return res.status(500).json({ error: 'Ошибка загрузки в storage' });

    const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
    const avatar_url = publicUrlData.publicUrl;

    const { error: updateError } = await supabase.from('profiles').update({ avatar_url }).eq('id', userId);
    if (updateError) return res.status(500).json({ error: 'Ошибка обновления профиля' });

    return res.json({ message: 'Аватар загружен', avatar_url });
  } catch (err) {
    if (req.file?.path) await removeTempFile(req.file.path);
    return sendServerError(res, '/api/avatar/upload', err);
  }
});

app.get('/api/profile/:id', async (req, res) => {
  try {
    const id = parseString(req.params.id);
    if (!id) return sendBadRequest(res, 'id обязателен');
    const { data, error } = await supabase.from('profiles').select('avatar_url').eq('id', id).maybeSingle();
    if (error) return sendBadRequest(res, error);
    return res.json(data || {});
  } catch (err) {
    return sendServerError(res, '/api/profile/:id', err);
  }
});

/* =========================================================
   NEWS
========================================================= */

async function enrichNewsList(newsItems, userId = null) {
  const items = newsItems || [];
  if (!items.length) return [];
  const newsIds = items.map(item => item.id);
  const [{ data: reactionRows }, { data: commentRows }] = await Promise.all([
    supabase.from('news_reactions').select('news_id, user_id, reaction_type').in('news_id', newsIds),
    supabase.from('news_comments').select('news_id').in('news_id', newsIds)
  ]);

  const reactionTypes = ['like', 'heart', 'laugh', 'wow', 'sad'];
  return items.map(item => {
    const reactionsForItem = (reactionRows || []).filter(row => row.news_id === item.id);
    return {
      ...item,
      reactions: reactionTypes.map(type => ({ reaction_type: type, count: reactionsForItem.filter(row => row.reaction_type === type).length })),
      my_reaction: userId ? reactionsForItem.find(row => row.user_id === userId)?.reaction_type || null : null,
      comments_count: (commentRows || []).filter(row => row.news_id === item.id).length
    };
  });
}

async function enrichCommentsList(comments, userId = null) {
  const items = comments || [];
  if (!items.length) return [];
  const commentIds = items.map(item => item.id);
  const { data: reactionRows, error } = await supabase.from('news_comment_reactions').select('comment_id, user_id, reaction_type').in('comment_id', commentIds);
  if (error) throw error;
  const reactionTypes = ['like', 'heart', 'laugh', 'wow', 'sad'];
  return items.map(item => {
    const reactionsForItem = (reactionRows || []).filter(row => row.comment_id === item.id);
    return {
      ...item,
      reactions: reactionTypes.map(type => ({ reaction_type: type, count: reactionsForItem.filter(row => row.reaction_type === type).length })),
      my_reaction: userId ? reactionsForItem.find(row => row.user_id === userId)?.reaction_type || null : null
    };
  });
}

app.get('/api/news', async (req, res) => {
  try {
    const userId = parseString(req.query.user_id);
    const { data, error } = await supabase.from('news').select('*').order('created_at', { ascending: false });
    if (error) return sendBadRequest(res, error);
    return res.json(await enrichNewsList(data || [], userId));
  } catch (err) {
    return sendServerError(res, '/api/news', err);
  }
});

app.post('/api/news/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return sendBadRequest(res, 'Файл изображения обязателен');
    if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
      await removeTempFile(req.file.path);
      return sendBadRequest(res, 'Можно загружать только изображения');
    }
    const imageUrl = req.protocol + '://' + req.get('host') + '/uploads/submissions/' + req.file.filename;
    return res.status(201).json({ image_url: imageUrl });
  } catch (err) {
    return sendServerError(res, '/api/news/upload-image', err);
  }
});

app.post('/api/news', async (req, res) => {
  try {
    const title = parseString(req.body.title);
    const description = parseString(req.body.description);
    const image_url = parseString(req.body.image_url);
    const date_start = parseString(req.body.date_start);
    const date_end = parseString(req.body.date_end);
    const created_by = parseString(req.body.created_by);
    if (!title) return sendBadRequest(res, 'Заголовок обязателен');

    const { data, error } = await supabase.from('news').insert([{ title, description, image_url, date_start, date_end, created_by }]).select().single();
    if (error) return sendBadRequest(res, error);
    return res.status(201).json({ message: t(req, 'news_published'), news: data });
  } catch (err) {
    return sendServerError(res, 'POST /api/news', err);
  }
});

app.put('/api/news/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const payload = {
      title: parseString(req.body.title),
      description: parseString(req.body.description),
      image_url: parseString(req.body.image_url),
      date_start: parseString(req.body.date_start),
      date_end: parseString(req.body.date_end)
    };
    const { data, error } = await supabase.from('news').update(payload).eq('id', id).select().single();
    if (error) return sendBadRequest(res, error);
    return res.json({ message: t(req, 'news_updated'), news: data });
  } catch (err) {
    return sendServerError(res, 'PUT /api/news/:id', err);
  }
});

app.delete('/api/news/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const { error } = await supabase.from('news').delete().eq('id', id);
    if (error) return sendBadRequest(res, error);
    return res.json({ message: t(req, 'news_deleted') });
  } catch (err) {
    return sendServerError(res, 'DELETE /api/news/:id', err);
  }
});

app.post('/api/news/:id/reaction', async (req, res) => {
  try {
    const news_id = parseNumber(req.params.id, 'news_id', { required: true });
    const user_id = parseString(req.body.user_id);
    const reaction_type = parseString(req.body.reaction_type);
    const allowed = ['like', 'heart', 'laugh', 'wow', 'sad'];
    if (!user_id) return sendBadRequest(res, 'user_id обязателен');
    if (!allowed.includes(reaction_type)) return sendBadRequest(res, t(req, 'errors.bad_reaction'));

    const { data: existing, error: findError } = await supabase.from('news_reactions').select('id, reaction_type').eq('news_id', news_id).eq('user_id', user_id).maybeSingle();
    if (findError) return sendBadRequest(res, findError);

    if (existing && existing.reaction_type === reaction_type) {
      const { error } = await supabase.from('news_reactions').delete().eq('id', existing.id);
      if (error) return sendBadRequest(res, error);
      return res.json({ reaction: null });
    }

    if (existing) {
      const { data, error } = await supabase.from('news_reactions').update({ reaction_type }).eq('id', existing.id).select().single();
      if (error) return sendBadRequest(res, error);
      return res.json({ reaction: data });
    }

    const { data, error } = await supabase.from('news_reactions').insert([{ news_id, user_id, reaction_type }]).select().single();
    if (error) return sendBadRequest(res, error);
    return res.status(201).json({ reaction: data });
  } catch (err) {
    return sendServerError(res, '/api/news/:id/reaction', err);
  }
});

app.get('/api/news/:id/comments', async (req, res) => {
  try {
    const news_id = parseNumber(req.params.id, 'news_id', { required: true });
    const userId = parseString(req.query.user_id);
    const { data, error } = await supabase
      .from('news_comments')
      .select('id, news_id, user_id, parent_id, text, created_at, profiles(full_name, avatar_url)')
      .eq('news_id', news_id)
      .order('created_at', { ascending: true });

    if (error) return sendBadRequest(res, error);
    return res.json(await enrichCommentsList(data || [], userId));
  } catch (err) {
    return sendServerError(res, '/api/news/:id/comments', err);
  }
});

app.post('/api/news/:id/comments', async (req, res) => {
  try {
    const news_id = parseNumber(req.params.id, 'news_id', { required: true });
    const user_id = parseString(req.body.user_id);
    const text = parseString(req.body.text);
    const parent_id = req.body.parent_id ? parseNumber(req.body.parent_id, 'parent_id') : null;
    if (!user_id) return sendBadRequest(res, 'user_id обязателен');
    if (!text) return sendBadRequest(res, t(req, 'errors.empty_comment'));

    const { data, error } = await supabase.from('news_comments').insert([{ news_id, user_id, text, parent_id }]).select().single();
    if (error) return sendBadRequest(res, error);
    return res.status(201).json({ message: t(req, 'comment_added'), comment: data });
  } catch (err) {
    return sendServerError(res, '/api/news/:id/comments POST', err);
  }
});

app.delete('/api/news/comments/:commentId', async (req, res) => {
  try {
    const commentId = parseNumber(req.params.commentId, 'commentId', { required: true });
    const userId = parseString(req.body.user_id);
    if (!userId) return sendBadRequest(res, 'user_id обязателен');

    const { data: comment, error: findError } = await supabase.from('news_comments').select('id, user_id').eq('id', commentId).maybeSingle();
    if (findError) return sendBadRequest(res, findError);
    if (!comment) return res.status(404).json({ error: 'Комментарий не найден' });
    if (comment.user_id !== userId) return sendForbidden(req, res, 'Можно удалять только свои комментарии');

    const { error } = await supabase.from('news_comments').delete().eq('id', commentId);
    if (error) return sendBadRequest(res, error);
    return res.json({ message: t(req, 'comment_deleted') });
  } catch (err) {
    return sendServerError(res, '/api/news/comments/:commentId DELETE', err);
  }
});

app.post('/api/news/comments/:commentId/reaction', async (req, res) => {
  try {
    const comment_id = parseNumber(req.params.commentId, 'commentId', { required: true });
    const user_id = parseString(req.body.user_id);
    const reaction_type = parseString(req.body.reaction_type);
    const allowed = ['like', 'heart', 'laugh', 'wow', 'sad'];
    if (!user_id) return sendBadRequest(res, 'user_id обязателен');
    if (!allowed.includes(reaction_type)) return sendBadRequest(res, t(req, 'errors.bad_reaction'));

    const { data: existing, error: findError } = await supabase.from('news_comment_reactions').select('id, reaction_type').eq('comment_id', comment_id).eq('user_id', user_id).maybeSingle();
    if (findError) return sendBadRequest(res, findError);

    if (existing && existing.reaction_type === reaction_type) {
      const { error } = await supabase.from('news_comment_reactions').delete().eq('id', existing.id);
      if (error) return sendBadRequest(res, error);
      return res.json({ reaction: null });
    }

    if (existing) {
      const { data, error } = await supabase.from('news_comment_reactions').update({ reaction_type }).eq('id', existing.id).select().single();
      if (error) return sendBadRequest(res, error);
      return res.json({ reaction: data });
    }

    const { data, error } = await supabase.from('news_comment_reactions').insert([{ comment_id, user_id, reaction_type }]).select().single();
    if (error) return sendBadRequest(res, error);
    return res.status(201).json({ reaction: data });
  } catch (err) {
    return sendServerError(res, '/api/news/comments/:commentId/reaction', err);
  }
});

/* =========================================================
   REDIRECT / COMPAT
========================================================= */

app.get('/api/statistic/:groupId', async (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  return res.redirect(`/api/statistics/${req.params.groupId}${qs ? '?' + qs : ''}`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер пашет на порту ${PORT}`);
});
