const express = require('express');
const cors = require('cors');
const path = require('path');
const libraryRoutes = require('./routes/libraryRoutes');
const db = require('./db');
const crypto = require('crypto');
const { promisify } = require('util');
const scryptAsync = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

async function ensureAdmin() {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) return;
  const existing = await db.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [process.env.ADMIN_EMAIL.trim()]);
  if (existing.rows.length) return;
  const hash = await hashPassword(process.env.ADMIN_PASSWORD);
  await db.query("INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,'admin')", [process.env.ADMIN_NAME || 'Administrador', process.env.ADMIN_EMAIL.trim().toLowerCase(), hash]);
  console.log(`Usuário administrador criado: ${process.env.ADMIN_EMAIL}`);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/api', libraryRoutes);

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'biblioteca-api' }));

app.listen(PORT, async () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  try { await ensureAdmin(); } catch (e) { console.error('Não foi possível criar o administrador inicial:', e.message); }
});
