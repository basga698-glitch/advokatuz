const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

function getTashkentISOString() {
  const now = new Date();
  const tashkentDateStr = now.toLocaleString("en-US", { timeZone: "Asia/Tashkent" });
  return new Date(tashkentDateStr).toISOString();
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./leads.db', (err) => {
  if (err) {
    console.error('Ошибка подключения к БД:', err.message);
  } else {
    console.log('Подключено к базе данных SQLite (leads.db).');
  }
});

db.run(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'new',
    created_at TEXT
  )
`);

app.get('/api/leads', (req, res) => {
  const status = req.query.status || 'new';
  const sql = `SELECT * FROM leads WHERE status = ? ORDER BY id DESC`;

  db.all(sql, [status], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/leads', (req, res) => {
  const { client_name, client_phone, description } = req.body;

  if (!client_name || !client_phone) {
    return res.status(400).json({ error: 'Заполните имя и телефон!' });
  }

  const tashkentTime = getTashkentISOString();

  const sql = `INSERT INTO leads (client_name, client_phone, description, status, created_at) VALUES (?, ?, ?, 'new', ?)`;
  
  db.run(sql, [client_name, client_phone, description, tashkentTime], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const newLead = {
      id: this.lastID,
      client_name,
      client_phone,
      description,
      status: 'new',
      created_at: tashkentTime
    };

    io.emit('new_lead', newLead);
    res.status(201).json({ success: true, lead: newLead });
  });
});

app.patch('/api/leads/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['new', 'archived'].includes(status)) {
    return res.status(400).json({ error: 'Неверный статус' });
  }

  const sql = `UPDATE leads SET status = ? WHERE id = ?`;

  db.run(sql, [status, id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    io.emit('update_lead', { id, status });
    res.json({ success: true, updatedID: id, status });
  });
});

// Эндпоинт безвозвратного удаления заявки
app.delete('/api/leads/:id', (req, res) => {
  const { id } = req.params;
  const sql = `DELETE FROM leads WHERE id = ?`;

  db.run(sql, [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    io.emit('delete_lead', { id });
    res.json({ success: true, deletedID: id });
  });
});

io.on('connection', (socket) => {
  console.log('Подключение к админ-панели:', socket.id);
});

server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Часовой пояс: Узбекистан (Asia/Tashkent / UTC+5)`);
  console.log(`Сайт: http://localhost:${PORT}/`);
  console.log(`Офис Каримова: http://localhost:${PORT}/admin.html`);
  console.log(`Офис Азимова: http://localhost:${PORT}/ikrom.html`);
  console.log(`=================================`);
});