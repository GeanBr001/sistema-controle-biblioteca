const express = require('express');
const db = require('../db');
const crypto = require('crypto');
const { promisify } = require('util');
const scryptAsync = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const derived = await scryptAsync(password, parts[1], 64);
  return crypto.timingSafeEqual(Buffer.from(parts[2], 'hex'), derived);
}
const router = express.Router();
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'troque-esta-chave-em-producao';

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function createSession(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, role: user.role, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const i = part.indexOf('=');
    return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1))];
  }));
}

function requireAuth(req, res, next) {
  const token = readCookies(req).biblioteca_session;
  if (!token) return res.status(401).json({ error: 'Autenticação necessária.' });
  const [payload, signature] = token.split('.');
  try {
    const expected = sign(payload);
    if (!signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('invalid');
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!session.id || session.exp < Date.now()) throw new Error('expired');
    req.user = session;
    next();
  } catch { return res.status(401).json({ error: 'Sessão inválida ou expirada.' }); }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Acesso permitido somente para administradores.' });
  next();
}

// Auth
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  try {
    const r = await db.query(`SELECT id, name, email, password_hash, role, active FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1`, [email.trim()]);
    if (!r.rows.length || !r.rows[0].active) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    const user = r.rows[0];
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    delete user.password_hash;
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `biblioteca_session=${encodeURIComponent(createSession(user))}; HttpOnly; SameSite=Lax; Max-Age=28800; Path=/${secure}`);
    res.json({ user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'biblioteca_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/');
  res.json({ message: 'Sessão encerrada.' });
});

router.use(requireAuth);

// Dashboard
router.get('/dashboard', async (_req, res) => {
  try {
    const r = await db.query('SELECT * FROM dashboard_summary');
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Categories
router.get('/categories', async (_req, res) => {
  try { const r = await db.query('SELECT * FROM categories ORDER BY name'); res.json(r.rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/categories', async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });
  try {
    const r = await db.query('INSERT INTO categories (name, description) VALUES ($1,$2) RETURNING *', [name.trim(), description?.trim() || null]);
    res.status(201).json(r.rows[0]);
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Categoria já cadastrada.' }); res.status(500).json({ error: e.message }); }
});
router.put('/categories/:id', async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nome da categoria é obrigatório.' });
  try {
    const r = await db.query('UPDATE categories SET name=$1, description=$2 WHERE id=$3 RETURNING *', [name.trim(), description?.trim() || null, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Categoria não encontrada.' });
    res.json(r.rows[0]);
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Categoria já cadastrada.' }); res.status(500).json({ error: e.message }); }
});
router.delete('/categories/:id', async (req, res) => {
  try { await db.query('DELETE FROM categories WHERE id=$1', [req.params.id]); res.json({ message: 'Categoria removida.' }); }
  catch (e) { if (e.code === '23503') return res.status(409).json({ error: 'Não é possível remover uma categoria que possui livros.' }); res.status(500).json({ error: e.message }); }
});

// Books
router.get('/books', async (_req, res) => {
  try {
    const r = await db.query(`SELECT b.*, c.name AS category_name FROM books b JOIN categories c ON c.id=b.category_id ORDER BY b.title`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/books', async (req, res) => {
  const { title, author, isbn, publisher, publication_year, description, category_id, quantity, minimum_quantity, cover_image } = req.body;
  const q = Number(quantity);
  const min = minimum_quantity === '' || minimum_quantity == null ? 2 : Number(minimum_quantity);
  if (!title?.trim() || !author?.trim() || !category_id || !Number.isInteger(q) || q < 0) return res.status(400).json({ error: 'Título, autor, categoria e quantidade válida são obrigatórios.' });
  try {
    const r = await db.query(`INSERT INTO books (title,author,isbn,publisher,publication_year,description,category_id,quantity,available_quantity,minimum_quantity,cover_image) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10) RETURNING *`, [title.trim(), author.trim(), isbn?.trim()||null, publisher?.trim()||null, publication_year || null, description?.trim()||null, category_id, q, min, cover_image||null]);
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/books/:id', async (req, res) => {
  const { title, author, isbn, publisher, publication_year, description, category_id, quantity, minimum_quantity, active } = req.body;
  const q = Number(quantity);
  if (!title?.trim() || !author?.trim() || !category_id || !Number.isInteger(q) || q < 0) return res.status(400).json({ error: 'Dados do livro inválidos.' });
  try {
    const r = await db.query(`UPDATE books SET title=$1,author=$2,isbn=$3,publisher=$4,publication_year=$5,description=$6,category_id=$7,quantity=$8,available_quantity=GREATEST(0, $8 - (quantity - available_quantity)),minimum_quantity=$9,active=$10 WHERE id=$11 RETURNING *`, [title.trim(),author.trim(),isbn?.trim()||null,publisher?.trim()||null,publication_year||null,description?.trim()||null,category_id,q,minimum_quantity ?? 2,active !== false,req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Livro não encontrado.' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/books/:id', async (req, res) => {
  try { const r = await db.query('UPDATE books SET active=FALSE WHERE id=$1 RETURNING id', [req.params.id]); if (!r.rows.length) return res.status(404).json({ error: 'Livro não encontrado.' }); res.json({ message: 'Livro inativado.' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Loans
router.get('/loans', async (_req, res) => {
  try {
    const r = await db.query(`SELECT l.*, b.title AS book_title, b.author AS book_author FROM loans l JOIN books b ON b.id=l.book_id ORDER BY l.created_at DESC`);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/loans', async (req, res) => {
  const { book_id, borrower_name, borrower_registration, due_date, user_id } = req.body;
  if (!book_id || !borrower_name?.trim() || !due_date) return res.status(400).json({ error: 'Livro, nome do responsável e data de devolução são obrigatórios.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const book = await client.query('SELECT id, title, available_quantity, active FROM books WHERE id=$1 FOR UPDATE', [book_id]);
    if (!book.rows.length || !book.rows[0].active) throw Object.assign(new Error('Livro não encontrado ou inativo.'), { status: 404 });
    if (book.rows[0].available_quantity < 1) throw Object.assign(new Error('Não há exemplares disponíveis para empréstimo.'), { status: 409 });
    const loan = await client.query(`INSERT INTO loans (book_id,borrower_name,borrower_registration,due_date,status) VALUES ($1,$2,$3,$4,'active') RETURNING *`, [book_id,borrower_name.trim(),borrower_registration?.trim()||null,due_date]);
    await client.query('UPDATE books SET available_quantity=available_quantity-1 WHERE id=$1', [book_id]);
    await client.query(`INSERT INTO stock_movements (book_id,user_id,type,quantity,reason) VALUES ($1,$2,'loan',1,$3)`, [book_id,req.user.id,`Empréstimo para ${borrower_name.trim()}`]);
    await client.query('COMMIT'); res.status(201).json(loan.rows[0]);
  } catch (e) { await client.query('ROLLBACK'); res.status(e.status || 500).json({ error: e.message }); }
  finally { client.release(); }
});
router.put('/loans/:id/return', async (req, res) => {
  const { user_id } = req.body;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const loan = await client.query(`SELECT l.*, b.title FROM loans l JOIN books b ON b.id=l.book_id WHERE l.id=$1 FOR UPDATE`, [req.params.id]);
    if (!loan.rows.length) throw Object.assign(new Error('Empréstimo não encontrado.'), { status: 404 });
    if (loan.rows[0].status !== 'active') throw Object.assign(new Error('Este empréstimo já foi finalizado.'), { status: 409 });
    const updated = await client.query(`UPDATE loans SET status='returned', return_date=CURRENT_DATE WHERE id=$1 RETURNING *`, [req.params.id]);
    await client.query('UPDATE books SET available_quantity=LEAST(quantity, available_quantity+1) WHERE id=$1', [loan.rows[0].book_id]);
    await client.query(`INSERT INTO stock_movements (book_id,user_id,type,quantity,reason) VALUES ($1,$2,'return',1,$3)`, [loan.rows[0].book_id,req.user.id,`Devolução de ${loan.rows[0].borrower_name}`]);
    await client.query('COMMIT'); res.json(updated.rows[0]);
  } catch (e) { await client.query('ROLLBACK'); res.status(e.status || 500).json({ error: e.message }); }
  finally { client.release(); }
});

// Stock movements
router.get('/stock-movements', async (_req, res) => {
  try { const r = await db.query(`SELECT sm.*, b.title AS book_title, u.name AS user_name FROM stock_movements sm JOIN books b ON b.id=sm.book_id LEFT JOIN users u ON u.id=sm.user_id ORDER BY sm.created_at DESC LIMIT 100`); res.json(r.rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Users
router.get('/users', requireAdmin, async (_req, res) => {
  try { const r = await db.query('SELECT id,name,email,role,active,created_at FROM users ORDER BY name'); res.json(r.rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/users', requireAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
  try {
    const hash = await hashPassword(password);
    const r = await db.query(`INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id,name,email,role,active`, [name.trim(),email.trim().toLowerCase(),hash,role === 'admin' ? 'admin' : 'staff']);
    res.status(201).json(r.rows[0]);
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'E-mail já cadastrado.' }); res.status(500).json({ error: e.message }); }
});
router.put('/users/:id', requireAdmin, async (req, res) => {
  const { name, email, role, active, password } = req.body;
  try {
    let r;
    if (password) {
      const hash = await hashPassword(password);
      r = await db.query(`UPDATE users SET name=$1,email=$2,role=$3,active=$4,password_hash=$5 WHERE id=$6 RETURNING id,name,email,role,active`, [name.trim(),email.trim().toLowerCase(),role === 'admin' ? 'admin' : 'staff',active !== false,hash,req.params.id]);
    } else {
      r = await db.query(`UPDATE users SET name=$1,email=$2,role=$3,active=$4 WHERE id=$5 RETURNING id,name,email,role,active`, [name.trim(),email.trim().toLowerCase(),role === 'admin' ? 'admin' : 'staff',active !== false,req.params.id]);
    }
    if (!r.rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' }); res.json(r.rows[0]);
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'E-mail já cadastrado.' }); res.status(500).json({ error: e.message }); }
});
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try { const r = await db.query('UPDATE users SET active=FALSE WHERE id=$1 RETURNING id'); if (!r.rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' }); res.json({ message: 'Usuário inativado.' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
