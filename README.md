# Estante Virtual

Aplicação web para controle de acervo, estoque, empréstimos, devoluções, categorias, usuários e movimentações de uma biblioteca.

## Objetivo do projeto

O sistema Estante Virtual foi desenvolvido para centralizar a operação de uma biblioteca e reduzir o controle manual de livros e empréstimos. O foco atual é uma biblioteca física ou escolar, com possibilidade de adaptação futura para outras unidades de acervo.

## Tecnologias

- **Frontend:** HTML, CSS e JavaScript com módulos ES.
- **Backend:** Node.js e Express.
- **Banco de dados:** PostgreSQL hospedado no Supabase.
- **Deploy:** Render.

## Funcionalidades atuais

O sistema possui dashboard com indicadores, cadastro e inativação de livros, categorias, usuários, registro de empréstimos, devoluções e histórico de movimentações. As operações de empréstimo e devolução utilizam transações no banco para manter o estoque consistente.

## Estrutura

```text
backend/
  db.js                  conexão PostgreSQL
  server.js              servidor Express
  routes/libraryRoutes.js rotas da aplicação
frontend/
  index.html              painel administrativo
  home.html               apresentação do sistema
  css/library.css         estilos do painel
  js/                     módulos do frontend
 database/
  README.md               referência do modelo atual
 uploads/covers/          capas locais da versão de demonstração
```

## Execução local

Na raiz do projeto, instale as dependências do backend:

```bash
cd backend
npm install
```

Crie um arquivo `.env` a partir de `.env.example` e informe a `DATABASE_URL` do PostgreSQL. Para criar um administrador inicial em uma base de testes, podem ser definidos `ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

Depois, execute:

```bash
npm start
```

Acesse `http://localhost:3000`.

## Observação de segurança

O backend já implementa sessão assinada (HMAC) em cookie HttpOnly, autorização por perfil (admin/bibliotecário) e CORS configurado. Antes de usar com dados reais de uma instituição, troque a senha de administrador de exemplo e defina `SESSION_SECRET` com um valor próprio em produção — o sistema usa um valor padrão apenas para desenvolvimento local.

**Sobre as capas enviadas por upload:** no plano gratuito do Render, o disco é temporário — arquivos salvos em `uploads/covers/` (incluindo capas enviadas por upload de arquivo) são apagados a cada novo deploy ou reinício do serviço. Capas cadastradas por URL não são afetadas, pois não dependem de arquivo salvo no servidor. Para manter capas enviadas por upload de forma permanente em produção, seria necessário um serviço de armazenamento externo (ex.: Supabase Storage, Cloudinary).

## Banco de dados

O backend utiliza as tabelas `users`, `categories`, `books`, `readers`, `loans` e `stock_movements`, além da view `dashboard_summary`. Para montar o banco do zero, execute `database/schema-completo.sql` no SQL Editor do Supabase — veja `database/README.md` para mais detalhes.
