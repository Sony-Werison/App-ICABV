# BeChurch como referência complementar

Análise de 21/10/2026. Arquivo fornecido: `BeChurch-App_1.0.32_apkcube.apks`.

## Identificação e alcance

- Pacote declarado: `com.bechurch`.
- Versão declarada: `1.0.32`, código `37`.
- Flutter com referências ao projeto `be_church` e à estrutura FlutterFlow.
- REA 6.7.0: identificação Flutter concluída; inspeção Dart AOT com cobertura parcial da projeção de strings.
- SHA-256 do pacote recebido: `b95e8d5dff6104d22444f5a0756dee083a9550a815011f9f21074a891acce22c`.

Esta é uma inspeção estática. A assinatura de distribuição não foi validada, e os fluxos não foram observados em execução. Nomes de páginas e mensagens são evidências de referências presentes no binário, sem comprovar disponibilidade ou regras do servidor.

## Recursos encontrados

Os caminhos abaixo são strings no binário, não código-fonte recuperado. O [índice com deslocamentos em bytes](bechurch-paths.json) permite conferir sua origem.

| Área | Exemplos de referências no pacote |
| --- | --- |
| Devocionais | `pages/g1_devocional/g1_devocional_widget.dart`; `pages/gg_detalhes_devocional/gg_detalhes_devocional_widget.dart` |
| Cultos e transmissão | `pages/f_cultos/f_cultos_widget.dart`; `pages/x_ao_vivo/x_ao_vivo_widget.dart`; reprodutores de vídeo e YouTube |
| Células | `pages/k_celulas/k_celulas_widget.dart`; `pages/k_detalhes_celulas/k_detalhes_celulas_widget.dart`; `components/popup_participar_celula_widget.dart` |
| Orações | `pages/n_pedidos_oracao/n_pedidos_oracao_widget.dart`; `pages/nn_fazer_pedido/nn_fazer_pedido_widget.dart`; `pages/nnn_orar/nnn_orar_widget.dart` |
| Escola bíblica | `pages/h_e_b_d/h_e_b_d_widget.dart`; `pages/hh_detalhes_e_b_d/hh_detalhes_e_b_d_widget.dart` |
| Bíblia | `biblia/biblia_home/biblia_home_widget.dart`; páginas de livros, capítulos, versões e personalização |
| Escalas | `pages/pp_minhas_escalas/pp_minhas_escalas_widget.dart`; componentes de recusa e observações |
| Eventos e encontros | `pages/i_eventos/i_eventos_widget.dart`; páginas de encontros, detalhes e participação |
| Vida comunitária | Páginas de ministérios, aniversariantes, jornada pessoal e emoções |
| Outros | Páginas de doações, dados cadastrais, notificações e informações da igreja |

## Complementos escolhidos para o Comunidade

### Biblioteca para a semana

Devocionais, pregações, estudos e links de culto ao vivo. A gestão publica textos próprios, referências bíblicas, autoria e links HTTPS. O app oferece busca, filtros e leitura. Rascunhos ficam restritos à administração e à secretaria.

### Diretório de células

Nome, liderança, dia, horário, região/local, descrição e um canal de contato escolhido pela igreja. No app, a pessoa busca um grupo e abre o contato, quando configurado. Não há inscrição automática ou controle de presença nesta entrega.

### Pedidos de oração privados

O membro envia o pedido e acompanha sua situação. Somente a pessoa, a secretaria e o administrador podem lê-lo. O app não apresenta pedidos de outras pessoas, inclusive para líderes de ministério e tesouraria. Essa é uma decisão de produto para o Comunidade; não descreve a política do BeChurch.

## Recursos para etapas futuras

Bíblia com uma fonte de conteúdo cuja utilização tenha sido definida, escola bíblica com turmas, presença em células, inscrições em encontros, aniversariantes com preferência de visibilidade, doações integradas e notificações. Essas referências foram registradas, mas não são funcionalidades entregues nesta complementação.

## Evidências

- [Identificação pelo REA](rea-flutter-build.json).
- [Inspeção Dart pelo REA](rea-dart-aot.json).
- [Manifesto Android](manifest-nodes.json).
- [Referências do projeto e seus deslocamentos](bechurch-paths.json).
- [Script da inspeção complementar](inspecionar.cjs).

Os novos recursos do Comunidade foram escritos no projeto existente. A análise não incluiu consultas aos serviços remotos do BeChurch.
