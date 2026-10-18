# La Decima di Salmastra

- **Ambientazione:** Salmastra, porto di pescatori e salinari su una costa battuta dalle tempeste, sotto il Faro di Sant'Erma.
- **Tono:** mistero
- **Pericolo:** medio
- **Giocatori:** 4
- **Livelli:** 3 → 4
- **Durata indicativa:** 3 sessioni
- **Giorno corrente:** 1
- **Seed:** salmastra-manuale
- **Regole:** srd-5.2 (2024)

## Premessa e conflitto

Il Faro di Sant'Erma è spento da tre notti e due navi si sono fracassate sugli scogli. Fra tre notti arriva la Santa Brezza, nave di pellegrini con quaranta persone a bordo.

Ottavia Rendina, capitana del porto, ha stretto sette anni fa un patto con la strega del mare Nonna Salsedine per riavere il figlio annegato Lio. Il prezzo è una nave di anime ogni sette anni: quest'anno tocca alla Santa Brezza.

## Stato attuale del mondo

Bastiano Ferri, guardiano del faro, è scomparso. I contrabbandieri di Ruggero Spina saccheggiano i relitti. In città si sospetta del mercante Corrado Malvezzi.

## Sessioni, atti e capitoli

- **1. Il faro spento** (atto 1, cap. 1) — Relitto all'alba (15'), Salmastra (35'), il faro (35'), la luce verde e i predoni (30'). Missioni: Il faro spento.
- **2. Sale e segreti** (atto 1, cap. 2) — Registro (15'), saline e fuochi fatui (35'), covo della Spina (45'), la verità su Lio (25'). Missioni: Sale e segreti.
- **3. La notte della decima** (atto 1, cap. 3) — Preparativi (15'), faro nella tempesta (30'), Grotta della Marea (50'), epilogo (25'). Missioni: La notte della decima.

## Missioni

### Il faro spento [principale, atto 1]

Il faro è spento e il guardiano è scomparso.

- **Id:** que_4b70f06479
- **Committente:** Ottavia Rendina
- **Obiettivo:** Scoprire perché il faro è spento e chi accende la luce verde.
- **Luoghi:** Spiaggia dei Relitti; Salmastra; Faro di Sant'Erma; Scogliera della Luce Falsa
- **PNG:** Ottavia Rendina; Elsa Bruma; Lio Rendina; Corrado Malvezzi; Nonna Teodora
- **Indizi offerti:** Il faro sabotato; La luce verde; Tracce di carri; Gli otri di Ottavia; Malvezzi si arricchisce; Ricevute di Malvezzi
- **Indizi necessari:** Il faro sabotato
- **Ostacoli:** La Passerella si allaga con l'alta marea; Incontro 1: predoni dei relitti (550 PE con 4 PG)
- **Svolte:** La lanterna dal vetro verde
- **Ricompense:** oggetto; informazione: La pista porta alle Saline Vecchie
- **Stato:** non iniziata

**Possibili esiti**

- **Predoni sconfitti, prigioniero catturato** — undefined (effetti: factionStanding Contrabbandieri della Spina -1)
- **Predoni in fuga** — Nessun prigioniero: la pista per le saline resta solo nelle tracce dei carri.

### Sale e segreti [principale, atto 1]

Le tracce portano alle Saline Vecchie.

- **Id:** que_0bc1e3127d
- **Committente:** Ottavia Rendina
- **Obiettivo:** Trovare il covo della Spina e scoprire chi paga i naufragi.
- **Prerequisiti:** Il faro spento
- **Luoghi:** Capitaneria di Salmastra; Saline Vecchie; Covo dei contrabbandieri; Casa di Nonna Teodora
- **PNG:** Ruggero Spina; Nonna Teodora; Lio Rendina; Ottavia Rendina
- **Indizi offerti:** Ronde spostate; Pagamenti a O.R.; La filastrocca della decima; Il ragazzo senza riflesso; La mappa con la X; La confessione della Spina
- **Indizi necessari:** Tracce di carri
- **Ostacoli:** Incontro 2: luci nella salina (550 PE); Incontro 3: il covo, evitabile (850 PE)
- **Svolte:** Ruggero può cambiare lato; Ottavia sparisce con Lio al tramonto
- **Ricompense:** oggetto: Otre d'olio da faro
- **Stato:** non iniziata

**Possibili esiti**

- **Ruggero alleato** — undefined (effetti: factionStanding Contrabbandieri della Spina 1)
- **Covo distrutto** — undefined (effetti: nota — Nessuna barca per la sessione 3)

### La notte della decima [principale, atto 1]

Arriva la tempesta e con lei la Santa Brezza.

- **Id:** que_8efa5316e8
- **Committente:** Lio Rendina
- **Obiettivo:** Riaccendere il faro prima di mezzanotte, liberare Bastiano e affrontare Nonna Salsedine.
- **Prerequisiti:** Sale e segreti
- **Luoghi:** Faro di Sant'Erma; Grotta della Marea
- **PNG:** Nonna Salsedine; Bastiano Ferri; Lio Rendina; Ottavia Rendina
- **Indizi offerti:** La conchiglia
- **Indizi necessari:** La mappa con la X
- **Ostacoli:** Tempesta sulla Passerella; Incontro 4: Nonna Salsedine (1550 PE con 4 PG, alto)
- **Svolte:** La strega offre di rinnovare il patto
- **Ricompense:** oro: 50 mo a testa; oggetto; xp: Passaggio al 4° livello
- **Stato:** non iniziata

**Possibili esiti**

- **L'alba buona** — Faro acceso, strega uccisa, conchiglia aperta: Lio vive davvero. (effetti: npcStatus Nonna Salsedine morto; npcStatus Bastiano Ferri vivo)
- **La salvezza a metà** — Faro acceso, strega fuggita: il patto resta. (effetti: npcStatus Bastiano Ferri vivo)
- **La schiuma** — Conchiglia distrutta: Lio si dissolve. (effetti: npcStatus Lio Rendina morto; npcStatus Nonna Salsedine morto)
- **La notte nera** — Faro spento: la Santa Brezza naufraga.
- **Il patto rinnovato** — Un PG accetta l'offerta della strega.

## PNG

### Bastiano Ferri — umano, Guardiano del faro [prigioniero]

Sessant'anni, burbero, ex marinaio.

- **Luogo:** Grotta della Marea
- **Motivazioni:** Dovere verso le navi in mare; Affetto per Lio
- **Obiettivi:** Riaccendere il faro; Salvare Lio
- **Informazioni note:** La conchiglia va aperta col canto della marea, non spezzata [fonte: Faro di Sant'Erma]
- **Relazioni:** mentore con Lio Rendina
- **Comportamento:** se Liberato: Spiega come aprire la conchiglia e aiuta col faro

### Corrado Malvezzi — umano, Mercante [vivo]

Antipatico, aggressivo a parole, mai violento.

- **Luogo:** Magazzino Malvezzi
- **Motivazioni:** Guadagnare
- **Obiettivi:** Recuperare le perdite della nave affondata
- **Segreti:** Compra merce dei relitti, ma solo dopo i naufragi
- **Comportamento:** se Accusato: Minaccia avvocati e mostra le ricevute

### Elsa Bruma — umana, Marinaia sopravvissuta [vivo]

- **Luogo:** L'Ancora Storta
- **Motivazioni:** Rabbia per l'equipaggio perduto
- **Obiettivi:** Vendicare l'equipaggio
- **Informazioni note:** Il faro era verde e più a nord [fonte: Secondo naufragio]
- **Comportamento:** se Salvata dai PG: Racconta della luce verde e chiede di unirsi alla caccia
- **Spostamenti:** giorni 1…1: Spiaggia dei Relitti

### Lio Rendina — umano, Apprendista del guardiano [vivo]

Diciassette anni, timido, pelle che sa di alghe. Non ha riflesso nell'acqua salata.

Entusiasta e spaventato.

- **Luogo:** Faro di Sant'Erma
- **Motivazioni:** Affetto per Bastiano; Paura di deludere la madre
- **Obiettivi:** Ritrovare Bastiano
- **Paure:** La grotta; Il canto sotto il faro
- **Segreti:** È annegato sette anni fa; il suo respiro è nella conchiglia della strega
- **Relazioni:** famiglia con Ottavia Rendina (madre); mentore con Bastiano Ferri (gli fa da padre)
- **Comportamento:** se Si parla della grotta: Impallidisce e tossisce acqua di mare

### Nonna Salsedine — strega del mare, Antagonista [vivo]

- **Luogo:** Grotta della Marea
- **Motivazioni:** Fame di anime annegate
- **Obiettivi:** Le anime della decima
- **Segreti:** Il suo potere sul patto vive nella conchiglia
- **Comportamento:** se Sotto metà PF: Offre di rinnovare il patto, poi fugge nell'acqua con la conchiglia
- **Combattimento:** srd-2024_sea-hag con 2 Merrow e 2 Reef Shark (+4 Sahuagin Warrior con 5 PG)

### Nonna Teodora — umana, Pescatrice anziana [vivo]

Parla per filastrocche, memoria lunghissima.

- **Luogo:** Casa di Nonna Teodora
- **Motivazioni:** Che qualcuno ascolti le storie
- **Obiettivi:** Avvertire la città prima della notte nera
- **Informazioni note:** Le notti nere di sette e quattordici anni fa [fonte: Salmastra]
- **Comportamento:** se Ascoltata con pazienza: Racconta la filastrocca della decima; se Le si parla di Lio: Completa la storia del ragazzo tornato dal mare

### Ottavia Rendina — umana, Capitana del porto [vivo]

Sui 45 anni, gentile, stanca, sempre in ordine.

Calda e controllata; crolla solo davanti alle prove.

- **Luogo:** Capitaneria di Salmastra
- **Fazioni:** Capitaneria di Salmastra
- **Motivazioni:** Salvare Lio a qualunque costo
- **Obiettivi:** Pagare la decima con la Santa Brezza; Tenere i PG lontani dalla grotta
- **Paure:** Perdere di nuovo il figlio
- **Informazioni note:** Il patto chiede una nave ogni sette anni (nascosta) [fonte: Il patto della marea]; Bastiano è prigioniero nella grotta (nascosta) [fonte: Rapimento di Bastiano]
- **Segreti:** Ha stretto il patto con Nonna Salsedine sette anni fa; Ha fatto spegnere il faro e spostare le ronde
- **Bugie:** Le ronde servivano al molo nuovo; Malvezzi ci guadagna, guardate lui
- **Relazioni:** famiglia con Lio Rendina (figlio); debito con Ruggero Spina (lo paga per i naufragi); debito con Nonna Salsedine (il patto)
- **Comportamento:** se Il consiglio dei salinari le impone di assoldare qualcuno: Sceglie i PG, forestieri, per tenerli d'occhio e rallentarli; se Interrogata senza prove: Nega con calma e indica Malvezzi; se Messa davanti al libro mastro o al diario: Confessa piangendo e chiede aiuto per Lio
- **Dialoghi:** Il consiglio paga cinquanta monete a testa, se riaccendete il faro prima della Santa Brezza.; L'olio per il faro arriverà fra due giorni: intanto guardate nel magazzino di Malvezzi.
- **Spostamenti:** giorni -2555…-2555: Grotta della Marea; giorni -1…-1: Faro di Sant'Erma
- **Combattimento:** srd-2024_spy solo se messa alle strette

### Ruggero Spina — umano, Capo dei contrabbandieri [vivo]

Sfrontato, avido, superstizioso.

- **Luogo:** Covo dei contrabbandieri
- **Fazioni:** Contrabbandieri della Spina
- **Motivazioni:** Soldi; Salvare la pelle
- **Obiettivi:** Vendere i carichi dei relitti
- **Paure:** La strega del mare
- **Informazioni note:** Ottavia ha portato Bastiano sotto il faro [fonte: Rapimento di Bastiano]
- **Segreti:** Ha visto la strega una volta
- **Relazioni:** debito con Ottavia Rendina
- **Comportamento:** se Scopre che la Santa Brezza porta pellegrini: Cambia lato e consegna il libro mastro; se Sotto metà PF: Si arrende e tratta
- **Spostamenti:** giorni -1…-1: Faro di Sant'Erma
- **Combattimento:** srd-2024_bandit-captain 

## Fazioni

### Capitaneria di Salmastra [alleata, reputazione 1]

Autorità del porto. In apparenza alleata del gruppo.

- **Capo:** Ottavia Rendina
- **Sede:** Capitaneria di Salmastra
- **Territori:** Salmastra
- **Rapporti:** rivale: Contrabbandieri della Spina

### Contrabbandieri della Spina [ostile, reputazione -1]

Sciacalli dei relitti al soldo di Ottavia; non sanno della strega.

- **Capo:** Ruggero Spina
- **Sede:** Covo dei contrabbandieri
- **Territori:** Saline Vecchie; Scogliera della Luce Falsa
- **Rapporti:** rivale: Capitaneria di Salmastra

## Mondo e luoghi

### Capitaneria di Salmastra (edificio, in Salmastra) [pubblico]

Ufficio di Ottavia Rendina: registri del porto, sigillo, ronde del molo.

### Casa di Nonna Teodora (edificio, in Salmastra) [pubblico]

Casupola sul molo vecchio, reti appese e tè d'alghe sul fuoco.

### Costa di Sant'Erma (regione) [pubblico]

Costa rocciosa con saline e scogliere, battuta dalle tempeste d'autunno.

### Covo dei contrabbandieri (edificio, in Saline Vecchie) [pubblico]

Vecchio deposito del sale su palafitte, base di Ruggero Spina.

- **Percorsi:** Saline Vecchie (passerella su palafitte, 0 gg)

### Faro di Sant'Erma (edificio, in Costa di Sant'Erma) [pubblico]

Torre su un promontorio raggiungibile solo con la bassa marea. Serbatoio dell'olio svuotato, lente coperta da una vela catramata.

- **Storia:** In cantina una porta segreta incrostata di sale scende alla Grotta della Marea.
- **Percorsi:** Salmastra (la Passerella, 0 gg); Grotta della Marea (scala segreta nella roccia, 0 gg)

### Grotta della Marea (dungeon, in Costa di Sant'Erma) [segreto]

Caverna mezzo allagata sotto il faro: pozze profonde, un altare di conchiglie e ossa, la conchiglia che canta.

- **Sbloccato da:** La mappa con la X
- **Percorsi:** Faro di Sant'Erma (scala segreta nella roccia, 0 gg)

### L'Ancora Storta (edificio, in Salmastra) [pubblico]

Taverna del porto: voci, vino salato e pescatori.

### Magazzino Malvezzi (edificio, in Salmastra) [pubblico]

Deposito del mercante Corrado Malvezzi, pieno di casse ancora incrostate di sale.

### Saline Vecchie (natura, in Costa di Sant'Erma) [pubblico]

Vasche abbandonate e canali di acqua salmastra. Luci fluttuanti di notte.

- **Percorsi:** Salmastra (argini delle vasche, 0 gg); Covo dei contrabbandieri (passerella su palafitte, 0 gg)

### Salmastra (villaggio, in Costa di Sant'Erma) [pubblico]

Porto di pescatori e salinari, case basse color ocra, odore di catrame e sale.

- **Economia:** Pesca, sale, piccolo commercio costiero.
- **Leggende:** Ogni sette anni il mare chiede una nave.
- **Percorsi:** Spiaggia dei Relitti (sentiero della scogliera, 0 gg); Saline Vecchie (argini delle vasche, 0 gg); Faro di Sant'Erma (la Passerella (solo con la bassa marea), 0 gg)

### Scogliera della Luce Falsa (natura, in Costa di Sant'Erma) [pubblico]

Picco a nord del faro: da qui una lanterna verde imita il faro e attira le navi sugli scogli.

- **Percorsi:** Spiaggia dei Relitti (salita sulla roccia, 0 gg)

### Spiaggia dei Relitti (natura, in Costa di Sant'Erma) [pubblico]

Arco di sabbia nera sotto la scogliera, dove si sono arenate le due navi.

- **Percorsi:** Salmastra (sentiero della scogliera, 0 gg); Scogliera della Luce Falsa (salita sulla roccia, 0 gg)

## Misteri e indizi

### Chi spegne il faro?

- **Domanda:** Perché le navi naufragano e chi c'è dietro?
- **Soluzione (solo DM):** Ottavia Rendina ha fatto spegnere il faro e accendere la luce verde per pagare a Nonna Salsedine la decima che tiene in vita Lio.
- **Responsabile:** Ottavia Rendina
- **Indizi veritieri:** Il faro sabotato; La luce verde; Tracce di carri; Ronde spostate; Pagamenti a O.R.; Gli otri di Ottavia; La filastrocca della decima; Il ragazzo senza riflesso; La conchiglia; La confessione della Spina
- **False piste:** Malvezzi si arricchisce

#### Gli otri di Ottavia

Ottavia è venuta al tramonto con due otri di olio; non sono mai arrivati.

- **Dove:** Faro di Sant'Erma
- **Da chi:** —
- **In:** Diario di Bastiano

#### Il faro sabotato

Serbatoio dell'olio vuoto ma pulito, lente coperta da una vela catramata.

- **Dove:** Faro di Sant'Erma
- **Da chi:** —
- **In:** —
- **Prova:** Indagare CD 10

#### Il ragazzo senza riflesso

Lio non ha riflesso nell'acqua salata e tossisce acqua di mare.

- **Dove:** —
- **Da chi:** Lio Rendina
- **In:** —
- **Prova:** Percezione CD 14

#### La conchiglia

Il respiro del ragazzo è là sotto: va aperta col canto della marea, non spezzata.

- **Dove:** Faro di Sant'Erma
- **Da chi:** —
- **In:** Diario di Bastiano

#### La confessione della Spina

Ottavia ha portato Bastiano giù, sotto il faro, con le sue mani.

- **Dove:** —
- **Da chi:** Ruggero Spina
- **In:** —
- **Dopo:** Sale e segreti

#### La filastrocca della decima

Ogni sette anni il mare chiede una nave; sette anni fa un ragazzo tornò dal mare.

- **Dove:** —
- **Da chi:** Nonna Teodora
- **In:** —

#### La luce verde

Il faro c'era, ma era verde e più a nord.

- **Dove:** —
- **Da chi:** Elsa Bruma
- **In:** —

#### La mappa con la X

Una X sotto il promontorio di Sant'Erma, accessibile via mare o dalla cantina del faro.

- **Dove:** Covo dei contrabbandieri
- **Da chi:** —
- **In:** —

#### Malvezzi si arricchisce [falsa pista]

Malvezzi compra a poco la merce dei relitti.

- **Dove:** —
- **Da chi:** Corrado Malvezzi
- **In:** —
- **Smentita da:** Ricevute di Malvezzi

#### Pagamenti a O.R.

Pagamenti a O.R. e un ordine con il sigillo della Capitaneria.

- **Dove:** Covo dei contrabbandieri
- **Da chi:** —
- **In:** Libro mastro della Spina
- **Prova:** Persuasione CD 15 o Scassinare CD 13

#### Ricevute di Malvezzi

Le ricevute sono datate dopo i naufragi e una delle navi era sua.

- **Dove:** Magazzino Malvezzi
- **Da chi:** —
- **In:** —
- **Prova:** Indagare CD 12

#### Ronde spostate

Nelle tre notti la ronda del molo è stata spostata con la firma di Ottavia.

- **Dove:** Capitaneria di Salmastra
- **Da chi:** —
- **In:** Registro delle ronde
- **Prova:** Indagare CD 13

#### Tracce di carri

Casse trascinate prima dell'alba verso le saline.

- **Dove:** Spiaggia dei Relitti
- **Da chi:** —
- **In:** —
- **Prova:** Sopravvivenza CD 12

## Oggetti

- **2 pozioni di guarigione** (consumabile) — undefined [origine: Grotta della Marea]
- **Conchiglia a spirale** (magico) — Contiene l'ultimo respiro di Lio. CA 15, 10 PF. Va aperta (azione, Arcano o Esecuzione CD 13), non distrutta. [origine: Grotta della Marea; posseduto da Nonna Salsedine]
- **Diario di Bastiano** (documento) — Pagine mezze bruciate nella stufa del faro. [origine: Faro di Sant'Erma]
- **Lanterna dal vetro verde** (altro) — La luce falsa dei contrabbandieri. La strega la riconosce come sua. [origine: Spiaggia dei Relitti]
- **Libro mastro della Spina** (documento) — undefined [origine: Covo dei contrabbandieri; posseduto da Ruggero Spina]
- **Registro delle ronde** (documento) — undefined [origine: Capitaneria di Salmastra]

## Cronologia degli eventi

- **Giorno -2555** — Il patto della marea [storico, accaduto] a Grotta della Marea con Ottavia Rendina, Nonna Salsedine. Ottavia scende nella grotta e riavrà Lio in cambio di una nave ogni sette anni.
- **Giorno -2** — Primo naufragio [storico, accaduto] a Spiaggia dei Relitti. Un mercantile si fracassa sugli scogli.
- **Giorno -1** — Rapimento di Bastiano [storico, accaduto] a Faro di Sant'Erma con Ottavia Rendina, Ruggero Spina. Bastiano scopre il patto e viene portato nella grotta.
- **Giorno 1** — La luce verde [previsto] a Scogliera della Luce Falsa. I contrabbandieri accendono la lanterna e saccheggiano il relitto (Incontro 1).
- **Giorno 1** — Secondo naufragio [previsto] a Spiaggia dei Relitti con Elsa Bruma. All'alba della sessione 1: la nave di Malvezzi si arena, Elsa è nella risacca.
- **Giorno 3** — La notte della decima [previsto] a Grotta della Marea con Nonna Salsedine. Se il faro è spento, la Santa Brezza naufraga.

## Fonti e licenze

Questo documento utilizza materiale dal System Reference Document 5.2 (SRD 5.2) di Wizards of the Coast LLC, disponibile su https://dnd.wizards.com/resources/systems-reference-document ed è distribuito con licenza Creative Commons Attribution 4.0 International (CC BY 4.0). Dati creature ottenuti tramite Open5e. Progetto non ufficiale, non affiliato né approvato da Wizards of the Coast.
