// estado.js — modelo puro de una escena: datos, variables, derivadas, apartados y regla de revelado.
// No toca el DOM. La física (campo de las piezas) llega por `ayudas(ambitoDeParams)`.
import { compilar, compilarPunto, leerNumero } from './expr.js';

export const CONSTANTES = { k: 8.9875517923e9, eps0: 8.8541878128e-12, mu0: 1.25663706212e-6, c0: 299792458 };
const MATH = Object.fromEntries(Object.getOwnPropertyNames(Math).map(n => [n, Math[n]]));
const TOL = 0.01;          // ±1 % por defecto
const TOL_ABS = 1e-9;      // cuando el valor esperado es 0

const norm = v => (typeof v === 'object' && v !== null ? { ...v } : { val: v });

/**
 * def: { id, params, vars, derivadas, apartados:[{k, pide:[{valor, tol?} | {opciones, correcta}]}] }
 * op:  { almacen?: Storage|null, clave?: string, resueltos?: string[], ayudas?: amb => object }
 */
export function crearEstado(def, op = {}) {
  const P = Object.fromEntries(Object.entries(def.params || {}).map(([n, v]) => [n, norm(v)]));
  const Vd = Object.fromEntries(Object.entries(def.vars || {}).map(([n, v]) => [n, norm(v)]));
  const original = Object.fromEntries(Object.entries(P).map(([n, v]) => [n, v.val]));
  const params = { ...original };
  const vars = Object.fromEntries(Object.entries(Vd).map(([n, v]) => [n, v.val]));
  const derivadas = Object.entries(def.derivadas || {});
  const apartados = def.apartados || [];
  const claves = new Set(apartados.map(a => a.k));
  const almacen = op.almacen === undefined ? null : op.almacen;
  const clave = op.clave || 'escenas:' + (def.id || 'escena');
  const subs = new Set();

  let hecho = {};
  try { const t = almacen && almacen.getItem(clave); if (t) hecho = JSON.parse(t) || {}; } catch { hecho = {}; }
  for (const k of op.resueltos || []) hecho[k] = 'hecho';

  const guardar = () => {
    if (!almacen || op.resueltos) return;
    try { almacen.setItem(clave, JSON.stringify(hecho)); } catch { /* sin persistencia: sigue funcionando */ }
  };
  const avisar = () => subs.forEach(f => f(api));

  // ámbito: constantes, Math, params, vars, ayudas de campo, derivadas (en orden), extra
  const cacheAyudas = new Map();
  function ayudasPara(ps) {
    if (!op.ayudas) return {};
    const k = JSON.stringify(ps);
    if (!cacheAyudas.has(k)) {
      if (cacheAyudas.size > 8) cacheAyudas.clear();
      cacheAyudas.set(k, op.ayudas({ ...CONSTANTES, ...MATH, ...ps }));
    }
    return cacheAyudas.get(k);
  }
  function construir(ps, vs, extra) {
    const amb = { ...MATH, ...CONSTANTES, ...ps, ...vs, ...ayudasPara(ps), ...extra };
    for (const [n, src] of derivadas) amb[n] = compilar(src, Object.keys(amb))(amb);
    return amb;
  }
  const ambitoOriginal = () => construir(original, Object.fromEntries(Object.entries(Vd).map(([n, v]) => [n, v.val])), {});

  function evaluar(src, amb) {
    if (typeof src === 'string' && /^[A-Za-z_]\w*$/.test(src) && src in amb) return amb[src];
    return compilar(src, Object.keys(amb))(amb);
  }

  const resuelto = k => !!hecho[k];

  /** Regla de revelado: tras = undefined | true | 'k' | ['k1','k2'] | "expresión → clave(s)". */
  function permitido(tras, extra) {
    if (tras === undefined || tras === null || tras === true) return true;
    if (tras === false) return false;
    if (Array.isArray(tras)) return tras.every(t => permitido(t, extra));
    if (typeof tras === 'string' && claves.has(tras)) return resuelto(tras);
    const r = evaluar(tras, api.ambito(extra));
    if (r === true || r === undefined || r === null || r === '') return true;
    if (r === false) return false;
    return Array.isArray(r) ? r.every(resuelto) : resuelto(r);
  }

  /** Revelado por punto (m): devuelve (x,y,z) => bool. La expresión ve px, py, pz, pr y ps. */
  function permitidoEn(tras, extra) {
    if (tras === undefined || tras === null || typeof tras === 'boolean' || (typeof tras === 'string' && claves.has(tras))) {
      const v = permitido(tras, extra); return () => v;
    }
    if (Array.isArray(tras)) { const fs = tras.map(t => permitidoEn(t, extra)); return (x, y, z) => fs.every(f => f(x, y, z)); }
    const amb = api.ambito(extra);
    const f = compilarPunto(tras, Object.keys(amb))(amb);
    const memo = new Map();
    const ok = r => {
      if (r === true || r === undefined || r === null || r === '') return true;
      if (r === false) return false;
      const k = Array.isArray(r) ? r.join() : r;
      if (!memo.has(k)) memo.set(k, Array.isArray(r) ? r.every(resuelto) : resuelto(r));
      return memo.get(k);
    };
    return (x, y, z) => ok(f(x, y, z));
  }

  const apartado = k => {
    const a = apartados.find(x => x.k === k);
    if (!a) throw new Error('apartado desconocido: ' + k);
    return a;
  };

  function solucion(k) {
    const amb = ambitoOriginal();
    return (apartado(k).pide || []).map(p => ('opciones' in p ? p.correcta : evaluar(p.valor, amb)));
  }

  function comprobar(k, respuestas) {
    const sol = solucion(k);
    const pide = apartado(k).pide || [];
    const items = pide.map((p, i) => {
      if ('opciones' in p) {
        const r = respuestas[i];
        return r === p.correcta || r === p.opciones[p.correcta] || Number(r) === p.correcta;
      }
      const x = leerNumero(respuestas[i]);
      const e = sol[i];
      if (!Number.isFinite(x)) return false;
      if (e === 0) return Math.abs(x) <= (p.tolAbs ?? TOL_ABS);
      return Math.abs(x - e) <= (p.tol ?? TOL) * Math.abs(e);
    });
    const ok = items.length > 0 && items.every(Boolean);
    if (ok && hecho[k] !== 'hecho') { hecho[k] = 'hecho'; guardar(); avisar(); }
    return { ok, items };
  }

  const api = {
    def, params, vars, original, varsDef: Vd, paramsDef: P, apartados,
    ambito: extra => construir(params, vars, extra || {}),
    ambitoOriginal,
    valor: (src, extra) => evaluar(src, api.ambito(extra)),
    ayudas: () => ayudasPara(params),
    resuelto,
    como: k => hecho[k] || null,
    marcar(k, como = 'hecho') {
      apartado(k);
      if (como) hecho[k] = como; else delete hecho[k];
      guardar(); avisar();
    },
    reiniciar() {
      hecho = {}; for (const k of op.resueltos || []) hecho[k] = 'hecho';
      try { almacen && !op.resueltos && almacen.setItem(clave, '{}'); } catch { /* nada */ }
      avisar();
    },
    permitido,
    permitidoEn,
    comprobar,
    solucion,
    set({ vars: v, params: p } = {}) {
      if (v) Object.assign(vars, v);
      if (p) Object.assign(params, p);
      avisar();
    },
    restaurar() { Object.assign(params, original); avisar(); },
    cambiado: () => Object.keys(original).some(n => params[n] !== original[n]),
    on(f) { subs.add(f); return () => subs.delete(f); },
  };
  return api;
}
