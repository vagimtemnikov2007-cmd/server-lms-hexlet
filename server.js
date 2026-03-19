  const express = require('express');
  const cors = require('cors');
  const { createClient } = require('@supabase/supabase-js');
  require('dotenv').config();

  const app = express();

  // 1. Настройка CORS для работы с Live Server (127.0.0.1)
  app.use(cors()); 
  app.use(express.json());

  // 2. Проверка переменных окружения (чтобы сервер не падал без ключей)
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('ОШИБКА: SUPABASE_URL или SUPABASE_KEY не заданы в настройках Render!');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  const PORT = process.env.PORT || 3000;

  // --- РОУТЫ ---

  // Проверка связи (открой это в браузере для теста)
  app.get('/', (req, res) => res.send('API Электронного журнала работает 🚀'));

  // Логин (через POST)
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
    
    // Запрашиваем только то, что есть в таблице!
    const { data, error } = await supabase
      .from('journal')
      .select('id, student_id, subject_id, grade, created_at, subjects(title)')
      .eq('group_id', groupId); // Теперь это поле появится после выполнения пункта 1

    if (error) {
      console.error("Ошибка Supabase:", error);
      return res.status(400).json(error);
    }
    res.json(data);
  });
  // Получение ДЗ
  app.get('/api/homework/:groupId', async (req, res) => {
    const { data, error } = await supabase
      .from('homework')
      .select('*, subjects(title)')
      .eq('group_id', req.params.groupId)
      .order('id', { ascending: false });
    if (error) return res.status(400).json(error);
    res.json(data);
  });

  const multer = require('multer');
  const upload = multer({ dest: 'uploads/' });

  app.post('/api/submit-homework', upload.single('file'), async (req, res) => {
      // 1. Сохрани путь к файлу в базу данных (таблица student_homework)
      // 2. Логика сохранения здесь...
      res.json({ message: "Файл получен" });
  });

  app.post('/api/homework', async (req, res) => {
      try {
          const { group_id, subject_title, title, description, format, deadline } = req.body;

          // Вставка в таблицу homework
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
  // Получение всех юзеров (для Админа)
  app.get('/api/admin/users', async (req, res) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, groups(name)');
      
    if (error) return res.status(400).json(error);
    res.json(data);
  });

  // Получение расписания для конкретной группы
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

    const teacherId = Number(req.params.teacherId);

    if (!teacherId) {
        return res.status(400).json({ error: "Некорректный teacherId" });
    }

    const { data, error } = await supabase
        .from('teacher_groups')
        .select('groups(id, name)')
        .eq('teacher_id', teacherId);

    if (error) return res.status(400).json(error);

    const groups = data.map(g => g.groups);

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
        const teacherId = Number(req.query.teacherId);
        const month = req.query.month; // формат YYYY-MM

        if (!groupId || !teacherId) {
            return res.status(400).json({ error: "groupId или teacherId некорректен" });
        }

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return res.status(400).json({ error: "month должен быть в формате YYYY-MM" });
        }

        // 1. Проверяем, что группа принадлежит преподавателю
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

        // 2. Получаем всех студентов группы
        const { data: students, error: studentsError } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('group_id', groupId)
            .eq('role', 'student')
            .order('full_name', { ascending: true });

        if (studentsError) {
            console.error("Ошибка загрузки студентов:", studentsError);
            return res.status(400).json(studentsError);
        }

        // 3. Границы месяца
        const [year, monthNum] = month.split('-').map(Number);
        const startDate = new Date(year, monthNum - 1, 1);
        const endDate = new Date(year, monthNum, 1);

        const startISO = startDate.toISOString();
        const endISO = endDate.toISOString();

        const daysInMonth = new Date(year, monthNum, 0).getDate();
        const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

        // 4. Получаем оценки за этот месяц
        const { data: grades, error: gradesError } = await supabase
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

        // 5. Формируем таблицу оценок по дням
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

            // если в день одна оценка — отдаём число, если несколько — массив
            const normalizedGradesByDay = {};
            for (const day of Object.keys(gradesByDay)) {
                normalizedGradesByDay[day] =
                    gradesByDay[day].length === 1 ? gradesByDay[day][0] : gradesByDay[day];
            }

            const flatGrades = studentGrades.map(g => Number(g.grade)).filter(g => !isNaN(g));
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

        const monthLabel = `${String(monthNum).padStart(2, '0')}.${year}`;

        res.json({
            group_id: groupId,
            group_name: teacherGroup.groups?.name || `Группа ${groupId}`,
            month,
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

  app.get('/api/statistic/:groupId', async (req,res)=>{
      res.redirect(`/api/statistics/${req.params.groupId}`);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер пашет на порту ${PORT}`);
  });

