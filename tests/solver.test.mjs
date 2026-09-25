import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CubieCube, CubeError, MOVE_NAMES, SOLVED_FACELETS, faceletsToCubie, initSolver, solve,
} from '../js/solver/kociemba.js';
import {
  FACES, PATTERNS, applyMoves, invertMove, isSolved, makeMove, parseAlgorithm, randomScramble,
  solvedLike, solvedState, stateToFacelets,
} from '../js/cube-model.js';

// Generador pseudoaleatorio con semilla para que las pruebas sean reproducibles.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const toFacelets = (state) => state.map((f) => FACES[f]).join('');

test('el modelo de pegatinas y el de piezas coinciden en cada giro', () => {
  for (let m = 0; m < 18; m++) {
    const cubie = new CubieCube();
    cubie.move(m);
    const name = MOVE_NAMES[m];
    const state = applyMoves(solvedState(), parseAlgorithm(name));
    assert.equal(toFacelets(state), cubie.toFacelets(), `giro ${name}`);
  }
});

test('secuencias largas coinciden en ambos modelos', () => {
  const rng = mulberry32(7);
  for (let n = 0; n < 50; n++) {
    const moves = randomScramble(30, rng);
    const cubie = new CubieCube();
    for (const mv of moves) cubie.move(MOVE_NAMES.indexOf(mv.name));
    assert.equal(toFacelets(applyMoves(solvedState(), moves)), cubie.toFacelets());
  }
});

test('las coordenadas se pueden leer y escribir', () => {
  const c = new CubieCube();
  for (const v of [0, 1, 17, 1000, 2186]) {
    c.setTwist(v);
    assert.equal(c.getTwist(), v);
  }
  for (const v of [0, 5, 1023, 2047]) {
    c.setFlip(v);
    assert.equal(c.getFlip(), v);
  }
  for (const v of [0, 23, 24, 5000, 11879]) {
    c.setSliceSorted(v);
    assert.equal(c.getSliceSorted(), v);
  }
  for (const v of [0, 1, 777, 40319]) {
    c.setCorners(v);
    assert.equal(c.getCorners(), v);
    c.setUdEdges(v);
    assert.equal(c.getUdEdges(), v);
  }
});

test('el cubo resuelto no necesita movimientos', () => {
  assert.deepEqual(solve(SOLVED_FACELETS), []);
});

test('resuelve mezclas aleatorias en 22 movimientos o menos', () => {
  const t0 = performance.now();
  initSolver();
  console.log(`  tablas generadas en ${Math.round(performance.now() - t0)} ms`);
  const rng = mulberry32(42);
  const lengths = [];
  for (let n = 0; n < 40; n++) {
    const scramble = randomScramble(25, rng);
    const state = applyMoves(solvedState(), scramble);
    const solution = solve(stateToFacelets(state), { targetLength: 21, timeLimit: 500 });
    lengths.push(solution.length);
    const end = applyMoves(state, parseAlgorithm(solution.join(' ')));
    assert.ok(isSolved(end), `no resuelve ${scramble.map((m) => m.name).join(' ')}`);
    assert.ok(solution.length <= 22, `solución demasiado larga (${solution.length})`);
  }
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  console.log(`  longitud media ${avg.toFixed(1)}, máxima ${Math.max(...lengths)}`);
});

test('funciona con cualquier orientación y esquema de color de los centros', () => {
  const state = applyMoves(solvedState(), parseAlgorithm("x y2 R U R' U' M2 E S' F2 Rw"));
  const solution = solve(stateToFacelets(state));
  assert.ok(isSolved(applyMoves(state, parseAlgorithm(solution.join(' ')))));
});

test('las mezclas cortas reciben soluciones cortas', () => {
  for (const alg of ["R U R' U'", "F R U R' U' F'", 'R2 U2 F2', "L' D B2"]) {
    const state = applyMoves(solvedState(), parseAlgorithm(alg));
    const solution = solve(stateToFacelets(state));
    assert.ok(solution.length <= parseAlgorithm(alg).length, `${alg} -> ${solution.join(' ')}`);
    assert.ok(isSolved(applyMoves(state, parseAlgorithm(solution.join(' ')))));
  }
});

test('detecta estados imposibles', () => {
  const base = applyMoves(solvedState(), parseAlgorithm("R U F' L2 D B'"));
  const expectError = (state, code) => {
    assert.throws(() => faceletsToCubie(stateToFacelets(state)), (e) => e instanceof CubeError && e.code === code);
  };

  // Esquina girada: se rotan los tres colores de la esquina URF (U9, R1, F3).
  const twisted = base.slice();
  [twisted[8], twisted[9], twisted[20]] = [base[9], base[20], base[8]];
  expectError(twisted, 'twist');

  // Arista volteada: UF (U8, F2).
  const flipped = base.slice();
  [flipped[7], flipped[19]] = [base[19], base[7]];
  expectError(flipped, 'flip');

  // Dos aristas intercambiadas: UR y UL.
  const swapped = base.slice();
  [swapped[5], swapped[10], swapped[3], swapped[37]] = [base[3], base[37], base[5], base[10]];
  expectError(swapped, 'parity');

  // Colores que no suman 9.
  const counts = base.slice();
  counts[0] = counts[4] === 0 ? 1 : 0;
  counts[1] = counts[0];
  counts[2] = counts[0];
  expectError(counts, 'count');
});

test('interpreta la notación', () => {
  const names = (s) => parseAlgorithm(s).map((m) => m.name);
  assert.deepEqual(names("R U R' U'"), ['R', 'U', "R'", "U'"]);
  assert.deepEqual(names("RUR'U'"), ['R', 'U', "R'", "U'"]);
  assert.deepEqual(names("R2' Rw x' M2 (F B)"), ['R2', 'r', "x'", 'M2', 'F', 'B']);
  assert.deepEqual(names('R3 U4 L’'), ["R'", "L'"]);
  assert.deepEqual(names("(R U R' U')2 D"), ['R', 'U', "R'", "U'", 'R', 'U', "R'", "U'", 'D']);
  assert.throws(() => parseAlgorithm('R Q'));
  assert.throws(() => parseAlgorithm('[R, U]'));
  assert.equal(invertMove(makeMove('R', 1)).name, "R'");
});

test('los patrones son válidos y distintos del cubo resuelto', () => {
  for (const p of PATTERNS) {
    const state = applyMoves(solvedState(), parseAlgorithm(p.alg));
    assert.ok(!isSolved(state), p.name);
    faceletsToCubie(stateToFacelets(state));
  }
});

test('calcula cómo llegar a un dibujo desde el cubo resuelto', () => {
  const rng = mulberry32(3);
  for (let n = 0; n < 5; n++) {
    const target = applyMoves(solvedState(), randomScramble(20, rng));
    const solution = parseAlgorithm(solve(stateToFacelets(target)).join(' '));
    const path = solution.slice().reverse().map(invertMove);
    assert.deepEqual(applyMoves(solvedLike(target), path), target);
  }
});
