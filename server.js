const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
require('dotenv').config();

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error('ОШИБКА: SUPABASE_URL или SUPABASE_KEY не заданы в настройках Render!');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('API Электронного журнала работает 🚀'));

app.post('/api/login', async (req, res) => {
  const { iin, password } = req.body;

  if (!iin || !password) {
    return res.status(400).json({ error: "Введите ИИН и пароль" });
  }

  const { data: user, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, group_id, course, specialization')
    .eq('iin', iin)
    .eq('password', password)
    .single();

  if (error || !user) {
    return res.status(401).json({ error: "Неверный ИИН или пароль" });
  }

  res.json(user);
});

app.get('/api/journal/:groupId', async (req, res) => {
  const { groupId } = req.params;

  const { data, error } = await supabase
    .from('journal')
    .select('id, student_id, subject_id, grade, created_at, subjects(title)')
    .eq('group_id', groupId);

  if (error) {
    console.error("Ошибка Supabase:", error);
    return res.status(400).json(error);
  }

  res.json(data);
});

app.get('/api/student/homework/:groupId/:studentId', async (req, res) => {
    try {
        const { groupId, studentId } = req.params;

        const { data: homeworkData, error: hwError } = await supabase
            .from('homework')
            .select('*')
            .eq('group_id', groupId)
            .order('id', { ascending: false });

        if (hwError) {
            return res.status(400).json(hwError);
        }

        const homeworkIds = homeworkData.map(h => h.id);

        let submissions = [];
        if (homeworkIds.length) {
            const { data: subData, error: subError } = await supabase
                .from('homework_submissions')
                .select('*')
                .eq('student_id', studentId)
                .in('homework_id', homeworkIds);

            if (subError) {
                return res.status(400).json(subError);
            }

            submissions = subData || [];
        }

        const result = homeworkData.map(hw => {
            const submission = submissions.find(s => s.homework_id === hw.id) || null;
            return {
                ...hw,
                submission
            };
        });

        res.json(result);
    } catch (err) {
        console.error('Ошибка student/homework:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/submit-homework', upload.single('file'), async (req, res) => {
    try {
        const { homework_id, student_id, answer_text } = req.body;
        const file = req.file;

        if (!homework_id || !student_id) {
            return res.status(400).json({ error: 'homework_id и student_id обязательны' });
        }

        const payload = {
            homework_id: Number(homework_id),
            student_id,
            answer_text: answer_text || null,
            file_name: file ? file.originalname : null,
            file_path: file ? file.path : null,
            status: 'submitted',
            grade: null,
            teacher_comment: null,
            submitted_at: new Date().toISOString(),
            reviewed_at: null
        };

        const { data: existing, error: existingError } = await supabase
            .from('homework_submissions')
            .select('id')
            .eq('homework_id', Number(homework_id))
            .eq('student_id', student_id)
            .maybeSingle();

        if (existingError) {
            return res.status(400).json(existingError);
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
            return res.status(400).json(error);
        }

        res.json({ message: 'Задание сохранено', submission: result });
    } catch (err) {
        console.error('Ошибка submit-homework:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/homework', async (req, res) => {
  try {
    const { group_id, subject_title, title, description, format, deadline } = req.body;

    const { data, error } = await supabase
      .from('homework')
      .insert([{
        group_id: parseInt(group_id),
        subject_title,
        title,
        description,
        format,
        deadline
      }]);

    if (error) throw error;

    res.status(201).json({ message: "Задание создано", data });
  } catch (err) {
    console.error("Ошибка сервера:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, groups(name)');

  if (error) return res.status(400).json(error);
  res.json(data);
});

app.get('/api/schedule/:groupId', async (req, res) => {
  const { groupId } = req.params;

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
    return res.status(400).json(error);
  }

  res.json(data);
});

app.get('/api/news', async (req, res) => {
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json(error);
  res.json(data);
});

app.get('/api/teacher/groups/:teacherId', async (req, res) => {
  const teacherId = req.params.teacherId;

  if (!teacherId) {
    return res.status(400).json({ error: "Некорректный teacherId" });
  }

  const { data, error } = await supabase
    .from('teacher_groups')
    .select('group_id, groups(id, name)')
    .eq('teacher_id', teacherId);

  if (error) {
    console.error("Ошибка teacher_groups:", error);
    return res.status(400).json(error);
  }

  const groups = data
    .map(item => item.groups)
    .filter(Boolean);

  res.json(groups);
});

app.get('/api/teacher/students/:groupId', async (req, res) => {
  const { groupId } = req.params;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, course, specialization')
    .eq('group_id', groupId)
    .eq('role', 'student');

  if (error) return res.status(400).json(error);
  res.json(data);
});

app.get('/api/statistics/:groupId', async (req, res) => {
  try {
    const groupId = Number(req.params.groupId);
    const teacherId = req.query.teacherId || null;
    const month = req.query.month || null;

    if (!groupId) {
      return res.status(400).json({ error: "Некорректный groupId" });
    }

    let groupName = `Группа ${groupId}`;
    let students = [];
    let grades = [];
    let days = [];
    let monthLabel = '';

    if (teacherId && month) {
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({ error: "month должен быть в формате YYYY-MM" });
      }

      const { data: teacherGroup, error: teacherGroupError } = await supabase
        .from('teacher_groups')
        .select('group_id, groups(name)')
        .eq('teacher_id', teacherId)
        .eq('group_id', groupId)
        .maybeSingle();

      if (teacherGroupError) {
        console.error("Ошибка проверки teacher_groups:", teacherGroupError);
        return res.status(400).json(teacherGroupError);
      }

      if (!teacherGroup) {
        return res.status(403).json({ error: "Эта группа не принадлежит преподавателю" });
      }

      groupName = teacherGroup.groups?.name || `Группа ${groupId}`;

      const { data: studentsData, error: studentsError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('group_id', groupId)
        .eq('role', 'student')
        .order('full_name', { ascending: true });

      if (studentsError) {
        console.error("Ошибка загрузки студентов:", studentsError);
        return res.status(400).json(studentsError);
      }

      students = studentsData || [];

      const [year, monthNum] = month.split('-').map(Number);
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 1);

      const startISO = startDate.toISOString();
      const endISO = endDate.toISOString();

      const daysInMonth = new Date(year, monthNum, 0).getDate();
      days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
      monthLabel = `${String(monthNum).padStart(2, '0')}.${year}`;

      const { data: gradesData, error: gradesError } = await supabase
        .from('journal')
        .select('student_id, grade, created_at')
        .eq('group_id', groupId)
        .gte('created_at', startISO)
        .lt('created_at', endISO)
        .order('created_at', { ascending: true });

      if (gradesError) {
        console.error("Ошибка загрузки оценок:", gradesError);
        return res.status(400).json(gradesError);
      }

      grades = gradesData || [];
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
        console.error("Ошибка загрузки студентов:", studentsError);
        return res.status(400).json(studentsError);
      }

      students = studentsData || [];

      const { data: gradesData, error: gradesError } = await supabase
        .from('journal')
        .select('student_id, grade, created_at')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });

      if (gradesError) {
        console.error("Ошибка загрузки оценок:", gradesError);
        return res.status(400).json(gradesError);
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
      const studentGrades = grades.filter(g => g.student_id === student.id);
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
        .map(g => Number(g.grade))
        .filter(g => !isNaN(g));

      const averageGrade = flatGrades.length
        ? Math.round(flatGrades.reduce((a, b) => a + b, 0) / flatGrades.length)
        : 0;

      return {
        student_id: student.id,
        full_name: student.full_name,
        grades_by_day: normalizedGradesByDay,
        average_grade: averageGrade
      };
    });

    const allGrades = grades
      .map(g => Number(g.grade))
      .filter(g => !isNaN(g));

    const groupAvg = allGrades.length
      ? Math.round(allGrades.reduce((a, b) => a + b, 0) / allGrades.length)
      : 0;

    res.json({
      group_id: groupId,
      group_name: groupName,
      month: month || null,
      month_label: monthLabel,
      days,
      average_grade: groupAvg,
      students: studentsResult
    });

  } catch (err) {
    console.error("Ошибка сервера /api/statistics/:groupId", err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/statistic/:groupId', async (req, res) => {
  res.redirect(`/api/statistics/${req.params.groupId}`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер пашет на порту ${PORT}`);
});