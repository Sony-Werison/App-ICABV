# Primeiro acesso e notificações push

## Contas para primeiro acesso

A migration `202610300038_existing_person_accounts.sql` preserva `persons.id` e os vínculos de papéis, e marca as novas contas para troca obrigatória da senha no primeiro acesso. O script `scripts/provision-existing-users.mjs` seleciona apenas pessoas sem `auth_user_id`. Ele gera e-mails em `@icabv.invalid`, senhas temporárias simples com pelo menos 12 caracteres e grava o CSV em uma pasta do AppData local do usuário, fora do workspace sincronizado pelo OneDrive.

O script precisa de `SUPABASE_SERVICE_ROLE_KEY` apenas no processo atual do PowerShell. Não salve essa chave em `.env.local`, no Git nem no chat. Após aplicar as migrations e conectar o Supabase CLI, forneça a chave pelo prompt mascarado e remova a variável assim que `npm run provision:people` terminar:

```powershell
$serviceKey = Read-Host 'Chave service_role do Supabase' -AsSecureString
$env:SUPABASE_SERVICE_ROLE_KEY = (New-Object System.Net.NetworkCredential('', $serviceKey)).Password
npm run provision:people
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
Remove-Variable serviceKey
```

## Push

O push é por dispositivo e exige que a pessoa autorize as notificações. O service worker mostra o alerta e abre a seção relacionada quando a pessoa toca nele. A migration `202610300039_push_subscriptions.sql` guarda os dispositivos inscritos; `202610300040_push_delivery.sql` agenda a leitura dos alertas não lidos e o envio pela Edge Function do Supabase a cada minuto.

Gere o par VAPID uma única vez. `VAPID_SUBJECT` deve ser um e-mail ou endereço HTTPS de contato real da igreja:

```powershell
$env:VAPID_SUBJECT = 'mailto:contato@dominio-da-igreja.org.br'
npm run generate:push-keys
Remove-Item Env:VAPID_SUBJECT
```

O comando grava os valores privados em `%LOCALAPPDATA%\ICABV\push-secrets\dispatch.env` e adiciona somente a chave pública a `.env.local`. Não troque o par enquanto houver dispositivos inscritos.

Com o Supabase CLI instalado e conectado (`supabase login`), aplique as migrations e publique o remetente:

```powershell
.\scripts\apply-icabv-migrations.ps1
supabase functions deploy dispatch-push --project-ref ynkfmuseiancpnyloraf
supabase secrets set --env-file "$env:LOCALAPPDATA\ICABV\push-secrets\dispatch.env" --project-ref ynkfmuseiancpnyloraf
```

Depois, atualize o app e escolha **Ativar push** no sino de notificações em cada dispositivo. O envio só começa depois que as migrations, as chaves VAPID e a Edge Function estiverem publicados.
