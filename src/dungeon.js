// Generatore procedurale di dungeon a griglia, riproducibile da seed.
// Griglia: '#' roccia/muro, '.' pavimento, '+' porta, 'S' porta segreta.
import { Rng } from "./rng.js";
import { buildEncounter, trapProfile } from "./rules.js";

const ROOM_NAMES = ["Sala delle Colonne", "Cripta Crollata", "Galleria degli Echi", "Cella dei Prigionieri", "Antico Refettorio", "Camera dei Sigilli", "Biblioteca Sommersa", "Fucina Spenta", "Ossario", "Cappella Profanata", "Sala del Pozzo", "Armeria Dimenticata", "Cisterna", "Laboratorio Abbandonato", "Corte dei Busti", "Sala dei Mosaici"];
const DESCRIPTIONS = [
  "Umidità e silenzio; le pareti trasudano un odore di terra vecchia.",
  "Il soffitto a volta è sorretto da pilastri incrinati; la polvere conserva impronte recenti.",
  "Frammenti di ceramica e ossa di animali coprono il pavimento.",
  "Una corrente d'aria fredda fa tremare le torce, ma non si vede alcuna apertura.",
  "Tracce di fuliggine annerisce le pareti: qualcuno ha acceso fuochi qui, di recente.",
  "Graffiti in una lingua antica si inseguono lungo i muri.",
  "L'acqua gocciola in un catino di pietra al centro della sala.",
  "Mobili marciti formano barricate improvvisate contro le porte.",
];
const TRAPS = [
  ["Ago avvelenato nella serratura", "Salvezza su Costituzione o avvelenato 1 ora"],
  ["Lastra a pressione con lame a scatto", "Salvezza su Destrezza o danni da taglio"],
  ["Fossa nascosta sotto un tappeto", "Salvezza su Destrezza o caduta nel fosso"],
  ["Dardi da fori nelle pareti", "Tiro per colpire dei dardi o danni perforanti"],
  ["Gas soporifero da un'urna", "Salvezza su Costituzione o addormentato 1 minuto"],
  ["Rune esplosive sul pavimento", "Salvezza su Destrezza o danni da fuoco"],
];
const PUZZLES = [
  ["Quattro leve con simboli di stagioni", "Vanno abbassate nell'ordine in cui le stagioni compaiono nel mosaico del soffitto."],
  ["Statua che chiede un nome", "La risposta è il nome inciso, quasi cancellato, sulla base di un'altra statua nella stanza."],
  ["Specchi e fascio di luce", "Orientare tre specchi in modo da colpire il sigillo sulla parete nord."],
  ["Dadi di pietra su un altare", "La somma deve essere uguale al numero di arcate nella sala adiacente."],
  ["Pavimento a scacchiera", "Solo le caselle chiare reggono il peso: il percorso corretto è disegnato nell'affresco."],
];
const SECRETS = ["Dietro un arazzo marcio si apre una nicchia con un diario.", "Una mattonella cava nasconde una chiave di bronzo.", "Un passaggio stretto collega la stanza a un'altra non adiacente.", "Sotto l'altare c'è un vano con provviste di un precedente avventuriero."];
const TREASURES = ["Una borsa con monete antiche e una gemma opaca", "Un calice d'argento con incisioni votive", "Una pergamena sigillata e una pozione non identificata", "Lingotti anneriti e un anello di rame", "Un reliquiario con una piccola reliquia valutabile"];
const ENVIRONMENTS = ["Luce fioca: penombra", "Nebbia bassa: visibilità ridotta oltre 9 m", "Pavimento viscido: terreno difficile", "Aria stantia: nessun effetto, ma le torce tremolano", "Acqua alta alla caviglia: terreno difficile", "Silenzio innaturale: i suoni si attutiscono"];

/** Genera un dungeon. Stesso seed + stessi parametri = stesso risultato. */
export function generateDungeon({ seed, width = 48, height = 32, rooms: targetRooms = 8, level = 1, players = 4, danger = "medio", types, name }) {
  const rng = new Rng(`dungeon:${seed}`);
  const grid = Array.from({ length: height }, () => Array(width).fill("#"));
  const placed = [];
  for (let attempt = 0; attempt < 400 && placed.length < targetRooms; attempt++) {
    const w = rng.int(5, 10), h = rng.int(4, 7);
    const x = rng.int(1, width - w - 2), y = rng.int(1, height - h - 2);
    if (placed.some((r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
    placed.push({ x, y, w, h });
  }
  if (placed.length < 3) throw new Error("Impossibile piazzare abbastanza stanze: aumenta le dimensioni della mappa.");
  placed.sort((a, b) => a.x - b.x);
  const rooms = placed.map((r, i) => ({ id: `r${i + 1}`, ...r }));
  for (const r of rooms) for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) grid[yy][xx] = ".";

  const center = (r) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
  // Prim sulle distanze fra centri: albero di connessioni; poi qualche anello extra.
  const edges = [];
  const inTree = new Set([rooms[0].id]);
  while (inTree.size < rooms.length) {
    let best = null;
    for (const a of rooms.filter((r) => inTree.has(r.id))) for (const b of rooms.filter((r) => !inTree.has(r.id))) {
      const [ax, ay] = center(a), [bx, by] = center(b);
      const d = Math.abs(ax - bx) + Math.abs(ay - by);
      if (!best || d < best.d) best = { a, b, d };
    }
    edges.push([best.a, best.b]);
    inTree.add(best.b.id);
  }
  const degree = (id) => edges.filter(([a, b]) => a.id === id || b.id === id).length;

  // Ruoli delle stanze.
  const entrance = rooms[0];
  const dist = bfs(rooms, edges, entrance.id);
  const byFar = [...rooms].sort((a, b) => dist.get(b.id) - dist.get(a.id));
  const boss = byFar[0];
  const leaves = rooms.filter((r) => degree(r.id) === 1 && r.id !== entrance.id && r.id !== boss.id);
  const secretRoom = leaves.length ? rng.pick(leaves) : null;
  const kinds = new Map(rooms.map((r) => [r.id, "stanza"]));
  kinds.set(entrance.id, "ingresso");
  kinds.set(boss.id, "boss");
  if (secretRoom) kinds.set(secretRoom.id, "segreta");
  const free = () => rooms.filter((r) => kinds.get(r.id) === "stanza");
  const pickFree = (kind) => { const f = free(); if (f.length) kinds.set(rng.pick(f).id, kind); };
  pickFree("tesoro"); pickFree("enigma"); pickFree("trappola"); pickFree("trappola");

  // Extra anelli (non verso la stanza segreta, che deve restare raggiungibile solo dalla porta segreta).
  const candidates = rooms.filter((r) => r.id !== secretRoom?.id);
  for (let i = 0; i < Math.floor(rooms.length / 4); i++) {
    const [a, b] = rng.pickN(candidates, 2);
    if (a && b && !edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) edges.push([a, b]);
  }

  // Corridoi a L; porta al primo varco fuori da una stanza.
  const inRoom = (x, y) => rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  for (const [a, b] of edges) {
    const secret = secretRoom && (a.id === secretRoom.id || b.id === secretRoom.id);
    const [ax, ay] = center(a), [bx, by] = center(b);
    const path = [];
    const horizFirst = rng.chance(0.5);
    const walk = (x0, y0, x1, y1, horiz) => {
      let x = x0, y = y0;
      if (horiz) while (x !== x1) { x += Math.sign(x1 - x); path.push([x, y]); }
      else while (y !== y1) { y += Math.sign(y1 - y); path.push([x, y]); }
      return [x, y];
    };
    const mid = horizFirst ? walk(ax, ay, bx, ay, true) : walk(ax, ay, ax, by, false);
    walk(mid[0], mid[1], bx, by, !horizFirst);
    for (let i = 0; i < path.length; i++) {
      const [x, y] = path[i];
      const rm = inRoom(x, y);
      if (rm) continue;
      const wasWall = grid[y][x] === "#";
      if (wasWall) grid[y][x] = ".";
      // Porta: cella del corridoio adiacente a una stanza e appena uscita/entrata dal suo perimetro.
      const nextRm = path[i + 1] ? inRoom(path[i + 1][0], path[i + 1][1]) : null;
      const prevRm = i === 0 ? a : inRoom(path[i - 1][0], path[i - 1][1]);
      if (wasWall && (prevRm || nextRm)) {
        const touching = prevRm ?? nextRm;
        grid[y][x] = secret && (touching.id === secretRoom.id) ? "S" : "+";
      }
    }
  }

  // La stanza segreta deve essere davvero raggiungibile solo attraverso la porta 'S' (corridoi di altre stanze potrebbero averla toccata).
  if (secretRoom) {
    const probe = { grid: grid.map((r) => r.join("")), rooms: rooms.map((r) => ({ ...r, kind: kinds.get(r.id) })) };
    if (!dungeonConnectivity(probe).hiddenOnlyBySecretDoor.includes(secretRoom.id)) kinds.set(secretRoom.id, "stanza");
  }

  const trapP = trapProfile(level);
  const diffForRegular = danger === "basso" ? "bassa" : "moderata";
  const diffForBoss = danger === "basso" ? "moderata" : "alta";
  const out = rooms.map((r, i) => {
    const k = kinds.get(r.id);
    const rr = rng.fork(`room:${r.id}`);
    const room = {
      id: r.id, name: k === "ingresso" ? "Ingresso" : k === "boss" ? "Sala del Custode" : k === "segreta" ? "Camera Segreta" : ROOM_NAMES[(i + rr.int(0, 7)) % ROOM_NAMES.length],
      x: r.x, y: r.y, w: r.w, h: r.h, kind: k,
      description: rr.pick(DESCRIPTIONS), trap: "", puzzle: "", secret: "", treasure: "", environment: rr.chance(0.5) ? rr.pick(ENVIRONMENTS) : "",
      encounter: null, event: null, clues: [], notes: "",
    };
    if (k === "trappola") { const [t, e] = rr.pick(TRAPS); room.trap = `${t}. ${e} (CD ${trapP.dc}, ${trapP.damage}; ${trapP.note}).`; }
    if (k === "enigma") { const [p, s] = rr.pick(PUZZLES); room.puzzle = `${p}. Soluzione: ${s}`; }
    if (k === "tesoro") room.treasure = rr.pick(TREASURES);
    if (k === "segreta") { room.secret = rr.pick(SECRETS); room.treasure = rr.pick(TREASURES); }
    if (k === "boss") { room.treasure = rr.pick(TREASURES); }
    if (k === "boss" || (k === "stanza" && rr.chance(0.7)) || (k === "trappola" && rr.chance(0.3))) {
      room.encounter = buildEncounter(rr, { level, players, difficulty: k === "boss" ? diffForBoss : diffForRegular, types, boss: k === "boss" });
    }
    return room;
  });

  return {
    name: name ?? "Dungeon senza nome", seed: String(seed), width, height, partyLevel: level,
    grid: grid.map((row) => row.join("")), rooms: out,
  };
}

function bfs(rooms, edges, startId) {
  const adj = new Map(rooms.map((r) => [r.id, []]));
  for (const [a, b] of edges) { adj.get(a.id).push(b.id); adj.get(b.id).push(a.id); }
  const d = new Map([[startId, 0]]);
  const q = [startId];
  while (q.length) {
    const c = q.shift();
    for (const n of adj.get(c)) if (!d.has(n)) { d.set(n, d.get(c) + 1); q.push(n); }
  }
  return d;
}

/** Limiti accettati per generazione e anteprima (lo schema ammette anche mappe più piccole disegnate a mano). */
export const DUNGEON_LIMITS = { width: [20, 80], height: [20, 60], rooms: [3, 20], level: [1, 20] };

/**
 * Coerenza interna dei dati di un dungeon, oltre ai tipi già controllati dallo schema.
 * Ritorna un elenco di errori {path, message}; vuoto se i dati sono utilizzabili da mappa, export e controlli.
 */
export function dungeonDataErrors(d) {
  const errors = [];
  const { width, height } = d;
  if (!Array.isArray(d.grid) || d.grid.length !== height) errors.push({ path: "grid", message: `la griglia deve avere ${height} righe` });
  else d.grid.forEach((row, y) => {
    if (row.length !== width) errors.push({ path: `grid[${y}]`, message: `ogni riga deve avere ${width} caselle` });
    else if (!/^[#.+S]*$/.test(row)) errors.push({ path: `grid[${y}]`, message: "caratteri ammessi: # . + S" });
  });
  const rooms = d.rooms ?? [];
  if (!rooms.length) errors.push({ path: "rooms", message: "serve almeno una stanza (l'ingresso)" });
  const ids = new Set();
  rooms.forEach((r, i) => {
    const p = `rooms[${i}]`;
    if (ids.has(r.id)) errors.push({ path: `${p}.id`, message: `id stanza duplicato (${r.id})` });
    ids.add(r.id);
    if (r.w < 1 || r.h < 1) errors.push({ path: `${p}.w`, message: "larghezza e altezza della stanza devono essere almeno 1" });
    if (r.x < 0 || r.y < 0 || r.x + r.w > width || r.y + r.h > height) errors.push({ path: `${p}.x`, message: `la stanza esce dalla mappa (${width}×${height})` });
    const enc = r.encounter;
    if (enc != null) {
      const okCreatures = Array.isArray(enc.creatures) && enc.creatures.every((c) => c && typeof c.name === "string" && Number.isInteger(c.count) && c.count >= 1);
      if (typeof enc !== "object" || Array.isArray(enc) || !okCreatures)
        errors.push({ path: `${p}.encounter`, message: 'incontro non valido: serve {"creatures":[{"name":"...","count":1}]} oppure lascia vuoto' });
    }
  });
  return errors;
}

/** Verifica che tutte le stanze siano raggiungibili dall'ingresso (porte segrete incluse) e che quella segreta lo sia solo via 'S'. */
export function dungeonConnectivity(dungeon) {
  const g = Array.isArray(dungeon.grid) ? dungeon.grid : [];
  const rooms = dungeon.rooms ?? [];
  if (!rooms.length) return { allReachable: true, unreachable: [], hiddenOnlyBySecretDoor: [] };
  dungeon = { ...dungeon, rooms };
  const entrance = dungeon.rooms.find((r) => r.kind === "ingresso") ?? dungeon.rooms[0];
  const reach = (allowSecret) => {
    const seen = new Set();
    const start = [entrance.x, entrance.y];
    const q = [start];
    seen.add(start.join(","));
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        const c = g[ny]?.[nx];
        if (!c || c === "#" || (c === "S" && !allowSecret)) continue;
        const k = nx + "," + ny;
        if (!seen.has(k)) { seen.add(k); q.push([nx, ny]); }
      }
    }
    return dungeon.rooms.filter((r) => seen.has(`${r.x},${r.y}`)).map((r) => r.id);
  };
  const withSecret = reach(true), withoutSecret = reach(false);
  return {
    allReachable: withSecret.length === dungeon.rooms.length,
    unreachable: dungeon.rooms.filter((r) => !withSecret.includes(r.id)).map((r) => r.id),
    hiddenOnlyBySecretDoor: dungeon.rooms.filter((r) => withSecret.includes(r.id) && !withoutSecret.includes(r.id)).map((r) => r.id),
  };
}

export function dungeonToSvg(d, { cell = 16 } = {}) {
  const w = d.width * cell, h = d.height * cell;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="sans-serif">`, `<rect width="${w}" height="${h}" fill="#1d1a16"/>`];
  (d.grid ?? []).forEach((row, y) => [...row].forEach((c, x) => {
    if (c === "#") return;
    const fill = c === "." ? "#d9cfb8" : c === "+" ? "#8a5a2b" : "#b04a3a";
    parts.push(`<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="${fill}" stroke="#a79c82" stroke-width=".5"/>`);
    if (c === "S") parts.push(`<text x="${x * cell + cell / 2}" y="${y * cell + cell * 0.75}" font-size="${cell * 0.7}" text-anchor="middle" fill="#fff">S</text>`);
  }));
  (d.rooms ?? []).forEach((r, i) => parts.push(`<text x="${(r.x + r.w / 2) * cell}" y="${(r.y + r.h / 2) * cell + 5}" font-size="${cell * 0.9}" text-anchor="middle" fill="#3a2f1f" font-weight="bold">${i + 1}</text>`));
  parts.push("</svg>");
  return parts.join("\n");
}
