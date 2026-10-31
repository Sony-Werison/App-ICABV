# Uso offline e notificações

O fundo do tema escuro usa `#191919` no aplicativo e na gestão.

## Alterações sem conexão

Salvar uma alteração sem internet guarda a operação em IndexedDB, no navegador do dispositivo e na conta que a realizou. A interface informa **Guardado neste dispositivo. Será enviado quando a conexão voltar** e mostra a quantidade de alterações aguardando envio. A fila permanece após recarregar ou fechar a página.

Ao reconectar ou reabrir o aplicativo na mesma conta, as alterações são enviadas em ordem. A operação só sai da fila depois da confirmação do servidor. Um comprovante transacional por operação evita duplicação quando a resposta se perde ou outra aba tenta reenviar a mesma operação. Cadastros dependentes recebem os IDs definitivos antes do envio seguinte.

O transporte cobre os salvamentos de dados feitos pelo Supabase nas telas atuais: chamadas, avaliações, cadastros, repertórios, escalas, mensagens, inscrições, cestas e registros administrativos. As permissões são verificadas novamente no servidor. Uma pendência de outra conta não é enviada pela conta que entrou depois.

Em **Ver alterações**, é possível consultar o que aguarda envio, tentar sincronizar ou cancelar o envio de uma pendência. Erros de permissão, conflitos de versão e dados inválidos ficam guardados para revisão. Uma chamada da EBD compara os valores salvos no dispositivo com a chamada atual antes de sobrescrevê-la; se outro professor já a alterou, o app pede revisão. Cancelar uma operação da fila não desfaz uma alteração que o servidor já tenha recebido antes da queda de conexão.

As telas e os dados já abertos com internet ficam disponíveis offline. Uma tela ainda não carregada precisa da primeira conexão. O service worker guarda a estrutura e os arquivos estáticos do app; as respostas de dados são armazenadas separadamente por conta. A implementação limita o cache de leituras, sem descartar alterações pendentes para liberar espaço. Se não conseguir gravar uma alteração no dispositivo, informa falha em vez de confirmar um salvamento.

Login, cadastro, recuperação e alteração de senha continuam exigindo conexão: senhas e tokens não são incluídos na fila. O tempo mínimo de estudo e os prazos das atividades continuam sendo validados no servidor; uma atividade cujo início ainda não foi registrado pode precisar ser retomada online antes do envio. Apagar os dados do navegador também apaga o armazenamento local; alterações ainda pendentes não existem no servidor.

## Central de notificações

O sino no cabeçalho mostra o número de notificações não lidas. Cada aviso abre a área correspondente e pode ser marcado como lido. O estado de leitura fica associado à conta; consultas periódicas não recriam o mesmo aviso como novo. Mudanças relevantes no conteúdo ou na pendência geram uma nova versão do aviso.

São considerados:

- Comunicados publicados e não expirados dos últimos 90 dias.
- Eventos visíveis dos próximos 14 dias sem resposta de participação; lembretes de eventos em que a pessoa se inscreveu para os próximos sete dias.
- Escalas aguardando confirmação nos próximos 30 dias ou confirmadas para os próximos sete dias.
- Participação no Louvor nos próximos sete dias. Quem está na abertura/direção recebe uma pendência específica quando não há repertório.
- Encontros de grupos ativos da pessoa, sem resposta de participação, nos próximos sete dias.
- Apoio recebido nos próprios pedidos de oração.
- Itens de cesta básica comprometidos e ainda não recebidos, com entrega em até três dias.
- Respostas da EBD aguardando correção nas turmas em que a pessoa é professora, ou na gestão autorizada.

Os avisos são exibidos dentro do app, sem envio de e-mail, SMS ou push externo. Nenhuma permissão de notificação do navegador é solicitada. Avisos de outros usuários, pedidos privados e notas de alunos fora do escopo não são expostos.

## Banco e verificação

Migrations 23–25 aplicadas ao Supabase atual e sincronizadas ao backend compartilhado. Elas acrescentam comprovantes de sincronização, leituras de notificações e proteção de conflito nas chamadas, sem importar ou apagar cadastros.

Validação: testes de banco/RLS, fila persistente, repetição após resposta perdida, troca de conta, dependência de IDs, falha de armazenamento e conflitos. `npm run test:offline:browser` testa a versão de produção com dados fictícios: salva uma chamada sem internet, recarrega offline, confere a chamada preservada, reconecta e verifica um único envio. Também verifica o fundo escuro, o sino, a leitura de avisos e o acesso à escala de Louvor. Use `ICABV_TEST_URL` para apontar ao servidor de produção local; o ambiente de desenvolvimento do Vite inclui um cliente de recarga automática que não é apropriado para testar a reabertura offline.
