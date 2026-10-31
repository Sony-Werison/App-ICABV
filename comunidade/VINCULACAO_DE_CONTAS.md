# Vinculação de contas e cadastros importados

Acesse **Gestão → Pessoas e papéis → Vinculação de contas e revisão de duplicados** com uma conta de administrador.

1. O membro cria sua própria conta e confirma o e-mail. O e-mail de contato importado não é prova de posse da conta e não altera o login.
2. Selecione o cadastro importado sem conta na origem e a conta confirmada no destino. Pesquise por nome, e-mail, telefone ou identificador. Também é possível reunir dois cadastros importados antes da criação da conta.
3. Confira as origens, identificadores, contatos, turmas, vínculos como responsável, participação no louvor e quantidades de registros. Confirme a identidade com a pessoa.
4. Clique em **Conferir impacto da vinculação**. Escolha o nome confirmado e, se houver registros divergentes, indique qual deverá ficar em uso. A escolha de um registro de contatos considera todos os campos exibidos, inclusive a opção de divulgar o aniversário.
5. Registre como a identidade foi conferida, marque a confirmação e conclua. Se forem homônimos, registre **São pessoas distintas**; a sugestão deixa de aparecer. Uma revisão posterior continua possível pela pesquisa manual.

O identificador e a autenticação da conta de destino permanecem iguais. A vinculação move as referências pessoais da EBD, responsáveis, presenças, respostas, histórico importado, participação no louvor, escalas em JSON e demais relações com a pessoa. Os perfis existentes são mostrados antes da confirmação e também passam para o destino. Nenhum perfil é deduzido do nome ou e-mail.

O cadastro de origem fica arquivado, com referência ao destino; seus dados anteriores e os registros envolvidos ficam preservados na revisão administrativa. O histórico da gestão apresenta a justificativa, a comparação anterior e as escolhas sobre divergências. A união não possui botão de desfazer: uma correção excepcional deve ser planejada a partir dos dados preservados, sem apagar novos registros criados depois dela.

## Bloqueios e sincronização

- Apenas administradores consultam e concluem revisões. Secretários e membros não recebem acesso a essa pesquisa de contas e identidades.
- Duas contas com login não são unidas por esta ferramenta. A origem precisa ser um cadastro sem conta; contas de destino com e-mail ainda não confirmado também são bloqueadas.
- Nomes iguais, telefones ou e-mails de contato geram sugestões, nunca uma união automática. Nomes genéricos atribuídos a pessoas removidas dos apps antigos não contam como evidência.
- Dados com diferenças não são substituídos sem escolha. Conflitos financeiros e relações cuja remoção poderia quebrar referências exigem ajuste prévio no módulo de origem. A transação inteira é cancelada se houver incompatibilidade; não existe vinculação parcial.
- A prévia tem uma assinatura dos dados envolvidos. Se o cadastro mudar antes da confirmação, inclusive durante um período offline, a operação exige uma nova conferência. Gere outra prévia; cancele a operação antiga na lista de sincronização antes de enviar a revisão atualizada.
- Uma revisão feita offline em uma tela previamente carregada fica na fila do dispositivo. O histórico só muda no servidor depois da sincronização e da nova validação de permissões. Respostas perdidas são repetidas com o mesmo comprovante, evitando aplicar a revisão duas vezes.
- O membro passa a acessar o histórico reunido pelas permissões normais do app. Atualize a tela com conexão para buscar os novos registros; telas antigas em cache offline não recebem dados novos imediatamente.

## Implantação e verificação

Migrações: `202610220026_identity_reconciliation.sql` e `202610220027_identity_placeholder_names.sql`. Aplicadas ao projeto atual sem realizar nenhuma união de pessoas.

`scripts/apply-identity-migration.ps1 -Apply` aplica a primeira migração usando a sessão do Supabase CLI; `-Version 202610220027` aplica o filtro de nomes genéricos. O script verifica o registro de migrações e não imprime credenciais. Nenhuma migração atua nos aplicativos antigos.

Verificações: `npm run test:identity`, `npm run test:identity:browser`, `npm run test:db`, `npm run test:offline`, `npm run typecheck`, `npm run lint` e build de produção. O teste de navegador intercepta o Supabase e usa apenas dados fictícios; valida comparação, escolhas obrigatórias, confirmação, histórico, homônimos, revisão offline e layout de celular.
