-- Crie um usuário administrador depois de executar a migração.
-- A senha abaixo é: Admin123!
-- O backend usa scrypt e armazena o valor no formato scrypt$salt$hash.
-- Para gerar uma senha diferente, use o endpoint de criação de usuário
-- ou o próprio sistema depois que existir um primeiro administrador.
--
-- Por segurança, este seed não grava uma senha em texto puro.
-- Gere o hash no backend com:
-- node -e "const crypto=require('crypto');const s=crypto.randomBytes(16).toString('hex');crypto.scrypt('Admin123!',s,64,(e,d)=>console.log('scrypt$'+s+'$'+d.toString('hex')))"
-- Depois substitua o valor abaixo e execute.

INSERT INTO public.users (name,email,password_hash,role)
VALUES ('Administrador','admin@biblioteca.local','scrypt$046bd06410fa4eff99306047126b9117$0b146c1e952289424effc8afa07ca93e74c150a44b23ee7633c12420f77b18f14156952c612b2f13f64f64d36ce624793c4933b03ecc259e6a7f39ec4493b4ba','admin');
