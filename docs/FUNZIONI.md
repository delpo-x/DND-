# Funzioni implementate, limiti e prossimi passi

Stato: versione 0.1.0. Questo documento distingue ciò che è **stato eseguito e verificato** da ciò che non lo è.

## Funzioni implementate

**Campagne** — creare, modificare, duplicare, archiviare, eliminare (nome esatto + backup automatico), importare/esportare (JSON, Markdown, HTML stampabile), backup/ripristino verificati, ricerca e filtri per elemento, cestino con ripristino.

**Generatore narrativo (deterministico)** — premessa e conflitto, atti/capitoli/sessioni, 3 missioni principali + 3 secondarie con obiettivo, prerequisiti, committente, luoghi, PNG, indizi richiesti, ostacoli, colpi di scena ed esiti con effetti; antagonista con piano; 3 fazioni; mistero con indizi veri, una falsa pista smentibile e segreti rivelabili; finali alternativi; eventi casuali e programmati; oggetti. **7 temi** (culto, intrigo, miniera, peste, fate, pirati, drago) × 6 toni, seed riproducibile. **4 scheletri narrativi** scelti alla creazione: *classica* (catena lineare), *indagine a nodi* (missioni aperte in qualsiasi ordine, indizi ridondanti: almeno tre strade per ogni conclusione), *sandbox a fronti* (l'antagonista avanza con tre fronti datati se il gruppo non interviene), *esplorazione* (luogo profondo bloccato e secondo dungeon). Tutte le combinazioni struttura × tema × 3/5/8/12 sessioni sono provate senza problemi di coerenza e con ogni missione assegnata a una sessione. Rigenerazione di singoli campi senza perdere il resto, con **"Annulla rigenerazione"** in un clic (ripristina la versione precedente; rifiutato con 409 se dopo la riscrittura c'è stata un'altra modifica).

**Al tavolo** — vista unica per la sessione da giocare (la prima non giocata, oppure scelta dall'elenco): missioni, scene e luoghi, PNG presenti con la posizione del giorno, indizi ottenibili (con "falsa pista" e "non ancora accessibile"), eventi della sessione e prossimi eventi, tracker compatto (PF ±, prossimo turno), pulsante "segna giocata". **Scheda di sessione** stampabile (HTML compatto) o in Markdown.

**PNG** — motivazioni, obiettivi, comportamenti, segreti, conoscenze con fonte, agenda per giorni, relazioni, stato aggiornabile (anche applicando eventi con effetti atomici).

**Mondo** — luoghi gerarchici con connessioni (giorni di viaggio) e accesso (pubblico/segreto/sbloccato da…), collegati a missioni, PNG, fazioni, indizi, eventi.

**Regole (modulo separato)** — 331 creature SRD 5.2 ricercabili; incontri entro budget di PE; trappole sulla scala SRD 5.2 delle trappole letali (livelli 1-4 CD 13 / 2d10, 5-10 CD 15 / 4d10, 11-16 CD 17 / 10d10, 17-20 CD 19 / 18d10); fonti con stato *verificato / non verificato* mostrato in app.

**Tracker di combattimento** — iniziativa, PF, CA, condizioni, round e turno; danno/cura, ordinamento, rimozione, ripristino PF; aggiunta da creature SRD o PNG della campagna. I mostri a 0 PF vengono saltati; i **PG a 0 PF mantengono il turno** (tiri contro la morte, etichetta "a terra") finché non hanno la condizione "morto"/"morta". Rimuovere chi è di turno passa al successivo (se era l'ultimo, nuovo round dal primo). Lo stato ha una revisione (`rev`): un salvataggio da una scheda non aggiornata riceve 409 e l'interfaccia ricarica lo stato. Stato salvato per campagna e incluso in esportazione JSON, backup (ripristinato con la campagna) ed export leggibili. Non applica regole di combattimento.

**Dungeon** — generazione da seed (stanze, corridoi, porte, porte segrete), incontri dal pool SRD, trappole, enigmi, tesori; modificabile a mano; verifica di connettività; esportazione SVG e Markdown. Dimensioni limitate (larghezza 20–80, altezza 20–60, stanze 3–20, livello 1–20: fuori limite 400). I dati salvati o importati vengono validati (griglia `altezza × larghezza` con soli `#.+S`, almeno una stanza, id unici, stanze dentro la mappa, incontro `null` o con elenco di creature).

**Controllo di coerenza** — vedi [ARCHITETTURA.md](ARCHITETTURA.md): errori / rischi / suggerimenti, ciascuno con elementi coinvolti e correzione proposta. Include controlli lessicali sul testo libero (nomi di PNG citati ma inesistenti, elementi nel cestino citati, PNG morti citati), indizi ottenibili solo da un PNG scomparso, committenti scomparsi di missioni non iniziate, dati di dungeon non validi.

**Interfaccia in italiano** — panoramica, navigazione laterale, ricerca/filtri (solo sul testo leggibile, senza distinzione tra maiuscole anche accentate), editor guidati dallo schema, **avviso prima di uscire da un modulo con modifiche non salvate** (panoramica, editor, dungeon; anche alla chiusura della scheda), grafo delle relazioni (filtro per nome; oltre 400 elementi chiede di filtrare o di forzare il disegno), cronologia con ripristino versione, anteprima/esportazione di stampa, indicatore di disponibilità dell'IA, impostazioni IA con prova di connessione.

**Concorrenza tra schede** — blocco ottimistico per versione su elementi **e** dati della campagna (`expectedVersion`), revisione sul tracker (`expectedRev`): chi salva da uno stato vecchio riceve 409, nulla viene sovrascritto. Nell'editor il 409 apre un confronto **campo per campo**: i campi cambiati solo dall'altra scheda si prendono dal server, quelli cambiati solo qui restano tuoi, e per quelli cambiati da entrambe si sceglie quale tenere; poi si salva sulla versione nuova.

**Finestre di dialogo** — nuovo elemento, generazione e nuova campagna chiedono conferma prima di chiudersi (Esc, Annulla, clic fuori) se si è scritto qualcosa.

**Caricamento** — dopo un salvataggio si ricarica solo ciò che è cambiato; senza modifiche, l'apertura di una sezione non rifà la richiesta di tutti gli elementi.

**Importazione** — il checksum del file rileva solo la corruzione accidentale (chi modifica il file può ricalcolarlo): per questo ogni elemento importato passa comunque dalla stessa validazione della creazione, e un file non valido viene rifiutato per intero (422) senza creare campagne a metà.

**IA** — interfaccia astratta; modalità deterministica sempre disponibile; Ollama facoltativa con controllo disponibilità, timeout, gestione di risposte incomplete/troncate/vuote, limiti di memoria, prompt con valore attuale e vincolo di lunghezza per i campi brevi. Il modello risulta installato solo se il nome coincide (un nome senza tag vale come `:latest`); se esistono solo altre varianti (es. `qwen2.5:3b` per `qwen2.5`) l'app lo dice e le suggerisce.

## Risultati dei test (eseguiti)

`node --test tests/*.test.js` (Node 24.19, Windows 10, 2026-10-17): **126 test, 126 superati, 0 falliti, 0 saltati**; lanciati anche tramite `scripts\test.ps1` (log in `test-results.txt`, ora in UTF-8; verificato che lo script esca con codice 1 se un test fallisce).

| File | Test | Copre |
|---|---|---|
| store.test.js | 16 | migrazioni (incluse fallite e DB più nuovo), persistenza dopo chiusura/riapertura, validazione e riferimenti, cestino/blocco eliminazione, conferme, versioni e ripristino, conflitti, backup (verifica, file manomesso/illeggibile, path traversal), import/duplica, atomicità, eventi |
| generator.test.js | 7 | determinismo del seed, 7 temi × 3 seed senza problemi di coerenza, struttura missioni/indizi/misteri, parametri, generatori extra, rigenerazione di un campo, **assenza di preposizioni non articolate e segnaposto residui** nei testi |
| coherence.test.js | 13 | test "mutazione": si rompe un dato valido e si verifica che la regola scatti (cicli, luoghi/indizi irraggiungibili, PNG morto, agende, viaggi, conoscenze senza fonte, nomi sconosciuti/eliminati/morti nel testo), correzione proposta efficace, cestino ignorato |
| rules-dungeon.test.js | 7 | PRNG, dungeon riproducibile e connesso su 8 seed, budget PE, database creature, fonti verificate/non verificate dichiarate, trappole sulle 4 fasce SRD (anche nei dungeon generati) |
| features.test.js | 16 | tracker in export/backup/ripristino, unione dei conflitti campo per campo, sessione corrente e scheda di sessione (Markdown/HTML), indizio bloccato, annulla rigenerazione (e 409 se c'è stata un'altra modifica), 4 strutture × 7 temi × 3/5/8/12 sessioni senza problemi di coerenza, API nuove |
| gaps.test.js | 8 | rami trovati scoperti dal rapporto di copertura: PNG in fazioni nemiche, indizi irraggiungibili, stati incoerenti, tipo di campo sconosciuto, PE tra livelli, archiviazione, tema sconosciuto (400, prima 500), formati di esportazione |
| ai.test.js | 14 | Ollama **contro un server HTTP finto (mock)**: stato, opzioni di memoria, 7 modalità di errore, timeout, servizio spento, campi non testuali, campi brevi; validazione impostazioni; modalità deterministica |
| server.test.js | 7 | server HTTP reale: flusso completo (genera, modifica, conflitto, validazione, esporta, backup, elimina, ripristina, **riavvio del server con dati intatti**), import/rifiuto file corrotti, generazioni, rigenerazione con Ollama spento (dato invariato), difese Host/Origin, regole |
| tracker.test.js | 8 | validazione, ordinamento, turni/round, danno e cure, azioni non valide, persistenza e pulizia, PG a 0 PF che mantiene il turno / PG morto saltato, rimozione di chi è di turno (ultimo, intermedio, precedente, unico) |
| ui.test.js | 13 | **browser reale (Edge headless via DevTools Protocol)**: home, creazione campagna dal dialogo, apertura di tutte le sezioni del menu, creazione/modifica/cestino di un PNG dai moduli, blocco eliminazione di elemento usato, **editor del dungeon** (mappa completa, disegno di una porta, avviso di modifiche), **filtro del grafo per nome**, **navigazioni sovrapposte** (una vista lenta non copre la sezione aperta dopo), tracker (con ricaricamento e 409 da stato vecchio), **tracker modificato in un'altra scheda** (l'aggiunta da stato vecchio non viene applicata, compare l'avviso, lo stato si ricarica, ripetendo l'aggiunta va a buon fine), avviso modifiche non salvate (Annulla resta sulla pagina con la bozza; "Esci senza salvare" esce senza salvare), **richiesta del browser alla chiusura/ricaricamento** (`beforeunload`: nessuna richiesta senza modifiche; rifiutando si resta con la bozza; accettando si ricarica senza salvare), nessun errore JS/console; **nuovi (19 in tutto)**: nessuna richiesta di elenco senza modifiche, unione dei conflitti (3 casi), dialoghi protetti, annulla rigenerazione, al tavolo (con scheda stampabile e "segna giocata"), nuova campagna con struttura "indagine" |

**Copertura** (`node --test --experimental-test-coverage`, solo codice eseguito da Node): righe **95,4%**, rami **83,7%**, funzioni **90,8%** (prima 94,7 / 82,7 / 89,4). Il codice del browser (`public/`) non è misurato da questo rapporto: lo esercitano i test UI. Restano scoperti l'avvio da riga di comando del server, il ramo di errore 500 e alcuni rami minori di export.
| regression.test.js | 11 | uno per falla della revisione 2026-10-17: backup con titoli greci/cirillici/giapponesi ripristinabili (anche pre-eliminazione) e nomi pericolosi rifiutati; dungeon non validi rifiutati in creazione/modifica/import (anche con checksum ricalcolato); dati vecchi non validi che non bloccano export, SVG e coerenza; dungeon generati validi; 409 sulla campagna; ricerca senza chiavi/id/jolly e con maiuscole accentate; indizio da PNG scomparso; stato Ollama con tag; server: `%` malformato, Origin `null`, dimensioni dungeon fuori limite, 409 su campagna e tracker; ricerca e coerenza su 3000 elementi entro un limite largo |

Se non c'è Edge/Chrome, i test UI vengono **saltati** (e riportati come tali), non dati per superati.

I due test UI su conflitto del tracker e `beforeunload` sono stati controllati "per mutazione": togliendo da `app.js` l'invio di `expectedRev` e il gestore `beforeunload`, entrambi falliscono (8 superati, 2 falliti); ripristinato il file, passano.

**Prestazioni misurate** (Node 24.19, campagna in memoria con soli PNG ricchi di testo; tempi medi):

| Elementi | Ricerca server | Elenco completo | Regola di ricerca client | Controllo di coerenza | Inserimento (uno a uno) |
|---|---|---|---|---|---|
| 1000 | 8 ms | 5 ms | 2 ms | 7 ms | 0,3 s |
| 3000 | 22 ms | 16 ms | 5 ms | 21 ms | 1,3 s |
| 6000 | 53 ms | 41 ms | 9 ms | 31 ms | 3,9 s |

La ricerca in memoria cresce in modo lineare e resta sotto i 60 ms anche a 6000 elementi.

**Campagna grande realistica** (60 campagne generate unite in una: 2880 elementi collegati — 420 luoghi, 360 PNG, 360 missioni, 300 indizi, 360 eventi, 480 sessioni, 120 dungeon…), server HTTP reale ed Edge headless, tempo fino al disegno completato:

| Operazione | Tempo |
|---|---|
| Controllo di coerenza (server) | ~100–145 ms |
| Elenco completo via HTTP (3,1 MB) | ~50 ms |
| Export Markdown / HTML / JSON | ~90 / ~90 / ~65 ms |
| Panoramica con caricamento della campagna (UI) | ~230–270 ms |
| Elenco PNG (360 righe) / missioni | ~100 ms |
| Digitazione nella ricerca dell'elenco | ~33 ms |
| Editor PNG / editor dungeon 48×32 | ~195 / ~140 ms |
| Coerenza / storico / esporta (UI) | ~90 / ~165 / ~33 ms |
| Grafo delle relazioni: **prima 4571 ms**, ora avviso ~140 ms; filtrato per nome ~215 ms (18 elementi); disegno completo forzato (2280 nodi) ~460 ms | |

Due difetti trovati con questa misura e corretti:
- **Grafo bloccante**: la disposizione confrontava ogni coppia di nodi per 220 passi (circa 2000 nodi = centinaia di milioni di calcoli, 4,6 s di pagina bloccata, risultato illeggibile). Ora c'è un filtro per nome (elementi trovati + collegamenti diretti); oltre 400 elementi compare un avviso con "Disegna comunque", e i passi si riducono con il numero di nodi (i grafi fino a ~370 nodi restano identici a prima).
- **Navigazioni sovrapposte**: una vista lenta (es. Esporta in attesa dei backup) poteva finire dopo la sezione aperta successivamente e coprirla, lasciando la pagina sbagliata sotto l'indirizzo giusto. Ora ogni navigazione ha un numero progressivo e una vista scrive solo se è ancora la più recente. Il test fallisce sul codice precedente e passa con la correzione.

Durante la correzione è stato introdotto e subito trovato un errore (l'editor del dungeon non si apriva: un nome di funzione coincideva con uno locale). Mancava un test dell'editor del dungeon: ora c'è.

## Verifiche manuali eseguite

- `install.ps1` (ambiente OK), `test.ps1`, `start.ps1` su porta 4321: creazione campagna, arresto, riavvio, backup via API.
- **Ollama reale** (v0.40.5 installato con winget, modello `qwen2.5:3b`, 1,9 GB): rigenerazione di campi di PNG e missioni tramite l'app. Primo utilizzo a freddo ~34 s (caricamento del modello), poi ~1,5–9 s per campo su GTX 1050 Ti. Un campo breve (`role`) veniva riscritto come paragrafo: corretto con vincolo di lunghezza e valore attuale nel prompt; dopo la correzione i campi brevi restano di una riga. Il controllo di coerenza resta pulito dopo le riscritture.
- **Tabelle regole sull'SRD 5.2** (PDF ufficiale `SRD_CC_v5.2`, testo estratto in locale, 2026-10-17): **budget di PE per personaggio** presente nell'SRD 5.2 ("Combat Encounters"): 60/60 valori coincidono. **PE per livello**: coincidono con la tabella SRD 5.2 di 5e24srd.com; dal PDF erano leggibili solo 7 valori, tutti uguali. **Trappole**: l'euristica precedente (5 fasce, CD 11-15) non corrispondeva; sostituita con la scala delle trappole letali dell'SRD. Gli esempi in `examples/` sono stati rigenerati.

- **Confronto modelli** (stessa app, stessi campi): `qwen2.5:3b` (Qwen Research, non commerciale) riscrive con più varietà (~1,5–9 s a campo); `qwen2.5:1.5b` (Apache-2.0) è più veloce (~0,7–5 s) e prudente, ma spesso restituisce il testo quasi invariato (es. "Capitana della Guardia" identico). Per uso commerciale è l'opzione sicura, con risultati meno creativi.

## Cosa NON è stato verificato

- **Qualità dell'IA a lungo termine**: provata su pochi campi con un solo modello piccolo; il testo può introdurre fatti nuovi (es. un riferimento a un PNG nella premessa). Il controllo di coerenza lessicale rileva solo nomi del tipo "Nome Cognome" provenienti dalle banche interne, non fatti inventati in generale. L'IA non è mai fonte di verità: ogni riscrittura è nello storico e ripristinabile.
- Regole: la tabella completa dei **PE per livello** è confrontata con una copia CC-BY dell'SRD, non per intero sul PDF ufficiale. Le **CD di indizi ed enigmi** (10-14) sono scelte del generatore, non valori ufficiali. Le trappole usano solo la scala "letale" (nessuna distinzione con le trappole "fastidiose").
- Codice del browser fuori dal rapporto di copertura (coperto solo dai test UI).
- Browser diversi da Edge; stampa fisica; schermi piccoli.
- Campagne grandi: misurate fino a 2880 elementi collegati (server + Edge) e 6000 PNG (solo server). Non misurate tabelle con migliaia di righe di un solo tipo nell'interfaccia (il caso misurato ha al massimo 480 righe), né macchine lente o browser diversi da Edge.

## Limiti noti

- Nessuna gestione di classi, livelli dei personaggi, schede PG, incantesimi; il tracker non applica regole di combattimento.
- Il controllo di coerenza è strutturale + lessicale: non capisce il significato del testo libero.
- La rigenerazione IA vale per campi di testo di singoli elementi, non per i campi della campagna.
- Varietà del generatore limitata dalle banche di testo: 7 temi × 4 strutture; dentro una struttura le campagne restano simili nella forma.
- Italiano grammaticale gestito con regole semplici (articoli, genere): possibili forme imperfette con nomi fuori dalle banche.
- Un solo utente, nessuna sincronizzazione; il blocco ottimistico (versione su elementi e campagna, revisione sul tracker) evita sovrascritture accidentali tra schede aperte; l'unione campo per campo c'è nell'editor degli elementi, mentre per campagna, dungeon e tracker chi riceve 409 ricarica.
- La ricerca nelle liste filtra in memoria (lato server e client), senza indice: misurata lineare, 53 ms a 6000 elementi.
- Il checksum dei file esportati non è una firma: garantisce l'integrità, non l'autenticità.
- "Annulla rigenerazione" annulla solo l'ultima riscrittura, se è l'ultima modifica; per quelle più vecchie resta lo storico.

## Prossimi passi suggeriti

1. Provare altri modelli locali (es. 7B) e confrontare qualità/tempi.
2. Banche di nomi e testi più ampie; altre strutture narrative.
3. Scheda PG semplice.
4. Unione campo per campo anche per i dati della campagna.
5. Impacchettamento come app desktop (opzionale).
