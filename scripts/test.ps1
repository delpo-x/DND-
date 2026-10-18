<#
.SYNOPSIS  Esegue tutti i test automatici e salva il risultato reale in test-results.txt.
#>
[CmdletBinding()]
param()
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "Node.js non trovato." -ForegroundColor Red; exit 1 }
$log = Join-Path $root 'test-results.txt'
"Eseguito il $(Get-Date -Format 's') con Node $(& node --version)" | Out-File $log -Encoding utf8
# Tee-Object in Windows PowerShell 5.1 scrive UTF-16: si accoda riga per riga in UTF-8 per avere un log leggibile.
& node --test tests/*.test.js 2>&1 | ForEach-Object { $line = "$_"; $line; $line | Out-File $log -Append -Encoding utf8 }
$code = $LASTEXITCODE
if ($code -eq 0) { Write-Host "`nTUTTI I TEST SUPERATI (log: test-results.txt)" -ForegroundColor Green }
else { Write-Host "`nTEST FALLITI (log: test-results.txt)" -ForegroundColor Red }
exit $code
