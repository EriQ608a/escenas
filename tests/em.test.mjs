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

// S12 Ej. 2: cilindro infinito, núcleo ρ1 = +8 µC/m³ (s < a = 2 cm) y anillo ρ2 = −8/3 µC/m³ (a < s < b = 4 cm)
test('s12ej2: cilindro núcleo + anillo', () => {
  const amb2 = { ...CONSTANTES, a: 0.02, b: 0.04, rho1: 8e-6, rho2: -8e-6 / 3 };
  const c = crearCampo([
    { tipo: 'cilindro', R: 'a', rho: 'rho1' },
    { tipo: 'cilindro', Ri: 'a', R: 'b', rho: 'rho2' },
    { tipo: 'gaussiana-cilindro', R: 'r' },
  ], amb2);
  const e0 = CONSTANTES.eps0;
  cerca(c.qenc(0.02), 3.2e-9 * Math.PI, 1e-9, 'λ núcleo');
  assert.ok(Math.abs(c.qenc(0.05)) < 1e-20, 'λ fuera = 0');
  assert.ok(Math.abs(c.Er(0.05)) < 1e-9, 'E fuera = 0');
  cerca(c.Er(0.02), 8e-6 * 0.02 / (2 * e0), 1e-6, 'E(a)');
  cerca(c.Er(0.02), 9035, 0.002, 'E(a) ≈ 9,04 kV/m');
  cerca(c.Er(0.01), 8e-6 * 0.01 / (2 * e0), 1e-9, 'E núcleo');
  cerca(c.Er(0.03), (8e-6 * 0.02 ** 2 + (-8e-6 / 3) * (0.03 ** 2 - 0.02 ** 2)) / (2 * e0 * 0.03), 1e-9, 'E anillo');
  cerca(c.Er(0.02 - 1e-9), c.Er(0.02 + 1e-9), 1e-6, 'continuo en a');
  assert.ok(Math.abs(c.Er(0.04 - 1e-9)) < 1, 'llega a 0 en b');
  const Ez = c.E([0.01, 0.01, 3]); assert.ok(Math.abs(Ez[2]) < 1e-12 && Math.abs(Ez[0] - Ez[1]) < 1e-9, 'radial en xy');
  // V continuo y −dV/ds = E
  const V = s => c.V([s, 0, 0]);
  const dV = s => -(V(s + 1e-6) - V(s - 1e-6)) / 2e-6;
  for (const s of [0.01, 0.02, 0.03]) cerca(dV(s), c.Er(s), 1e-3, `-dV/ds en ${s}`);
  for (const s of [0.04, 0.05]) assert.ok(Math.abs(dV(s)) < 1, `-dV/ds ≈ 0 en ${s}`);
});

test('corteza cilíndrica', () => {
  const c = crearCampo([{ tipo: 'corteza-cilindro', R: 0.1, sigma: 1e-6 }], CONSTANTES);
  assert.equal(c.Er(0.05), 0);
  cerca(c.Er(0.2), 1e-6 * 2 * Math.PI * 0.1 / (2 * Math.PI * CONSTANTES.eps0 * 0.2), 1e-9, 'E fuera');
  cerca(c.qenc(0.2), 1e-6 * 2 * Math.PI * 0.1, 1e-12, 'λ');
});
