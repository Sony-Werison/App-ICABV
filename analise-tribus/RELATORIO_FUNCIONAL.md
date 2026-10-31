# Tribus — mapa funcional a partir do pacote Android

Data: 21/10/2026. Objetivo: orientar um sistema próprio para a igreja.

## Resultado e alcance

O arquivo enviado contém o pacote `com.tribusapp.dashboard`, versão `1.0.0`, código de versão `108`. A identidade declarada coincide com o aplicativo pesquisado. Isso não autentica o distribuidor nem comprova equivalência com o arquivo da Google Play: a assinatura de origem não foi validada.

O aplicativo usa Flutter e inclui uma biblioteca Dart compilada para ARM64. O REA 6.7.0 executou `identify-flutter-build` e `inspect-dart-aot` com sucesso, sem iniciar o aplicativo. A identificação da compilação teve cobertura completa; a projeção de strings do AOT foi parcial. Não houve recuperação do código-fonte Dart nem acesso ao servidor.

## Como interpretar as evidências

- **Referências detalhadas:** nomes de várias telas, entidades ou operações associados ao recurso estão presentes no binário. Indicam uma estrutura destinada à função, sem comprovar o fluxo em execução.
- **Referência isolada:** foi encontrado apenas um arquivo de entrada daquele módulo na extração realizada. Pode ser acesso externo, funcionalidade incompleta ou limitação da análise; não é possível decidir apenas pelo nome.
- **Recurso empacotado:** arquivo efetivamente incluído no APK. Sua presença não demonstra como o usuário o acessa.

Os caminhos abaixo são strings preservadas no binário, não arquivos Dart recuperados. O índice [modulos-dart.json](modulos-dart.json) registra os caminhos encontrados e os respectivos deslocamentos em bytes dentro de `libapp.so`.

## Mapa de funcionalidades

| Área | Estrutura indicada pelos arquivos | Exemplo de evidência | Nível |
| --- | --- | --- | --- |
| Pessoas | Cadastro, detalhes, importação, carteira de membro e relatórios demográficos/crescimento | `people/import/import_people_page.dart`; `people/reports/monthly_growth_people_widget.dart` | Referências detalhadas |
| Finanças | Contas, lançamentos, categorias, centros de custo, conciliação bancária, auditoria e relatórios | `finance/reconciliation/bank_reconciliation_page.dart`; `finance/audit/audit_details_page.dart` | Referências detalhadas |
| Dízimos e ofertas | Campanhas/contribuições, cobranças, recibos e relatórios por forma de pagamento | `donation/made/receipt_of_payment_donation_page.dart`; `donation/reports/payment_methods_widget.dart` | Referências detalhadas |
| Escalas | Criação, atribuição e publicação de escalas; equipes, funções, modelos e disponibilidade | `scheduleScale/domain/usecases/publish_schedule_scale.dart`; módulos `scheduleTeam`, `scheduleRole`, `scheduleTemplate`, `scheduleAvailability` | Referências detalhadas |
| Eventos | Organizadores, participantes, vendas, ingressos e leitor de QR Code | `event/qr_code_scanner_page.dart`; `event/participant_details_page.dart`; `event/sale_details_page.dart` | Referências detalhadas |
| Discipulado | Trilhas, etapas, passos, progresso por usuário e relatórios | `journey/domain/entities/journey_user_progress.dart`; `journey/journey_track_reports_page.dart` | Referências detalhadas |
| Atendimento pastoral | Listagem, detalhes, filtros e relatórios de atendimento | `pastoralCare/pastoral_care_details_page.dart`; `pastoralCare/reports/reports_pastoral_care_page.dart` | Referências detalhadas |
| Orações | Painel, pedidos, detalhes e relatórios | `prayer/prayer_detail_dashboard_page.dart`; `prayer/reports/reports_prayer_page.dart` | Referências detalhadas |
| Formulários | Formulários por igreja, respostas e relatórios; compartilhamento do cadastro de pessoas | `form/form_responses_page.dart`; `people/form/share_form_page.dart` | Referências detalhadas |
| Permissões | Associação de usuários a módulos e edição de permissões | `permission/modules/modules_by_user_page.dart`; `permission/peoples/save_by_module_page.dart` | Referências detalhadas |
| Notícias e avisos | Estruturas de conteúdo para notícias, avisos e banners | Módulos `news`, `billboard` e `banner` | Referências detalhadas |
| Conteúdo de mídia | Pregações, canais, séries, podcasts, episódios e links de rádio/culto | Módulos `sermon`, `channel`, `playlist`, `podcast`, `episode`, `onlineRadio`, `onlineWorship` | Referências detalhadas |
| Arquivos e documentos | Operações sobre arquivos, pastas, downloads, documentos e álbuns | Módulos `cloud`, `cloudFolder`, `cloudFile`, `download`, `document`, `album` | Referências detalhadas |
| Participação | Enquetes, votos, estatísticas e testemunhos | `poll/widgets/poll_votes_bar_chart.dart`; módulos `pollVote` e `testimony` | Referências detalhadas |
| Cantina | Página inicial, detalhes e operações de atualização | `canteen/canteen_details_page.dart`; `canteen/data/repositories/update_canteen_factory.dart` | Referências detalhadas; pedidos não validados |
| Recursos com IA | Estruturas de mensagens do Matias, mídia generativa e assistente financeiro | `_matias/domain/entities/message_matias.dart`; módulo `generativeMedia`; `finance/assistant/finance_assistant_dashboard_page.dart` | Referências detalhadas; modelo e capacidades não verificados |
| Infantil e células | Entradas de módulos infantil e células | `kids/kids_dashboard_page.dart`; `cell/cell_dashboard_page.dart` | Referências isoladas |
| Missões e voluntários | Entradas para gestão missionária e voluntariado | `mission/manager_mission_dashboard_page.dart`; `vollunters/manager_vollunters_dashboard_page.dart` | Referências isoladas; escalas têm evidências próprias mais detalhadas |
| Cursos, loja e comunidade | Páginas de entrada desses recursos | `course/course_dashboard_page.dart`; `store/store_page.dart`; `community/community_home_page.dart` | Referências isoladas |
| Stories, lembretes e leitura | Páginas de entrada de stories, lembretes e planos de leitura | `story/story_dashboard_page.dart`; `reminder/reminder_home_page.dart`; `readingPlan/reading_plan_home_page.dart` | Referências isoladas |
| Bíblia e jogos | Bíblia NVI em JSON; imagens para jogos bíblicos e casuais | `assets/flutter_assets/assets/bible/nvi.json`; imagens `who_am_i.png`, `word_puzzle.png`, `wordle.png`, `2048.png` | Recursos empacotados; fluxos não testados |

As telas e operações citadas podem estar condicionadas a plano, configuração da igreja, versão ou servidor. A quantidade de referências não mede a qualidade ou o grau de conclusão de um módulo.

## Primeira versão proposta para sua igreja

Esta é uma proposta independente, não uma reprodução das regras internas do Tribus.

| Prioridade | Entrega | Critério de conclusão sugerido |
| --- | --- | --- |
| 1 | Usuários e permissões | Secretaria, tesouraria, liderança e membros acessam somente as informações atribuídas ao seu papel |
| 1 | Pessoas e famílias | Cadastrar, procurar, editar e importar pessoas; identificar visitantes e membros; evitar duplicações |
| 1 | Ministérios e escalas | Líder cria e publica escala; voluntário confirma ou recusa; conflitos de disponibilidade são indicados |
| 1 | Agenda e avisos | Liderança publica atividade; membro consulta agenda e comunicados |
| 1 | Tesouraria básica | Registrar entrada/saída com categoria e comprovante; consultar saldo e fechamento mensal |
| 2 | Células e acompanhamento | Registrar encontros e presença; atribuir responsáveis pelo acompanhamento de visitantes |
| 2 | Eventos | Inscrição, lista de participantes e confirmação de presença; pagamentos apenas se necessários |
| 2 | Infantil | Registrar responsáveis autorizados e entrada/saída; consultar histórico de entrega |
| 3 | Discipulado e conteúdo | Trilhas com progresso e responsáveis; biblioteca de links e materiais |

O primeiro recorte deve ser ajustado aos processos atuais da igreja. Check-in infantil, registros pastorais, conciliação bancária e pagamentos exigem descoberta própria; não há evidência suficiente aqui para copiar suas regras.

### Fluxos a detalhar no projeto

1. **Visitante → acompanhamento → membro:** cadastro mínimo, responsável, contato, histórico e mudança de situação.
2. **Ministério → equipe → escala → confirmação:** função, disponibilidade, publicação e substituição.
3. **Lançamento → comprovante → conferência → relatório:** categoria, conta, competência, pagamento e histórico de alterações.
4. **Evento → inscrição → presença:** disponibilidade de vagas, cancelamento e registro de entrada.

### Modelo de dados inicial sugerido

Igreja, usuário, papel/permissão, pessoa, família, ministério, vínculo ministerial, equipe, função, disponibilidade, escala, atribuição, evento, inscrição, aviso, conta financeira, categoria, lançamento e comprovante. Adicionar células, encontros, crianças e responsáveis conforme a prioridade confirmada.

## Limites e validação restante

- Não foram observadas telas em execução, autenticação, serviços remotos ou permissões efetivas.
- Não foram validados relatórios calculados, integrações de pagamento, limites de planos ou funcionamento sem conexão.
- As permissões Android declaradas incluem câmera, microfone, biometria e notificações. Sua declaração não demonstra uso por um recurso específico.
- A Bíblia e demais conteúdos encontrados servem como evidência; não foram incorporados a um aplicativo novo.
- O APK não contém necessariamente a lógica do servidor. A próxima validação útil é observar os fluxos prioritários em uma conta de teste ou demonstração.

## Arquivos da análise

- [Identificação da compilação pelo REA](rea-flutter-build.json).
- [Inspeção AOT pelo REA, com limites de cobertura](rea-dart-aot.json).
- [Manifesto Android decodificado localmente](manifest-nodes.json).
- [Índice de módulos e deslocamentos no binário](modulos-dart.json).
- [Metadados, hashes dos APKs extraídos e inventário de recursos](evidencias.json).
- [Script da inspeção complementar](inspecionar.cjs).

SHA-256 do `.apks` recebido: `2bb231f9898e7b4b2707b425b94ec5c317f0b43722f155267418e9a9caa4db2a`.

REA instalado apenas em `ferramentas/`, com versão fixada e scripts de instalação desativados. Não houve registro global de MCP nem alteração de configurações do Codex.
