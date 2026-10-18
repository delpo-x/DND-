// Generatore narrativo DETERMINISTICO: stesso seed + stessi parametri => stessa campagna. Nessuna rete, nessuna IA.
// Costruisce un grafo coerente per costruzione: ogni indizio ha una fonte raggiungibile, ogni missione ha prerequisiti
// esistenti, ogni PNG presente a un evento è dove deve essere. Il controllo di coerenza (coherence.js) lo verifica comunque.
import { Rng } from "./rng.js";
import { THEMES, TONES, ROLES, FIRST_M, FIRST_F, SURNAMES, SPECIES, TOWNS, VILLAGES, REGIONS, WILDS, noun, fmt, FIELD_VARIANTS } from "./content.js";
import { generateDungeon } from "./dungeon.js";
import { loadCreatures } from "./rules.js";

const splitArticle = (s) => {
  const m = s.match(/^(il|lo|la|le|i|gli|l')\s?(.+)$/i);
  return m ? noun(m[1].toLowerCase(), m[2]) : noun("", s);
};

export const DEFAULT_PARAMS = { tone: "eroico", danger: "medio", players: 4, startLevel: 1, endLevel: 5, sessions: 8 };

/**
 * Restituisce un bundle: { campaign, entities: [{key, type, data}] } con riferimenti espressi come chiavi.
 * store.importBundle() assegna gli id definitivi e valida tutto in transazione.
 */
export function generateCampaignBundle(input = {}) {
  const p = { ...DEFAULT_PARAMS, ...input };
  p.seed = String(p.seed ?? Date.now());
  const rng = new Rng(`campagna:${p.seed}`);
  const theme = input.themeId ? THEMES.find((t) => t.id === input.themeId) : null;
  if (input.themeId && !theme) throw new Error(`Tema sconosciuto: ${input.themeId}`);
  const chosen = theme ?? rng.fork("tema").pick(THEMES.filter((t) => t.tones.includes(p.tone)).concat(THEMES));
  const tone = TONES[p.tone] ?? TONES.eroico;

  const n = rng.fork("nomi");
  const surnames = n.shuffle(SURNAMES);
  const used = new Set();
  const person = (g) => {
    let name;
    do name = `${n.pick(g === "m" ? FIRST_M : FIRST_F)} ${surnames[used.size % surnames.length]}`; while (used.has(name) && used.size < 60);
    used.add(name);
    return name;
  };
  const gen = () => (n.chance(0.5) ? "m" : "f");

  const region = splitArticle(rng.fork("reg").pick(REGIONS));
  const townName = rng.fork("t").pick(TOWNS);
  const villageName = rng.fork("v").pick(VILLAGES);
  const wild = splitArticle(rng.fork("w").pick(WILDS));
  const gs = { giver: gen(), ally: gen(), rival: gen(), witness: gen(), merchant: gen(), villain: gen() };
  const names = Object.fromEntries(Object.entries(gs).map(([k, g]) => [k, person(g)]));
  const roleOf = (k) => ROLES[k][gs[k]];
  const villainRole = chosen.villainRole[gs.villain];

  const v = {
    threat: chosen.threat, relic: chosen.relic, ruin: chosen.ruin, sanctum: chosen.sanctum, ritual: chosen.ritual,
    pastCrime: chosen.pastCrime, firstSign: chosen.firstSign, villainMotive: chosen.villainMotive,
    region, town: townName, village: villageName, wild,
    factionA: chosen.factionA, factionB: chosen.factionB,
    giver: names.giver, ally: names.ally, rival: names.rival, witness: names.witness, merchant: names.merchant, villain: names.villain,
    villainRole, giverRole: roleOf("giver"), rivalRole: roleOf("rival"), allyRole: roleOf("ally"), witnessRole: roleOf("witness"), merchantRole: roleOf("merchant"),
    factionC: noun("la", `Setta di ${names.villain.split(" ")[0]}`),
    archive: noun("l'", `Archivio Civico di ${townName}`),
  };
  // la fazione ostile prende il nome della minaccia solo nei temi in cui ha senso (culto/intrigo)
  if (["culto", "intrigo"].includes(chosen.id)) v.factionC = chosen.threat;
  const T = (tpl, extra = {}) => fmt(tpl, { ...v, ...extra });

  const title = (p.title ?? "").trim() || rng.fork("titolo").pick(chosen.titles);
  const totalDays = Math.max(20, Math.round(p.sessions * 4));
  const ritualDay = totalDays;

  const E = [];
  const add = (key, type, data) => { E.push({ key, type, data }); return key; };

  // ---------------- Fazioni ----------------
  add("fac_a", "faction", {
    name: String(v.factionA.n), stance: "alleata", standing: 1,
    description: T("{FactionA} difende l'ordine in {town} e nella regione: ha poche risorse ma gode della fiducia della gente comune.", { factionA: v.factionA.toString() }),
    goals: ["mantenere la pace in " + townName, "scoprire la causa dei recenti segnali inquietanti"],
    resources: ["pattuglie e informatori locali", "accesso agli edifici pubblici"],
    leader: "npc_giver", headquarters: "loc_town", territories: ["loc_town", "loc_village"],
    relations: [{ faction: "fac_b", kind: "neutrale" }, { faction: "fac_c", kind: "nemica" }],
  });
  add("fac_b", "faction", {
    name: String(v.factionB.n), stance: "neutrale", standing: 0,
    description: T("{FactionB} controlla i commerci tra {town} e {village}. Cerca soprattutto di non perdere denaro, chiunque vinca.", { factionB: v.factionB.toString() }),
    goals: ["proteggere le rotte commerciali", "evitare di schierarsi apertamente"],
    resources: ["denaro e crediti", "carovane e guardie private"],
    leader: "npc_merchant", headquarters: "loc_town", territories: ["loc_town"],
    relations: [{ faction: "fac_a", kind: "neutrale" }, { faction: "fac_c", kind: "rivale" }],
  });
  add("fac_c", "faction", {
    name: String(v.factionC.n), stance: "ostile", standing: -2,
    description: T("{FactionC} agisce nell'ombra: nessuno ne conosce i membri e la sua esistenza è negata dai notabili.", { factionC: v.factionC.toString() }),
    goals: [T("portare a termine {ritual} nel giorno stabilito"), "eliminare o corrompere chiunque indaghi"],
    resources: chosen.villainResources,
    leader: "npc_villain", headquarters: "loc_sanctum", territories: ["loc_ruin", "loc_sanctum"],
    relations: [{ faction: "fac_a", kind: "nemica" }, { faction: "fac_b", kind: "rivale" }],
  });

  // ---------------- Luoghi ----------------
  add("loc_region", "location", {
    name: region.n, kind: "regione", access: "pubblico",
    description: T("{Region} è una terra di colline e boschi, attraversata da strade antiche. {mood}", { region: region.toString(), mood: tone.mood }),
    history: T("Pochi mesi fa {pastCrime} ha lasciato una ferita che la regione non ha ancora chiuso."),
    culture: T("Tre forze si contendono l'influenza: {factionA}, {factionB} e, nell'ombra, {factionC}."),
    economy: "Agricoltura, allevamento e il commercio lungo le strade principali.",
    politics: T("Le istituzioni sono deboli e ognuno cerca protezione dove la trova."),
    resources: ["grano", "legname", "pietra da costruzione"],
    legends: [T("Si dice che {firstSign}: chi lo ha visto non ama parlarne.")],
  });
  add("loc_town", "location", {
    name: townName, kind: "città", parent: "loc_region", access: "pubblico",
    description: T("{town} è il centro principale della regione: mura basse, un mercato affollato e una piazza dove si discute tutto ad alta voce."),
    history: "Fondata lungo un guado, è cresciuta commerciando con ogni viandante.",
    culture: T("Sede {factionA.di} e {factionB.di}."),
    economy: "Mercato settimanale, botteghe artigiane, locande.",
    politics: T("{FactionA} e {factionB} si guardano con sospetto, ma nessuna delle due vuole rompere la tregua."),
    resources: ["artigiani", "locande", "mercato"], legends: [],
    connections: [{ to: "loc_village", via: "strada battuta", days: 2 }, { to: "loc_wild", via: "sentiero tra i campi", days: 1 }, { to: "loc_archive", via: "una via del centro", days: 0 }],
  });
  add("loc_archive", "location", {
    name: String(v.archive.n), kind: "edificio", parent: "loc_town", access: "pubblico",
    description: "Un edificio basso di pietra, con scaffali carichi di registri e un odore di carta umida. Si accede su richiesta e con la supervisione di un archivista.",
    history: "Conserva i documenti ufficiali degli ultimi duecento anni.", culture: "", economy: "", politics: "Gestito dal consiglio cittadino.",
    resources: ["registri", "mappe"], legends: [], connections: [],
  });
  add("loc_village", "location", {
    name: villageName, kind: "villaggio", parent: "loc_region", access: "pubblico",
    description: T("{village} è un piccolo villaggio di pastori e contadini, dove ognuno conosce i segreti di tutti gli altri ma finge di non sapere nulla."),
    history: T("È stato il primo luogo in cui si è manifestato il fenomeno: {firstSign}."),
    culture: "Tradizioni rurali e una forte diffidenza verso i forestieri.", economy: "Pastorizia e piccoli raccolti.", politics: "Governato da un consiglio di anziani.",
    resources: ["lana", "formaggio"], legends: [],
    connections: [{ to: "loc_town", via: "strada battuta", days: 2 }, { to: "loc_wild", via: "mulattiera", days: 1 }],
  });
  add("loc_wild", "location", {
    name: wild.n, kind: "natura", parent: "loc_region", access: "pubblico",
    description: T("{Wild} separa i centri abitati dalle rovine. Il percorso è insidioso e di notte è meglio non attraversarlo.", { wild: wild.toString() }),
    history: "", culture: "", economy: "", politics: "Terra di nessuno: né la guardia né i mercanti la pattugliano.",
    resources: ["selvaggina", "erbe medicinali"], legends: [],
    connections: [{ to: "loc_town", via: "sentiero", days: 1 }, { to: "loc_village", via: "mulattiera", days: 1 }, { to: "loc_ruin", via: "vecchia strada lastricata", days: 1 }],
  });
  add("loc_ruin", "location", {
    name: String(v.ruin.n), kind: "dungeon", parent: "loc_region", access: "pubblico",
    description: T("{Ruin} sorge in un luogo isolato oltre {wild}: da anni nessuno si avvicina volentieri.", { wild: wild.toString() }),
    history: T("Qui è avvenuto {pastCrime}."), culture: "", economy: "", politics: "",
    resources: [], legends: [T("Si racconta che nelle sue profondità si nasconda ciò che nessuno ha il coraggio di cercare.")],
    connections: [{ to: "loc_wild", via: "vecchia strada lastricata", days: 1 }],
  });
  add("loc_sanctum", "location", {
    name: String(v.sanctum.n), kind: "dungeon", parent: "loc_region", access: "segreto", unlockedBy: "clue_t4",
    description: T("{Sanctum} non compare su alcuna mappa. Vi si accede soltanto conoscendone il passaggio.", { sanctum: v.sanctum.toString() }),
    history: T("Qui {villain} prepara {ritual}."), culture: "", economy: "", politics: "",
    resources: [], legends: [], connections: [{ to: "loc_ruin", via: "passaggio nascosto", days: 0 }],
  });

  // ---------------- PNG ----------------
  const sp = (k) => n.fork("sp" + k).pick(SPECIES);
  const npc = (key, role, g, o) => add(key, "npc", { name: names[key.replace("npc_", "")], species: sp(key), role, status: "vivo", ...o });

  npc("npc_giver", v.giverRole, gs.giver, {
    description: T("Corporatura solida e sguardo stanco: {giver} ha l'aria di chi dorme poco da settimane."),
    personality: "Onesto, burocratico, protettivo con i suoi uomini; diventa ostinato quando si sente criticato.",
    motivations: ["proteggere la città e i suoi abitanti", "non ripetere l'errore commesso anni fa"],
    goals: ["trovare chi si cela dietro i segnali inquietanti", "ottenere prove solide prima di accusare un notabile"],
    fears: ["di essere ritenuto responsabile di un nuovo disastro", "di scoprire un traditore nelle proprie file"],
    conflicts: [T("Deve rispondere a {villain}, che ha l'autorità per rimuoverlo dall'incarico.")],
    location: "loc_town",
    schedule: [{ fromDay: -4, toDay: -2, location: "loc_village" }],
    knowledge: [
      { fact: T("Dopo {pastCrime} la guardia ha trovato un simbolo che non appartiene a nessuna casata nota."), hidden: false, source: "loc_ruin" },
      { fact: T("Sospetta che qualcuno ai vertici ostacoli le indagini."), hidden: true, source: "evt_past2", revealedBy: "clue_t3" },
    ],
    secrets: ["Ha insabbiato un rapporto per paura di creare panico."], lies: ["Afferma di non avere sospetti su nessuno."],
    relationships: [{ npc: "npc_ally", kind: "alleato", note: "si fida del suo giudizio" }, { npc: "npc_villain", kind: "rivale", note: "tensione per l'autorità sulle indagini" }],
    factions: ["fac_a"],
    behaviors: [
      { situation: "I PG gli portano prove concrete", reaction: "Le accetta e mette a disposizione uomini e permessi, ma chiede di agire con discrezione." },
      { situation: "I PG accusano apertamente un notabile senza prove", reaction: "Prende le distanze per non compromettere la guardia e li invita a ritirare l'accusa." },
      { situation: "Un suo uomo è in pericolo", reaction: "Abbandona ogni prudenza e interviene di persona." },
    ],
    dialogues: ["«Non ho abbastanza uomini per tutto questo. Se avete occhi per vedere, usateli.»", "«Portatemi prove, non voci. Le voci le ho già.»"],
  });
  npc("npc_ally", v.allyRole, gs.ally, {
    description: T("Magr{o} e curv{o} sui libri, {ally} porta sempre un guanto di tela per maneggiare i documenti antichi.", { o: gs.ally === "m" ? "o" : "a" }),
    personality: "Curioso e meticoloso; parla poco ma ricorda tutto. Si emoziona davanti a un documento raro.",
    motivations: ["preservare la verità storica della regione", "riscattare la memoria di un mentore caduto in disgrazia"],
    goals: ["catalogare i registri finora ignorati", "provare chi ha manomesso gli atti ufficiali"],
    fears: ["che i documenti vengano distrutti", "di essere scoperto mentre sbircia nei registri riservati"],
    conflicts: ["La lealtà all'archivio contrasta con il desiderio di dire ciò che ha scoperto."],
    location: "loc_archive",
    knowledge: [
      { fact: T("Ha riconosciuto il simbolo {factionC.di} in un vecchio registro."), hidden: false, source: "clue_t1" },
      { fact: T("Sa che qualcuno ha consultato di notte i registri che riguardano {ruin}."), hidden: true, source: "loc_archive", revealedBy: "clue_t3" },
    ],
    secrets: ["Ha copiato di nascosto alcune pagine dei registri riservati."], lies: [],
    relationships: [{ npc: "npc_giver", kind: "alleato", note: "gli passa informazioni" }, { npc: "npc_witness", kind: "favore", note: "gli deve un favore per una ricerca sulla famiglia" }],
    factions: ["fac_a"],
    behaviors: [
      { situation: "I PG chiedono accesso ai registri", reaction: "Li guida con zelo, ma pretende che nulla venga portato via." },
      { situation: "Qualcuno minaccia l'archivio", reaction: "Nasconde i registri più preziosi e cerca la guardia." },
    ],
    dialogues: ["«Un documento è più affidabile di un testimone, ma entrambi possono mentire.»", "«Se cercate la verità, partite sempre dalle date.»"],
  });
  npc("npc_rival", v.rivalRole, gs.rival, {
    description: T("{rival} indossa un mantello consunto e porta una balestra sempre carica. Sorride poco e osserva molto."),
    personality: "Orgoglioso, competitivo, ma ha un proprio codice d'onore. Non sopporta chi si prende i meriti altrui.",
    motivations: ["guadagnarsi una reputazione che nessuno possa discutere", "ripagare un debito con " + names.merchant],
    goals: ["incassare la taglia legata alle indagini", "dimostrare di essere migliore dei PG"],
    fears: ["di restare povero e dimenticato", "che il suo nome sia legato a un crimine"],
    conflicts: ["Vuole la ricompensa, ma la sua coscienza lo spinge a non mandare innocenti sul patibolo."],
    location: "loc_village",
    schedule: [{ fromDay: -41, toDay: -39, location: "loc_ruin" }],
    knowledge: [{ fact: T("Ha visto {villain} entrare {ruin.a} di notte, ma non ha capito chi fosse davvero."), hidden: true, source: "evt_past1", revealedBy: "clue_t2" }],
    secrets: ["Ha rubato un oggetto da un cadavere, e quell'oggetto ora lo incrimina."], lies: ["Sostiene di non essere mai stato nelle rovine."],
    relationships: [{ npc: "npc_merchant", kind: "debito", note: "deve denaro per l'attrezzatura" }, { npc: "npc_witness", kind: "rivale", note: "il pastore lo accusa di aver rubato" }],
    factions: ["fac_b"],
    behaviors: [
      { situation: "I PG lo accusano senza prove", reaction: "Reagisce con rabbia e li sfida a provarlo." },
      { situation: "I PG gli offrono denaro o una parte della taglia", reaction: "Accetta di collaborare finché il compenso è garantito." },
      { situation: "Viene scagionato dai PG", reaction: "Rimane in debito e può diventare un alleato leale." },
    ],
    dialogues: ["«Se avessi voluto farvi del male, non ve ne sareste accorti.»", "«Il mio debito lo pago io. Pensate al vostro.»"],
    combat: [{ monsterKey: "", note: "Usare un 'Bandit Captain' o equivalente SRD (da scegliere con il DM)" }],
  });
  npc("npc_villain", v.villainRole, gs.villain, {
    description: T("{villain} è {villainRole}: elegante, cordiale, impeccabile. Nessuno ricorda di averl[o|a] mai vist[o|a] perdere la calma.", { g: gs.villain }),
    personality: "Carismatico e persuasivo; convinto di agire per un bene superiore. Non alza mai la voce, e non perdona il tradimento.",
    motivations: [T("{VillainMotive}")], goals: chosen.villainPlan,
    fears: [`di essere smascherato prima di ${v.ritual.di}`, "di perdere il controllo su ciò che ha messo in moto"],
    conflicts: ["Sa che i suoi metodi sono crudeli e continua a ripetersi che il fine li giustifica."],
    location: "loc_town",
    schedule: [
      { fromDay: -45, toDay: -35, location: "loc_ruin" },
      { fromDay: 10, toDay: 14, location: "loc_town" },
      { fromDay: ritualDay - 5, toDay: ritualDay + 5, location: "loc_sanctum" },
    ],
    knowledge: [
      { fact: T("Conosce la posizione e il funzionamento {sanctum.di}."), hidden: true, source: "evt_past1", revealedBy: "clue_t4" },
      { fact: T("Sa chi tra gli influenti è stato corrotto o ricattato."), hidden: true, source: "evt_past1", revealedBy: "clue_t4" },
    ],
    secrets: [T("È il vero capo {factionC.di}.")], lies: ["Afferma di sostenere l'inchiesta della guardia."],
    relationships: [{ npc: "npc_merchant", kind: "debito", note: "tiene per sé una cambiale che lo rende ricattabile" }, { npc: "npc_giver", kind: "rivale", note: "finge di sostenerlo mentre ne ostacola le indagini" }],
    factions: ["fac_c"],
    behaviors: [
      { situation: "I PG si avvicinano alla verità", reaction: "Prima tenta di corromperli, poi di screditarli, infine di eliminarli." },
      { situation: "È messo alle strette in pubblico", reaction: "Sfrutta la sua autorità e accusa i PG di aver mentito." },
      { situation: T("Si avvicina {ritual}"), reaction: "Abbandona ogni prudenza e concentra tutte le risorse nel santuario." },
    ],
    dialogues: ["«Capisco la vostra preoccupazione, e la rispetto. Ma credo che stiate seguendo le persone sbagliate.»", "«Tutti vogliono la verità. Pochi sopportano di conoscerla.»"],
    combat: [{ monsterKey: "", note: "Da costruire a partire da una creatura SRD di GS vicino al livello finale del gruppo" }],
  });
  npc("npc_witness", v.witnessRole, gs.witness, {
    description: T("{witness} ha mani callose e un cappello di feltro che non toglie mai, nemmeno in casa."),
    personality: "Timido e testardo. Parla solo se si sente al sicuro; mente male e se ne vergogna.",
    motivations: ["proteggere la famiglia e il gregge", "ottenere giustizia per un parente scomparso"],
    goals: ["lasciare il villaggio se la situazione peggiora", "farsi credere"],
    fears: ["di essere preso per pazzo", "di diventare il prossimo scomparso"],
    conflicts: ["Vuole parlare ma teme ritorsioni."],
    location: "loc_village",
    knowledge: [
      { fact: T("Ha visto {firstSign} per primo, nel suo pascolo."), hidden: false, source: "evt_past2" },
      { fact: T("Ha notato un forestiero ben vestito che visitava {ruin} di notte."), hidden: true, source: "evt_past2", revealedBy: "clue_t2" },
    ],
    secrets: [], lies: ["Dice di non aver visto nulla se interrogato in pubblico."],
    relationships: [{ npc: "npc_ally", kind: "favore", note: "l'archivista ha aiutato la sua famiglia" }, { npc: "npc_rival", kind: "rivale", note: "lo accusa di un furto" }],
    factions: [],
    behaviors: [
      { situation: "Viene interrogato in pubblico", reaction: "Si chiude e nega tutto." },
      { situation: "Viene avvicinato con gentilezza e in privato", reaction: "Racconta quel che ha visto." },
    ],
    dialogues: ["«Io... ho visto qualcosa. Ma non qui, non davanti agli altri.»"],
  });
  npc("npc_merchant", v.merchantRole, gs.merchant, {
    description: T("{merchant} ha un'aria prospera e sempre affabile, con anelli a ogni dito e un registro dei conti sotto il braccio."),
    personality: "Affabile, calcolatore e prudente. Non fa nulla per niente, ma mantiene la parola data.",
    motivations: ["proteggere i commerci", "liberarsi di un debito pericoloso"],
    goals: ["recuperare un carico trattenuto", "restare neutrale finché possibile"],
    fears: ["di fallire", "che il suo debito diventi di dominio pubblico"],
    conflicts: [T("Il suo debito con {villain} lo costringe a coprire attività che non approva.")],
    location: "loc_town",
    knowledge: [{ fact: T("Sa che {villain} ha finanziato lavori {ruin.a}."), hidden: true, source: "loc_archive", revealedBy: "clue_t3" }],
    secrets: [T("Deve una forte somma a {villain}.")], lies: ["Nega di avere debiti."],
    relationships: [{ npc: "npc_villain", kind: "debito", note: "prestito segreto" }, { npc: "npc_rival", kind: "favore", note: "gli ha prestato l'attrezzatura" }],
    factions: ["fac_b"],
    behaviors: [
      { situation: "I PG offrono un affare vantaggioso", reaction: "Si mostra disponibile a collaborare." },
      { situation: "I PG minacciano di rivelare il debito", reaction: "Cede informazioni parziali e chiede discrezione." },
    ],
    dialogues: ["«Gli affari sono affari, ma un buon nome vale più dell'oro.»", "«Un favore oggi, un favore domani. Così si costruisce una città.»"],
  });

  // ---------------- Oggetti ----------------
  add("itm_relic", "item", {
    name: v.relic.n, kind: "magico", origin: "loc_sanctum", holder: "npc_villain",
    description: T("{Relic} è il fulcro {ritual.di}. Il suo vero potere è noto solo a chi ha studiato {ruin}.", { relic: v.relic.toString() }), value: "inestimabile",
  });
  add("itm_registro", "item", {
    name: "Registro dei lavori", kind: "documento", origin: "loc_archive",
    description: T("Un registro che elenca i finanziamenti ricevuti {ruin.da}, firmato con una sigla che corrisponde a {villain}."), value: "prova documentale",
  });
  add("itm_diario", "item", {
    name: "Diario scomparso", kind: "documento", origin: "loc_ruin",
    description: T("Un diario annerito dall'umidità, con una mappa del passaggio verso {sanctum} e le istruzioni {ritual.di}."), value: "prova documentale",
  });
  add("itm_amuleto", "item", {
    name: "Amuleto del buon affare", kind: "magico", origin: "q_s2",
    description: "Un amuleto di bronzo offerto come segno di gratitudine: garantisce un piccolo vantaggio nelle trattative, a discrezione del DM.", value: "50 mo",
  });

  // ---------------- Indizi e mistero ----------------
  add("clue_t1", "clue", {
    name: "Il simbolo nei registri", foundWithNpc: "npc_ally", check: "Indagare (CD 10)", truthful: true, mystery: "mys_main", requires: [],
    text: T("{ally} riconosce il simbolo trovato dopo {pastCrime}: compare in registri molto vecchi, collegato {threat.a}."),
  });
  add("clue_t2", "clue", {
    name: "La testimonianza", foundWithNpc: "npc_witness", check: "Intuizione o Persuasione (CD 12)", truthful: true, mystery: "mys_main", requires: [],
    text: T("{witness} rivela che, da quando {firstSign}, un forestiero ben vestito ha visitato {ruin} di notte, più di una volta."),
  });
  add("clue_t3", "clue", {
    name: "I finanziamenti", foundAtLocation: "loc_archive", foundInItem: "itm_registro", check: "Indagare (CD 13)", truthful: true, mystery: "mys_main", requires: ["clue_t1"],
    text: T("Un registro firmato indica che i lavori {ruin.a} sono stati pagati da {villain}: la pista porta al vertice, non a {rival}."),
  });
  add("clue_t4", "clue", {
    name: "Il diario e la mappa", foundAtLocation: "loc_ruin", foundInItem: "itm_diario", check: "Percezione o Indagare (CD 14)", truthful: true, mystery: "mys_main", requires: ["clue_t3"],
    text: T("Nelle profondità {ruin.di} un diario e una mappa rivelano il passaggio verso {sanctum} e lo scopo {ritual.di}."),
  });
  add("clue_f1", "clue", {
    name: "L'oggetto del rivale", foundAtLocation: "loc_village", check: "Indagare (CD 10)", truthful: false, mystery: "mys_main", debunkedBy: "clue_t3", requires: [],
    text: T("Accanto a una delle vittime si trova un oggetto che appartiene a {rival}: sembra indicarlo come colpevole."),
  });
  add("mys_main", "mystery", {
    name: T("Chi c'è dietro {threat}?"), culprit: "npc_villain",
    question: T("Chi sta provocando gli eventi che affliggono {region} e cosa vuole ottenere?", { region: region.toString() }),
    solution: T("{villain}, {villainRole}, {villainMotive}. {Ritual} è fissato per il giorno {day}.", { day: String(ritualDay), ritual: v.ritual.toString() }),
    clues: ["clue_t1", "clue_t2", "clue_t3", "clue_t4"], redHerrings: ["clue_f1"],
  });

  // ---------------- Eventi ----------------
  add("evt_past1", "event", {
    name: "Lavori notturni nel sito", kind: "storico", day: -40, location: "loc_ruin", participants: ["npc_villain", "npc_rival"], happened: true,
    description: T("{Villain} scopre {ruin} e ne comprende lo scopo; da allora ha iniziato a finanziare i lavori in segreto.", { }), requires: [], requiresKnowledge: [], trigger: "", effects: [],
  });
  add("evt_past2", "event", {
    name: "Il primo segno", kind: "storico", day: -3, location: "loc_village", participants: ["npc_witness", "npc_giver"], happened: true,
    description: T("Per la prima volta {firstSign}. {Witness} è tra i primi a notarlo."), requires: ["evt_past1"], requiresKnowledge: [], trigger: "", effects: [],
  });
  add("evt_market", "event", {
    name: "Il mercato straordinario", kind: "imprevisto", day: 6, location: "loc_town", participants: ["npc_merchant", "npc_ally"], happened: false,
    description: T("Un mercato straordinario affolla {town}: occasione per raccogliere voci, ma anche per essere osservati."), requires: [], requiresKnowledge: [],
    trigger: "I PG si trovano in città durante il giorno 6", effects: [],
  });
  add("evt_ambush", "event", {
    name: "Imboscata sulla strada", kind: "imprevisto", day: 12 - 4, location: "loc_wild", participants: [], happened: false,
    description: T("Predoni, o qualcuno che li ha pagati, attende i PG lungo {wild}: vogliono impedire che raggiungano le rovine.", { wild: wild.toString() }), requires: [], requiresKnowledge: [],
    trigger: "I PG viaggiano da " + townName + " verso le rovine", effects: [{ kind: "nota", value: "Incontro bilanciato per il gruppo (vedi generatore di incontri)" }],
  });
  add("evt_council", "event", {
    name: "Il consiglio cittadino", kind: "previsto", day: 12, location: "loc_town", participants: ["npc_giver", "npc_villain", "npc_merchant"], happened: false,
    description: T("Il consiglio si riunisce per decidere come rispondere ai segnali. {Villain} propone di chiudere l'inchiesta."), requires: ["evt_past2"],
    requiresKnowledge: ["clue_t1"], trigger: "", effects: [{ kind: "nota", value: "I PG possono intervenire solo se conoscono il simbolo (indizio 1)" }],
  });
  add("evt_ritual", "event", {
    name: T("{Ritual}", { ritual: v.ritual.toString() }), kind: "previsto", day: ritualDay, location: "loc_sanctum", participants: ["npc_villain"], happened: false,
    description: T("{Villain} compie {ritual} usando {relic}. Se nessuno lo ferma, le conseguenze ricadranno su tutta la regione.", { ritual: v.ritual.toString(), relic: v.relic.toString() }),
    requires: ["evt_council"], requiresKnowledge: [], trigger: "", effects: [{ kind: "nota", value: "Scadenza della campagna principale" }],
  });

  // ---------------- Missioni ----------------
  const eff = (kind, target, value, valueRef) => ({ kind, target, value: value ?? "", valueRef: valueRef ?? undefined });
  add("q_m1", "quest", {
    name: T("Segni a {village}", { }), kind: "principale", act: 1, chapter: 1, giver: "npc_giver", status: "non iniziata", chosenOutcome: "",
    premise: T("{giver} ha ricevuto notizie allarmanti: {firstSign}. La guardia non ha uomini da dedicare all'indagine."),
    objective: T("Raccogliere informazioni a {town} e a {village} e portare al Capitano le prove del simbolo."),
    prerequisites: [], locations: ["loc_town", "loc_village", "loc_archive"], npcs: ["npc_giver", "npc_ally", "npc_witness", "npc_rival"],
    clues: ["clue_t1", "clue_f1"], requiredClues: ["clue_t1"],
    obstacles: ["La gente del villaggio non vuole parlare con i forestieri.", T("{rival} ostacola le indagini per interesse personale.")],
    twists: ["La falsa pista (oggetto del rivale) sembra molto convincente."],
    outcomes: [
      { label: "Il rapporto è consegnato alla guardia", description: "Il Capitano ottiene i primi indizi ufficiali e apre l'indagine.", effects: [eff("factionStanding", "fac_a", "1")] },
      { label: "Il gruppo indaga in segreto", description: "I PG tengono per sé ciò che hanno scoperto; la guardia si sente scavalcata.", effects: [eff("factionStanding", "fac_a", "-1")] },
    ],
    rewards: [{ kind: "oro", text: "100 mo a testa", item: undefined }, { kind: "favore", text: "La fiducia del Capitano" }],
    consequences: "La guardia decide se fidarsi o meno del gruppo per il resto della campagna.",
  });
  add("q_s1", "quest", {
    name: "Il testimone esitante", kind: "secondaria", act: 1, chapter: 1, giver: "npc_witness", status: "non iniziata", chosenOutcome: "",
    premise: T("{witness} ha visto qualcosa ma ha troppa paura per parlarne in pubblico. Chiede aiuto per ottenere protezione."),
    objective: T("Convincere {witness} a parlare e scortarlo in un luogo sicuro."),
    prerequisites: [], locations: ["loc_village"], npcs: ["npc_witness", "npc_rival"], clues: ["clue_t2"], requiredClues: [],
    obstacles: [T("{rival} sorveglia il villaggio e non vuole testimoni.")], twists: ["Il testimone ha un parente tra gli scomparsi."],
    outcomes: [
      { label: "Il testimone si fida e racconta tutto", description: "Il gruppo ottiene la testimonianza completa.", effects: [] },
      { label: "Il testimone fugge a " + townName, description: "Spaventato, cerca rifugio in città; il villaggio resta senza testimone.", effects: [eff("npcLocation", "npc_witness", "", "loc_town")] },
    ],
    rewards: [{ kind: "informazione", text: "Testimonianza sul forestiero misterioso" }, { kind: "xp", text: "Premio in PE secondo la difficoltà" }],
    consequences: T("{Witness} ricorderà chi lo ha aiutato."),
  });
  add("q_s2", "quest", {
    name: "Il debito del mercante", kind: "secondaria", act: 2, chapter: 1, giver: "npc_merchant", status: "non iniziata", chosenOutcome: "",
    premise: T("{merchant} ha un carico bloccato lungo {wild} e teme per la sua reputazione. Offre un compenso a chi lo recupera.", { wild: wild.toString() }),
    objective: "Recuperare il carico e riportarlo a " + townName + " senza perdite.",
    prerequisites: [{ target: "q_m1", intentionalCycle: false }], locations: ["loc_town", "loc_wild"], npcs: ["npc_merchant", "npc_rival"], clues: [], requiredClues: [],
    obstacles: ["Predoni nella zona.", "Il carro è danneggiato."], twists: [T("{merchant} nasconde qualcosa nel carico.")],
    outcomes: [
      { label: "Il carico è recuperato", description: "Il mercante salda il debito con i PG.", effects: [eff("factionStanding", "fac_b", "1")] },
      { label: "Il carico è perduto e il mercante si ritiene tradito", description: "La Compagnia perde fiducia nel gruppo.", effects: [eff("factionStanding", "fac_b", "-1")] },
    ],
    rewards: [{ kind: "oggetto", text: "Amuleto del buon affare", item: "itm_amuleto" }, { kind: "oro", text: "150 mo" }],
    consequences: T("La reputazione presso {factionB} cambia."),
  });
  add("q_s3", "quest", {
    name: "Un nome da ripulire", kind: "secondaria", act: 2, chapter: 2, giver: "npc_rival", status: "non iniziata", chosenOutcome: "",
    premise: T("Dopo il ritrovamento del suo oggetto accanto alle vittime, {rival} teme di essere accusato e chiede ai PG di dimostrare la sua innocenza."),
    objective: T("Dimostrare che l'oggetto di {rival} non lo incolpa e individuare il vero responsabile."),
    prerequisites: [{ target: "q_s1", intentionalCycle: false }], locations: ["loc_archive", "loc_village"], npcs: ["npc_rival", "npc_ally"], clues: ["clue_t3"], requiredClues: ["clue_t3"],
    obstacles: ["Gli atti ufficiali sono incompleti.", "I testimoni sono stati intimiditi."], twists: [T("Il registro rivela che il vero finanziatore è molto vicino alla guardia.")],
    outcomes: [
      { label: "Il rivale è scagionato e diventa un alleato", description: T("{Rival} sistema il proprio debito e offre aiuto."), effects: [] },
      { label: "Il rivale lascia la regione", description: "Spaventato, rinuncia alla taglia e parte.", effects: [eff("npcLocation", "npc_rival", "", "loc_town")] },
    ],
    rewards: [{ kind: "informazione", text: "Il registro dei finanziamenti" }, { kind: "favore", text: T("La riconoscenza di {rival}") }],
    consequences: "La falsa pista viene definitivamente smentita.",
  });
  add("q_m2", "quest", {
    name: T("Le profondità {ruin.di}"), kind: "principale", act: 2, chapter: 3, giver: "npc_giver", status: "non iniziata", chosenOutcome: "",
    premise: T("Con le prove raccolte, il Capitano chiede ai PG di esplorare {ruin}, dove si ritiene sia custodita la prova decisiva."),
    objective: T("Entrare {ruin.in}, superare i suoi pericoli e recuperare il diario."),
    prerequisites: [{ target: "q_m1", intentionalCycle: false }, { target: "clue_t2", intentionalCycle: false }], locations: ["loc_wild", "loc_ruin"], npcs: ["npc_ally", "npc_giver"], clues: ["clue_t4"], requiredClues: ["clue_t3"],
    obstacles: ["Trappole e custodi nelle profondità.", "Un'imboscata lungo la strada."], twists: [T("Il diario porta un sigillo che il gruppo ha già visto.")],
    outcomes: [
      { label: "Il diario è recuperato e i sopravvissuti salvati", description: "La guardia loda il gruppo.", effects: [eff("factionStanding", "fac_a", "1")] },
      { label: "Il diario è recuperato, ma i sopravvissuti sono abbandonati", description: "La reputazione del gruppo ne risente.", effects: [eff("factionStanding", "fac_a", "-1")] },
    ],
    rewards: [{ kind: "xp", text: "Premio in PE secondo la difficoltà" }, { kind: "oggetto", text: "Diario scomparso", item: "itm_diario" }],
    consequences: T("Il gruppo ottiene la mappa verso {sanctum}."),
  });
  add("q_m3", "quest", {
    name: T("{Ritual}", { ritual: v.ritual.toString() }), kind: "principale", act: 3, chapter: 1, giver: "npc_giver", status: "non iniziata", chosenOutcome: "",
    premise: T("Con la mappa in mano, il gruppo sa dove e quando {villain} intende compiere {ritual}."),
    objective: T("Raggiungere {sanctum}, fermare {villain} e decidere il destino {relic.di}.", { sanctum: v.sanctum.toString() }),
    prerequisites: [{ target: "q_m2", intentionalCycle: false }, { target: "clue_t4", intentionalCycle: false }], locations: ["loc_sanctum"], npcs: ["npc_villain", "npc_ally", "npc_giver"],
    clues: [], requiredClues: ["clue_t3", "clue_t4"],
    obstacles: ["Custodi fanatici.", T("{villain} cerca di convincere i PG che sta agendo per il bene di tutti.")], twists: [T("{Villain} offre ai PG un accordo allettante.")],
    outcomes: [
      { label: "Smascherato e consegnato alla giustizia", description: T("{Villain} è catturat{o} e processat{o}.", { o: gs.villain === "m" ? "o" : "a" }), effects: [eff("npcStatus", "npc_villain", "prigioniero"), eff("factionStanding", "fac_a", "2")] },
      { label: "Ucciso nel santuario", description: T("{Villain} muore e con lui si spegne {ritual}.", { ritual: v.ritual.toString() }), effects: [eff("npcStatus", "npc_villain", "morto"), eff("factionStanding", "fac_c", "-3")] },
      { label: "Accordo con l'antagonista", description: T("I PG accettano l'offerta di {villain}: la regione è salva, ma a quale prezzo?"), effects: [eff("factionStanding", "fac_c", "3"), eff("factionStanding", "fac_a", "-2")] },
    ],
    rewards: [{ kind: "oggetto", text: v.relic.n, item: "itm_relic" }, { kind: "xp", text: "Premio in PE secondo la difficoltà" }],
    consequences: "L'esito determina il finale della campagna e il futuro della regione.",
  });

  // ---------------- Dungeon ----------------
  const midLevel = Math.max(1, Math.round((p.startLevel + p.endLevel) / 2));
  const dngRuin = generateDungeon({ seed: `${p.seed}:ruin`, level: midLevel, players: p.players, danger: p.danger, types: chosen.monsterTypes, name: String(v.ruin.n), rooms: 8 });
  const dngSanctum = generateDungeon({ seed: `${p.seed}:sanctum`, level: p.endLevel, players: p.players, danger: p.danger, types: chosen.monsterTypes, name: String(v.sanctum.n), rooms: 6 });
  linkRoom(dngRuin, ["segreta", "tesoro", "enigma"], { clues: ["clue_t4"], event: "evt_past1" });
  linkRoom(dngSanctum, ["boss"], { clues: [], event: "evt_ritual" });
  add("dng_ruin", "dungeon", { ...dngRuin, location: "loc_ruin" });
  add("dng_sanctum", "dungeon", { ...dngSanctum, location: "loc_sanctum" });

  // ---------------- Struttura narrativa ----------------
  const nSessions = Math.max(3, p.sessions);
  const structure = input.structure ?? "classica";
  if (!STRUCTURES[structure]) throw new Error(`Struttura narrativa sconosciuta: ${structure}`);
  if (structure !== "classica") {
    const get = (key) => E.find((e) => e.key === key).data;
    const ctx = { E, add, get, T, v, p, gs, townName, villageName, wild, chosen, midLevel, ritualDay };
    const beats = STRUCTURE_BUILDERS[structure](ctx);
    const title = (b) => b.quests.map((k) => get(k).name);
    // Ogni fase inizia in una sessione (la prima nella prima, la finale nell'ultima); le sessioni intermedie proseguono la fase in corso.
    // Con meno sessioni che fasi, più fasi si uniscono nella stessa sessione: nessuna missione resta fuori.
    const startOf = beats.map((_, j) => (j === beats.length - 1 ? nSessions - 1 : Math.floor((j * (nSessions - 1)) / (beats.length - 1))));
    let last = null;
    for (let i = 0; i < nSessions; i++) {
      const starting = beats.filter((_, j) => startOf[j] === i);
      const first = starting.length > 0;
      const b = first ? { ...starting[0], name: starting.map((x) => x.name).join(" / "), summary: starting.map((x) => x.summary).join(" "),
        quests: [...new Set(starting.flatMap((x) => x.quests))], events: starting.flatMap((x) => x.events), notes: starting.map((x) => x.notes).filter(Boolean).join(" ") } : last;
      last = b;
      add(`ses_${i + 1}`, "session", {
        name: `Sessione ${i + 1}: ${b.name}`, number: i + 1, act: b.act, chapter: b.chapter, played: false,
        summary: `${first ? b.summary : `Si prosegue: ${b.summary}`} Missioni disponibili: ${title(b).join(", ")}.`,
        quests: b.quests, events: first ? b.events : [], notes: b.notes ?? "",
      });
    }
  } else {
  // ---------------- Sessioni, atti e capitoli (struttura classica: atti in sequenza) ----------------
  const order = ["q_m1", "q_s1", "q_s2", "q_s3", "q_m2", "q_m3"];
  const questData = Object.fromEntries(E.filter((e) => e.type === "quest").map((e) => [e.key, e.data]));
  const eventsOf = { q_m1: ["evt_council"], q_s2: ["evt_market"], q_m2: ["evt_ambush"], q_m3: ["evt_ritual"] };
  for (let i = 0; i < nSessions; i++) {
    const qk = order[Math.floor((i * order.length) / nSessions)];
    const prevQ = i > 0 ? order[Math.floor(((i - 1) * order.length) / nSessions)] : null;
    // con meno di 6 sessioni una sessione copre più missioni, così nessuna resta fuori dal piano
    const from = Math.floor((i * order.length) / nSessions);
    const qs = order.slice(from, Math.max(from + 1, Math.floor(((i + 1) * order.length) / nSessions)));
    const q = questData[qk];
    const firstOfQuest = prevQ !== qk;
    const more = qs.slice(1).map((k) => `"${questData[k].name}"`);
    add(`ses_${i + 1}`, "session", {
      name: `Sessione ${i + 1}: ${q.name}`, number: i + 1, act: q.act, chapter: q.chapter, played: false,
      summary: (firstOfQuest ? `Il gruppo affronta la missione "${q.name}". ${q.premise}` : `Il gruppo prosegue con la missione "${q.name}": ${q.objective}`) + (more.length ? ` Poi: ${more.join(", ")}.` : ""),
      quests: qs, events: firstOfQuest ? qs.flatMap((k) => eventsOf[k] ?? []) : [], notes: "",
    });
  }
  }

  // ---------------- Campagna ----------------
  const campaign = {
    title,
    setting: (p.setting ?? "").trim() || T("{Region}: {mood}", { region: region.toString(), mood: tone.mood }),
    tone: p.tone, danger: p.danger, players: p.players, startLevel: p.startLevel, endLevel: p.endLevel, sessions: nSessions,
    premise: T("{Villain}, {villainRole} di {town}, nasconde un segreto: {villainMotive}. Il gruppo viene coinvolto quando {firstSign}.", { villain: v.villain }),
    centralConflict: chosen.conflict,
    worldState: T("Giorno 1. {worldState} {Region} non è ancora al corrente di quanto sta per accadere; {ritual} è previsto al giorno {day}.", { worldState: tone.worldState, region: region.toString(), ritual: v.ritual.toString(), day: String(ritualDay) }),
    currentDay: 1, seed: p.seed, rulesVersion: "srd-5.2 (2024)",
  };
  if (structure !== "classica") campaign.centralConflict = `${campaign.centralConflict} Struttura: ${STRUCTURES[structure].label.toLowerCase()} — ${STRUCTURES[structure].description}`;
  return { campaign, entities: E, meta: { theme: chosen.id, ritualDay, structure } };
}

/** Scheletri narrativi: stesso mondo (fazioni, luoghi, PNG, mistero), diverso modo di metterlo in gioco. */
export const STRUCTURES = {
  classica: { label: "Classica a tre atti", description: "le missioni si susseguono in ordine, ognuna sblocca la successiva." },
  indagine: { label: "Indagine a nodi", description: "i luoghi chiave si affrontano in qualsiasi ordine e ogni conclusione importante ha almeno tre indizi che la portano (regola dei tre indizi)." },
  sandbox: { label: "Sandbox a fazioni", description: "le missioni sono disponibili da subito e le fazioni portano avanti i loro piani a scadenze fisse se i personaggi non intervengono." },
  esplorazione: { label: "Esplorazione di dungeon", description: "la campagna si concentra sulle rovine, esplorate livello dopo livello, con la città come base per riposo, indizi e rifornimenti." },
};

// Ogni costruttore modifica le missioni del mondo base e restituisce le fasi di gioco (beats) su cui distribuire le sessioni.
const STRUCTURE_BUILDERS = {
  indagine({ add, get, T }) {
    // Nodi liberi: nessuna missione centrale dipende da un'altra; l'accesso alle rovine ha tre piste indipendenti.
    for (const k of ["q_s2", "q_s3", "q_m2"]) get(k).prerequisites = [];
    get("q_m2").requiredClues = [];
    get("q_m2").obstacles.push("L'ingresso giusto si trova seguendo una qualsiasi delle tre piste: i finanziamenti, la testimonianza o la leggenda degli anziani.");
    get("q_m3").requiredClues = ["clue_t4"];
    add("clue_n1", "clue", {
      name: "La cambiale", foundWithNpc: "npc_merchant", check: "Persuasione o Intimidire (CD 14)", truthful: true, mystery: "mys_main", requires: ["clue_t1"],
      text: T("{merchant} ammette di dovere una forte somma a {villain}, e che quel denaro è servito a pagare lavori {ruin.a}."),
    });
    add("clue_n2", "clue", {
      name: "Il forestiero riconosciuto", foundWithNpc: "npc_rival", check: "Intuizione (CD 12)", truthful: true, mystery: "mys_main", requires: ["clue_t2"],
      text: T("Sentita la descrizione del testimone, {rival} capisce chi ha visto quella notte: per abiti e modi era {villain}."),
    });
    add("clue_n3", "clue", {
      name: "La leggenda degli anziani", foundAtLocation: "loc_village", check: "Storia o Persuasione (CD 12)", truthful: true, mystery: "mys_main", requires: [],
      text: T("Gli anziani di {village} ricordano che sotto {ruin} si apre un passaggio murato da generazioni: qualcuno, di recente, lo ha riaperto."),
    });
    get("mys_main").clues.push("clue_n1", "clue_n2", "clue_n3");
    get("q_s2").clues.push("clue_n1"); get("q_s3").clues.push("clue_n2"); get("q_s1").clues.push("clue_n3");
    return [
      { name: "Il caso si apre", act: 1, chapter: 1, quests: ["q_m1", "q_s1"], events: ["evt_market"],
        summary: T("I PG ricevono l'incarico e possono indagare a {town} e a {village} nell'ordine che preferiscono.") },
      { name: "Piste aperte", act: 2, chapter: 1, quests: ["q_s2", "q_s3", "q_m2"], events: ["evt_council", "evt_ambush"],
        summary: "I nodi dell'indagine (il mercante, il rivale, le rovine) sono tutti raggiungibili: ogni pista porta verso le altre.",
        notes: "Regola dei tre indizi: se i giocatori mancano un indizio, ne restano altri due che portano alla stessa conclusione." },
      { name: "Il santuario", act: 3, chapter: 1, quests: ["q_m3"], events: ["evt_ritual"], summary: T("Con la mappa del passaggio, i PG affrontano {villain}.") },
    ];
  },
  sandbox({ add, get, T, gs, townName, villageName, ritualDay }) {
    // scadenze dei fronti: sempre prima che l'antagonista si ritiri nel santuario (5 giorni prima del rito)
    const d3 = Math.min(16, ritualDay - 6), d2 = Math.min(10, d3 - 4), d1 = Math.min(5, d2 - 3);
    for (const k of ["q_s2", "q_s3", "q_m2"]) get(k).prerequisites = [];
    add("q_f1", "quest", {
      name: "Un'offerta nell'ombra", kind: "secondaria", act: 1, chapter: 1, giver: "npc_villain", status: "non iniziata", chosenOutcome: "",
      premise: T("{Villain} avvicina i PG con cortesia: offre denaro e protezione in cambio di prove che screditino {giver}."),
      objective: T("Decidere se lavorare per {villain}, fingere di accettare per scoprire di più o rifiutare."),
      prerequisites: [], locations: ["loc_town"], npcs: ["npc_villain", "npc_giver"], clues: [], requiredClues: [],
      obstacles: [T("{Villain} è rispettat[o|a] e nessuno crederà a un'accusa senza prove.", { g: gs.villain })], twists: ["L'offerta è un test: chi accetta viene messo alla prova con un incarico sporco."],
      outcomes: [
        { label: "I PG accettano", description: T("{Villain} li considera utili e abbassa la guardia."), effects: [{ kind: "factionStanding", target: "fac_c", value: "1" }, { kind: "factionStanding", target: "fac_a", value: "-1" }] },
        { label: "I PG rifiutano", description: T("{Villain} li segna come ostacolo da rimuovere."), effects: [{ kind: "factionStanding", target: "fac_c", value: "-1" }] },
      ],
      rewards: [{ kind: "oro", text: "200 mo, se accettano" }],
      consequences: "Determina come la Setta tratterà il gruppo nelle settimane successive.",
    });
    add("evt_front1", "event", {
      name: T("Reclutamento a {village}"), kind: "previsto", day: d1, location: "loc_village", participants: [], happened: false,
      description: T("Se nessuno interviene, {factionC} recluta tra i più disperati di {village}: il villaggio smette di collaborare con i forestieri.", { factionC: String(get("fac_c").name) }),
      requires: [], requiresKnowledge: [], trigger: `Accade se i PG non hanno ancora visitato ${villageName} entro il giorno ${d1}`,
      effects: [{ kind: "factionStanding", target: "fac_c", value: "1" }],
    });
    add("evt_front2", "event", {
      name: "La Compagnia sceglie da che parte stare", kind: "previsto", day: d2, location: "loc_town", participants: ["npc_merchant"], happened: false,
      description: T("Schiacciat[o|a] dal debito, {merchant} cede alle pressioni e mette carovane e magazzini a disposizione {factionC.di}.", { g: gs.merchant }),
      requires: ["evt_front1"], requiresKnowledge: [], trigger: `Accade se il debito del mercante non è stato risolto entro il giorno ${d2}`,
      effects: [{ kind: "factionStanding", target: "fac_b", value: "-1" }],
    });
    add("evt_front3", "event", {
      name: "La guardia esautorata", kind: "previsto", day: d3, location: "loc_town", participants: ["npc_giver", "npc_villain"], happened: false,
      description: T("{Villain} ottiene dal consiglio la sospensione di {giver}: da questo momento la guardia non può più aiutare apertamente i PG."),
      requires: ["evt_front2"], requiresKnowledge: [], trigger: `Accade se ${townName} non ha ancora prove contro l'antagonista entro il giorno ${d3}`,
      effects: [{ kind: "factionStanding", target: "fac_a", value: "-1" }],
    });
    return [
      { name: "Il mondo si muove", act: 1, chapter: 1, quests: ["q_m1", "q_s1", "q_s2", "q_f1"], events: ["evt_market", "evt_front1"],
        summary: "Tutte le fazioni chiedono qualcosa ai PG: possono scegliere a chi dare ascolto. Ciò che ignorano va avanti da solo.",
        notes: `Fronti: reclutamento (giorno ${d1}), la Compagnia cede (giorno ${d2}), la guardia esautorata (giorno ${d3}), poi la scadenza finale (giorno ${ritualDay}).` },
      { name: "Le fazioni stringono la presa", act: 2, chapter: 1, quests: ["q_s3", "q_m2", "q_s2"], events: ["evt_front2", "evt_council", "evt_ambush", "evt_front3"],
        summary: "Le scelte fatte finora spostano gli equilibri: alleati e nemici reagiscono a ciò che i PG hanno fatto (o non fatto)." },
      { name: "La resa dei conti", act: 3, chapter: 1, quests: ["q_m3"], events: ["evt_ritual"], summary: T("Qualunque sia l'equilibrio raggiunto, {villain} tenta il tutto per tutto nel santuario.") },
    ];
  },
  esplorazione({ add, get, T, v, p, chosen, midLevel }) {
    const depthsName = T("Le profondità {ruin.di}");
    add("loc_depths", "location", {
      name: depthsName, kind: "dungeon", parent: "loc_ruin", access: "bloccato", unlockedBy: "q_e1",
      description: T("Sotto il primo livello {ruin.di} si aprono gallerie più antiche, scavate da mani che nessuno ricorda."),
      history: T("Qui {villain} ha fatto scavare in segreto, per mesi."), culture: "", economy: "", politics: "",
      resources: [], legends: ["Si dice che chi scende troppo in fondo sente voci che lo chiamano per nome."], connections: [{ to: "loc_ruin", via: "scala crollata", days: 0 }, { to: "loc_sanctum", via: "passaggio nascosto", days: 0 }],
    });
    get("loc_ruin").connections.push({ to: "loc_depths", via: "scala crollata", days: 0 });
    // l'indizio decisivo e il diario scendono al livello profondo
    get("clue_t4").foundAtLocation = "loc_depths";
    get("itm_diario").origin = "loc_depths";
    get("dng_ruin").rooms.forEach((r) => { if (r.clues?.includes("clue_t4")) r.clues = []; });
    const dngDepths = generateDungeon({ seed: `${p.seed}:depths`, level: Math.min(20, midLevel + 1), players: p.players, danger: p.danger, types: chosen.monsterTypes, name: depthsName, rooms: 10 });
    linkRoom(dngDepths, ["segreta", "tesoro", "enigma"], { clues: ["clue_t4"], event: "evt_past1" });
    add("dng_depths", "dungeon", { ...dngDepths, location: "loc_depths" });
    add("q_e1", "quest", {
      name: T("Il primo livello {ruin.di}"), kind: "principale", act: 2, chapter: 1, giver: "npc_giver", status: "non iniziata", chosenOutcome: "",
      premise: T("La guardia non ha mai osato oltre l'ingresso {ruin.di}. Il Capitano chiede ai PG di esplorarne il primo livello e di trovare la via verso il basso."),
      objective: "Esplorare il primo livello, metterlo in sicurezza e trovare l'accesso alle gallerie profonde.",
      prerequisites: [{ target: "q_m1", intentionalCycle: false }], locations: ["loc_wild", "loc_ruin"], npcs: ["npc_giver", "npc_rival"], clues: [], requiredClues: [],
      obstacles: ["Trappole antiche e creature che hanno fatto delle rovine la loro tana.", "Le provviste non bastano per restare a lungo: serve tornare in città."],
      twists: [T("Nel primo livello ci sono tracce recenti: qualcuno scende regolarmente.")],
      outcomes: [
        { label: "Il primo livello è in sicurezza", description: "La guardia può presidiare l'ingresso: il gruppo ha una base sicura per scendere.", effects: [{ kind: "factionStanding", target: "fac_a", value: "1" }] },
        { label: "Il gruppo scende senza mettere in sicurezza il livello", description: "Le creature restano alle spalle del gruppo: il ritorno sarà pericoloso.", effects: [] },
      ],
      rewards: [{ kind: "xp", text: "Premio in PE secondo la difficoltà" }, { kind: "oro", text: "Tesori del primo livello" }],
      consequences: "Si apre l'accesso alle profondità.",
    });
    const m2 = get("q_m2");
    m2.prerequisites = [{ target: "q_e1", intentionalCycle: false }, { target: "clue_t2", intentionalCycle: false }];
    m2.locations = ["loc_ruin", "loc_depths"]; m2.chapter = 2;
    m2.objective = "Scendere nelle gallerie profonde, superarne i pericoli e recuperare il diario.";
    return [
      { name: "L'incarico", act: 1, chapter: 1, quests: ["q_m1", "q_s1"], events: ["evt_market"], summary: T("I PG raccolgono informazioni a {town} e a {village} prima di partire per le rovine.") },
      { name: "Il primo livello", act: 2, chapter: 1, quests: ["q_e1", "q_s2"], events: ["evt_ambush", "evt_council"], summary: T("Spedizione nel primo livello {ruin.di}, con ritorni in città per riposare e rifornirsi."),
        notes: "Tra una spedizione e l'altra: riposo, vendita del bottino, nuove voci in città." },
      { name: "Le profondità", act: 2, chapter: 2, quests: ["q_m2", "q_s3"], events: [], summary: "Discesa nelle gallerie profonde, dove si trovano il diario e la mappa del passaggio." },
      { name: "Il santuario", act: 3, chapter: 1, quests: ["q_m3"], events: ["evt_ritual"], summary: T("Dalle profondità, il passaggio nascosto conduce al santuario {sanctum.di}.") },
    ];
  },
};

/** Collega alla prima stanza del tipo richiesto indizi ed evento (se la stanza esiste). */
function linkRoom(d, kinds, { clues, event }) {
  for (const k of kinds) {
    const r = d.rooms.find((x) => x.kind === k);
    if (r) { r.clues = clues; r.event = event; return; }
  }
  d.rooms[d.rooms.length - 1].clues = clues;
  d.rooms[d.rooms.length - 1].event = event;
}

/** Rigenerazione deterministica di UN campo di testo di un'entità (non tocca il resto). */
export function regenerateField(entity, field, seed, ctx = {}) {
  const key = `${entity.type}.${field}`;
  const variants = FIELD_VARIANTS[key];
  if (!variants) throw new Error(`La modalità deterministica non supporta la rigenerazione del campo ${key}`);
  const rng = new Rng(`campo:${key}:${seed}:${entity.id ?? ""}`);
  const raw = rng.pick(variants);
  const d = entity.data;
  const g = ctx.g ?? (rng.chance(0.5) ? "m" : "f");
  const text = fmt(raw, { name: d.name, role: d.role ?? "", species: d.species ?? "essere", place: ctx.place ?? d.name, g });
  const lists = new Set(["npc.dialogues", "location.legends"]);
  return lists.has(key) ? text.split("|").map((s) => s.trim()) : text;
}

export function regenerableFields() {
  return Object.keys(FIELD_VARIANTS);
}

void loadCreatures;
