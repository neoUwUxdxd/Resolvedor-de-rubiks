// Modelo del cubo a nivel de pegatinas, compartido por la interfaz y el visor 3D.
//
// Cada una de las 54 pegatinas tiene una posición (x, y, z) en {-1, 0, 1} y una
// normal. Los ejes son: x hacia la derecha (R), y hacia arriba (U) y z hacia el
// frente (F). El orden de las caras es U R F D L B, igual que el del resolvedor.

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];

export const FACE_INFO = {
  U: { name: 'Arriba', short: 'Arriba' },
  R: { name: 'Derecha', short: 'Derecha' },
  F: { name: 'Frente', short: 'Frente' },
  D: { name: 'Abajo', short: 'Abajo' },
  L: { name: 'Izquierda', short: 'Izquierda' },
  B: { name: 'Atrás', short: 'Atrás' },
};

// Esquema de color occidental: blanco arriba, verde al frente.
export const COLORS = [
  { key: 'white', name: 'Blanco', hex: '#f5f7fb' },
  { key: 'red', name: 'Rojo', hex: '#ee3148' },
  { key: 'green', name: 'Verde', hex: '#19c26b' },
  { key: 'yellow', name: 'Amarillo', hex: '#ffd23f' },
  { key: 'orange', name: 'Naranja', hex: '#ff8a1c' },
  { key: 'blue', name: 'Azul', hex: '#2f6dff' },
];
export const UNKNOWN = -1;

export const STICKERS = [];
for (let f = 0; f < 6; f++) {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) STICKERS.push({ index: STICKERS.length, face: f, row: r, col: c, ...stickerGeometry(f, r, c) });
  }
}

function stickerGeometry(face, r, c) {
  switch (face) {
    case 0: return { pos: [c - 1, 1, r - 1], normal: [0, 1, 0] };
    case 1: return { pos: [1, 1 - r, 1 - c], normal: [1, 0, 0] };
    case 2: return { pos: [c - 1, 1 - r, 1], normal: [0, 0, 1] };
    case 3: return { pos: [c - 1, -1, 1 - r], normal: [0, -1, 0] };
    case 4: return { pos: [-1, 1 - r, c - 1], normal: [-1, 0, 0] };
    default: return { pos: [1 - c, 1 - r, -1], normal: [0, 0, -1] };
  }
}

const stickerKey = (p, n) => `${p.join(',')}|${n.join(',')}`;
const STICKER_BY_KEY = new Map(STICKERS.map((s) => [stickerKey(s.pos, s.normal), s.index]));

export function solvedState() {
  return STICKERS.map((s) => s.face);
}

export function isSolved(state) {
  for (let f = 0; f < 6; f++) {
    const c = state[f * 9];
    if (c === UNKNOWN) return false;
    for (let i = 1; i < 9; i++) if (state[f * 9 + i] !== c) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

// axis: 0 = x, 1 = y, 2 = z. dir: sentido de un cuarto de vuelta
// (+1 = antihorario visto desde el lado positivo del eje).
const BASE_MOVES = {
  U: { axis: 1, layers: [1], dir: -1 },
  D: { axis: 1, layers: [-1], dir: 1 },
  R: { axis: 0, layers: [1], dir: -1 },
  L: { axis: 0, layers: [-1], dir: 1 },
  F: { axis: 2, layers: [1], dir: -1 },
  B: { axis: 2, layers: [-1], dir: 1 },
  M: { axis: 0, layers: [0], dir: 1 },
  E: { axis: 1, layers: [0], dir: 1 },
  S: { axis: 2, layers: [0], dir: -1 },
  x: { axis: 0, layers: [-1, 0, 1], dir: -1 },
  y: { axis: 1, layers: [-1, 0, 1], dir: -1 },
  z: { axis: 2, layers: [-1, 0, 1], dir: -1 },
  u: { axis: 1, layers: [0, 1], dir: -1 },
  d: { axis: 1, layers: [-1, 0], dir: 1 },
  r: { axis: 0, layers: [0, 1], dir: -1 },
  l: { axis: 0, layers: [-1, 0], dir: 1 },
  f: { axis: 2, layers: [0, 1], dir: -1 },
  b: { axis: 2, layers: [-1, 0], dir: 1 },
};

const MOVE_DESCRIPTIONS = {
  U: 'la cara de arriba', D: 'la cara de abajo', R: 'la cara derecha', L: 'la cara izquierda',
  F: 'la cara frontal', B: 'la cara trasera',
  M: 'la capa central vertical (M)', E: 'la capa central horizontal (E)', S: 'la capa central frontal (S)',
  x: 'todo el cubo sobre el eje x', y: 'todo el cubo sobre el eje y', z: 'todo el cubo sobre el eje z',
  u: 'las dos capas de arriba', d: 'las dos capas de abajo', r: 'las dos capas derechas',
  l: 'las dos capas izquierdas', f: 'las dos capas frontales', b: 'las dos capas traseras',
};

// Cara de referencia (para colorear la ficha del movimiento en la interfaz).
export const MOVE_FACE = { U: 0, u: 0, y: 0, E: 3, R: 1, r: 1, x: 1, F: 2, f: 2, z: 2, S: 2, D: 3, d: 3, L: 4, l: 4, M: 4, B: 5, b: 5 };

/** Crea un movimiento a partir de su base ('R', 'M', 'x'…) y su número de cuartos (1, 2 o 3). */
export function makeMove(base, turns = 1) {
  const def = BASE_MOVES[base];
  if (!def) throw new Error(`Movimiento desconocido: ${base}`);
  turns = ((turns % 4) + 4) % 4;
  const suffix = turns === 2 ? '2' : turns === 3 ? "'" : '';
  return { base, turns, name: base + suffix, ...def };
}

export function invertMove(move) {
  return makeMove(move.base, 4 - move.turns);
}

export function describeMove(move) {
  const target = MOVE_DESCRIPTIONS[move.base];
  if (move.turns === 2) return { action: `Gira ${target} media vuelta`, detail: '180°' };
  if (move.turns === 1) return { action: `Gira ${target} en sentido horario`, detail: '90° horario' };
  return { action: `Gira ${target} en sentido antihorario`, detail: '90° antihorario' };
}

const TOKEN_RE = /([URFDLB]w|[URFDLBMESxyzurfdlb])(\d*)(['’′`]?)(\d*)/y;

/**
 * Convierte una secuencia en notación estándar ("R U R' U' F2 Rw x") en movimientos.
 * Lanza un Error con un mensaje en español si encuentra algo que no entiende.
 */
export function parseAlgorithm(text) {
  const moves = [];
  // Repeticiones como (R U R' U')3; después los paréntesis solo agrupan.
  let src = text;
  for (let prev = null; prev !== src;) {
    prev = src;
    src = src.replace(/\(([^()]*)\)\s*(\d+)/g, (_, group, n) => ` ${Array(Math.min(Number(n), 50)).fill(group).join(' ')} `);
  }
  src = src.replace(/[(),;]/g, ' ');
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) {
      i++;
      continue;
    }
    TOKEN_RE.lastIndex = i;
    const m = TOKEN_RE.exec(src);
    if (!m) throw new Error(`No entiendo «${src.slice(i).split(/\s/)[0]}».`);
    let base = m[1];
    if (base.length === 2) base = base[0].toLowerCase(); // Rw -> r
    const amount = parseInt(m[2] || m[4] || '1', 10);
    if (m[2] && m[4]) throw new Error(`No entiendo «${m[0]}».`);
    let turns = amount % 4;
    if (m[3]) turns = (4 - turns) % 4;
    if (turns !== 0) moves.push(makeMove(base, turns));
    i = TOKEN_RE.lastIndex;
  }
  return moves;
}

export function formatAlgorithm(moves) {
  return moves.map((m) => m.name).join(' ');
}

function rotateQuarter(v, axis) {
  const [x, y, z] = v;
  if (axis === 0) return [x, -z, y];
  if (axis === 1) return [z, y, -x];
  return [-y, x, z];
}

const permCache = new Map();

/** Permutación de pegatinas: nuevo[i] = viejo[perm[i]]. */
export function movePermutation(move) {
  const key = `${move.base}${move.turns}`;
  let perm = permCache.get(key);
  if (perm) return perm;
  perm = Array.from({ length: 54 }, (_, i) => i);
  const quarters = (((move.dir * move.turns) % 4) + 4) % 4;
  for (const s of STICKERS) {
    if (!move.layers.includes(s.pos[move.axis])) continue;
    let p = s.pos, n = s.normal;
    for (let q = 0; q < quarters; q++) {
      p = rotateQuarter(p, move.axis);
      n = rotateQuarter(n, move.axis);
    }
    perm[STICKER_BY_KEY.get(stickerKey(p, n))] = s.index;
  }
  permCache.set(key, perm);
  return perm;
}

export function applyMove(state, move) {
  const perm = movePermutation(move);
  return perm.map((src) => state[src]);
}

export function applyMoves(state, moves) {
  return moves.reduce((s, m) => applyMove(s, m), state);
}

const SCRAMBLE_FACES = ['U', 'D', 'R', 'L', 'F', 'B'];
const AXIS_OF = { U: 1, D: 1, R: 0, L: 0, F: 2, B: 2 };

/** Mezcla aleatoria de giros de cara, sin giros redundantes. */
export function randomScramble(length = 25, rng = Math.random) {
  const moves = [];
  while (moves.length < length) {
    const face = SCRAMBLE_FACES[Math.floor(rng() * 6)];
    const last = moves[moves.length - 1];
    const prev = moves[moves.length - 2];
    if (last && last.base === face) continue;
    if (last && prev && AXIS_OF[last.base] === AXIS_OF[face] && AXIS_OF[prev.base] === AXIS_OF[face]) continue;
    moves.push(makeMove(face, 1 + Math.floor(rng() * 3)));
  }
  return moves;
}

/**
 * Traduce los colores de las pegatinas a la cadena URFDLB que usa el resolvedor,
 * tomando como referencia el color de cada centro.
 */
export function stateToFacelets(state) {
  const faceOfColor = new Map();
  for (let f = 0; f < 6; f++) faceOfColor.set(state[f * 9 + 4], FACES[f]);
  return state.map((c) => faceOfColor.get(c) ?? '?').join('');
}

export function colorCounts(state) {
  const counts = COLORS.map(() => 0);
  let unknown = 0;
  for (const c of state) {
    if (c === UNKNOWN) unknown++;
    else counts[c]++;
  }
  return { counts, unknown };
}

// Patrones clásicos: se hacen partiendo del cubo resuelto.
// `face`: cara en la que aparece el dibujo, para orientar la vista hacia ella.
export const PATTERNS = [
  { id: 'mexico', name: 'Bandera de México', alg: "F2 L2 D2 R2 F2 L2 U2 F' R2 B' U F R' D' R D2 L'", face: 'U' },
  { id: 'francia', name: 'Bandera de Francia', alg: "R2 U' F2 U2 L2 R2 U' F D2 F2 D' L' F2 L2 B' R' D2", face: 'U' },
  { id: 'ajedrez', name: 'Tablero de ajedrez', alg: 'R2 L2 U2 D2 F2 B2' },
  { id: 'puntos', name: 'Puntos', alg: "U D' R L' F B' U D'" },
  { id: 'cruces', name: 'Cruces', alg: "U F B' L2 U2 L2 F' B U2 L2 U" },
  { id: 'seis-t', name: 'Seis T', alg: "F2 R2 U2 F' B D2 L2 F B" },
  { id: 'zigzag', name: 'Zigzag', alg: 'R L F B R L F B R L F B' },
  { id: 'rayas', name: 'Rayas verticales', alg: "F U F R L2 B D' R D2 L D' B R2 L F U F" },
  { id: 'tetris', name: 'Tetris', alg: "L R F B U' D' L' R'" },
  { id: 'cubo-en-cubo', name: 'Cubo en cubo', alg: "F L F U' R U F2 L2 U' L' B D' B' L2 U" },
  { id: 'cubo-triple', name: 'Cubo en cubo en cubo', alg: "U' L' U' F' R2 B' R F U B2 U B' L U' F U R F'" },
  { id: 'superflip', name: 'Superflip', alg: "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2" },
];

/** Cubo resuelto con los mismos centros que `state` (o el esquema estándar si no sirven). */
export function solvedLike(state) {
  const centers = FACES.map((_, f) => state[f * 9 + 4]);
  if (centers.includes(UNKNOWN) || new Set(centers).size !== 6) return solvedState();
  return STICKERS.map((s) => centers[s.face]);
}
