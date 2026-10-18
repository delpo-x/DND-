// Contenuti originali in italiano per la modalità deterministica. Nessun testo proveniente da manuali D&D.

const DI = { la: "della", il: "del", lo: "dello", "l'": "dell'", i: "dei", le: "delle", gli: "degli" };
const A = { la: "alla", il: "al", lo: "allo", "l'": "all'", i: "ai", le: "alle", gli: "agli" };
const DA = { la: "dalla", il: "dal", lo: "dallo", "l'": "dall'", i: "dai", le: "dalle", gli: "dagli" };
const IN = { la: "nella", il: "nel", lo: "nello", "l'": "nell'", i: "nei", le: "nelle", gli: "negli" };

/** Sostantivo con articolo: n = nome senza articolo; toString = "la Corona"; .di = "della Corona", .a, .in. */
export function noun(art, n) {
  const sep = art.endsWith("'") ? "" : " ";
  return {
    art, n,
    toString() { return art + sep + n; },
    di: DI[art] + sep + n, a: A[art] + sep + n, da: DA[art] + sep + n, in: IN[art] + sep + n,
  };
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Template: {nome}, {nome.di}, {Nome} (maiuscola iniziale), [maschile|femminile] secondo vars.g ('m'|'f').
 * Una variabile mancante è un errore: niente testo con buchi.
 */
export function fmt(tpl, vars) {
  return tpl
    .replace(/\{([A-Za-z0-9_]+)(?:\.([a-z]+))?\}/g, (_, key, prop) => {
      const lower = key[0].toLowerCase() + key.slice(1);
      const isCap = key[0] !== lower[0];
      if (!(lower in vars)) throw new Error(`Variabile di template mancante: ${key} in "${tpl.slice(0, 60)}"`);
      const v = vars[lower];
      let s = prop ? v[prop] : String(v);
      if (s === undefined) throw new Error(`Proprietà ${prop} mancante per ${key}`);
      return isCap ? cap(s) : s;
    })
    .replace(/\[([^|\]]*)\|([^\]]*)\]/g, (_, m, f) => ((vars.g ?? "m") === "f" ? f : m));
}

export const FIRST_M = ["Alderico", "Baldassarre", "Corvino", "Duilio", "Eldrin", "Fausto", "Gualtiero", "Ignazio", "Lucan", "Orsino", "Rodrigo", "Tancredi", "Ugolino", "Valerio", "Ansel", "Bruno", "Cedric", "Dario", "Ermanno", "Fulvio"];
export const FIRST_F = ["Adelmina", "Berenice", "Cassandra", "Delfina", "Elvira", "Fiammetta", "Ginevra", "Isotta", "Lavinia", "Morgana", "Nerina", "Ottavia", "Perpetua", "Rosalba", "Selene", "Tullia", "Viola", "Aurelia", "Brigida", "Cornelia"];
export const SURNAMES = ["dei Salici", "Ferrabruna", "della Valle", "Pietrasecca", "Corvonero", "Mezzaluna", "Fontegrigia", "Lamabianca", "dal Ponte", "Nebbiaalta", "Roccaspina", "del Mulino", "Bosconero", "Valmora", "Cerchiotorto", "Ombrafonda"];
export const SPECIES = ["Umano", "Elfo", "Nano", "Halfling", "Gnomo", "Mezzelfo", "Mezzorco", "Tiefling", "Dragonide"]; // specie del SRD
export const TOWNS = ["Valdoro", "Rocca Grigia", "Borgo Cenere", "Pontenero", "Altamarea", "Fontanafredda", "Monteluce", "Sancorvo", "Porto Alloro", "Castelvento"];
export const VILLAGES = ["Pratofosco", "Salicetto", "Case Basse", "Muschioso", "Ginestreto", "Campolungo", "Rivabruna", "Sassoalto"];
export const REGIONS = ["le Marche di Valnera", "le Terre del Corvo", "la Conca di Aurelia", "gli Altipiani di Ferro", "la Valle delle Cento Torri", "il Contado dei Tre Fiumi"];
export const WILDS = ["la Foresta dei Sussurri", "le Paludi di Nebbia", "la Strada del Sale", "il Bosco Spezzato", "la Brughiera Grigia"];

export const ROLES = {
  giver: { m: "Capitano della Guardia", f: "Capitana della Guardia" },
  ally: { m: "archivista", f: "archivista" },
  rival: { m: "cacciatore di taglie", f: "cacciatrice di taglie" },
  witness: { m: "pastore", f: "pastora" },
  merchant: { m: "mercante", f: "mercante" },
};

export const TONES = {
  eroico: { mood: "Un'epoca in cui il coraggio è ancora una moneta che vale.", worldState: "La gente spera ancora in qualcuno che si faccia avanti." },
  cupo: { mood: "Il mondo è stanco e ogni vittoria costa più di quanto sembri.", worldState: "La fiducia nelle istituzioni è già incrinata." },
  mistero: { mood: "Ogni risposta apre due domande e nessuno dice tutta la verità.", worldState: "Le voci corrono più veloci dei fatti." },
  avventuroso: { mood: "Strade aperte, rovine da esplorare e tesori da guadagnare.", worldState: "La regione è piena di opportunità per chi ha coraggio." },
  "orrore gotico": { mood: "L'oscurità ha una volontà propria e le notti sono sempre più lunghe.", worldState: "Le porte restano sbarrate dopo il tramonto." },
  politico: { mood: "Le spade pesano meno delle alleanze e dei debiti.", worldState: "Ogni favore concesso è un debito che qualcuno riscuoterà." },
};

/**
 * Temi di campagna. Ogni tema fornisce gli "slot" con cui lo scheletro narrativo (gen-det.js) viene riempito.
 * Lo scheletro è lo stesso, quindi la coerenza interna (indizi, prerequisiti, luoghi) è garantita dalla costruzione.
 */
export const THEMES = [
  {
    id: "culto", tones: ["cupo", "orrore gotico", "mistero"],
    titles: ["L'ombra della Fiamma Pallida", "Il rito della Luna Cieca", "Sotto il canto delle campane"],
    threat: noun("il", "Culto della Fiamma Pallida"), relic: noun("il", "Calice di Cenere"),
    ruin: noun("la", "Cripta dei Penitenti"), sanctum: noun("il", "Santuario Sommerso"),
    villainRole: { m: "Gran Priore", f: "Gran Priora" }, ritual: noun("il", "Rito della Luna Cieca"),
    pastCrime: "la scomparsa di dodici pellegrini diretti alla cripta",
    firstSign: "le campane suonano da sole all'alba e l'acqua dei pozzi sa di cenere",
    villainMotive: "vuole risvegliare un'entità sepolta, nella convinzione che solo così potrà guarire da un male incurabile",
    villainPlan: ["raccogliere i pellegrini scomparsi come offerte", "mettere a tacere chi indaga tramite la corruzione e la paura", "completare il rito nel santuario nel giorno stabilito"],
    villainResources: ["adepti fanatici", "una rete di informatori tra i fedeli", "la fiducia pubblica nel proprio ufficio"],
    monsterTypes: ["Undead", "Fiend"],
    factionA: noun("l'", "Ordine della Lanterna Vigile"), factionB: noun("la", "Compagnia dei Mercanti di Sale"),
    conflict: "Un culto nascosto raccoglie offerte umane per risvegliare un'entità sepolta, mentre chi dovrebbe proteggere la regione ne è complice o è cieco.",
  },
  {
    id: "intrigo", tones: ["politico", "mistero", "eroico"],
    titles: ["La congiura del Velo Rosso", "Il sigillo spezzato", "Il giorno dell'investitura"],
    threat: noun("la", "Congiura del Velo Rosso"), relic: noun("il", "Sigillo del Concilio"),
    ruin: noun("la", "Torre dei Cancellieri"), sanctum: noun("la", "Sala dei Segreti"),
    villainRole: { m: "Cancelliere", f: "Cancelliera" }, ritual: noun("il", "Giorno dell'Investitura"),
    pastCrime: "l'avvelenamento del vecchio governatore",
    firstSign: "lettere anonime compaiono nelle case dei notabili e due consiglieri cambiano improvvisamente schieramento",
    villainMotive: "vuole governare la regione e ritiene che il vecchio ordine abbia tradito il popolo",
    villainPlan: ["screditare i rivali politici", "impadronirsi del sigillo che autentica ogni decreto", "farsi proclamare reggente nel giorno dell'investitura"],
    villainResources: ["un'ampia rete di favori e ricatti", "falsificatori e sicari fidati", "accesso agli archivi ufficiali"],
    monsterTypes: ["Humanoid"],
    factionA: noun("la", "Guardia della Reggenza"), factionB: noun("la", "Gilda dei Cambiavalute"),
    conflict: "Una congiura silenziosa prepara un colpo di stato legale: il potere cambierà mano senza battaglie, a meno che qualcuno non provi chi è il vero colpevole.",
  },
  {
    id: "miniera", tones: ["avventuroso", "cupo", "eroico"],
    titles: ["Il risveglio delle profondità", "Il cuore di vetro", "Ferro e silenzio"],
    threat: noun("il", "Risveglio delle Profondità"), relic: noun("il", "Cuore di Vetro"),
    ruin: noun("la", "Miniera Abbandonata di Ferrovivo"), sanctum: noun("la", "Caverna Cristallina"),
    villainRole: { m: "Capomastro", f: "Capomastra" }, ritual: noun("la", "Grande Detonazione"),
    pastCrime: "il crollo che ha sepolto trenta minatori",
    firstSign: "i cani si rifiutano di avvicinarsi ai pozzi e il metallo si copre di brina anche in estate",
    villainMotive: "ha sentito la voce di ciò che dorme sotto la montagna e crede di poter dominarne il potere",
    villainPlan: ["far scavare i turni notturni senza testimoni", "nascondere i morti come incidenti", "innescare la detonazione che aprirà la caverna"],
    villainResources: ["squadre di scavatori fedeli", "esplosivi del consorzio", "la responsabilità legale di ogni miniera"],
    monsterTypes: ["Aberration", "Elemental", "Monstrosity"],
    factionA: noun("la", "Confraternita dei Minatori"), factionB: noun("il", "Consorzio del Ferro"),
    conflict: "Qualcosa scavato dai minatori sta risvegliando una presenza antica, e chi dirige i lavori preferisce nascondere i morti piuttosto che fermarsi.",
  },
  {
    id: "peste", tones: ["orrore gotico", "cupo", "mistero"],
    titles: ["La peste d'ombra", "L'ultimo respiro", "La serra dell'alchimista"],
    threat: noun("la", "Peste d'Ombra"), relic: noun("la", "Fiala Nera"),
    ruin: noun("il", "Lazzaretto Chiuso"), sanctum: noun("la", "Serra dell'Alchimista"),
    villainRole: { m: "Alchimista Reale", f: "Alchimista Reale" }, ritual: noun("la", "Distillazione Finale"),
    pastCrime: "la chiusura del lazzaretto con i malati ancora dentro",
    firstSign: "gli animali muoiono con gli occhi neri e i raccolti marciscono in una sola notte",
    villainMotive: "ritiene di poter creare una cura dalla malattia stessa, a costo di sacrificare chi si ammala",
    villainPlan: ["diffondere campioni della malattia per studiarne gli effetti", "eliminare i medici che sospettano", "completare la distillazione sul numero di malati necessario"],
    villainResources: ["una serra segreta ben fornita", "pazienti disperati che non hanno nulla da perdere", "il titolo che le apre ogni porta"],
    monsterTypes: ["Undead", "Ooze", "Plant"],
    factionA: noun("i", "Custodi della Sanità"), factionB: noun("la", "Lega dei Contadini"),
    conflict: "Una malattia che non si spiega semina il panico: dietro di essa c'è una mano che la diffonde con uno scopo preciso.",
  },
  {
    id: "fate", tones: ["avventuroso", "mistero", "eroico"],
    titles: ["Il patto del Bosco Argentato", "La corte dell'Eterno Crepuscolo", "Il prezzo di un nome"],
    threat: noun("la", "Corte del Crepuscolo"), relic: noun("la", "Corona di Rugiada"),
    ruin: noun("il", "Cerchio di Pietre Spezzato"), sanctum: noun("la", "Radura dell'Eterno Crepuscolo"),
    villainRole: { m: "Emissario", f: "Emissaria" }, ritual: noun("la", "Notte della Porta Aperta"),
    pastCrime: "la rottura di un antico patto con le creature del bosco",
    firstSign: "i bambini sognano la stessa canzone e i sentieri del bosco cambiano direzione durante la notte",
    villainMotive: "vuole riportare il mondo mortale sotto il dominio della corte fatata, nella convinzione di salvarlo dal declino",
    villainPlan: ["stringere patti ingannevoli con i disperati del villaggio", "far dimenticare il vero nome di chi si oppone", "aprire la porta tra i mondi nella notte stabilita"],
    villainResources: ["patti vincolanti firmati dai villaggi", "creature del bosco fedeli", "il fascino che fa dimenticare i sospetti"],
    monsterTypes: ["Fey", "Beast", "Plant"],
    factionA: noun("i", "Guardiani del Sentiero"), factionB: noun("la", "Confraternita dei Taglialegna"),
    conflict: "Un'antica corte fatata sta riaprendo il confine tra i mondi, e ogni patto stretto con essa ha un prezzo che nessuno ha letto fino in fondo.",
  },
  {
    id: "pirati", tones: ["avventuroso", "eroico", "politico"],
    titles: ["La rotta del Corvo Nero", "Il tesoro della Sirena", "Maree di sangue e sale"],
    threat: noun("la", "Flotta del Corvo Nero"), relic: noun("la", "Mappa della Sirena"),
    ruin: noun("il", "Relitto della Fortuna Perduta"), sanctum: noun("la", "Grotta delle Maree"),
    villainRole: { m: "Ammiraglio Corsaro", f: "Ammiraglia Corsara" }, ritual: noun("la", "Marea dei Mille Giorni"),
    pastCrime: "l'affondamento di un convoglio di pellegrini al largo della scogliera",
    firstSign: "le barche dei pescatori tornano vuote e sulla spiaggia compaiono monete d'oro bagnate di sale",
    villainMotive: "vuole impadronirsi di un tesoro maledetto per comprare un regno tutto suo",
    villainPlan: ["bloccare i porti con false quarantene", "comprare o ricattare i capitani del porto", "recuperare il tesoro nella grotta durante la marea eccezionale"],
    villainResources: ["una flotta di navi veloci", "marinai fedeli per paura o per oro", "mappe rubate agli archivi del porto"],
    monsterTypes: ["Humanoid", "Beast", "Monstrosity"],
    factionA: noun("la", "Capitaneria del Porto"), factionB: noun("la", "Lega dei Pescatori"),
    conflict: "Una flotta corsara strangola le rotte commerciali per recuperare un tesoro maledetto, e il porto è pieno di chi lo ha già venduto in anticipo.",
  },
  {
    id: "drago", tones: ["eroico", "avventuroso", "cupo"],
    titles: ["Il risveglio della Fornace", "Il giuramento delle Ceneri", "L'ala sulla montagna"],
    threat: noun("il", "Drago della Fornace"), relic: noun("la", "Scaglia Giurata"),
    ruin: noun("la", "Fortezza Annerita"), sanctum: noun("il", "Tesoro della Fornace"),
    villainRole: { m: "Araldo del Drago", f: "Araldo del Drago" }, ritual: noun("il", "Giorno del Tributo"),
    pastCrime: "il tributo pagato per anni in segreto da un consiglio di notabili",
    firstSign: "le greggi spariscono dai pascoli alti e il cielo di montagna si tinge di rosso al tramonto",
    villainMotive: "serve il drago per paura e spera di salvare la propria famiglia sacrificando gli altri",
    villainPlan: ["raccogliere il tributo con la forza", "far credere che sia una calamità naturale", "consegnare l'ultima offerta nel giorno stabilito"],
    villainResources: ["soldati mercenari pagati con il tributo", "informatori in ogni villaggio", "la protezione dichiarata dal drago"],
    monsterTypes: ["Dragon", "Giant", "Humanoid"],
    factionA: noun("la", "Guardia dei Passi"), factionB: noun("la", "Gilda dei Pastori"),
    conflict: "Un drago antico estorce un tributo alla regione tramite un intermediario umano, e chi conosce la verità ha troppa paura per parlare.",
  },
];

/** Varianti testuali per la rigenerazione di un singolo campo (modalità deterministica). Variabili: n,name,role,species,place,g */
export const FIELD_VARIANTS = {
  "npc.description": [
    "{Name} è {species} di mezza età, {role}: ha lo sguardo di chi pesa ogni parola prima di pronunciarla e porta abiti pratici, rammendati con cura.",
    "Di corporatura [robusto|robusta] e dall'aria [stanco|stanca], {name} ({species}) non passa inosservat[o|a]: una cicatrice sul polso e una voce roca raccontano più di quanto dica.",
    "{Name}, {species}, ha l'aspetto curato di chi vuole sembrare affidabile; solo le mani, [nervoso|nervosa] e screpolate, tradiscono la tensione.",
    "{Species} [alto|alta] e [magro|magra], {name} veste con sobrietà e tiene sempre a portata di mano qualcosa da fare per non incrociare gli sguardi.",
  ],
  "npc.personality": [
    "Pragmatic[o|a] e diffidente con gli estranei, ma generos[o|a] con chi dimostra di meritarlo. Quando si sente messo alle strette diventa sarcastic[o|a].",
    "Gentile e loquace in apparenza; sotto la superficie è [calcolatore|calcolatrice] e ricorda ogni favore fatto e ricevuto.",
    "Impulsiv[o|a] e leale: agisce prima di pensare, e poi difende fino in fondo le proprie scelte.",
    "Riservat[o|a] e meticolos[o|a]. Odia le sorprese e mente male, per questo evita di dire più del necessario.",
  ],
  "npc.dialogues": [
    "«Non ho tempo per le chiacchiere, ma se la questione è seria, parliamone.»|«Chi vi manda? Rispondete con sincerità, o non dirò nulla.»|«Ho già visto gente come voi. Alcuni se la sono cavata.»",
    "«Siete arrivati in un brutto momento, {place} non è più quella di una volta.»|«Posso aiutarvi, ma avrò bisogno di qualcosa in cambio.»|«Ricordate: io non ve l'ho mai detto.»",
    "«Fermi dove siete. Prima ditemi cosa volete.»|«Se questo è un tranello, ve ne pentirete.»|«D'accordo. Ma ci muoviamo con calma.»",
  ],
  "location.description": [
    "{Name} si adagia tra case di pietra scura e tetti di ardesia; l'aria sa di fumo di legna e di pioggia imminente.",
    "Chi arriva a {name} nota subito il silenzio: la gente parla a voce bassa e le porte restano socchiuse, pronte a chiudersi.",
    "{Name} vive del passaggio dei viandanti: un via vai di carri, voci e odori, e un'inquietudine che nessuno nomina.",
    "Un luogo antico ma ancora abitato: sulle facciate restano tracce di stemmi che nessuno sa più leggere.",
  ],
  "location.legends": [
    "Si dice che in {name} la notte sia più lunga che altrove.|Una vecchia filastrocca racconta di una porta che si apre soltanto a chi porta il nome giusto.",
    "I più anziani giurano che sotto {name} corra un passaggio dimenticato.|Un tempo qui si teneva un mercato che nessuno ricorda come sia finito.",
  ],
  "event.description": [
    "Qualcosa accade a {place} che cambia l'equilibrio della situazione: le voci si diffondono rapidamente e nessuno resta indifferente.",
    "Il fatto è noto a pochi, ma le sue conseguenze si faranno sentire a {place} nei giorni successivi.",
  ],
  "quest.premise": [
    "Un incarico urgente, affidato con poche spiegazioni: chi lo propone sembra sapere più di quanto dica.",
    "La situazione precipita e serve qualcuno di cui nessuno possa dubitare. Il compenso è equo, il rischio no.",
  ],
};
