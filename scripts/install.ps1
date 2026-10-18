<#
.SYNOPSIS
  Verifica e prepara l'ambiente per D&D Campaign Studio. Idempotente: si può rilanciare senza effetti collaterali.
.DESCRIPTION
  - Controlla sistema operativo, RAM, spazio disco, GPU e versione di Node.js (richiesto >= 22.13, per node:sqlite).
  - Crea la cartella dati (storage) senza toccare dati esistenti.
  - Non installa nulla di globale e non modifica variabili d'ambiente di sistema né policy di sicurezza.
  - Ollama (IA locale facoltativa) viene installato SOLO con -InstallOllama (winget, pacchetto ufficiale Ollama.Ollama),
    e un modello viene scaricato SOLO con -PullModel dopo aver mostrato dimensione e spazio disponibile.
.PARAMETER InstallOllama  Installa Ollama con winget (chiede conferma, salvo -Yes).
.PARAMETER PullModel      Nome del modello da scaricare con Ollama (es. qwen2.5:3b).
.PARAMETER Yes            Non chiedere conferma.
.PARAMETER SkipTests      Non eseguire i test al termine.
#>
[CmdletBinding()]
param(
  [switch]$InstallOllama,
  [string]$PullModel,
  [switch]$Yes,
  [switch]$SkipTests
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$problems = @()
function Ok($m)   { Write-Host "[OK]    $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[AVVISO] $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "[ERRORE] $m" -ForegroundColor Red; $script:problems += $m }
function Confirm-Action($q) { if ($Yes) { return $true }; return ((Read-Host "$q [s/N]") -match '^(s|si|sì|y|yes)$') }

Write-Host "== D&D Campaign Studio - verifica ambiente ==" -ForegroundColor Cyan

# Sistema operativo
$os = Get-CimInstance Win32_OperatingSystem
Ok "Sistema: $($os.Caption) $($os.Version)"

# RAM
$ramGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
if ($ramGb -lt 4) { Warn "RAM $ramGb GB: sufficiente per l'app, non per modelli IA locali." } else { Ok "RAM: $ramGb GB" }

# Disco
$drive = (Get-Item $root).PSDrive
$freeGb = [math]::Round($drive.Free / 1GB, 1)
if ($freeGb -lt 1) { Bad "Spazio libero su $($drive.Name): $freeGb GB (servono almeno 1 GB)." } else { Ok "Spazio libero su $($drive.Name): $freeGb GB" }

# GPU (informativo)
try {
  $gpus = Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name
  Ok "GPU: $($gpus -join '; ')"
} catch { Warn "GPU non rilevata (informazione non essenziale)." }

# Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Bad "Node.js non trovato. Installa Node.js LTS (>= 22.13) da https://nodejs.org oppure: winget install OpenJS.NodeJS.LTS"
} else {
  $v = (& node --version).TrimStart('v')
  $ver = [version]($v -replace '^(\d+\.\d+\.\d+).*', '$1')
  if ($ver -lt [version]'22.13.0') { Bad "Node.js $v troppo vecchio: serve >= 22.13 (node:sqlite senza flag)." }
  else {
    Ok "Node.js $v"
    # Verifica reale di node:sqlite, senza presumere che funzioni
    $probe = & node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(':memory:');d.exec('create table t(a)');console.log('sqlite-ok')" 2>&1 | Out-String
    if ($probe -match 'sqlite-ok') { Ok "node:sqlite funzionante" } else { Bad "node:sqlite non utilizzabile: $probe" }
  }
}

# Dati e dipendenze
New-Item -ItemType Directory -Force -Path (Join-Path $root 'storage') | Out-Null
Ok "Cartella dati: storage\ (i dati esistenti non vengono toccati)"
Ok "Dipendenze npm: nessuna (l'app usa solo moduli integrati di Node.js)"
if (-not (Test-Path (Join-Path $root 'data\srd52-creatures.json'))) { Bad "Manca data\srd52-creatures.json (database creature SRD)." } else { Ok "Dati SRD 5.2 presenti" }

# Ollama (facoltativo)
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if ($InstallOllama -and -not $ollama) {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) { Bad "winget non disponibile: installa Ollama manualmente da https://ollama.com/download" }
  elseif (Confirm-Action "Installare Ollama (IA locale facoltativa) con winget (Ollama.Ollama)?") {
    & winget install --id Ollama.Ollama -e --source winget
    if ($LASTEXITCODE -ne 0) { Bad "Installazione di Ollama non riuscita (codice $LASTEXITCODE)." }
    else { Ok "Ollama installato. Apri un nuovo terminale se 'ollama' non viene trovato." }
    $ollama = Get-Command ollama -ErrorAction SilentlyContinue
  } else { Warn "Installazione di Ollama saltata." }
}
if ($ollama) { Ok "Ollama: $((& ollama --version 2>&1 | Out-String).Trim())" }
else { Warn "Ollama non installato: l'app funziona comunque in modalità deterministica (nessuna IA)." }

if ($PullModel) {
  if (-not $ollama) { Bad "-PullModel richiede Ollama installato." }
  else {
    # Dimensioni indicative (GB) dei modelli piccoli noti; per gli altri si chiede conferma esplicita.
    $sizes = @{ 'qwen2.5:3b' = 1.9; 'qwen2.5:1.5b' = 1.0; 'llama3.2:3b' = 2.0; 'llama3.2:1b' = 1.3; 'qwen2.5:7b' = 4.7; 'llama3.1:8b' = 4.9 }
    $need = $sizes[$PullModel]
    if ($null -eq $need) { Warn "Dimensione di '$PullModel' sconosciuta: verifica su https://ollama.com/library prima di procedere." }
    else {
      Write-Host "Modello ${PullModel}: circa $need GB. Spazio libero: $freeGb GB."
      if ($freeGb -lt ($need * 2)) { Bad "Spazio insufficiente per scaricare $PullModel (servono almeno $($need*2) GB liberi)."; $PullModel = $null }
    }
    if ($PullModel -and (Confirm-Action "Scaricare il modello $PullModel ora?")) {
      & ollama pull $PullModel
      if ($LASTEXITCODE -ne 0) { Bad "Download del modello non riuscito (codice $LASTEXITCODE)." } else { Ok "Modello $PullModel scaricato." }
    }
  }
}

# Test
if (-not $SkipTests -and $problems.Count -eq 0) {
  Write-Host "`nEseguo i test..." -ForegroundColor Cyan
  & node --test tests/*.test.js
  if ($LASTEXITCODE -ne 0) { Bad "Alcuni test sono falliti (vedi sopra)." } else { Ok "Test superati" }
}

Write-Host ""
if ($problems.Count) {
  Write-Host "Problemi da risolvere:" -ForegroundColor Red
  $problems | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
  exit 1
}
Write-Host "Ambiente pronto. Avvia l'app con: .\scripts\start.ps1" -ForegroundColor Green
