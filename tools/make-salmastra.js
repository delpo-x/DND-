// Costruisce l'avventura "La Decima di Salmastra" (avventure/la-decima-di-salmastra.md) come campagna
// del Campaign Studio, esegue il controllo di coerenza ed esporta JSON/Markdown/HTML in avventure/.
// Uso: node tools/make-salmastra.js            (solo file)
//      node tools/make-salmastra.js --db PATH  (importa anche nel database indicato)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../src/db.js";
import { Store } from "../src/store.js";
import { checkCoherence } from "../src/coherence.js";
import { campaignToMarkdown, campaignToHtml } from "../src/export.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "avventure");

const campaign = {
  title: "La Decima di Salmastra",
  setting: "Salmastra, porto di pescatori e salinari su una costa battuta dalle tempeste, sotto il Faro di Sant'Erma.",
  tone: "mistero",
  danger: "medio",
  players: 4,
  startLevel: 3,
  endLevel: 4,
  sessions: 3,
  premise: "Il Faro di Sant'Erma è spento da tre notti e due navi si sono fracassate sugli scogli. Fra tre notti arriva la Santa Brezza, nave di pellegrini con quaranta persone a bordo.",
  centralConflict: "Ottavia Rendina, capitana del porto, ha stretto sette anni fa un patto con la strega del mare Nonna Salsedine per riavere il figlio annegato Lio. Il prezzo è una nave di anime ogni sette anni: quest'anno tocca alla Santa Brezza.",
  worldState: "Bastiano Ferri, guardiano del faro, è scomparso. I contrabbandieri di Ruggero Spina saccheggiano i relitti. In città si sospetta del mercante Corrado Malvezzi.",
  currentDay: 1,
  seed: "salmastra-manuale",
};

const L = (key, data) => ({ key, type: "location", data });
const N = (key, data) => ({ key, type: "npc", data });
const C = (key, data) => ({ key, type: "clue", data: { mystery: "mys_decima", ...data } });

const entities = [
  // --- Luoghi ---
  L("loc_costa", { name: "Costa di Sant'Erma", kind: "regione", description: "Costa rocciosa con saline e scogliere, battuta dalle tempeste d'autunno." }),
  L("loc_salmastra", { name: "Salmastra", kind: "villaggio", parent: "loc_costa", description: "Porto di pescatori e salinari, case basse color ocra, odore di catrame e sale.", economy: "Pesca, sale, piccolo commercio costiero.", legends: ["Ogni sette anni il mare chiede una nave."],
    connections: [{ to: "loc_spiaggia", via: "sentiero della scogliera", days: 0 }, { to: "loc_saline", via: "argini delle vasche", days: 0 }, { to: "loc_faro", via: "la Passerella (solo con la bassa marea)", days: 0 }] }),
  L("loc_ancora", { name: "L'Ancora Storta", kind: "edificio", parent: "loc_salmastra", description: "Taverna del porto: voci, vino salato e pescatori." }),
  L("loc_capitaneria", { name: "Capitaneria di Salmastra", kind: "edificio", parent: "loc_salmastra", description: "Ufficio di Ottavia Rendina: registri del porto, sigillo, ronde del molo." }),
  L("loc_magazzino", { name: "Magazzino Malvezzi", kind: "edificio", parent: "loc_salmastra", description: "Deposito del mercante Corrado Malvezzi, pieno di casse ancora incrostate di sale." }),
  L("loc_casa_teodora", { name: "Casa di Nonna Teodora", kind: "edificio", parent: "loc_salmastra", description: "Casupola sul molo vecchio, reti appese e tè d'alghe sul fuoco." }),
  L("loc_spiaggia", { name: "Spiaggia dei Relitti", kind: "natura", parent: "loc_costa", description: "Arco di sabbia nera sotto la scogliera, dove si sono arenate le due navi.",
    connections: [{ to: "loc_salmastra", via: "sentiero della scogliera", days: 0 }, { to: "loc_scogliera", via: "salita sulla roccia", days: 0 }] }),
  L("loc_scogliera", { name: "Scogliera della Luce Falsa", kind: "natura", parent: "loc_costa", description: "Picco a nord del faro: da qui una lanterna verde imita il faro e attira le navi sugli scogli.",
    connections: [{ to: "loc_spiaggia", via: "salita sulla roccia", days: 0 }] }),
  L("loc_faro", { name: "Faro di Sant'Erma", kind: "edificio", parent: "loc_costa", description: "Torre su un promontorio raggiungibile solo con la bassa marea. Serbatoio dell'olio svuotato, lente coperta da una vela catramata.",
    history: "In cantina una porta segreta incrostata di sale scende alla Grotta della Marea.",
    connections: [{ to: "loc_salmastra", via: "la Passerella", days: 0 }, { to: "loc_grotta", via: "scala segreta nella roccia", days: 0 }] }),
  L("loc_saline", { name: "Saline Vecchie", kind: "natura", parent: "loc_costa", description: "Vasche abbandonate e canali di acqua salmastra. Luci fluttuanti di notte.",
    connections: [{ to: "loc_salmastra", via: "argini delle vasche", days: 0 }, { to: "loc_covo", via: "passerella su palafitte", days: 0 }] }),
  L("loc_covo", { name: "Covo dei contrabbandieri", kind: "edificio", parent: "loc_saline", description: "Vecchio deposito del sale su palafitte, base di Ruggero Spina.",
    connections: [{ to: "loc_saline", via: "passerella su palafitte", days: 0 }] }),
  L("loc_grotta", { name: "Grotta della Marea", kind: "dungeon", parent: "loc_costa", access: "segreto", unlockedBy: "clu_mappa",
    description: "Caverna mezzo allagata sotto il faro: pozze profonde, un altare di conchiglie e ossa, la conchiglia che canta.",
    connections: [{ to: "loc_faro", via: "scala segreta nella roccia", days: 0 }] }),

  // --- Fazioni ---
  { key: "fac_capitaneria", type: "faction", data: { name: "Capitaneria di Salmastra", stance: "alleata", standing: 1, description: "Autorità del porto. In apparenza alleata del gruppo.", leader: "npc_ottavia", headquarters: "loc_capitaneria", territories: ["loc_salmastra"],
    relations: [{ faction: "fac_spina", kind: "rivale" }] } },
  { key: "fac_spina", type: "faction", data: { name: "Contrabbandieri della Spina", stance: "ostile", standing: -1, description: "Sciacalli dei relitti al soldo di Ottavia; non sanno della strega.", leader: "npc_ruggero", headquarters: "loc_covo", territories: ["loc_saline", "loc_scogliera"],
    relations: [{ faction: "fac_capitaneria", kind: "rivale" }] } },

  // --- PNG ---
  N("npc_ottavia", { name: "Ottavia Rendina", species: "umana", role: "Capitana del porto", status: "vivo", location: "loc_capitaneria", factions: ["fac_capitaneria"],
    description: "Sui 45 anni, gentile, stanca, sempre in ordine.", personality: "Calda e controllata; crolla solo davanti alle prove.",
    motivations: ["Salvare Lio a qualunque costo"], goals: ["Pagare la decima con la Santa Brezza", "Tenere i PG lontani dalla grotta"], fears: ["Perdere di nuovo il figlio"],
    secrets: ["Ha stretto il patto con Nonna Salsedine sette anni fa", "Ha fatto spegnere il faro e spostare le ronde"],
    lies: ["Le ronde servivano al molo nuovo", "Malvezzi ci guadagna, guardate lui"],
    knowledge: [{ fact: "Il patto chiede una nave ogni sette anni", hidden: true, source: "evt_patto", revealedBy: "clu_teodora" },
      { fact: "Bastiano è prigioniero nella grotta", hidden: true, source: "evt_rapimento", revealedBy: "clu_ruggero" }],
    relationships: [{ npc: "npc_lio", kind: "famiglia", note: "figlio" }, { npc: "npc_ruggero", kind: "debito", note: "lo paga per i naufragi" }, { npc: "npc_strega", kind: "debito", note: "il patto" }],
    behaviors: [{ situation: "Il consiglio dei salinari le impone di assoldare qualcuno", reaction: "Sceglie i PG, forestieri, per tenerli d'occhio e rallentarli" }, { situation: "Interrogata senza prove", reaction: "Nega con calma e indica Malvezzi" }, { situation: "Messa davanti al libro mastro o al diario", reaction: "Confessa piangendo e chiede aiuto per Lio" }],
    schedule: [{ fromDay: -2555, toDay: -2555, location: "loc_grotta" }, { fromDay: -1, toDay: -1, location: "loc_faro" }],
    dialogues: ["Il consiglio paga cinquanta monete a testa, se riaccendete il faro prima della Santa Brezza.", "L'olio per il faro arriverà fra due giorni: intanto guardate nel magazzino di Malvezzi."],
    combat: [{ monsterKey: "srd-2024_spy", note: "solo se messa alle strette" }] }),
  N("npc_lio", { name: "Lio Rendina", species: "umano", role: "Apprendista del guardiano", status: "vivo", location: "loc_faro",
    description: "Diciassette anni, timido, pelle che sa di alghe. Non ha riflesso nell'acqua salata.", personality: "Entusiasta e spaventato.",
    motivations: ["Affetto per Bastiano", "Paura di deludere la madre"], goals: ["Ritrovare Bastiano"], fears: ["La grotta", "Il canto sotto il faro"],
    secrets: ["È annegato sette anni fa; il suo respiro è nella conchiglia della strega"],
    relationships: [{ npc: "npc_ottavia", kind: "famiglia", note: "madre" }, { npc: "npc_bastiano", kind: "mentore", note: "gli fa da padre" }],
    behaviors: [{ situation: "Si parla della grotta", reaction: "Impallidisce e tossisce acqua di mare" }] }),
  N("npc_bastiano", { name: "Bastiano Ferri", species: "umano", role: "Guardiano del faro", status: "prigioniero", location: "loc_grotta",
    description: "Sessant'anni, burbero, ex marinaio.", motivations: ["Dovere verso le navi in mare", "Affetto per Lio"], goals: ["Riaccendere il faro", "Salvare Lio"],
    knowledge: [{ fact: "La conchiglia va aperta col canto della marea, non spezzata", source: "loc_faro", revealedBy: "clu_diario_conchiglia" }],
    relationships: [{ npc: "npc_lio", kind: "mentore" }],
    behaviors: [{ situation: "Liberato", reaction: "Spiega come aprire la conchiglia e aiuta col faro" }] }),
  N("npc_ruggero", { name: "Ruggero Spina", species: "umano", role: "Capo dei contrabbandieri", status: "vivo", location: "loc_covo", factions: ["fac_spina"],
    personality: "Sfrontato, avido, superstizioso.", motivations: ["Soldi", "Salvare la pelle"], goals: ["Vendere i carichi dei relitti"], fears: ["La strega del mare"], secrets: ["Ha visto la strega una volta"],
    knowledge: [{ fact: "Ottavia ha portato Bastiano sotto il faro", source: "evt_rapimento", revealedBy: "clu_ruggero" }],
    relationships: [{ npc: "npc_ottavia", kind: "debito" }],
    schedule: [{ fromDay: -1, toDay: -1, location: "loc_faro" }],
    behaviors: [{ situation: "Scopre che la Santa Brezza porta pellegrini", reaction: "Cambia lato e consegna il libro mastro" }, { situation: "Sotto metà PF", reaction: "Si arrende e tratta" }],
    combat: [{ monsterKey: "srd-2024_bandit-captain" }] }),
  N("npc_malvezzi", { name: "Corrado Malvezzi", species: "umano", role: "Mercante", status: "vivo", location: "loc_magazzino",
    personality: "Antipatico, aggressivo a parole, mai violento.", motivations: ["Guadagnare"], goals: ["Recuperare le perdite della nave affondata"], secrets: ["Compra merce dei relitti, ma solo dopo i naufragi"],
    behaviors: [{ situation: "Accusato", reaction: "Minaccia avvocati e mostra le ricevute" }] }),
  N("npc_teodora", { name: "Nonna Teodora", species: "umana", role: "Pescatrice anziana", status: "vivo", location: "loc_casa_teodora",
    personality: "Parla per filastrocche, memoria lunghissima.", motivations: ["Che qualcuno ascolti le storie"], goals: ["Avvertire la città prima della notte nera"],
    behaviors: [{ situation: "Ascoltata con pazienza", reaction: "Racconta la filastrocca della decima" }, { situation: "Le si parla di Lio", reaction: "Completa la storia del ragazzo tornato dal mare" }],
    knowledge: [{ fact: "Le notti nere di sette e quattordici anni fa", source: "loc_salmastra" }] }),
  N("npc_elsa", { name: "Elsa Bruma", species: "umana", role: "Marinaia sopravvissuta", status: "vivo", location: "loc_ancora",
    motivations: ["Rabbia per l'equipaggio perduto"], goals: ["Vendicare l'equipaggio"], schedule: [{ fromDay: 1, toDay: 1, location: "loc_spiaggia" }],
    behaviors: [{ situation: "Salvata dai PG", reaction: "Racconta della luce verde e chiede di unirsi alla caccia" }], knowledge: [{ fact: "Il faro era verde e più a nord", source: "evt_naufragio2" }] }),
  N("npc_strega", { name: "Nonna Salsedine", species: "strega del mare", role: "Antagonista", status: "vivo", location: "loc_grotta",
    motivations: ["Fame di anime annegate"], goals: ["Le anime della decima"], secrets: ["Il suo potere sul patto vive nella conchiglia"],
    behaviors: [{ situation: "Sotto metà PF", reaction: "Offre di rinnovare il patto, poi fugge nell'acqua con la conchiglia" }],
    combat: [{ monsterKey: "srd-2024_sea-hag", note: "con 2 Merrow e 2 Reef Shark (+4 Sahuagin Warrior con 5 PG)" }] }),

  // --- Oggetti ---
  { key: "itm_lanterna", type: "item", data: { name: "Lanterna dal vetro verde", kind: "altro", origin: "loc_spiaggia", description: "La luce falsa dei contrabbandieri. La strega la riconosce come sua." } },
  { key: "itm_diario", type: "item", data: { name: "Diario di Bastiano", kind: "documento", origin: "loc_faro", description: "Pagine mezze bruciate nella stufa del faro." } },
  { key: "itm_registro", type: "item", data: { name: "Registro delle ronde", kind: "documento", origin: "loc_capitaneria" } },
  { key: "itm_libro", type: "item", data: { name: "Libro mastro della Spina", kind: "documento", origin: "loc_covo", holder: "npc_ruggero" } },
  { key: "itm_conchiglia", type: "item", data: { name: "Conchiglia a spirale", kind: "magico", origin: "loc_grotta", holder: "npc_strega", description: "Contiene l'ultimo respiro di Lio. CA 15, 10 PF. Va aperta (azione, Arcano o Esecuzione CD 13), non distrutta." } },
  { key: "itm_pozioni", type: "item", data: { name: "2 pozioni di guarigione", kind: "consumabile", origin: "loc_grotta" } },

  // --- Mistero e indizi ---
  { key: "mys_decima", type: "mystery", data: { name: "Chi spegne il faro?", question: "Perché le navi naufragano e chi c'è dietro?",
    solution: "Ottavia Rendina ha fatto spegnere il faro e accendere la luce verde per pagare a Nonna Salsedine la decima che tiene in vita Lio.",
    culprit: "npc_ottavia",
    clues: ["clu_lente", "clu_elsa", "clu_tracce", "clu_registro", "clu_libro", "clu_diario_olio", "clu_teodora", "clu_riflesso", "clu_diario_conchiglia", "clu_ruggero"],
    redHerrings: ["clu_malvezzi"] } },
  C("clu_lente", { name: "Il faro sabotato", text: "Serbatoio dell'olio vuoto ma pulito, lente coperta da una vela catramata.", foundAtLocation: "loc_faro", check: "Indagare CD 10" }),
  C("clu_elsa", { name: "La luce verde", text: "Il faro c'era, ma era verde e più a nord.", foundWithNpc: "npc_elsa" }),
  C("clu_tracce", { name: "Tracce di carri", text: "Casse trascinate prima dell'alba verso le saline.", foundAtLocation: "loc_spiaggia", check: "Sopravvivenza CD 12" }),
  C("clu_registro", { name: "Ronde spostate", text: "Nelle tre notti la ronda del molo è stata spostata con la firma di Ottavia.", foundAtLocation: "loc_capitaneria", foundInItem: "itm_registro", check: "Indagare CD 13" }),
  C("clu_libro", { name: "Pagamenti a O.R.", text: "Pagamenti a O.R. e un ordine con il sigillo della Capitaneria.", foundAtLocation: "loc_covo", foundInItem: "itm_libro", check: "Persuasione CD 15 o Scassinare CD 13" }),
  C("clu_diario_olio", { name: "Gli otri di Ottavia", text: "Ottavia è venuta al tramonto con due otri di olio; non sono mai arrivati.", foundAtLocation: "loc_faro", foundInItem: "itm_diario" }),
  C("clu_teodora", { name: "La filastrocca della decima", text: "Ogni sette anni il mare chiede una nave; sette anni fa un ragazzo tornò dal mare.", foundWithNpc: "npc_teodora" }),
  C("clu_riflesso", { name: "Il ragazzo senza riflesso", text: "Lio non ha riflesso nell'acqua salata e tossisce acqua di mare.", foundWithNpc: "npc_lio", check: "Percezione CD 14" }),
  C("clu_diario_conchiglia", { name: "La conchiglia", text: "Il respiro del ragazzo è là sotto: va aperta col canto della marea, non spezzata.", foundAtLocation: "loc_faro", foundInItem: "itm_diario" }),
  C("clu_malvezzi", { name: "Malvezzi si arricchisce", text: "Malvezzi compra a poco la merce dei relitti.", foundWithNpc: "npc_malvezzi", truthful: false, debunkedBy: "clu_ricevute" }),
  C("clu_ricevute", { name: "Ricevute di Malvezzi", text: "Le ricevute sono datate dopo i naufragi e una delle navi era sua.", foundAtLocation: "loc_magazzino", check: "Indagare CD 12" }),
  { key: "clu_ruggero", type: "clue", data: { mystery: "mys_decima", name: "La confessione della Spina", text: "Ottavia ha portato Bastiano giù, sotto il faro, con le sue mani.", foundWithNpc: "npc_ruggero", requires: ["qst_saline"] } },
  { key: "clu_mappa", type: "clue", data: { name: "La mappa con la X", text: "Una X sotto il promontorio di Sant'Erma, accessibile via mare o dalla cantina del faro.", foundAtLocation: "loc_covo" } },

  // --- Eventi ---
  { key: "evt_patto", type: "event", data: { name: "Il patto della marea", kind: "storico", day: -2555, location: "loc_grotta", participants: ["npc_ottavia", "npc_strega"], happened: true,
    description: "Ottavia scende nella grotta e riavrà Lio in cambio di una nave ogni sette anni." } },
  { key: "evt_naufragio1", type: "event", data: { name: "Primo naufragio", kind: "storico", day: -2, location: "loc_spiaggia", happened: true, description: "Un mercantile si fracassa sugli scogli." } },
  { key: "evt_rapimento", type: "event", data: { name: "Rapimento di Bastiano", kind: "storico", day: -1, location: "loc_faro", participants: ["npc_ottavia", "npc_ruggero"], happened: true,
    description: "Bastiano scopre il patto e viene portato nella grotta.",
    effects: [{ kind: "npcStatus", target: "npc_bastiano", value: "prigioniero" }, { kind: "npcLocation", target: "npc_bastiano", valueRef: "loc_grotta" }] } },
  { key: "evt_naufragio2", type: "event", data: { name: "Secondo naufragio", kind: "previsto", day: 1, location: "loc_spiaggia", participants: ["npc_elsa"], description: "All'alba della sessione 1: la nave di Malvezzi si arena, Elsa è nella risacca." } },
  { key: "evt_agguato", type: "event", data: { name: "La luce verde", kind: "previsto", day: 1, location: "loc_scogliera", requires: ["evt_naufragio2"], trigger: "Notte della sessione 1",
    description: "I contrabbandieri accendono la lanterna e saccheggiano il relitto (Incontro 1)." } },
  { key: "evt_tempesta", type: "event", data: { name: "La notte della decima", kind: "previsto", day: 3, location: "loc_grotta", participants: ["npc_strega"], requires: ["evt_agguato"], trigger: "Mezzanotte della sessione 3",
    description: "Se il faro è spento, la Santa Brezza naufraga." } },

  // --- Missioni ---
  { key: "qst_faro", type: "quest", data: { name: "Il faro spento", kind: "principale", act: 1, chapter: 1, giver: "npc_ottavia",
    premise: "Il faro è spento e il guardiano è scomparso.", objective: "Scoprire perché il faro è spento e chi accende la luce verde.",
    locations: ["loc_spiaggia", "loc_salmastra", "loc_faro", "loc_scogliera"], npcs: ["npc_ottavia", "npc_elsa", "npc_lio", "npc_malvezzi", "npc_teodora"],
    clues: ["clu_lente", "clu_elsa", "clu_tracce", "clu_diario_olio", "clu_malvezzi", "clu_ricevute"], requiredClues: ["clu_lente"],
    obstacles: ["La Passerella si allaga con l'alta marea", "Incontro 1: predoni dei relitti (550 PE con 4 PG)"],
    twists: ["La lanterna dal vetro verde"],
    outcomes: [{ label: "Predoni sconfitti, prigioniero catturato", effects: [{ kind: "factionStanding", target: "fac_spina", value: "-1" }] }, { label: "Predoni in fuga", description: "Nessun prigioniero: la pista per le saline resta solo nelle tracce dei carri." }],
    rewards: [{ kind: "oggetto", item: "itm_lanterna" }, { kind: "informazione", text: "La pista porta alle Saline Vecchie" }], status: "non iniziata" } },
  { key: "qst_saline", type: "quest", data: { name: "Sale e segreti", kind: "principale", act: 1, chapter: 2, giver: "npc_ottavia",
    premise: "Le tracce portano alle Saline Vecchie.", objective: "Trovare il covo della Spina e scoprire chi paga i naufragi.",
    prerequisites: [{ target: "qst_faro" }], locations: ["loc_capitaneria", "loc_saline", "loc_covo", "loc_casa_teodora"], npcs: ["npc_ruggero", "npc_teodora", "npc_lio", "npc_ottavia"],
    clues: ["clu_registro", "clu_libro", "clu_teodora", "clu_riflesso", "clu_mappa", "clu_ruggero"], requiredClues: ["clu_tracce"],
    obstacles: ["Incontro 2: luci nella salina (550 PE)", "Incontro 3: il covo, evitabile (850 PE)"],
    twists: ["Ruggero può cambiare lato", "Ottavia sparisce con Lio al tramonto"],
    outcomes: [{ label: "Ruggero alleato", effects: [{ kind: "factionStanding", target: "fac_spina", value: "1" }] }, { label: "Covo distrutto", effects: [{ kind: "nota", value: "Nessuna barca per la sessione 3" }] }],
    rewards: [{ kind: "oggetto", text: "Otre d'olio da faro" }], status: "non iniziata" } },
  { key: "qst_decima", type: "quest", data: { name: "La notte della decima", kind: "principale", act: 1, chapter: 3, giver: "npc_lio",
    premise: "Arriva la tempesta e con lei la Santa Brezza.", objective: "Riaccendere il faro prima di mezzanotte, liberare Bastiano e affrontare Nonna Salsedine.",
    prerequisites: [{ target: "qst_saline" }], locations: ["loc_faro", "loc_grotta"], npcs: ["npc_strega", "npc_bastiano", "npc_lio", "npc_ottavia"],
    clues: ["clu_diario_conchiglia"], requiredClues: ["clu_mappa"],
    obstacles: ["Tempesta sulla Passerella", "Incontro 4: Nonna Salsedine (1550 PE con 4 PG, alto)"],
    twists: ["La strega offre di rinnovare il patto"],
    outcomes: [
      { label: "L'alba buona", description: "Faro acceso, strega uccisa, conchiglia aperta: Lio vive davvero.", effects: [{ kind: "npcStatus", target: "npc_strega", value: "morto" }, { kind: "npcStatus", target: "npc_bastiano", value: "vivo" }] },
      { label: "La salvezza a metà", description: "Faro acceso, strega fuggita: il patto resta.", effects: [{ kind: "npcStatus", target: "npc_bastiano", value: "vivo" }] },
      { label: "La schiuma", description: "Conchiglia distrutta: Lio si dissolve.", effects: [{ kind: "npcStatus", target: "npc_lio", value: "morto" }, { kind: "npcStatus", target: "npc_strega", value: "morto" }] },
      { label: "La notte nera", description: "Faro spento: la Santa Brezza naufraga." },
      { label: "Il patto rinnovato", description: "Un PG accetta l'offerta della strega." }],
    rewards: [{ kind: "oro", text: "50 mo a testa" }, { kind: "oggetto", item: "itm_pozioni" }, { kind: "xp", text: "Passaggio al 4° livello" }], status: "non iniziata" } },

  // --- Sessioni ---
  { key: "ses_1", type: "session", data: { name: "Il faro spento", number: 1, act: 1, chapter: 1, quests: ["qst_faro"], events: ["evt_naufragio2", "evt_agguato"],
    summary: "Relitto all'alba (15'), Salmastra (35'), il faro (35'), la luce verde e i predoni (30')." } },
  { key: "ses_2", type: "session", data: { name: "Sale e segreti", number: 2, act: 1, chapter: 2, quests: ["qst_saline"],
    summary: "Registro (15'), saline e fuochi fatui (35'), covo della Spina (45'), la verità su Lio (25')." } },
  { key: "ses_3", type: "session", data: { name: "La notte della decima", number: 3, act: 1, chapter: 3, quests: ["qst_decima"], events: ["evt_tempesta"],
    summary: "Preparativi (15'), faro nella tempesta (30'), Grotta della Marea (50'), epilogo (25')." } },
];

const dbArg = process.argv.indexOf("--db");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dcs-salm-"));
const dbPath = dbArg > 0 ? process.argv[dbArg + 1] : ":memory:";
const store = new Store(openDb(dbPath), { backupDir: path.join(tmp, "backups") });
const { campaignId } = store.importBundle({ campaign, entities }, { source: "avventura scritta a mano" });
const saved = store.getCampaign(campaignId);
const list = store.listEntities(campaignId);
const report = checkCoherence(saved, list);

fs.mkdirSync(out, { recursive: true });
const write = (name, text) => fs.writeFileSync(path.join(out, name), text, "utf8");
write("la-decima-di-salmastra.campagna.json", JSON.stringify(store.exportPayload(campaignId), null, 2));
write("la-decima-di-salmastra.campagna.md", campaignToMarkdown(saved, list));
write("la-decima-di-salmastra.campagna.html", campaignToHtml(saved, list));
write("la-decima-di-salmastra.coerenza.json", JSON.stringify(report, null, 2));
console.log(`${saved.title}: ${list.length} elementi, database ${dbPath}`);
console.log("Coerenza:", report.summary);
for (const i of report.issues) console.log(`- [${i.severity}] ${i.rule}: ${i.message}`);
fs.rmSync(tmp, { recursive: true, force: true });
