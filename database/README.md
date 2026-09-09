# Banco de dados

Esta versão adiciona cadastro de leitores, dados de contato nos empréstimos, devoluções com horário de registro e a view atualizada do dashboard.

Antes de alterar o banco de produção, exporte um backup no Supabase. Depois execute o arquivo `migration-tcc-v2.sql` no **SQL Editor** do projeto.

A migração cria a tabela `readers`, adiciona `reader_id` e `returned_at` à tabela `loans`, cria índices para consultas de leitores e atrasos e atualiza a view `dashboard_summary`.

O sistema mantém `borrower_name` e `borrower_registration` para preservar empréstimos antigos. Os novos empréstimos usam o leitor cadastrado e continuam exibindo os dados antigos normalmente.

As tabelas utilizadas pelo backend são `users`, `readers`, `categories`, `books`, `loans` e `stock_movements`, além da view `dashboard_summary`.

## Ordem recomendada

1. Faça backup do banco de produção.
2. Execute `migration-tcc-v2.sql` no Supabase.
3. Publique o código atualizado no GitHub.
4. Aguarde o Render concluir o deploy.
5. Cadastre um leitor de teste, registre um empréstimo e confirme a devolução.

As configurações de prazo padrão, estoque mínimo e nome da instituição ficam armazenadas no navegador do administrador nesta primeira versão, permitindo demonstrar o recurso sem alterar a estrutura do banco. Em uma etapa futura, elas podem ser transferidas para uma tabela de configurações por unidade.
