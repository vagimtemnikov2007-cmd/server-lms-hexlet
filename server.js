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
    .select('role, full_name, group_id, course, specialization')
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
    .order('created_at', { ascending: false }); // Сначала свежие новости

  if (error) return res.status(400).json(error);
  res.json(data);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер пашет на порту ${PORT}`);
});

