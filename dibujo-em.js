// dibujo-em.js — dibujantes de electromagnetismo sobre una vista three.js.
// Piezas (esfera, corteza, gaussiana-esfera), líneas de campo, flujo sobre la gaussiana,
// corte con mapa de color + equipotenciales, elemento dS arrastrable y partículas de carga.
// Toda dirección o valor pasa por la regla de revelado del estado (`tras`).
import { trazarLinea } from './em.js';
import { formatear } from './expr.js';

const fib = n => Array.from({ length: n }, (_, i) => {
  const y = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - y * y), t = i * Math.PI * (3 - Math.sqrt(5));
  return [Math.cos(t) * r, y, Math.sin(t) * r];
});
function azar(semilla) { let s = semilla >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/**
 * vista: crearVista(). estado: crearEstado() con ayudas de em.js. def: la escena.
 * op.leer(id) -> {ok, v, txt}: lectura con su revelado (de index.js).
 */
export function dibujarEM(vista, estado, def, op = {}) {
  const { THREE, scene } = vista;
  const S = def.escala ?? 10;
  const dib = def.dibujar || {};
  const raiz = new THREE.Group(); scene.add(raiz);
  const capas = Object.fromEntries(['corte', 'lineas', 'mapa', 'flujo', 'dS', 'particulas']
    .map(k => [k, k === 'corte' ? !!dib.corte : !!dib[k] && dib[k].inicial !== false]));

  // corte: quita el cuarto frontal (x > 0 y z > 0)
  const planos = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)];
  const recortables = [];
  const recortar = m => { m.clipIntersection = true; recortables.push(m); return m; };

  const geoEsfera = new THREE.SphereGeometry(1, 64, 40);
  const geoAlambre = new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 20, 10));
  const mat = (Tipo, tok, o) => vista.tintar(new Tipo({ transparent: true, side: THREE.DoubleSide, ...o }), tok);

  // ---------- piezas ----------
  const objs = [];
  const amb = () => estado.ambito();
  const evalPieza = (pz, k) => (typeof pz[k] === 'string' ? estado.valor(pz[k]) : pz[k]);

  let iEtq = 0;
  for (const pz of def.piezas || []) {
    const o = { pz, grupo: new THREE.Group() };
    if (pz.tipo !== 'gaussiana-esfera') o.ang = (135 - 32 * iEtq++) * Math.PI / 180;
    raiz.add(o.grupo);
    if (pz.tipo === 'esfera') {
      o.malla = new THREE.Mesh(geoEsfera, recortar(mat(THREE.MeshLambertMaterial, '--esc-tinta', { opacity: 0.42, depthWrite: false })));
      o.grupo.add(o.malla);
    } else if (pz.tipo === 'corteza') {
      o.malla = new THREE.Mesh(geoEsfera, recortar(mat(THREE.MeshLambertMaterial, '--esc-neg', { opacity: 0.16, depthWrite: false })));
      o.alambre = new THREE.LineSegments(geoAlambre, recortar(mat(THREE.LineBasicMaterial, '--esc-neg', { opacity: 0.28 })));
      o.grupo.add(o.malla, o.alambre);
    } else if (pz.tipo === 'gaussiana-esfera') {
      o.gauss = true;
      o.malla = new THREE.Mesh(geoEsfera, recortar(mat(THREE.MeshBasicMaterial, '--esc-acento', { opacity: 0.07, depthWrite: false })));
      o.alambre = new THREE.LineSegments(geoAlambre, recortar(mat(THREE.LineBasicMaterial, '--esc-acento', { opacity: 0.2 })));
      o.grupo.add(o.malla, o.alambre);
      // radio r en la cara del corte y punto P (lo único visible antes de saber qué superficie usar)
      o.radio = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]),
        vista.tintar(new THREE.LineDashedMaterial({ dashSize: 0.08, gapSize: 0.06 }), '--esc-acento'));
      o.radio.computeLineDistances();
      o.punto = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), vista.tintar(new THREE.MeshBasicMaterial(), '--esc-acento'));
      raiz.add(o.radio, o.punto);
    }
    if (pz.et) { o.lbl = vista.etiqueta(pz.et, o.gauss ? 'acc' : ''); raiz.add(o.lbl); }
    objs.push(o);
  }
  const gauss = objs.find(o => o.gauss);

  // ---------- partículas de carga (datos del enunciado: siempre visibles) ----------
  const geoP = new THREE.SphereGeometry(0.028, 8, 6);
  const particulas = new THREE.Group(); raiz.add(particulas);
  function hacerParticulas() {
    particulas.clear();
    const mas = [], menos = [];
    let semilla = 7;
    for (const o of objs) {
      const { pz } = o, rnd = azar(semilla++);
      if (pz.tipo === 'esfera') {
        const R = evalPieza(pz, 'R') * S, q = evalPieza(pz, 'rho');
        for (let i = 0; i < 90; i++) {
          let x, y, z; do { x = 2 * rnd() - 1; y = 2 * rnd() - 1; z = 2 * rnd() - 1; } while (x * x + y * y + z * z > 1);
          (q >= 0 ? mas : menos).push([x * R, y * R, z * R]);
        }
      } else if (pz.tipo === 'corteza') {
        const R = evalPieza(pz, 'R') * S, q = evalPieza(pz, 'sigma');
        for (const d of fib(220)) (q >= 0 ? mas : menos).push(d.map(c => c * R));
      }
    }
    for (const [lista, tok] of [[mas, '--esc-tinta'], [menos, '--esc-neg']]) {
      if (!lista.length) continue;
      const im = new THREE.InstancedMesh(geoP, recortar(vista.tintar(new THREE.MeshBasicMaterial(), tok)), lista.length);
      const m4 = new THREE.Matrix4();
      lista.forEach((p, i) => im.setMatrixAt(i, m4.makeTranslation(...p)));
      particulas.add(im);
    }
  }

  // ---------- líneas de campo ----------
  const limite = dib.lineas?.limite ?? (def.vars && Object.values(def.vars)[0]?.max) ?? 0.4;
  let trazos = [];
  function trazarTodas() {
    const campo = estado.ayudas().campo;
    if (!campo) return;
    const fuentes = campo.fuentes.filter(f => ['esfera', 'corteza', 'puntual'].includes(f.def.tipo) && Math.abs(f.q) > 0);
    if (!fuentes.length) { trazos = []; return; }
    const qref = Math.min(...fuentes.map(f => Math.abs(f.q)));
    const n0 = dib.lineas?.n ?? 10, tope = dib.lineas?.max ?? 72;
    trazos = [];
    for (const f of fuentes) {
      const n = Math.max(6, Math.min(tope, Math.round(n0 * Math.abs(f.q) / qref)));
      const sentido = f.q > 0 ? 1 : -1;
      const centro = f.val.centro || f.val.pos || [0, 0, 0];
      const r0 = f.def.tipo === 'esfera' ? f.val.R * 0.03 : f.def.tipo === 'corteza' ? f.val.R * 1.004 : 0.004;
      const giro = f.def.tipo === 'corteza' ? 0.5 : 0;   // que no coincidan con las de la esfera
      for (const d0 of fib(n)) {
        const d = [d0[0] * Math.cos(giro) - d0[2] * Math.sin(giro), d0[1], d0[0] * Math.sin(giro) + d0[2] * Math.cos(giro)];
        const semilla = d.map((c, j) => centro[j] + c * r0);
        trazos.push(trazarLinea(campo.E, semilla, { paso: limite / 160, max: 600, limite, sentido }));
      }
    }
  }
  const lineas = new THREE.LineSegments(new THREE.BufferGeometry(), vista.tintar(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 }), '--esc-tinta'));
  const conos = new THREE.InstancedMesh(new THREE.ConeGeometry(0.045, 0.14, 10), vista.tintar(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7 }), '--esc-tinta'), 2000);
  raiz.add(lineas, conos);
  function pintarLineas() {
    const ok = estado.permitidoEn(dib.lineas?.tras);
    const pos = [], q = new THREE.Quaternion(), arriba = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4(), v = new THREE.Vector3();
    let nc = 0;
    const cada = limite / 3.2;
    for (const L of trazos) {
      let acum = cada * 0.55;
      for (let i = 1; i < L.length; i++) {
        const a = L[i - 1], b = L[i];
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, mz = (a[2] + b[2]) / 2;
        if (!ok(mx, my, mz)) { acum = cada * 0.55; continue; }
        pos.push(a[0] * S, a[1] * S, a[2] * S, b[0] * S, b[1] * S, b[2] * S);
        const dl = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        acum += dl;
        if (acum >= cada && nc < conos.count && dl > 0) {
          acum = 0;
          // el cono apunta en el sentido de E (la línea puede ir trazada al revés)
          const E = estado.ayudas().campo.E([mx, my, mz]);
          v.set(E[0], E[1], E[2]).normalize();
          q.setFromUnitVectors(arriba, v);
          m4.compose(new THREE.Vector3(mx * S, my * S, mz * S), q, new THREE.Vector3(1, 1, 1));
          conos.setMatrixAt(nc++, m4);
        }
      }
    }
    lineas.geometry.dispose();
    lineas.geometry = new THREE.BufferGeometry();
    lineas.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    conos.count = nc; conos.instanceMatrix.needsUpdate = true;
  }

  // ---------- flujo sobre la gaussiana ----------
  const dirs = fib(dib.flujo?.n ?? 60);
  const flechas = dirs.map(() => {
    const a = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1);
    vista.tintar(a.line.material, '--esc-suave'); vista.tintar(a.cone.material, '--esc-suave');
    raiz.add(a); return a;
  });
  let Emax = 1;
  function calcularEmax() {
    const campo = estado.ayudas().campo; if (!campo) return;
    const vd = def.vars ? Object.values(def.vars)[0] : { min: 0.01, max: limite };
    Emax = 0;
    for (let i = 0; i <= 200; i++) { const r = vd.min + (vd.max - vd.min) * i / 200; Emax = Math.max(Emax, Math.hypot(...campo.E([r, 0, 0])), Math.hypot(...campo.E([0, r, 0]))); }
    Emax ||= 1;
  }
  const largo = E => 0.12 + 1.3 * Math.sqrt(Math.min(1, E / Emax));

  // ---------- corte con mapa de color + equipotenciales ----------
  const mapaDef = dib.mapa || {};
  const Lm = mapaDef.extension ?? limite;
  const caras = [];
  const leyenda = document.createElement('div');
  leyenda.className = 'esc-leyenda';
  vista.host.appendChild(leyenda);
  if (dib.mapa) {
    for (const cara of ['z', 'x']) {
      const cv = document.createElement('canvas'); cv.width = 140; cv.height = 280;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(Lm * S, 2 * Lm * S), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }));
      if (cara === 'z') m.position.set(Lm * S / 2, 0, 0.001);
      else { m.rotation.y = -Math.PI / 2; m.position.set(0.001, 0, Lm * S / 2); }
      m.renderOrder = -1;
      raiz.add(m); caras.push({ cara, cv, tex, m });
    }
  }
  const hex = tok => { const c = vista.color(tok); return [c.r * 255, c.g * 255, c.b * 255].map(x => Math.round(x)); };
  let claveMapa = '';
  function pintarMapa() {
    if (!dib.mapa) return;
    const clave = JSON.stringify([estado.params, estado.apartados.map(a => estado.como(a.k)), document.documentElement.dataset.theme]);
    if (clave === claveMapa) return; claveMapa = clave;
    const campo = estado.ayudas().campo;
    const ok = estado.permitidoEn(mapaDef.tras);
    const papel = hex('--esc-papel'), suave = hex('--esc-tinta'), linea = hex('--esc-linea');
    const magn = mapaDef.magnitud === 'V' ? p => campo.V(p) : p => Math.hypot(...campo.E(p));
    // escala única para las dos caras
    const W = 140, H = 280;
    const muestras = caras.map(({ cara }) => {
      const val = new Float32Array(W * H), V = new Float32Array(W * H), vis = new Uint8Array(W * H);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const u = (i + 0.5) / W * Lm, y = Lm - (j + 0.5) / H * 2 * Lm;
        const p = cara === 'z' ? [u, y, 0] : [0, y, u];
        const k = j * W + i;
        val[k] = magn(p); V[k] = campo.V(p); vis[k] = ok(...p) ? 1 : 0;
      }
      return { val, V, vis };
    });
    let vmax = 0, vminV = Infinity, vmaxV = -Infinity, todo = true;
    for (const { val, V, vis } of muestras) for (let k = 0; k < val.length; k++) {
      if (!vis[k]) { todo = false; continue; }
      if (Number.isFinite(val[k])) vmax = Math.max(vmax, Math.abs(val[k]));
      if (Number.isFinite(V[k])) { vminV = Math.min(vminV, V[k]); vmaxV = Math.max(vmaxV, V[k]); }
    }
    const lo = vmax / 60;
    const t = x => Math.max(0, Math.min(1, Math.log(Math.max(Math.abs(x), lo) / lo) / Math.log(vmax / lo || 10)));
    muestras.forEach(({ val, V, vis }, c) => {
      const { cv, tex } = caras[c];
      const g = cv.getContext('2d'), img = g.createImageData(W, H);
      for (let k = 0; k < val.length; k++) {
        const i = k % W, j = (k / W) | 0;
        let rgb;
        if (!vis[k]) rgb = (i + j) % 14 === 0 ? linea : papel;              // trama fina: pendiente
        else { const s = 0.75 * t(val[k]); rgb = papel.map((p, n) => p + (suave[n] - p) * s); }
        img.data.set([rgb[0], rgb[1], rgb[2], vis[k] ? 255 : 120], k * 4);
      }
      g.putImageData(img, 0, 0);
      // equipotenciales (marching squares sencillo) solo donde está permitido
      if (Number.isFinite(vminV) && vmaxV > vminV) {
        const niveles = mapaDef.niveles ?? 9, paso = (vmaxV - vminV) / (niveles + 1);
        g.strokeStyle = `rgb(${hex('--esc-suave').join(',')})`; g.globalAlpha = 0.55; g.lineWidth = 1;
        g.beginPath();
        for (let n = 1; n <= niveles; n++) {
          const nv = vminV + n * paso;
          for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
            const k = j * W + i;
            if (!vis[k] || !vis[k + 1] || !vis[k + W]) continue;
            const a = V[k] - nv, b = V[k + 1] - nv, d = V[k + W] - nv;
            if (a * b < 0) { const x = i + a / (a - b); g.moveTo(x + 0.5, j); g.lineTo(x + 0.5, j + 1); }
            if (a * d < 0) { const y = j + a / (a - d); g.moveTo(i, y + 0.5); g.lineTo(i + 1, y + 0.5); }
          }
        }
        g.stroke(); g.globalAlpha = 1;
      }
      tex.needsUpdate = true;
    });
    const u = mapaDef.magnitud === 'V' ? 'V' : 'N/C';
    leyenda.innerHTML = `<span>${mapaDef.magnitud === 'V' ? 'V' : '|E|'}</span><i></i><span>${todo ? formatear(vmax, u, 2) : '?'}</span>`;
  }

  // ---------- elemento dS arrastrable ----------
  let dS = null;
  if (dib.dS && gauss) {
    const parche = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(THREE.MeshBasicMaterial, '--esc-acento', { opacity: 0.75, depthWrite: false }));
    const normal = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.7);
    vista.tintar(normal.line.material, '--esc-tenue'); vista.tintar(normal.cone.material, '--esc-tenue');
    const flechaE = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1);
    vista.tintar(flechaE.line.material, '--esc-tinta'); vista.tintar(flechaE.cone.material, '--esc-tinta');
    const lbl = vista.etiqueta('', 'acc');
    raiz.add(parche, normal, flechaE, lbl);
    dS = { parche, normal, flechaE, lbl, dir: new THREE.Vector3(...(dib.dS.dir || [0.55, 0.62, 0.56])).normalize() };
    // arrastre
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    let arrastrando = false;
    const apuntar = ev => {
      const r = vista.renderer.domElement.getBoundingClientRect();
      ptr.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
      ray.setFromCamera(ptr, vista.camera);
    };
    const el = vista.renderer.domElement;
    el.addEventListener('pointerdown', ev => {
      if (!parche.visible) return;
      apuntar(ev);
      if (ray.intersectObject(parche).length) { arrastrando = true; vista.controls.enabled = false; el.setPointerCapture(ev.pointerId); ev.preventDefault(); }
    });
    el.addEventListener('pointermove', ev => {
      if (!arrastrando) return;
      apuntar(ev);
      const R = estado.valor(gauss.pz.R) * S;
      const esf = new THREE.Sphere(new THREE.Vector3(), R), p = new THREE.Vector3();
      if (ray.ray.intersectSphere(esf, p)) { dS.dir.copy(p.normalize()); actualizar(); vista.pedirRender(); }
    });
    const soltar = () => { arrastrando = false; vista.controls.enabled = true; };
    el.addEventListener('pointerup', soltar); el.addEventListener('pointercancel', soltar);
  }

  // ---------- actualizar todo según el estado ----------
  let claveParams = '', claveRes = '';
  function actualizar() {
    const kp = JSON.stringify(estado.params);
    const kr = JSON.stringify(estado.apartados.map(a => estado.como(a.k)));
    if (kp !== claveParams) { claveParams = kp; hacerParticulas(); trazarTodas(); calcularEmax(); claveRes = ''; }
    if (kr !== claveRes) { claveRes = kr; pintarLineas(); }
    pintarMapa();

    const campo = estado.ayudas().campo;
    for (const o of objs) {
      const { pz } = o;
      const R = evalPieza(pz, 'R') * S;
      o.grupo.scale.setScalar(R);
      if (o.lbl && o.ang !== undefined) o.lbl.position.set(R * Math.cos(o.ang), R * Math.sin(o.ang) + 0.1, 0);
      if (o.gauss) {
        const sabe = estado.permitido(pz.tras);
        o.grupo.visible = sabe;
        o.radio.scale.setScalar(R); o.radio.visible = true;
        o.punto.position.set(R, 0, 0);
        if (o.lbl) { o.lbl.position.set(R + 0.12, -0.16, 0); }
      }
    }
    // recorte
    for (const m of recortables) m.clippingPlanes = capas.corte ? planos : [];
    for (const c of caras) c.m.visible = capas.corte && capas.mapa;
    leyenda.style.display = dib.mapa && capas.corte && capas.mapa ? '' : 'none';
    lineas.visible = conos.visible = capas.lineas;
    particulas.visible = capas.particulas;

    // flechas de flujo
    const Rg = gauss ? estado.valor(gauss.pz.R) : 0;
    const verG = gauss && estado.permitido(gauss.pz.tras);
    const sabeF = verG && capas.flujo && estado.permitido(dib.flujo?.tras);
    flechas.forEach((a, i) => {
      a.visible = !!sabeF; if (!sabeF) return;
      const d = dirs[i], p = d.map(c => c * Rg), E = campo.E(p), m = Math.hypot(...E);
      if (m < 1e-12) { a.visible = false; return; }
      const u = new THREE.Vector3(E[0] / m, E[1] / m, E[2] / m), len = largo(m);
      const sale = u.dot(new THREE.Vector3(...d)) >= 0;
      const base = new THREE.Vector3(...d).multiplyScalar(Rg * S + (sale ? 0 : len));
      a.position.copy(base); a.setDirection(u); a.setLength(len, Math.min(0.2, len * 0.45), Math.min(0.1, len * 0.22));
    });
    if (gauss?.lbl && op.leer && dib.flujo?.lectura) {
      const l = op.leer(dib.flujo.lectura);
      gauss.lbl.element.textContent = verG ? `${gauss.pz.et} · ${l.et} = ${l.txt}` : gauss.pz.et;
    }

    // dS
    if (dS) {
      const ver = verG && capas.dS;
      dS.parche.visible = dS.normal.visible = dS.lbl.visible = ver;
      dS.flechaE.visible = false;
      if (ver) {
        const R = Rg * S, n = dS.dir, lado = Math.max(0.18, R * 0.22);
        const c = n.clone().multiplyScalar(R * 1.002);
        dS.parche.position.copy(c); dS.parche.lookAt(c.clone().add(n)); dS.parche.scale.setScalar(lado);
        dS.normal.position.copy(c); dS.normal.setDirection(n); dS.normal.setLength(0.7, 0.14, 0.07);
        const sabe = estado.permitido(dib.dS.tras);
        const p = [n.x * Rg, n.y * Rg, n.z * Rg], E = campo.E(p), m = Math.hypot(...E);
        const area = (lado / S) ** 2;
        if (sabe && m > 1e-12) {
          dS.flechaE.visible = true;
          dS.flechaE.position.copy(c); dS.flechaE.setDirection(new THREE.Vector3(E[0] / m, E[1] / m, E[2] / m));
          const len = largo(m); dS.flechaE.setLength(len, Math.min(0.2, len * 0.45), Math.min(0.1, len * 0.22));
        }
        const EdS = (E[0] * n.x + E[1] * n.y + E[2] * n.z) * area;
        dS.lbl.element.textContent = 'E·dS = ' + (sabe ? formatear(EdS, 'N·m²/C', 3) : '?');
        dS.lbl.position.copy(c.clone().add(n.clone().multiplyScalar(0.55)));
      }
    }
  }

  vista.onTema(() => { claveMapa = ''; pintarMapa(); });

  return {
    capas,
    capa(k, v) { capas[k] = v; actualizar(); vista.pedirRender(); },
    actualizar,
  };
}
