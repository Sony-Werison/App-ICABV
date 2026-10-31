param([switch]$Build)
$ErrorActionPreference='Stop'
$sourceRoot=$PSScriptRoot
$runtimeRoot=Join-Path $env:USERPROFILE 'apps\App Igreja\.local-backups\comunidade-validation'
if ([IO.Path]::GetFullPath($runtimeRoot) -eq [IO.Path]::GetFullPath($sourceRoot)) { throw 'A cópia de execução deve ficar fora da pasta sincronizada.' }
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
$folders=@('app','features','packages','backend','tests','public','db','lib','hooks','components','worker','vendor','examples','scripts')
foreach($folder in $folders){
 $origin=Join-Path $sourceRoot $folder
 if(Test-Path -LiteralPath $origin){
  & robocopy $origin (Join-Path $runtimeRoot $folder) /E /R:0 /W:0 /NFL /NDL /NJH /NJS /NP /XD .temp | Out-Null
  if($LASTEXITCODE -ge 8){throw "Não foi possível copiar $folder. Disponibilize os arquivos do projeto no OneDrive."}
 }
}
$lock=Join-Path $runtimeRoot 'package-lock.json'
$before=if(Test-Path -LiteralPath $lock){(Get-FileHash -LiteralPath $lock).Hash}else{''}
foreach($file in @('package.json','package-lock.json','tsconfig.json','vite.config.ts','next.config.ts','postcss.config.mjs','eslint.config.mjs','cloudflare-env.d.ts','.npmrc','.env.local')){
 $origin=Join-Path $sourceRoot $file
 if(Test-Path -LiteralPath $origin){Copy-Item -LiteralPath $origin -Destination (Join-Path $runtimeRoot $file) -Force}
}
New-Item -ItemType Directory -Path (Join-Path $runtimeRoot '.openai') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot '.openai\hosting.json') -Destination (Join-Path $runtimeRoot '.openai\hosting.json') -Force
Push-Location $runtimeRoot
try {
 $env:SITES_EXECUTION_PROFILE='portable'
 if($before -ne (Get-FileHash -LiteralPath $lock).Hash -or -not(Test-Path 'node_modules/vinext/dist/cli.js')){ & npm ci; if($LASTEXITCODE){throw 'Falha ao instalar dependências.'} }
 if($Build){ & npm run build }else{Write-Host 'ICABV: http://localhost:5173/app'; & npm run dev}
 if($LASTEXITCODE){throw 'A execução do ICABV terminou com erro.'}
}finally{Pop-Location}
