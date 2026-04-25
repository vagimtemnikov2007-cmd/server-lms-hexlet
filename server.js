const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads', 'submissions');

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },

  filename: function (req, file, cb) {
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const uniqueName = `${Date.now()}-${safeName}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error('ОШИБКА: SUPABASE_URL или SUPABASE_KEY не заданы');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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

function sendForbidden(res, message = 'Нет доступа') {
  return res.status(403).json({ error: message });
}

function parseNumber(value, fieldName, { required = false, allowNull = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new Error(`${fieldName} обязателен`);
    }
    return allowNull ? null : undefined;
  }

  const num = Number(value);

  if (Number.isNaN(num)) {
    throw new Error(`${fieldName} должен быть числом`);
  }

  return num;
}

function parseString(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function parseBoolean(value) {
  return !!value;
}

async function removeTempFile(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    console.warn('Не удалось удалить временный файл:', filePath, err.message);
  }
}

function getMonthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('month должен быть в формате YYYY-MM');
  }

  const [year, monthNum] = month.split('-').map(Number);
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 1);
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

/* =========================================================
   ROOT
========================================================= */

app.get('/', (req, res) => {
  res.send('API Электронного журнала работает 🚀');
});

/* =========================================================
   LOGIN
========================================================= */

app.post('/api/login', async (req, res) => {
  try {
    let { iin, password } = req.body;

    iin = parseString(iin);
    password = parseString(password);

    if (!iin || !password) {
      return sendBadRequest(res, 'Введите ИИН и пароль');
    }

    const { data: user, error } = await supabase
      .from('profiles')
      .select('id, role, full_name, group_id, course, specialization, iin, password, can_edit_news, avatar_url')
      .eq('iin', iin)
      .maybeSingle();

    if (error) {
      return sendBadRequest(res, error);
    }

    if (!user || String(user.password) !== password) {
      return res.status(401).json({ error: 'Неверный ИИН или пароль' });
    }

    delete user.password;

    return res.json(user);
  } catch (err) {
    return sendServerError(res, '/api/login', err);
  }
});

/* =========================================================
   JOURNAL
========================================================= */

app.get('/api/journal/:groupId', async (req, res) => {
  try {
    const groupId = parseNumber(req.params.groupId, 'groupId', { required: true });

    const { data, error } = await supabase
      .from('journal')
      .select('id, student_id, subject_id, grade, created_at, comment, group_id, subjects(title)')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    if (error) {
      return sendBadRequest(res, error);
    }

    return res.json(data || []);
  } catch (err) {
    return sendServerError(res, '/api/journal/:groupId', err);
  }
});

/* =========================================================
   HOMEWORK
========================================================= */

// Список ДЗ для группы
app.get('/api/homework/:groupId', async (req, res) => {
  try {
    const groupId = parseNumber(req.params.groupId, 'groupId', { required: true });

    const { data, error } = await supabase
      .from('homework')
      .select('*')
      .eq('group_id', groupId)
      .order('id', { ascending: false });

    if (error) {
      return sendBadRequest(res, error);
    }

    return res.json(data || []);
  } catch (err) {
    return sendServerError(res, '/api/homework/:groupId', err);
  }
});

// ДЗ конкретного ученика + его сдачи
app.get('/api/student/homework/:groupId/:studentId', async (req, res) => {
  try {
    const groupId = parseNumber(req.params.groupId, 'groupId', { required: true });
    const studentId = parseString(req.params.studentId);

    if (!studentId) {
      return sendBadRequest(res, 'studentId обязателен');
    }

    const { data: homeworkData, error: hwError } = await supabase
      .from('homework')
      .select('*')
      .eq('group_id', groupId)
      .order('id', { ascending: false });

    if (hwError) {
      return sendBadRequest(res, hwError);
    }

    const homeworkIds = (homeworkData || []).map(item => item.id);

    let submissions = [];

    if (homeworkIds.length > 0) {
      const { data: subData, error: subError } = await supabase
        .from('homework_submissions')
        .select('*')
        .eq('student_id', studentId)
        .in('homework_id', homeworkIds);

      if (subError) {
        return sendBadRequest(res, subError);
      }

      submissions = subData || [];
    }

    const result = (homeworkData || []).map(hw => {
      const submission = submissions.find(sub => sub.homework_id === hw.id) || null;
      return {
        ...hw,
        submission
      };
    });

    return res.json(result);
  } catch (err) {
    return sendServerError(res, '/api/student/homework/:groupId/:studentId', err);
  }
});

// Создание ДЗ
const multer = require("multer");
const path = require("path");

const homeworkStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/homework");
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + "-" + file.originalname;
        cb(null, uniqueName);
    }
});

const uploadHomework = multer({ storage: homeworkStorage });

app.use("/uploads", express.static("uploads"));

app.post("/api/homework", uploadHomework.single("attachment"), async (req, res) => {
    try {
        const {
            group_id,
            subject_title,
            title,
            description,
            deadline,
            format
        } = req.body;

        if (!group_id || !subject_title || !title || !description || !deadline || !format) {
            return res.status(400).json({ error: "Не все поля заполнены" });
        }

        const attachmentUrl = req.file
            ? `${req.protocol}://${req.get("host")}/uploads/homework/${req.file.filename}`
            : null;

        const attachmentName = req.file
            ? req.file.originalname
            : null;

        const { data, error } = await supabase
            .from("homework")
            .insert([
                {
                    group_id,
                    subject_title,
                    title,
                    description,
                    deadline,
                    format,
                    attachment_url: attachmentUrl,
                    attachment_name: attachmentName
                }
            ])
            .select();

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json(data[0]);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

// Сдача ДЗ
app.post('/api/submit-homework', upload.single('file'), async (req, res) => {
  try {
    const homework_id = parseNumber(req.body.homework_id, 'homework_id', { required: true });
    const student_id = parseString(req.body.student_id);
    const answer_text = parseString(req.body.answer_text);
    const file = req.file;

    if (!student_id) {
      if (file?.path) await removeTempFile(file.path);
      return sendBadRequest(res, 'student_id обязателен');
    }

  const fileUrl = file
  ? `${req.protocol}://${req.get('host')}/uploads/submissions/${file.filename}`
  : null;

const fileName = file
  ? Buffer.from(file.originalname, 'latin1').toString('utf8')
  : null;

const payload = {
  homework_id,
  student_id,
  answer_text,
  file_name: fileName,
  file_path: fileUrl,
  status: 'submitted',
  grade: null,
  teacher_comment: null,
  submitted_at: new Date().toISOString(),
  reviewed_at: null
};

    const { data: existing, error: existingError } = await supabase
      .from('homework_submissions')
      .select('id')
      .eq('homework_id', homework_id)
      .eq('student_id', student_id)
      .maybeSingle();

    if (existingError) {
      if (file?.path) await removeTempFile(file.path);
      return sendBadRequest(res, existingError);
    }

    let result;
    let error;

    if (existing) {
      ({ data: result, error } = await supabase
        .from('homework_submissions')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single());
    } else {
      ({ data: result, error } = await supabase
        .from('homework_submissions')
        .insert([payload])
        .select()
        .single());
    }

    if (error) {
      if (file?.path) await removeTempFile(file.path);
      return sendBadRequest(res, error);
    }

    return res.json({
      message: 'Задание сохранено',
      submission: result
    });
  } catch (err) {
    if (req.file?.path) await removeTempFile(req.file.path);
    return sendServerError(res, '/api/submit-homework', err);
  }
});

/* =========================================================
   TEACHER HOMEWORK CHECK
========================================================= */

// Список непроверенных ДЗ
app.get('/api/teacher/homework/pending/:teacherId', async (req, res) => {
  try {
    const teacherId = parseString(req.params.teacherId);

    if (!teacherId) {
      return sendBadRequest(res, 'teacherId обязателен');
    }

    const { data: teacherGroups, error: tgError } = await supabase
      .from('teacher_groups')
      .select('group_id')
      .eq('teacher_id', teacherId);

    if (tgError) {
      return sendBadRequest(res, tgError);
    }

    const groupIds = (teacherGroups || []).map(item => item.group_id);

    if (!groupIds.length) {
      return res.json([]);
    }

    const { data: homeworkData, error: hwError } = await supabase
      .from('homework')
      .select('*')
      .in('group_id', groupIds);

    if (hwError) {
      return sendBadRequest(res, hwError);
    }

    const homeworkIds = (homeworkData || []).map(item => item.id);

    if (!homeworkIds.length) {
      return res.json([]);
    }

    const { data: submissions, error: subError } = await supabase
      .from('homework_submissions')
      .select('*')
      .in('homework_id', homeworkIds)
      .eq('status', 'submitted')
      .is('grade', null)
      .order('submitted_at', { ascending: false });

    if (subError) {
      return sendBadRequest(res, subError);
    }

    if (!submissions?.length) {
      return res.json([]);
    }

    const studentIds = submissions.map(item => item.student_id);

    const { data: students, error: stError } = await supabase
      .from('profiles')
      .select('id, full_name, group_id')
      .in('id', studentIds);

    if (stError) {
      return sendBadRequest(res, stError);
    }

    const { data: groupsData, error: groupsError } = await supabase
      .from('groups')
      .select('id, name')
      .in('id', groupIds);

    if (groupsError) {
      return sendBadRequest(res, groupsError);
    }

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

// Проверка ДЗ учителем
app.put('/api/teacher/homework/review/:submissionId', async (req, res) => {
  try {
    const submissionId = parseNumber(req.params.submissionId, 'submissionId', { required: true });
    const grade = parseNumber(req.body.grade, 'grade', { required: true });
    const teacher_comment = parseString(req.body.teacher_comment);

    const { data, error } = await supabase
      .from('homework_submissions')
      .update({
        grade,
        teacher_comment,
        status: 'reviewed',
        reviewed_at: new Date().toISOString()
      })
      .eq('id', submissionId)
      .select()
      .single();

    if (error) {
      return sendBadRequest(res, error);
    }

    return res.json({
      message: 'Домашнее задание проверено',
      submission: data
    });
  } catch (err) {
    return sendServerError(res, '/api/teacher/homework/review/:submissionId', err);
  }
});

/* =========================================================
   ADMIN / USERS
========================================================= */

app.get('/api/admin/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, group_id, can_edit_news')
      .order('full_name', { ascending: true });

    if (error) {
      return sendBadRequest(res, error);
    }

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

    if (!userId) {
      return sendBadRequest(res, 'userId обязателен');
    }

    const allowedRoles = ['student', 'teacher', 'admin'];

    if (!role || !allowedRoles.includes(role)) {
      return sendBadRequest(res, 'Некорректная роль');
    }

    let group_id = null;

    if (req.body.group_id !== undefined && req.body.group_id !== null && req.body.group_id !== '') {
      group_id = parseNumber(req.body.group_id, 'group_id', { required: false, allowNull: true });
    }

    const payload = {
      role,
      group_id,
      can_edit_news
    };

    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId)
      .select('id, full_name, role, group_id, can_edit_news')
      .single();

    if (error) {
      return sendBadRequest(res, error);
    }

    return res.json({
      message: 'Права пользователя обновлены',
      user: data
    });
  } catch (err) {
    return sendServerError(res, '/api/admin/users/:userId/access', err);
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
      .select(`
        day_of_week,
        lesson_number,
        room,
        subjects (
          title
        )
      `)
      .eq('group_id', groupId)
      .order('day_of_week', { ascending: true })
      .order('lesson_number', { ascending: true });

    if (error) {
      return sendBadRequest(res, error);
    }

    return res.json(data || []);
  } catch (err) {
    return sendServerError(res, '/api/schedule/:groupId', err);
  }
});


async function enrichNewsList(newsItems, userId = null) {
  const items = newsItems || [];
  if (!items.length) return [];

  const newsIds = items.map(item => item.id);

  const [{ data: reactionRows }, { data: commentRows }] = await Promise.all([
    supabase.from('news_reactions').select('news_id, user_id, reaction_type').in('news_id', newsIds),
    supabase.from('news_comments').select('news_id').in('news_id', newsIds)
  ]);

  return items.map(item => {
    const reactionsForItem = (reactionRows || []).filter(row => row.news_id === item.id);
    const reactionTypes = ['like', 'heart', 'laugh', 'wow', 'sad'];

    const reactions = reactionTypes.map(type => ({
      reaction_type: type,
      count: reactionsForItem.filter(row => row.reaction_type === type).length
    }));

    const myReaction = userId
      ? reactionsForItem.find(row => row.user_id === userId)?.reaction_type || null
      : null;

    return {
      ...item,
      reactions,
      my_reaction: myReaction,
      comments_count: (commentRows || []).filter(row => row.news_id === item.id).length
    };
  });
}

async function enrichCommentsList(comments, userId = null) {
  const items = comments || [];
  if (!items.length) return [];

  const commentIds = items.map(item => item.id);

  const { data: reactionRows, error } = await supabase
    .from('news_comment_reactions')
    .select('comment_id, user_id, reaction_type')
    .in('comment_id', commentIds);

  if (error) throw error;

  const reactionTypes = ['like', 'heart', 'laugh', 'wow', 'sad'];

  return items.map(item => {
    const reactionsForItem = (reactionRows || []).filter(row => row.comment_id === item.id);

    return {
      ...item,
      reactions: reactionTypes.map(type => ({
        reaction_type: type,
        count: reactionsForItem.filter(row => row.reaction_type === type).length
      })),
      my_reaction: userId
        ? reactionsForItem.find(row => row.user_id === userId)?.reaction_type || null
        : null
    };
  });
}

/* =========================================================
   NEWS
========================================================= */

app.get('/api/news', async (req, res) => {
  try {
    const userId = parseString(req.query.user_id);

    const { data, error } = await supabase
      .from('news')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return sendBadRequest(res, error);
    }

    return res.json(await enrichNewsList(data || [], userId));
  } catch (err) {
    return sendServerError(res, '/api/news', err);
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

    if (!title) {
      return sendBadRequest(res, 'Заголовок обязателен');
    }

    const payload = {
      title,
      description,
      image_url,
      date_start,
      date_end,
      created_by
    };

    const { data, error } = await supabase
      .from('news')
      .insert([payload])
      .select()
      .single();

    if (error) {
      return sendBadRequest(res, error);
    }

    return res.status(201).json({
      message: 'Новость опубликована',
      news: data
    });
  } catch (err) {
    return sendServerError(res, 'POST /api/news', err);
  }
});

app.put('/api/news/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });
    const title = parseString(req.body.title);
    const description = parseString(req.body.description);
    const image_url = parseString(req.body.image_url);
    const date_start = parseString(req.body.date_start);
    const date_end = parseString(req.body.date_end);

    const payload = {
      title,
      description,
      image_url,
      date_start,
      date_end
    };

    const { data, error } = await supabase
      .from('news')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return sendBadRequest(res, error);
    }

    return res.json({
      message: 'Новость обновлена',
      news: data
    });
  } catch (err) {
    return sendServerError(res, 'PUT /api/news/:id', err);
  }
});

app.delete('/api/news/:id', async (req, res) => {
  try {
    const id = parseNumber(req.params.id, 'id', { required: true });

    const { error } = await supabase
      .from('news')
      .delete()
      .eq('id', id);

    if (error) {
      return sendBadRequest(res, error);
    }

    return res.json({ message: 'Новость удалена' });
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
    if (!allowed.includes(reaction_type)) return sendBadRequest(res, 'Некорректная реакция');

    const { data: existing, error: findError } = await supabase
      .from('news_reactions')
      .select('id, reaction_type')
      .eq('news_id', news_id)
      .eq('user_id', user_id)
      .maybeSingle();

    if (findError) return sendBadRequest(res, findError);

    if (existing && existing.reaction_type === reaction_type) {
      const { error } = await supabase
        .from('news_reactions')
        .delete()
        .eq('id', existing.id);

      if (error) return sendBadRequest(res, error);
      return res.json({ reaction: null });
    }

    if (existing) {
      const { data, error } = await supabase
        .from('news_reactions')
        .update({ reaction_type })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) return sendBadRequest(res, error);
      return res.json({ reaction: data });
    }

    const { data, error } = await supabase
      .from('news_reactions')
      .insert([{ news_id, user_id, reaction_type }])
      .select()
      .single();

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
      .select(`
        id,
        news_id,
        user_id,
        parent_id,
        text,
        created_at,
        profiles (
          full_name,
          avatar_url
        )
      `)
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
    if (!text) return sendBadRequest(res, 'Комментарий не может быть пустым');

    const { data, error } = await supabase
      .from('news_comments')
      .insert([{ news_id, user_id, text, parent_id }])
      .select()
      .single();

    if (error) return sendBadRequest(res, error);
    return res.status(201).json({ message: 'Комментарий добавлен', comment: data });
  } catch (err) {
    return sendServerError(res, '/api/news/:id/comments POST', err);
  }
});

app.delete('/api/news/comments/:commentId', async (req, res) => {
  try {
    const commentId = parseNumber(req.params.commentId, 'commentId', { required: true });
    const userId = parseString(req.body.user_id);

    if (!userId) return sendBadRequest(res, 'user_id обязателен');

    const { data: comment, error: findError } = await supabase
      .from('news_comments')
      .select('id, user_id')
      .eq('id', commentId)
      .maybeSingle();

    if (findError) return sendBadRequest(res, findError);
    if (!comment) return res.status(404).json({ error: 'Комментарий не найден' });
    if (comment.user_id !== userId) return sendForbidden(res, 'Можно удалять только свои комментарии');

    const { error } = await supabase
      .from('news_comments')
      .delete()
      .eq('id', commentId);

    if (error) return sendBadRequest(res, error);
    return res.json({ message: 'Комментарий удалён' });
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
    if (!allowed.includes(reaction_type)) return sendBadRequest(res, 'Некорректная реакция');

    const { data: existing, error: findError } = await supabase
      .from('news_comment_reactions')
      .select('id, reaction_type')
      .eq('comment_id', comment_id)
      .eq('user_id', user_id)
      .maybeSingle();

    if (findError) return sendBadRequest(res, findError);

    if (existing && existing.reaction_type === reaction_type) {
      const { error } = await supabase
        .from('news_comment_reactions')
        .delete()
        .eq('id', existing.id);

      if (error) return sendBadRequest(res, error);
      return res.json({ reaction: null });
    }

    if (existing) {
      const { data, error } = await supabase
        .from('news_comment_reactions')
        .update({ reaction_type })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) return sendBadRequest(res, error);
      return res.json({ reaction: data });
    }

    const { data, error } = await supabase
      .from('news_comment_reactions')
      .insert([{ comment_id, user_id, reaction_type }])
      .select()
      .single();

    if (error) return sendBadRequest(res, error);
    return res.status(201).json({ reaction: data });
  } catch (err) {
    return sendServerError(res, '/api/news/comments/:commentId/reaction', err);
  }
});

/* =========================================================
   TEACHER
========================================================= */

app.get('/api/teacher/groups/:teacherId', async (req, res) => {
  try {
    const teacherId = parseString(req.params.teacherId);

    if (!teacherId) {
      return sendBadRequest(res, 'Некорректный teacherId');
    }

    const { data, error } = await supabase
      .from('teacher_groups')
      .select('group_id, groups(id, name)')
      .eq('teacher_id', teacherId);

    if (error) {
      return sendBadRequest(res, error);
    }

    const groups = (data || [])
      .map(item => item.groups)
      .filter(Boolean);

    return res.json(groups);
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

    if (error) {
      return sendBadRequest(res, error);
    }

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
    const month = parseString(req.query.month);

    let groupName = `Группа ${groupId}`;
    let students = [];
    let grades = [];
    let days = [];
    let monthLabel = '';
    let selectedMonth = month || null;

    if (teacherId && month) {
      const monthInfo = getMonthRange(month);

      const { data: teacherGroup, error: teacherGroupError } = await supabase
        .from('teacher_groups')
        .select('group_id, groups(name)')
        .eq('teacher_id', teacherId)
        .eq('group_id', groupId)
        .maybeSingle();

      if (teacherGroupError) {
        return sendBadRequest(res, teacherGroupError);
      }

      if (!teacherGroup) {
        return sendForbidden(res, 'Эта группа не принадлежит преподавателю');
      }

      groupName = teacherGroup.groups?.name || `Группа ${groupId}`;

      const { data: studentsData, error: studentsError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('group_id', groupId)
        .eq('role', 'student')
        .order('full_name', { ascending: true });

      if (studentsError) {
        return sendBadRequest(res, studentsError);
      }

      students = studentsData || [];

      const { data: gradesData, error: gradesError } = await supabase
        .from('journal')
        .select('student_id, grade, created_at')
        .eq('group_id', groupId)
        .gte('created_at', monthInfo.startISO)
        .lt('created_at', monthInfo.endISO)
        .order('created_at', { ascending: true });

      if (gradesError) {
        return sendBadRequest(res, gradesError);
      }

      grades = gradesData || [];
      days = Array.from({ length: monthInfo.daysInMonth }, (_, i) => i + 1);
      monthLabel = monthInfo.monthLabel;
    } else {
      const { data: groupData, error: groupError } = await supabase
        .from('groups')
        .select('name')
        .eq('id', groupId)
        .maybeSingle();

      if (!groupError && groupData?.name) {
        groupName = groupData.name;
      }

      const { data: studentsData, error: studentsError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('group_id', groupId)
        .eq('role', 'student')
        .order('full_name', { ascending: true });

      if (studentsError) {
        return sendBadRequest(res, studentsError);
      }

      students = studentsData || [];

      const { data: gradesData, error: gradesError } = await supabase
        .from('journal')
        .select('student_id, grade, created_at')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });

      if (gradesError) {
        return sendBadRequest(res, gradesError);
      }

      grades = gradesData || [];

      const currentDate = new Date();
      const year = currentDate.getFullYear();
      const monthNum = currentDate.getMonth() + 1;
      const daysInMonth = new Date(year, monthNum, 0).getDate();

      days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
      monthLabel = `${String(monthNum).padStart(2, '0')}.${year}`;
    }

    const studentsResult = students.map(student => {
      const studentGrades = grades.filter(item => item.student_id === student.id);
      const gradesByDay = {};

      for (const item of studentGrades) {
        const day = new Date(item.created_at).getDate();

        if (!gradesByDay[day]) {
          gradesByDay[day] = [];
        }

        gradesByDay[day].push(item.grade);
      }

      const normalizedGradesByDay = {};

      for (const day of Object.keys(gradesByDay)) {
        normalizedGradesByDay[day] =
          gradesByDay[day].length === 1 ? gradesByDay[day][0] : gradesByDay[day];
      }

      const flatGrades = studentGrades
        .map(item => Number(item.grade))
        .filter(item => !Number.isNaN(item));

      const averageGrade = flatGrades.length
        ? Math.round(flatGrades.reduce((sum, grade) => sum + grade, 0) / flatGrades.length)
        : 0;

      return {
        student_id: student.id,
        full_name: student.full_name,
        grades_by_day: normalizedGradesByDay,
        average_grade: averageGrade
      };
    });

    const allGrades = grades
      .map(item => Number(item.grade))
      .filter(item => !Number.isNaN(item));

    const groupAvg = allGrades.length
      ? Math.round(allGrades.reduce((sum, grade) => sum + grade, 0) / allGrades.length)
      : 0;

    return res.json({
      group_id: groupId,
      group_name: groupName,
      month: selectedMonth,
      month_label: monthLabel,
      days,
      average_grade: groupAvg,
      students: studentsResult
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

    if (!file) {
      return sendBadRequest(res, 'Файл не загружен');
    }

    const fileBuffer = await fs.promises.readFile(file.path);
    const fileExt = path.extname(file.originalname) || '';
    const fileName = `${userId}_${Date.now()}${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, fileBuffer, {
        contentType: file.mimetype,
        upsert: true
      });

    await removeTempFile(file.path);

    if (uploadError) {
      console.error(uploadError);
      return res.status(500).json({ error: 'Ошибка загрузки в storage' });
    }

    const { data: publicUrlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData.publicUrl;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId);

    if (updateError) {
      console.error(updateError);
      return res.status(500).json({ error: 'Ошибка обновления профиля' });
    }

    return res.json({
      message: 'Аватар загружен',
      avatar_url: publicUrl
    });
  } catch (err) {
    if (req.file?.path) await removeTempFile(req.file.path);
    return sendServerError(res, '/api/avatar/upload', err);
  }
});

app.get('/api/profile/:id', async (req, res) => {
  try {
    const id = parseString(req.params.id);

    if (!id) {
      return sendBadRequest(res, 'id обязателен');
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return sendBadRequest(res, error);
    }

    return res.json(data || {});
  } catch (err) {
    return sendServerError(res, '/api/profile/:id', err);
  }
});

/* =========================================================
   REDIRECT / COMPAT
========================================================= */

app.get('/api/statistic/:groupId', async (req, res) => {
  return res.redirect(`/api/statistics/${req.params.groupId}`);
});

/* =========================================================
   START
========================================================= */

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер пашет на порту ${PORT}`);
});