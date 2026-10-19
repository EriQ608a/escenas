import test from 'node:test';
import assert from 'node:assert/strict';
import { crearCampo, trazarLinea } from '../em.js';
import { CONSTANTES } from '../estado.js';

// Ej. 5 del AC2: esfera ρ = 6 µC/m³ (a = 0,1 m) + corteza σ = −1,5 µC/m² (b = 0,2 m)
const amb = { ...CONSTANTES, a: 0.1, b: 0.2, rho: 6e-6, sigma: -1.5e-6 };
const piezas = [
  { tipo: 'esfera', R: 'a', rho: 'rho', et: 'a · ρ > 0' },
  { tipo: 'corteza', R: 'b', sigma: 'sigma' },
  { tipo: 'gaussiana-esfera', R: 'r' },          // no es fuente: se ignora
];
const cerca = (x, y, tol, msg) => assert.ok(Math.abs(x - y) <= tol * Math.abs(y), `${msg}: ${x} vs ${y}`);

test('ej05: cargas encerradas (apartado a, e)', () => {
  const c = crearCampo(piezas, amb);
  cerca(c.qenc(0.11), 25.13e-9, 1e-3, 'Q esfera');
  cerca(c.qenc(0.3) - c.qenc(0.11), -753.98e-9, 1e-3, 'Q corteza');
  cerca(c.qenc(0.3), -728.85e-9, 1e-3, 'Q total');
  cerca(c.qenc(0.05), 6e-6 * 4 / 3 * Math.PI * 0.05 ** 3, 1e-9, 'Q parcial');
});

test('ej05: E(r) en los puntos del enunciado (apartado f)', () => {
  const c = crearCampo(piezas, amb);
  cerca(c.Er(0.05), 11310, 0.01, 'E(0,05)');
  cerca(c.Er(0.15), 10053, 0.01, 'E(0,15)');
  cerca(c.Er(0.3), -72885, 0.01, 'E(0,3)');
  cerca(c.Er(0.1), 22619, 0.01, 'E(a)');
});

test('ej05: salto en b = σ/ε0 y continuidad en a', () => {
  const c = crearCampo(piezas, amb);
  cerca(c.Er(0.2 + 1e-9) - c.Er(0.2 - 1e-9), -169415, 1e-3, 'salto en b');
  cerca(c.Er(0.1 + 1e-9), c.Er(0.1 - 1e-9), 1e-6, 'continuo en a');
  assert.ok(c.Er(0.2) < 0, 'en r = b exacto ya cuenta la corteza (región e)');
});

test('campo radial y potencial continuo', () => {
  const c = crearCampo(piezas, amb);
  const [x, y, z] = c.E([0, 0.05, 0]);
  assert.ok(Math.abs(x) < 1e-9 && Math.abs(z) < 1e-9 && y > 0);
  cerca(c.V([0.2 + 1e-9, 0, 0]), c.V([0.2 - 1e-9, 0, 0]), 1e-6, 'V continuo en b');
  cerca(c.V([0.3, 0, 0]), 8.9875517923e9 * -728.85e-9 / 0.3, 1e-3, 'V fuera');
});

test('hilo, plano y puntual', () => {
  const c = crearCampo([{ tipo: 'hilo', lambda: 2e-9 }, { tipo: 'plano', sigma: 0, }], CONSTANTES);
  cerca(c.E([0.1, 0, 5])[0], 2e-9 / (2 * Math.PI * 8.8541878128e-12 * 0.1), 1e-9, 'hilo');
  const p = crearCampo([{ tipo: 'plano', sigma: 1e-6 }], CONSTANTES);
  cerca(p.E([3, 1, 0.2])[2], 1e-6 / (2 * 8.8541878128e-12), 1e-9, 'plano arriba');
  assert.ok(p.E([0, 0, -0.2])[2] < 0, 'plano abajo');
  const q = crearCampo([{ tipo: 'puntual', q: 1e-9, pos: [1, 0, 0] }], CONSTANTES);
  cerca(q.E([2, 0, 0])[0], 8.9875517923, 1e-9, 'puntual');
});

test('líneas: radiales hacia fuera y se paran en el límite', () => {
  const c = crearCampo(piezas.slice(0, 1), amb);
  const L = trazarLinea(c.E, [0.05, 0, 0], { paso: 0.01, limite: 0.4 });
  assert.ok(L.length > 10);
  const fin = L[L.length - 1];
  assert.ok(Math.hypot(...fin) <= 0.41 && Math.hypot(...fin) > 0.38);
  assert.ok(Math.abs(fin[1]) < 1e-9 && Math.abs(fin[2]) < 1e-9, 'sigue radial');
});
