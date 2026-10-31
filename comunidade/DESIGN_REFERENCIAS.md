# Direção visual — Tribus e BeChurch

Atualização em 22/10/2026, conforme a revisão solicitada pelo responsável.

A única identidade aproveitada do projeto App Igreja é o logotipo ICABV e sua paleta: vermelho #991B1B, branco, cinzas e preto. Os layouts da interface importada foram substituídos. Funcionalidades e permissões de backend foram preservadas.

## Referências visuais observadas

- [Tribus](https://www.tribusapp.com/): tela pública do app da igreja, com nome institucional em destaque, programação em cartões horizontais, acessos compactos e navegação inferior. Referências acessadas diretamente nas imagens públicas do site, sem login.
- [BeChurch](https://sistemabechurch.com.br/): imagens públicas do aplicativo e do painel. A gestão usa navegação lateral persistente, cartões de indicadores, áreas de trabalho e listagens organizadas. O app fornece a referência complementar para separar conteúdo, participação e serviços.

Não houve acesso autenticado às interfaces desses produtos. As referências estáticas dos APKs disponíveis não foram tratadas como evidência de layout. Imagens, marcas, publicidade e conteúdo institucional dos produtos de referência não foram incluídos no app ICABV.

## Aplicação

- Usuário: cabeçalho compacto com identidade ICABV; nome completo da igreja; programação real publicada; quatro acessos principais; escalas/família; comunicados; menu com todas as funções disponíveis.
- Gestão: navegação lateral no desktop e navegação horizontal no celular; resumo do diretório e da programação; módulos organizados por rotina; acesso aos cadastros, permissões, grupos e equipes.
- Registros administrativos: navegação escura, cartões neutros, destaque vermelho, tabelas e formulários no mesmo padrão. As operações e a exportação CSV existentes continuam disponíveis.
- Os estados vazio, erro e carregamento usam os mesmos componentes. Não se inventam indicadores ou programações em contas reais. Contagens de eventos e grupos identificam o escopo da primeira página; pessoas usa a contagem exata autorizada pelo backend.

A conta indicada pelo responsável recebeu o papel de administrador após conferência do e-mail confirmado e registro de auditoria. Não existe autoatribuição de administrador pelo formulário de cadastro.

A interface está disponível na prévia local em `/app` e `/gestao`. A demonstração continua separada em `/demo` e não é necessária para testar a conta real. Nenhuma versão hospedada foi publicada neste trabalho local.
