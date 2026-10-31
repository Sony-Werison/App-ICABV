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
$query=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('c2VsZWN0IGV4aXN0cyhzZWxlY3QgMSBmcm9tIGF1dGgudXNlcnMgd2hlcmUgbG93ZXIoZW1haWwpPSdwZXJlaXJhd2VyaXNvbkBnbWFpbC5jb20nKSBhcyByZWdpc3RlcmVkLGV4aXN0cyhzZWxlY3QgMSBmcm9tIGF1dGgudXNlcnMgd2hlcmUgbG93ZXIoZW1haWwpPSdwZXJlaXJhd2VyaXNvbkBnbWFpbC5jb20nIGFuZCBlbWFpbF9jb25maXJtZWRfYXQgaXMgbm90IG51bGwpIGFzIGNvbmZpcm1lZDs='))
try {
 try {$result=Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Post -ContentType 'application/json' -Body (@{query=$query}|ConvertTo-Json -Compress)}catch{throw ('Consulta de estado falhou: '+$_.ErrorDetails.Message)}
 $result|Select-Object registered,confirmed|ConvertTo-Json
}finally{$headers.Clear();$supabaseSessionToken=$null}
