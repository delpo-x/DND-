# D&D Campaign Studio

Applicazione web **locale e offline** per preparare e gestire campagne di D&D 5e/2024: narrativa, PNG, luoghi, fazioni, missioni con indizi verificabili, dungeon, regole SRD e un **controllo di coerenza narrativa** e un tracker di combattimento. Nessun account, nessun cloud, nessuna API a pagamento, nessuna dipendenza npm.

> Progetto non ufficiale, non affiliato né approvato da Wizards of the Coast. Usa materiale del SRD 5.2 (CC BY 4.0): vedi [docs/LICENZE.md](docs/LICENZE.md).

## Requisiti

- Windows 10/11
- Node.js **22.13 o superiore** (testato con 24.19). Installazione: <https://nodejs.org> oppure `winget install OpenJS.NodeJS.LTS`
- (Facoltativo) [Ollama](https://ollama.com) per la riscrittura di singoli campi di testo con un modello locale

## Avvio rapido

Da PowerShell, nella cartella del progetto:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1   # verifica ambiente ed esegue i test
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1     # avvia e apre http://127.0.0.1:4173/
```

`-ExecutionPolicy Bypass` vale solo per quel processo: non modifica alcuna policy di sistema. In alternativa, senza script: `node src/server.js`.

In alternativa, doppio clic su `Avvia.bat`. Opzioni utili: `start.ps1 -Port 4200`, `-DataDir D:\dati-dnd`, `-NoBrowser`. Il server ascolta **solo su 127.0.0.1**.

## Primo utilizzo

1. Dalla *Home* scegli **＋ Nuova campagna**: nella finestra puoi creare una campagna vuota oppure generarne una completa (seed, tono, pericolo, giocatori, livelli, sessioni). **Importa da file JSON…** carica un'esportazione o la campagna di esempio.
2. La generazione deterministica crea una campagna completa: regione, luoghi, 6 PNG con motivazioni e segreti, 3 fazioni, 6 missioni (3 principali + 3 secondarie), indizi (di cui una falsa pista), un mistero, eventi, oggetti, sessioni e 2 dungeon. Con lo stesso seed il risultato è identico.
3. Apri **Coerenza narrativa** per vedere errori, rischi e suggerimenti, ognuno con gli elementi coinvolti e una correzione proposta.
4. Modifica tutto dalle sezioni del menu laterale (Mondo e luoghi, Missioni, PNG, Fazioni, Indizi, Misteri, Oggetti, Eventi e cronologia, Sessioni, Dungeon). I campi collegati si scelgono da menu: i riferimenti sono sempre validati.
5. **Relazioni** mostra il grafo dei collegamenti; **Cronologia modifiche** ogni modifica con possibilità di ripristino della versione precedente.
6. **Esporta, stampa, backup** offre JSON, Markdown e HTML stampabile (anteprima di stampa dal browser) e crea/ripristina copie verificate. **Regole e incontri** cerca nel database creature SRD e genera incontri entro il budget di PE. **Tracker di combattimento** tiene iniziativa, PF, turni e condizioni durante la sessione (stato salvato e incluso in export/backup). **Al tavolo** riunisce in una pagina la sessione da giocare (scene, PNG, indizi, eventi, tracker compatto) con scheda stampabile.

## Dati e sicurezza dei dati

- Database SQLite in `storage\studio.sqlite`; backup in `storage\backups\`. Per salvare tutto basta copiare `storage\`.
- Ogni modifica crea una versione (storico). Le eliminazioni vanno prima nel **cestino** e sono bloccate se altri elementi dipendono dall'elemento.
- Eliminazione definitiva di un elemento o di una campagna: richiede di digitare il nome esatto e crea **prima** un backup automatico.
- I backup sono riletti e verificati (checksum SHA-256) subito dopo la scrittura; un file manomesso o corrotto viene rifiutato senza toccare i dati. Il ripristino crea prima un backup dello stato attuale.
- Se un generatore fallisce non viene salvato nulla di parziale (operazioni atomiche).

## Modalità IA

| Modalità | Cosa fa | Requisiti |
|---|---|---|
| **Deterministica** (predefinita) | Genera campagne, PNG, eventi, luoghi, dungeon e rigenera alcuni campi (nomi, personalità, premesse…) da seed. Sempre disponibile, offline, riproducibile. | nessuno |
| **Ollama** (facoltativa) | Riscrive un singolo campo di testo di un elemento con un modello locale. Non crea né cambia entità, relazioni o stato. | Ollama in esecuzione + un modello |

L'indicatore in alto mostra se la modalità scelta è disponibile. Con Ollama gestiti: servizio spento, modello mancante, timeout, risposta incompleta/troncata/vuota; in ogni caso **il dato esistente resta intatto**. Sono ammessi solo indirizzi locali (`ALLOW_REMOTE_OLLAMA=1` per cambiare). Limiti di memoria configurabili (`numCtx`, `numPredict`).

Installare Ollama e un modello piccolo (facoltativo, con controllo di spazio e conferma):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -InstallOllama -PullModel qwen2.5:3b
```

Nulla viene scaricato senza conferma. Poi clicca l'indicatore **IA** in alto per aprire le impostazioni e scegli *Ollama*.

## Test

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test.ps1     # oppure: npm test
```

Il risultato reale resta in `test-results.txt`. I test dell'interfaccia usano Edge/Chrome headless se presenti (altrimenti vengono saltati e segnalati). Stato attuale e copertura: [docs/FUNZIONI.md](docs/FUNZIONI.md).

## Esempi

La cartella [examples/](examples) contiene una campagna di esempio (`campagna-esempio.json`, importabile da *Home → Importa*), un backup (`backup-esempio.json`), l'esportazione Markdown/HTML, un dungeon (`.md` + `.svg`) e il rapporto di coerenza. Si rigenerano con `npm run seed-example`.

## Documentazione

- [docs/ARCHITETTURA.md](docs/ARCHITETTURA.md) — struttura, schema dati, scelte tecniche
- [docs/FUNZIONI.md](docs/FUNZIONI.md) — funzioni implementate, limiti, prossimi passi, risultati dei test
- [docs/LICENZE.md](docs/LICENZE.md) — registro dipendenze/licenze e audit dei tre repository di riferimento

## Problemi comuni

| Messaggio | Soluzione |
|---|---|
| `Porta 4173 già in uso` | `start.ps1 -Port 4200` |
| `Node.js non trovato` / versione vecchia | Installa Node.js LTS ≥ 22.13 |
| Indicatore IA rosso | Avvia Ollama oppure torna alla modalità deterministica |
| `Checksum non valido` all'importazione | Il file è stato modificato o corrotto: usa un'altra copia |
