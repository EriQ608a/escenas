// paneles.js — la parte 2D de una escena: variables, «¿y si…?», lecturas, casillas por apartado,
// fórmula viva (KaTeX) y gráficas enlazadas. Todo lo que muestra valores pasa por el revelado.
import { formatear, formatearTex } from './expr.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NOMBRES_CAPA = { corte: 'corte', lineas: 'líneas', mapa: 'mapa', flujo: 'flujo', dS: 'dS', particulas: 'cargas' };

/** Lectura por id con su revelado: {ok, v, txt, tex, et}. */
export function lector(estado, def) {
  const lect = Object.fromEntries((def.lecturas || []).map(l => [l.id, l]));
  return id => {
    const l = lect[id];
    if (!l) return { ok: false, v: NaN, txt: '?', tex: '?', et: id };
    const ok = estado.permitido(l.tras);
    const v = ok ? estado.valor(l.v) : NaN;
    return { ok, v, et: l.et, txt: ok ? formatear(v, l.u, l.cifras) : '?', tex: ok ? formatearTex(v, l.u, l.cifras) : '\\,?\\,' };
  };
}

export function montarPaneles(host, estado, def, op = {}) {
  const leer = op.leer || lector(estado, def);
  const conCasillas = op.casillas !== false;
  host.classList.add('escena');
  host.innerHTML = '';

  // cabecera
  const cab = h('div', 'esc-cab');
  cab.append(h('div', 'esc-tit', esc(def.titulo || '')));
  const capasEl = h('div', 'esc-capas');
  const acc = h('div', 'esc-acc');
  const bYsi = h('button', 'esc-bt', '¿y si…?');
  const bPng = h('button', 'esc-bt', 'PNG');
  const bRein = h('button', 'esc-bt', 'reiniciar');
  const aviso = h('span', 'esc-aviso', 'datos cambiados');
  acc.append(aviso, bYsi, bPng); if (conCasillas) acc.append(bRein);
  cab.append(capasEl, acc);

  // ¿y si…?
  const ysi = h('div', 'esc-ysi'); ysi.hidden = true;
  const filasP = [];
  for (const [n, p] of Object.entries(estado.paramsDef)) {
    const fila = h('label', 'esc-par');
    fila.append(h('span', 'esc-n', esc(p.et || n)));
    let inp;
    if (p.min !== undefined && p.max !== undefined) {
      inp = h('input'); inp.type = 'range'; inp.min = p.min; inp.max = p.max; inp.step = p.paso ?? (p.max - p.min) / 200;
    } else { inp = h('input'); inp.type = 'number'; inp.step = 'any'; }
    inp.value = estado.params[n];
    const val = h('span', 'esc-v');
    inp.addEventListener('input', () => estado.set({ params: { [n]: +inp.value } }));
    fila.append(inp, val); ysi.append(fila);
    filasP.push({ n, p, inp, val });
  }
  const pieYsi = h('div', 'esc-ysi-pie');
  const bOrig = h('button', 'esc-bt', 'volver a los originales');
  pieYsi.append(bOrig, h('span', 'esc-nota', 'Las casillas comprueban siempre con los datos del enunciado.'));
  ysi.append(pieYsi);
  bYsi.onclick = () => { ysi.hidden = !ysi.hidden; bYsi.classList.toggle('on', !ysi.hidden); };
  bOrig.onclick = () => { estado.restaurar(); filasP.forEach(f => { f.inp.value = estado.params[f.n]; }); };

  // variables
  const varsEl = h('div', 'esc-vars');
  const filasV = [];
  for (const [n, v] of Object.entries(estado.varsDef)) {
    const fila = h('label', 'esc-var');
    const inp = h('input'); inp.type = 'range'; inp.min = v.min; inp.max = v.max; inp.step = v.paso ?? (v.max - v.min) / 400; inp.value = v.val;
    const val = h('span', 'esc-v');
    fila.append(h('span', 'esc-n', esc(n)), inp, val);
    if (v.et) fila.append(h('span', 'esc-nota', esc(v.et)));
    inp.addEventListener('input', () => estado.set({ vars: { [n]: +inp.value } }));
    varsEl.append(fila); filasV.push({ n, v, inp, val });
  }

  // lecturas
  const lectEl = h('div', 'esc-lect');
  const tarjetas = (def.lecturas || []).filter(l => !l.oculta).map(l => {
    const c = h('div', 'esc-card', `<div class="k">${esc(l.et)}</div><div class="v"></div>`);
    lectEl.append(c); return { l, c, v: c.querySelector('.v') };
  });

  // cuerpo: 3D + lateral (fórmula, gráficas)
  const cuerpo = h('div', 'esc-cuerpo');
  const host3d = h('div', 'esc-3d');
  const lado = h('div', 'esc-lado');
  const formula = h('div', 'esc-formula');
  const graficasEl = h('div', 'esc-graficas');
  lado.append(formula, graficasEl);
  cuerpo.append(host3d, lado);

  // apartados
  const apsEl = h('div', 'esc-aps');
  let activo = (estado.apartados.find(a => !estado.resuelto(a.k)) || estado.apartados[0] || {}).k;
  let vista = null, dibujo = null;
  const fichas = estado.apartados.map(ap => {
    const f = h('div', 'esc-ap'); f.dataset.k = ap.k;
    const cabA = h('button', 'esc-ap-cab', `<span class="k">${esc(ap.k)}</span><span class="t">${esc(ap.titulo || '')}</span><span class="est"></span>`);
    const pide = h('div', 'esc-pide');
    const entradas = (ap.pide || []).map(p => {
      const fila = h('div', 'esc-q');
      fila.append(h('div', 'esc-qt', esc(p.q || '')));
      if ('opciones' in p) {
        const ops = h('div', 'esc-ops'); let elegido = null;
        p.opciones.forEach((t, i) => {
          const b = h('button', 'esc-op', esc(t));
          b.onclick = () => { elegido = i; ops.querySelectorAll('.esc-op').forEach((x, j) => x.classList.toggle('on', j === i)); };
          ops.append(b);
        });
        fila.append(ops);
        return { p, fila, leer: () => elegido };
      }
      const inp = h('input', 'esc-in'); inp.inputMode = 'decimal'; inp.autocomplete = 'off'; inp.placeholder = p.u ? 'en ' + p.u : 'número';
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') bComp.click(); });
      fila.append(inp);
      return { p, fila, leer: () => inp.value };
    });
    entradas.forEach(e => pide.append(e.fila));
    const pie = h('div', 'esc-ap-pie');
    const bComp = h('button', 'esc-bt fuerte', 'comprobar');
    const bSol = h('button', 'esc-bt', 'ver solución');
    const msg = h('span', 'esc-msg');
    pie.append(bComp, bSol, msg);
    const solEl = h('div', 'esc-sol');
    f.append(cabA, pide, solEl); if (conCasillas) f.append(pie); else pide.hidden = true;
    cabA.onclick = () => activar(ap.k);
    bComp.onclick = () => {
      const r = estado.comprobar(ap.k, entradas.map(e => e.leer()));
      entradas.forEach((e, i) => e.fila.classList.toggle('mal', !r.items[i]));
      msg.textContent = r.ok ? 'cuadra' : 'no cuadra';
      msg.className = 'esc-msg ' + (r.ok ? 'ok' : 'mal');
      if (r.ok) activar(ap.k);
    };
    bSol.onclick = () => {
      if (bSol.dataset.seguro) { estado.marcar(ap.k, 'visto'); activar(ap.k); delete bSol.dataset.seguro; return; }
      bSol.dataset.seguro = '1'; bSol.textContent = '¿seguro? enseña el resultado';
      setTimeout(() => { delete bSol.dataset.seguro; bSol.textContent = 'ver solución'; }, 3500);
    };
    apsEl.append(f);
    return { ap, f, cabA, pide, solEl, entradas, msg };
  });

  bRein.onclick = () => {
    if (!bRein.dataset.seguro) { bRein.dataset.seguro = '1'; bRein.textContent = '¿borrar progreso?'; setTimeout(() => { delete bRein.dataset.seguro; bRein.textContent = 'reiniciar'; }, 3500); return; }
    delete bRein.dataset.seguro; bRein.textContent = 'reiniciar';
    estado.reiniciar(); fichas.forEach(x => { x.msg.textContent = ''; x.entradas.forEach(e => e.fila.classList.remove('mal')); });
  };

  host.append(cab, ysi, varsEl, lectEl, cuerpo, apsEl);

  function activar(k) {
    activo = k;
    const ap = estado.apartados.find(a => a.k === k);
    if (ap && vista && ap.vista) vista.ir(ap.vista);
    if (ap && ap.vars) estado.set({ vars: ap.vars });
    if (ap && dibujo && ap.capas) for (const [c, v] of Object.entries(ap.capas)) if (c in dibujo.capas) dibujo.capas[c] = v;
    actualizar();
  }

  // ---------- fórmula viva ----------
  function rellenar(tex, ap) {
    return tex.replace(/\{\{([^}]+)\}\}/g, (_, x) => {
      const [nom, u] = x.split(':');
      if ((def.lecturas || []).some(l => l.id === nom.trim())) return leer(nom.trim()).tex;
      if (!estado.resuelto(ap.k)) return '\\,?\\,';
      try { return formatearTex(estado.valor(nom.trim()), (u || '').trim()); } catch { return '?'; }
    });
  }
  function pintarFormula() {
    const ap = estado.apartados.find(a => a.k === activo);
    formula.innerHTML = '';
    if (!ap) return;
    formula.append(h('div', 'esc-fk', `(${esc(ap.k)}) ${esc(ap.titulo || '')}`));
    const tex = [];
    if (ap.planteo) tex.push(['planteo', ap.planteo]);
    if (ap.formula) tex.push(estado.resuelto(ap.k) ? ['resultado', rellenar(ap.formula, ap)] : ['pendiente', '\\text{?}']);
    for (const [cls, t] of tex) {
      const d = h('div', 'esc-tex ' + cls);
      if (window.katex) { try { window.katex.render(rellenar(t, ap), d, { displayMode: true, throwOnError: false, strict: false }); } catch { d.textContent = t; } }
      else d.textContent = t;
      formula.append(d);
    }
    if (!tex.length) formula.append(h('div', 'esc-nota', 'Sin fórmula para este apartado.'));
  }

  // ---------- gráficas enlazadas ----------
  const graficas = (def.graficas || []).map(g => {
    const caja = h('div', 'esc-graf'), cv = h('canvas');
    caja.append(cv); graficasEl.append(caja);
    return { g, cv, caja, cache: null };
  });
  const estilo = () => getComputedStyle(host);
  const tok = n => estilo().getPropertyValue(n).trim();
  const num = (src, extra) => (typeof src === 'number' ? src : estado.valor(src, extra));
  function pasoBonito(d) {
    const e = 10 ** Math.floor(Math.log10(d)), f = d / e;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * e;
  }
  function prefijo(m) {
    if (!m) return [1, ''];
    const e = Math.floor(Math.log10(m) / 3) * 3;
    const P = { '-12': 'p', '-9': 'n', '-6': 'µ', '-3': 'm', 0: '', 3: 'k', 6: 'M', 9: 'G' };
    return P[e] !== undefined ? [10 ** e, P[e]] : [1, ''];
  }
  function muestrear(G) {
    const { g } = G;
    const clave = JSON.stringify([estado.params, estado.apartados.map(a => estado.como(a.k))]);
    if (G.cache && G.cache.clave === clave) return G.cache;
    const vd = estado.varsDef[g.x] || { min: 0, max: 1 };
    const x0 = g.de !== undefined ? num(g.de) : vd.min, x1 = g.a !== undefined ? num(g.a) : vd.max;
    const tramos = (g.tramos || [{ de: x0, a: x1 }]).map(t => {
      const a = Math.max(x0, num(t.de)), b = Math.min(x1, num(t.a));
      const ok = estado.permitido(t.tras);
      const pts = [];
      if (ok) for (let i = 0; i <= 140; i++) {
        const x = a + (b - a) * (0.0005 + 0.999 * i / 140);
        pts.push([x, estado.valor(g.y, { [g.x]: x })]);
      }
      return { a, b, ok, pts, tras: t.tras };
    });
    let ymin = 0, ymax = 0;
    tramos.forEach(t => t.pts.forEach(([, y]) => { if (Number.isFinite(y)) { ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); } }));
    const pad = (ymax - ymin) * 0.08 || 1;
    G.cache = { clave, x0, x1, tramos, ymin: ymin - (ymin < 0 ? pad : 0), ymax: ymax + pad, alguno: tramos.some(t => t.ok) };
    return G.cache;
  }
  function pintarGrafica(G) {
    const { g, cv } = G;
    const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const m = muestrear(G);
    const L = 46, R = 10, T = 22, B = 22;
    const X = x => L + (x - m.x0) / (m.x1 - m.x0) * (W - L - R);
    const Y = y => T + (m.ymax - y) / (m.ymax - m.ymin) * (H - T - B);
    const tinta = tok('--esc-tinta'), tenue = tok('--esc-tenue'), linea = tok('--esc-linea'), acento = tok('--esc-acento');
    const mono = tok('--esc-mono') || 'monospace', serif = tok('--esc-serif') || 'serif';
    const [f, pre] = prefijo(Math.max(Math.abs(m.ymin), Math.abs(m.ymax)));
    c.font = `11px ${mono}`; c.fillStyle = tenue;
    c.fillText(`${g.et || g.y}${g.u ? ` (${m.alguno ? pre : ''}${g.u})` : ''}`, 4, 12);
    c.strokeStyle = linea; c.lineWidth = 1;
    c.beginPath(); c.moveTo(L, Y(0)); c.lineTo(W - R, Y(0)); c.moveTo(L, T); c.lineTo(L, H - B); c.stroke();
    // marcas verticales (fronteras del enunciado)
    c.setLineDash([3, 4]); c.strokeStyle = tenue;
    for (const mk of g.marcas || []) {
      const x = num(mk); if (x < m.x0 || x > m.x1) continue;
      c.beginPath(); c.moveTo(X(x), T); c.lineTo(X(x), H - B); c.stroke();
      c.fillText(typeof mk === 'string' ? mk : '', X(x) + 3, T + 9);
    }
    c.setLineDash([]);
    // ticks
    c.fillStyle = tenue;
    const paso = pasoBonito((m.x1 - m.x0) / 4);
    for (let x = Math.ceil(m.x0 / paso) * paso; x <= m.x1 + 1e-12; x += paso) c.fillText(formatear(+x.toPrecision(6), '', 2), X(x) - 8, H - 6);
    if (m.alguno) for (const y of [m.ymin, 0, m.ymax]) {
      if (y === 0 && (m.ymin === 0 || m.ymax === 0)) continue;
      c.fillText(formatear(y / f, '', 3), 2, Y(y) + 4);
    }
    // tramos
    for (const t of m.tramos) {
      if (!t.ok) {
        c.fillStyle = tenue; c.font = `20px ${serif}`;
        c.fillText('?', X((t.a + t.b) / 2) - 4, (T + H - B) / 2 + 6);
        c.font = `11px ${mono}`;
        continue;
      }
      c.strokeStyle = tinta; c.lineWidth = 1.6; c.beginPath();
      t.pts.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y))));
      c.stroke();
    }
    // puntos pedidos (solo si su apartado está resuelto)
    for (const [ip, p] of (g.puntos || []).entries()) {
      if (!estado.permitido(p.tras)) continue;
      const x = num(p.x), y = estado.valor(g.y, { [g.x]: x });
      c.fillStyle = tinta; c.beginPath(); c.arc(X(x), Y(y), 3, 0, 7); c.fill();
      c.fillText(formatear(y, g.u, 3), X(x) + 6, Y(y) + (ip % 2 ? 14 : -6));
    }
    // variable actual en todas las gráficas
    const xv = estado.vars[g.x];
    if (xv !== undefined) {
      c.strokeStyle = acento; c.lineWidth = 1;
      c.beginPath(); c.moveTo(X(xv), T); c.lineTo(X(xv), H - B); c.stroke();
      const tr = m.tramos.find(t => xv >= t.a && xv <= t.b);
      const tramoOk = tr && tr.ok && estado.permitido(tr.tras);
      if (tramoOk) {
        const y = estado.valor(g.y, { [g.x]: xv });
        c.fillStyle = acento; c.beginPath(); c.arc(X(xv), Y(y), 4, 0, 7); c.fill();
      }
    }
  }
  const ro = new ResizeObserver(() => graficas.forEach(pintarGrafica));
  graficas.forEach(G => ro.observe(G.cv));

  // ---------- refresco ----------
  function actualizar() {
    aviso.style.display = estado.cambiado() ? '' : 'none';
    filasP.forEach(({ n, p, val }) => { val.textContent = formatear(estado.params[n], p.unidad); });
    filasV.forEach(({ n, v, val, inp }) => { val.textContent = formatear(estado.vars[n], v.unidad); if (+inp.value !== estado.vars[n]) inp.value = estado.vars[n]; });
    tarjetas.forEach(({ l, c, v }) => { const r = leer(l.id); c.classList.toggle('pend', !r.ok); v.textContent = r.txt; });
    for (const x of fichas) {
      const como = estado.como(x.ap.k);
      x.f.classList.toggle('hecho', !!como);
      x.f.classList.toggle('activo', x.ap.k === activo);
      x.cabA.querySelector('.est').textContent = como === 'hecho' ? '✓ resuelto' : como === 'visto' ? 'solución vista' : 'pendiente';
      x.pide.style.display = como || !conCasillas ? 'none' : '';
      if (como) {
        const sol = estado.solucion(x.ap.k);
        x.solEl.innerHTML = (x.ap.pide || []).map((p, i) => `<div><span class="esc-qt">${esc(p.q || '')}</span> <b>${'opciones' in p ? esc(p.opciones[sol[i]]) : esc(formatear(sol[i], p.u, 4))}</b></div>`).join('');
      } else x.solEl.innerHTML = '';
    }
    if (dibujo) {
      capasEl.querySelectorAll('.esc-chip').forEach(b => b.classList.toggle('on', !!dibujo.capas[b.dataset.c]));
      dibujo.actualizar();
    }
    vista?.pedirRender();
    pintarFormula();
    graficas.forEach(pintarGrafica);
  }

  function conectar(v, d) {
    vista = v; dibujo = d;
    for (const k of Object.keys(d.capas)) {
      if (!def.dibujar || !(k in def.dibujar)) continue;
      const b = h('button', 'esc-chip', NOMBRES_CAPA[k] || k); b.dataset.c = k;
      b.onclick = () => d.capa(k, !d.capas[k]) || actualizar();
      capasEl.append(b);
    }
    bPng.onclick = async () => {
      const blob = await v.exportar(); if (!blob) return;
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (def.id || 'escena') + '.png';
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    const ap = estado.apartados.find(a => a.k === activo);
    if (ap?.vista) v.ir(ap.vista, 0);
    actualizar();
  }

  return { host3d, actualizar, conectar, activar, destruir: () => ro.disconnect() };
}
