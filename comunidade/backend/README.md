# Backend da fundaÃ§Ã£o

Usar **projeto novo**, sem aplicar estas migrations no projeto do Louvor ou em banco com tabelas homÃ´nimas. NÃ£o hÃ¡ migraÃ§Ã£o de dados dos legados nesta fase. O SQL Ã© aditivo para um banco vazio e o seed contÃ©m apenas pessoas fictÃ­cias sem conta de login.

Os arquivos reconhecidos pelo CLI ficam em `backend/supabase/config.toml`, `backend/supabase/migrations/` e `backend/supabase/seed.sql`. A raiz de trabalho continua `backend` nos comandos. A estrutura foi corrigida durante a homologaÃ§Ã£o real: o CLI nÃ£o reconhecia migrations diretamente em `backend/migrations/`.

Projeto de homologaÃ§Ã£o vinculado: `ynkfmuseiancpnyloraf`. A fundaÃ§Ã£o jÃ¡ foi aplicada nele, sem seed. Estado e pendÃªncias em [HOMOLOGACAO.md](../docs/HOMOLOGACAO.md). O script `node scripts/homologation.mjs --configure` preenche somente URL/chave pÃºblica nos ambientes locais. A opÃ§Ã£o explÃ­cita `--smoke` cria e remove duas contas sintÃ©ticas nesse Ãºnico projeto, testa Auth/RLS sem enviar mensagens e nÃ£o deve ser usada em produÃ§Ã£o. Credenciais privilegiadas ficam apenas na memÃ³ria do processo.

## Local

PrÃ©-requisitos: Node 22.13+ ou 24, pnpm 11.25, Docker Desktop ativo. Na raiz:

```powershell
pnpm install --frozen-lockfile
pnpm db:start
pnpm db:reset
```

`db:reset` apaga apenas o banco local gerenciado pelo CLI. Nunca acrescente `--linked` ou `--db-url` ao comando. Pegue URL e chave pÃºblica do ambiente local com o CLI/Studio e preencha os `.env.local` dos apps (nÃ£o versionados). O telefone fÃ­sico precisa alcanÃ§ar o host: substitua 127.0.0.1 pelo IP da mÃ¡quina no ambiente de desenvolvimento, sem usar credenciais de produÃ§Ã£o.

Executar `pnpm test:db` nÃ£o precisa Docker: roda a migration real em Postgres WASM/PGlite, com auth.users e auth.uid mÃ­nimos para simular a identidade. Testa permissÃµes de tabelas e RPCs. **NÃ£o** testa GoTrue, PostgREST, OAuth, Storage ou Realtime. Com o Supabase local ativo, `node --test tests/supabase.integration.mjs` testa signup/sessÃ£o real; o script recusa URLs remotas. O workflow contÃ©m esse teste, mas ainda nÃ£o foi executado no GitHub.

## Primeiro administrador

NÃ£o existe senha admin padrÃ£o nem papel vindo do formulÃ¡rio de signup. No ambiente novo, crie uma conta individual, confirme o e-mail e identifique seu UUID no console autenticado. O responsÃ¡vel pelo banco pode atribuir o primeiro admin no SQL Editor, em transaÃ§Ã£o auditada:

```sql
begin;
insert into public.role_assignments(person_id, role)
select id, 'admin' from public.persons
where auth_user_id = '<UUID_DA_CONTA_VERIFICADA>'::uuid;
insert into public.audit_log(actor_id,action,resource_id)
select id,'role.bootstrap.admin',id from public.persons
where auth_user_id = '<UUID_DA_CONTA_VERIFICADA>'::uuid;
commit;
```

Substituir o marcador e revisar o titular antes de executar. Este procedimento nÃ£o foi executado. Depois do bootstrap, somente Admin concede/revoga papÃ©is via RPC auditada; o Ãºltimo Admin nÃ£o pode ser revogado. Status de membro/lÃ­der cadastral Ã© separado da permissÃ£o de acesso.

## ConfiguraÃ§Ã£o de homologaÃ§Ã£o/produÃ§Ã£o

Habilitar confirmaÃ§Ã£o de e-mail, SMTP e limites/CAPTCHA no Auth. Configurar Google e Apple conforme seus consoles, com redirect web `/auth/callback` e mobile `icabv://auth/callback`; recuperaÃ§Ã£o mobile aceita `?next=reset-password`. Configurar provedor SMS e orÃ§amento antes do OTP. NÃ£o colocar client secrets, service role ou SMTP nos apps. Apenas URL e publishable/anon key sÃ£o pÃºblicos e precisam de RLS correta.

Revisar [fontes oficiais de autenticaÃ§Ã£o](../docs/PESQUISA.md), regiÃ£o, backups, acesso dos operadores e observabilidade antes de dados reais. O uso de Storage e Realtime pelos mÃ³dulos futuros exige polÃ­ticas prÃ³prias; nenhum bucket/canal foi liberado pela migration da Fase 1.

## Consentimentos e documentos

`legal_documents.published=false` por padrÃ£o. Finalizar as minutas em [LEGAL-DRAFTS.md](../docs/LEGAL-DRAFTS.md), publicar URLs reais e uma versÃ£o revisada. O servidor exige versÃ£o publicada para onboarding e registra os quatro eventos com instante. SÃ³ entÃ£o configurar `NEXT_PUBLIC_LEGAL_READY=true` e `EXPO_PUBLIC_LEGAL_READY=true`. As flags da UI nÃ£o substituem a verificaÃ§Ã£o no banco. Testes de SQL publicam a versÃ£o apenas dentro do banco descartÃ¡vel.

O onboarding adulto exige consentimentos essenciais; analytics Ã© opcional e nÃ£o hÃ¡ coleta de analytics implementada. Perfis de menores ficam para gestÃ£o assistida com responsÃ¡vel verificado; esta fase nÃ£o oferece cadastro autÃ´nomo de menor.
