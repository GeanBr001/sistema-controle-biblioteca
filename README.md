# Sistema de Controle de Biblioteca

Aplicação web para controle de acervo, estoque, empréstimos, devoluções, categorias, usuários e movimentações de uma biblioteca.

## Objetivo do projeto

O sistema foi desenvolvido para centralizar a operação de uma biblioteca e reduzir o controle manual de livros e empréstimos. O foco atual é uma biblioteca física ou escolar, com possibilidade de adaptação futura para outras unidades de acervo.

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

Antes de usar o sistema com dados reais, é necessário implementar sessão autenticada no backend, autorização por função, restrição de CORS e armazenamento persistente das capas. A versão atual é uma base de demonstração do TCC e não deve ser publicada com a senha de administrador de exemplo.

## Banco de dados

O backend utiliza as tabelas `users`, `categories`, `books`, `loans` e `stock_movements`, além da view `dashboard_summary`. O arquivo SQL legado do antigo projeto de comércio eletrônico foi removido da árvore atual e permanece somente no backup gerado durante a limpeza.
