const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Инициализация Supabase через Environment Variables на Render
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const PORT = process.env.PORT || 3000;

// --- РОУТЫ ---

// 1. Проверка связи
app.get('/', (req, res) => res.send('API Электронного журнала работает 🚀'));

// 2. ПОЛУЧЕНИЕ ЖУРНАЛА (Оценки студента)
app.get('/api/journal/:studentId', async (req, res) => {
  const { data, error } = await supabase
    .from('journal')
    .select('grade, comment, created_at, subjects(title)')
    .eq('student_id', req.params.studentId);
  
  if (error) return res.status(400).json(error);
  res.json(data);
});

// 3. ПОЛУЧЕНИЕ ДЗ (Для конкретной группы)
app.get('/api/homework/:groupId', async (req, res) => {
  const { data, error } = await supabase
    .from('homework')
    .select('*, subjects(title)')
    .eq('group_id', req.params.groupId)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json(error);
  res.json(data);
});

// 4. ДОБАВЛЕНИЕ ОЦЕНКИ (Для препода/админа)
app.post('/api/grades', async (req, res) => {
  const { student_id, subject_id, grade, comment } = req.body;
  const { data, error } = await supabase
    .from('journal')
    .insert([{ student_id, subject_id, grade, comment }]);

  if (error) return res.status(400).json(error);
  res.json({ message: 'Оценка добавлена', data });
});

// 5. НОВОСТИ (Для всех)
app.get('/api/news', async (req, res) => {
  const { data, error } = await supabase
    .from('news')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) return res.status(400).json(error);
  res.json(data);
});

// 6. АДМИН: Получить список всех юзеров с ролями
app.get('/api/admin/users', async (req, res) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, groups(name)');
    
  if (error) return res.status(400).json(error);
  res.json(data);
});

// Запуск
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер пашет на порту ${PORT}`);
});