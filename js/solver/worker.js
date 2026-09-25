// Ejecuta el resolvedor en segundo plano para no bloquear la interfaz.
import { initSolver, solve } from './kociemba.js';

let ready = false;

function ensureReady() {
  if (ready) return;
  const t0 = performance.now();
  initSolver();
  ready = true;
  self.postMessage({ type: 'ready', ms: performance.now() - t0 });
}

self.onmessage = (event) => {
  const { type, id, facelets, options } = event.data;
  if (type === 'init') {
    ensureReady();
    return;
  }
  if (type === 'solve') {
    try {
      ensureReady();
      const t0 = performance.now();
      const moves = solve(facelets, options);
      self.postMessage({ type: 'solution', id, moves, ms: performance.now() - t0 });
    } catch (err) {
      self.postMessage({ type: 'error', id, code: err.code || 'unknown', message: err.message });
    }
  }
};
