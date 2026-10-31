# Aniversariantes e cestas básicas

## Aniversariantes

O início mostra os aniversariantes do mês, com destaque para hoje, no fuso de Brasília. Em **Menu → Aniversariantes**, é possível escolher outro mês e navegar pelas páginas.

A fonte é o cadastro compartilhado `person_contacts`. Para aparecer, a pessoa preenche a data de nascimento em **Perfil → Meus dados de contato** e marca **Compartilhar meu aniversário com a igreja**. A opção começa desativada, inclusive nos cadastros importados. Desmarcar e salvar retira a pessoa do informe. Apenas usuários autenticados podem consultar o informe, que devolve nome, dia e mês; não devolve idade, ano, telefone ou e-mail. A gestão pode manter os dados complementares pelo cadastro de pessoas.

## Cestas básicas

Em **Gestão → Cestas básicas**, administradores e secretaria podem:

- Criar campanhas com nome, orientações, local/horário de entrega e prazo.
- Cadastrar itens, embalagem/unidade e quantidade necessária por campanha.
- Acompanhar o que foi comprometido e o que já foi recebido.
- Conferir o total recebido de cada contribuinte, inclusive entregas parciais e correções.
- Encerrar ou reabrir a campanha e ajustar seu prazo.

Em **Início → Cestas básicas** ou **Menu → Cestas básicas**, a pessoa escolhe a campanha e informa a quantidade de cada item que levará. Pode assumir vários itens e atualizar seu compromisso, inclusive cancelar com quantidade zero quando nada foi recebido. A quantidade já recebida não pode ser cancelada pelo contribuinte.

As quantidades são absolutas: salvar 3 duas vezes mantém o compromisso de 3. O banco serializa as alterações por campanha para impedir que compromissos simultâneos ultrapassem a quantidade necessária. A gestão não pode reduzir a meta abaixo do total comprometido, nem mudar o nome/embalagem de um item com compromissos ativos. Cada campanha aceita até 200 itens. Campanhas encerradas ou com prazo passado bloqueiam mudanças de contribuição; recebimentos continuam disponíveis à gestão.

Todos veem os totais agregados e a própria contribuição. Apenas administradores e secretaria veem os nomes e conferem os recebimentos. As famílias beneficiadas não são identificadas nesta seção. Nenhuma campanha ou contribuição fictícia é inserida no banco real; os exemplos existem somente em `/demo`, no ambiente de desenvolvimento.

## Banco e verificação

A migration aditiva `backend/supabase/migrations/202610220019_community_care.sql` foi aplicada em 22/10/2026 ao Supabase de homologação `ynkfmuseiancpnyloraf` e sincronizada ao histórico do backend compartilhado em App Igreja. A migration 18, de reconciliação de importações, é independente e não foi aplicada nesta tarefa. Não houve importação, remoção de dados, atribuição de papéis ou publicação de uma nova versão hospedada.

Verificações:

- `npm run test:db`: inclui compartilhamento/retirada do aniversário, privacidade, RLS, compromissos de vários itens, repetição idempotente, limite total, cancelamento, prazo, encerramento e conferência de recebimentos.
- `npm run test:modules`, `npm run lint`, verificação de tipos e compilação de produção.
- Com o servidor de desenvolvimento ativo: `npm run test:care`, `npm run test:browser` e `node scripts/signup-demo-smoke.mjs`. Os novos testes usam dados fictícios e não fazem chamadas ao Supabase real.

Os artefatos de navegador ficam em `test-results/`, ignorado pelo Git. Para outro banco, aplicar a migration 19 depois da 17 antes de disponibilizar as novas telas.
