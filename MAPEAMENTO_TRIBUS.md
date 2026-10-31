# Mapa inicial — referência Tribus

Pesquisa: 21/10/2026.

## Estado da análise

O catálogo abaixo começou pelas funcionalidades anunciadas publicamente. Após o recebimento do pacote Android, foi realizada análise estática com REA 6.7.0 e inspeção complementar local. Consulte o [relatório funcional do APK](analise-tribus/RELATORIO_FUNCIONAL.md), que distingue referências detalhadas, referências isoladas e recursos empacotados. Não houve acesso autenticado nem validação dos fluxos em execução.

## Catálogo anunciado, por área

| Área | Recursos anunciados |
| --- | --- |
| Pessoas | Membros, visitantes, ministérios, grupos e batismos |
| Cuidado | Células, atendimento pastoral, missões e pedidos de oração |
| Serviço | Voluntários, escalas e organização de cultos |
| Infantil | Cadastro de crianças e check-in |
| Finanças | Gestão financeira, dízimos, ofertas, transações e assinaturas |
| Comunicação | Avisos, notícias, stories, lembretes e notificações |
| Conteúdo | Pregações, séries, podcasts, rádio, arquivos e fotos |
| Formação | Cursos, trilhas, leitura bíblica e quizzes |
| Eventos e comércio | Eventos com ingressos, cantina e loja |
| Administração | Permissões, formulários, listas dinâmicas e personalização |
| Presença digital | Aplicativo e site próprios |

Fonte: [catálogo oficial](https://www.tribusapp.com/funcionalidades). Esses itens são declarações comerciais, sem validação prática nesta pesquisa.

## Proposta para a igreja — decisões a validar

Esta seção é uma proposta de produto próprio, não uma descrição da implementação do Tribus.

### Primeira versão sugerida

1. Cadastro de pessoas, contatos e vínculos familiares.
2. Ministérios e escalas com confirmação de participação.
3. Agenda de eventos e inscrições.
4. Avisos publicados pela liderança.
5. Entradas, saídas e relatório mensal da tesouraria.
6. Acesso por função: administrador, secretaria, tesouraria, líder e membro.

### Próximas etapas sugeridas

- Células: reuniões, presença e acompanhamento de visitantes.
- Infantil: responsáveis autorizados e registro de entrada/saída.
- Discipulado: etapas, responsáveis e acompanhamento.
- Conteúdo: links de pregações e materiais.

### Perguntas de descoberta

- Quantas pessoas, congregações e usuários administrativos serão atendidos?
- Quais processos hoje dependem de planilhas ou WhatsApp?
- Quem pode consultar e alterar cada tipo de informação?
- Quais relatórios são necessários para a liderança e a tesouraria?
- A primeira versão precisa funcionar sem conexão?

## Obtenção do APK

Atualização: arquivo `Tribus-Gestão-de-Igrejas_1.0.0_apkcube.apks` fornecido pelo usuário. Identificado o pacote `com.tribusapp.dashboard`, versão `1.0.0`, código `108`. Extraídos o APK base, o complemento ARM64 e o complemento de português. Assinatura de origem não validada. As tentativas anteriores de download estão registradas abaixo como histórico.

Pacote alvo: `com.tribusapp.dashboard`.

- [Google Play](https://play.google.com/store/apps/details?id=com.tribusapp.dashboard): distribuição oficial identificada.
- [APKCombo](https://apkcombo.com/tribus-gestao-de-igrejas/com.tribusapp.dashboard/): listagem de terceiro localizada; download inacessível pelos meios tentados. Arquivo não obtido e assinatura não verificada.

Uma instalação da Google Play em Android ou emulador permitiria extrair o pacote instalado para análise. Se houver APKs divididos, deve-se preservar o conjunto. Alternativamente, pode-se obter o arquivo diretamente do desenvolvedor.

O APK pode revelar recursos do cliente, mas não recupera a implementação do servidor. Para validar fluxos e regras será necessária observação do produto em uso.
