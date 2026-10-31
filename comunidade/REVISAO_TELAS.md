# Revisão interna — 22/10/2026

Revisão local do app e da gestão com a conta verificada `pereirawerison@gmail.com`, administradora no Supabase de homologação. A sessão de teste foi isolada da sessão do navegador do responsável e encerrada ao final, sem solicitar senha ou enviar e-mails.

## Interface

Foram percorridas 26 telas e áreas em computador com tema claro e celular com tema escuro: início, agenda, conteúdos, grupos, ministérios, escalas pessoais, oração, células, famílias, ofertas de teste, perfil, início da gestão, pessoas e papéis, eventos e conteúdos, grupos e encontros, equipes e escalas, financeiro de teste e as nove áreas de registros administrativos. As 52 verificações não registraram erros JavaScript, respostas de API com erro, alertas de falha ou transbordamento horizontal.

Botões, ações de cartões, formulários, listas e mensagens de estado seguem a direção visual Tribus/BeChurch, com o logotipo e as cores ICABV. Seletores aguardam suas opções antes de permitir gravações. Mudanças de papel pedem confirmação e envios duplicados são bloqueados.

## Operações verificadas

Com registros temporários identificados exclusivamente para a revisão:

- Cadastro administrativo de família e pessoa; concessão e remoção de papel de líder somente da pessoa temporária.
- Aviso e grupo em rascunho; planejamento de encontro, leitura do resumo anual, conversa e moderação do grupo.
- Departamento e escala de serviço.
- Evento em rascunho, inclusão de item, consulta de presença e edição preservando os horários originais.
- Link devocional em rascunho.
- Lançamento administrativo financeiro de R$ 1,23 e exportação CSV.

Parte da preparação dos cenários usa as RPCs reais, e as ações descritas nos scripts como `UI` passam pelos botões reais do navegador. Não foram enviados convites, mensagens, e-mails ou pagamentos; conteúdos temporários não foram publicados. Os 13 registros temporários foram removidos por seus IDs e identificadores de revisão, com conferência da remoção. A trilha de auditoria foi preservada.

Scripts reproduzíveis: `scripts/real-account-review.mjs`, `scripts/real-account-operations.mjs` e `scripts/real-account-content-review.mjs`. Exigem Chromium e acesso administrativo local ao projeto de homologação pelo Supabase CLI; credenciais privilegiadas permanecem apenas na memória do processo de teste, fora do frontend. Relatórios e capturas ficam em `test-results/real-account`, ignorado pelo Git.

## Correções no backend e limites

As migrations aditivas `202610220012_management_onboarding.sql` e `202610220013_management_reads.sql` foram aplicadas à homologação e sincronizadas com o outro projeto. Corrigem o bloqueio indevido das operações administrativas por cadastro pessoal incompleto, preservando as validações de papel, escopo, liderança e privacidade.

A conta ainda não concluiu o onboarding pessoal, e os documentos institucionais estão pendentes de publicação. Inscrições, pedidos de oração, adesão a grupos e outras ações pessoais continuam dependendo desses requisitos. A interface explica a pendência e desabilita essas ações antecipadamente. Não foram inventados aceites nem alterado o cadastro da conta para contornar essa regra. Esses fluxos pessoais precisam de uma nova rodada após a conclusão legítima dos requisitos.

Ofertas e financeiro de teste mantêm as limitações de configuração do backend; não recebem pagamentos reais. Os testes não substituem a homologação de notificações, provedores externos ou dispositivos físicos.

## Verificações de código

Tipagem, lint, compilação portátil e os nove testes de banco descartável aprovados. O novo teste de regressão confirma gestão autorizada sem onboarding, bloqueio de participantes sem cadastro concluído, ausência de consentimentos fabricados e ausência de vínculo familiar automático.

As alterações e a prévia estão locais; esta revisão não publica uma nova versão hospedada.
