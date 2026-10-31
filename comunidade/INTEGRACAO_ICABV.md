# Integração ICABV — 21/10/2026

O código principal está em `comunidade`. O projeto `App Igreja` forneceu a marca, os módulos e as dez migrations iniciais. Seus aplicativos originais, EBD e Louvor foram preservados.

## Executar

Na pasta `comunidade`, execute `./Iniciar-ICABV.ps1`. Acesse http://localhost:5173/app. O script sincroniza os fontes para uma pasta local fora do OneDrive e reutiliza suas dependências. Esta separação evita os erros de leitura dos arquivos sob demanda do Windows. A cópia de execução fica em `~/apps/App Igreja/.local-backups/comunidade-validation`; os fontes editáveis continuam nesta pasta. Para compilar: `./Iniciar-ICABV.ps1 -Build`.

Em um checkout integralmente disponível fora do OneDrive: `npm ci`, `npm run dev`. Se existir um perfil local inacessível, defina `$env:SITES_EXECUTION_PROFILE='portable'`.

## Entregue

- Logo e nome institucional da Igreja Cristã no Alto da Boa Vista, vermelho #991B1B, temas claro/escuro, atalhos e PWA.
- Login e recuperação de senha por e-mail/Supabase; cadastro público por e-mail habilitado, com confirmação de e-mail e perfil inicial de visitante. Sessões pertencem ao Supabase; os cabeçalhos de autenticação ChatGPT não autorizam dados.
- Agenda com inscrições, lotação, reservas de itens, lembretes internos e exportação de calendário; avisos e links de conteúdo.
- Famílias, pessoas, situação cadastral e atribuição/revogação de papéis conforme o perfil.
- Grupos e ministérios com solicitação e aprovação; escalas pessoais, substituições com aprovação independente e presença.
- Encontros/estudos, confirmação, presença e resumo anual; conversa de grupos com moderação, retirada e denúncia.
- Ofertas/financeiro simulado do projeto de origem, identificado como teste, sem movimentação financeira real.
- Gestão anterior preservada em **Gestão → Gestão de registros**, agora no Supabase: cadastros, lançamentos manuais em centavos, escalas, eventos, avisos, textos de conteúdo, células e acompanhamento privado. Mantém exportação CSV, controle de versão, validação no banco, conflitos de horário e proteção de vínculos.

## Banco e dados

O projeto de homologação já usado pelo App Igreja foi reutilizado; sua configuração pública foi copiada seletivamente para `.env.local`, ignorado pelo Git. Nenhuma chave privilegiada foi copiada para o app. Para outro ambiente, use `.env.example`.

As dez migrations originais estão em `backend/supabase/migrations`. A migration aditiva `202610220011_management_records.sql` foi testada em Postgres WASM e aplicada à homologação após um dry-run que mostrou somente esse arquivo pendente. Ela acrescenta a gestão anterior sem alterar as tabelas e os dados dos módulos originais. RLS e RPCs validam identidade, papéis e escritas; auditoria não registra o texto dos pedidos.

**Os dados antigos do Cloudflare D1 não foram importados nem apagados.** O app agora lê Supabase. Caso existam registros úteis no D1, é necessário exportá-los e revisar o mapeamento antes da importação. Os registros da gestão anterior (`management_records`) e as entidades canônicas de eventos/pessoas/grupos são conjuntos separados: registros antigos não criam automaticamente inscrições, perfis, acesso ou vínculos canônicos. Para os fluxos novos use **Pessoas e papéis**, **Eventos e conteúdos**, **Grupos** e **Ministérios**. A gestão de registros mantém as funcionalidades anteriores para uso administrativo e importação posterior.

Os endpoints `/api/*` antigos retornam 410, impedindo que sessões ChatGPT continuem escrevendo no D1. O backend D1 e os scripts de teste anteriores permanecem como referência; esses smoke tests não se aplicam ao novo fluxo Supabase.

Não foram executados seeds, reset, importações de legados ou alterações nos papéis de contas existentes. Para um banco novo, aplicar as migrations em ordem e atribuir o primeiro administrador verificado conforme `backend/README.md`. Não aplicar a fundação em banco legado.

## Configuração de hospedagem

Definir `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` antes da compilação. Na autenticação Supabase, autorizar a URL real `/auth/callback` e `/auth/callback?next=/reset-password`. O código foi integrado localmente; uma versão publicada anteriormente não é atualizada sem novo build/deploy. O compartilhamento privado da hospedagem Sites continua sendo uma camada externa ao login Supabase.

## Verificações

- `npm run typecheck`
- `npm run test:db`: dez testes de regressão, incluindo os módulos Louvor/EBD e participação sem onboarding; todos usam banco descartável, sem contas reais.
- `npm run test:modules`: quatro testes de adaptação EBD, cifras, geração mensal e CSV.
- `npm run test:browser`: login e respostas da API simulados no navegador; requer Chromium do Playwright (`npx playwright install chromium` na primeira instalação).
- `npm run lint`
- `npm run build`

O financeiro de teste não recebe pagamentos. Notificações push e publicação nas lojas continuam com as limitações do projeto de origem. Louvor/EBD e a participação sem exigência de documentos estão descritos em INTEGRACAO_LOUVOR_EBD.md. A instalação em dispositivos reais exige homologação própria.

A migration aditiva também foi sincronizada ao backend do projeto App Igreja, mantendo o histórico consistente para os dois aplicativos que usam a mesma homologação. As telas e smoke tests D1 inativos estão em `legacy/`.

## Cadastro público e demonstração

O cadastro público por e-mail foi habilitado em 21/10/2026 no Supabase de homologação, com confirmação obrigatória do e-mail e senha mínima de 12 caracteres. Os retornos locais `/auth/callback` e de recuperação foram acrescentados sem remover os endereços anteriores. A configuração local também habilita cadastro por e-mail; SMS continua desabilitado.

Uma conta nova recebe perfil de visitante por meio das regras existentes do banco. Cadastro não cria papel de membro, líder ou administrador. O formulário confirma a senha antes de enviar. Desde a migration 14, documentos e conclusão adicional do perfil são opcionais; a participação mantém as regras de autenticação e de acesso específicas de cada recurso.

Para inspecionar a interface local sem depender de uma conta de gestão:

- `/demo?perfil=membro`: menus de um visitante autenticado.
- `/demo?perfil=gestor&tab=manage`: página de gestão e seus acessos.
- `/demo?perfil=gestor&tab=records`: painel administrativo com registros fictícios.

A demonstração reutiliza as telas reais com uma fonte de dados em memória, explicitamente identificada. Não faz requisições ao Supabase nem salva sessão; alterações são descartadas ao recarregar. A rota e os links de demonstração existem somente em desenvolvimento. Sair dessa rota restaura o cliente real; não há atribuição de papéis a contas reais.

Verificação específica: `node scripts/signup-demo-smoke.mjs` testa cadastro com API simulada, divergência de senhas, confirmação de e-mail, ausência de gestão para visitante, navegação administrativa, edição em memória, zero chamadas ao Supabase na demonstração e retorno ao login real. Nenhum e-mail de teste é enviado.

Cadastro/demonstração verificados no navegador, tipagem e lint aprovados. A compilação de produção foi verificada com `/demo` retornando HTTP 404. Nenhuma conta real foi criada ou promovida para viabilizar as prévias.

## Revisão visual e acesso real — 22/10/2026

A identidade visual importada foi substituída pelos padrões observados nas telas públicas de Tribus e BeChurch. Foram mantidos do App Igreja apenas o logotipo e a paleta. A [direção visual](DESIGN_REFERENCIAS.md) registra as referências e as mudanças.

O administrador indicado pelo responsável já foi cadastrado, teve a confirmação de e-mail verificada e recebeu o papel `admin` no servidor, com evento de auditoria. Para usar o acesso real, entrar em `/app` e abrir `/gestao`, ou tocar em **Abrir gestão** no cabeçalho / **Gestão** no menu. Recarregar a página atualiza as permissões da sessão existente. Nenhuma conta de demonstração foi usada para essa concessão.

A [revisão das telas internas](REVISAO_TELAS.md) registra a navegação em 52 combinações de tela e dispositivo e os testes com dados temporários da conta real. As migrations `202610220012_management_onboarding.sql` e `202610220013_management_reads.sql` corrigem a disponibilidade das funções administrativas sem dispensar os requisitos de participação pessoal. Ambas foram aplicadas à homologação e sincronizadas ao histórico do App Igreja. Nenhum consentimento foi criado e nenhum onboarding pessoal foi concluído artificialmente.

## Louvor, EBD e participação simplificada

A pedido do responsável, documentos e conclusão adicional do perfil deixaram de ser obrigatórios. As migrations 14 a 17 acrescentam os módulos Louvor e Painel EBD, com cadastro canônico, acesso por turma/função e importação revisada dos históricos. Consulte [INTEGRACAO_LOUVOR_EBD.md](INTEGRACAO_LOUVOR_EBD.md) para as correspondências e os testes. As limitações de onboarding descritas na revisão anterior são históricas e foram superadas nesta etapa.
