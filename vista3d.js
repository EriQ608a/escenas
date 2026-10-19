// vista3d.js — lienzo three.js de una escena: cámara, vistas por apartado, etiquetas, tema,
// render a demanda, pausa fuera de pantalla y exportar a PNG. No sabe nada de física.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export { THREE };

/**
 * host: div vacío. op: { vistas: {nombre: {pos:[x,y,z], mira:[x,y,z]}}, inicial }.
 * Las coordenadas de vistas van en unidades de escena (ya escaladas).
 */
export function crearVista(host, op = {}) {
  const vistas = { general: { pos: [8.5, 5.2, 10], mira: [0, 0, 0] }, ...(op.vistas || {}) };
  const estilo = getComputedStyle(host);
  const color = tok => new THREE.Color((estilo.getPropertyValue(tok) || '#888').trim() || '#888');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;
  renderer.domElement.className = 'esc-gl';
  host.appendChild(renderer.domElement);
  const etiquetas = new CSS2DRenderer();
  etiquetas.domElement.className = 'esc-etq';
  host.appendChild(etiquetas.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 200);
  const v0 = vistas[op.inicial] || vistas.general;
  camera.position.set(...v0.pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...v0.mira);
  controls.enableDamping = true; controls.dampingFactor = 0.12;
  controls.enablePan = false; controls.minDistance = 2; controls.maxDistance = 60;

  const luzCielo = new THREE.HemisphereLight(0xffffff, 0xd8d3c8, 1.7);
  const sol = new THREE.DirectionalLight(0xffffff, 1.2); sol.position.set(4, 8, 6);
  scene.add(luzCielo, sol);

  // materiales con color de token: se recolorean al cambiar de tema
  const tintados = [];
  const tintar = (mat, tok) => { mat.color = color(tok); tintados.push([mat, tok]); return mat; };
  const alTema = new Set();

  let sucio = true, visible = false, anim = null;
  const pedirRender = () => { sucio = true; };
  controls.addEventListener('change', pedirRender);

  // en pantallas estrechas (móvil) la cámara se aleja para que quepa lo mismo a lo ancho
  const lejania = () => (camera.aspect < 1.4 ? (1.4 / camera.aspect) ** 0.8 : 1);
  const posVista = v => new THREE.Vector3(...v.pos).sub(new THREE.Vector3(...v.mira)).multiplyScalar(lejania()).add(new THREE.Vector3(...v.mira));
  let actual = op.inicial in vistas ? op.inicial : 'general';

  function ir(nombre, ms = 420) {
    const v = vistas[nombre]; if (!v) return;
    actual = nombre;
    const p0 = camera.position.clone(), m0 = controls.target.clone();
    const p1 = posVista(v), m1 = new THREE.Vector3(...v.mira);
    const t0 = performance.now();
    anim = () => {
      const t = Math.min(1, (performance.now() - t0) / ms), e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      camera.position.lerpVectors(p0, p1, e); controls.target.lerpVectors(m0, m1, e);
      if (t >= 1) anim = null;
      sucio = true;
    };
    if (!visible || ms <= 0) { camera.position.copy(p1); controls.target.copy(m1); anim = null; sucio = true; }
  }

  function etiqueta(txt, clase = '') {
    const d = document.createElement('div');
    d.className = 'esc-lbl ' + clase; d.textContent = txt;
    const o = new CSS2DObject(d);
    o.center.set(0, 0.5);
    return o;
  }

  function tamano() {
    const w = host.clientWidth || 300, h = host.clientHeight || 300;
    renderer.setSize(w, h, false); etiquetas.setSize(w, h);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    const antes = camera.aspect;
    camera.aspect = w / h; camera.updateProjectionMatrix(); sucio = true;
    if ((antes < 1.4) !== (camera.aspect < 1.4) || antes === 1) ir(actual, 0);
  }
  const ro = new ResizeObserver(tamano); ro.observe(host); tamano();

  const bucle = () => {
    if (anim) anim();
    const movido = controls.update();
    if (sucio || movido) { renderer.render(scene, camera); etiquetas.render(scene, camera); sucio = false; }
  };
  const io = new IntersectionObserver(es => {
    visible = es.some(e => e.isIntersecting);
    renderer.setAnimationLoop(visible ? bucle : null);
    if (visible) sucio = true;
  });
  io.observe(host);

  // tema: data-theme en <html> o preferencia del sistema
  const retintar = () => {
    requestAnimationFrame(() => {
      for (const [m, tok] of tintados) m.color = color(tok);
      alTema.forEach(f => f());
      sucio = true;
    });
  };
  const mo = new MutationObserver(retintar);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode', 'class'] });
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change', retintar);

  /** PNG de la vista actual con las etiquetas visibles dibujadas encima. */
  function exportar() {
    renderer.render(scene, camera);
    const gl = renderer.domElement, dpr = renderer.getPixelRatio();
    const cv = document.createElement('canvas');
    cv.width = gl.width; cv.height = gl.height;
    const g = cv.getContext('2d');
    g.fillStyle = (estilo.getPropertyValue('--esc-fondo') || '#fff').trim();
    g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(gl, 0, 0);
    const caja = host.getBoundingClientRect();
    g.textBaseline = 'middle';
    etiquetas.domElement.querySelectorAll('.esc-lbl').forEach(el => {
      if (el.style.display === 'none' || !el.textContent.trim()) return;
      const r = el.getBoundingClientRect(); if (!r.width) return;
      const cs = getComputedStyle(el);
      g.font = `${parseFloat(cs.fontSize) * dpr}px ${cs.fontFamily}`;
      g.fillStyle = cs.color;
      g.fillText(el.textContent, (r.left - caja.left + 4) * dpr, (r.top - caja.top + r.height / 2) * dpr);
    });
    return new Promise(res => cv.toBlob(res, 'image/png'));
  }

  return {
    THREE, scene, camera, controls, renderer, host,
    color, tintar, onTema: f => alTema.add(f),
    ir, etiqueta, pedirRender, exportar,
    destruir() { renderer.setAnimationLoop(null); io.disconnect(); ro.disconnect(); mo.disconnect(); controls.dispose(); renderer.dispose(); host.innerHTML = ''; },
  };
}
