// Generatori deterministici di singoli elementi (PNG, luogo, evento imprevisto) da inserire in una campagna esistente.
// Motivazioni e obiettivi sono legati ai comportamenti: i PNG non hanno personalità solo decorativa.
import { Rng } from "./rng.js";
import { FIRST_M, FIRST_F, SURNAMES, SPECIES, fmt } from "./content.js";

const DRIVERS = [
  { motivation: "proteggere la propria famiglia a ogni costo", goal: "mettere al sicuro i propri cari", fear: "perdere qualcuno per colpa delle proprie scelte",
    behaviors: [["i suoi cari vengono minacciati", "cede ai ricatti o si espone senza riflettere"], ["gli viene offerta protezione per la famiglia", "accetta quasi ogni richiesta ragionevole"]], dialogue: "«Fate ciò che dovete, ma lasciate fuori la mia famiglia.»" },
  { motivation: "arricchirsi e comprare un posto rispettabile nella società", goal: "guadagnare abbastanza da non dipendere più da nessuno", fear: "tornare povero",
    behaviors: [["gli viene offerto denaro", "è disponibile a trattare, anche a tradire una promessa"], ["i suoi affari sono minacciati", "denuncia chi li ostacola alla guardia o a un protettore"]], dialogue: "«Tutto ha un prezzo; il segreto è non svendersi.»" },
  { motivation: "vendicare un torto subìto anni fa", goal: "smascherare chi gli ha rovinato la vita", fear: "morire senza giustizia",
    behaviors: [["incontra il responsabile del torto", "perde il controllo e rischia di compromettere tutto"], ["i PG gli offrono aiuto contro il suo nemico", "diventa un alleato fedele finché dura la caccia"]], dialogue: "«Ho aspettato anni. Posso aspettare ancora una settimana.»" },
  { motivation: "conoscere la verità, qualunque essa sia", goal: "raccogliere prove documentali di ciò che sospetta", fear: "scoprire di essersi sbagliato",
    behaviors: [["i PG portano nuove prove", "interrompe tutto per esaminarle e fa domande insistenti"], ["gli viene ordinato di smettere di indagare", "continua in segreto"]], dialogue: "«Un fatto vale più di dieci voci.»" },
  { motivation: "mantenere l'ordine e le tradizioni del luogo", goal: "evitare che gli stranieri sconvolgano gli equilibri", fear: "il cambiamento",
    behaviors: [["i PG propongono qualcosa di nuovo", "li ostacola con regole e cavilli"], ["i PG dimostrano rispetto per le usanze locali", "diventa cooperativo e li presenta alla comunità"]], dialogue: "«Qui si è sempre fatto così. Ci sarà un motivo.»" },
  { motivation: "ottenere potere e riconoscimento", goal: "ottenere una carica più importante", fear: "essere ignorato",
    behaviors: [["i PG gli offrono la possibilità di mettersi in luce", "collabora con entusiasmo, ma si prende il merito"], ["un rivale lo supera", "diffonde calunnie e cerca alleati contro di lui"]], dialogue: "«Un giorno sapranno tutti il mio nome.»" },
  { motivation: "espiare una colpa nascosta", goal: "compiere un gesto altruistico e rischioso", fear: "che il suo passato venga scoperto",
    behaviors: [["qualcuno accenna al suo passato", "si irrigidisce e cambia discorso"], ["i PG lo trattano con fiducia", "li aiuta anche a proprio rischio"]], dialogue: "«Ci sono cose che non si lavano via. Ma si può provare a compensarle.»" },
  { motivation: "evitare guai e vivere in pace", goal: "restare fuori da ogni conflitto", fear: "essere coinvolto in una guerra o in un processo",
    behaviors: [["i PG gli chiedono di testimoniare", "si nega, poi cede se garantiscono anonimato"], ["il pericolo diventa evidente", "fugge o si nasconde"]], dialogue: "«Io non ho visto niente, e voi non mi avete incontrato.»" },
];
const ROLES = [["fabbro", "fabbra"], ["locandiere", "locandiera"], ["erborista", "erborista"], ["guardia", "guardia"], ["sacerdote", "sacerdotessa"], ["cartografo", "cartografa"], ["scrivano", "scrivana"], ["contrabbandiere", "contrabbandiera"], ["bardo", "barda"], ["cacciatore", "cacciatrice"], ["studioso", "studiosa"], ["pescatore", "pescatrice"]];
const LOOKS = ["una cicatrice che parte dall'orecchio", "mani sporche d'inchiostro", "un mantello troppo lungo per la sua statura", "una risata fragorosa", "uno sguardo che evita il tuo", "una collana di conchiglie", "un forte profumo di erbe"];

/** Genera un PNG isolato. `locationId` opzionale: se assente il PNG non ha luogo (e il controllo coerenza lo segnalerà). */
export function generateNpc({ seed, locationId = null, factionId = null }) {
  const rng = new Rng(`npc:${seed}`);
  const g = rng.chance(0.5) ? "f" : "m";
  const name = `${rng.pick(g === "m" ? FIRST_M : FIRST_F)} ${rng.pick(SURNAMES)}`;
  const [rm, rf] = rng.pick(ROLES);
  const role = g === "m" ? rm : rf;
  const [d1, d2] = rng.pickN(DRIVERS, 2);
  const species = rng.pick(SPECIES);
  return {
    name, species, role, status: "vivo", location: locationId, factions: factionId ? [factionId] : [],
    description: fmt("{name} ({species}), {role}: ha {look}.", { name, species, role, look: rng.pick(LOOKS), g }),
    personality: fmt("Spinto da un'idea fissa: {m}. Reagisce in modo coerente a ciò che gli sta a cuore.", { m: d1.motivation, g }),
    motivations: [d1.motivation, d2.motivation], goals: [d1.goal, d2.goal], fears: [d1.fear, d2.fear], conflicts: [`Tra «${d1.motivation}» e «${d2.motivation}»`],
    knowledge: [], secrets: [], lies: [], relationships: [], schedule: [],
    behaviors: [...d1.behaviors, ...d2.behaviors].map(([situation, reaction]) => ({ situation: `Se ${situation}`, reaction })),
    dialogues: [d1.dialogue, d2.dialogue], combat: [],
  };
}

const EVENTS = [
  ["Un carro bloccato", "Un carro carico si è ribaltato e blocca la via: chi lo aiuta guadagna una voce utile."],
  ["Una rissa all'osteria", "Due fazioni di avventori si scontrano; la guardia arriva in ritardo."],
  ["Un messaggero ferito", "Un messaggero arriva ansimante con un messaggio che non è destinato al gruppo."],
  ["Un temporale improvviso", "La pioggia rende impraticabili le strade e costringe a cercare riparo."],
  ["Un mercante offre un affare", "Uno straniero offre una merce rara a metà prezzo: troppo bello per essere vero."],
  ["Una processione", "Una processione religiosa attraversa il luogo: ottima copertura per chi voglia passare inosservato."],
  ["Un furto", "Qualcuno tenta di sfilare la borsa a un membro del gruppo."],
  ["Voci inquietanti", "Gli abitanti parlano di strane luci nella notte; nessuno vuole spiegare di più."],
];
export function generateRandomEvent({ seed, locationId = null, day = 1 }) {
  const rng = new Rng(`evt:${seed}`);
  const [name, description] = rng.pick(EVENTS);
  return { name, kind: "imprevisto", day, location: locationId, participants: [], description, requires: [], requiresKnowledge: [], trigger: "Quando il DM lo ritiene opportuno", happened: false, effects: [] };
}

const PLACES = [["locanda", "edificio", "Un locale rumoroso dove si incontrano viandanti e abitanti."], ["tempio", "edificio", "Un edificio sacro con un chiostro silenzioso."], ["mercato", "luogo", "Una piazza di bancarelle dove circolano merci e voci."], ["cimitero", "luogo", "Lapidi consumate e un guardiano che non esce dopo il tramonto."], ["torre di guardia", "edificio", "Una torre in pietra, con un pendio ripido fino alla porta."], ["bosco", "natura", "Alberi fitti, sentieri incerti e il rumore di animali invisibili."]];
export function generateLocation({ seed, parentId = null }) {
  const rng = new Rng(`loc:${seed}`);
  const [kind, type, description] = rng.pick(PLACES);
  const owner = rng.pick([...FIRST_M, ...FIRST_F]);
  return { name: `${kind[0].toUpperCase()}${kind.slice(1)} di ${owner}`, kind: type, parent: parentId, access: "pubblico", description, history: "", culture: "", economy: "", politics: "", resources: [], legends: [], connections: [] };
}
