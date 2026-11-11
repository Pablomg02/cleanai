#!/usr/bin/env python3
"""Genera web/data.js a partir de data/aa_models.json y data/external_benchmarks.json.

Uso (desde la raíz del proyecto):  python3 scripts/build_web.py
fetch_aa.py lo llama automáticamente al terminar.

Los datos van en un .js (window.AA_DATA = ...) y no en un .json para que
web/index.html funcione abriéndolo con doble clic (file://), sin servidor.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
WEB = ROOT / "web"

# Nombres cortos para ejes, selectores y leyendas
SHORT = {
    "intelligence_index": "Intelligence Index",
    "cap_engineering": "Engineering Index",
    "cap_economics": "Economics Index",
    "cap_finance_accounting": "Finance & Accounting Index",
    "cap_strategy_ops": "Strategy & Ops Index",
    "cap_legal": "Legal Index",
    "cap_healthcare_medical": "Healthcare Index",
    "terminal_bench_4_0": "Terminal-Bench 4.0",
    "frontiercode_2_0": "FrontierCode 2.0",
    "frontiercode_1_1": "FrontierCode 1.1",
    "scicode": "SciCode",
    "automationbench": "AutomationBench",
    "itbench_sre": "ITBench (SRE)",
    "analyst_agent": "AnalystAgent",
    "code2video_elo": "Code2Video (Elo)",
    "aa3d_elo": "AA-3D (Elo)",
    "terminal_bench_science": "Terminal-Bench Science",
    "hle_diamond": "HLE-Diamond",
    "hle": "Humanity's Last Exam",
    "critpt_v2_hard": "CritPt v2 Hard",
    "critpt_v1": "CritPt v1",
    "mka_climb_wsr": "MKA",
    "vials": "VIALS",
    "mmmu_pro": "MMMU-Pro",
    "omniscience_index": "Omniscience Index",
    "omniscience_accuracy": "Omniscience: precisión",
    "omniscience_hallucination_rate": "Tasa de alucinación",
    "lcr": "AA-LCR (contexto largo)",
    "mlcr": "MLCR (contexto largo)",
    "briefcase_elo": "Briefcase (Elo)",
    "briefcase_rubric_pass": "Briefcase: rúbrica",
    "briefcase_analytical_elo": "Briefcase: análisis (Elo)",
    "briefcase_presentation_elo": "Briefcase: presentación (Elo)",
    "gdpval_elo": "GDPval (Elo)",
    "gdp_pdf_all_pass": "GDP.pdf",
    "harvey_lab": "Harvey LAB (legal)",
    "healthbench": "HealthBench",
    "healthbench_professional": "HealthBench Pro",
    "cost_per_task_usd": "Coste por tarea",
    "cost_per_task_input": "Coste/tarea: input",
    "cost_per_task_cache_read": "Coste/tarea: cache hit",
    "cost_per_task_cache_write": "Coste/tarea: cache write",
    "cost_per_task_reasoning": "Coste/tarea: reasoning",
    "cost_per_task_answer": "Coste/tarea: respuesta",
    "cost_index_total_usd": "Coste total del Index",
    "briefcase_total_cost_usd": "Coste total Briefcase",
    "output_tokens_per_task": "Tokens de salida/tarea",
    "reasoning_tokens_per_task": "Tokens reasoning/tarea",
    "answer_tokens_per_task": "Tokens respuesta/tarea",
    "index_total_output_tokens": "Tokens salida (Index)",
    "index_total_input_tokens": "Tokens entrada (Index)",
    "time_per_task_s": "Tiempo por tarea",
    "output_speed_tps": "Velocidad de salida",
    "ttft_s": "TTFT",
    "ttfat_s": "Primer token de respuesta",
    "e2e_time_s": "Tiempo de respuesta",
    "ttft_multiturn_s": "TTFT multi-turn",
    "ttft_1k_s": "TTFT prompt 1k",
    "ttft_10k_s": "TTFT prompt 10k",
    "ttft_100k_s": "TTFT prompt 100k",
    "price_input_1m": "Precio input",
    "price_output_1m": "Precio output",
    "price_cache_hit_1m": "Precio cache hit",
    "price_cache_write_1m": "Precio cache write",
    "price_blended_3to1": "Precio blended 3:1",
    "context_window": "Ventana de contexto",
    "personality_slop": "Personality: slop",
    "personality_informativeness": "Personality: informativo",
    "personality_transparency": "Personality: transparencia",
    "personality_organization": "Personality: organización",
    "personality_conviction": "Personality: convicción",
    "personality_sycophantic": "Personality: complaciente",
}

# Columnas que no se ofrecen como métrica propia; van como intervalo de otra
CI = {
    "briefcase_elo": ("briefcase_elo_lo95", "briefcase_elo_hi95"),
    "gdpval_elo": ("gdpval_elo_lo", "gdpval_elo_hi"),
}
HIDDEN = {c for pair in CI.values() for c in pair}

CATEGORY_ES = {
    "index": "Índices generales",
    "domain_index": "Índices por dominio",
    "coding_agentic": "Programación agéntica",
    "coding_science": "Programación científica",
    "coding_visual": "Programación visual",
    "agentic": "Agentes",
    "science": "Ciencia",
    "reasoning_knowledge": "Razonamiento y conocimiento",
    "multimodal": "Multimodal",
    "knowledge_reliability": "Fiabilidad factual",
    "long_context": "Contexto largo",
    "knowledge_work": "Trabajo de conocimiento",
    "health": "Salud",
    "security": "Ciberseguridad (externo)",
    "eval_cost": "Coste por benchmark",
    "eval_time": "Tiempo por benchmark",
    "cost": "Coste",
    "tokens": "Tokens",
    "speed": "Velocidad y latencia",
    "price": "Precio",
    "spec": "Especificaciones",
    "style": "Estilo (PersonalityBench)",
}

# Unidades en las que tiene sentido una escala logarítmica
LOG_UNITS = {"usd", "s", "tok", "usd/1M"}


def main():
    src = json.loads((DATA / "aa_models.json").read_text(encoding="utf-8"))
    ext_path = DATA / "external_benchmarks.json"
    ext = json.loads(ext_path.read_text(encoding="utf-8")) if ext_path.exists() else {"benchmarks": []}
    catalog = src["evaluations"]
    models_src = src["models"]

    metrics = []
    for m in src["metrics"]:
        col = m["column"]
        if col in HIDDEN:
            continue
        ev = catalog.get(m.get("evaluation") or "", {})
        metrics.append({
            "id": col,
            "name": m["name"],
            "short": SHORT.get(col, m["name"]),
            "unit": m["unit"],
            "hib": bool(m["higher_is_better"]),
            "cat": m["category"],
            "desc": ev.get("summary") or "",
            "source": "Artificial Analysis",
            "url": f"https://artificialanalysis.ai/evaluations/{m['evaluation']}" if m.get("evaluation") else "",
            "log": m["unit"] in LOG_UNITS,
            "ci": list(CI[col]) if col in CI else None,
        })

    # Coste y tiempo por tarea de cada benchmark del Intelligence Index
    eval_slugs = []
    for mm in models_src:
        for e in mm["index_evaluations"]:
            if e["slug"] not in eval_slugs:
                eval_slugs.append(e["slug"])
    for slug in eval_slugs:
        nm = catalog.get(slug, {}).get("name", slug)
        metrics.append({"id": f"evcost__{slug}", "name": f"{nm}: coste por tarea (USD)",
                        "short": f"Coste/tarea {nm}", "unit": "usd", "hib": False, "cat": "eval_cost",
                        "desc": f"Coste medio en USD de resolver una tarea de {nm} dentro del Intelligence Index.",
                        "source": "Artificial Analysis", "url": "", "log": True, "ci": None})
        metrics.append({"id": f"evtime__{slug}", "name": f"{nm}: tiempo por tarea (s)",
                        "short": f"Tiempo/tarea {nm}", "unit": "s", "hib": False, "cat": "eval_time",
                        "desc": f"Tiempo medio en segundos por tarea de {nm} dentro del Intelligence Index.",
                        "source": "Artificial Analysis", "url": "", "log": True, "ci": None})

    for b in ext["benchmarks"]:
        metrics.append({"id": b["id"], "name": b["name"], "short": b.get("short", b["name"]),
                        "unit": b["unit"], "hib": b["higher_is_better"], "cat": b["category"],
                        "desc": b.get("description", ""), "source": b.get("source", "externo"),
                        "url": b.get("url", ""), "log": False, "ci": None, "external": True,
                        "notes": b.get("notes", {})})

    models = []
    for mm in models_src:
        v = {k: val for k, val in mm["metrics"].items() if isinstance(val, (int, float)) and not isinstance(val, bool)}
        for e in mm["index_evaluations"]:
            if e.get("costPerTask") is not None:
                v[f"evcost__{e['slug']}"] = e["costPerTask"]
            if e.get("timePerTask") is not None:
                v[f"evtime__{e['slug']}"] = e["timePerTask"]
        for b in ext["benchmarks"]:
            if mm["slug"] in b["values"]:
                v[b["id"]] = b["values"][mm["slug"]]
        r = mm["record"]
        models.append({
            # Nombre largo para la web: "Opus 5.5", "Gemini 4 Carbon", "GPT-6.1 Sol"
            "slug": mm["slug"], "label": mm["label"], "provider": mm["provider"],
            "name": (mm.get("display") or mm["label"].rsplit(" (", 1)[0]).removeprefix("Claude "),
            "family": mm["family"], "version": mm["version"], "effort": mm["effort"],
            "effortLevel": mm["effort_level"], "url": mm["url"],
            "release": r.get("releaseDate"),
            "image": bool(r.get("inputModalityImage")),
            "v": v,
        })

    present = {k for m in models for k in m["v"]}
    metrics = [m for m in metrics if m["id"] in present]
    for m in metrics:
        m["n"] = sum(m["id"] in mo["v"] for mo in models)

    out = {
        "meta": {**src["meta"], "external_note": ext.get("_readme", "")},
        "categories": CATEGORY_ES,
        "metrics": metrics,
        "models": models,
    }
    WEB.mkdir(exist_ok=True)
    js = "// Generado por scripts/build_web.py. No editar a mano.\nwindow.AA_DATA = " + \
         json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (WEB / "data.js").write_text(js, encoding="utf-8")
    print(f"web/data.js: {len(models)} modelos, {len(metrics)} métricas")


if __name__ == "__main__":
    main()
