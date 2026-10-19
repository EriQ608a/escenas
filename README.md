# escenas

Escenas 3D interactivas para estudiar física (de momento, electromagnetismo) a partir de una
descripción JSON corta. Sin compilación: módulos ES servidos por jsDelivr, three.js por importmap.

- `index.js`: `montar(div, escena, opciones)` y `montarTodas(raiz, opciones)`.
- `estado.js`: datos, variables, apartados, comprobación ±1 % y regla de revelado (nada se enseña
  hasta que su apartado está resuelto).
- `em.js`: piezas con campo E/V (carga puntual, esfera, corteza, hilo, plano…) y líneas de campo.
- `vista3d.js`, `dibujo-em.js`, `paneles.js`, `escenas.css`: la parte visual.

```html
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.min.js",
 "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/"}}</script>
<div id="e"></div>
<script type="module">
  import { montar } from "https://cdn.jsdelivr.net/gh/EriQ608a/escenas@TAG/index.js";
  montar(document.getElementById("e"), ESCENA, { persistir: false });
</script>
```

Tests: `node --test tests/*.test.mjs`. Licencia MIT.
