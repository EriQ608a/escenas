// index.js — punto de entrada de la librería de escenas.
//   montar(host, def, opciones)  → monta una escena en un div
//   montarTodas(raiz, opciones)  → monta cada [data-escena] (con su JSON dentro) cuando se acerca a la pantalla
// Opciones: { ruta (clave de progreso), persistir (false = sin localStorage), resueltos: ['a','c'] (modo sesión),
//             casillas (false = sin casillas, para el widget del chat) }
import { crearEstado } from './estado.js';
import { montarPaneles, lector } from './paneles.js';
import { crearVista } from './vista3d.js';

const BASE = new URL('./', import.meta.url).href;
const FUENTES = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap';
const KATEX = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/';

// Paquetes de dominio: dan las ayudas de física para las expresiones y los dibujantes 3D.
const PAQUETES = {
  async em() {
    const [{ crearCampo, TIPOS_FUENTE }, { dibujarEM }] = await Promise.all([import('./em.js'), import('./dibujo-em.js')]);
    // las fuentes con `tras` (p. ej. el hilo que se añade en el último apartado) no entran en las
    // lecturas ni en las gráficas: solo las dibuja dibujo-em.js cuando se revelan
    const base = def => (def.piezas || []).filter(p => !(p.tras && TIPOS_FUENTE.includes(p.tipo)));
    return {
      ayudas: def => amb => {
        const c = crearCampo(base(def), amb);
        return { E: c.E, V: c.V, B: c.B, Er: c.Er, qenc: c.qenc, ienc: c.ienc, Bphi: c.Bphi, Jz: c.Jz, campo: c };
      },
      dibujar: dibujarEM,
    };
  },
};

function enlace(href) {
  if ([...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href === href)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l);
}
let katexListo = null;
function asegurarRecursos() {
  enlace(BASE + 'escenas.css');
  enlace(FUENTES);
  if (!window.katex && !katexListo) {
    enlace(KATEX + 'katex.min.css');
    katexListo = new Promise(res => { const s = document.createElement('script'); s.src = KATEX + 'katex.min.js'; s.onload = res; s.onerror = res; document.head.append(s); });
  }
  return katexListo || Promise.resolve();
}

function almacenLocal() { try { const s = window.localStorage; s.getItem('x'); return s; } catch { return null; } }

export async function montar(host, def, op = {}) {
  const katex = asegurarRecursos();
  const paquete = PAQUETES[def.paquete || 'em'];
  if (!paquete) throw new Error('paquete desconocido: ' + def.paquete);
  const paq = await paquete();
  const estado = crearEstado(def, {
    almacen: op.persistir === false ? null : almacenLocal(),
    clave: 'escenas:' + (op.ruta || location.pathname) + ':' + (def.id || 'escena'),
    resueltos: op.resueltos,
    ayudas: paq.ayudas(def),
  });
  const leer = lector(estado, def);
  const paneles = montarPaneles(host, estado, def, { leer, casillas: op.casillas });
  const primero = (estado.apartados.find(a => !estado.resuelto(a.k)) || {}).vista;
  const vista = crearVista(paneles.host3d, { vistas: def.vistas, inicial: primero });
  const dibujo = paq.dibujar(vista, estado, def, { leer });
  estado.on(() => paneles.actualizar());
  paneles.conectar(vista, dibujo);
  katex.then(() => paneles.actualizar());
  return { estado, vista, dibujo, paneles, destruir() { paneles.destruir(); vista.destruir(); } };
}

export function montarTodas(raiz = document, op = {}) {
  const pendientes = [...raiz.querySelectorAll('[data-escena]:not([data-montada])')];
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; io.unobserve(e.target); arrancar(e.target);
  }), { rootMargin: '400px 0px' }) : null;
  const montadas = [];
  function arrancar(el) {
    let def;
    try { def = JSON.parse(el.querySelector('script[type="application/json"]')?.textContent || el.dataset.escena); }
    catch (err) { el.innerHTML = `<p class="esc-error">Escena con JSON inválido: ${err.message}</p>`; return; }
    montar(el, def, op).then(m => montadas.push(m)).catch(err => {
      console.error(err);
      el.innerHTML = `<p class="esc-error">No se ha podido montar la escena «${def.id}»: ${err.message}</p>`;
    });
  }
  for (const el of pendientes) { el.dataset.montada = '1'; io ? io.observe(el) : arrancar(el); }
  return montadas;
}
