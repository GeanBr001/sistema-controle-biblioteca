const express = require('express');
const cors = require('cors');
const path = require('path');
const libraryRoutes = require('./routes/libraryRoutes');
const db = require('./db');
const { hashPassword } = require('./password');

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

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true, credentials: true }));

// Força HTTPS em produção. O Render (e a maioria dos provedores) termina o TLS
// na borda e repassa a requisição por HTTP internamente, sinalizando o protocolo
// original no header "x-forwarded-proto" — por isso a checagem abaixo, e não
// apenas req.secure.
app.set('trust proxy', 1);
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }
  next();
});

app.use((req, res, next) => {
  // Cabeçalhos de segurança básicos (proteção contra XSS, clickjacking, sniffing e
  // reforço do uso de HTTPS). Mantidos simples de propósito: cobrem o essencial
  // sem exigir dependências novas no projeto.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // 'unsafe-inline' é necessário porque a interface usa atributos onclick/onchange
      // no HTML; ainda assim a diretiva já bloqueia scripts de qualquer origem não listada.
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  if (process.env.NODE_ENV === 'production') {
    // HSTS: instrui o navegador a só acessar o site via HTTPS pelos próximos 180 dias.
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/api', libraryRoutes);

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '../frontend/home.html')));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'biblioteca-api' }));

app.listen(PORT, async () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  try { await ensureAdmin(); } catch (e) { console.error('Não foi possível criar o administrador inicial:', e.message); }
});
