// em.js — paquete de electromagnetismo: piezas que saben su campo y superposición.
// Unidades SI. Cada pieza: { tipo, ...campos (número o expresión de los params) }.
// Las piezas sin campo (gaussianas, caminos) se ignoran aquí; las dibuja dibujo-em.js.
import { compilar } from './expr.js';

const resta = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norma = v => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);

/** Fuentes: cada una devuelve { E(p)->[x,y,z], V(p), B(p), qenc(R) (esfera centrada en el origen) }. */
const FUENTES = {
  puntual({ q, pos = [0, 0, 0] }, K) {
    return {
      q,
      E(p) { const d = resta(p, pos), r = norma(d); if (r < 1e-12) return [0, 0, 0]; const f = K.k * q / r ** 3; return [f * d[0], f * d[1], f * d[2]]; },
      V(p) { const r = norma(resta(p, pos)); return r < 1e-12 ? Infinity : K.k * q / r; },
      qenc: R => (norma(pos) < R ? q : 0),
    };
  },
  esfera({ R, rho, centro = [0, 0, 0] }, K) {
    const Q = rho * 4 / 3 * Math.PI * R ** 3;
    return {
      q: Q, R,
      E(p) {
        const d = resta(p, centro), r = norma(d);
        if (r < 1e-15) return [0, 0, 0];
        const Er = r < R ? rho * r / (3 * K.eps0) : K.k * Q / (r * r);
        return [Er * d[0] / r, Er * d[1] / r, Er * d[2] / r];
      },
      V(p) { const r = norma(resta(p, centro)); return r < R ? K.k * Q / (2 * R) * (3 - r * r / (R * R)) : K.k * Q / r; },
      qenc: Rg => rho * 4 / 3 * Math.PI * Math.min(Rg, R) ** 3,
    };
  },
  corteza({ R, sigma, centro = [0, 0, 0] }, K) {
    const Q = sigma * 4 * Math.PI * R * R;
    return {
      q: Q, R,
      E(p) {
        const d = resta(p, centro), r = norma(d);
        if (r < R) return [0, 0, 0];
        const f = K.k * Q / (r * r * r);
        return [f * d[0], f * d[1], f * d[2]];
      },
      V(p) { const r = norma(resta(p, centro)); return r < R ? K.k * Q / R : K.k * Q / r; },
      qenc: Rg => (Rg > R ? Q : 0),
    };
  },
  // hilo infinito paralelo a z que pasa por (x, y) = pos; V con referencia en s = ref
  hilo({ lambda, pos = [0, 0], ref = 1 }, K) {
    return {
      q: lambda,
      E(p) { const dx = p[0] - pos[0], dy = p[1] - pos[1], s2 = dx * dx + dy * dy; if (s2 < 1e-24) return [0, 0, 0]; const f = lambda / (2 * Math.PI * K.eps0 * s2); return [f * dx, f * dy, 0]; },
      V(p) { const s = Math.hypot(p[0] - pos[0], p[1] - pos[1]); return -lambda / (2 * Math.PI * K.eps0) * Math.log(s / ref); },
      qenc: () => 0,
    };
  },
  // plano infinito z = z0; V = 0 en el plano
  plano({ sigma, z0 = 0 }, K) {
    const E0 = sigma / (2 * K.eps0);
    return {
      q: sigma,
      E(p) { const dz = p[2] - z0; return [0, 0, dz === 0 ? 0 : Math.sign(dz) * E0]; },
      V(p) { return -E0 * Math.abs(p[2] - z0); },
      qenc: () => 0,
    };
  },
};

export const TIPOS_FUENTE = Object.keys(FUENTES);

const NO_NUM = new Set(['tipo', 'id', 'tras', 'ver', 'et']);

/** Evalúa los campos de una pieza (números o expresiones) contra el ámbito. */
export function resolverPieza(pz, amb) {
  const nombres = Object.keys(amb);
  const val = v => (typeof v === 'string' ? compilar(v, nombres)(amb) : Array.isArray(v) ? v.map(val) : v);
  const out = {};
  for (const [k, v] of Object.entries(pz)) out[k] = NO_NUM.has(k) ? v : val(v);
  return out;
}

/** Superposición de las fuentes de `piezas` con los datos de `amb` (constantes + params). */
export function crearCampo(piezas, amb) {
  const K = { k: amb.k ?? 8.9875517923e9, eps0: amb.eps0 ?? 8.8541878128e-12, mu0: amb.mu0 ?? 1.25663706212e-6 };
  const fuentes = piezas.filter(p => FUENTES[p.tipo]).map(p => {
    const r = resolverPieza(p, amb);
    return { def: p, val: r, ...FUENTES[p.tipo](r, K) };
  });
  const suma = (f, p) => {
    let x = 0, y = 0, z = 0;
    for (const s of fuentes) { if (!s[f]) continue; const v = s[f](p); x += v[0]; y += v[1]; z += v[2]; }
    return [x, y, z];
  };
  const E = p => suma('E', p);
  return {
    fuentes,
    E,
    B: p => suma('B', p),
    V: p => fuentes.reduce((acc, s) => acc + (s.V ? s.V(p) : 0), 0),
    /** Componente radial de E en (r, 0, 0). */
    Er: r => E([r, 0, 0])[0],
    /** Carga encerrada por una esfera de radio R centrada en el origen. */
    qenc: R => fuentes.reduce((acc, s) => acc + s.qenc(R), 0),
  };
}

/** Línea de campo por RK4 sobre la dirección unitaria de `campo`, desde `semilla`. */
export function trazarLinea(campo, semilla, { paso = 0.01, max = 400, limite = 1, sentido = 1, parar } = {}) {
  const dir = p => { const v = campo(p), n = norma(v); return n < 1e-30 ? null : [sentido * v[0] / n, sentido * v[1] / n, sentido * v[2] / n]; };
  const pts = [semilla.slice()];
  let p = semilla.slice();
  for (let i = 0; i < max; i++) {
    const k1 = dir(p); if (!k1) break;
    const k2 = dir([p[0] + paso / 2 * k1[0], p[1] + paso / 2 * k1[1], p[2] + paso / 2 * k1[2]]); if (!k2) break;
    const k3 = dir([p[0] + paso / 2 * k2[0], p[1] + paso / 2 * k2[1], p[2] + paso / 2 * k2[2]]); if (!k3) break;
    const k4 = dir([p[0] + paso * k3[0], p[1] + paso * k3[1], p[2] + paso * k3[2]]); if (!k4) break;
    const q = [0, 1, 2].map(j => p[j] + paso / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    const rq = norma(q);
    if (rq > limite) { const t = (limite - norma(p)) / (rq - norma(p)); pts.push(p.map((v, j) => v + t * (q[j] - v))); break; }
    if (parar && parar(q, p)) { pts.push(q); break; }
    // retroceso: el campo se invierte (p. ej. al llegar a una carga de signo opuesto)
    if (pts.length > 2 && (k1[0] * k4[0] + k1[1] * k4[1] + k1[2] * k4[2]) < -0.5) break;
    pts.push(q); p = q;
  }
  return pts;
}
