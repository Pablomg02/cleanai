// Configuración editable de la web: grupos de tareas y presets.
// Para cada grupo: metrics = [[id_de_métrica, peso], ...]. Los ids están en
// data/benchmarks.csv (columna "column"), o son evcost__<eval> / evtime__<eval>
// (coste y tiempo por benchmark) o ext_* (data/external_benchmarks.json).
//
// La puntuación de un grupo (0–100) es la media ponderada de cada benchmark
// normalizado entre el peor (0) y el mejor (100) modelo del dataset. Si en un
// benchmark "menos es mejor", se invierte. Los costes y tiempos se normalizan
// en escala logarítmica. Un benchmark solo entra en la nota si lo tienen al
// menos la mitad de los modelos, salvo que actives "incluir datos parciales".

window.AA_CONFIG = {
  families: {
    // color (paleta validada para daltonismo) + forma del marcador
    "Fable":         { color: "#4a3aa7", shape: "circle" },
    "Opus":          { color: "#e34948", shape: "diamond" },
    "Sonnet":        { color: "#2a78d6", shape: "square" },
    "Haiku":         { color: "#1baf7a", shape: "triangle" },
    "Gemini Carbon": { color: "#eda100", shape: "hexagon", short: "Carbon" },
    // OpenAI: los 3 tonos libres de la paleta + el azul claro; validado con los 5
    // anteriores (ΔE normal ≥ 12,6). La forma distingue los pares más parecidos.
    "GPT Astra":     { color: "#008300", shape: "star", short: "Astra" },
    "GPT Sol":       { color: "#e87ba4", shape: "pentagon", short: "Sol" },
    "GPT Terra":     { color: "#9085e9", shape: "cross", short: "Terra" },
    "GPT Luna":      { color: "#86b6ef", shape: "triangle-down", short: "Luna" },
  },
  // Empresas (campo provider de cada modelo): nombre en la barra y abreviatura en móvil.
  // Las familias se agrupan por empresa en el orden de "families".
  // color: el de la empresa en las gráficas de suscripciones (allí cada familia solo
  // cambia de forma). Paleta validada para daltonismo (ΔE CVD ≥ 15, normal ≥ 20).
  companies: {
    Anthropic: { name: "Anthropic", abbr: "A", color: "#e34948" },
    Google:    { name: "Google",    abbr: "G", color: "#eda100" },
    OpenAI:    { name: "OpenAI",    abbr: "O", color: "#2a78d6" },
  },
  efforts: ["max", "xhigh", "high", "medium", "low"],
  coverageThreshold: 0.5,

  groups: [
    { id: "software", short: "Software", icon: "code", name: "Ingeniería de software",
      desc: "Programar como agente: implementar, refactorizar y resolver tareas reales en repositorios y terminal.",
      metrics: [["frontiercode_2_0", 1.5], ["terminal_bench_4_0", 1.5], ["frontiercode_1_1", 0.5], ["ext_swe_bench_pro", 1]] },
    { id: "bugs", short: "Bugs y ciber", icon: "bug", name: "Bugs y ciberseguridad",
      desc: "Encontrar, reproducir y parchear fallos y vulnerabilidades. Artificial Analysis no mide ciberseguridad: la nota usa proxies (terminal, código agéntico). CyberBench y CWE-bench son externos y parciales.",
      metrics: [["ext_cyberbench", 2], ["ext_cwe_bench", 1], ["terminal_bench_4_0", 1], ["itbench_sre", 1], ["frontiercode_2_0", 0.5]] },
    { id: "agents", short: "Agentes", icon: "bolt", name: "Agentes y automatización",
      desc: "Completar flujos largos con herramientas: SaaS, terminal, incidencias SRE, hojas de cálculo.",
      metrics: [["automationbench", 1.5], ["terminal_bench_4_0", 1], ["briefcase_elo", 1], ["itbench_sre", 1], ["analyst_agent", 1]] },
    { id: "science", short: "Ciencia", icon: "flask", name: "Investigación científica",
      desc: "Flujos de investigación, física de nivel investigador, código científico y conocimiento experto.",
      metrics: [["terminal_bench_science", 1.5], ["critpt_v2_hard", 1], ["scicode", 1], ["critpt_v1", 0.5], ["hle_diamond", 0.5], ["vials", 1], ["mka_climb_wsr", 0.5]] },
    { id: "reasoning", short: "Razonamiento", icon: "brain", name: "Razonamiento experto",
      desc: "Preguntas de frontera en matemáticas, ciencia y humanidades que requieren razonamiento profundo.",
      metrics: [["hle_diamond", 1.5], ["hle", 1], ["critpt_v2_hard", 0.5], ["omniscience_accuracy", 0.5]] },
    { id: "qa", short: "Dudas fiables", icon: "shield", name: "Consulta de dudas fiable",
      desc: "Responder preguntas factuales sin inventar: precisión, alucinación y saber decir «no lo sé».",
      metrics: [["omniscience_index", 1.5], ["omniscience_hallucination_rate", 1], ["omniscience_accuracy", 1], ["hle_diamond", 0.5]] },
    { id: "consulting", short: "Consultoría", icon: "briefcase", name: "Consultoría y asesoramiento",
      desc: "Trabajo de conocimiento de largo recorrido: informes, análisis, estrategia y entregables profesionales.",
      metrics: [["briefcase_elo", 1.5], ["gdpval_elo", 1], ["cap_strategy_ops", 1], ["briefcase_rubric_pass", 0.5], ["gdp_pdf_all_pass", 0.5]] },
    { id: "engineering", short: "Ing. técnica", icon: "gear", name: "Ingeniería técnica",
      desc: "Ingeniería civil, eléctrica y mecánica: diseño, análisis, cálculo y documentación técnica.",
      metrics: [["cap_engineering", 2], ["scicode", 0.5], ["terminal_bench_science", 0.5]] },
    { id: "finance", short: "Finanzas", icon: "chart", name: "Finanzas y economía",
      desc: "Contabilidad, finanzas corporativas, análisis económico y modelado cuantitativo.",
      metrics: [["cap_finance_accounting", 1.5], ["cap_economics", 1], ["gdp_pdf_all_pass", 0.5], ["analyst_agent", 0.5]] },
    { id: "legal", short: "Legal", icon: "scale", name: "Legal",
      desc: "Contratos, investigación jurídica, redacción y revisión de cumplimiento.",
      metrics: [["cap_legal", 1.5], ["harvey_lab", 1]] },
    { id: "health", short: "Salud", icon: "pulse", name: "Salud y medicina",
      desc: "Conocimiento clínico, conversaciones de salud y razonamiento sobre historiales médicos largos.",
      metrics: [["cap_healthcare_medical", 1.5], ["mlcr", 1], ["healthbench", 1], ["healthbench_professional", 1]] },
    { id: "docs", short: "Documentos", icon: "doc", name: "Documentos y contexto largo",
      desc: "Leer, cruzar y sintetizar documentos muy largos, PDFs y expedientes fragmentados.",
      metrics: [["lcr", 1.5], ["mlcr", 1], ["gdp_pdf_all_pass", 1]] },
    { id: "visual", short: "Visual", icon: "eye", name: "Visual y multimodal",
      desc: "Entender imágenes y crear experiencias visuales: 3D, vídeo, presentaciones. Casi todo con datos parciales.",
      metrics: [["briefcase_presentation_elo", 1], ["mmmu_pro", 1], ["aa3d_elo", 1], ["code2video_elo", 1]] },
    { id: "efficiency", short: "Eficiencia", icon: "gauge", name: "Eficiencia",
      desc: "Barato y rápido: coste y tiempo por tarea, velocidad de salida y precio por token.",
      metrics: [["cost_per_task_usd", 1.5], ["time_per_task_s", 1], ["output_speed_tps", 0.5], ["price_blended_3to1", 0.5]] },
  ],

  scatterPresets: [
    { name: "Inteligencia vs coste", x: "cost_per_task_usd", y: "intelligence_index" },
    { name: "Inteligencia vs tiempo", x: "time_per_task_s", y: "intelligence_index" },
    { name: "Inteligencia vs precio", x: "price_blended_3to1", y: "intelligence_index" },
    { name: "Software vs coste", x: "cost_per_task_usd", y: "grp__software" },
    { name: "Terminal-Bench vs su coste", x: "evcost__terminalbench-4-0", y: "terminal_bench_4_0" },
    { name: "Ciencia vs coste", x: "cost_per_task_usd", y: "grp__science" },
    { name: "Precisión vs alucinación", x: "omniscience_hallucination_rate", y: "omniscience_accuracy" },
    { name: "Consultoría vs coste", x: "evcost__aa-briefcase", y: "grp__consulting" },
    { name: "Velocidad vs inteligencia", x: "output_speed_tps", y: "intelligence_index" },
    { name: "Tokens vs inteligencia", x: "output_tokens_per_task", y: "intelligence_index" },
  ],

  weightPresets: [
    { name: "Código barato", criteria: [["grp__software", 50], ["cost_per_task_usd", 50]] },
    { name: "Investigador", criteria: [["grp__science", 60], ["grp__qa", 30], ["cost_per_task_usd", 10]] },
    { name: "Dudas rápidas y fiables", criteria: [["grp__qa", 50], ["e2e_time_s", 30], ["price_blended_3to1", 20]] },
    { name: "Consultor", criteria: [["grp__consulting", 60], ["grp__docs", 20], ["cost_per_task_usd", 20]] },
    { name: "Caza de bugs", criteria: [["grp__bugs", 60], ["grp__software", 20], ["cost_per_task_usd", 20]] },
    { name: "Equilibrado", criteria: [["intelligence_index", 40], ["cost_per_task_usd", 30], ["time_per_task_s", 30]] },
  ],

  quickQuestions: [
    { q: "¿El más inteligente?", m: "intelligence_index" },
    { q: "¿El más barato por tarea?", m: "cost_per_task_usd" },
    { q: "¿El que acaba antes?", m: "time_per_task_s" },
    { q: "¿El que menos alucina?", m: "omniscience_hallucination_rate" },
    { q: "¿El mejor programando?", m: "grp__software" },
    { q: "¿El mejor investigando?", m: "grp__science" },
    { q: "¿El que genera más rápido?", m: "output_speed_tps" },
    { q: "¿El de menor latencia?", m: "ttft_s" },
    { q: "¿El token más barato?", m: "price_blended_3to1" },
  ],

  // Escala de precios: los costes (USD de API en Artificial Analysis) se pueden ver
  // en € de API o en € de suscripción. Factor de suscripción para un modelo:
  //   € = USD_API × precio_eur / (api_usd_mes × multiplicador_del_modelo × uso_del_límite)
  // api_usd_mes = USD de API que rinde el plan al mes si se agota el límite semanal
  // (low / mid / high). Son ESTIMACIONES de terceros: ningún proveedor lo publica.
  // Investigado el 2026-11-11; detalle y fuentes en data/subscriptions_research.md.
  pricing: {
    fxUsdPerEur: 1.1214, fxDate: "2026-11-10 (BCE)",
    defaults: { Anthropic: "claude-max", Google: "google-ai-ultra-5x", OpenAI: "chatgpt-pro-100" },
    // Niveles de precio para la gráfica de suscripciones de la portada (el primero es el inicial)
    homeTiers: [
      { id: "20", name: "≈ 20 €/mes", plans: ["claude-pro", "chatgpt-plus"],
        note: "Google AI Pro (21,99 €) no aparece: no incluye Gemini 4 Carbon, el único modelo de Google en los datos." },
      { id: "100", name: "≈ 100 €/mes", plans: ["claude-max", "google-ai-ultra-5x", "chatgpt-pro-100"] },
    ],
    // Por proveedor: título del selector de plan y familia de referencia para la portada
    providers: {
      Anthropic: { label: "Plan de Claude", ref: "Opus", refName: "Opus" },
      Google: { label: "Plan de Google (Gemini)", ref: "Gemini Carbon", refName: "Gemini" },
      OpenAI: { label: "Plan de ChatGPT", ref: "GPT Sol", refName: "GPT-6.1 Sol" },
    },
    // Valor por unidad de límite respecto al modelo de referencia de cada proveedor
    // (Fable gasta el límite ~2,5× más rápido que Opus; Astra rinde ~1,4× más que GPT-6.1 Sol)
    modelMult: { Fable: 0.4, "GPT Astra": 1.4 },
    multNote: "Fable gasta el límite unas 2,5 veces más rápido que Opus, y GPT-6 Astra rinde unas 1,4 veces más API por unidad de límite que GPT-6.1 Sol (estimaciones).",
    plans: [
      { id: "claude-pro", provider: "Anthropic", name: "Claude Pro", short: "Pro", priceEur: 21.78,
        api: { low: 600, mid: 850, high: 1200 }, payg: ["Fable"], confidence: "media",
        note: "Fable no está incluido: se paga aparte a precio de API." },
      { id: "claude-max", provider: "Anthropic", name: "Claude Max", short: "Max", priceEur: 108.9,
        api: { low: 3000, mid: 4350, high: 5825 }, confidence: "media",
        note: "Antes «Max 5x». 5× el límite de Pro + 100 $/mes de créditos de API. Fable, máximo el 50 % del límite semanal." },
      { id: "claude-ultra", provider: "Anthropic", name: "Claude Ultra", short: "Ultra", priceEur: 217.8,
        api: { low: 5800, mid: 8700, high: 11926 }, confidence: "media",
        note: "Antes «Max 20x». 10× el límite semanal de Pro, sin límite de 5 h + 200 $/mes de créditos de API." },
      { id: "google-ai-ultra-5x", provider: "Google", name: "Google AI Ultra", short: "AI Ultra", priceEur: 99.99,
        api: { low: 300, mid: 750, high: 2000 }, confidence: "baja",
        note: "Plan de 99,99 € (5× AI Pro). Sin mediciones públicas: supone la misma proporción que AI Pro. AI Pro no incluye Gemini 4 Carbon." },
      { id: "google-ai-ultra-20x", provider: "Google", name: "Google AI Ultra 20x", short: "AI Ultra 20x", priceEur: 219.99,
        api: { low: 1200, mid: 3000, high: 8000 }, confidence: "baja",
        note: "20× AI Pro por 10× su precio: se supone el doble de rendimiento por €. Sin mediciones públicas." },
      // OpenAI: valores de referencia con GPT-6.1 Sol. Desde el 29/10/2026 Pro rinde ~2× más por $ que Plus.
      // ChatGPT Go no se incluye: solo da GPT-6 Luna.
      { id: "chatgpt-plus", provider: "OpenAI", name: "ChatGPT Plus", short: "Plus", priceEur: 23,
        api: { low: 150, mid: 211, high: 285 }, confidence: "media",
        note: "Incluye los cuatro modelos (Astra, Sol 6.1 y Terra 6.1 solo en Codex y Work), con límite cada 5 horas y semanal. Según SemiAnalysis, el tope equivale a unos 211 $ al mes de API con GPT-6.1 Sol." },
      { id: "chatgpt-pro-100", provider: "OpenAI", name: "ChatGPT Pro 100", short: "Pro 100", priceEur: 103,
        api: { low: 1990, mid: 2210, high: 3380 }, confidence: "media-baja",
        note: "10 veces el uso de Plus desde el 29/10/2026, sin límite de 5 horas y con 100 $ al mes de créditos de API. Supone que la duplicación de límites de octubre es permanente." },
      { id: "chatgpt-pro-200", provider: "OpenAI", name: "ChatGPT Pro 200", short: "Pro 200", priceEur: 229,
        api: { low: 3980, mid: 4420, high: 6760 }, confidence: "media-baja",
        note: "20 veces el uso de Plus, sin límite de 5 horas y con 200 $ al mes de créditos de API. Misma relación precio/uso que Pro 100, pero más caro en España." },
      { id: "chatgpt-pro-500", provider: "OpenAI", name: "ChatGPT Pro 500", short: "Pro 500", priceEur: 510,
        api: { low: 9950, mid: 11050, high: 16900 }, confidence: "baja",
        note: "50 veces el uso de Plus (múltiplo no confirmado oficialmente), con 500 $ de créditos de API y modo Ultrafast, que gasta el límite 8 veces más rápido." },
    ],
    sources: [
      ["Precios de Claude", "https://claude.com/pricing"],
      ["wokey.ai: límites de Claude (nov 2026)", "https://wokey.ai/claude-usage-limits"],
      ["SemiAnalysis vía bestcadpapers (oct 2026)", "https://bestcadpapers.com/software-qa-development/what-semianalysis-found-about-the-5x-and-ai-subscription-prices/"],
      ["Cambios en Max y Ultra (nov 2026)", "https://www.buildmvpfast.com/blog/claude-max-plan-changes-ultra-5-hour-limit-2026"],
      ["finopsllm: Max 20x vs 5x (oct 2026)", "https://finopsllm.com/research/claude-max-20x-vs-5x-weekly-limit"],
      ["Suscripciones de Google AI", "https://gemini.google/es/subscriptions/"],
      ["Gemini 4 Carbon en AI Ultra (nov 2026)", "https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-carbon-now-available/"],
      ["Precios y límites de ChatGPT y Codex", "https://learn.chatgpt.com/docs/pricing"],
      ["Créditos de API en ChatGPT Pro", "https://developers.openai.com/api/docs/guides/chatgpt-api-credits"],
      ["InventiveHQ: uso de Codex medido (oct 2026)", "https://inventivehq.com/blog/codex-subscription-usage-measured"],
      ["Límites de Pro duplicados (oct 2026)", "https://www.bleepingcomputer.com/news/artificial-intelligence/openai-doubles-chatgpt-pro-usage-limits-after-backlash-over-planned-50-percent-cut/"],
      ["Precio de ChatGPT en España", "https://geotoolbox.ai/es/blog/precio-chatgpt"],
    ],
  },
};
