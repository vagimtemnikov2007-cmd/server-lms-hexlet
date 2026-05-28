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
      .select('id, role, full_name, group_id, course, specialization, iin, password, can_edit_news, avatar_url')
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
    const grade = parseNumber(req.body.grade, 'grade', { required: true, allowNull: false });
    const comment = parseString(req.body.comment);
    const created_at = parseString(req.body.created_at) || new Date().toISOString();
    const subject_id = await getOrCreateSubjectId(req.body.subject_title, req.body.subject_id);

    if (!student_id) return sendBadRequest(res, t(req, 'errors.student_required'));
    if (grade < 0 || grade > 100) return sendBadRequest(res, 'grade должен быть от 0 до 100');

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
    if (req.body.grade !== undefined) payload.grade = parseNumber(req.body.grade, 'grade', { required: true });
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
    homework: []
  };
}

function buildHomeworkModules({ sections = [], materials = [], homework = [], submissions = [] }) {
  const sectionMap = new Map();
  const result = [];

  (sections || []).forEach(section => {
    const normalized = normalizeSection(section);
    sectionMap.set(Number(section.id), normalized);
    result.push(normalized);
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
      homework: legacyHomework
    });
  }

  result.forEach(section => {
    section.materials.sort((a, b) => (a.order_index || 0) - (b.order_index || 0) || Number(a.id) - Number(b.id));
    section.homework.sort((a, b) => (a.order_index || 0) - (b.order_index || 0) || Number(a.id) - Number(b.id));
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

    return res.json({ sections: buildHomeworkModules({ sections, materials, homework: homeworkData, submissions }) });
  } catch (err) {
    return sendServerError(res, '/api/homework-modules/:groupId', err);
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

    const payload = { group_id, subject_id, subject_title, title, description, order_index, created_by };
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
    const group_id = parseNumber(req.body.group_id, 'group_id', { required: true });
    const section_id = parseNumber(req.body.section_id, 'section_id');
    const subject_title = parseString(req.body.subject_title);
    const subject_id = await getOrCreateSubjectId(subject_title, req.body.subject_id);
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

    const payload = { group_id, section_id, subject_id, subject_title, title, description, format, deadline, attachment_url, attachment_name, order_index, created_by };
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
    if (!teacherId) return sendBadRequest(res, t(req, 'errors.teacher_required'));

    const { data: teacherGroups, error: tgError } = await supabase
      .from('teacher_groups')
      .select('group_id')
      .eq('teacher_id', teacherId);
    if (tgError) return sendBadRequest(res, tgError);

    const groupIds = (teacherGroups || []).map(item => item.group_id);
    if (!groupIds.length) return res.json([]);

    const { data: homeworkData, error: hwError } = await supabase
      .from('homework')
      .select('*')
      .in('group_id', groupIds);
    if (hwError) return sendBadRequest(res, hwError);

    const homeworkIds = (homeworkData || []).map(item => item.id);
    if (!homeworkIds.length) return res.json([]);

    const { data: submissions, error: subError } = await supabase
      .from('homework_submissions')
      .select('*')
      .in('homework_id', homeworkIds)
      .eq('status', 'submitted')
      .is('grade', null)
      .order('submitted_at', { ascending: false });
    if (subError) return sendBadRequest(res, subError);
    if (!submissions?.length) return res.json([]);

    const studentIds = submissions.map(item => item.student_id);
    const [{ data: students, error: stError }, { data: groupsData, error: groupsError }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, group_id').in('id', studentIds),
      supabase.from('groups').select('id, name').in('id', groupIds)
    ]);
    if (stError) return sendBadRequest(res, stError);
    if (groupsError) return sendBadRequest(res, groupsError);

    const result = submissions.map(sub => {
      const hw = (homeworkData || []).find(item => item.id === sub.homework_id);
      const student = (students || []).find(item => item.id === sub.student_id);
      const group = (groupsData || []).find(item => item.id === hw?.group_id);
      return {
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

    return res.json(result);
  } catch (err) {
    return sendServerError(res, '/api/teacher/homework/pending/:teacherId', err);
  }
});

app.put('/api/teacher/homework/review/:submissionId', async (req, res) => {
  try {
    const submissionId = parseNumber(req.params.submissionId, 'submissionId', { required: true });
    const grade = parseNumber(req.body.grade, 'grade', { required: true });
    const teacher_comment = parseString(req.body.teacher_comment);

    const { data, error } = await supabase
      .from('homework_submissions')
      .update({ grade, teacher_comment, status: 'reviewed', reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', submissionId)
      .select()
      .single();

    if (error) return sendBadRequest(res, error);
    return res.json({ message: t(req, 'homework_reviewed'), submission: data });
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
   ADMIN / USERS / TEACHER
========================================================= */

app.get('/api/admin/users', async (req, res) => {
  try {
    const { data, error } = await supabase.from('profiles').select('id, full_name, role, group_id, can_edit_news').order('full_name', { ascending: true });
    if (error) return sendBadRequest(res, error);
    return res.json(data || []);
  } catch (err) {
    return sendServerError(res, '/api/admin/users', err);
  }
});

app.put('/api/admin/users/:userId/access', async (req, res) => {
  try {
    const userId = parseString(req.params.userId);
    const role = parseString(req.body.role);
    const can_edit_news = parseBoolean(req.body.can_edit_news);
    if (!userId) return sendBadRequest(res, 'userId обязателен');
    if (!role || !['student', 'teacher', 'admin'].includes(role)) return sendBadRequest(res, 'Некорректная роль');

    const group_id = req.body.group_id !== undefined && req.body.group_id !== null && req.body.group_id !== ''
      ? parseNumber(req.body.group_id, 'group_id', { required: false, allowNull: true })
      : null;

    const { data, error } = await supabase
      .from('profiles')
      .update({ role, group_id, can_edit_news })
      .eq('id', userId)
      .select('id, full_name, role, group_id, can_edit_news')
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
