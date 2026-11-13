#!/usr/bin/env python3
"""
Descarga los datos de Artificial Analysis (artificialanalysis.ai) para los
modelos definidos en FAMILIES (Claude Fable 5.2, Opus 5.5, Sonnet 5.5,
Haiku 5.5, Gemini 4 Carbon, GPT-6 Astra, GPT-6.1 Sol, GPT-6.1 Terra y
GPT-6 Luna) en todos sus niveles de effort, y genera:

  data/aa_models.json        -> "mega json": metadatos, catálogo de benchmarks y modelos (registro completo)
  data/models_flat.csv       -> 1 fila por modelo/effort, todas las métricas aplanadas
  data/index_evals_long.csv  -> 1 fila por modelo x evaluación del Intelligence Index
                                (score, tokens, coste y tiempo por tarea)
  data/benchmarks.csv        -> catálogo de métricas: columna, nombre, unidad, mejor alto/bajo, categoría
  raw/<slug>.json            -> registro bruto tal como viene de la web

Los datos se extraen del payload de Next.js embebido en cada página
/models/<slug> (la API pública antigua /api/v2/data/* fue retirada).

Uso:  python3 scripts/fetch_aa.py            (desde la carpeta del proyecto)
"""
import csv
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = ROOT / "raw"
BASE = "https://artificialanalysis.ai"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"

# Para añadir un modelo: busca sus slugs en https://artificialanalysis.ai/models/<slug>.
# El slug base (sin sufijo) corresponde al effort por defecto de esa familia
# (max en Claude y GPT, high en Gemini 4 Carbon, xhigh en Gemini 4 Hydrogen); el resto lleva sufijo "-<effort>".
# Las variantes "-non-reasoning" de GPT no se descargan: no son un nivel de effort.
STD_EFFORTS = [("max", ""), ("xhigh", "-xhigh"), ("high", "-high"), ("medium", "-medium"), ("low", "-low")]
FAMILIES = {
    # slug base: (proveedor, nombre visible, familia, versión, [(effort, sufijo), ...])
    "claude-fable-5-2": ("Anthropic", "Claude Fable 5.2", "Fable", "5.2", STD_EFFORTS),
    "claude-opus-5-5": ("Anthropic", "Claude Opus 5.5", "Opus", "5.5", STD_EFFORTS),
    "claude-sonnet-5-5": ("Anthropic", "Claude Sonnet 5.5", "Sonnet", "5.5", STD_EFFORTS),
    "claude-haiku-5-5": ("Anthropic", "Claude Haiku 5.5", "Haiku", "5.5", STD_EFFORTS),
    "gemini-4-carbon": ("Google", "Gemini 4 Carbon", "Gemini Carbon", "4",
                        [("high", ""), ("medium", "-medium"), ("low", "-low")]),
    "gemini-4-hydrogen": ("Google", "Gemini 4 Hydrogen", "Gemini Hydrogen", "4",
                          [("xhigh", ""), ("high", "-high"), ("medium", "-medium"), ("low", "-low")]),
    "gpt-6-astra": ("OpenAI", "GPT-6 Astra", "GPT Astra", "6", STD_EFFORTS),
    "gpt-6-1-sol": ("OpenAI", "GPT-6.1 Sol", "GPT Sol", "6.1", STD_EFFORTS),
    "gpt-6-1-terra": ("OpenAI", "GPT-6.1 Terra", "GPT Terra", "6.1", STD_EFFORTS),
    "gpt-6-luna": ("OpenAI", "GPT-6 Luna", "GPT Luna", "6", STD_EFFORTS),
}

# ---------------------------------------------------------------------------
# Catálogo de métricas: (columna CSV, ruta en el registro, nombre, unidad,
#                        higher_is_better, categoría, slug evaluación AA)
# unidad: "index" 0-100 | "frac" 0-1 | "elo" | "usd" | "s" | "tok" | "tok/s" | "usd/1M"
# ---------------------------------------------------------------------------
METRICS = [
    # --- Índices compuestos
    ("intelligence_index", "intelligenceIndex", "AA Intelligence Index v5.0.1", "index", True, "index", "artificial-analysis-intelligence-index"),
    ("cap_engineering", "capabilities.engineering", "Engineering Index", "index", True, "domain_index", None),
    ("cap_economics", "capabilities.economics", "Economics Index", "index", True, "domain_index", None),
    ("cap_finance_accounting", "capabilities.financeAndAccounting", "Finance & Accounting Index", "index", True, "domain_index", None),
    ("cap_strategy_ops", "capabilities.strategyAndOps", "Strategy & Ops Index", "index", True, "domain_index", None),
    ("cap_legal", "capabilities.legal", "Legal Index", "index", True, "domain_index", None),
    ("cap_healthcare_medical", "capabilities.healthcareAndMedical", "Healthcare & Medical Index", "index", True, "domain_index", None),
    # --- Software / agentes
    ("terminal_bench_4_0", "terminalBench40", "Terminal-Bench 4.0", "frac", True, "coding_agentic", "terminalbench-4-0"),
    ("frontiercode_2_0", "frontierCode20", "FrontierCode-AA 2.0", "frac", True, "coding_agentic", "frontiercode-2-0"),
    ("frontiercode_1_1", "frontierCode", "FrontierCode 1.1", "frac", True, "coding_agentic", "frontiercode"),
    ("scicode", "scicode", "SciCode", "frac", True, "coding_science", "scicode"),
    ("automationbench", "automationBenchPartialScore", "AutomationBench-AA (partial score)", "frac", True, "agentic", "automationbench-aa"),
    ("itbench_sre", "itBenchSre", "ITBench-AA (SRE)", "frac", True, "agentic", "itbench-aa"),
    ("analyst_agent", "analystAgent", "AA-AnalystAgent", "frac", True, "agentic", "aa-analyst-agent"),
    ("code2video_elo", "code2videoElo", "Code2Video-AA (Elo)", "elo", True, "coding_visual", "code2video-aa"),
    ("aa3d_elo", "aa3dElo", "AA-3D (Elo)", "elo", True, "coding_visual", "aa-3d"),
    # --- Ciencia / razonamiento / investigación
    ("terminal_bench_science", "terminalBenchScience", "Terminal-Bench-Science 0.1", "frac", True, "science", "terminal-bench-science"),
    ("hle_diamond", "hleDiamond", "HLE-Diamond", "frac", True, "reasoning_knowledge", "hle-diamond"),
    ("hle", "hle", "Humanity's Last Exam", "frac", True, "reasoning_knowledge", "humanitys-last-exam"),
    ("critpt_v2_hard", "critptAgenticHard", "CritPt v2 (Hard Subset)", "frac", True, "science", "critpt-v2"),
    ("critpt_v1", "critpt", "CritPt (v1)", "frac", True, "science", "critpt"),
    ("mka_climb_wsr", "mkaClimbWsr", "MKA (climb WSR)", "frac", True, "science", "mka"),
    ("vials", "vialsScore", "VIALS-AA", "frac", True, "science", "vials-aa"),
    ("mmmu_pro", "mmmuPro", "MMMU-Pro (multimodal)", "frac", True, "multimodal", "mmmu-pro"),
    # --- Conocimiento / fiabilidad / contexto largo
    ("omniscience_index", "omniscience", "AA-Omniscience v1.1 (index)", "index", True, "knowledge_reliability", "omniscience"),
    ("omniscience_accuracy", "omniscienceAccuracy", "AA-Omniscience accuracy", "frac", True, "knowledge_reliability", "omniscience"),
    ("omniscience_hallucination_rate", "omniscienceHallucinationRate", "AA-Omniscience hallucination rate", "frac", False, "knowledge_reliability", "omniscience"),
    ("lcr", "lcr", "AA-LCR v1.1 (long context reasoning)", "frac", True, "long_context", "artificial-analysis-long-context-reasoning"),
    ("mlcr", "mlcrOverall", "MLCR-AA (long context)", "frac", True, "long_context", "mlcr-aa"),
    # --- Trabajo del conocimiento / documentos
    ("briefcase_elo", "briefcaseBreakdown.overall.elo", "AA-Briefcase v1.1 (Elo)", "elo", True, "knowledge_work", "aa-briefcase"),
    ("briefcase_elo_lo95", "briefcaseBreakdown.overall.lower95ci", "AA-Briefcase Elo lower 95% CI", "elo", True, "knowledge_work", "aa-briefcase"),
    ("briefcase_elo_hi95", "briefcaseBreakdown.overall.upper95ci", "AA-Briefcase Elo upper 95% CI", "elo", True, "knowledge_work", "aa-briefcase"),
    ("briefcase_rubric_pass", "briefcaseBreakdown.rubricPassRate", "AA-Briefcase rubric pass rate", "frac", True, "knowledge_work", "aa-briefcase"),
    ("briefcase_analytical_elo", "briefcaseBreakdown.analyticalQuality.elo", "AA-Briefcase analytical quality (Elo)", "elo", True, "knowledge_work", "aa-briefcase"),
    ("briefcase_presentation_elo", "briefcaseBreakdown.presentation.elo", "AA-Briefcase presentation (Elo)", "elo", True, "knowledge_work", "aa-briefcase"),
    ("gdpval_elo", "gdpval", "GDPval-AA v2.1 (Elo)", "elo", True, "knowledge_work", "gdpval-aa"),
    ("gdpval_elo_lo", "gdpvalInterval.lower", "GDPval-AA Elo lower CI", "elo", True, "knowledge_work", "gdpval-aa"),
    ("gdpval_elo_hi", "gdpvalInterval.upper", "GDPval-AA Elo upper CI", "elo", True, "knowledge_work", "gdpval-aa"),
    ("gdp_pdf_all_pass", "gdpPdfAllPass", "GDP.pdf (all pass)", "frac", True, "knowledge_work", "gdp-pdf"),
    ("harvey_lab", "harveyLab", "Harvey LAB-AA v1.1 (legal)", "frac", True, "knowledge_work", "harvey-lab-aa"),
    ("healthbench", "healthbench", "HealthBench", "frac", True, "health", "healthbench"),
    ("healthbench_professional", "healthbenchProfessional", "HealthBench Professional", "frac", True, "health", "healthbench"),
    # --- Coste (Intelligence Index)
    ("cost_per_task_usd", "intelligenceIndexCostPerTask.cost.total", "Coste por tarea del Index (USD)", "usd", False, "cost", None),
    ("cost_per_task_input", "intelligenceIndexCostPerTask.cost.nonCacheInput", "Coste/tarea: input sin caché", "usd", False, "cost", None),
    ("cost_per_task_cache_read", "intelligenceIndexCostPerTask.cost.cacheRead", "Coste/tarea: cache hit", "usd", False, "cost", None),
    ("cost_per_task_cache_write", "intelligenceIndexCostPerTask.cost.cacheWrite", "Coste/tarea: cache write", "usd", False, "cost", None),
    ("cost_per_task_reasoning", "intelligenceIndexCostPerTask.cost.reasoning", "Coste/tarea: reasoning", "usd", False, "cost", None),
    ("cost_per_task_answer", "intelligenceIndexCostPerTask.cost.answer", "Coste/tarea: answer", "usd", False, "cost", None),
    ("cost_index_total_usd", "intelligenceIndexCost.total", "Coste total de correr el Index (USD)", "usd", False, "cost", None),
    ("briefcase_total_cost_usd", "briefcaseTotalCost", "Coste total AA-Briefcase (USD)", "usd", False, "cost", None),
    # --- Tokens
    ("output_tokens_per_task", "intelligenceIndexOutputTokensPerTask.output", "Tokens de salida por tarea", "tok", False, "tokens", None),
    ("reasoning_tokens_per_task", "intelligenceIndexOutputTokensPerTask.reasoning", "Tokens de reasoning por tarea", "tok", False, "tokens", None),
    ("answer_tokens_per_task", "intelligenceIndexOutputTokensPerTask.answer", "Tokens de respuesta por tarea", "tok", False, "tokens", None),
    ("index_total_output_tokens", "canonicalIntelligenceIndexTokenCount.output", "Tokens de salida totales (Index)", "tok", False, "tokens", None),
    ("index_total_input_tokens", "canonicalIntelligenceIndexTokenCount.input", "Tokens de entrada totales (Index)", "tok", False, "tokens", None),
    # --- Tiempo / velocidad
    ("time_per_task_s", "intelligenceIndexTimePerTask", "Tiempo por tarea del Index (s)", "s", False, "speed", None),
    ("output_speed_tps", "headline.outputSpeed", "Velocidad de salida (tokens/s)", "tok/s", True, "speed", None),
    ("ttft_s", "headline.timeToFirstToken", "Time to first token (s)", "s", False, "speed", None),
    ("ttfat_s", "headline.timeToFirstAnswerToken", "Time to first answer token (s)", "s", False, "speed", None),
    ("e2e_time_s", "endToEndTime", "End-to-end response time (s)", "s", False, "speed", None),
    ("ttft_multiturn_s", "multiTurn.timeToFirstToken", "TTFT multi-turn (s)", "s", False, "speed", None),
    ("ttft_1k_s", "workloads.1k.timeToFirstToken", "TTFT con prompt 1k (s)", "s", False, "speed", None),
    ("ttft_10k_s", "workloads.10k.timeToFirstToken", "TTFT con prompt 10k (s)", "s", False, "speed", None),
    ("ttft_100k_s", "workloads.100k.timeToFirstToken", "TTFT con prompt 100k (s)", "s", False, "speed", None),
    # --- Precios
    ("price_input_1m", "price1mInputTokens", "Precio input (USD/1M)", "usd/1M", False, "price", None),
    ("price_output_1m", "price1mOutputTokens", "Precio output (USD/1M)", "usd/1M", False, "price", None),
    ("price_cache_hit_1m", "cacheHitPrice", "Precio cache hit (USD/1M)", "usd/1M", False, "price", None),
    ("price_cache_write_1m", "cacheWritePrice", "Precio cache write (USD/1M)", "usd/1M", False, "price", None),
    ("price_blended_3to1", "price1mBlended0To3To1", "Precio blended 3:1 (USD/1M)", "usd/1M", False, "price", None),
    ("context_window", "contextWindowTokens", "Ventana de contexto (tokens)", "tok", True, "spec", None),
    # --- Personalidad/estilo (solo variantes max)
    ("personality_slop", "personalityBench.indexScores.slop", "PersonalityBench: slop", "index", False, "style", "aa-personalitybench"),
    ("personality_informativeness", "personalityBench.indexScores.informativeness", "PersonalityBench: informativeness", "index", True, "style", "aa-personalitybench"),
    ("personality_transparency", "personalityBench.indexScores.transparency", "PersonalityBench: transparency", "index", True, "style", "aa-personalitybench"),
    ("personality_organization", "personalityBench.indexScores.organization", "PersonalityBench: organization", "index", True, "style", "aa-personalitybench"),
    ("personality_conviction", "personalityBench.indexScores.conviction", "PersonalityBench: conviction", "index", True, "style", "aa-personalitybench"),
    ("personality_sycophantic", "personalityBench.scores.sycophantic", "PersonalityBench: sycophantic", "index", False, "style", "aa-personalitybench"),
]


def fetch(url, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # noqa: BLE001
            if i == retries - 1:
                raise
            print(f"  reintento {url}: {e}", file=sys.stderr)
            time.sleep(3)


def flight_text(html):
    """Concatena los fragmentos self.__next_f.push([1,"..."]) de Next.js."""
    out = []
    for c in re.findall(r"self\.__next_f\.push\((\[.*?\])\)</script>", html, re.S):
        try:
            arr = json.loads(c)
        except json.JSONDecodeError:
            continue
        if len(arr) > 1 and isinstance(arr[1], str):
            out.append(arr[1])
    return "".join(out)


def enclosing_objects(text, key):
    """Devuelve los objetos JSON que contienen la clave `key`."""
    dec, res = json.JSONDecoder(), []
    for m in re.finditer(re.escape(f'"{key}":'), text):
        depth, i = 0, m.start()
        while i > 0:
            i -= 1
            c = text[i]
            if c == "}":
                depth += 1
            elif c == "{":
                if depth == 0:
                    break
                depth -= 1
        try:
            obj, _ = dec.raw_decode(text, i)
            res.append(obj)
        except json.JSONDecodeError:
            pass
    return res


def get_path(obj, path):
    for p in path.split("."):
        if not isinstance(obj, dict) or p not in obj:
            return None
        obj = obj[p]
    return obj


def flatten(obj, prefix=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from flatten(v, f"{prefix}{k}.")
    elif not isinstance(obj, list):
        yield prefix[:-1], obj


def main():
    DATA.mkdir(exist_ok=True)
    RAW.mkdir(exist_ok=True)

    # 1) Catálogo de evaluaciones
    print("Descargando catálogo de evaluaciones…")
    ev_text = flight_text(fetch(f"{BASE}/evaluations"))
    catalog = {}
    for o in enclosing_objects(ev_text, "summary"):
        if "slug" in o:
            catalog[o["slug"]] = {
                "slug": o["slug"], "name": o.get("name"), "summary": o.get("summary"),
                "url": f"{BASE}/evaluations/{o['slug']}",
                "skills": o.get("skills"), "knowledge": o.get("knowledge"), "attributes": o.get("attributes"),
            }
    domain_indices = [
        {k: o.get(k) for k in ("name", "shortName", "description")}
        for o in enclosing_objects(ev_text, "description") if "shortName" in o and "Index" in str(o.get("name"))
    ]

    # 2) Registros por modelo/effort
    models = []
    for fam_slug, (provider, display, family, version, efforts) in FAMILIES.items():
        for effort, suffix in efforts:
            slug = fam_slug + suffix
            print(f"Descargando {slug}…")
            txt = flight_text(fetch(f"{BASE}/models/{slug}"))
            cands = [o for o in enclosing_objects(txt, "intelligenceIndexEvaluations") if o.get("slug") == slug]
            if not cands:
                print(f"  ¡AVISO! sin registro para {slug}", file=sys.stderr)
                continue
            rec = max(cands, key=len)
            (RAW / f"{slug}.json").write_text(json.dumps(rec, indent=1, ensure_ascii=False))
            models.append({
                "slug": slug, "provider": provider, "family": family, "version": version, "effort": effort,
                "display": display,
                "effort_level": get_path(rec, "effort.level"),
                "label": f"{display} ({effort})",
                "url": f"{BASE}/models/{slug}",
                "record": rec,
            })
            time.sleep(1)

    # 3) Mega JSON
    metric_defs = [
        {"column": c, "path": p, "name": n, "unit": u, "higher_is_better": h, "category": cat, "evaluation": ev}
        for c, p, n, u, h, cat, ev in METRICS
    ]
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    mega = {
        "meta": {
            "source": "Artificial Analysis (https://artificialanalysis.ai)",
            "method": "Extraído del payload Next.js de /models/<slug> y /evaluations",
            "fetched_at": now,
            "intelligence_index_version": catalog.get("artificial-analysis-intelligence-index", {}).get("name"),
            "units": {"index": "0-100", "frac": "0-1 (multiplica por 100 para %)", "elo": "Elo",
                      "usd": "USD", "s": "segundos", "tok": "tokens", "tok/s": "tokens/segundo",
                      "usd/1M": "USD por millón de tokens"},
            "notes": [
                "El slug base es el effort por defecto: max en Claude y GPT (p.ej. claude-opus-5-5, gpt-6-1-sol), high en Gemini 4 Carbon.",
                "aa3dElo, code2videoElo y personalityBench solo existen para algunas variantes (sobre todo max).",
                "time_per_task_s = tokens de salida por tarea / velocidad de salida.",
            ],
        },
        "evaluations": catalog,
        "domain_indices": domain_indices,
        "metrics": metric_defs,
        "models": [
            {**{k: v for k, v in m.items() if k != "record"},
             "metrics": {c: get_path(m["record"], p) for c, p, *_ in METRICS},
             "index_evaluations": m["record"].get("intelligenceIndexEvaluations"),
             "record": m["record"]}
            for m in models
        ],
    }
    (DATA / "aa_models.json").write_text(json.dumps(mega, indent=1, ensure_ascii=False))

    # 4) CSV plano: métricas curadas primero, luego todo lo demás aplanado
    curated_paths = {p for _, p, *_ in METRICS}
    extra_keys = []
    for m in models:
        for k, _ in flatten(m["record"]):
            if k not in curated_paths and k not in extra_keys and not k.startswith("creator."):
                extra_keys.append(k)
    id_cols = ["slug", "provider", "family", "version", "effort", "effort_level", "label"]
    with open(DATA / "models_flat.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(id_cols + [c for c, *_ in METRICS] + ["raw." + k for k in extra_keys])
        for m in models:
            r = m["record"]
            w.writerow([m[c] for c in id_cols]
                       + [get_path(r, p) for _, p, *_ in METRICS]
                       + [get_path(r, k) for k in extra_keys])

    # 5) CSV largo de evaluaciones del Index
    with open(DATA / "index_evals_long.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["slug", "provider", "family", "effort", "evaluation", "evaluation_name", "score",
                    "output_tokens_per_task", "cost_per_task_usd", "time_per_task_s", "weighted_cost_per_task_usd"])
        for m in models:
            weighted = {e["slug"]: e.get("weightedCostPerTask")
                        for e in get_path(m["record"], "intelligenceIndexCostPerTask.evaluations") or []}
            for e in m["record"].get("intelligenceIndexEvaluations") or []:
                w.writerow([m["slug"], m["provider"], m["family"], m["effort"], e["slug"],
                            catalog.get(e["slug"], {}).get("name"), e.get("score"),
                            e.get("outputTokensPerTask"), e.get("costPerTask"), e.get("timePerTask"),
                            weighted.get(e["slug"])])

    # 6) Catálogo de métricas en CSV
    with open(DATA / "benchmarks.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["column", "name", "unit", "higher_is_better", "category", "evaluation_slug",
                    "evaluation_summary", "n_models_with_data"])
        for c, p, n, u, h, cat, ev in METRICS:
            nn = sum(get_path(m["record"], p) is not None for m in models)
            w.writerow([c, n, u, h, cat, ev, (catalog.get(ev) or {}).get("summary"), nn])

    print(f"\nOK: {len(models)} modelos, {len(catalog)} evaluaciones en catálogo -> {DATA}")

    # 7) Datos para la web local (web/data.js)
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import build_web
    build_web.main()


if __name__ == "__main__":
    main()
