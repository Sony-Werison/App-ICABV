$ErrorActionPreference='Stop'
$projectRef='ynkfmuseiancpnyloraf'
# Read ONLY the Supabase CLI profile credential, using its documented keyring target.
# No credential enumeration, token output, persistence or command-line token arguments.
if (-not ('IcabvSupabaseCredential' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class IcabvSupabaseCredential {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Credential {
        public uint Flags; public uint Type; public string TargetName; public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint BlobSize; public IntPtr Blob; public uint Persist; public uint AttributeCount;
        public IntPtr Attributes; public string TargetAlias; public string UserName;
    }
    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
    [DllImport("advapi32.dll")] private static extern void CredFree(IntPtr credential);
    public static string Read() {
        IntPtr pointer;
        if (!CredRead("Supabase CLI:supabase", 1, 0, out pointer))
            throw new InvalidOperationException("Sessao Supabase CLI nao encontrada.");
        try {
            var item = (Credential)Marshal.PtrToStructure(pointer, typeof(Credential));
            var bytes = new byte[item.BlobSize];
            Marshal.Copy(item.Blob, bytes, 0, bytes.Length);
            try { return Encoding.UTF8.GetString(bytes); }
            finally { Array.Clear(bytes, 0, bytes.Length); }
        } finally { CredFree(pointer); }
    }
}
'@
}
$supabaseSessionToken = [IcabvSupabaseCredential]::Read()
if ($supabaseSessionToken -notmatch '^sbp_(oauth_)?[a-f0-9]{40}$') { throw 'Formato de sessao CLI nao reconhecido.' }
$headers = @{ Authorization = "Bearer $supabaseSessionToken" }

$endpoint="https://api.supabase.com/v1/projects/$projectRef/config/auth"
try {
 try {$before=Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Get} catch {throw 'Não foi possível consultar a configuração de autenticação.'}
 $redirects=@($before.uri_allow_list -split ',' | Where-Object {$_})
 $redirects+=@('http://localhost:5173/auth/callback','http://localhost:5173/auth/callback?next=/reset-password','http://127.0.0.1:5173/auth/callback','http://127.0.0.1:5173/auth/callback?next=/reset-password')
 $patch=@{disable_signup=$false;mailer_autoconfirm=$false;uri_allow_list=(($redirects | Select-Object -Unique)-join ',')}
 try {$null=Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Patch -ContentType 'application/json' -Body ($patch|ConvertTo-Json -Compress)}catch{throw 'Não foi possível habilitar o cadastro. Conferir estado remoto antes de repetir.'}
 try {$after=Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Get}catch{throw 'Não foi possível verificar o estado após a alteração.'}
 if($after.disable_signup -or $after.mailer_autoconfirm -or -not $after.external_email_enabled){throw 'A configuração de cadastro por e-mail não corresponde ao esperado.'}
 foreach($field in $patch.Keys){if(($after.$field|ConvertTo-Json -Compress)-ne($patch[$field]|ConvertTo-Json -Compress)){throw "Falha na verificação do campo $field"}}
 [ordered]@{project_ref=$projectRef;signup_enabled=(-not $after.disable_signup);email_confirmation_required=(-not $after.mailer_autoconfirm);email_provider_enabled=$after.external_email_enabled;local_callback_enabled=($after.uri_allow_list -like '*http://localhost:5173/auth/callback*')} | ConvertTo-Json
}finally{$headers.Clear();$supabaseSessionToken=$null;$before=$null;$after=$null}
