// expr.js — expresiones de las escenas (texto → función) y formato de números.
// El contenido de las escenas es propio (lo escribe Claude), por eso se usa `Function`.

const cache = new Map();

/** Compila `src` (texto o número) a una función del ámbito: f({a:1, r:2}) → valor. */
export function compilar(src, nombres) {
  if (typeof src === 'number' || typeof src === 'boolean') return () => src;
  const clave = nombres.join(',') + '|' + src;
  let f = cache.get(clave);
  if (!f) {
    try { f = new Function(...nombres, `"use strict";return (${src});`); }
    catch (e) { throw new Error(`expresión inválida «${src}»: ${e.message}`); }
    cache.set(clave, f);
  }
  return amb => f(...nombres.map(n => amb[n]));
}

/** Igual que compilar, pero devuelve una función de punto: g(amb)(x,y,z) con px,py,pz,pr,ps. */
export function compilarPunto(src, nombres) {
  if (typeof src !== 'string') return () => () => src;
  const f = new Function(...nombres, 'px', 'py', 'pz', 'pr', 'ps', `"use strict";return (${src});`);
  return amb => {
    const base = nombres.map(n => amb[n]);
    return (x, y, z) => f(...base, x, y, z, Math.sqrt(x * x + y * y + z * z), Math.sqrt(x * x + y * y));
  };
}

/** Lee lo que Eric escribe en una casilla: «11 310,5», «−7,3e4», «2,5·10^-8». NaN si no es número. */
export function leerNumero(txt) {
  if (typeof txt === 'number') return txt;
  let s = String(txt ?? '').trim().replace(/[\s  ]/g, '').replace(/[−–]/g, '-');
  if (!s) return NaN;
  s = s.replace(/[x×·*]10\^?\(?(-?\d+)\)?/i, 'e$1');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? Number(s) : NaN;
}

const PREFIJOS = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
const CON_PREFIJO = new Set(['C', 'A', 'T', 'F', 'H', 'Wb', 'J', 'W']);
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

function miles(entera) {
  return entera.length > 4 ? entera.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : entera;
}

function cifrasSig(ax, cifras) {
  const dec = Math.max(0, cifras - 1 - Math.floor(Math.log10(ax)));
  let [e, d] = ax.toFixed(dec).split('.');
  return miles(e) + (d ? ',' + d : '');
}

/** Formato español con `cifras` significativas: «25,13 nC», «11 310 N/C», «−1,694·10⁵ N/C». */
export function formatear(x, unidad = '', cifras = 4) {
  if (x === null || x === undefined || Number.isNaN(x)) return '?';
  if (!Number.isFinite(x)) return '∞';
  const signo = x < 0 ? '−' : '';
  const ax = Math.abs(x);
  const u = unidad ? ' ' + unidad : '';
  if (ax === 0) return '0' + u;
  if (CON_PREFIJO.has(unidad.split('/')[0])) {
    const [f, p] = PREFIJOS.find(([f]) => ax >= f * 0.99995) || PREFIJOS[PREFIJOS.length - 1];
    return signo + cifrasSig(ax / f, cifras) + ' ' + p + unidad;
  }
  if (ax >= 1e6 || ax < 1e-3) {
    const ex = Math.floor(Math.log10(ax));
    const m = cifrasSig(ax / 10 ** ex, cifras);
    return signo + m + '·10' + String(ex).split('').map(c => SUP[c]).join('') + u;
  }
  if (ax >= 10 ** cifras) return signo + miles(Math.round(ax).toString()) + u;
  return signo + cifrasSig(ax, cifras) + u;
}

/** Igual que formatear pero en LaTeX (para la fórmula viva). */
export function formatearTex(x, unidad = '', cifras = 4) {
  const t = formatear(x, unidad, cifras);
  if (t === '?') return '\\,?\\,';
  const [num, ...resto] = t.split(' ');
  // separar número (con espacios de miles) de la unidad
  const m = t.match(/^(−?[\d ,]+(?:·10[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)?)(?: (.*))?$/);
  const n = (m ? m[1] : num).replace('−', '-').replace(',', '{,}').replace(/ /g, '\\,')
    .replace(/·10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/, (_, e) => '\\cdot10^{' + [...e].map(c => Object.keys(SUP).find(k => SUP[k] === c)).join('') + '}');
  const un = m ? m[2] : resto.join(' ');
  return n + (un ? '\\ \\text{' + un + '}' : '');
}
