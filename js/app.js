import {
  COLORS, FACES, FACE_INFO, MOVE_FACE, PATTERNS, UNKNOWN, applyMove, applyMoves, colorCounts, describeMove,
  formatAlgorithm, invertMove, isSolved, makeMove, parseAlgorithm, randomScramble, solvedLike,
  solvedState, stateToFacelets,
} from './cube-model.js';
import { faceletsToCubie } from './solver/kociemba.js';

const $ = (id) => document.getElementById(id);
const DARK_INK = '#161b2c';
const inkFor = (color) => (color === 0 || color === 3 ? DARK_INK : '#ffffff');
const colorHex = (color) => (color === UNKNOWN ? 'var(--cube-unknown)' : COLORS[color].hex);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

let state = loadStored('rubik:state', isValidState) ?? solvedState();
let selectedColor = 0;
let activeTab = 'colores';
let speed = loadStored('rubik:speed', (v) => [0.5, 1, 2, 4].includes(v)) ?? 1;
let cube = null;
let solving = false;
const history = [];
const player = { moves: [], start: null, index: 0, ms: 0, playing: false, token: 0 };

function loadStored(key, check) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return check(value) ? value : null;
  } catch {
    return null;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento no disponible: no pasa nada */
  }
}

function isValidState(v) {
  return Array.isArray(v) && v.length === 54 && v.every((c) => Number.isInteger(c) && c >= -1 && c < 6);
}

// ---------------------------------------------------------------------------
// Motor de resolución (Web Worker)
// ---------------------------------------------------------------------------

class SolverClient {
  constructor(onStatus) {
    this.onStatus = onStatus;
    this.pending = new Map();
    this.nextId = 1;
    try {
      this.worker = new Worker(new URL('./solver/worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this._onMessage(e.data);
      this.worker.onerror = (e) => {
        e.preventDefault();
        this._useMainThread();
      };
      this.worker.postMessage({ type: 'init' });
    } catch {
      this._useMainThread();
    }
  }

  _onMessage(msg) {
    if (msg.type === 'ready') {
      this.onStatus('ready', msg.ms);
      return;
    }
    const job = this.pending.get(msg.id);
    if (!job) return;
    this.pending.delete(msg.id);
    if (msg.type === 'solution') job.resolve({ moves: msg.moves, ms: msg.ms });
    else job.reject(new Error(msg.message));
  }

  // Plan B si el navegador no admite workers de tipo módulo.
  async _useMainThread() {
    if (this.local) return;
    this.worker?.terminate();
    this.worker = null;
    this.local = import('./solver/kociemba.js');
    const mod = await this.local;
    await sleep(30);
    const t0 = performance.now();
    mod.initSolver();
    this.onStatus('ready', performance.now() - t0);
    for (const [id, job] of this.pending) {
      this.pending.delete(id);
      this._solveLocal(job);
    }
  }

  async _solveLocal(job) {
    try {
      const mod = await this.local;
      const t0 = performance.now();
      const moves = mod.solve(job.facelets, job.options);
      job.resolve({ moves, ms: performance.now() - t0 });
    } catch (err) {
      job.reject(err);
    }
  }

  solve(facelets, options = { targetLength: 20, timeLimit: 1200 }) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const job = { facelets, options, resolve, reject };
      if (this.worker) {
        this.pending.set(id, job);
        this.worker.postMessage({ type: 'solve', id, facelets, options });
      } else if (this.local) {
        setTimeout(() => this._solveLocal(job), 20);
      } else {
        this.pending.set(id, job);
      }
    });
  }
}

const engine = $('engineStatus');
function setEngineStatus(kind, text) {
  engine.dataset.state = kind;
  engine.querySelector('.engine-text').textContent = text;
}

const solver = new SolverClient((status, ms) => {
  if (status === 'ready') {
    solver.ready = true;
    if (!solving) setEngineStatus('ready', `Motor listo · ${(ms / 1000).toFixed(1).replace('.', ',')} s`);
  }
});

// ---------------------------------------------------------------------------
// Visor 3D
// ---------------------------------------------------------------------------

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

async function initViewer() {
  if (!hasWebGL()) {
    $('webglError').hidden = false;
    $('viewerHint').hidden = true;
    return;
  }
  try {
    const { Cube3D } = await import('./cube3d.js');
    cube = new Cube3D($('viewer'), { onStickerClick: (i) => paintSticker(i, true) });
    cube.setState(state);
    cube.setPaintMode(activeTab === 'colores');
  } catch (err) {
    console.error(err);
    $('webglError').hidden = false;
    $('viewerHint').hidden = true;
  }
}

$('resetViewBtn').addEventListener('click', () => cube?.resetView());
$('flipViewBtn').addEventListener('click', () => cube?.flipView());
$('autoRotateBtn').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(on));
  cube?.setAutoRotate(on);
});

// ---------------------------------------------------------------------------
// Paleta y plantilla
// ---------------------------------------------------------------------------

const palette = $('palette');
const swatches = [...COLORS.map((c, i) => ({ id: i, name: c.name, hex: c.hex })), { id: UNKNOWN, name: 'Borrar' }];
for (const sw of swatches) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'swatch' + (sw.id === UNKNOWN ? ' eraser' : '');
  btn.setAttribute('role', 'radio');
  btn.dataset.color = sw.id;
  btn.title = sw.id === UNKNOWN ? 'Borrar (0)' : `${sw.name} (${sw.id + 1})`;
  btn.setAttribute('aria-label', sw.name);
  btn.innerHTML = `<span class="swatch-chip" style="--c:${sw.hex ?? 'transparent'}"></span><span class="swatch-count"></span>`;
  btn.addEventListener('click', () => selectColor(sw.id));
  palette.appendChild(btn);
}

function selectColor(id) {
  selectedColor = id;
  for (const b of palette.children) b.setAttribute('aria-checked', String(Number(b.dataset.color) === id));
}

const net = $('net');
const netStickers = [];
for (const face of ['U', 'L', 'F', 'R', 'B', 'D']) {
  const f = FACES.indexOf(face);
  const el = document.createElement('div');
  el.className = 'net-face';
  el.dataset.face = face;
  for (let k = 0; k < 9; k++) {
    const i = f * 9 + k;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sticker' + (k === 4 ? ' center' : '');
    b.dataset.index = i;
    if (k === 4) b.textContent = face;
    el.appendChild(b);
    netStickers[i] = b;
  }
  net.appendChild(el);
}

// Pintar arrastrando con el ratón; con el dedo basta con tocar.
let dragPainting = false;
net.addEventListener('pointerdown', (e) => {
  const s = e.target.closest('.sticker');
  if (!s) return;
  if (e.pointerType === 'mouse') {
    e.preventDefault();
    dragPainting = true;
    paintSticker(Number(s.dataset.index), true);
  }
});
net.addEventListener('pointerover', (e) => {
  if (!dragPainting) return;
  const s = e.target.closest('.sticker');
  if (s) paintSticker(Number(s.dataset.index), false);
});
window.addEventListener('pointerup', () => {
  dragPainting = false;
});
net.addEventListener('click', (e) => {
  const s = e.target.closest('.sticker');
  // Los clics de ratón ya se han pintado en pointerdown; e.detail === 0 es teclado.
  if (s && (e.pointerType !== 'mouse' || e.detail === 0)) paintSticker(Number(s.dataset.index), true);
});

function paintSticker(i, newStroke) {
  if (state[i] === selectedColor) return;
  if (newStroke) pushHistory();
  state = state.slice();
  state[i] = selectedColor;
  stateEdited();
  netStickers[i].classList.remove('painted');
  void netStickers[i].offsetWidth;
  netStickers[i].classList.add('painted');
}

function renderNet() {
  for (let i = 0; i < 54; i++) {
    const c = state[i];
    const b = netStickers[i];
    b.style.setProperty('--c', colorHex(c));
    b.classList.toggle('unknown', c === UNKNOWN);
    const s = { face: FACES[(i / 9) | 0], row: ((i % 9) / 3 | 0) + 1, col: (i % 3) + 1 };
    b.setAttribute('aria-label', `${FACE_INFO[s.face].name}, fila ${s.row}, columna ${s.col}: ${c === UNKNOWN ? 'sin color' : COLORS[c].name}`);
    if (i % 9 === 4) b.style.color = c === UNKNOWN ? 'rgba(255,255,255,.6)' : inkFor(c) === DARK_INK ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.75)';
  }
  const { counts } = colorCounts(state);
  for (const b of palette.children) {
    const id = Number(b.dataset.color);
    const count = b.querySelector('.swatch-count');
    if (id === UNKNOWN) {
      const unknown = state.filter((c) => c === UNKNOWN).length;
      count.textContent = unknown ? `${unknown}` : '–';
      continue;
    }
    count.textContent = `${counts[id]}/9`;
    b.classList.toggle('full', counts[id] === 9);
    b.classList.toggle('over', counts[id] > 9);
  }
  renderKeypad();
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

function validate(s) {
  const { counts, unknown } = colorCounts(s);
  const over = counts.map((n, c) => [n, c]).filter(([n]) => n > 9);
  if (over.length) {
    return { ok: false, level: 'error', text: `Sobran pegatinas de color ${over.map(([n, c]) => `${COLORS[c].name.toLowerCase()} (${n})`).join(', ')}. Cada color aparece 9 veces.` };
  }
  if (unknown > 0) {
    return { ok: false, level: 'info', text: unknown === 1 ? 'Falta 1 pegatina por pintar.' : `Faltan ${unknown} pegatinas por pintar.` };
  }
  const wrong = counts.map((n, c) => [n, c]).filter(([n]) => n !== 9);
  if (wrong.length) {
    return { ok: false, level: 'error', text: `Cada color debe aparecer 9 veces. Revisa: ${wrong.map(([n, c]) => `${COLORS[c].name.toLowerCase()} (${n})`).join(', ')}.` };
  }
  if (new Set(FACES.map((_, f) => s[f * 9 + 4])).size !== 6) {
    return { ok: false, level: 'error', text: 'Los seis centros deben tener colores distintos.' };
  }
  try {
    faceletsToCubie(stateToFacelets(s));
  } catch (err) {
    return { ok: false, level: 'error', text: err.message };
  }
  if (isSolved(s)) return { ok: true, solved: true, level: 'ok', text: 'El cubo ya está resuelto. ¡Mézclalo para empezar!' };
  return { ok: true, level: 'ok', text: 'Cubo válido: listo para resolver.' };
}

const STATUS_ICONS = { info: '#i-dots', ok: '#i-check', error: '#i-alert' };
function renderStatus() {
  const v = validate(state);
  const el = $('status');
  el.dataset.level = v.level;
  el.querySelector('use').setAttribute('href', STATUS_ICONS[v.level]);
  $('statusText').textContent = v.text;
  return v;
}

// ---------------------------------------------------------------------------
// Cambios de estado
// ---------------------------------------------------------------------------

function pushHistory() {
  history.push(state.slice());
  if (history.length > 200) history.shift();
}

function refresh() {
  renderNet();
  renderStatus();
  store('rubik:state', state);
}

/** El usuario ha modificado el cubo a mano: la solución anterior deja de valer. */
function stateEdited() {
  clearSolution();
  cube?.setState(state);
  refresh();
}

function doMoves(moves, duration = 260) {
  if (!moves.length) return;
  pushHistory();
  clearSolution();
  for (const m of moves) {
    state = applyMove(state, m);
    cube?.animateMove(m, state, duration);
  }
  refresh();
}

function undo() {
  const prev = history.pop();
  if (!prev) {
    toast('No hay nada que deshacer.');
    return;
  }
  state = prev;
  stateEdited();
}

$('undoBtn').addEventListener('click', undo);
$('clearBtn').addEventListener('click', () => {
  pushHistory();
  state = state.map((c, i) => (i % 9 === 4 ? c : UNKNOWN));
  stateEdited();
  toast('Plantilla vacía: solo quedan los centros.');
});
$('resetBtn').addEventListener('click', () => {
  pushHistory();
  state = solvedState();
  stateEdited();
});

// ---------------------------------------------------------------------------
// Mezclar
// ---------------------------------------------------------------------------

$('scrambleBtn').addEventListener('click', () => {
  if (state.includes(UNKNOWN)) {
    pushHistory();
    state = solvedState();
    cube?.setState(state);
  }
  const moves = randomScramble(22);
  $('scrambleText').textContent = formatAlgorithm(moves);
  $('scrambleOut').hidden = false;
  doMoves(moves, 110);
});

$('copyScrambleBtn').addEventListener('click', () => copyText($('scrambleText').textContent, 'Mezcla copiada'));

function applyTypedAlgorithm() {
  const input = $('algInput');
  const err = $('algError');
  try {
    const moves = parseAlgorithm(input.value);
    if (!moves.length) throw new Error('Escribe algún movimiento, por ejemplo: R U R\' U\'.');
    err.hidden = true;
    doMoves(moves, moves.length > 30 ? 90 : 200);
    toast(`${moves.length} ${moves.length === 1 ? 'movimiento aplicado' : 'movimientos aplicados'}.`, 'success');
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  }
}
$('applyAlgBtn').addEventListener('click', applyTypedAlgorithm);
$('algInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyTypedAlgorithm();
});
$('algInput').addEventListener('input', () => {
  $('algError').hidden = true;
});

const keypad = $('keypad');
const KEYPAD_FACES = ['U', 'D', 'R', 'L', 'F', 'B'];
for (const suffix of ['', "'", '2']) {
  for (const f of KEYPAD_FACES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'key';
    b.textContent = f + suffix;
    b.dataset.face = f;
    b.addEventListener('click', () => {
      if (player.playing) return;
      doMoves(parseAlgorithm(f + suffix));
    });
    keypad.appendChild(b);
  }
}

function renderKeypad() {
  for (const b of keypad.children) b.style.setProperty('--c', colorHex(state[FACES.indexOf(b.dataset.face) * 9 + 4]));
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

const solveBtn = $('solveBtn');
solveBtn.addEventListener('click', solveCube);

async function solveCube() {
  if (solving) return;
  const v = renderStatus();
  if (!v.ok) {
    shake($('status'));
    toast(v.text, v.level === 'error' ? 'error' : 'info');
    return;
  }
  if (v.solved) {
    toast('¡El cubo ya está resuelto! Mézclalo o pinta tu cubo.', 'success');
    return;
  }
  const snapshot = state.slice();
  const result = await runSolver(snapshot, solveBtn, solveBtn.querySelector('.solve-label'));
  if (!result) return;
  loadSequence(result.moves, { kind: 'solve', ms: result.ms });
  selectTab('solucion');
  toast(`¡Solución encontrada en ${result.moves.length} movimientos!`, 'success');
  revealPlayer();
}

/** Calcula la solución de `snapshot` mostrando el progreso en `button`. Devuelve null si falla. */
async function runSolver(snapshot, button, label) {
  solving = true;
  const idleText = label.textContent;
  button.classList.add('loading');
  button.disabled = true;
  label.textContent = solver.ready ? 'Calculando…' : 'Preparando el motor…';
  setEngineStatus('busy', 'Calculando…');
  try {
    const [res] = await Promise.all([solver.solve(stateToFacelets(snapshot)), sleep(350)]);
    if (snapshot.join() !== state.join()) return null; // el cubo cambió mientras se calculaba
    const moves = res.moves.map((name) => parseAlgorithm(name)[0]);
    if (!isSolved(applyMoves(snapshot, moves))) throw new Error('La solución calculada no es válida.');
    return { moves, ms: res.ms };
  } catch (err) {
    toast(err.message, 'error');
    return null;
  } finally {
    solving = false;
    button.classList.remove('loading');
    button.disabled = false;
    label.textContent = idleText;
    setEngineStatus(solver.ready ? 'ready' : 'loading', solver.ready ? 'Motor listo' : 'Preparando el motor…');
  }
}

function revealPlayer() {
  if (window.innerWidth < 1080) $('player').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'end' });
}

// ---------------------------------------------------------------------------
// Patrones y dibujos propios
// ---------------------------------------------------------------------------

const NET_POS = { U: [0, 1], L: [1, 0], F: [1, 1], R: [1, 2], B: [1, 3], D: [2, 1] };

function miniNet(s) {
  const el = document.createElement('div');
  el.className = 'mini-net';
  el.setAttribute('aria-hidden', 'true');
  s.forEach((c, i) => {
    const [fr, fc] = NET_POS[FACES[(i / 9) | 0]];
    const cell = document.createElement('span');
    cell.style.gridArea = `${fr * 3 + (((i % 9) / 3) | 0) + 1} / ${fc * 3 + (i % 3) + 1}`;
    cell.style.setProperty('--c', colorHex(c));
    el.appendChild(cell);
  });
  return el;
}

const patternGrid = $('patternGrid');
for (const p of PATTERNS) {
  const moves = parseAlgorithm(p.alg);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pattern-card';
  b.dataset.pattern = p.id;
  b.title = p.alg;
  b.appendChild(miniNet(applyMoves(solvedState(), moves)));
  const text = document.createElement('span');
  text.className = 'pattern-text';
  const where = p.face === 'U' ? ' · cara blanca' : '';
  text.innerHTML = `<span class="pattern-name"></span><span class="pattern-meta">${moves.length} movimientos${where}</span>`;
  text.firstChild.textContent = p.name;
  b.appendChild(text);
  b.addEventListener('click', () => showPattern(p));
  patternGrid.appendChild(b);
}

/** Pone el cubo resuelto y reproduce los giros que forman el patrón. */
function showPattern(p) {
  if (solving) return;
  pushHistory();
  state = solvedLike(state);
  stateEdited();
  loadSequence(parseAlgorithm(p.alg), { kind: 'pattern', name: p.name, patternId: p.id });
  if (p.face === 'U') cube?.showTop();
  selectTab('solucion');
  revealPlayer();
  play();
}

$('designBtn').addEventListener('click', async () => {
  if (solving) return;
  const v = validate(state);
  if (v.solved) {
    toast('Primero pinta tu dibujo en la pestaña Colores.');
    return;
  }
  if (!v.ok) {
    toast(`Ese dibujo no se puede hacer: ${v.text}`, 'error');
    return;
  }
  const target = state.slice();
  const result = await runSolver(target, $('designBtn'), $('designBtn').querySelector('.design-label'));
  if (!result) return;
  // La solución lleva del dibujo al cubo resuelto; al revés, lleva del resuelto al dibujo.
  const moves = result.moves.slice().reverse().map(invertMove);
  pushHistory();
  state = solvedLike(target);
  stateEdited();
  loadSequence(moves, { kind: 'design', name: 'Tu dibujo', ms: result.ms });
  selectTab('solucion');
  toast(`Tu dibujo se hace en ${moves.length} movimientos.`, 'success');
  revealPlayer();
});

// ---------------------------------------------------------------------------
// Reproductor de la solución
// ---------------------------------------------------------------------------

const playerEl = $('player');
const movesList = $('movesList');

const SEQUENCE_TEXT = {
  solve: {
    kind: 'Solución', done: '¡Cubo resuelto!',
    tip: 'Sujeta tu cubo siempre igual que en la plantilla (mismo centro arriba y de frente): cada letra indica la cara tal y como la ves.',
  },
  pattern: {
    kind: 'Patrón', done: '¡Patrón terminado!',
    tip: 'Parte de un cubo resuelto con el blanco arriba y el verde de frente, y haz los giros en orden.',
  },
  design: {
    kind: 'Dibujo', done: '¡Dibujo terminado!',
    tip: 'Parte de un cubo resuelto, sujeto igual que en la plantilla, y haz los giros en orden para que aparezca tu dibujo.',
  },
};

/** Carga una secuencia de giros que empieza en el estado actual del cubo. */
function loadSequence(moves, { kind = 'solve', name = '', ms = null, patternId = null } = {}) {
  player.token++;
  Object.assign(player, { moves, start: state.slice(), index: 0, ms, kind, playing: false });
  movesList.innerHTML = '';
  moves.forEach((m, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'move-chip';
    b.innerHTML = `<span class="n">${i + 1}</span>${m.name}`;
    b.title = `${describeMove(m).action} (paso ${i + 1})`;
    b.style.setProperty('--c', colorHex(player.start[MOVE_FACE[m.base] * 9 + 4]));
    b.addEventListener('click', () => jumpTo(i + 1));
    li.appendChild(b);
    movesList.appendChild(li);
  });
  const text = SEQUENCE_TEXT[kind];
  $('seqKind').textContent = text.kind;
  $('seqName').textContent = name || `${moves.length} movimientos`;
  $('tipText').textContent = text.tip;
  $('solvedBadgeText').textContent = text.done;
  $('statMoves').textContent = moves.length;
  $('statTimeBox').hidden = ms === null;
  if (ms !== null) $('statTime').textContent = Math.max(1, Math.round(ms));
  $('solutionEmpty').hidden = true;
  $('solutionBox').hidden = false;
  $('solutionCount').hidden = false;
  $('solutionCount').textContent = moves.length;
  for (const card of patternGrid.children) card.classList.toggle('active', card.dataset.pattern === patternId);
  updatePlayer();
}

function clearSolution() {
  $('solvedBadge').hidden = true;
  if (!player.start) return;
  player.token++;
  Object.assign(player, { moves: [], start: null, index: 0, playing: false });
  for (const card of patternGrid.children) card.classList.remove('active');
  $('solutionEmpty').hidden = false;
  $('solutionBox').hidden = true;
  $('solutionCount').hidden = true;
  movesList.innerHTML = '';
  updatePlayer();
}

function moveDuration() {
  return 420 / speed;
}

function afterPlayerStep() {
  refresh();
  updatePlayer(true);
}

function stepForward(fromPlay = false) {
  if (player.index >= player.moves.length) return Promise.resolve();
  if (!fromPlay) stopPlaying();
  const move = player.moves[player.index++];
  state = applyMove(state, move);
  afterPlayerStep();
  const done = cube ? cube.animateMove(move, state, moveDuration()) : sleep(moveDuration());
  return done.then(() => {
    if (player.start && player.index === player.moves.length && !cube?.isAnimating()) celebrate();
  });
}

function stepBack() {
  if (player.index <= 0) return;
  stopPlaying();
  $('solvedBadge').hidden = true;
  const move = invertMove(player.moves[--player.index]);
  state = applyMove(state, move);
  afterPlayerStep();
  cube?.animateMove(move, state, moveDuration());
}

function jumpTo(i) {
  if (!player.start) return;
  stopPlaying();
  $('solvedBadge').hidden = true;
  player.index = Math.max(0, Math.min(player.moves.length, i));
  state = applyMoves(player.start, player.moves.slice(0, player.index));
  cube?.setState(state);
  afterPlayerStep();
  if (player.index === player.moves.length && player.index > 0) celebrate();
}

async function play() {
  if (!player.moves.length) return;
  if (player.index >= player.moves.length) {
    jumpTo(0);
    await sleep(250);
  }
  const token = ++player.token;
  player.playing = true;
  updatePlayer();
  while (token === player.token && player.index < player.moves.length) {
    await stepForward(true);
    if (token !== player.token) return;
    await sleep(110 / speed);
  }
  if (token === player.token) {
    player.playing = false;
    updatePlayer();
  }
}

function stopPlaying() {
  if (!player.playing) return;
  player.playing = false;
  player.token++;
  updatePlayer();
}

function togglePlay() {
  if (player.playing) stopPlaying();
  else play();
}

$('playBtn').addEventListener('click', togglePlay);
$('nextBtn').addEventListener('click', () => stepForward());
$('prevBtn').addEventListener('click', stepBack);
$('firstBtn').addEventListener('click', () => jumpTo(0));
$('lastBtn').addEventListener('click', () => jumpTo(player.moves.length));
$('copySolutionBtn').addEventListener('click', () => copyText(formatAlgorithm(player.moves), 'Movimientos copiados'));

for (const b of document.querySelectorAll('.speed button')) {
  b.addEventListener('click', () => setSpeed(Number(b.dataset.speed)));
}
function setSpeed(v) {
  speed = v;
  store('rubik:speed', v);
  for (const b of document.querySelectorAll('.speed button')) b.setAttribute('aria-checked', String(Number(b.dataset.speed) === v));
}

function updatePlayer(bump = false) {
  const { moves, index, start } = player;
  const has = !!start;
  const total = moves.length;
  playerEl.classList.toggle('is-empty', !has);
  playerEl.classList.toggle('is-playing', player.playing);
  $('playBtn').setAttribute('aria-label', player.playing ? 'Pausar' : 'Reproducir');
  $('playBtn').disabled = !has;
  $('prevBtn').disabled = $('firstBtn').disabled = !has || index === 0;
  $('nextBtn').disabled = $('lastBtn').disabled = !has || index === total;
  $('progressBar').style.setProperty('--p', has ? `${(index / total) * 100}%` : '0%');

  const badge = $('moveBadge');
  let face = null;
  if (!has) {
    badge.textContent = '–';
    $('moveAction').textContent = 'La solución aparecerá aquí';
    $('moveDetail').textContent = 'Pinta tu cubo o mézclalo y pulsa «Resolver».';
  } else if (index === 0) {
    const first = moves[0];
    face = first;
    badge.textContent = first.name;
    $('moveAction').textContent = `Empieza con ${first.name}`;
    $('moveDetail').textContent = `${describeMove(first).action}. Pulsa ▶ o → para verlo.`;
  } else if (index === total) {
    badge.textContent = '✓';
    $('moveAction').textContent = SEQUENCE_TEXT[player.kind].done;
    $('moveDetail').textContent = `${total} movimientos en total. Pulsa ▶ para verlo otra vez.`;
  } else {
    const m = moves[index - 1];
    face = m;
    badge.textContent = m.name;
    $('moveAction').textContent = describeMove(m).action;
    $('moveDetail').textContent = `Paso ${index} de ${total} · siguiente: ${moves[index].name}`;
  }
  if (face) {
    const c = start[MOVE_FACE[face.base] * 9 + 4];
    badge.style.setProperty('--face', colorHex(c));
    badge.style.setProperty('--face-ink', inkFor(c));
    badge.style.opacity = index === 0 ? '0.75' : '1';
  } else if (has) {
    badge.style.setProperty('--face', 'var(--success)');
    badge.style.setProperty('--face-ink', '#fff');
    badge.style.opacity = '1';
  } else {
    badge.style.removeProperty('--face');
    badge.style.removeProperty('--face-ink');
    badge.style.opacity = '1';
  }
  if (bump) {
    badge.classList.remove('bump');
    void badge.offsetWidth;
    badge.classList.add('bump');
  }

  $('statStep').textContent = `${index}/${total}`;
  [...movesList.querySelectorAll('.move-chip')].forEach((chip, i) => {
    chip.classList.toggle('done', i < index - 1);
    chip.classList.toggle('current', i === index - 1);
  });
  // Mantiene visible el movimiento actual desplazando solo la lista, no la página.
  const current = movesList.querySelector('.current');
  if (current && activeTab === 'solucion') {
    const box = movesList.getBoundingClientRect();
    const r = current.getBoundingClientRect();
    if (r.top < box.top) movesList.scrollTop -= box.top - r.top + 4;
    else if (r.bottom > box.bottom) movesList.scrollTop += r.bottom - box.bottom + 4;
  }
}

// ---------------------------------------------------------------------------
// Celebración
// ---------------------------------------------------------------------------

let lastConfetti = 0;
function celebrate() {
  $('solvedBadge').hidden = false;
  if (reducedMotion || performance.now() - lastConfetti < 2000) return;
  lastConfetti = performance.now();
  confetti();
}

function confetti() {
  const canvas = $('confetti');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio, 2);
  const w = (canvas.width = canvas.clientWidth * dpr);
  const h = (canvas.height = canvas.clientHeight * dpr);
  const parts = Array.from({ length: 150 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.2,
    y: h * 0.45,
    vx: (Math.random() - 0.5) * 22 * dpr,
    vy: (-Math.random() * 18 - 6) * dpr,
    s: (5 + Math.random() * 7) * dpr,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    c: COLORS[(Math.random() * 6) | 0].hex,
  }));
  const t0 = performance.now();
  const frame = (now) => {
    const t = now - t0;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, 1 - t / 2600);
    for (const p of parts) {
      p.vy += 0.55 * dpr;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.roundRect(-p.s / 2, -p.s / 2, p.s, p.s, p.s * 0.25);
      ctx.fill();
      ctx.restore();
    }
    if (t < 2600) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, w, h);
  };
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Pestañas
// ---------------------------------------------------------------------------

const tabs = [...document.querySelectorAll('.tab')];
function selectTab(name, focus = false) {
  activeTab = name;
  for (const t of tabs) {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $(`pane-${t.dataset.tab}`).hidden = !on;
    if (on && focus) t.focus();
  }
  cube?.setPaintMode(name === 'colores');
  $('viewerHint').classList.toggle('painting', name === 'colores');
  if (name === 'solucion') updatePlayer();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => selectTab(t.dataset.tab));
  t.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    selectTab(tabs[(i + d + tabs.length) % tabs.length].dataset.tab, true);
  });
});

// ---------------------------------------------------------------------------
// Teclado
// ---------------------------------------------------------------------------

const MOVE_KEYS = new Set(['U', 'R', 'F', 'D', 'L', 'B', 'M', 'E', 'S', 'X', 'Y', 'Z']);
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const onButton = e.target.closest('button');
  if (player.start) {
    if (e.key === ' ' && !onButton) {
      e.preventDefault();
      togglePlay();
      return;
    }
    const actions = { ArrowRight: () => stepForward(), ArrowLeft: stepBack, Home: () => jumpTo(0), End: () => jumpTo(player.moves.length) };
    if (actions[e.key] && !e.target.closest('[role="tab"]')) {
      e.preventDefault();
      actions[e.key]();
      return;
    }
  }
  if (activeTab === 'colores' && /^[0-6]$/.test(e.key)) {
    selectColor(e.key === '0' ? UNKNOWN : Number(e.key) - 1);
    return;
  }
  const letter = e.key.toUpperCase();
  if (e.key.length === 1 && MOVE_KEYS.has(letter) && !player.playing) {
    const base = 'XYZ'.includes(letter) ? letter.toLowerCase() : letter;
    doMoves([makeMove(base, e.shiftKey ? 3 : 1)], 200);
  }
});

// ---------------------------------------------------------------------------
// Guía de notación
// ---------------------------------------------------------------------------

function notationCard(face) {
  const f = FACES.indexOf(face);
  const color = COLORS[f];
  const ink = inkFor(f);
  let squares = '';
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) squares += `<rect x="${3 + c * 23}" y="${3 + r * 23}" width="21" height="21" rx="5" fill="${color.hex}"/>`;
  }
  return `
    <article class="notation-card">
      <div class="notation-face" aria-hidden="true">
        <svg viewBox="0 0 74 74">
          <rect x="0" y="0" width="74" height="74" rx="12" fill="#0b0f1a"/>
          ${squares}
          <path d="M23.9 23.9A18.5 18.5 0 1 1 23.9 50.1" fill="none" stroke="#0b0f1a" stroke-opacity=".55" stroke-width="7.5" stroke-linecap="round"/>
          <path d="M20.4 46.6 28.9 48 21.8 55.1Z" fill="#0b0f1a" fill-opacity=".55" stroke="#0b0f1a" stroke-opacity=".55" stroke-width="4" stroke-linejoin="round"/>
          <path d="M23.9 23.9A18.5 18.5 0 1 1 23.9 50.1" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
          <path d="M20.4 46.6 28.9 48 21.8 55.1Z" fill="#fff" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="notation-body">
        <h3><code>${face}</code>${FACE_INFO[face].name}</h3>
        <div class="notation-variants" style="--c:${color.hex}; --ink:${ink}">
          <span class="variant"><b>${face}</b>horario</span>
          <span class="variant"><b>${face}'</b>antihorario</span>
          <span class="variant"><b>${face}2</b>media vuelta</span>
        </div>
      </div>
    </article>`;
}
$('notationGrid').innerHTML = ['R', 'L', 'U', 'D', 'F', 'B'].map(notationCard).join('');

// ---------------------------------------------------------------------------
// Utilidades de interfaz
// ---------------------------------------------------------------------------

function toast(text, type = 'info') {
  const icon = type === 'success' ? '#i-check' : type === 'error' ? '#i-alert' : '#i-sparkles';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<svg class="icon"><use href="${icon}"/></svg><span></span>`;
  el.querySelector('span').textContent = text;
  const box = $('toasts');
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 300);
  }, type === 'error' ? 4200 : 2600);
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message, 'success');
  } catch {
    toast('No se ha podido copiar al portapapeles.', 'error');
  }
}

$('themeToggle').addEventListener('click', () => {
  const root = document.documentElement;
  const current = root.dataset.theme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const next = current === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  try {
    localStorage.setItem('rubik:theme', next);
  } catch {
    /* sin almacenamiento */
  }
});

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

selectColor(0);
setSpeed(speed);
selectTab('colores');
refresh();
updatePlayer();
initViewer();
