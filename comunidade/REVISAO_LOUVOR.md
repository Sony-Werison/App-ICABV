# Revisão do Louvor — 23/10/2026

Referência consultada: fontes locais do aplicativo original em `Louvor ICABV/src/components`, especialmente biblioteca musical, leitor de cifras, visualizador de repertório e navegação. Foram aproveitadas ideias de busca por letra, filtros rápidos, indicação do tom e leitura concentrada. Login, credenciais e bancos da origem não foram alterados.

## Melhorias por área

- **Biblioteca:** linhas compactas com tom, nome e artista; abertura da música pela própria linha; edição e arquivamento em menu identificado por música. Busca sem acentos inclui trechos da letra. Um único painel de filtros reúne Todas/Novas/Com cifra, categoria e ordenação; contagem e limpeza dos filtros. Cadastro/edição em janela com validação e campos opcionais preservados.
- **Leitura:** tela inteira com Escape, contenção e retorno do foco. Alternância letra/cifra, tom atual, transposição, tamanho da fonte, rolagem e velocidade. Arquivos e impressão em seção secundária. BPM, metrônomo e YouTube removidos da interface e do cadastro de músicas; dados antigos preservados para compatibilidade. Impressão da cifra oculta a biblioteca de fundo. Leituras da sala ao vivo continuam seguindo o controle remoto.
- **Escalas:** mantida a tabela mensal compacta solicitada anteriormente. Editor e repertório em janelas próprias; seleção de pessoas por caixas de seleção, agrupadas por função, substitui o controle múltiplo difícil de usar no celular. Editor de repertório com busca por título/artista, contagem, orientação inicial e setas identificadas. Mesmos campos, critérios de elegibilidade e operações de salvamento.
- **Calendário mensal:** tabela e geração/revisão/exportação permanecem. Filtro mensal passa a usar exclusivamente a data de Brasília, evitando a inclusão indevida do mês UTC vizinho.
- **Ensaios:** composição recolhida até ser solicitada, edição abre o formulário, listas paginadas e repertórios recolhidos com contagem. Estado vazio explica como começar. Dados continuam pessoais.
- **Sala ao vivo:** explicação curta, cultos recentes primeiro, estado de conexão da sala e indicação de quem conduz ou acompanha. Mantida a sincronização a cada dois segundos e a autorização da gestão/abertura escalada.
- **Histórico:** busca por música/artista e lista de cultos concluídos recolhida. Períodos usam Brasília de modo consistente. Contagens atuais e legadas e exportação completa permanecem separadas.
- **Equipe:** busca por nome/função, filtro de ativos/inativos, identificação por iniciais e formulário de vínculo recolhido. Ações de ativação e vínculo mantidas.
- **Configurações:** importação de repertório, importação histórica e responsáveis agrupados em painéis distintos. Edição em lote, prévias, correspondência explícita de pessoas e exportação preservadas.

## Decisões e limites

Mantidos o fundo `#191919`, o vermelho do logo, a navegação e as rotas atuais. Priorizadas ações de leitura e preparação; ações menos frequentes ficam em menus ou painéis. Novas peças visuais têm estilos restritos ao Louvor. Não foram criadas tabelas, migrations, permissões, endpoints ou novos formatos de dados. As chamadas de gravação e o transporte offline existentes foram conservados. Falhas de salvamento aparecem também dentro das janelas de edição.

## Verificação e revisão manual

Roteiro novo: `npm run test:worship`, com Supabase inteiramente simulado e gravações isoladas. Cobre oito áreas, busca por letra, filtros, edição, transposição/baixo invertido, letra, fonte, rolagem, ausência de BPM/YouTube, impressão, Escape/foco, seleção da equipe, ordem e salvamento do repertório, histórico, permissões e larguras de 320/390/575/1440 px. Roteiros existentes verificam edição/validação, escalas, acesso pela Agenda e operação offline. Auditoria real de leitura: `node scripts/ui-audit.mjs --preview-only --worship-only`, com gravações bloqueadas.

Resultado: build, tipos e lint aprovados; 14 testes de banco e 14 testes de módulos/calendário aprovados. Cinco roteiros de navegador passaram, incluindo recusa do servidor exibida dentro do editor, impressão isolada da cifra e confirmação de que o perfil comum não recebe ações de gestão. Conferidos 33 estados reais (oito áreas, leitura, cadastro de música e escala em desktop/390/320 px), sem transbordamento, controles menores que 44 px, erros de API/execução ou gravações.

Conferir a legibilidade das demais cifras extensas e PDFs usados pela equipe. Uma futura revisão pode acrescentar favoritos pessoais e anotações de ensaio; essas funções exigem definir persistência e permissões e ficaram fora desta alteração.


## Piloto com as cifras fornecidas — 23/10/2026

Convertida `C:/Users/perei/apps/App Igreja/Cifras/Ajuntamento.docx` para acordes entre colchetes, letra separada e observações de arranjo entre parênteses. Foram conferidos os 93 acordes na sequência original, incluindo baixos, introdução, interlúdio, solo e repetições. Arquivos entregues em `docs/cifras/`.

Aplicado exclusivamente ao cadastro ativo de Ajuntamento (`8de499a8-4735-46ab-9aea-d0b73c7fc677`): letra, cifra e tom C (antes N/A). A gravação compara os valores anteriores para evitar sobrescrever edição concorrente; resultado relido e conferido. Cópia completa anterior em `work/cifras/ajuntamento-antes.json` (local, ignorada pelo Git). O DOCX de origem foi preservado.

Verificação desta revisão: lint, tipos, build e roteiro `test:worship`; tela inteira em 320/390/575/1440 px, filtros no mesmo painel, impressão, Escape/foco, ausência dos campos removidos, e cifra real de Ajuntamento com transposição E7/G# → F7/A. Capturas em `test-results/worship/ajuntamento-mobile.png` e `ajuntamento-desktop.png`. O teste de navegador usa dados isolados; a aplicação do piloto no banco foi verificada separadamente.


## Importação em lote e navegação — 23/10/2026

Conferidos os 185 arquivos de Cifras. Importadas 154 versões em 103 músicas existentes; total de 859 músicas preservado. Cem músicas receberam acordes e três apenas letra. As 35 músicas com múltiplas versões, os 18 arquivos sem correspondência e as origens das versões estão registrados em `docs/cifras/importacao-2026-10-23.md`, JSON e CSV.

Versões pertencem ao mesmo registro musical, herdam suas permissões, podem ser selecionadas no leitor e renomeadas no editor. JSON de exportação/importação preserva as versões. A migração `202610230028_worship_chord_versions.sql` valida estrutura, conteúdo, nomes e IDs únicos. O piloto anterior de Ajuntamento foi conservado; fontes equivalentes foram reunidas na mesma versão.

Filtros refeitos conforme imagem e vídeo fornecidos: duas linhas sempre visíveis, em toda a largura. Primeira: Todas/Louvores/Hinos/Infantis com contagens. Segunda: Todas/Novas/Com Cifras. Escolhas combináveis; removida a ordenação. Letra legada copiada no campo Cifra deixou de ser tratada como cifra. A barra inferior recebeu a guia Louvor, mantendo os demais acessos; removida a bolinha da guia ativa.

Verificação: tipos, lint, build, 16 testes de módulos, teste de banco com validação/RLS/renomeação via transporte offline, roteiro geral do Louvor e revisão com o payload real das 859 músicas. O filtro Com Cifras retorna 101 músicas: 100 do lote e uma preexistente. Testados 320/390/575/1440 px, seleção e renomeação de versões, seis guias inferiores e ausência de bolinha. O ensaio da importação foi revertido antes da aplicação; todos os dados gravados foram relidos e conferidos.
