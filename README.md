# D&D Campaign Studio

Applicazione web locale e offline per preparare e gestire campagne di D&D 5e/2024. Tiene insieme trama, PNG, luoghi, fazioni, missioni con indizi, dungeon e regole SRD, controlla la coerenza della narrativa e include un tracker di combattimento. Funziona senza account, cloud, API a pagamento o dipendenze npm.

> Progetto non ufficiale, non affiliato né approvato da Wizards of the Coast. Usa materiale del SRD 5.2 (CC BY 4.0): vedi [docs/LICENZE.md](docs/LICENZE.md).

## Requisiti

- Windows 10/11
- Node.js 22.13 o superiore (testato con 24.19), da <https://nodejs.org> o con `winget install OpenJS.NodeJS.LTS`
- (Facoltativo) [Ollama](https://ollama.com) per la riscrittura di singoli campi di testo con un modello locale

## Avvio rapido

Da PowerShell, nella cartella del progetto:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1   # verifica ambiente ed esegue i test
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1     # avvia e apre http://127.0.0.1:4173/
```

`-ExecutionPolicy Bypass` vale solo per quel processo e non cambia le policy di sistema. Puoi anche avviare il server direttamente con `node src/server.js`, oppure con un doppio clic su `Avvia.bat`. Opzioni di `start.ps1`: `-Port 4200`, `-DataDir D:\dati-dnd`, `-NoBrowser`. Il server ascolta solo su 127.0.0.1.

## Primo utilizzo

1. Dalla Home scegli "Nuova campagna". Puoi crearne una vuota o generarne una completa, indicando seed, tono, pericolo, giocatori, livelli, sessioni e struttura narrativa (classica, indagine, sandbox, esplorazione). "Importa da file JSON" carica un'esportazione o la campagna di esempio.
2. La generazione deterministica produce regione, luoghi, 6 PNG con motivazioni e segreti, 3 fazioni, 6 missioni (3 principali e 3 secondarie), indizi (uno è una falsa pista), un mistero, eventi, oggetti, sessioni e 2 dungeon. Con lo stesso seed il risultato è identico.
3. "Coerenza narrativa" elenca errori, rischi e suggerimenti, ciascuno con gli elementi coinvolti e una correzione proposta.
4. Il menu laterale apre le sezioni da modificare: Mondo e luoghi, Missioni, PNG, Fazioni, Indizi, Misteri, Oggetti, Eventi e cronologia, Sessioni, Dungeon. I campi collegati si scelgono da un menu, quindi i riferimenti sono sempre validi.
5. "Relazioni" mostra il grafo dei collegamenti. "Cronologia modifiche" elenca ogni modifica e permette di tornare alla versione precedente.
6. "Esporta, stampa, backup" produce JSON, Markdown e HTML stampabile, e crea o ripristina copie verificate. "Regole e incontri" cerca nel database delle creature SRD e genera incontri entro il budget di PE. Il tracker di combattimento tiene iniziativa, PF, turni e condizioni, e il suo stato finisce in esportazioni e backup.
7. "Al tavolo" riunisce in una pagina la sessione da giocare: scene, PNG, indizi, eventi e un tracker compatto. Da lì si stampa anche la scheda della sessione.

## Dati e sicurezza dei dati

- Il database SQLite sta in `storage\studio.sqlite` e i backup in `storage\backups\`. Per salvare tutto basta copiare `storage\`.
- Ogni modifica crea una versione nello storico. Le eliminazioni passano dal cestino e sono bloccate se altri elementi dipendono da quello da eliminare.
- Per eliminare per sempre un elemento o una campagna devi digitare il nome esatto, e prima l'app crea un backup.
- Dopo la scrittura ogni backup viene riletto e controllato con checksum SHA-256. Un file manomesso o corrotto viene rifiutato senza toccare i dati, e il ripristino salva prima lo stato attuale.
- Le operazioni sono atomiche: se un generatore fallisce, non resta nulla di parziale.

## Modalità IA

| Modalità | Cosa fa | Requisiti |
|---|---|---|
| Deterministica (predefinita) | Genera campagne, PNG, eventi, luoghi, dungeon e rigenera alcuni campi (nomi, personalità, premesse…) da seed. Sempre disponibile, offline, riproducibile. | nessuno |
| Ollama (facoltativa) | Riscrive un singolo campo di testo di un elemento con un modello locale. Non crea né cambia entità, relazioni o stato. | Ollama in esecuzione + un modello |

L'indicatore in alto dice se la modalità scelta è disponibile. Se Ollama è spento, manca il modello, scade il tempo o la risposta arriva incompleta, troncata o vuota, l'app lo segnala e il dato esistente resta com'era. Sono ammessi solo indirizzi locali (`ALLOW_REMOTE_OLLAMA=1` per cambiare). I limiti di memoria si regolano con `numCtx` e `numPredict`.

Per installare Ollama e un modello piccolo (facoltativo) lo script controlla lo spazio e chiede conferma prima di scaricare:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1 -InstallOllama -PullModel qwen2.5:3b
```

Poi clicca l'indicatore "IA" in alto, apri le impostazioni e scegli Ollama.

## Test

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test.ps1     # oppure: npm test
```

Il risultato reale resta in `test-results.txt`. I test dell'interfaccia usano Edge/Chrome headless se presenti (altrimenti vengono saltati e segnalati). Stato attuale e copertura: [docs/FUNZIONI.md](docs/FUNZIONI.md).

## Esempi

La cartella [examples/](examples) contiene una campagna di esempio (`campagna-esempio.json`, importabile da *Home → Importa*), un backup (`backup-esempio.json`), l'esportazione Markdown/HTML, un dungeon (`.md` + `.svg`) e il rapporto di coerenza. Si rigenerano con `npm run seed-example`.

## Documentazione

- [docs/ARCHITETTURA.md](docs/ARCHITETTURA.md): struttura, schema dati, scelte tecniche
- [docs/FUNZIONI.md](docs/FUNZIONI.md): funzioni implementate, limiti, prossimi passi, risultati dei test
- [docs/LICENZE.md](docs/LICENZE.md): registro di dipendenze e licenze, audit dei tre repository di riferimento

## Problemi comuni

| Messaggio | Soluzione |
|---|---|
| `Porta 4173 già in uso` | `start.ps1 -Port 4200` |
| `Node.js non trovato` / versione vecchia | Installa Node.js LTS ≥ 22.13 |
| Indicatore IA rosso | Avvia Ollama oppure torna alla modalità deterministica |
| `Checksum non valido` all'importazione | Il file è stato modificato o corrotto: usa un'altra copia |
