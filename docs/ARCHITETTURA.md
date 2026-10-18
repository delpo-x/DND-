# Architettura

## Scelte principali

| Tema | Scelta | Motivo |
|---|---|---|
| Runtime | Node.js â‰¥ 22.13, ESM, **zero dipendenze npm** | Nessuna installazione di pacchetti, nessuna catena di fornitura, nessuna licenza di terzi da gestire |
| Database | SQLite tramite `node:sqlite` (integrato) | Un solo file, transazioni, nessun server; funziona offline |
| Server | `node:http`, JSON API sotto `/api`, solo `127.0.0.1` | Locale; controllo di `Host` e `Origin` contro DNS rebinding e richieste cross-site |
| Interfaccia | SPA in JavaScript puro (`public/`), routing con hash (numero progressivo per navigazione: una vista scrive con `showView(mine, â€¦)` solo se Ã¨ ancora la piÃ¹ recente), DOM costruito con `textContent` | Nessuna build; nessuna iniezione HTML dai dati |
| Test | `node:test` | Integrato |

## Struttura

```
src/
  schema.js     definizione unica dei tipi di elemento: validazione server + form UI + estrazione riferimenti
  db.js         apertura DB, migrazioni versionate (transazionali), transazioni annidate con SAVEPOINT
  store.js      accesso ai dati: campagne, elementi, relazioni, versioni, backup, import/export
  rng.js        PRNG con seed (mulberry32) e fork per etichetta
  content.js    banche di nomi/temi/toni in italiano, helper grammaticali (articoli, genere)
  gen-det.js    generatore deterministico di campagna (4 strutture narrative) e rigenerazione di singoli campi
  gen-extra.js  PNG, evento casuale, luogo
  dungeon.js    generatore di dungeon (seed), verifica di connettivitÃ , SVG
  rules.js      modulo regole separato: fonti dichiarate (verificate / non verificate), budget PE, trappole, creature SRD
  brief.js      sessione corrente e riepilogo "al tavolo" (missioni, scene, PNG con posizione, indizi, eventi)
  coherence.js  controllo di coerenza narrativa
  tracker.js    tracker di combattimento: validazione e azioni (stato per campagna nelle impostazioni)
  ai.js         interfaccia astratta dei generatori: DeterministicProvider, OllamaProvider
  export.js     blocchi di documento â†’ Markdown e HTML stampabile, esportazione dungeon
  server.js     API + file statici
public/         index.html, style.css, lib.js (utilitÃ  UI e form guidati dallo schema), app.js (viste)
data/           srd52-creatures.json (331 creature SRD 5.2, ottenute con tools/fetch-srd.mjs)
tools/          fetch-srd.mjs, make-examples.js
scripts/        install.ps1, start.ps1, test.ps1
tests/          127 test automatici (incl. browser reale via DevTools Protocol); copertura righe 95,4% del codice Node
```

## Modello dati

Tabelle (migrazione v1, `src/db.js`):

- `campaigns(id, title, data JSON, archived, created_at, updated_at, version)`
- `entities(id, campaign_id, type, name, data JSON, version, deleted_at, created_at, updated_at)` â€” un'unica tabella per tutti i tipi; i campi sono definiti da `schema.js`
- `relations(campaign_id, from_id, to_id, field, â€¦)` â€” **derivata** dai campi di riferimento dello schema, ricalcolata a ogni salvataggio; alimenta il grafo e il controllo "Ã¨ ancora usato daâ€¦"
- `revisions(entity_id, version, data, source, note, at)` â€” ogni versione di ogni elemento e della campagna
- `settings(key, value)`, `schema_migrations(version, name, applied_at)`

Gli id sono stabili (`npc_â€¦`, `loc_â€¦`, â€¦) e ogni riferimento Ã¨ validato al salvataggio: deve esistere, nella stessa campagna, ed essere di un tipo ammesso dal campo. Tipi di elemento: luogo, PNG, fazione, missione, indizio, mistero, oggetto, evento, sessione, dungeon.

Validazione: un solo punto d'ingresso, `validateEntity(type, data, resolveRef)` in `store.js`, usato da creazione, modifica, importazione di bundle e importazione di file. Esegue `validateAgainst` sullo schema e, per i dungeon, `dungeonDataErrors` (`dungeon.js`: forma della griglia, stanze, limiti della mappa, incontri).

Ricerca: `searchableText(fields, data)` (`schema.js`, stessa regola in `public/lib.js`) concatena solo i valori testuali ed enum, anche dentro le liste, mai chiavi JSON nÃ© id; confronto con `toLocaleLowerCase("it")`. Nessun `LIKE` sul JSON grezzo.

Concorrenza: l'aggiornamento di elementi **e campagna** accetta `expectedVersion`; se diverso risponde 409. Il tracker ha un contatore `rev` incrementato a ogni salvataggio o azione; la PUT accetta `expectedRev` e risponde 409 se superato.

### Salvataggio e recupero

- Tutte le scritture composte sono in transazione (anche annidate): un errore annulla tutto.
- Un database creato da una versione piÃ¹ recente dell'app viene rifiutato.
- Esportazione/backup: `{format: "dnd-campaign-studio/campaign", formatVersion: 1, schemaVersion, checksum, campaign, entities}`. Il checksum SHA-256 copre solo dati stabili (id, tipo, dati, stato eliminato), non versioni/timestamp. **Rileva solo la corruzione accidentale**: chi modifica il file a mano puÃ² ricalcolarlo, quindi ogni elemento importato passa comunque da `validateEntity` (un file non valido Ã¨ rifiutato per intero con 422).
- I nomi dei file di backup accettano lettere e cifre di qualsiasi alfabeto (`/^[\p{L}\p{N}_.-]+\.json$/u`); `restoreBackup` rifiuta `..` e separatori di percorso.
- `createBackup` scrive il file, lo **rilegge** e ne verifica il checksum prima di dichiarare successo.
- `restoreBackup`: valida formato, checksum e ogni elemento contro lo schema **prima** di scrivere; salva un backup automatico dello stato attuale; mantiene gli id originali.
- `importPayload(mode:"new")`: nuovi id con riferimenti rimappati (usato da importa e duplica).

## Controllo di coerenza (`coherence.js`)

Restituisce `{summary, issues[], reachable[]}`; ogni problema ha `severity` (errore / rischio / suggerimento), `rule`, `message`, `entities[]` coinvolte e `suggestion`.

- **RaggiungibilitÃ ** con simulazione a punto fisso: luoghi, indizi, missioni ed eventi sono "raggiungibili" solo se i requisiti (luogo accessibile, indizi, sblocchi, committente vivo) lo sono a loro volta.
- **Cicli** di dipendenza tra missioni (DFS); un ciclo marcato `intentionalCycle` Ã¨ solo un suggerimento.
- **PNG**: agende sovrapposte, tempi di viaggio (Dijkstra sulle connessioni), PNG morti/prigionieri a eventi futuri, fazioni nemiche, conoscenze senza fonte plausibile o con fonte futura, segreti non rivelabili, indizi la cui unica fonte Ã¨ un PNG scomparso (`INDIZIO-PNG-SCOMPARSO`), committente scomparso di una missione non iniziata (`COMMITTENTE-SCOMPARSO`).
- **Dati dei dungeon**: dati non validi salvati da versioni precedenti sono un errore (`DUNGEON-DATI`) e saltano il controllo di connettivitÃ  invece di bloccare il controllo intero; anche export e SVG li gestiscono senza eccezioni.
- **Misteri**: almeno 3 indizi veri raggiungibili; false piste che devono poter essere smentite.
- **Testo libero (lessicale)**: nomi "Nome Cognome" delle banche interne citati ma senza PNG, elementi nel cestino citati, PNG morti citati in missioni/luoghi/sessioni.
- **Cronologia** eventi, origine degli oggetti, conseguenze contraddittorie, ordine delle sessioni, connettivitÃ  dei dungeon, simmetria delle relazioni tra fazioni, livello per sessione.

Limite onesto: il controllo Ã¨ strutturale e lessicale. Non capisce il significato del testo libero: una contraddizione scritta solo in prosa, o un fatto inventato (anche dall'IA), non viene rilevata.

## Livello IA

`ai.js` espone un'interfaccia comune (`status()`, `supports(type, field)`, `writeField(entity, field, ctx)`).

- **Deterministica**: sceglie varianti da `FIELD_VARIANTS` con il seed; sempre disponibile.
- **Ollama**: `GET /api/tags` per lo stato; `POST /api/generate` (`stream:false`) con `num_ctx`/`num_predict` limitati e timeout. Prompt compatto contenente solo i dati testuali dell'elemento: i dati strutturati sono la fonte di veritÃ . Errori tipizzati (`unreachable`, `timeout`, `model-missing`, `incomplete`, `truncated`, `empty`, `bad-response`, `model-error`, `http`, `unsupported`).
- La scrittura avviene **solo dopo** una risposta valida e solo sul campo richiesto (con nuova versione nello storico, `source: "ia:ollama"`). Se fallisce, l'elemento resta identico.

## Generatore deterministico

Uno scheletro narrativo fisso (regione, 6 PNG, 3 fazioni, 6 missioni, 5 indizi, mistero, eventi, oggetti, sessioni, 2 dungeon) riempito da 7 temi (culto, intrigo, miniera, peste, fate, pirati, drago). PoichÃ© i collegamenti sono costruiti insieme alle entitÃ , i risultati sono coerenti per costruzione e i test verificano che il controllo non trovi nulla su tutti i temi. La varietÃ  Ã¨ limitata dalla dimensione delle banche di testo (vedi limiti). Un test cerca nei testi di tutti i temi preposizioni non articolate ("di il", "a la"â€¦) e segnaposto residui.

## Sicurezza

Solo loopback; `Host`/`Origin` controllati (Origin `null` o non interpretabile: 403); percorsi con `%` malformato o byte nullo: 400, mai 500; parametri dei dungeon validati entro `DUNGEON_LIMITS`; limite di 5 MB per richiesta; nessun `innerHTML` con dati utente; Ollama solo su indirizzi locali salvo `ALLOW_REMOTE_OLLAMA=1`; nessun segreto nel codice; nessuna telemetria.
