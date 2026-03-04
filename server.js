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
    .select('role, full_name, group_id')
    .eq('iin', iin)
    .eq('password', password)
    .single();

  if (error || !user) {
    return res.status(401).json({ error: "Неверный ИИН или пароль" });
  }

  res.json(user);
});

// Получение журнала
app.get('/api/journal/:studentId', async (req, res) => {
  const { data, error } = await supabase
    .from('journal')
    .select('grade, comment, created_at, subjects(title)')
    .eq('student_id', req.params.studentId);
  
  if (error) return res.status(400).json(error);
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

// Получение всех юзеров (для Админа)
app.get('/api/admin/users', async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, groups(name)');
    
  if (error) return res.status(400).json(error);
  res.json(data);
});
button_log.addEventListener('click', async function(e) {
    e.preventDefault();
    
    // 1. ПРОВЕРЬ ЭТУ ССЫЛКУ - ТУТ ДОЛЖНО БЫТЬ login
    const url = 'https://server-lms-hexlet.onrender.com/api/login'; 
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                iin: input_iin.value,
                password: input_pass.value
            })
        });

        // 2. Сначала проверяем, что сервер вообще ответил успешно (код 200)
        if (!response.ok) {
            const errorText = await response.text(); // Читаем как текст, если это 404 HTML
            console.error("Сервер ответил ошибкой:", response.status, errorText);
            alert("Ошибка сервера: " + response.status);
            return;
        }

        const user = await response.json(); // Теперь безопасно читаем JSON
        console.log("Данные получены:", user);
        
        localStorage.setItem('userStatus', user.role);
        window.location.reload();

    } catch (error) {
        console.error("Ошибка запроса:", error);
    }
});
// Запуск на 0.0.0.0 для Render
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер пашет на порту ${PORT}`);
});

