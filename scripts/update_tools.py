#!/usr/bin/env python3
"""
Herramientas para actualizar el dataset. Hacen la parte mecánica; las decisiones
(qué fila elegir, qué effort tiene un dato, qué modelo añadir) quedan para quien
actualiza. Ver .claude/skills/actualizar-benchmarks/SKILL.md.

Uso (desde la raíz del proyecto):
  python3 scripts/update_tools.py snapshot   # guarda data/aa_models.json en data/.snapshot/ antes de actualizar
  python3 scripts/update_tools.py discover   # modelos y efforts nuevos en Artificial Analysis
  python3 scripts/update_tools.py external   # filas de Vals AI y benchmarklist frente a external_benchmarks.json
  python3 scripts/update_tools.py diff       # qué ha cambiado respecto al snapshot
  python3 scripts/update_tools.py check      # comprobaciones de coherencia de data/ y web/
  python3 scripts/update_tools.py review     # ¿las familias seguidas siguen siendo competentes?

Todos escriben un informe en texto por la salida estándar y no modifican data/
(salvo snapshot, que solo copia).
"""
import html
import json
import re
import shutil
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_aa as F  # noqa: E402

ROOT = F.ROOT
DATA = F.DATA
SNAP = DATA / ".snapshot" / "aa_models.json"
EXT = DATA / "external_benchmarks.json"
PROVIDERS = {"Anthropic", "OpenAI", "Google"}
# Sufijos de effort que se prueban en AA para cada familia
EFFORT_SUFFIXES = ["max", "xhigh", "high", "medium", "low", "minimal"]
# Palabras para reconocer en fuentes externas las filas de las familias del dataset
FAMILY_PATTERNS = {
    slug: re.compile(re.escape(display).replace(r"\ ", r"[\s_.-]*").replace(r"\.", r"[\s_.-]*"), re.I)
    for slug, (_, display, *_r) in F.FAMILIES.items()
}


def fetch_status(url):
    req = urllib.request.Request(url, headers={"User-Agent": F.UA}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""


def num(s):
    """'81.3%' -> 0.813, '89.9' -> 0.899 (si >1 se asume porcentaje), '—' -> None."""
    if s is None:
        return None
    m = re.search(r"-?\d+(?:[.,]\d+)?", str(s))
    if not m:
        return None
    v = float(m.group(0).replace(",", "."))
    return round(v / 100, 5) if v > 1 else v


# --------------------------------------------------------------------------- snapshot
def cmd_snapshot():
    src = DATA / "aa_models.json"
    if not src.exists():
        print("No hay data/aa_models.json: nada que guardar.")
        return
    SNAP.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, SNAP)
    shutil.copy2(EXT, SNAP.parent / "external_benchmarks.json")
    print(f"Snapshot guardado en {SNAP.parent}")


# --------------------------------------------------------------------------- discover
def cmd_discover():
    print("## Artificial Analysis: modelos por defecto de", ", ".join(sorted(PROVIDERS)))
    txt = F.flight_text(F.fetch(f"{F.BASE}/models"))
    listed = {}
    for o in F.enclosing_objects(txt, "isReasoning"):
        if "slug" in o:
            listed[o["slug"]] = o
    tracked = set(F.FAMILIES)
    new = []
    for slug, o in sorted(listed.items(), key=lambda kv: kv[1].get("releaseDate") or "", reverse=True):
        creator = (o.get("creator") or o.get("modelCreator") or {}).get("name")
        if creator not in PROVIDERS:
            continue
        mark = "seguido" if slug in tracked else "NO SEGUIDO"
        if slug not in tracked:
            new.append(slug)
        print(f"- {slug:28} {creator:10} lanzado {o.get('releaseDate')}  effort por defecto={(o.get('effort') or {}).get('slug')}  "
              f"II={o.get('intelligenceIndex')}  [{mark}]")
    gone = sorted(tracked - set(listed))
    if gone:
        print(f"\nSeguidos que ya no aparecen en /models (¿retirados o renombrados?): {', '.join(gone)}")
    print("\nNota: /models solo lista unos pocos modelos destacados; que un modelo no salga no prueba que no exista.")

    print("\n## Variantes de effort (se prueban las URLs /models/<slug>-<effort>)")
    for base, (_, display, _f, _v, efforts) in F.FAMILIES.items():
        configured = {suf for _, suf in efforts}
        found = []
        for eff in EFFORT_SUFFIXES:
            suf = f"-{eff}"
            if suf in configured:
                continue
            code, _ = fetch_status(f"{F.BASE}/models/{base}{suf}")
            if code == 200:
                found.append(base + suf)
        status = ("existen y NO están en FAMILIES: " + ", ".join(found)) if found else "sin variantes nuevas"
        print(f"- {display}: {status}")
    if new:
        print("\n## ¿Son competentes? (criterio de la skill: bien posicionado en al menos una cosa)")
        for slug in new:
            evaluate(slug)


# Categorías que cuentan como "rendimiento" para el criterio de competencia
QUALITY_CATS = {"index", "domain_index", "coding_agentic", "coding_science", "coding_visual", "agentic",
                "science", "reasoning_knowledge", "multimodal", "knowledge_reliability", "long_context",
                "knowledge_work", "health", "security"}
TOP_N = 3            # puesto máximo entre familias para contar como "bien posicionado"
MIN_FAMILIES = 5     # familias seguidas con dato en esa métrica para que el puesto signifique algo
# Ejes de eficiencia: (métrica, menor es mejor). El candidato cuenta si nadie del dataset le gana
# a la vez en Intelligence Index y en ese eje (frontera de Pareto).
PARETO_AXES = [("cost_per_task_usd", True), ("price_blended_3to1", True), ("output_speed_tps", False)]


def evaluate(slug, rec=None, exclude_family=None):
    """Compara un modelo con las familias del dataset (sin exclude_family) y dice si cumple el criterio."""
    if rec is None:
        txt = F.flight_text(F.fetch(f"{F.BASE}/models/{slug}"))
        cands = [o for o in F.enclosing_objects(txt, "intelligenceIndexEvaluations") if o.get("slug") == slug]
        if not cands:
            print(f"- {slug}: no encuentro su registro; evaluar a mano")
            return None
        rec = max(cands, key=len)
    cm = {c: F.get_path(rec, p) for c, p, *_ in F.METRICS}
    d = json.loads((DATA / "aa_models.json").read_text(encoding="utf-8"))
    models = [m for m in d["models"] if m["family"] != exclude_family]
    reasons = []
    for c, _p, name, _u, hib, cat, _ev in F.METRICS:
        v = cm[c]
        if cat not in QUALITY_CATS or not isinstance(v, (int, float)) or c.endswith(("_lo", "_hi", "_lo95", "_hi95")):
            continue
        best = {}  # mejor valor de cada familia en esa métrica (cualquier effort)
        for m in models:
            x = m["metrics"].get(c)
            if isinstance(x, (int, float)):
                f = m["family"]
                best[f] = x if f not in best else (max if hib else min)(best[f], x)
        if len(best) < MIN_FAMILIES:
            continue
        rank = 1 + sum((x > v) if hib else (x < v) for x in best.values())
        if rank <= TOP_N:
            reasons.append(f"{rank}.º de {len(best) + 1} familias en {name} ({v:.3g})")
    ii = cm.get("intelligence_index")
    for c, low in PARETO_AXES:
        v = cm.get(c)
        if ii is None or v is None:
            continue
        dominated = [m["slug"] for m in models
                     if (m["metrics"].get("intelligence_index") or -1) >= ii and m["metrics"].get(c) is not None
                     and ((m["metrics"][c] <= v) if low else (m["metrics"][c] >= v))]
        if not dominated:
            reasons.append(f"frontera de Pareto Intelligence Index vs {c} (II={ii:.1f}, {c}={v:.3g})")
    verdict = "CUMPLE" if reasons else "NO CUMPLE"
    print(f"- {slug} (II={ii and round(ii, 1)}): {verdict}")
    for r in reasons:
        print(f"    · {r}")
    return bool(reasons)


def cmd_review():
    """Evalúa cada effort de las familias seguidas contra las demás familias."""
    d = json.loads((DATA / "aa_models.json").read_text(encoding="utf-8"))
    by_fam = {}
    for m in d["models"]:
        by_fam.setdefault(m["family"], []).append(m)
    for fam, ms in by_fam.items():
        print(f"\n## {fam}")
        ok = [evaluate(m["slug"], rec=m["record"], exclude_family=fam) for m in ms]
        print(f"=> {fam}: {'CUMPLE' if any(ok) else 'NINGÚN EFFORT CUMPLE: candidata a salir'}")


# --------------------------------------------------------------------------- external
def astro_decode(x):
    if isinstance(x, list) and len(x) == 2 and isinstance(x[0], int):
        t, v = x
        return [astro_decode(i) for i in v] if t == 1 else astro_decode(v)
    if isinstance(x, dict):
        return {k: astro_decode(v) for k, v in x.items()}
    return x


def vals_rows(url):
    """Vals AI: devuelve [(id, nombre, accuracy_frac, effort, extra)] de la tarea 'overall'."""
    _, t = fetch_status(url)
    names = {a: html.unescape(n) for a, n in re.findall(r'href="/models/([^"]+)">([^<]+)</a>', t)}
    blocks = [html.unescape(m.group(1)) for m in re.finditer(r'props="([^"]+)"', t)]
    blocks = [s for s in blocks if '"benchmarkView"' in s and "accuracy" in s]
    if not blocks:
        return [], "¡no encuentro el bloque de datos! La página ha cambiado"
    bv = astro_decode(json.loads(max(blocks, key=len)))["benchmarkView"]
    meta = bv.get("metadata", {})
    tasks = bv.get("tasks", {})
    rows = []
    for mid, r in tasks.get("overall", {}).items():
        if not isinstance(r, dict) or "accuracy" not in r:
            continue
        # El effort a veces solo viene en las subtareas (poc/patch), y en Claude como compute_effort
        effs = set()
        for task in tasks.values():
            rr = task.get(mid) if isinstance(task, dict) else None
            if isinstance(rr, dict):
                effs |= {rr.get("reasoning_effort"), rr.get("compute_effort")}
        effs.discard(None)
        rows.append((mid, names.get(mid.replace("/", "_"), mid),
                     num(r["accuracy"]) if r["accuracy"] is not None else None,
                     "/".join(sorted(effs)) or None,
                     f"stderr={r.get('stderr')} harness={r.get('harness')} provider={r.get('provider')}"))
    return rows, f"{meta.get('benchmark')} (actualizado {meta.get('updated')})"


def benchmarklist_rows(url):
    """benchmarklist.com: tablas HTML con cabeceras; devuelve [(href, nombre, valor_principal, effort?, resto)]."""
    _, t = fetch_status(url)
    rows, seen = [], set()
    for table in re.findall(r"<table.*?</table>", t, re.S):
        heads = [re.sub(r"\s+", " ", re.sub("<[^>]+>", " ", h)).strip() for h in re.findall(r"<th[^>]*>(.*?)</th>", table, re.S)]
        for r in re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S):
            cells = [re.sub(r"\s+", " ", re.sub("<[^>]+>", " ", c)).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)]
            if len(cells) < 3:
                continue
            href = (re.findall(r'href="(/models/[^"]+)"', r) or [""])[0]
            key = (cells[1], tuple(cells[2:]))
            if key in seen:
                continue
            seen.add(key)
            rest = "; ".join(f"{h}={c}" for h, c in zip(heads[3:], cells[3:]) if c not in ("", "—"))
            rows.append((href, html.unescape(cells[1]), num(cells[2]), None, f"[{heads[2] if len(heads) > 2 else ''}] {rest}"))
    return rows, "tablas HTML"


def cmd_external():
    ext = json.loads(EXT.read_text(encoding="utf-8"))
    for b in ext["benchmarks"]:
        url = b["url"]
        print(f"\n## {b['name']}  ({url})")
        if "vals.ai" in url:
            rows, info = vals_rows(url)
        elif "benchmarklist.com" in url:
            rows, info = benchmarklist_rows(url)
        else:
            print("  Sin extractor para esta web: revisar a mano.")
            continue
        print(f"  Fuente: {info}. {len(rows)} filas en total.")
        if not rows:
            print("  ¡AVISO! 0 filas: el extractor ya no funciona con esta página; revisar a mano y ajustar el código.")
            continue
        print("  Filas que parecen de familias del dataset (valor en fracción 0-1):")
        for rid, name, val, eff, extra in rows:
            fams = [s for s, p in FAMILY_PATTERNS.items() if p.search(name) or p.search(rid)]
            if not fams:
                continue
            # Valores actuales del JSON para esa familia (cualquier effort)
            cur = {k: v for k, v in b["values"].items() if any(k == f or k.startswith(f + "-") for f in fams)}
            flag = ""
            if cur and val is not None and not any(abs(val - v) < 0.0006 for v in cur.values()):
                flag = "  <-- DIFIERE de lo guardado"
            if not cur:
                flag = "  <-- no está en el JSON"
            print(f"  - {name!r} id={rid} valor={val} effort={eff} | {extra} | guardado={cur or '-'}{flag}")
        for k in b["values"]:
            fam = next((f for f in F.FAMILIES if k == f or k.startswith(f + "-")), None)
            if fam is None:
                print(f"  ¡AVISO! clave '{k}' del JSON no corresponde a ninguna familia de FAMILIES")


# --------------------------------------------------------------------------- diff
def load_models(path):
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    return d, {m["slug"]: m for m in d["models"]}


def cmd_diff(threshold=0.05):
    if not SNAP.exists():
        print("No hay snapshot (ejecuta 'snapshot' antes de fetch_aa.py).")
        return
    old_d, old = load_models(SNAP)
    new_d, new = load_models(DATA / "aa_models.json")
    print(f"Antes: {old_d['meta']['fetched_at']}  ({len(old)} modelos, índice {old_d['meta'].get('intelligence_index_version')})")
    print(f"Ahora: {new_d['meta']['fetched_at']}  ({len(new)} modelos, índice {new_d['meta'].get('intelligence_index_version')})")
    if old_d["meta"].get("intelligence_index_version") != new_d["meta"].get("intelligence_index_version"):
        print("¡CAMBIO DE VERSIÓN DEL INTELLIGENCE INDEX! Los valores antiguos y nuevos no son comparables; "
              "revisar el nombre en METRICS (fetch_aa.py) y los textos de la web.")
    for s in sorted(set(old) - set(new)):
        print(f"- DESAPARECE: {s}")
    for s in sorted(set(new) - set(old)):
        print(f"+ NUEVO: {s}")
    cols = [m["column"] for m in new_d["metrics"]]
    lost_cols = {c: [] for c in cols}
    changes = []
    for s in sorted(set(old) & set(new)):
        om, nm = old[s]["metrics"], new[s]["metrics"]
        for c in cols:
            a, b = om.get(c), nm.get(c)
            if a is not None and b is None:
                lost_cols[c].append(s)
            elif isinstance(a, (int, float)) and isinstance(b, (int, float)) and a != b:
                rel = abs(b - a) / (abs(a) or 1)
                if rel >= threshold:
                    changes.append((rel, s, c, a, b))
    print(f"\nCambios de >= {threshold:.0%}:")
    for rel, s, c, a, b in sorted(changes, reverse=True)[:60]:
        print(f"  {s:28} {c:32} {a} -> {b}  ({rel:+.0%})")
    if not changes:
        print("  ninguno")
    lost = {c: v for c, v in lost_cols.items() if v}
    if lost:
        print("\nMétricas que tenían dato y ahora están vacías (¿ruta renombrada en AA?):")
        for c, v in lost.items():
            print(f"  {c}: {len(v)} modelos ({', '.join(v[:4])}{'…' if len(v) > 4 else ''})")
    # Claves nuevas en el registro bruto que no están en METRICS (benchmarks nuevos en AA)
    curated = {m["path"].split(".")[0] for m in new_d["metrics"]}
    old_keys = {k for m in old.values() for k in m["record"]}
    new_keys = {k for m in new.values() for k in m["record"]} - old_keys
    if new_keys:
        print("\nClaves nuevas en los registros de AA (posibles benchmarks nuevos):", ", ".join(sorted(new_keys)))
    unused = sorted(k for k in {k for m in new.values() for k, v in m["record"].items()
                                   if isinstance(v, (int, float)) and not isinstance(v, bool)}
                    if k not in curated)
    print("\nClaves numéricas del registro que no están en METRICS (informativo):", ", ".join(unused) or "-")
    new_evals = set(new_d["evaluations"]) - set(old_d["evaluations"])
    if new_evals:
        print("\nEvaluaciones nuevas en el catálogo de AA:", ", ".join(sorted(new_evals)))


# --------------------------------------------------------------------------- check
def cmd_check():
    problems = []
    d, models = load_models(DATA / "aa_models.json")
    expected = {base + suf for base, (*_, eff) in F.FAMILIES.items() for _, suf in eff}
    missing = expected - set(models)
    if missing:
        problems.append(f"Modelos de FAMILIES sin registro descargado: {', '.join(sorted(missing))}")
    for s, m in models.items():
        if m["metrics"].get("intelligence_index") is None:
            problems.append(f"{s}: sin intelligence_index")
    for col, n in [(m["column"], sum(mm["metrics"].get(m["column"]) is not None for mm in models.values())) for m in d["metrics"]]:
        if n == 0:
            problems.append(f"Métrica '{col}' vacía en todos los modelos (¿ruta cambiada?)")
    ext = json.loads(EXT.read_text(encoding="utf-8"))
    for b in ext["benchmarks"]:
        for k, v in b["values"].items():
            if k not in models:
                problems.append(f"{b['id']}: el slug '{k}' no existe en aa_models.json")
            if b["unit"] == "frac" and not (0 <= v <= 1):
                problems.append(f"{b['id']}: {k}={v} fuera de 0-1")
        for k in b.get("notes", {}):
            if k not in b["values"]:
                problems.append(f"{b['id']}: hay nota para '{k}' pero no valor")
    cfg = (ROOT / "web" / "config.js").read_text(encoding="utf-8")
    for fam in {f for (_, _, f, _, _) in F.FAMILIES.values()}:
        if f'"{fam}"' not in cfg and f"{fam}:" not in cfg:
            problems.append(f"La familia '{fam}' no tiene color/forma en web/config.js > families")
    js = ROOT / "web" / "data.js"
    if js.stat().st_mtime < (DATA / "aa_models.json").stat().st_mtime or js.stat().st_mtime < EXT.stat().st_mtime:
        problems.append("web/data.js es más antiguo que los datos: ejecuta python3 scripts/build_web.py")
    print("Todo correcto." if not problems else "Problemas:\n- " + "\n- ".join(problems))
    return 1 if problems else 0


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    fn = {"snapshot": cmd_snapshot, "discover": cmd_discover, "external": cmd_external,
          "diff": cmd_diff, "check": cmd_check, "review": cmd_review}.get(cmd)
    if not fn:
        print(__doc__)
        sys.exit(2)
    sys.exit(fn() or 0)
