---
name: actualizar-benchmarks
description: Actualiza los datos de benchmarks del proyecto de análisis de modelos (Artificial Analysis + benchmarks externos de Vals AI y benchmarklist.com) y regenera la web local. Úsala cuando el usuario pida actualizar, refrescar o revisar los datos o benchmarks de los modelos, añadir un modelo o un nivel de effort, o comprobar si hay datos nuevos.
---

# Actualizar los datos de benchmarks

El proyecto compara modelos de Anthropic, OpenAI y Google en todos sus niveles de effort.
Lo mecánico está en código; lo que pide criterio está aquí. **No inventes valores**: cada
número tiene que salir de una fuente que hayas leído en esta sesión.

## Mapa del proyecto

| Fichero | Qué es | ¿Se edita a mano? |
|---|---|---|
| `scripts/fetch_aa.py` | Descarga Artificial Analysis (AA) y regenera `data/` y `raw/`. Al final llama a `build_web.py` | Solo `FAMILIES` y `METRICS` |
| `scripts/update_tools.py` | Comprobaciones: `snapshot`, `discover`, `external`, `diff`, `check`, `review` | No (salvo arreglar extractores) |
| `scripts/build_web.py` | Genera `web/data.js` desde `data/aa_models.json` + `data/external_benchmarks.json` | `SHORT`, `CATEGORY_ES` si hay métricas o categorías nuevas |
| `data/external_benchmarks.json` | Benchmarks externos, **metidos a mano** con notas | Sí |
| `web/config.js` | Colores/formas por familia, planes de suscripción | Sí, si hay familia nueva |
| `data/aa_models.json`, `*.csv`, `raw/`, `web/data.js` | Generados | **Nunca** |
| `data/subscriptions_research.md` | Investigación de precios de suscripciones | Fuera del alcance de esta skill salvo que lo pidan |

## Procedimiento

Ejecuta todo desde la raíz del proyecto.

1. **Snapshot**: `python3 scripts/update_tools.py snapshot`. Sin esto no se puede hacer el paso 5.
2. **Descubrir**: `python3 scripts/update_tools.py discover` (tarda ~1 min). Informa de:
   - modelos por defecto de los tres proveedores que no están en `FAMILIES`;
   - URLs de effort (`-xhigh`, `-minimal`, …) que existen en AA y no están configuradas.
   - si cada modelo no seguido es competente (CUMPLE / NO CUMPLE, ver «Criterios»).
   Decide con los criterios de abajo. **Pregunta al usuario antes de añadir o quitar una familia**;
   añadir un nivel de effort que falta de una familia ya seguida puedes hacerlo directamente.
   Tras descargar (paso 4), ejecuta también `python3 scripts/update_tools.py review`.
3. **Editar `FAMILIES`** en `fetch_aa.py` si procede (ver «Añadir un modelo»).
4. **Descargar**: `python3 scripts/fetch_aa.py` (~1 min). Si sale `¡AVISO! sin registro para <slug>`,
   el slug no existe o la página cambió: compruébalo abriendo `https://artificialanalysis.ai/models/<slug>`.
5. **Revisar cambios**: `python3 scripts/update_tools.py diff`. Mira:
   - **Cambio de versión del Intelligence Index**: actualiza el nombre en `METRICS`
     (`"AA Intelligence Index vX"`) y avisa al usuario de que los valores no son comparables con los anteriores.
   - **Métricas vacías ahora**: AA renombró una clave. Busca la nueva en `raw/<slug>.json`
     y corrige la ruta en `METRICS`. No la borres sin más.
   - **Claves nuevas / evaluaciones nuevas**: posible benchmark nuevo. Añádelo a `METRICS` solo si es
     un benchmark con puntuación (no metadatos) y tiene dato en varios modelos; añade también
     su nombre corto en `SHORT` de `build_web.py`. Si dudas, coméntalo al usuario en vez de añadirlo.
   - **Cambios grandes (≥ 5 %)**: normales en precios, velocidad y latencia. En puntuaciones de
     benchmarks son raros: menciónalos en el resumen.
6. **Benchmarks externos**: `python3 scripts/update_tools.py external` y aplica a mano los
   cambios en `data/external_benchmarks.json` siguiendo «Criterios para externos».
   Actualiza la fecha de «Revisado el …» en `_readme`.
7. **Regenerar web** (si tocaste el JSON externo o `build_web.py`): `python3 scripts/build_web.py`.
8. **Comprobar**: `python3 scripts/update_tools.py check` tiene que decir «Todo correcto».
9. **Resumen al usuario**: modelos/efforts añadidos, cambios notables de puntuación, valores externos
   cambiados (con antes → después), y lo que dejaste sin decidir.

Si un extractor de `update_tools.py` devuelve 0 filas o `fetch_aa.py` falla, la web de origen cambió de
estructura. Descarga la página, localiza un valor conocido (p. ej. `grep -o '.\{200\}74\.58' pagina.html`)
y arregla el extractor. Es el único caso en que hay que tocar el código de extracción.

## Criterios para Artificial Analysis

- **Qué familias se siguen: solo modelos competentes** de Anthropic, OpenAI y Google, en todos sus
  efforts. Competente = **bien posicionado en al menos una cosa**. Un modelo que no destaca en nada
  no interesa, aunque sea nuevo o barato. `discover` lo evalúa solo y dice CUMPLE / NO CUMPLE con los
  motivos. La regla, en `evaluate()` de `update_tools.py`, es:
  - **top 3 entre las familias** (mejor effort de cada una) en algún benchmark de rendimiento
    (índices, programación, agentes, ciencia, razonamiento, conocimiento, contexto largo, trabajo de
    conocimiento, salud), contando solo métricas con dato en al menos 5 familias; **o**
  - **frontera de Pareto**: ningún modelo del dataset le gana a la vez en Intelligence Index y en coste
    por tarea, precio blended o velocidad de salida.
  Precio, velocidad, tokens, ventana de contexto o estilo **por sí solos no cuentan**: un modelo barato
  pero peor y más caro por tarea que otro del dataset no interesa.
- El veredicto es una ayuda, no una orden. **Pregunta al usuario antes de añadir una familia**, aunque
  CUMPLA. Si el motivo es débil (un solo benchmark de nicho, o un empate), dilo. Si NO CUMPLE, no la
  propongas salvo que haya una razón clara que el script no ve (p. ej. es la única de su tipo).
- **Familias que dejan de ser competentes**: `python3 scripts/update_tools.py review` evalúa cada familia
  seguida contra las demás. Si sale «candidata a salir», **propónselo** al usuario; no la quites tú.
- Una versión nueva de una familia seguida (p. ej. Opus 5.6) es candidata a sustituir o acompañar a la
  anterior: **pregunta** si se sustituye o se añaden ambas. Si la nueva la supera en todo, lo normal es
  sustituirla.
- **No se siguen**: variantes `-non-reasoning` (no son un nivel de effort).
- **Decisiones ya tomadas** (añade aquí las nuevas, con fecha):
  - 2026-11: `gemini-3-8-flash` fuera, por no competente (NO CUMPLE: mejor puesto 13.º en SciCode; en
    eficiencia, siempre hay un modelo del dataset mejor en los dos ejes).
- **Slug base = effort por defecto** de esa familia en AA (max en Claude y GPT, high en Gemini Carbon).
  Compruébalo con el campo `effort por defecto` de `discover`; si cambia, el sufijo vacío `""` tiene
  que ir asociado al effort nuevo en la lista de efforts de la familia.

### Añadir un modelo

1. Añade una entrada a `FAMILIES`: `"slug-base": ("Proveedor", "Nombre visible", "Familia", "versión", efforts)`.
   Usa `STD_EFFORTS` si tiene max/xhigh/high/medium/low; si no, una lista propia como la de Gemini.
   Comprueba cada URL de effort antes de añadirla.
2. Si la **familia** es nueva (el tercer campo), añade color y forma en `web/config.js > families`
   (no repitas color de otra familia del mismo proveedor) y revisa si `pricing` en `config.js` la debe
   mencionar. `check` avisa si falta.
3. Si sustituye a una versión anterior, quita la anterior de `FAMILIES` y busca su slug en
   `data/external_benchmarks.json` y `web/config.js`.

## Criterios para benchmarks externos

`data/external_benchmarks.json` tiene, por benchmark, `values` (fracción 0-1) y `notes` (por qué
ese valor). Las claves son slugs de `aa_models.json`: `claude-opus-5-5` es el effort por defecto
(max), `claude-opus-5-5-high` el high, etc. **El slug tiene que corresponder al effort con el que se
midió**; si la fuente no lo dice, ponlo en el effort por defecto y dilo en la nota.

- **Filas múltiples del mismo modelo** (p. ej. Vals tiene «Claude Opus 5.5» y «Claude Opus 5.5 (CVP)»):
  se guarda la variante que mejor representa al modelo usado con permisos de ciberseguridad, y la otra
  se cita en la nota con su valor. Ya decidido para Opus 5.5: se usa CVP (`-range` en Vals). Por eso
  `external` marca «DIFIERE» en la fila estándar: **es esperado**, no lo cambies.
- **Fallback por rechazo** (Vals: un modelo antiguo responde cuando el evaluado se niega): si la fuente
  lo indica, dilo en la nota y da también el valor sin fallback si se publica.
- **Harness** (Claude Code, Codex, Antigravity…) y **variante de métrica** (Pass@1 programático frente a
  panel de jueces): se guarda Pass@1 programático; el otro va en la nota si difiere.
- **Dato del fabricante** (system cards): permitido, pero la nota dice «dato del fabricante».
- **Redondeo**: 4 decimales en fracción (74,584 % → 0.7458). `external` considera iguales valores
  que difieren < 0,0006.
- **Modelo nuevo en la fuente** que está en el dataset: añádelo con su nota. Modelo que no está en
  el dataset: no lo añadas (`check` falla si un slug no existe en `aa_models.json`).
- **Benchmark externo nuevo**: solo si el usuario lo pide. Copia la estructura de uno existente
  (`id` con prefijo `ext_`, `unit`, `higher_is_better`, `category` existente en `CATEGORY_ES`,
  `source`, `url`, `description` en español). Si su web no es vals.ai ni benchmarklist.com, `external`
  no lo lee: revísalo a mano o añade un extractor en `update_tools.py`.
- Las notas van en español, frases cortas, con números en formato español (55,36 %).

## Qué no hacer

- No edites ficheros generados (`aa_models.json`, CSV, `raw/`, `web/data.js`).
- No borres métricas o modelos porque falten datos en una actualización: primero averigua por qué.
- No cambies `web/app.js` ni `styles.css` en una actualización de datos.
- No metas en `external_benchmarks.json` valores recordados o de fuentes no leídas en esta sesión.
