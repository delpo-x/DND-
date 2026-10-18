# Registro dipendenze, licenze e fonti

## Dipendenze di runtime

| Componente | Versione | Licenza | Note |
|---|---|---|---|
| Node.js (`node:sqlite`, `node:http`, `node:test`, …) | ≥ 22.13 (testato 24.19) | MIT | Runtime installato dall'utente; non incluso |
| Pacchetti npm | **nessuno** | — | `package.json` non ha dipendenze; nessun codice di terzi è distribuito con il progetto |
| SQLite (dentro Node) | integrato | Pubblico dominio | |

## Dati e contenuti

| Dato | File | Fonte | Licenza | Obblighi |
|---|---|---|---|---|
| 331 creature (nome, tipo, taglia, GS, PE, CA, PF) | `data/srd52-creatures.json` | SRD 5.2 via Open5e API v2 (documento `srd-2024`), scaricato il 2026-10-17 con `tools/fetch-srd.mjs` | CC BY 4.0 © Wizards of the Coast LLC | Attribuzione: testo in `SRD_ATTRIBUTION` (`src/export.js`), inserito in ogni esportazione; progetto dichiarato non ufficiale |
| Tabelle di regole (budget PE per personaggio, PE per livello, scala delle trappole letali) | `src/rules.js` | System Reference Document 5.2 — © Wizards of the Coast LLC, verificate il 2026-10-17 sul PDF ufficiale (PE per livello anche su copia CC-BY) | CC BY 4.0 | Solo valori numerici, nessun testo copiato; CD di indizi/enigmi del generatore segnalate come non ufficiali in app |
| Testi del generatore (nomi, trame, descrizioni) | `src/content.js` | Originali, scritti per il progetto | Licenza del progetto (MIT) | Non contengono ambientazioni, mostri o testi proprietari |

Non è incluso alcun materiale proprietario non coperto da SRD (nessun testo dei manuali, nessuna ambientazione ufficiale).

## Licenza del progetto

MIT (file `LICENSE`, titolare generico "contributors": sostituirlo col proprio nome prima di distribuire).

## Audit dei repository di riferimento

Esaminati in sola lettura (estratti in una cartella temporanea). **Nessun codice è stato copiato**; sono serviti come riferimento di idee e di funzioni attese.

| Repository | Licenza dichiarata | Stato licenza | Uso fatto |
|---|---|---|---|
| `One-Shot` | AGPL-3.0 | Chiara, copyleft forte (obbligo di rilasciare sorgenti anche per uso in rete) | Solo studio del dominio (struttura di tabelle di incontro/dungeon). **Ricodifica da zero**; nessun codice, dato o testo riutilizzato, per non estendere l'AGPL a questo progetto. La tabella del budget PE è stata confrontata come controllo indipendente, non copiata |
| `questforge-ai` | MIT | Chiara; richiede conservare avviso di copyright se si riusa codice | Solo idee (flusso a missioni/PNG). Nessun codice riusato; attribuzione qui per correttezza |
| `dnd-campaign-suite` | MIT dichiarata nel README ma **nessun file LICENSE** nell'archivio | **Ambigua** | Trattato come "solo studio": nessun codice riusato finché l'autore non pubblica una licenza esplicita |

Esito dell'audit: i tre progetti sono basati su stack e obiettivi diversi (servizi cloud / chiavi API / dipendenze npm); riutilizzarne il codice avrebbe violato i vincoli di progetto (offline, nessun cloud, nessuna API a pagamento) o introdotto obblighi di licenza. Si è quindi scelta l'implementazione indipendente.

## Strumenti di sviluppo

Claude Code è stato usato come assistente di sviluppo; non è una dipendenza né è richiesto a runtime. Ollama (MIT) e i suoi modelli sono **facoltativi**, non inclusi nel progetto e non scaricati da `install.ps1` senza conferma esplicita. Su questa macchina, su richiesta dell'utente, sono stati installati Ollama 0.40.5 (winget, pacchetto ufficiale `Ollama.Ollama`, hash verificato da winget) e il modello `qwen2.5:3b` (1,9 GB); **il modello `qwen2.5:3b` è distribuito con la "Qwen RESEARCH LICENSE AGREEMENT"** (verificato con `ollama show qwen2.5:3b --license`): pensata per uso di ricerca/non commerciale. Va bene per uso personale; per uso commerciale scegli un modello con licenza permissiva (verificare caso per caso con `ollama show <modello> --license`) e cambialo nelle impostazioni IA. Alternativa verificata: `qwen2.5:1.5b` (986 MB) ha licenza **Apache-2.0** (`ollama show qwen2.5:1.5b --license`), installato su questa macchina. Ogni modello ha una propria licenza da leggere prima dell'uso.
