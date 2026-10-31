# Louvor e Painel EBD — 22/10/2026

Os dois módulos estão dentro do app atual, com Supabase, login individual, cadastro central de pessoas e o visual ICABV baseado em Tribus/BeChurch. As fontes e os bancos antigos foram preservados.

## Acesso

- `/app?tab=louvor` e `/app?tab=ebd`: início e menu do app.
- `/gestao?tab=louvor` e `/gestao?tab=ebd`: lateral e visão geral da gestão.
- Administrador e secretaria gerenciam os módulos. O administrador pode conceder acesso somente a um módulo em **Configurações → Responsáveis pelo módulo**.
- Professores acessam suas turmas; responsáveis, somente os alunos vinculados. Presbíteros e observadores consultam relatórios. A abertura do Louvor controla repertório e sala dos cultos em que estiver escalada.

Documentos institucionais e conclusão adicional do perfil deixaram de ser requisitos. O login individual e as permissões continuam necessários. Nenhum aceite ou onboarding fictício foi criado.

## Correspondências funcionais

| Origem | App integrado |
|---|---|
| Biblioteca musical | Busca, categorias, música nova, letra, cifra, vídeo e PDFs |
| Visualizador de cifra | Transposição, inclusive baixo invertido; fonte, rolagem, impressão e metrônomo |
| Edição/importação musical | Edição em lote; JSON, TXT e CSV com prévia |
| Escalas e repertórios | Cultos, períodos, funções, equipe, ordem das músicas, destaque e download |
| Geração mensal | Sugestões de domingos com rodízio por função e revisão antes de salvar |
| Ensaio | Repertórios pessoais persistidos na conta |
| Sala ao vivo | Música, tom e rolagem sincronizados a cada dois segundos |
| Histórico musical | Cultos concluídos, frequência anual/trimestral, CSV e contagens legadas separadas |
| Equipe | Vínculos com pessoas canônicas, funções e ativação, sem senhas compartilhadas |
| Perfis EBD | Conta da igreja + vínculos de aluno, professor, responsável e consulta |
| Turmas/módulos | Tipos, critérios, notas/marcações, módulo atual/próximo e grupo de leitura |
| Plano de estudo | Limites diário/semanal por módulo, tempo mínimo e avanço após conclusão |
| Atividades EBD | Leitura, vídeo, vídeo/Bíblia, questionário e atividade manual; perguntas abertas ou objetivas |
| Execução/correção | Resposta própria, gabarito privado, nota automática no servidor, correção e réplica |
| Diário | Presença, critérios, nota opcional e observação por aluno/data |
| Gravações | Link, turma, data, professor e publicação |
| Painéis | Progresso, notas, presença, histórico e acompanhamento anual por aluno/responsável |
| Relatórios | Semanal, mensal, anual, CSV, impressão e lembretes para compartilhar manualmente |
| Backup | Exportação e importação transacional com correspondência explícita de pessoas |

Pessoas e contatos são centralizados. E-mail de contato não altera o login nem vincula uma conta automaticamente. Dados complementares são opcionais e visíveis ao titular e à gestão geral. Senhas antigas, credenciais Firebase, resets destrutivos e seleção pública de perfis não foram incorporados.

## Históricos antigos

Em **Configurações → Importar backup**, selecione o JSON original, confira o resumo e escolha para cada pessoa a correspondência no cadastro da igreja. Para sua conta, selecione seu nome ou **Minha conta**. Criar cadastro sem login preserva o histórico sem criar acesso.

O importador pela interface não busca nem altera os bancos antigos. Em 22/10/2026, a pedido do responsável, foi executada a importação dos dados reais descrita abaixo. Nomes semelhantes não comprovam identidade; correspondências incertas foram preservadas separadamente.

Na importação manual genérica, atividades e gravações antigas entram como rascunho; respostas e notas entram como histórico identificado. Na importação real conferida, atividades e gravações foram disponibilizadas para as turmas correspondentes, respeitando aulas canceladas e cadastros arquivados. A importação é atômica e repetível: IDs legados evitam duplicação e erros revertem a operação. Perfis administrativos antigos não concedem administração. Contagens musicais legadas ficam identificadas separadamente para evitar dupla contagem.

## Importação real aplicada em 22/10/2026

As fontes foram consultadas sem alteração: Supabase do Louvor e Firestore da EBD. O destino é o Supabase já configurado no aplicativo atual. Uma cópia sanitizada de cada fonte e do estado anterior do destino foi preservada fora do OneDrive, em `.local-backups/comunidade-validation/work/real-import-20261022-current`, ignorado pelo Git. Credenciais e senhas não integram os arquivos exportados.

| Conteúdo | Quantidade no app atual |
|---|---:|
| Músicas, letras, cifras, vídeos e contagens antigas | 859 |
| Cultos e repertórios (65 escalas mensais, manhã/noite) | 130 |
| Equipe do Louvor | 15 integrantes da origem + 7 referências históricas inativas |
| Turmas EBD | 5 turmas da origem + 1 acervo arquivado para referências removidas |
| Módulos EBD | 9, conforme a turma e os módulos atribuídos |
| Atividades | 897 |
| Vínculos de alunos/professores com turmas | 96 |
| Vínculos de responsáveis | 73 |
| Registros únicos de respostas/avaliações | 9.301 |
| Presenças/avaliações por aluno e data | 796 |
| Registros de aulas/gravações | 140 |

Os 9.479 registros EBD da fonte estão representados: 178 cópias equivalentes foram reconciliadas com aliases dos IDs antigos, sem inflar notas e totais. As 23 atividades avulsas de vídeo já estavam no currículo e não foram duplicadas. O repertório de ensaio da origem estava vazio; nenhum ensaio artificial foi criado.

Dos 140 registros de aulas, 49 já tinham link de gravação e 7 estavam cancelados. Os demais registros foram preservados com a indicação de que o link ainda não foi cadastrado. A tela distingue cancelamento, justificativa e ausência de gravação.

A conta administradora existente mantém sua identidade e está ligada à equipe de Louvor e à turma em que lecionava. Outros cadastros importados não receberam login, senha ou administração geral. Contatos não vinculam contas por e-mail automaticamente. Casos incertos permanecem separados para conferência pela gestão, incluindo homônimos e referências de cadastros removidos. A associação posterior a uma conta deve ser conferida antes de conceder acesso aos históricos.

Foram mantidos critérios das turmas, planos de estudo, módulo atual/próximo, limites semanais, grupos de leitura, respostas, comentários, notas originais e respectivas escalas. Leituras e vídeos preservam o tempo mínimo de dois minutos do app antigo. Notas normalizadas para 0–10 mantêm também valor e escala de origem. As atividades já respondidas contam para conclusão de módulo e limites diários/semanais e não podem ser reenviadas como respostas novas. Os aniversários importados continuam com compartilhamento desativado por padrão.

Migrations aditivas 18 (reconciliação e proveniência), 20 (progresso com histórico) e 21 (ordem do currículo) aplicadas e sincronizadas ao backend compartilhado. A sequência das atividades segue a posição original, editável pela gestão, em vez dos UUIDs gerados na importação. Nenhuma conta antiga foi apagada ou teve a senha alterada, e os bancos de origem permanecem intactos. O plano foi ensaiado em Postgres descartável, aplicado em uma transação e repetido para verificar idempotência. Relatórios privados de ensaio/aplicação ficam junto às cópias sanitizadas.

A migration 22 otimiza os índices e calcula os escopos de leitura uma vez por consulta. Ela corrige o tempo limite observado com o volume real, preservando os mesmos acessos de aluno, responsável, professor e gestão. Na verificação autenticada, a primeira página de 500 históricos carregou em cerca de 1,3 segundo e o diretório em 0,9 segundo; antes, ambas as consultas ultrapassavam o limite de oito segundos. Os testes de isolamento de turmas e históricos continuam aprovados.

## Atualização incremental em 31/10/2026

Importação conferida a partir das fontes atuais, sem alterá-las. Foram acrescentados 10 cultos (manhã e noite para cinco domingos de novembro) e atualizado o repertório da escala da manhã de 25/10. A quantidade de músicas permaneceu em 859; o app agora tem 140 cultos.

Na EBD, o currículo e as 897 atividades permaneceram iguais. A pedido do responsável, foram acrescentadas 89 respostas/históricos, 10 registros de presença e 2 gravações. Totais após a atualização: 9.390 históricos, 806 presenças e 142 gravações. As inserções foram incrementais; não houve remoção de dados nem alteração nas atividades existentes. As contagens foram conferidas no destino após a aplicação.

Ferramentas: `snapshot-real-import.mjs` (leitura), `plan-real-import.mjs` (reconciliação), `rehearse-real-import.mjs` (ensaio) e `apply-real-import.mjs` (aplicação explícita com `--apply`, exigindo o mesmo hash do ensaio). O aplicador recusa um destino alterado após a cópia inicial e não imprime credenciais.

## Backend e validação

Migrations aditivas `202610220014` a `202610220017`, aplicadas à homologação e sincronizadas ao backend do App Igreja. RLS em todas as tabelas; RPCs para respostas, notas, importação e sala; auditoria sem conteúdo de contatos ou respostas.

- Tipagem, lint e compilação portátil.
- `npm run test:db`: dez testes, incluindo escopo das turmas, gabaritos, notas, participação sem onboarding, importação idempotente/reversível, limites e avanço de módulos.
- `npm run test:modules`: quatro testes de transposição, escala mensal, CSV e adaptação EBD sem transferência de segredos.
- `scripts/real-account-modules.mjs`: conta administradora real em sessão isolada, 19 áreas em computador e celular, gravações temporárias e limpeza conferida. Artefatos em `test-results/modules`, ignorado pelo Git, sem senhas ou sessões.
- `scripts/real-account-module-imports.mjs`: importação real de CSV musical e backup EBD fictício, conferindo preservação de campos, vínculo com pessoa existente, histórico e plano de estudo. Registros temporários removidos ao final.

A sala usa consulta autenticada periódica em substituição ao broadcast do legado. Áudio requer clique no navegador; vídeos/PDFs abrem o endereço cadastrado. Lembretes são preparados para compartilhamento manual. Esta integração local não publica uma nova versão hospedada.
