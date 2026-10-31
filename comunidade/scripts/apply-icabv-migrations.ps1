$ErrorActionPreference='Stop'
$projectRef='ynkfmuseiancpnyloraf'
if (-not ('IcabvSupabaseCredential' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class IcabvSupabaseCredential {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] private struct Credential { public uint Flags; public uint Type; public string TargetName; public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public uint BlobSize; public IntPtr Blob; public uint Persist; public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
 [DllImport("advapi32.dll",EntryPoint="CredReadW",CharSet=CharSet.Unicode,SetLastError=true)] private static extern bool CredRead(string target,uint type,uint flags,out IntPtr credential);
 [DllImport("advapi32.dll")] private static extern void CredFree(IntPtr credential);
 public static string Read(){IntPtr pointer;if(!CredRead("Supabase CLI:supabase",1,0,out pointer))throw new InvalidOperationException("Supabase CLI session is not connected. Run supabase login, then retry.");try{var item=(Credential)Marshal.PtrToStructure(pointer,typeof(Credential));var bytes=new byte[item.BlobSize];Marshal.Copy(item.Blob,bytes,0,bytes.Length);try{return Encoding.UTF8.GetString(bytes);}finally{Array.Clear(bytes,0,bytes.Length);}}finally{CredFree(pointer);}}
}
'@
}
$token=[IcabvSupabaseCredential]::Read()
if($token -notmatch '^sbp_(oauth_)?[a-f0-9]{40}$'){throw 'Supabase CLI session format is not recognized.'}
$headers=@{Authorization="Bearer $token"}
$endpoint="https://api.supabase.com/v1/projects/$projectRef/database/query"
function Invoke-DbSql([string]$sql){Invoke-RestMethod -Uri $endpoint -Headers $headers -Method Post -ContentType 'application/json' -Body (@{query=$sql}|ConvertTo-Json -Compress)}
try {
 $migrations=@(
  @{version='202610300036';name='visits'},
  @{version='202610300037';name='ebd_view_profiles'},
  @{version='202610300038';name='existing_person_accounts'},
  @{version='202610300039';name='push_subscriptions'},
  @{version='202610300040';name='push_delivery'},
  @{version='202610310041';name='fix_visit_availability_parameter_ambiguity'},
  @{version='202610310042';name='ebd_lesson_sessions'}
 )
 foreach($migration in $migrations){
  $state=Invoke-DbSql "select exists(select 1 from supabase_migrations.schema_migrations where version='$($migration.version)') as applied;"
  if($state.applied){Write-Output "$($migration.version) already applied.";continue}
  $path=Join-Path $PSScriptRoot "../backend/supabase/migrations/$($migration.version)_$($migration.name).sql"
  $sql=[IO.File]::ReadAllText($path)
  $escaped=$sql.Replace("'","''")
  $transaction="begin; $sql insert into supabase_migrations.schema_migrations(version,name,statements) values('$($migration.version)','$($migration.name)',array['$escaped']); notify pgrst,'reload schema'; commit;"
  $null=Invoke-DbSql $transaction
  Write-Output "$($migration.version) applied."
 }
 $verified=Invoke-DbSql "select to_regclass('public.visits') is not null as visits_table,to_regclass('public.visit_availability') is not null as availability_table,to_regclass('public.push_subscriptions') is not null as push_table,to_regclass('public.ebd_lesson_sessions') is not null as ebd_lesson_sessions_table,to_regprocedure('public.my_ebd_profiles()') is not null as ebd_profiles_rpc,to_regprocedure('public.save_visit_availability(text,smallint[],date[],integer,text)') is not null as visit_availability_rpc,to_regprocedure('public.pending_push_notifications(integer)') is not null as push_queue_rpc;"
 $verified|ConvertTo-Json -Compress
} finally {$headers.Clear();$token=$null}
