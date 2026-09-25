# Estante Virtual

Aplicação web para controle de acervo, estoque, empréstimos, devoluções, categorias, leitores, usuários e movimentações de uma biblioteca.

## Objetivo do projeto

O sistema Estante Virtual foi desenvolvido para centralizar a operação de uma biblioteca e reduzir o controle manual de livros e empréstimos. O foco atual é uma biblioteca física ou escolar, com possibilidade de adaptação futura para outras unidades de acervo.

## Tecnologias

- Frontend: HTML, CSS e JavaScript com módulos ES; Bootstrap 5 (via CDN) para o componente de notificações (Toast).
- Backend: Node.js e Express.
- Banco de dados: PostgreSQL hospedado no Supabase.
- Upload de arquivos: Multer (capas de livro).
- Catálogo bibliográfico: Google Books API (fonte principal) e Open Library API (reserva).
- Deploy: Render.

## Funcionalidades atuais

- Dashboard com indicadores (total de livros, disponíveis, emprestados, estoque baixo).
- Cadastro, edição, inativação e exclusão definitiva de livros (a exclusão definitiva só é permitida para livros sem histórico de empréstimo ou movimentação).
- Busca automática de dados do livro por ISBN (Google Books, com Open Library como reserva).
- Capa do livro por URL ou por upload de arquivo.
- Cadastro e gerenciamento de leitores, categorias e usuários.
- Registro de empréstimos e devoluções, com bloqueio automático de novo empréstimo para leitor com item em atraso.
- Histórico de movimentações de estoque.
- Relatórios de livros mais emprestados e empréstimos em atraso.
- Configurações da unidade (nome, prazo padrão, estoque mínimo, tema) e aba de Suporte com FAQ.

As operações de empréstimo e devolução utilizam transações no banco para manter o estoque consistente.

## Estrutura

```
backend/
  db.js                    conexão PostgreSQL
  server.js                servidor Express
  password.js              hash e verificação de senha
  routes/libraryRoutes.js  rotas da aplicação
  .env.example             modelo de variáveis de ambiente
frontend/
  index.html               painel administrativo
  home.html                apresentação do sistema
  css/library.css          estilos do painel
  js/                      módulos do frontend
database/
  README.md                guia de instalação do banco
  schema-completo.sql      cria o banco do zero (instalação nova)
  migration-tcc-v2.sql     migração incremental (bancos já existentes)
  seed_admin.sql           cria o primeiro administrador
  cleanup_test_data.sql    limpa dados de teste
uploads/covers/            capas enviadas por upload (locais/temporárias)
```

## Execução local

Na raiz do projeto, instale as dependências do backend:

```
cd backend
npm install
```

Crie um arquivo `.env` a partir de `.env.example` e informe a `DATABASE_URL` do PostgreSQL. Para criar um administrador inicial em uma base de testes, podem ser definidos `ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

Antes de iniciar o servidor, monte o banco: execute `database/schema-completo.sql` no SQL Editor do Supabase (veja `database/README.md` para detalhes e para o caso de já ter um banco de uma versão anterior).

Depois, execute:

```
npm start
```

Acesse `http://localhost:3000`.

## Segurança

O backend já implementa sessão assinada (HMAC) em cookie HttpOnly, autorização por perfil (admin/bibliotecário), política mínima de senha (8+ caracteres, com maiúscula e número) e CORS configurado. Antes de usar com dados reais de uma instituição, troque a senha de administrador de exemplo e defina `SESSION_SECRET` com um valor próprio em produção — o sistema usa um valor padrão apenas para desenvolvimento local.

Além disso, o sistema trata explicitamente os três pontos abaixo:

**Proteção contra SQL Injection** — todas as consultas em `backend/routes/libraryRoutes.js` usam *prepared statements* do driver `pg`, com parâmetros posicionais (`$1`, `$2`, ...) em vez de concatenação de string. O valor digitado pelo usuário nunca é inserido diretamente no texto do SQL, então não é possível "escapar" da query alterando seu comportamento.
```js
// nunca assim: `SELECT * FROM users WHERE email='${email}'`  <- vulnerável
await db.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [email.trim()]);
```

**Proteção contra XSS (Cross-Site Scripting)** — todo dado vindo do banco ou do usuário que é inserido no HTML da interface passa pela função `esc()` (`frontend/js/app.js`), que converte `< > & " '` em entidades HTML antes de qualquer `innerHTML`. Isso impede que um título de livro, nome de leitor etc. cadastrado com uma tag `<script>` seja executado no navegador de outro usuário. O servidor também envia o cabeçalho `Content-Security-Policy`, que restringe de quais origens o navegador pode carregar scripts e estilos (apenas o próprio domínio e o CDN do Bootstrap), reduzindo o impacto de um script malicioso que eventualmente consiga ser injetado.

**Uso de HTTPS na comunicação cliente-servidor** — em produção (`NODE_ENV=production`), o servidor: (1) redireciona toda requisição HTTP para HTTPS (checando o cabeçalho `x-forwarded-proto`, que é como o Render informa o protocolo original, já que o TLS é finalizado na borda do provedor); (2) envia o cabeçalho `Strict-Transport-Security` (HSTS), instruindo o navegador a só acessar o site via HTTPS pelos próximos 180 dias, mesmo que o usuário digite `http://` na barra de endereço; (3) marca o cookie de sessão como `Secure` em produção, para que ele só trafegue em conexões criptografadas. O certificado TLS em si é fornecido automaticamente pelo provedor de hospedagem (Render), não sendo necessário gerenciá-lo manualmente.

Esses três pontos ficam concentrados em `backend/server.js` (cabeçalhos e redirecionamento), `backend/routes/libraryRoutes.js` (consultas parametrizadas) e `frontend/js/app.js` (função `esc()`).

> Importante: o redirecionamento HTTPS, o HSTS e o cookie `Secure` só entram em vigor com `NODE_ENV=production`. No Render, defina essa variável de ambiente em *Environment* nas configurações do serviço (ela não é definida automaticamente).

Sobre as capas enviadas por upload: no plano gratuito do Render, o disco é temporário — arquivos salvos em `uploads/covers/` (incluindo capas enviadas por upload de arquivo) são apagados a cada novo deploy ou reinício do serviço. Capas cadastradas por URL não são afetadas, pois não dependem de arquivo salvo no servidor. Para manter capas enviadas por upload de forma permanente em produção, seria necessário um serviço de armazenamento externo (ex.: Supabase Storage, Cloudinary).

## Banco de dados

O backend utiliza as tabelas `users`, `categories`, `books`, `readers`, `loans` e `stock_movements`, além da view `dashboard_summary`. Para montar o banco do zero, execute `database/schema-completo.sql` no SQL Editor do Supabase — veja `database/README.md` para mais detalhes.
