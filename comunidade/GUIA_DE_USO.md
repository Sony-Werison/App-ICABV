> Guia da versão anterior com D1. Para a versão atual com Supabase, consulte [INTEGRACAO_ICABV.md](INTEGRACAO_ICABV.md).

# Comunidade: app da igreja e gestão web

## Dois acessos, a mesma igreja

- **App:** abra `/app` no celular. Agenda, avisos publicados, perfil, escalas pessoais e a área **Explorar**.
- **Gestão:** abra `/gestao` no computador. Os menus e as operações disponíveis dependem do perfil.

Os dados já cadastrados pelo proprietário permanecem associados à igreja. As contas convidadas usam esse mesmo espaço, conforme suas permissões.

## Instalar o app no celular

1. Abra o endereço do app e entre com sua conta ChatGPT.
2. No Android, use **Instalar** ou a opção de instalação no menu do navegador.
3. No iPhone, abra no Safari e use **Compartilhar → Adicionar à Tela de Início**.

É um PWA: não exige download na Play Store ou App Store. Precisa de internet para consultar e atualizar os dados. A tela sem conexão não armazena cadastros, finanças ou escalas no cache do dispositivo.

## Convidar uma pessoa

1. Entre na gestão como administrador e abra **Equipe e acessos → Criar convite**.
2. Informe o e-mail da conta ChatGPT da pessoa e escolha seu perfil.
3. Para líder, informe o ministério. Para membro, vincule obrigatoriamente seu cadastro. Outros perfis também precisam desse vínculo para ver suas escalas pessoais.
4. Como a hospedagem está privada, libere o mesmo e-mail no compartilhamento do Site. Essa autorização é adicional ao perfil dentro do sistema.
5. Copie o link gerado e compartilhe com a pessoa. Nenhum e-mail é enviado automaticamente pelo sistema.
6. A pessoa entra com a conta convidada e aceita. O link é de uso único, vale por sete dias e pode ser revogado antes da aceitação.

O link completo aparece apenas quando é criado. Criar outro convite para o mesmo e-mail revoga os anteriores ainda pendentes.

## Perfis

| Perfil | Pode fazer |
| --- | --- |
| Administrador | Gerenciar todos os módulos, convites e acessos |
| Secretaria | Gerenciar membros, eventos, avisos, conteúdos, células e acompanhamento privado de orações; consultar as escalas |
| Tesouraria | Gerenciar as finanças; consultar eventos e avisos publicados |
| Líder de ministério | Consultar nomes e situações da própria equipe; gerenciar somente as escalas do seu ministério; consultar eventos e avisos publicados |
| Membro | Consultar agenda, avisos publicados e suas próprias escalas; confirmar presença ou informar indisponibilidade |

Líderes não recebem telefone, e-mail, nascimento ou observações particulares dos cadastros. O app mobile não recebe dados financeiros, mesmo quando aberto por administrador ou tesoureiro.

## Vincular e confirmar escalas

O cadastro da pessoa precisa estar vinculado à conta na equipe. Para o administrador, use **Vincular meu cadastro**. Para os demais, use **Alterar acesso**.

No app, abra **Escalas**, confira data, horário, função e evento e toque em **Confirmar presença** ou **Não poderei ir**. A pessoa só pode responder por si; mudanças na composição da escala continuam na gestão.

## Publicar avisos

Administrador e secretaria usam **Avisos → Criar aviso**. Avisos em rascunho ficam na gestão; somente os publicados aparecem no app.

## Alterar ou suspender acessos

O administrador usa **Equipe e acessos → Alterar acesso** para mudar perfil, ministério, cadastro vinculado ou situação. Uma suspensão bloqueia as próximas consultas e alterações no servidor. O proprietário não pode ser rebaixado ou suspenso por essa tela.

A remoção da liberação no compartilhamento do Site é uma operação separada da suspensão dentro do sistema.

## Devocionais, pregações e estudos

Na gestão, administrador e secretaria usam **Conteúdos → Novo conteúdo**. Escolha Devocional, Pregação, Estudo ou Culto ao vivo, escreva a reflexão ou descrição e informe autoria, referência bíblica e um link HTTPS, quando houver. Somente os itens publicados aparecem no app.

No app, use os atalhos da tela inicial ou **Explorar → Conteúdos**. Há busca e filtros por tipo. Toque em um item para ler; links de vídeo ou transmissão abrem no serviço escolhido pela igreja. O sistema não hospeda vídeos nesta versão.

## Células

Na gestão, use **Células → Cadastrar célula**. Informe nome, liderança, dia, horário, local ou região e descrição. O canal de contato é opcional; deve ser um link HTTPS autorizado pela igreja.

No app, **Explorar → Células** permite buscar por grupo, região ou dia. Quando houver um canal configurado, **Falar com a liderança** abre esse contato. Não há envio automático de mensagens, inscrição ou controle de presença nessa tela.

## Pedidos de oração privados

No app, **Explorar → Oração → Enviar pedido de oração**. A pessoa escreve o assunto e o pedido e acompanha o andamento em **Meus pedidos**. Pode marcar seu próprio pedido como concluído.

Na gestão, administrador e secretaria usam **Orações** para acompanhar os pedidos e atualizar a situação: Aberto, Em oração ou Concluído. Somente a pessoa que enviou, a secretaria e o administrador têm acesso ao conteúdo. Líderes de ministério e tesouraria não recebem pedidos de outras pessoas. Nenhum pedido é publicado em um mural comunitário.

Louvor e EBD estão no início, no menu e na lateral da gestão. No Louvor, cadastre a equipe usando as pessoas da igreja e depois organize músicas e escalas. Na EBD, crie a turma, vincule alunos/professores/responsáveis e prepare módulos/atividades. Os históricos antigos podem ser importados em Configurações, conferindo a correspondência de pessoas. Não é necessário preencher dados complementares nem aceitar documentos para participar. Veja INTEGRACAO_LOUVOR_EBD.md.
