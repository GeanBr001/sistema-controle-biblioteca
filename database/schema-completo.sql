-- Schema completo do Estante Virtual, para montar o banco do ZERO.
-- Reconstruído a partir das queries reais do backend (routes/libraryRoutes.js),
-- já que o script original das tabelas base foi removido junto com o material
-- do antigo projeto de e-commerce, antes da tabela "readers" ter sido versionada.
--
-- Para uma instalação nova (banco Supabase vazio), execute SÓ este arquivo.
-- O arquivo migration-tcc-v2.sql fica mantido como referência histórica —
-- ele parte do princípio de que users/categories/books/loans/stock_movements
-- já existiam (criados direto pela interface do Supabase, sem script).

BEGIN;

CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'staff',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.books (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(220) NOT NULL,
  author VARCHAR(160) NOT NULL,
  isbn VARCHAR(20),
  publisher VARCHAR(160),
  publication_year INTEGER,
  description TEXT,
  category_id BIGINT NOT NULL REFERENCES public.categories(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  available_quantity INTEGER NOT NULL DEFAULT 0,
  minimum_quantity INTEGER NOT NULL DEFAULT 2,
  cover_image TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.readers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(180),
  phone VARCHAR(40),
  registration VARCHAR(80),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS readers_email_unique
  ON public.readers (LOWER(email)) WHERE email IS NOT NULL AND email <> '';
CREATE INDEX IF NOT EXISTS readers_name_idx ON public.readers (LOWER(name));

CREATE TABLE IF NOT EXISTS public.loans (
  id BIGSERIAL PRIMARY KEY,
  book_id BIGINT NOT NULL REFERENCES public.books(id),
  reader_id BIGINT REFERENCES public.readers(id) ON DELETE SET NULL,
  borrower_name VARCHAR(160) NOT NULL,
  borrower_registration VARCHAR(80),
  loan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  return_date DATE,
  returned_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS loans_reader_idx ON public.loans(reader_id);
CREATE INDEX IF NOT EXISTS loans_status_due_idx ON public.loans(status, due_date);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id BIGSERIAL PRIMARY KEY,
  book_id BIGINT NOT NULL REFERENCES public.books(id),
  user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL,
  quantity INTEGER NOT NULL,
  reason VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE VIEW public.dashboard_summary AS
SELECT
  (SELECT COUNT(*) FROM public.books WHERE active = TRUE) AS total_books,
  (SELECT COALESCE(SUM(quantity),0) FROM public.books WHERE active = TRUE) AS total_copies,
  (SELECT COALESCE(SUM(available_quantity),0) FROM public.books WHERE active = TRUE) AS available_copies,
  (SELECT COUNT(*) FROM public.loans WHERE status = 'active') AS active_loans,
  (SELECT COUNT(*) FROM public.loans WHERE status = 'active' AND due_date < CURRENT_DATE) AS overdue_loans,
  (SELECT COUNT(*) FROM public.books WHERE active = TRUE AND available_quantity <= minimum_quantity) AS low_stock_books;

COMMIT;
