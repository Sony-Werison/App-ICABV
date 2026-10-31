# Padrão visual e revisão da interface

## Direção

Manter a identidade vermelha da ICABV, o fundo escuro #191919 e a aparência clara equivalente. Uma família de fonte de sistema (Inter quando disponível, Segoe UI e sans-serif como alternativas), títulos 24–32 px, seções 18–20 px, corpo 14–16 px e ajuda 12–13 px. Escala de espaçamento 4/8/12/16/24/32 px, cantos 12 px, bordas discretas e sombras leves. Controles com alvo mínimo 44 px, foco visível, movimento reduzido quando solicitado pelo dispositivo.

Navegação principal curta, demais áreas agrupadas. Ações frequentes ficam visíveis; ferramentas administrativas secundárias em painéis recolhidos. Esses painéis preservam os campos ao fechar. A paginação de apresentação usa os dados já recebidos e não altera APIs, exportações ou cálculos.

Suposições: usuários precisam reconhecer os nomes já usados; portanto, destinos, rótulos de ações essenciais e rotas são preservados. O modo escuro continua opcional. A revisão não muda autorizações, sincronização, prazos, avaliações, cálculos ou regras da igreja.


## Melhorias por área

| Área | Alterações de apresentação |
| --- | --- |
| Início e acesso | Tipografia maior, largura adequada ao desktop, controles consistentes, estados de carregamento e status de sincronização mais discreto. |
| Menu dos membros | Busca sem acento e três grupos: culto/aprendizado, comunidade e conta/família. As opções anteriores continuam disponíveis. |
| Gestão | Cinco destinos principais e “Mais áreas”, navegação adaptada ao celular, cartões compactos, busca por área e contraste reforçado. |
| Pessoas | Cadastro acessível antes da lista. Vinculação, família, permissões e contatos em painéis. Identificadores técnicos em detalhes e perfis traduzidos. |
| Louvor | Busca sem acento, ordenação por título/artista/tom, 12 músicas por página, menu curto e listas paginadas. Edição em lote movida para Mais → Configurações. |
| EBD | Diário e correções em destaque para professores. Busca na chamada, no histórico e nas gravações; paginação de atividades, entregas e correções; respostas e perguntas em painéis expansíveis. |
| Cestas e aniversários | Controles padronizados, textos mais curtos, contraste dos indicadores e paginação de recebimentos. |
| Agenda, grupos, oração e conteúdos | Padrão de cartões e formulários compartilhado, leitura confortável, carregamento com skeleton. Publicação administrativa em painel, mantendo os campos preenchidos ao fechar. Conteúdos e células paginados na apresentação. |
| Registros e finanças | Navegação agrupada, nomes de tela diretos, 20 registros por página, tabelas com cabeçalho fixo no desktop e cartões identificados no celular. Modais com ações visíveis e formulários legíveis. |
| Notificações e perfil | Painel móvel adaptado, cabeçalho fixo, foco e contraste consistentes. A revisão preserva os mecanismos existentes de teclado, leitura e sincronização. |

## Preservação dos fluxos

Nenhuma rota, API, esquema, autorização, cálculo, prazo ou regra de negócio foi alterado. Busca, ordenação e paginação novas trabalham na apresentação dos resultados já carregados. Exportações continuam recebendo todos os resultados filtrados. Antes da impressão, todas as páginas são renderizadas; a folha usa fundo claro e não recorta a tabela. Ao trocar de página com campos alterados, o usuário recebe uma confirmação para evitar descartar uma edição sem perceber.

Os componentes compartilhados ficam em `features/icabv/presentation.tsx`; o padrão visual está em `app/modern-ui.css`, aplicado após os estilos existentes. Os componentes anteriores continuam funcionando com suas operações originais.

## Validação

- Build de produção, lint e TypeScript.
- 24 testes de banco e unidade existentes, sem falhas.
- Fluxos de navegador com Supabase simulado: login, temas, navegação, famílias, modais, registros, CSV completo, impressão completa, EBD offline, notificações e vinculação de contas.
- Teste de apresentação: busca sem acento, paginação, lista vazia, teclado, validação inline e preservação dos campos opcionais recolhidos.
- Demonstração: contribuições, múltiplos itens, recebimento parcial, encerramento e criação de campanhas, aniversários e privacidade.
- Auditoria com sessão real de leitura: 70 estados de interface em 390, 768 e 1440 px, incluindo modais e notificações. Nenhum erro de API/execução, transbordamento horizontal ou controle menor que 44 px nas verificações realizadas. O roteiro bloqueia gravações no Supabase; não modifica os dados da igreja.
- Contraste calculado dos tokens: texto principal 15,74:1 no claro e 15,98:1 no escuro; texto secundário 6,14:1 / 8,55:1; botão principal 6,30:1; bordas de campos 3,43:1 / 4,01:1. Isso valida a paleta principal, sem representar certificação de todos os conteúdos inseridos pelos usuários.

## Revisão manual recomendada

Usar um Android e um iPhone reais com teclado aberto, aumentar a fonte do sistema e conferir os seletores de data. Testar leitor de tela e validar a impressão em papel/PDF de relatórios representativos. Pedir que membros com pouca familiaridade com tecnologia encontrem sua escala, abram uma música e contribuam com um item de cesta.

Fora do escopo: guia de primeiro acesso, atalhos pessoais, favoritos e personalização. Não houve mudanças de dados, unificação de módulos ou criação de regras para esses recursos.


## Ajustes após os comentários na página inicial

- Nome completo da igreja em uma linha, com tamanho adaptado à largura. Removida a legenda “Conecte-se à vida da nossa igreja”.
- Comunicados logo abaixo da apresentação, antes da agenda e dos acessos.
- Eventos em linhas de aproximadamente 76 px, com dia/mês, título, horário e local. O toque continua abrindo a agenda com os detalhes completos.
- Um único grupo “Acessos”, com os nove destinos anteriores no mesmo padrão. Os atalhos de cestas, escalas e família foram incorporados a esse grupo.
- Status de sincronização ao lado de ICABV: verde para sincronizado, amarelo para envio pendente, laranja para offline e vermelho para revisão/erro. Ícones e rótulos acessíveis complementam as cores. Ao tocar, o usuário pode consultar a fila, tentar novamente ou cancelar um envio com a confirmação já existente.
- Preservados o transporte offline, os comandos, a persistência e a reconciliação. Nenhuma alteração de API, dados, regras ou rotas.

Verificação desta rodada: build, lint, TypeScript e 24 testes de banco/unidade aprovados; quatro roteiros de navegador aprovados (fluxos principais, interação, chamada EBD offline/notificações e identidade). Página inicial conferida em 320, 390, 575 e 1440 px: nome completo em uma linha e eventos abaixo de 90 px. Auditoria adicional de 12 estados com dados reais somente para leitura: nenhum erro de API/execução, transbordamento ou controle abaixo de 44 px. Prévia: `test-results/visual/inicio-compacto.png`; detalhes: `test-results/visual/sincronizacao-detalhes.png`.


Ajuste de cor solicitado: no escuro, botões em #a52127, ícones em #dc4b53 e texto de destaque em #ed6269, substituindo o rosa #ffadb1. Contraste do texto: 5,49:1 sobre #191919 e 4,73:1 sobre os fundos secundários; ícones: 3,74:1 sobre #242629. Fundo #191919 preservado. Build e roteiro principal de navegador aprovados.


Cor definitiva conforme o logo: a amostragem de `public/logo-icabv.png` identificou #FF0000 (11.189 pixels vermelhos sólidos). Esse valor substitui os tons anteriores nos ícones e destaques dos dois temas. Textos pequenos permanecem neutros no escuro; botões de fundo vermelho usam texto preto para manter legibilidade. Fundo escuro #191919 preservado.


Ajustes seguintes na página inicial: removidas as bordas vermelhas laterais do comunicado e da data do evento; título alterado para “Próximo evento”. O informe compacto agora mostra os aniversariantes da semana atual, de segunda a domingo, usando a data de São Paulo. Consulta os meses e páginas necessários pela RPC existente e ordena os aniversários de segunda a domingo, sem alterar o consentimento ou o calendário mensal completo em “Ver todos”. A semana também funciona na virada do mês e do ano, incluindo anos bissextos. Validação: build, lint, tipos, seis testes de módulos (incluindo dois de calendário semanal) e teste principal de navegador aprovados.

Próximo evento: a página inicial exibe somente o primeiro evento publicado e não encerrado da consulta existente, ordenada por data de início. Os demais permanecem na Agenda. Teste com dois eventos confirmou um cartão no início e ambos disponíveis em Ver agenda. Build, lint, tipos e roteiro principal aprovados.


## Escalas mensais conforme a referência

Quadro compartilhado em `features/icabv/schedule-board.tsx`, com agrupamento em `schedule-model.ts`. Datas nas linhas, funções nas colunas, múltiplos participantes por célula, iniciais quando não há foto, estados e vagas “A definir”. Abertura e pregação são separadas por período; funções e equipes novas são aproveitadas dos cadastros existentes.

Aplicado ao Louvor (Escalas e Calendário mensal), à página Escalas dos membros, à gestão de equipes e às escalas gerais nos registros. Há seleção de mês, navegação entre meses e filtro de equipe quando necessário. No celular, cada data mostra as funções e seus participantes em cartões; no desktop, a tabela tem cabeçalhos fixos e rolagem restrita ao quadro. Ao selecionar uma participação, os detalhes preservam repertório, edição, confirmações, recusas, trocas e presença conforme as permissões anteriores. A gestão de registros conserva “Ver por pessoa”, exportação e ações originais.

Não houve mudança de esquema, rotas, permissões ou regras. A visualização mensal de equipes consulta todas as páginas necessárias usando as RPCs existentes; a listagem mensal de cultos usa os dados importados já disponíveis. Apenas informações autorizadas pelas fontes atuais são exibidas; o quadro pessoal não expõe as participações de outras pessoas.

Validação: build, lint, tipos, 28 testes de banco/unidade e cinco roteiros de navegador, incluindo teste novo de escalas (`npm run test:schedules`). Foram conferidos períodos, múltiplas pessoas, estados vazios, datas de Brasília, paginação, funções novas, edição, confirmação, filtros, ligação ao mês e escala selecionados, modo escuro, 320/390/575 px e navegação existente. Recomenda-se revisar os nomes das funções importadas e conferir a leitura em celulares reais.

Conferência com dados reais: nove estados de escalas em 320, 390 e 1440 px, sem erros de API/execução, transbordamento ou controles menores que 44 px; gravações bloqueadas. Nomes de função padronizados somente na apresentação; participantes repetidos na mesma função são mostrados uma vez, com opções para abrir cada culto. O acesso de secretaria às escalas gerais permanece somente de leitura.

Ajuste solicitado para celular: o quadro permanece em tabela também abaixo de 700 px. Colunas distribuídas na largura disponível, nomes completos com quebra de linha, cabeçalhos compactos, data abreviada e avatares ocultos. Removida a versão em cartões. A tabela móvel não tem rolagem horizontal nem contêiner vertical com altura limitada. Verificados 320, 390 e 575 px, edição, confirmação e leitura sem permissão de edição. Build, lint, tipos e roteiros de escalas/navegação aprovados.

Compactação adicional das escalas: removidas as opções Ver cultos, nomes centralizados horizontalmente, espaçamento e altura das células reduzidos no celular. Os nomes completos e a tabela sem rolagem horizontal permanecem. Teste com cinco datas verificou que a última linha do quadro de cultos cabe acima da navegação inferior em 320x740, 390x844 e 575x1404. Build, lint, tipos e teste de escalas aprovados.

Alinhamento refinado: conteúdos das participações centralizados verticalmente, cabeçalhos centralizados horizontalmente, coluna de data com fundo distinto, números em 12 px e largura maior no celular. Mantidas as cinco datas inteiras acima da barra inferior e todas as funções sem corte em 320/390/575 px. Testes de alinhamento medem o centro do nome em relação ao botão; teste de navegação também aprovado.

Ajustes de início/cabeçalho/agenda: sincronização movida para o grupo de ações, imediatamente ao lado da configuração; Próximo evento acima dos comunicados. Agenda agora tem calendário mensal compacto de segunda a domingo, Hoje, navegação por meses, dias com eventos destacados e seleção da data para filtrar a lista. Busca e categoria ficam em um painel recolhível. O calendário consulta todas as páginas autorizadas pela RPC existente, incluindo eventos publicados de meses anteriores; detalhes e inscrições continuam usando os fluxos originais. Eventos de vários dias respeitam o fuso de Brasília e não marcam o dia do término quando este ocorre à meia-noite. A consulta de vagas é dividida em lotes de até 20, preservando o limite da API. Lista paginada em 20 eventos. Nenhuma mudança de rota, esquema, permissão ou regra de inscrição. Testes novos em npm run test:agenda; build, lint, tipos, testes unitários de calendário e roteiros de navegador aprovados.

Auditoria real complementar: seis telas de início/agenda em 320, 390 e 1440 px, sem transbordamento, erros de API/execução ou controles menores que 44 px; gravações no banco bloqueadas.

Agenda pessoal: calendário e lista incluem aniversários compartilhados, funções próprias nos cultos (louvor, abertura, pregação e outras), escalas de equipes e registros gerais, como limpeza e café da manhã. Ícones distintos identificam eventos, aniversários e escalas; selecionar o dia reúne os compromissos. Funções da mesma pessoa no mesmo culto aparecem juntas, com acesso à escala e repertório. Escalas de equipes levam a Minhas escalas. Mantidos os filtros exclusivos de eventos, paginação, meses, fuso de Brasília e navegação existentes. Não há alterações de esquema, permissões, rotas ou gravações. Identificação pelo cadastro vinculado, sem correspondência por nome; escalas recusadas, canceladas ou indisponíveis ficam excluídas. Aniversários usam a consulta existente com consentimento, sem idade ou ano de nascimento. Fontes independentes preservam os compromissos disponíveis quando outra consulta falha, com mensagem e opção de tentar novamente.

Validação: build e tipos aprovados, 13 testes de módulos/calendário, 14 testes de banco e seis de sincronização aprovados. Roteiros de navegador verificaram compromissos próprios, privacidade, funções reunidas, cancelamentos, meses, filtros, navegação para escalas, falha parcial e recuperação, sem gravações, além de regressões da Agenda, navegação geral e operação offline. Layout conferido em 320, 390 e 575 px. Teste adicional disponível em npm run test:agenda:personal.

Ajuste da lista da Agenda: sem data selecionada, aparecem somente os compromissos de hoje em diante no mês exibido, considerando o dia em Brasília e mantendo eventos de vários dias que ainda estejam em andamento. Marcadores de datas anteriores continuam no calendário; selecionar a data mostra o histórico correspondente e “Ver próximos” restaura a lista futura. Legenda e marcadores usam vermelho para eventos, dourado para aniversários e azul para escalas, com tonalidades adaptadas aos dois temas e os mesmos ícones nos cartões. Seleção com contorno vermelho preserva a diferença de cores. Removido somente no calendário o fundo branco herdado do hover de linhas de tabela; foco de teclado e indicação de hoje permanecem. Testes de navegador cobrem passado/hoje/futuro, seleção e retorno, cores distintas nos dois temas e ausência do realce branco.

Próximos compromissos entre meses: removido o limite do mês exibido na lista sem data selecionada. Eventos publicados e escalas próprias carregados pelas consultas existentes aparecem em ordem cronológica, preservando a paginação em 20 compromissos. A consulta de registros mantém o filtro pelo cadastro vinculado e carrega todas as páginas autorizadas; aniversários compartilhados consultam os 12 meses e entram uma vez, na próxima ocorrência válida, inclusive na virada do ano e em 29 de fevereiro. Calendário e seleção de dia conservam a visualização mensal/histórica. Datas dos cartões incluem o ano da ocorrência. Testes cobrem próximo mês sem navegar, todas as fontes de escala, retorno à lista futura, isolamento da seleção e viradas de ano/bissextos. Nenhuma mudança de esquema, RPC, permissões ou gravações.

Validação deste ajuste: build, lint e tipos aprovados; 14 testes de módulos/calendário e os dois roteiros de navegador da Agenda aprovados, incluindo responsividade e falha parcial de fonte.

Agenda agrupada e cartões compactos: os próximos compromissos recebem cabeçalhos por data com dia da semana, dia, mês por extenso e ano. Aniversários, escalas e eventos do mesmo dia ficam juntos. A paginação continua contando 20 compromissos e repete o cabeçalho quando uma data continua na página seguinte; a impressão mantém todos os grupos. Componente compartilhado CompactCard reproduz o cartão do início: data abreviada à esquerda, título e uma linha de informação, seta para expandir. Eventos mantêm categoria, vagas, detalhes e inscrições ao expandir; escalas mantêm funções, estado e acesso às telas originais. Nomes/textos completos aparecem ao expandir. Início reutiliza o mesmo componente para o próximo evento; comunicados usam ícone, título e prévia de uma linha, expandindo o texto completo no próprio cartão. Nenhum conteúdo ou ação foi removido, e não há alteração de consultas, rotas, esquema ou permissões.

Verificação: build, lint, tipos, 14 testes de módulos/calendário e quatro roteiros de navegador aprovados (Agenda, compromissos pessoais, navegação geral e interação/paginação). Cobertos grupos com vários tipos, continuação de data na segunda página, detalhes e repertório, comunicados longos com expansão/recolhimento, estados vazios, impressão completa e 320/390/575/1440 px.

Revisão completa do Louvor documentada em REVISAO_LOUVOR.md: biblioteca, leitura, edição de escalas e repertórios, calendário, ensaios, sala, histórico, equipe e configurações. Referência: código local do Louvor original. Mantidas fontes, permissões, rotas, tabelas e gravações existentes; ajustes funcionais limitados a busca/filtros de apresentação, acessibilidade, feedback e datas de Brasília.
