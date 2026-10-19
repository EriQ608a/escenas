import test from 'node:test';
import assert from 'node:assert/strict';
import { compilar, formatear, leerNumero } from '../expr.js';
import { crearEstado } from '../estado.js';

const def = () => ({
  id: 't',
  params: { a: { val: 0.1 }, rho: 6e-6 },
  vars: { r: { min: 0, max: 0.4, val: 0.05 } },
  derivadas: { Q: 'rho*4/3*PI*a**3', Q9: 'Q*1e9' },
  apartados: [
    { k: 'a', pide: [{ valor: 'Q9' }] },
    { k: 'c', pide: [{ valor: 'rho*0.07/(3*eps0)' }, { opciones: ['radial', 'tangencial'], correcta: 0 }] },
    { k: 'z', pide: [{ valor: '0' }] },
  ],
});

class Almacen { constructor() { this.m = {}; } getItem(k) { return this.m[k] ?? null; } setItem(k, v) { this.m[k] = String(v); } }
const roto = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };

test('compilar evalúa con ámbito', () => {
  assert.equal(compilar('a*2', ['a'])({ a: 3 }), 6);
  assert.equal(compilar(5, [])({}), 5);
});

test('leerNumero acepta coma, espacios, menos tipográfico y ×10^', () => {
  assert.equal(leerNumero('11 310,5'), 11310.5);
  assert.equal(leerNumero('−7,3e4'), -73000);
  assert.equal(leerNumero('2,5·10^-8'), 2.5e-8);
  assert.equal(leerNumero('2.5x10^-8'), 2.5e-8);
  assert.ok(Number.isNaN(leerNumero('abc')));
  assert.ok(Number.isNaN(leerNumero('')));
});

test('formatear con prefijo y separador de miles', () => {
  assert.equal(formatear(25.13e-9, 'C'), '25,13 nC');
  assert.equal(formatear(-753.98e-9, 'C'), '−754,0 nC');
  assert.equal(formatear(11310.2, 'N/C'), '11 310 N/C');
  assert.equal(formatear(0.15, 'm'), '0,1500 m');
});

test('derivadas y revelado por apartado', () => {
  const e = crearEstado(def(), { almacen: null });
  assert.ok(Math.abs(e.valor('Q9') - 25.1327) < 1e-3);
  assert.equal(e.permitido('c'), false);
  assert.equal(e.permitido(undefined), true);
  assert.equal(e.permitido("r<a?'c':'a'"), false);
  e.marcar('c');
  assert.equal(e.permitido('c'), true);
  assert.equal(e.permitido("r<a?'c':'a'"), true);
  e.set({ vars: { r: 0.2 } });
  assert.equal(e.permitido("r<a?'c':'a'"), false);
  assert.equal(e.permitido(['a', 'c']), false);
  e.marcar('a');
  assert.equal(e.permitido(['a', 'c']), true);
});

test('comprobar ±1 %, signo, opciones y cero', () => {
  const e = crearEstado(def(), { almacen: null });
  const Q9 = e.valor('Q9');
  assert.equal(e.comprobar('a', [Q9 * 1.011]).ok, false);
  assert.equal(e.comprobar('a', [-Q9]).ok, false);
  assert.equal(e.resuelto('a'), false, 'fallar no resuelve');
  assert.equal(e.comprobar('a', [Q9 * 1.009]).ok, true);
  const Ec = 6e-6 * 0.07 / (3 * 8.8541878128e-12);
  assert.deepEqual(e.comprobar('c', [Ec, 1]).items, [true, false]);
  assert.equal(e.comprobar('c', [Ec, 0]).ok, true);
  assert.equal(e.resuelto('c'), true, 'acertar resuelve');
  assert.equal(e.comprobar('z', [0]).ok, true);
  assert.equal(e.comprobar('z', [1e-13]).ok, true);
  assert.equal(e.comprobar('z', [0.01]).ok, false);
});

test('¿y si…?: la solución usa los datos originales', () => {
  const e = crearEstado(def(), { almacen: null });
  const sol = e.solucion('a')[0];
  e.set({ params: { rho: 1e-5 } });
  assert.equal(e.cambiado(), true);
  assert.ok(e.valor('Q9') > sol * 1.5);
  assert.equal(e.solucion('a')[0], sol);
  assert.equal(e.comprobar('a', [sol]).ok, true);
  e.restaurar();
  assert.equal(e.cambiado(), false);
});

test('persistencia y almacén que lanza', () => {
  const alm = new Almacen();
  const e1 = crearEstado(def(), { almacen: alm, clave: 'k1' });
  e1.marcar('a'); e1.marcar('c', 'visto');
  const e2 = crearEstado(def(), { almacen: alm, clave: 'k1' });
  assert.equal(e2.resuelto('a'), true);
  assert.equal(e2.como('c'), 'visto');
  e2.reiniciar();
  assert.equal(crearEstado(def(), { almacen: alm, clave: 'k1' }).resuelto('a'), false);
  const e3 = crearEstado(def(), { almacen: roto, clave: 'k' });
  e3.marcar('a');
  assert.equal(e3.resuelto('a'), true);
});

test('modo sesión: resueltos dados y avisos a suscriptores', () => {
  const e = crearEstado(def(), { almacen: null, resueltos: ['a'] });
  assert.equal(e.resuelto('a'), true);
  let n = 0; const off = e.on(() => n++);
  e.set({ vars: { r: 0.1 } }); e.marcar('c');
  off(); e.marcar('z');
  assert.equal(n, 2);
});

test('revelado por punto: solo la región resuelta', () => {
  const e = crearEstado(def(), { almacen: null });
  e.marcar('c');
  const f = e.permitidoEn("pr<a?'c':'a'");
  assert.equal(f(0.05, 0, 0), true);
  assert.equal(f(0, 0.2, 0), false);
  assert.equal(e.permitidoEn(['c', "pr<a?'c':'z'"])(0, 0, 0.3), false);
  assert.equal(e.permitidoEn(undefined)(1, 1, 1), true);
  assert.equal(formatear(6e-6, 'C/m³'), '6,000 µC/m³');
});

test('formatearTex: coma decimal y miles', async () => {
  const { formatearTex } = await import('../expr.js');
  assert.equal(formatearTex(13553, 'N/C'), String.raw`13\,553\ \text{N/C}`);
  assert.equal(formatearTex(25.13e-9, 'C'), String.raw`25{,}13\ \text{nC}`);
  assert.equal(formatearTex(-1.694e5, 'N/C'), String.raw`-169\,400\ \text{N/C}`);
});
