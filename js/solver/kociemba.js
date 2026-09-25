// Algoritmo de dos fases de Herbert Kociemba.
//
// Fase 1: lleva el cubo al subgrupo G1 = <U, D, R2, L2, F2, B2>
//         (todas las piezas orientadas y las aristas de la capa media en su capa).
// Fase 2: resuelve el cubo usando solo los movimientos de G1.
//
// Las caras se numeran U=0, R=1, F=2, D=3, L=4, B=5 y los movimientos como
// 3 * cara + (potencia - 1): U, U2, U', R, R2, R', ...
//
// El estado de entrada es una cadena de 54 caracteres con las caras en orden
// U R F D L B (9 pegatinas por cara, en orden de lectura).

export const FACE_LETTERS = 'URFDLB';
export const MOVE_NAMES = [];
for (const f of FACE_LETTERS) MOVE_NAMES.push(f, f + '2', f + "'");

export const SOLVED_FACELETS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

// Esquinas: URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB
// Aristas:  UR, UF, UL, UB, DR, DF, DL, DB, FR, FL, BL, BR
const CORNER_FACELET = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
const CORNER_COLOR = [
  [0, 1, 2], [0, 2, 4], [0, 4, 5], [0, 5, 1],
  [3, 2, 1], [3, 4, 2], [3, 5, 4], [3, 1, 5],
];
const EDGE_FACELET = [
  [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25],
  [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14],
];
const EDGE_COLOR = [
  [0, 1], [0, 2], [0, 4], [0, 5], [3, 1], [3, 2],
  [3, 4], [3, 5], [2, 1], [2, 4], [5, 4], [5, 1],
];

// ---------------------------------------------------------------------------
// Cubo a nivel de piezas
// ---------------------------------------------------------------------------

export class CubieCube {
  constructor(cp, co, ep, eo) {
    this.cp = cp ? cp.slice() : [0, 1, 2, 3, 4, 5, 6, 7];
    this.co = co ? co.slice() : [0, 0, 0, 0, 0, 0, 0, 0];
    this.ep = ep ? ep.slice() : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    this.eo = eo ? eo.slice() : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }

  clone() {
    return new CubieCube(this.cp, this.co, this.ep, this.eo);
  }

  cornerMultiply(b) {
    const cp = TMP8a, co = TMP8b;
    for (let i = 0; i < 8; i++) {
      cp[i] = this.cp[b.cp[i]];
      co[i] = (this.co[b.cp[i]] + b.co[i]) % 3;
    }
    for (let i = 0; i < 8; i++) {
      this.cp[i] = cp[i];
      this.co[i] = co[i];
    }
  }

  edgeMultiply(b) {
    const ep = TMP12a, eo = TMP12b;
    for (let i = 0; i < 12; i++) {
      ep[i] = this.ep[b.ep[i]];
      eo[i] = (this.eo[b.ep[i]] + b.eo[i]) & 1;
    }
    for (let i = 0; i < 12; i++) {
      this.ep[i] = ep[i];
      this.eo[i] = eo[i];
    }
  }

  multiply(b) {
    this.cornerMultiply(b);
    this.edgeMultiply(b);
  }

  move(m) {
    const basic = BASIC_MOVES[(m / 3) | 0];
    for (let p = m % 3; p >= 0; p--) this.multiply(basic);
  }

  // --- Coordenadas ---------------------------------------------------------

  getTwist() {
    let r = 0;
    for (let i = 0; i < 7; i++) r = 3 * r + this.co[i];
    return r;
  }

  setTwist(twist) {
    let parity = 0;
    for (let i = 6; i >= 0; i--) {
      this.co[i] = twist % 3;
      parity += this.co[i];
      twist = (twist / 3) | 0;
    }
    this.co[7] = (3 - (parity % 3)) % 3;
  }

  getFlip() {
    let r = 0;
    for (let i = 0; i < 11; i++) r = 2 * r + this.eo[i];
    return r;
  }

  setFlip(flip) {
    let parity = 0;
    for (let i = 10; i >= 0; i--) {
      this.eo[i] = flip & 1;
      parity += this.eo[i];
      flip >>= 1;
    }
    this.eo[11] = parity & 1;
  }

  // Posición y orden de las 4 aristas de la capa media (FR, FL, BL, BR): 0..11879
  getSliceSorted() {
    let a = 0, x = 0;
    const edge4 = [0, 0, 0, 0];
    for (let j = 11; j >= 0; j--) {
      if (this.ep[j] >= 8) {
        a += cnk(11 - j, x + 1);
        edge4[3 - x] = this.ep[j];
        x++;
      }
    }
    let b = 0;
    for (let j = 3; j > 0; j--) {
      let k = 0;
      while (edge4[j] !== j + 8) {
        rotateLeft(edge4, 0, j);
        k++;
      }
      b = (j + 1) * b + k;
    }
    return 24 * a + b;
  }

  setSliceSorted(idx) {
    const sliceEdge = [8, 9, 10, 11];
    const otherEdge = [0, 1, 2, 3, 4, 5, 6, 7];
    let b = idx % 24;
    let a = (idx / 24) | 0;
    this.ep.fill(-1);
    for (let j = 1; j < 4; j++) {
      let k = b % (j + 1);
      b = (b / (j + 1)) | 0;
      while (k-- > 0) rotateRight(sliceEdge, 0, j);
    }
    let x = 4;
    for (let j = 0; j < 12; j++) {
      if (a - cnk(11 - j, x) >= 0) {
        this.ep[j] = sliceEdge[4 - x];
        a -= cnk(11 - j, x);
        x--;
      }
    }
    x = 0;
    for (let j = 0; j < 12; j++) if (this.ep[j] === -1) this.ep[j] = otherEdge[x++];
  }

  getCorners() {
    const perm = this.cp.slice();
    let b = 0;
    for (let j = 7; j > 0; j--) {
      let k = 0;
      while (perm[j] !== j) {
        rotateLeft(perm, 0, j);
        k++;
      }
      b = (j + 1) * b + k;
    }
    return b;
  }

  setCorners(idx) {
    for (let i = 0; i < 8; i++) this.cp[i] = i;
    for (let j = 0; j < 8; j++) {
      let k = idx % (j + 1);
      idx = (idx / (j + 1)) | 0;
      while (k-- > 0) rotateRight(this.cp, 0, j);
    }
  }

  // Permutación de las 8 aristas U/D; solo válida dentro de G1.
  getUdEdges() {
    const perm = this.ep.slice(0, 8);
    let b = 0;
    for (let j = 7; j > 0; j--) {
      let k = 0;
      while (perm[j] !== j) {
        rotateLeft(perm, 0, j);
        k++;
      }
      b = (j + 1) * b + k;
    }
    return b;
  }

  setUdEdges(idx) {
    for (let i = 0; i < 12; i++) this.ep[i] = i;
    for (let j = 0; j < 8; j++) {
      let k = idx % (j + 1);
      idx = (idx / (j + 1)) | 0;
      while (k-- > 0) rotateRight(this.ep, 0, j);
    }
  }

  cornerParity() {
    let s = 0;
    for (let i = 7; i > 0; i--) for (let j = i - 1; j >= 0; j--) if (this.cp[j] > this.cp[i]) s++;
    return s & 1;
  }

  edgeParity() {
    let s = 0;
    for (let i = 11; i > 0; i--) for (let j = i - 1; j >= 0; j--) if (this.ep[j] > this.ep[i]) s++;
    return s & 1;
  }

  toFacelets() {
    const f = SOLVED_FACELETS.split('');
    for (let i = 0; i < 8; i++) {
      const j = this.cp[i], ori = this.co[i];
      for (let n = 0; n < 3; n++) f[CORNER_FACELET[i][(n + ori) % 3]] = FACE_LETTERS[CORNER_COLOR[j][n]];
    }
    for (let i = 0; i < 12; i++) {
      const j = this.ep[i], ori = this.eo[i];
      for (let n = 0; n < 2; n++) f[EDGE_FACELET[i][(n + ori) % 2]] = FACE_LETTERS[EDGE_COLOR[j][n]];
    }
    return f.join('');
  }
}

const TMP8a = new Array(8), TMP8b = new Array(8), TMP12a = new Array(12), TMP12b = new Array(12);

function rotateLeft(arr, l, r) {
  const t = arr[l];
  for (let i = l; i < r; i++) arr[i] = arr[i + 1];
  arr[r] = t;
}

function rotateRight(arr, l, r) {
  const t = arr[r];
  for (let i = r; i > l; i--) arr[i] = arr[i - 1];
  arr[l] = t;
}

function cnk(n, k) {
  if (n < k) return 0;
  if (k > n / 2) k = n - k;
  let s = 1;
  for (let i = n, j = 1; i !== n - k; i--, j++) s = (s * i) / j;
  return s;
}

// Los seis giros básicos (un cuarto de vuelta en sentido horario).
const BASIC_MOVES = [
  // U
  new CubieCube([3, 0, 1, 2, 4, 5, 6, 7], [0, 0, 0, 0, 0, 0, 0, 0],
    [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  // R
  new CubieCube([4, 1, 2, 0, 7, 5, 6, 3], [2, 0, 0, 1, 1, 0, 0, 2],
    [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  // F
  new CubieCube([1, 5, 2, 3, 0, 4, 6, 7], [1, 2, 0, 0, 2, 1, 0, 0],
    [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0]),
  // D
  new CubieCube([0, 1, 2, 3, 5, 6, 7, 4], [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  // L
  new CubieCube([0, 2, 6, 3, 4, 1, 5, 7], [0, 1, 2, 0, 0, 2, 1, 0],
    [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  // B
  new CubieCube([0, 1, 3, 7, 4, 5, 2, 6], [0, 0, 1, 2, 0, 0, 2, 1],
    [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1]),
];

// ---------------------------------------------------------------------------
// Conversión desde pegatinas y validación
// ---------------------------------------------------------------------------

export class CubeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Convierte una cadena de 54 letras (URFDLB) en un CubieCube y comprueba que
 * corresponda a un cubo físicamente resoluble. Lanza CubeError si no lo es.
 */
export function faceletsToCubie(facelets) {
  if (typeof facelets !== 'string' || facelets.length !== 54) {
    throw new CubeError('format', 'El estado del cubo debe tener 54 pegatinas.');
  }
  const f = new Array(54);
  const count = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 54; i++) {
    const v = FACE_LETTERS.indexOf(facelets[i]);
    if (v < 0) throw new CubeError('format', 'Hay pegatinas sin color.');
    f[i] = v;
    count[v]++;
  }
  if (count.some((c) => c !== 9)) {
    throw new CubeError('count', 'Cada color debe aparecer exactamente 9 veces.');
  }

  const cc = new CubieCube();
  for (let i = 0; i < 8; i++) {
    const fac = CORNER_FACELET[i];
    let ori = 0;
    while (ori < 3 && f[fac[ori]] !== 0 && f[fac[ori]] !== 3) ori++;
    if (ori === 3) throw new CubeError('corner', 'Hay una esquina con una combinación de colores imposible.');
    const col1 = f[fac[(ori + 1) % 3]];
    const col2 = f[fac[(ori + 2) % 3]];
    let found = -1;
    for (let j = 0; j < 8; j++) {
      if (CORNER_COLOR[j][0] === f[fac[ori]] && CORNER_COLOR[j][1] === col1 && CORNER_COLOR[j][2] === col2) {
        found = j;
        break;
      }
    }
    if (found < 0) throw new CubeError('corner', 'Hay una esquina con una combinación de colores imposible.');
    cc.cp[i] = found;
    cc.co[i] = ori;
  }
  for (let i = 0; i < 12; i++) {
    const a = f[EDGE_FACELET[i][0]], b = f[EDGE_FACELET[i][1]];
    let found = -1;
    for (let j = 0; j < 12; j++) {
      if (a === EDGE_COLOR[j][0] && b === EDGE_COLOR[j][1]) {
        cc.eo[i] = 0;
        found = j;
        break;
      }
      if (a === EDGE_COLOR[j][1] && b === EDGE_COLOR[j][0]) {
        cc.eo[i] = 1;
        found = j;
        break;
      }
    }
    if (found < 0) throw new CubeError('edge', 'Hay una arista con una combinación de colores imposible.');
    cc.ep[i] = found;
  }

  if (new Set(cc.cp).size !== 8) {
    throw new CubeError('dup-corner', 'Hay esquinas repetidas: revisa los colores de las esquinas.');
  }
  if (new Set(cc.ep).size !== 12) {
    throw new CubeError('dup-edge', 'Hay aristas repetidas: revisa los colores de las aristas.');
  }
  if (cc.co.reduce((s, v) => s + v, 0) % 3 !== 0) {
    throw new CubeError('twist', 'Una esquina está girada sobre sí misma. Revisa el orden de los colores de las esquinas.');
  }
  if (cc.eo.reduce((s, v) => s + v, 0) % 2 !== 0) {
    throw new CubeError('flip', 'Una arista está volteada. Revisa los dos colores de las aristas.');
  }
  if (cc.cornerParity() !== cc.edgeParity()) {
    throw new CubeError('parity', 'Hay dos piezas intercambiadas: este estado no se puede alcanzar girando el cubo.');
  }
  return cc;
}

// ---------------------------------------------------------------------------
// Tablas de movimientos y de poda
// ---------------------------------------------------------------------------

const N_TWIST = 2187;
const N_FLIP = 2048;
const N_SLICE = 495;
const N_SLICE_SORTED = 11880;
const N_PERM8 = 40320;
const N_SLICE_PERM = 24;
const N_MOVE = 18;

const PHASE2_MOVES = [0, 1, 2, 4, 7, 9, 10, 11, 13, 16]; // U U2 U' R2 F2 D D2 D' L2 B2
const ALL_MOVES = Array.from({ length: N_MOVE }, (_, i) => i);
const IS_PHASE2 = ALL_MOVES.map((m) => PHASE2_MOVES.includes(m));

let tables = null;

function buildMoveTable(size, set, get, multiply, allowed) {
  const table = new Uint16Array(size * N_MOVE);
  const c = new CubieCube();
  for (let i = 0; i < size; i++) {
    set(c, i);
    for (let f = 0; f < 6; f++) {
      const basic = BASIC_MOVES[f];
      for (let p = 0; p < 3; p++) {
        multiply(c, basic);
        const m = 3 * f + p;
        if (!allowed || allowed[m]) table[i * N_MOVE + m] = get(c);
      }
      multiply(c, basic); // la cuarta vuelta deja la pieza como estaba
    }
  }
  return table;
}

function buildPruneTable(n1, n2, move1, move2, moves) {
  const size = n1 * n2;
  const table = new Int8Array(size).fill(-1);
  table[0] = 0;
  let done = 1;
  let depth = 0;
  while (done < size) {
    let changed = 0;
    for (let i = 0; i < size; i++) {
      if (table[i] !== depth) continue;
      const a = (i / n2) | 0;
      const b = i - a * n2;
      for (let k = 0; k < moves.length; k++) {
        const m = moves[k];
        const j = move1[a * N_MOVE + m] * n2 + move2[b * N_MOVE + m];
        if (table[j] === -1) {
          table[j] = depth + 1;
          changed++;
        }
      }
    }
    if (changed === 0) break;
    done += changed;
    depth++;
  }
  return table;
}

const cornerMul = (c, b) => c.cornerMultiply(b);
const edgeMul = (c, b) => c.edgeMultiply(b);

/** Genera las tablas (tarda alrededor de un segundo). Es idempotente. */
export function initSolver() {
  if (tables) return;
  const twistMove = buildMoveTable(N_TWIST, (c, i) => c.setTwist(i), (c) => c.getTwist(), cornerMul);
  const flipMove = buildMoveTable(N_FLIP, (c, i) => c.setFlip(i), (c) => c.getFlip(), edgeMul);
  const sliceSortedMove = buildMoveTable(
    N_SLICE_SORTED, (c, i) => c.setSliceSorted(i), (c) => c.getSliceSorted(), edgeMul);
  const cornersMove = buildMoveTable(N_PERM8, (c, i) => c.setCorners(i), (c) => c.getCorners(), cornerMul);
  const udEdgesMove = buildMoveTable(
    N_PERM8, (c, i) => c.setUdEdges(i), (c) => c.getUdEdges(), edgeMul, IS_PHASE2);

  // La posición (sin orden) de las aristas medias se obtiene de la tabla ordenada.
  const sliceMove = new Uint16Array(N_SLICE * N_MOVE);
  for (let s = 0; s < N_SLICE; s++) {
    for (let m = 0; m < N_MOVE; m++) {
      sliceMove[s * N_MOVE + m] = (sliceSortedMove[s * 24 * N_MOVE + m] / 24) | 0;
    }
  }

  const sliceTwistPrune = buildPruneTable(N_SLICE, N_TWIST, sliceMove, twistMove, ALL_MOVES);
  const sliceFlipPrune = buildPruneTable(N_SLICE, N_FLIP, sliceMove, flipMove, ALL_MOVES);
  const cornersSlicePrune = buildPruneTable(N_PERM8, N_SLICE_PERM, cornersMove, sliceSortedMove, PHASE2_MOVES);
  const udEdgesSlicePrune = buildPruneTable(N_PERM8, N_SLICE_PERM, udEdgesMove, sliceSortedMove, PHASE2_MOVES);

  tables = {
    twistMove, flipMove, sliceMove, sliceSortedMove, cornersMove, udEdgesMove,
    sliceTwistPrune, sliceFlipPrune, cornersSlicePrune, udEdgesSlicePrune,
  };
}

export function isSolverReady() {
  return tables !== null;
}

// ---------------------------------------------------------------------------
// Búsqueda
// ---------------------------------------------------------------------------

/**
 * Resuelve el cubo descrito por `facelets` (cadena URFDLB de 54 letras).
 * Devuelve la lista de movimientos en notación estándar.
 *
 * Opciones:
 *  - targetLength: longitud que se considera suficientemente buena.
 *  - minTime: milisegundos que se sigue buscando algo más corto aunque ya se haya
 *    alcanzado targetLength (así las mezclas cortas reciben soluciones cortas).
 *  - timeLimit: milisegundos máximos para mejorar la solución una vez encontrada una.
 */
export function solve(facelets, { targetLength = 20, minTime = 150, timeLimit = 1500, maxLength = 30 } = {}) {
  const start = faceletsToCubie(facelets);
  initSolver();
  const t = tables;
  const t0 = now();

  const path = new Int8Array(64);
  let best = maxLength + 1;
  let bestMoves = null;
  let nodes = 0;
  let stop = false;

  if (facelets === SOLVED_FACELETS) return [];

  const shouldStop = () => {
    const elapsed = now() - t0;
    if (!bestMoves) return elapsed > 60000;
    return (best <= targetLength && elapsed >= minTime) || elapsed > timeLimit;
  };

  function phase2(corners, udEdges, slice, depth, togo, lastFace) {
    if (togo === 0) return corners === 0 && udEdges === 0 && slice === 0;
    for (let k = 0; k < PHASE2_MOVES.length; k++) {
      const m = PHASE2_MOVES[k];
      const face = (m / 3) | 0;
      if (face === lastFace || face === lastFace - 3) continue;
      const nc = t.cornersMove[corners * N_MOVE + m];
      const nu = t.udEdgesMove[udEdges * N_MOVE + m];
      const ns = t.sliceSortedMove[slice * N_MOVE + m];
      const h = Math.max(t.cornersSlicePrune[nc * 24 + ns], t.udEdgesSlicePrune[nu * 24 + ns]);
      if (h >= togo) continue;
      path[depth] = m;
      if (phase2(nc, nu, ns, depth + 1, togo - 1, face)) return true;
    }
    return false;
  }

  function startPhase2(depth1) {
    const lastMove = depth1 > 0 ? path[depth1 - 1] : -1;
    // Si el último giro de la fase 1 ya es de G1 habríamos llegado antes a G1.
    if (lastMove >= 0 && IS_PHASE2[lastMove]) return;
    const c = start.clone();
    for (let i = 0; i < depth1; i++) c.move(path[i]);
    const corners = c.getCorners();
    const udEdges = c.getUdEdges();
    const slice = c.getSliceSorted();
    const maxDepth2 = best - 1 - depth1;
    const h = Math.max(t.cornersSlicePrune[corners * 24 + slice], t.udEdgesSlicePrune[udEdges * 24 + slice]);
    const lastFace = lastMove >= 0 ? (lastMove / 3) | 0 : -1;
    for (let d2 = h; d2 <= maxDepth2; d2++) {
      if (phase2(corners, udEdges, slice, depth1, d2, lastFace)) {
        best = depth1 + d2;
        bestMoves = Array.from(path.subarray(0, best));
        if (shouldStop()) stop = true;
        return;
      }
    }
  }

  function phase1(twist, flip, slice, depth, togo, lastFace) {
    if (togo === 0) {
      if (twist === 0 && flip === 0 && slice === 0) startPhase2(depth);
      return;
    }
    if ((++nodes & 0x3fff) === 0 && shouldStop()) {
      stop = true;
      return;
    }
    for (let face = 0; face < 6; face++) {
      if (face === lastFace || face === lastFace - 3) continue;
      for (let p = 0; p < 3; p++) {
        const m = 3 * face + p;
        const nt = t.twistMove[twist * N_MOVE + m];
        const nf = t.flipMove[flip * N_MOVE + m];
        const ns = t.sliceMove[slice * N_MOVE + m];
        const h = Math.max(t.sliceTwistPrune[ns * N_TWIST + nt], t.sliceFlipPrune[ns * N_FLIP + nf]);
        if (h >= togo) continue;
        path[depth] = m;
        phase1(nt, nf, ns, depth + 1, togo - 1, face);
        if (stop) return;
      }
    }
  }

  const twist = start.getTwist();
  const flip = start.getFlip();
  const slice = (start.getSliceSorted() / 24) | 0;
  for (let depth1 = 0; depth1 < best && !stop; depth1++) {
    phase1(twist, flip, slice, 0, depth1, -1);
  }

  if (!bestMoves) throw new CubeError('unsolvable', 'No se ha encontrado ninguna solución.');
  return bestMoves.map((m) => MOVE_NAMES[m]);
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
