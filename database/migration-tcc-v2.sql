-- Migração TCC v2: leitores, dados de contato e vínculo com empréstimos.
-- Execute no Supabase SQL Editor antes de publicar esta versão.
BEGIN;

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

ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS reader_id BIGINT REFERENCES public.readers(id) ON DELETE SET NULL;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS loans_reader_idx ON public.loans(reader_id);
CREATE INDEX IF NOT EXISTS loans_status_due_idx ON public.loans(status, due_date);

CREATE OR REPLACE VIEW public.dashboard_summary AS
SELECT
  (SELECT COUNT(*) FROM public.books WHERE active = TRUE) AS total_books,
  (SELECT COALESCE(SUM(quantity),0) FROM public.books WHERE active = TRUE) AS total_copies,
  (SELECT COALESCE(SUM(available_quantity),0) FROM public.books WHERE active = TRUE) AS available_copies,
  (SELECT COUNT(*) FROM public.loans WHERE status = 'active') AS active_loans,
  (SELECT COUNT(*) FROM public.loans WHERE status = 'active' AND due_date < CURRENT_DATE) AS overdue_loans,
  (SELECT COUNT(*) FROM public.books WHERE active = TRUE AND available_quantity <= minimum_quantity) AS low_stock_books;

COMMIT;
