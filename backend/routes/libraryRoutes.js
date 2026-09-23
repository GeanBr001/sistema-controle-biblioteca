const express = require("express");
const db = require("../db");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { hashPassword, verifyPassword } = require("../password");

// --- Upload de capa (arquivo) -----------------------------------------
// Salva em /uploads/covers com nome único; a URL/caminho continua sendo
// uma opção alternativa (o bibliotecário escolhe uma das duas formas).

const COVERS_DIR = path.join(__dirname, "..", "..", "uploads", "covers");
if (!fs.existsSync(COVERS_DIR)) fs.mkdirSync(COVERS_DIR, { recursive: true });

const coverUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, COVERS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      return cb(new Error("Envie apenas imagens (JPEG, PNG, WEBP ou GIF)."));
    }
    cb(null, true);
  },
});

// --- Sessão -----------------------------------------------------------
// Sessão assinada com HMAC guardada em cookie HttpOnly (sem tabela de sessões no banco).

const router = express.Router();
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.JWT_SECRET ||
  "troque-esta-chave-em-producao";

function sign(value) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("base64url");
}

function createSession(user) {
  const payload = Buffer.from(
    JSON.stringify({
      id: user.id,
      role: user.role,
      exp: Date.now() + 8 * 60 * 60 * 1000,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function readCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map((part) => {
        const i = part.indexOf("=");
        return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1))];
      }),
  );
}

function requireAuth(req, res, next) {
  const token = readCookies(req).biblioteca_session;
  if (!token)
    return res.status(401).json({ error: "Autenticação necessária." });
  const [payload, signature] = token.split(".");
  try {
    const expected = sign(payload);
    if (
      !signature ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
      throw new Error("invalid");
    }
    const session = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!session.id || session.exp < Date.now()) throw new Error("expired");
    req.user = session;
    next();
  } catch {
    return res.status(401).json({ error: "Sessão inválida ou expirada." });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin")
    return res
      .status(403)
      .json({ error: "Acesso permitido somente para administradores." });
  next();
}

// --- Auth -------------------------------------------------------------

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
  try {
    const r = await db.query(
      "SELECT id, name, email, password_hash, role, active FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1",
      [email.trim()],
    );
    if (!r.rows.length || !r.rows[0].active)
      return res.status(401).json({ error: "E-mail ou senha inválidos." });

    const user = r.rows[0];
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok)
      return res.status(401).json({ error: "E-mail ou senha inválidos." });
    delete user.password_hash;

    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader(
      "Set-Cookie",
      `biblioteca_session=${encodeURIComponent(createSession(user))}; HttpOnly; SameSite=Lax; Max-Age=28800; Path=/${secure}`,
    );
    res.json({ user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/auth/logout", (_req, res) => {
  res.setHeader(
    "Set-Cookie",
    "biblioteca_session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/",
  );
  res.json({ message: "Sessão encerrada." });
});

// A partir daqui, todas as rotas exigem sessão válida.
router.use(requireAuth);

// --- Dashboard ----------------------------------------------------------

router.get("/dashboard", async (_req, res) => {
  try {
    const r = await db.query("SELECT * FROM dashboard_summary");
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Categorias -----------------------------------------------------------

router.get("/categories", async (_req, res) => {
  try {
    const r = await db.query("SELECT * FROM categories ORDER BY name");
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/categories", async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim())
    return res.status(400).json({ error: "Nome da categoria é obrigatório." });
  try {
    const r = await db.query(
      "INSERT INTO categories (name, description) VALUES ($1,$2) RETURNING *",
      [name.trim(), description?.trim() || null],
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === "23505")
      return res.status(409).json({ error: "Categoria já cadastrada." });
    res.status(500).json({ error: e.message });
  }
});

router.put("/categories/:id", async (req, res) => {
  const { name, description } = req.body;
  if (!name?.trim())
    return res.status(400).json({ error: "Nome da categoria é obrigatório." });
  try {
    const r = await db.query(
      "UPDATE categories SET name=$1, description=$2 WHERE id=$3 RETURNING *",
      [name.trim(), description?.trim() || null, req.params.id],
    );
    if (!r.rows.length)
      return res.status(404).json({ error: "Categoria não encontrada." });
    res.json(r.rows[0]);
  } catch (e) {
    if (e.code === "23505")
      return res.status(409).json({ error: "Categoria já cadastrada." });
    res.status(500).json({ error: e.message });
  }
});

router.delete("/categories/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM categories WHERE id=$1", [req.params.id]);
    res.json({ message: "Categoria removida." });
  } catch (e) {
    if (e.code === "23503")
      return res.status(409).json({
        error: "Não é possível remover uma categoria que possui livros.",
      });
    res.status(500).json({ error: e.message });
  }
});

// --- Consulta de catálogo por ISBN -----------------------------------------
// Consulta pública de metadados; sempre confirmada pelo bibliotecário antes de salvar.
// Google Books entra primeiro porque tem cobertura bem melhor de edições brasileiras
// que o Open Library; o Open Library fica como reserva pra quando o Google não acha nada.

const catalogCache = new Map();

async function lookupGoogleBooks(isbn) {
  const response = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`,
  );
  if (!response.ok) return null;
  const payload = await response.json();
  const info = payload.items?.[0]?.volumeInfo;
  if (!info) return null;
  // Se a fonte informa o idioma e não é português, não usar — melhor "não encontrado"
  // do que preencher com dados de uma edição em outro idioma.
  if (info.language && info.language !== "pt") return null;
  return {
    title: info.title || "",
    author: info.authors?.join(", ") || "",
    publisher: info.publisher || "",
    publication_year: (info.publishedDate || "").match(/\d{4}/)?.[0] || "",
    isbn,
    description: "",
    category: info.categories?.[0] || "",
    cover_image: (
      info.imageLinks?.thumbnail ||
      info.imageLinks?.smallThumbnail ||
      ""
    ).replace("http://", "https://"),
    source: "Google Books",
  };
}

async function lookupOpenLibrary(isbn) {
  const response = await fetch(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&jscmd=data&format=json`,
    {
      headers: {
        "User-Agent": "Biblioteca-TCC/1.0 (contato: admin@biblioteca.local)",
      },
    },
  );
  if (!response.ok) return null;
  const payload = await response.json();
  const doc = payload[`ISBN:${isbn}`];
  if (!doc) return null;
  // Mesma lógica: o Open Library retorna dados por "obra" e às vezes isso traz
  // o idioma original (inglês) mesmo para o ISBN de uma edição traduzida.
  const languages = (doc.languages || []).map((l) => l.key || "");
  if (languages.length && !languages.includes("/languages/por")) return null;
  return {
    title: doc.title || "",
    author: doc.authors?.map((a) => a.name).join(", ") || "",
    publisher: doc.publishers?.[0]?.name || "",
    publication_year: (doc.publish_date || "").match(/\d{4}/)?.[0] || "",
    isbn,
    description: "",
    category: doc.subjects?.[0]?.name || "",
    cover_image:
      doc.cover?.medium ||
      doc.cover?.large ||
      `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`,
    source: "Open Library",
  };
}

router.get("/catalog/lookup", async (req, res) => {
  const rawIsbn = String(req.query.isbn || "")
    .replace(/[^0-9Xx]/g, "")
    .toUpperCase();
  if (rawIsbn.length < 10)
    return res.status(400).json({ error: "Informe um ISBN válido." });

  const cached = catalogCache.get(rawIsbn);
  if (cached && cached.expires > Date.now()) return res.json(cached.data);

  try {
    const data =
      (await lookupGoogleBooks(rawIsbn)) || (await lookupOpenLibrary(rawIsbn));
    if (!data) {
      return res.status(404).json({
        error:
          "Não encontrado nas bases públicas (comum em edições de editoras menores/regionais). Preencha os dados manualmente.",
      });
    }
    catalogCache.set(rawIsbn, {
      data,
      expires: Date.now() + 6 * 60 * 60 * 1000,
    });
    res.json(data);
  } catch (e) {
    res
      .status(502)
      .json({ error: "Não foi possível consultar o catálogo agora." });
  }
});

// --- Leitores -----------------------------------------------------------

router.get("/readers", async (_req, res) => {
  try {
    const r = await db.query(`
      SELECT r.*, COUNT(l.id) FILTER (WHERE l.status='active')::int AS active_loans
      FROM readers r
      LEFT JOIN loans l ON l.reader_id = r.id
      GROUP BY r.id
      ORDER BY r.name
    `);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/readers", async (req, res) => {
  const { name, email, phone, registration } = req.body;
  if (!name?.trim())
    return res.status(400).json({ error: "Nome do leitor é obrigatório." });
  try {
    const r = await db.query(
      "INSERT INTO readers (name,email,phone,registration) VALUES ($1,$2,$3,$4) RETURNING *",
      [
        name.trim(),
        email?.trim().toLowerCase() || null,
        phone?.trim() || null,
        registration?.trim() || null,
      ],
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === "23505")
      return res
        .status(409)
        .json({ error: "E-mail já cadastrado para outro leitor." });
    res.status(500).json({ error: e.message });
  }
});

router.put("/readers/:id", async (req, res) => {
  const { name, email, phone, registration, active } = req.body;
  if (!name?.trim())
    return res.status(400).json({ error: "Nome do leitor é obrigatório." });
  try {
    const r = await db.query(
      "UPDATE readers SET name=$1,email=$2,phone=$3,registration=$4,active=$5,updated_at=NOW() WHERE id=$6 RETURNING *",
      [
        name.trim(),
        email?.trim().toLowerCase() || null,
        phone?.trim() || null,
        registration?.trim() || null,
        active !== false,
        req.params.id,
      ],
    );
    if (!r.rows.length)
      return res.status(404).json({ error: "Leitor não encontrado." });
    res.json(r.rows[0]);
  } catch (e) {
    if (e.code === "23505")
      return res
        .status(409)
        .json({ error: "E-mail já cadastrado para outro leitor." });
    res.status(500).json({ error: e.message });
  }
});

router.delete("/readers/:id", async (req, res) => {
  try {
    const r = await db.query(
      "UPDATE readers SET active=FALSE, updated_at=NOW() WHERE id=$1 RETURNING id",
      [req.params.id],
    );
    if (!r.rows.length)
      return res.status(404).json({ error: "Leitor não encontrado." });
    res.json({ message: "Leitor inativado." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Exclusão definitiva. O histórico de empréstimos é preservado com
// borrower_name/borrower_registration; apenas a referência ao leitor é anulada.
router.delete("/readers/:id/permanent", async (req, res) => {
  try {
    const activeLoans = await db.query(
      "SELECT COUNT(*)::int AS total FROM loans WHERE reader_id=$1 AND status='active'",
      [req.params.id],
    );
    if (activeLoans.rows[0].total > 0) {
      return res.status(409).json({
        error: "Não é possível excluir este leitor enquanto houver empréstimo ativo. Registre a devolução primeiro.",
      });
    }

    const r = await db.query(
      "DELETE FROM readers WHERE id=$1 RETURNING id",
      [req.params.id],
    );
    if (!r.rows.length)
      return res.status(404).json({ error: "Leitor não encontrado." });
    res.json({ message: "Leitor excluído definitivamente." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Livros -----------------------------------------------------------

router.get("/books", async (_req, res) => {
  try {
    const r = await db.query(
      "SELECT b.*, c.name AS category_name FROM books b JOIN categories c ON c.id=b.category_id ORDER BY b.title",
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Recebe um arquivo de imagem (campo "cover") e devolve o caminho salvo,
// que o frontend usa preenchendo o mesmo campo de URL/caminho do formulário.
router.post("/books/upload-cover", (req, res) => {
  coverUpload.single("cover")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Falha ao enviar a imagem." });
    if (!req.file) return res.status(400).json({ error: "Nenhuma imagem enviada." });
    res.status(201).json({ path: `uploads/covers/${req.file.filename}` });
  });
});

router.post("/books", async (req, res) => {
  const {
    title,
    author,
    isbn,
    publisher,
    publication_year,
    description,
    category_id,
    quantity,
    minimum_quantity,
    cover_image,
  } = req.body;
  const q = Number(quantity);
  const min =
    minimum_quantity === "" || minimum_quantity == null
      ? 2
      : Number(minimum_quantity);
  if (
    !title?.trim() ||
    !author?.trim() ||
    !category_id ||
    !Number.isInteger(q) ||
    q < 0
  ) {
    return res.status(400).json({
      error: "Título, autor, categoria e quantidade válida são obrigatórios.",
    });
  }
  try {
    const r = await db.query(
      `INSERT INTO books (title,author,isbn,publisher,publication_year,description,category_id,quantity,available_quantity,minimum_quantity,cover_image)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10) RETURNING *`,
      [
        title.trim(),
        author.trim(),
        isbn?.trim() || null,
        publisher?.trim() || null,
        publication_year || null,
        description?.trim() || null,
        category_id,
        q,
        min,
        cover_image || null,
      ],
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/books/:id", async (req, res) => {
  const {
    title,
    author,
    isbn,
    publisher,
    publication_year,
    description,
    category_id,
    quantity,
    minimum_quantity,
    active,
    cover_image,
  } = req.body;
  const q = Number(quantity);
  if (
    !title?.trim() ||
    !author?.trim() ||
    !category_id ||
    !Number.isInteger(q) ||
    q < 0
  ) {
    return res.status(400).json({ error: "Dados do livro inválidos." });
  }
  try {
    // available_quantity é recalculada com base no que já estava emprestado (quantity - available_quantity),
    // pra não "devolver" cópias que ainda estão emprestadas quando o total é editado.
    const r = await db.query(
      `UPDATE books SET
         title=$1, author=$2, isbn=$3, publisher=$4, publication_year=$5, description=$6,
         category_id=$7, quantity=$8, available_quantity=GREATEST(0, $8 - (quantity - available_quantity)),
         minimum_quantity=$9, active=$10, cover_image=$11
       WHERE id=$12 RETURNING *`,
      [
        title.trim(),
        author.trim(),
        isbn?.trim() || null,
        publisher?.trim() || null,
        publication_year || null,
        description?.trim() || null,
        category_id,
        q,
        minimum_quantity ?? 2,
        active !== false,
        cover_image?.trim() || null,
        req.params.id,
      ],
    );
    if (!r.rows.length)
      return res.status(404).json({ error: "Livro não encontrado." });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/books/:id", async (req, res) => {
  try {
    const r = await db.query(
      "UPDATE books SET active=FALSE WHERE id=$1 RETURNING id",
      [req.params.id],
    );
    if (!r.rows.length)
      return res.status(404).json({ error: "Livro não encontrado." });
    res.json({ message: "Livro inativado." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/books/:id/reactivate", async (req, res) => {
  try {
    const r = await db.query(
      "UPDATE books SET active=TRUE WHERE id=$1 RETURNING *",
      [req.params.id],
    );
    if (!r.rows.length)
      return res.status(404).json({ error: "Livro não encontrado." });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Exclusão definitiva: só permitida se o livro nunca teve empréstimo ou
// movimentação registrada. Se já tiver histórico, orienta a inativar em vez
// de apagar (evita perder registro de operações antigas).
router.delete("/books/:id/permanent", async (req, res) => {
  try {
    const usage = await db.query(
      "SELECT (SELECT COUNT(*) FROM loans WHERE book_id=$1) AS loans, (SELECT COUNT(*) FROM stock_movements WHERE book_id=$1) AS movements",
      [req.params.id],
    );
    const { loans, movements } = usage.rows[0];
    if (Number(loans) > 0 || Number(movements) > 0) {
      return res.status(409).json({
        error: "Este livro já tem histórico de empréstimos ou movimentações e não pode ser excluído definitivamente. Use inativar.",
      });
    }
    const r = await db.query("DELETE FROM books WHERE id=$1 RETURNING id", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: "Livro não encontrado." });
    res.json({ message: "Livro excluído definitivamente." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Empréstimos -----------------------------------------------------------

router.get("/loans", async (_req, res) => {
  try {
    const r = await db.query(`
      SELECT l.*, b.title AS book_title, b.author AS book_author,
             r.name AS reader_name, r.email AS reader_email, r.phone AS reader_phone, r.registration AS reader_registration
      FROM loans l
      JOIN books b ON b.id = l.book_id
      LEFT JOIN readers r ON r.id = l.reader_id
      ORDER BY l.created_at DESC
    `);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/loans", async (req, res) => {
  const {
    book_id,
    reader_id,
    borrower_name,
    borrower_registration,
    due_date,
    loan_date,
  } = req.body;
  if (!book_id || (!reader_id && !borrower_name?.trim()) || !due_date) {
    return res
      .status(400)
      .json({ error: "Livro, leitor e data de devolução são obrigatórios." });
  }

  // Usa uma transação com SELECT ... FOR UPDATE pra travar a linha do livro:
  // evita que dois empréstimos simultâneos derrubem o estoque abaixo de zero.
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const book = await client.query(
      "SELECT id, title, available_quantity, active FROM books WHERE id=$1 FOR UPDATE",
      [book_id],
    );
    if (!book.rows.length || !book.rows[0].active) {
      throw Object.assign(new Error("Livro não encontrado ou inativo."), {
        status: 404,
      });
    }
    if (book.rows[0].available_quantity < 1) {
      throw Object.assign(
        new Error("Não há exemplares disponíveis para empréstimo."),
        { status: 409 },
      );
    }

    let reader = null;
    if (reader_id) {
      const rr = await client.query(
        "SELECT id,name,email,phone,registration,active FROM readers WHERE id=$1 FOR UPDATE",
        [reader_id],
      );
      if (!rr.rows.length || !rr.rows[0].active) {
        throw Object.assign(new Error("Leitor não encontrado ou inativo."), {
          status: 404,
        });
      }
      reader = rr.rows[0];

      // Regra de negócio: leitor com empréstimo em atraso não pode pegar outro livro
      // até devolver o(s) pendente(s).
      const overdue = await client.query(
        "SELECT id FROM loans WHERE reader_id=$1 AND status='active' AND due_date < CURRENT_DATE LIMIT 1",
        [reader_id],
      );
      if (overdue.rows.length) {
        throw Object.assign(
          new Error(`${reader.name} tem um empréstimo em atraso e não pode retirar outro livro até regularizar a devolução.`),
          { status: 409 },
        );
      }
    }

    const finalName = reader?.name || borrower_name.trim();
    const finalRegistration =
      reader?.registration || borrower_registration?.trim() || null;

    const loan = await client.query(
      `INSERT INTO loans (book_id,reader_id,borrower_name,borrower_registration,loan_date,due_date,status)
       VALUES ($1,$2,$3,$4,COALESCE($5::date,CURRENT_DATE),$6,'active') RETURNING *`,
      [
        book_id,
        reader?.id || null,
        finalName,
        finalRegistration,
        loan_date || null,
        due_date,
      ],
    );
    await client.query(
      "UPDATE books SET available_quantity=available_quantity-1 WHERE id=$1",
      [book_id],
    );
    await client.query(
      `INSERT INTO stock_movements (book_id,user_id,type,quantity,reason) VALUES ($1,$2,'loan',1,$3)`,
      [book_id, req.user.id, `Empréstimo para ${finalName}`],
    );

    await client.query("COMMIT");
    res.status(201).json(loan.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.put("/loans/:id/return", async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const loan = await client.query(
      "SELECT l.*, b.title FROM loans l JOIN books b ON b.id=l.book_id WHERE l.id=$1 FOR UPDATE",
      [req.params.id],
    );
    if (!loan.rows.length)
      throw Object.assign(new Error("Empréstimo não encontrado."), {
        status: 404,
      });
    if (loan.rows[0].status !== "active")
      throw Object.assign(new Error("Este empréstimo já foi finalizado."), {
        status: 409,
      });

    const updated = await client.query(
      `UPDATE loans SET status='returned', return_date=CURRENT_DATE, returned_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id],
    );
    await client.query(
      "UPDATE books SET available_quantity=LEAST(quantity, available_quantity+1) WHERE id=$1",
      [loan.rows[0].book_id],
    );
    await client.query(
      `INSERT INTO stock_movements (book_id,user_id,type,quantity,reason) VALUES ($1,$2,'return',1,$3)`,
      [
        loan.rows[0].book_id,
        req.user.id,
        `Devolução de ${loan.rows[0].borrower_name}`,
      ],
    );

    await client.query("COMMIT");
    res.json(updated.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(e.status || 500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// --- Movimentações de estoque -----------------------------------------------

router.get("/stock-movements", async (_req, res) => {
  try {
    const r = await db.query(`
      SELECT sm.*, b.title AS book_title, u.name AS user_name
      FROM stock_movements sm
      JOIN books b ON b.id = sm.book_id
      LEFT JOIN users u ON u.id = sm.user_id
      ORDER BY sm.created_at DESC
      LIMIT 100
    `);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Usuários (somente administrador) ---------------------------------------

router.get("/users", requireAdmin, async (_req, res) => {
  try {
    const r = await db.query(
      "SELECT id,name,email,role,active,created_at FROM users ORDER BY name",
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Política mínima de senha exigida pelo TCC: 8+ caracteres, pelo menos uma
// letra maiúscula e um número.
const PASSWORD_POLICY = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
function isValidPassword(pw) {
  return typeof pw === "string" && PASSWORD_POLICY.test(pw);
}

router.post("/users", requireAdmin, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name?.trim() || !email?.trim() || !password) {
    return res
      .status(400)
      .json({ error: "Nome, e-mail e senha são obrigatórios." });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({
      error: "A senha precisa ter no mínimo 8 caracteres, com pelo menos uma letra maiúscula e um número.",
    });
  }
  try {
    const hash = await hashPassword(password);
    const r = await db.query(
      "INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id,name,email,role,active",
      [
        name.trim(),
        email.trim().toLowerCase(),
        hash,
        role === "admin" ? "admin" : "staff",
      ],
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === "23505")
      return res.status(409).json({ error: "E-mail já cadastrado." });
    res.status(500).json({ error: e.message });
  }
});

router.put("/users/:id", requireAdmin, async (req, res) => {
  const { name, email, role, active, password } = req.body;
  if (password && !isValidPassword(password)) {
    return res.status(400).json({
      error: "A senha precisa ter no mínimo 8 caracteres, com pelo menos uma letra maiúscula e um número.",
    });
  }
  try {
    let r;
    if (password) {
      const hash = await hashPassword(password);
      r = await db.query(
        "UPDATE users SET name=$1,email=$2,role=$3,active=$4,password_hash=$5 WHERE id=$6 RETURNING id,name,email,role,active",
        [
          name.trim(),
          email.trim().toLowerCase(),
          role === "admin" ? "admin" : "staff",
          active !== false,
          hash,
          req.params.id,
        ],
      );
    } else {
      r = await db.query(
        "UPDATE users SET name=$1,email=$2,role=$3,active=$4 WHERE id=$5 RETURNING id,name,email,role,active",
        [
          name.trim(),
          email.trim().toLowerCase(),
          role === "admin" ? "admin" : "staff",
          active !== false,
          req.params.id,
        ],
      );
    }
    if (!r.rows.length)
      return res.status(404).json({ error: "Usuário não encontrado." });
    res.json(r.rows[0]);
  } catch (e) {
    if (e.code === "23505")
      return res.status(409).json({ error: "E-mail já cadastrado." });
    res.status(500).json({ error: e.message });
  }
});

router.delete("/users/:id", requireAdmin, async (req, res) => {
  try {
    // Inativação: mantém o histórico e impede novo login.
    const r = await db.query(
      "UPDATE users SET active=FALSE WHERE id=$1 RETURNING id",
      [req.params.id],
    );
    if (!r.rows.length)
      return res.status(404).json({ error: "Usuário não encontrado." });
    res.json({ message: "Usuário inativado." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Exclusão definitiva, disponível somente para administradores.
router.delete("/users/:id/permanent", requireAdmin, async (req, res) => {
  try {
    if (String(req.user.id) === String(req.params.id)) {
      return res.status(400).json({
        error: "Não é possível excluir o usuário que está conectado.",
      });
    }

    const target = await db.query(
      "SELECT id, role FROM users WHERE id=$1",
      [req.params.id],
    );
    if (!target.rows.length)
      return res.status(404).json({ error: "Usuário não encontrado." });

    if (target.rows[0].role === "admin") {
      const admins = await db.query(
        "SELECT COUNT(*)::int AS total FROM users WHERE role='admin' AND active=TRUE",
      );
      if (admins.rows[0].total <= 1) {
        return res.status(409).json({
          error: "Não é possível excluir o último administrador ativo do sistema.",
        });
      }
    }

    // Checagem preventiva: stock_movements não tem script de criação versionado,
    // então não dá pra garantir que a FK está como ON DELETE SET NULL no banco
    // de produção. Melhor barrar aqui com mensagem clara do que deixar estourar
    // um erro cru de violação de chave estrangeira.
    const movements = await db.query(
      "SELECT COUNT(*)::int AS total FROM stock_movements WHERE user_id=$1",
      [req.params.id],
    );
    if (movements.rows[0].total > 0) {
      return res.status(409).json({
        error: "Este usuário já tem movimentações registradas no histórico e não pode ser excluído definitivamente. Use inativar.",
      });
    }

    await db.query("DELETE FROM users WHERE id=$1", [req.params.id]);
    res.json({ message: "Usuário excluído definitivamente." });
  } catch (e) {
    if (e.code === "23503") {
      return res.status(409).json({
        error: "Este usuário está vinculado a registros existentes e não pode ser excluído definitivamente. Use inativar.",
      });
    }
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
