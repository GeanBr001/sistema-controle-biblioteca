# Sistema de Controle de Acervo e Estoque de Livros

Projeto reformulado para biblioteca física. Controla livros, estoque, empréstimos, devoluções, categorias, usuários e movimentações.

## Stack
- Frontend: HTML, CSS e JavaScript ES Modules
- Backend: Node.js + Express
- Banco: PostgreSQL/Supabase

## Banco
A estrutura esperada no schema `public` é:
- `users`
- `categories`
- `books`
- `loans`
- `stock_movements`

As views do dashboard são criadas pela migração do banco. O backup antigo fica no schema `backup_2026_09_02`.

## Executar localmente
1. `cd backend && npm install`
2. Copie `.env.example` para `.env` e informe `DATABASE_URL`.
3. Opcionalmente informe `ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Se o e-mail ainda não existir, o backend cria o primeiro administrador automaticamente.
4. `npm start`
5. Abra `http://localhost:3000`.

## Teste inicial
O projeto original foi transformado em um sistema simples de biblioteca. O login leva ao dashboard e às telas de Livros, Empréstimos, Movimentações, Categorias e Usuários.

O endpoint de empréstimo usa transação: cria o empréstimo, reduz `available_quantity` e registra uma movimentação. A devolução faz o inverso.
