-- Opcional: limpa os dados usados nos testes do banco.
-- Execute somente se quiser deixar o sistema sem o livro/empréstimo de teste.
BEGIN;

DELETE FROM public.stock_movements
WHERE book_id IN (
  SELECT id FROM public.books WHERE title = 'Introdução à Programação'
);

DELETE FROM public.loans
WHERE book_id IN (
  SELECT id FROM public.books WHERE title = 'Introdução à Programação'
);

DELETE FROM public.books
WHERE title = 'Introdução à Programação';

COMMIT;
