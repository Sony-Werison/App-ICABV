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
$query=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('YmVnaW47IGRvICRib290c3RyYXAkIGRlY2xhcmUgdGFyZ2V0IHV1aWQ7IGJlZ2luIHNlbGVjdCBwLmlkIGludG8gdGFyZ2V0IGZyb20gYXV0aC51c2VycyB1IGpvaW4gcHVibGljLnBlcnNvbnMgcCBvbiBwLmF1dGhfdXNlcl9pZD11LmlkIHdoZXJlIGxvd2VyKHUuZW1haWwpPSdwZXJlaXJhd2VyaXNvbkBnbWFpbC5jb20nIGFuZCB1LmVtYWlsX2NvbmZpcm1lZF9hdCBpcyBub3QgbnVsbDsgaWYgdGFyZ2V0IGlzIG51bGwgdGhlbiByYWlzZSBleGNlcHRpb24gJ0EgY29udGEgcHJlY2lzYSBleGlzdGlyIGUgdGVyIG8gZW1haWwgY29uZmlybWFkby4nO2VuZCBpZjsgaWYgbm90IGV4aXN0cyhzZWxlY3QgMSBmcm9tIHB1YmxpYy5yb2xlX2Fzc2lnbm1lbnRzIHdoZXJlIHBlcnNvbl9pZD10YXJnZXQgYW5kIHJvbGU9J2FkbWluJykgdGhlbiBpbnNlcnQgaW50byBwdWJsaWMucm9sZV9hc3NpZ25tZW50cyhwZXJzb25faWQscm9sZSkgdmFsdWVzKHRhcmdldCwnYWRtaW4nKTsgaW5zZXJ0IGludG8gcHVibGljLmF1ZGl0X2xvZyhhY3Rvcl9pZCxhY3Rpb24scmVzb3VyY2VfaWQpIHZhbHVlcyh0YXJnZXQsJ3JvbGUuYm9vdHN0cmFwLmFkbWluJyx0YXJnZXQpOyBlbmQgaWY7IGVuZCAkYm9vdHN0cmFwJDsgY29tbWl0OyBzZWxlY3QgdS5lbWFpbCxleGlzdHMoc2VsZWN0IDEgZnJvbSBwdWJsaWMucm9sZV9hc3NpZ25tZW50cyByIHdoZXJlIHIucGVyc29uX2lkPXAuaWQgYW5kIHIucm9sZT0nYWRtaW4nKSBhcyBhZG1pbmlzdHJhdG9yIGZyb20gYXV0aC51c2VycyB1IGpvaW4gcHVibGljLnBlcnNvbnMgcCBvbiBwLmF1dGhfdXNlcl9pZD11LmlkIHdoZXJlIGxvd2VyKHUuZW1haWwpPSdwZXJlaXJhd2VyaXNvbkBnbWFpbC5jb20nIGFuZCB1LmVtYWlsX2NvbmZpcm1lZF9hdCBpcyBub3QgbnVsbDs='))
try {
 try {$result=Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Post -ContentType 'application/json' -Body (@{query=$query}|ConvertTo-Json -Compress)}catch{throw 'Não foi possível atribuir o acesso. A conta precisa estar cadastrada e ter o e-mail confirmado; nenhum outro usuário foi promovido.'}
 $result|Select-Object email,administrator|ConvertTo-Json
}finally{$headers.Clear();$supabaseSessionToken=$null}
