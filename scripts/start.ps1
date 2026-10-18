<#
.SYNOPSIS  Avvia D&D Campaign Studio (server locale su 127.0.0.1) e apre il browser.
.PARAMETER Port       Porta locale (default 4173).
.PARAMETER DataDir    Cartella dei dati (default .\storage).
.PARAMETER NoBrowser  Non aprire il browser.
#>
[CmdletBinding()]
param([int]$Port = 4173, [string]$DataDir, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "Node.js non trovato. Esegui prima .\scripts\install.ps1" -ForegroundColor Red; exit 1 }

# Variabili solo per questo processo (nessuna modifica globale)
$env:PORT = "$Port"
if ($DataDir) { $env:STUDIO_DATA = [System.IO.Path]::GetFullPath($DataDir) }

# Porta già occupata?
$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($busy) { Write-Host "La porta $Port è già in uso. Scegline un'altra: .\scripts\start.ps1 -Port 4200" -ForegroundColor Red; exit 1 }

$url = "http://127.0.0.1:$Port/"
if (-not $NoBrowser) {
  Start-Job -ScriptBlock { param($u) Start-Sleep -Seconds 2; Start-Process $u } -ArgumentList $url | Out-Null
}
Write-Host "Avvio su $url  (Ctrl+C per fermare)" -ForegroundColor Cyan
& node src/server.js
exit $LASTEXITCODE
