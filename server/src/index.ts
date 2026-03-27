import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files from the client directory
app.use(express.static(path.join(__dirname, '../../client/dist')));

// Database setup
let db: any;
(async () => {
  db = await open({
    filename: './database.sqlite',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT
    )
  `);

  const count = await db.get('SELECT COUNT(*) as count FROM messages');
  if (count.count === 0) {
    await db.run('INSERT INTO messages (content) VALUES (?)', 'Hello from SQLite!');
  }
})();

app.get('/api/message', async (req, res) => {
  try {
    const row = await db.get('SELECT content FROM messages ORDER BY id DESC LIMIT 1');
    res.json({ message: row ? row.content : 'No message found' });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

// All other GET requests not handled will return our React app
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
