# ICABV — Igreja Cristã no Alto da Boa Vista

Aplicativo web/PWA com identidade ICABV, login por e-mail e senha e backend Supabase. Integra o app principal com os módulos do projeto App Igreja.

Execute `./Iniciar-ICABV.ps1` e acesse http://localhost:5173/app. Em checkout local completo: `npm ci` e `npm run dev`.

Veja [INTEGRACAO_ICABV.md](INTEGRACAO_ICABV.md) para recursos, banco, validação, separação dos cadastros anteriores e limitações. Configuração inicial do Supabase em [backend/README.md](backend/README.md).

Os dados anteriores do D1 foram preservados e não são importados automaticamente. A gestão anterior foi adaptada ao Supabase e está em **Gestão → Gestão de registros**.

Cadastro público por e-mail disponível. Para explorar os menus localmente, use os links de demonstração na tela de acesso.

Aniversariantes e contribuições para cestas básicas estão disponíveis no início, no menu e na gestão. Consulte [ANIVERSARIOS_E_CESTAS.md](ANIVERSARIOS_E_CESTAS.md) para compartilhar o aniversário, configurar campanhas e conferir entregas.

Alterações de dados podem ser guardadas sem conexão e sincronizadas depois. O sino reúne comunicados e pendências pessoais. Consulte [OFFLINE_E_NOTIFICACOES.md](OFFLINE_E_NOTIFICACOES.md) para funcionamento e verificações.

Louvor e Painel EBD estão integrados ao app e à gestão com a mesma conta e cadastro de pessoas. Documentos e conclusão adicional do perfil são opcionais. Consulte [INTEGRACAO_LOUVOR_EBD.md](INTEGRACAO_LOUVOR_EBD.md) para recursos, permissões e importação dos históricos.

- [Vinculação de contas e revisão dos cadastros importados](VINCULACAO_DE_CONTAS.md) — fluxo administrativo, conflitos, histórico e sincronização.

- [Revisão visual e padrão da interface](REVISAO_VISUAL.md) — telas, decisões, verificações e orientações de uso.
