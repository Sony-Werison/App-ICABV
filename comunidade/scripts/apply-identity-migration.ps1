param([switch]$Apply, [ValidateSet('202610220026','202610220027')][string]$Version='202610220026')
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



$endpoint="https://api.supabase.com/v1/projects/$projectRef/database/query"
function Invoke-IdentitySql([string]$sql) {
 Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Post -ContentType 'application/json' -Body (@{query=$sql}|ConvertTo-Json -Compress)
}
try {
 $state=Invoke-IdentitySql "select exists(select 1 from supabase_migrations.schema_migrations where version='$Version') as applied;"
 if ($state.applied) { Write-Output 'A migração de vinculação já está aplicada.'; exit 0 }
 if (-not $Apply) { Write-Output 'Migração de vinculação pronta para aplicação.'; exit 0 }
 $migrationName=if($Version -eq '202610220026'){'identity_reconciliation'}else{'identity_placeholder_names'}
 $sql=[IO.File]::ReadAllText((Join-Path $PSScriptRoot "../backend/supabase/migrations/${Version}_${migrationName}.sql"))
 $escaped=$sql.Replace("'","''")
 $transaction="begin; $sql insert into supabase_migrations.schema_migrations(version,name,statements) values('$Version','$migrationName',array['$escaped']); commit;"
 $null=Invoke-IdentitySql $transaction
 $verified=Invoke-IdentitySql "select to_regprocedure('public.review_identity(uuid,uuid,text,text,text,jsonb)') is not null as applied,(select count(*) from public.persons where merged_into is not null) as merged_records;"
 $verified|ConvertTo-Json -Compress
} finally { $headers.Clear(); $supabaseSessionToken=$null }
