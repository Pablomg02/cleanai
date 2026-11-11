(() => {
  "use strict";

  const D = window.AA_DATA;
  const C = window.AA_CONFIG;
  if (!D || !C) {
    document.body.innerHTML = "<p style='padding:40px'>No encuentro data.js o config.js. Ejecuta <code>python3 scripts/build_web.py</code>.</p>";
    return;
  }

  /* ================= Utilidades ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const SVGNS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs = {}) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fwd = (v, log) => (log ? Math.log10(v) : v), back = (u, log) => (log ? Math.pow(10, u) : u);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const store = {
    get(k, d) { try { const v = localStorage.getItem("aa:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("aa:" + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
  };

  const nfCache = {};
  const nf = (d) => (nfCache[d] ||= new Intl.NumberFormat("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }));

  /* ================= Datos y métricas ================= */
  const MODELS = D.models;
  const N = MODELS.length;
  const METRICS = new Map(D.metrics.map((m) => [m.id, m]));
  const coreMin = Math.ceil(N * (C.coverageThreshold ?? 0.5));
  const FAM_ORDER = Object.keys(C.families);
  const EFF_SHORT = { max: "max", xhigh: "xhigh", high: "high", medium: "med", low: "low" };
  // Nombre corto de la familia (chips, etiquetas): config.js > families[f].short
  const famShort = (f) => (C.families[f] || {}).short || f;

  const val = (m, id) => {
    const v = m.v[id];
    return v === undefined || v === null || Number.isNaN(v) ? null : v;
  };

  // Estadísticas para normalizar (por defecto, sobre todos los modelos)
  const statCache = new Map();
  function stat(id, pool) {
    const key = pool ? null : id;
    if (key && statCache.has(key)) return statCache.get(key);
    const m = METRICS.get(id);
    const vals = (pool || MODELS).map((x) => val(x, id)).filter((v) => v !== null);
    const useLog = !!(m && m.log) && vals.length && vals.every((v) => v > 0);
    const t = vals.map((v) => (useLog ? Math.log10(v) : v));
    const s = { min: Math.min(...t), max: Math.max(...t), log: useLog, n: vals.length };
    if (key) statCache.set(key, s);
    return s;
  }
  function norm(id, v, pool) {
    if (v === null) return null;
    const m = METRICS.get(id);
    const s = stat(id, pool);
    const x = s.log ? Math.log10(v) : v;
    let t = s.max === s.min ? 1 : (x - s.min) / (s.max - s.min);
    t = clamp(t, 0, 1);
    if (!m.hib) t = 1 - t;
    return t * 100;
  }

  // Grupos de tareas como métricas derivadas
  const GROUPS = C.groups.map((g) => {
    const items = g.metrics.filter(([id]) => {
      if (!METRICS.has(id)) { console.warn(`Grupo ${g.id}: la métrica ${id} no existe en data.js`); return false; }
      return true;
    });
    return { ...g, items };
  });
  const GROUP = new Map(GROUPS.map((g) => [g.id, g]));

  function groupScore(model, g, partial = false) {
    let sw = 0, acc = 0;
    const parts = [];
    for (const [id, w] of g.items) {
      const m = METRICS.get(id);
      const core = m.n >= coreMin;
      const raw = val(model, id);
      const n = raw === null ? null : norm(id, raw);
      const used = (core || partial) && n !== null;
      parts.push({ id, w, raw, n, core, used });
      if (used) { sw += w; acc += w * n; }
    }
    const eligible = parts.filter((p) => p.core || partial).length;
    const usedN = parts.filter((p) => p.used).length;
    return { score: sw ? acc / sw : null, parts, eligible, usedN };
  }

  for (const g of GROUPS) {
    const id = "grp__" + g.id;
    for (const m of MODELS) {
      const r = groupScore(m, g);
      if (r.score !== null) m.v[id] = r.score;
    }
    METRICS.set(id, {
      id, name: "Grupo: " + g.name, short: g.name, unit: "score", hib: true, cat: "group",
      desc: g.desc, source: "Calculado", url: "", log: false, group: g,
      n: MODELS.filter((m) => val(m, id) !== null).length,
    });
  }

  /* ================= Escala de precios: $ de API, € de API o € de suscripción ================= */
  const PR = C.pricing || null;
  const PLAN = new Map(PR ? PR.plans.map((p) => [p.id, p]) : []);
  // Proveedores con planes, en el orden de config.js; y los que solo tienen estimaciones de confianza baja
  const PROVIDERS = PR ? [...new Set(PR.plans.map((p) => p.provider))] : [];
  if (PR) PR.providers ||= {};
  const lowConf = PROVIDERS.filter((prov) => PR.plans.filter((p) => p.provider === prov).every((p) => p.confidence === "baja"));
  const MONEY = [...METRICS.values()].filter((m) => m.unit === "usd" || m.unit === "usd/1M").map((m) => m.id);
  for (const m of MODELS) { m.raw = {}; for (const id of MONEY) m.raw[id] = m.v[id]; }
  for (const id of MONEY) METRICS.get(id).name0 = METRICS.get(id).name;
  const PRICE = Object.assign({ mode: PR ? "sub" : "usd", est: "mid", use: 1 }, store.get("price", {}));
  PRICE.plan = Object.assign({}, PR ? PR.defaults : {}, PRICE.plan || {});
  if (!PR) PRICE.mode = "usd";
  const curSym = () => (PRICE.mode === "usd" ? "$" : "€");
  const priceTag = () => ({ usd: "$ de API", eur: "€ de API", sub: "€ de suscripción" })[PRICE.mode];
  const isMoney = (id) => MONEY.includes(id);
  // Multiplicador de un modelo: USD de API → unidad mostrada
  function priceFactor(m) {
    if (PRICE.mode === "usd") return 1;
    const toEur = 1 / PR.fxUsdPerEur;
    if (PRICE.mode === "eur") return toEur;
    const plan = PLAN.get(PRICE.plan[m.provider]);
    if (!plan || (plan.payg || []).includes(m.family)) return toEur; // fuera del plan: se paga a precio de API
    const mult = (PR.modelMult || {})[m.family] ?? 1;
    return plan.priceEur / (plan.api[PRICE.est] * mult * PRICE.use);
  }
  // € de API que rinde 1 € de suscripción para una familia
  function planYield(plan, family) {
    if ((plan.payg || []).includes(family)) return 1;
    const mult = (PR.modelMult || {})[family] ?? 1;
    return plan.api[PRICE.est] * mult * PRICE.use / PR.fxUsdPerEur / plan.priceEur;
  }
  function applyPrice() {
    for (const m of MODELS) {
      const f = priceFactor(m);
      for (const id of MONEY) if (m.raw[id] != null) m.v[id] = m.raw[id] * f;
    }
    statCache.clear();
    for (const g of GROUPS) {
      const id = "grp__" + g.id;
      for (const m of MODELS) { const r = groupScore(m, g); if (r.score !== null) m.v[id] = r.score; else delete m.v[id]; }
    }
    const unit = { usd: "USD", eur: "€ de API", sub: "€ de suscripción" }[PRICE.mode];
    for (const id of MONEY) { const mt = METRICS.get(id); mt.name = mt.name0.replace("(USD)", `(${unit})`).replace("(USD/1M)", `(${unit} /1M)`); }
  }
  applyPrice();

  const CAT_ORDER = ["group", ...Object.keys(D.categories)];
  const catName = (c) => (c === "group" ? "Grupos de tareas" : D.categories[c] || c);

  /* ================= Formato ================= */
  const nfMax = {};
  const cur = (t, sym = curSym()) => (sym === "$" ? "$" + t : t + " €");
  // Importe con 2 cifras significativas en compacto; sym fija la moneda (por defecto, la de la escala elegida)
  function moneyTxt(v, compact = false, sym = curSym()) {
    const lg = v > 0 ? Math.floor(Math.log10(v)) : 0;
    if (compact) {
      // Hasta 2 cifras significativas, sin ceros de relleno (0,001 €, 0,5 €, 1,5 €)
      const d = clamp(1 - lg, 0, 6);
      return cur((nfMax[d] ||= new Intl.NumberFormat("es-ES", { maximumFractionDigits: d })).format(+v.toPrecision(2)), sym);
    }
    const d = v >= 100 ? 0 : v >= 10 ? 1 : v >= 0.1 ? 2 : clamp(2 - lg, 3, 6);
    return cur(nf(d).format(v), sym);
  }
  const eurTxt = (v, compact = false) => moneyTxt(v, compact, "€");
  function fmt(id, v, compact = false) {
    if (v === null || v === undefined) return "—";
    const m = METRICS.get(id);
    switch (m.unit) {
      case "frac": return nf(compact ? 0 : 1).format(v * 100) + " %";
      case "index": case "score": return nf(compact ? 0 : 1).format(v);
      case "elo": return nf(0).format(v);
      case "usd": return moneyTxt(v, compact);
      case "usd/1M": {
        const lg = v > 0 ? Math.floor(Math.log10(v)) : 0;
        return cur(nf(v >= 10 ? 1 : clamp(1 - lg, 2, 5)).format(v)) + (compact ? "" : " /1M");
      }
      case "s":
        if (v < 60) return nf(v < 10 ? 1 : 0).format(v) + " s";
        if (v < 3600) return nf(compact ? 0 : 1).format(v / 60) + " min";
        return nf(1).format(v / 3600) + " h";
      case "tok":
        if (v >= 1e6) return nf(v >= 1e7 ? 0 : 1).format(v / 1e6) + "M";
        if (v >= 1e3) return nf(v >= 1e4 ? 0 : 1).format(v / 1e3) + "k";
        return nf(0).format(v);
      case "tok/s": return nf(0).format(v) + (compact ? "" : " tok/s");
      default: return nf(2).format(v);
    }
  }
  const dirText = (m) => (m.hib ? "más es mejor" : "menos es mejor");

  /* ================= Familias, formas, iconos ================= */
  const famColor = (f) => (C.families[f] || {}).color || "#898781";
  // Color de la empresa: lo usan las vistas de suscripciones, donde la familia solo cambia la forma
  const coColor = (c) => ((C.companies || {})[c] || {}).color || "#898781";
  // Versión oscura de un color para texto: se oscurece (mismo tono)
  // hasta un contraste ≥ 5,5:1 sobre blanco, para que se lea siempre.
  const darkCache = {};
  const famDark = (f) => darkOf(famColor(f));
  function darkOf(hex) {
    const f = hex;
    if (darkCache[f]) return darkCache[f];
    const n = parseInt(hex.slice(1), 16);
    let rgb = [n >> 16, (n >> 8) & 255, n & 255];
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const contrast = (c) => 1.05 / (0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]) + 0.05);
    for (let i = 0; i < 40 && contrast(rgb) < 5.5; i++) rgb = rgb.map((c) => c * 0.94);
    return (darkCache[f] = "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join(""));
  }
  const famLong = (f) => (MODELS.find((m) => m.family === f) || {}).name || f;
  function shapePath(shape, s) {
    const r = s / 2;
    switch (shape) {
      case "square": { const a = r * 0.88; return `M${-a},${-a}h${2 * a}v${2 * a}h${-2 * a}z`; }
      case "diamond": { const a = r * 1.22; return `M0,${-a}L${a},0L0,${a}L${-a},0z`; }
      case "triangle": { const a = r * 1.25; return `M0,${-a}L${a * 0.95},${a * 0.68}L${-a * 0.95},${a * 0.68}z`; }
      case "triangle-down": { const a = r * 1.25; return `M0,${a}L${a * 0.95},${-a * 0.68}L${-a * 0.95},${-a * 0.68}z`; }
      case "pentagon": case "star": {
        // Estrella: alterna radio exterior e interior; pentágono: solo exterior
        const star = shape === "star", a = r * (star ? 1.3 : 1.12), n = star ? 10 : 5; let d = "";
        for (let i = 0; i < n; i++) {
          const t = -Math.PI / 2 + (2 * Math.PI / n) * i, k = star && i % 2 ? 0.48 : 1;
          d += (i ? "L" : "M") + (a * k * Math.cos(t)).toFixed(2) + "," + (a * k * Math.sin(t)).toFixed(2);
        }
        return d + "z";
      }
      case "cross": { const a = r * 1.05, b = a * 0.38; return `M${-b},${-a}h${2 * b}v${a - b}h${a - b}v${2 * b}h${b - a}v${a - b}h${-2 * b}v${b - a}h${b - a}v${-2 * b}h${a - b}z`; }
      case "hexagon": {
        const a = r * 1.05; let d = "";
        for (let i = 0; i < 6; i++) { const t = Math.PI / 3 * i + Math.PI / 6; d += (i ? "L" : "M") + (a * Math.cos(t)).toFixed(2) + "," + (a * Math.sin(t)).toFixed(2); }
        return d + "z";
      }
      default: return `M${r},0A${r},${r} 0 1,1 ${-r},0A${r},${r} 0 1,1 ${r},0z`;
    }
  }
  // color: opcional, para pintar la forma de la familia con otro color (p. ej. el de la empresa)
  function famIcon(f, size = 11, color) {
    const c = C.families[f] || { color: "#898781", shape: "circle" };
    const h = size + 4;
    return `<svg width="${h}" height="${h}" viewBox="${-h / 2} ${-h / 2} ${h} ${h}" aria-hidden="true"><path d="${shapePath(c.shape, size)}" fill="${color || c.color}"/></svg>`;
  }
  // En las vistas de suscripciones: forma de la familia, color de la empresa
  const subIcon = (m, size) => famIcon(m.family, size, coColor(m.provider));
  const subDark = (m) => darkOf(coColor(m.provider));
  const modelName = (m) => `${esc(m.name)} <span class="e">${esc(m.effort)}</span>`;
  const modelText = (m) => `${m.name} ${m.effort}`;

  const ICONS = {
    code: "M8 6l-6 6 6 6M16 6l6 6-6 6",
    bug: "M8 10a4 4 0 0 1 8 0v4a4 4 0 0 1-8 0zM12 10v8M3 13h5M16 13h5M5 7l3 2.5M19 7l-3 2.5M5 19l3-2M19 19l-3-2M10 6L9 3.5M14 6l1-2.5",
    bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
    flask: "M9 3h6M10 3v6L4.6 18.6A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.4-2.4L14 9V3M7.5 15h9",
    brain: "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 0V7a3 3 0 0 0-3-3zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 0",
    shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
    briefcase: "M3 8h18v12H3zM9 8V5h6v3M3 13h18",
    gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1",
    chart: "M5 20V11M11 20V5M17 20v-6M3 20h18",
    scale: "M12 3v18M6 21h12M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z",
    pulse: "M3 12h4l3-8 4 16 3-8h4",
    doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
    eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    gauge: "M12 14l4-4M3.5 18a10 10 0 1 1 17 0",
    trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4.5M16 6h3a3 3 0 0 1-3 4.5M12 13v4M9 20h6M10 17h4v3h-4z",
    coin: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM14.5 9.5C14 8.6 13.1 8 12 8c-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.6-2.5-1.5M12 6.5V8M12 16v1.5",
    grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    zoomout: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
    pin: "M12 3a6 6 0 0 0-6 6c0 4.5 6 12 6 12s6-7.5 6-12a6 6 0 0 0-6-6zM12 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
    target: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9zM12 11.2v1.6",
    scatter: "M4 4v16h16M7 15a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M11 10a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M15.5 13a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M16.5 6.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0",
    bars: "M4 6h12M4 12h16M4 18h8",
    sliders: "M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6",
    columns: "M4 4h16v16H4zM9.5 4v16M14.5 4v16",
    layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
    front: "M4 19l5-7 5-3 6-3M4 4v16h16",
    wallet: "M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 7l11-3.5V7M15.5 13.5h2",
    plans: "M4 18l5-5 4 2 7-8M4 20l5-3 4 1 7-5",
  };
  // Logo de CleanAI: un trono con la chispa de la IA sentada en él
  let logoN = 0;
  function logoSVG(size, cls = "") {
    const id = "lgr" + (++logoN);
    return `<svg class="logo ${cls}" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffb547"/><stop offset=".5" stop-color="#ff6b8b"/><stop offset="1" stop-color="#9d8cff"/></linearGradient></defs>` +
      `<rect width="32" height="32" rx="9" fill="#0b0b0b"/><g fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M10 25.5V9.6M22 25.5V9.6M10 11.4Q16 4.6 22 11.4M7.2 15.2v3.6h17.6v-3.6"/></g><g fill="#fff"><circle cx="10" cy="7.1" r="1.35"/><circle cx="22" cy="7.1" r="1.35"/></g>` +
      `<path class="spark" d="M16 9.2C16.4 12.1 16.9 12.6 19.8 13C16.9 13.4 16.4 13.9 16 16.8C15.6 13.9 15.1 13.4 12.2 13C15.1 12.6 15.6 12.1 16 9.2Z" fill="url(#${id})"/></svg>`;
  }
  const icon = (k, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[k] || ICONS.chart}"/></svg>`;

  /* ================= Tooltip ================= */
  const tip = $("#tooltip");
  function showTip(html, ev) { tip.innerHTML = html; tip.classList.add("show"); moveTip(ev); }
  function moveTip(ev) {
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
    tip.style.left = Math.max(8, x) + "px";
    tip.style.top = Math.max(8, y) + "px";
  }
  const hideTip = () => tip.classList.remove("show");
  const ttRow = (k, v) => `<div class="tt-r"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  function bindTip(node, fn) {
    node.addEventListener("pointerenter", (e) => showTip(fn(), e));
    node.addEventListener("pointermove", moveTip);
    node.addEventListener("pointerleave", hideTip);
  }
  function extNote(id, m) {
    const meta = METRICS.get(id);
    return meta && meta.notes && meta.notes[m.slug] ? meta.notes[m.slug] : "";
  }

  /* ================= Estado global ================= */
  // Modelos ocultos (por slug): cada familia puede mostrar solo algunos efforts
  // Último tipo de puntero usado: con ratón se despliega al pasar por encima; con dedo, al tocar
  let lastPointer = window.matchMedia("(hover: hover)").matches ? "mouse" : "touch";
  addEventListener("pointerdown", (e) => { lastPointer = e.pointerType || "mouse"; }, true);
  addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") lastPointer = "mouse"; }, true);
  const isMouse = () => lastPointer === "mouse";
  let offInit = store.get("off", null);
  if (!Array.isArray(offInit)) {
    const f0 = new Set(store.get("fams", FAM_ORDER)), e0 = new Set(store.get("effs", C.efforts));
    offInit = MODELS.filter((m) => !f0.has(m.family) || !e0.has(m.effort)).map((m) => m.slug);
  }
  const S = { tab: store.get("tab", "tareas"), off: new Set(offInit.filter((s) => MODELS.some((m) => m.slug === s))) };
  if (S.off.size >= N) S.off.clear();
  const visible = () => MODELS.filter((m) => !S.off.has(m.slug));
  const famModels = (f) => MODELS.filter((m) => m.family === f).sort((a, b) => b.effortLevel - a.effortLevel);

  /* ================= Modelos destacados (clic en un modelo, en cualquier vista) ================= */
  const PINS = new Set(store.get("pins", []).filter((s) => MODELS.some((m) => m.slug === s)));
  const SCATTERS = [];

  /* ================= Ajustes de gráfica (comunes a todas las secciones) ================= */
  const G = Object.assign({
    paretoOnly: false, pareto: store.get("pareto", true), connect: store.get("connect", true), labels: store.get("allLabels", false) ? "all" : "auto",
    famLine: false, colorText: true, lineW: 1.5, ptSize: 1, fontSize: 1, grid: true,
    barH: "md", barScale: "zero", oneEff: false, mapNums: true, cmpBars: true, cmpBest: true,
  }, store.get("gprefs", {}));
  const pct = (v) => nf(0).format(v * 100) + " %";
  // [tipo, clave, texto, ...]; "only" limita el control a un modo de Para qué (chart | rank)
  const GO = {
    pareto: ["tog", "Frontera de Pareto", "chart"],
    paretoOnly: ["tog", "Solo la frontera (el resto, atenuado y sin nombre)", "chart"],
    connect: ["tog", "Unir efforts de cada familia", "chart"],
    famLine: ["tog", "Nombre de la familia en su línea", "chart"],
    labels: ["seg", "Etiquetas", "chart", [["auto", "Auto"], ["all", "Todas"], ["pins", "Destacados"], ["none", "Ninguna"]], "Auto: frontera de Pareto, recomendados y destacados."],
    lineW: ["range", "Grosor de líneas", "chart", 1, 5, 0.5, (v) => nf(1).format(v) + " px"],
    ptSize: ["range", "Tamaño de los puntos", "chart", 0.6, 1.8, 0.1, pct],
    grid: ["tog", "Rejilla", "chart"],
    barH: ["seg", "Grosor de las barras", "rank", [["sm", "Fina"], ["md", "Normal"], ["lg", "Gruesa"]]],
    barScale: ["seg", "Escala", "rank", [["zero", "Desde 0"], ["fit", "Ajustada"]], "Ajustada: puntos sobre el rango de los datos, para ver mejor las diferencias."],
    oneEff: ["tog", "Solo el mejor effort de cada familia", "rank"],
    mapNums: ["tog", "Números en las celdas"],
    cmpBars: ["tog", "Barras en las celdas"],
    cmpBest: ["tog", "Resaltar el mejor de cada fila"],
    fontSize: ["range", "Tamaño del texto", "", 0.8, 1.5, 0.05, pct],
    colorText: ["tog", "Nombres en el color de la familia (tono oscuro)"],
  };
  const GKINDS = {
    scatter: ["pareto", "paretoOnly", "connect", "famLine", "labels", "lineW", "ptSize", "fontSize", "grid", "colorText"],
    task: ["pareto", "paretoOnly", "connect", "famLine", "labels", "lineW", "ptSize", "barH", "barScale", "oneEff", "fontSize", "grid", "colorText"],
    home: ["pareto", "paretoOnly", "connect", "famLine", "labels", "lineW", "ptSize", "barH", "barScale", "oneEff", "fontSize", "grid", "colorText"],
    bars: ["barH", "barScale", "oneEff", "fontSize", "colorText"],
    weights: ["barH", "oneEff", "fontSize", "colorText"],
    map: ["mapNums", "oneEff", "fontSize", "colorText"],
    cmp: ["cmpBars", "cmpBest", "fontSize", "colorText"],
  };
  // Claves que solo cambian el aspecto de los diagramas de dispersión (se redibujan sin animar)
  const G_STYLE = new Set(["paretoOnly", "labels", "famLine", "lineW", "ptSize", "fontSize", "grid", "colorText"]);
  function buildGOpts() {
    document.querySelectorAll(".gopts").forEach((host) => {
      const keys = GKINDS[host.dataset.kind] || [];
      host.innerHTML = `<h4>Ajustes de gráfica</h4><p class="hint">Se aplican a todas las secciones.</p><div class="gopt-list">` + keys.map((k) => {
        const [type, text, only, ...rest] = GO[k];
        const oa = only && host.dataset.kind === "task" ? ` data-only="${only}"` : "";
        if (type === "tog") return `<label class="tog"${oa}><input type="checkbox" data-g="${k}"><span>${esc(text)}</span></label>`;
        if (type === "seg") {
          const [opts, hint] = rest;
          return `<div class="gseg"${oa}><span class="gol">${esc(text)}</span><div class="mseg" data-g="${k}">${opts.map(([v, t]) => `<button type="button" data-v="${v}">${esc(t)}</button>`).join("")}</div>${hint ? `<p class="hint">${esc(hint)}</p>` : ""}</div>`;
        }
        const [min, max, step] = rest;
        return `<label class="grange"${oa}><span class="gol">${esc(text)}<output></output></span><input type="range" data-g="${k}" min="${min}" max="${max}" step="${step}"></label>`;
      }).join("") + `</div><button type="button" class="linkbtn greset">Restablecer ajustes</button>`;
    });
    syncGOpts();
  }
  function syncGOpts() {
    document.querySelectorAll(".gopts [data-g]").forEach((el) => {
      const k = el.dataset.g, v = G[k];
      if (el.type === "checkbox") {
        el.checked = !!v;
        // El nombre en la línea necesita las líneas de effort
        if (k === "famLine") { el.disabled = !G.connect; el.closest(".tog").classList.toggle("off", !G.connect); }
      }
      else if (el.type === "range") { el.value = v; el.closest(".grange").querySelector("output").textContent = GO[k][6](v); }
      else el.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
    });
  }
  function applyG() {
    const b = document.body;
    b.style.setProperty("--lw", G.lineW); b.style.setProperty("--fs", G.fontSize);
    b.classList.toggle("color-names", !!G.colorText); b.classList.toggle("no-grid", !G.grid);
    b.classList.toggle("bars-sm", G.barH === "sm"); b.classList.toggle("bars-lg", G.barH === "lg");
    b.classList.toggle("map-nonums", !G.mapNums); b.classList.toggle("cmp-nobars", !G.cmpBars); b.classList.toggle("cmp-nobest", !G.cmpBest);
  }
  let gRaf = 0;
  function setG(k, v) {
    if (k) G[k] = v;
    store.set("gprefs", G);
    applyG(); syncGOpts();
    if (k && G_STYLE.has(k)) {
      cancelAnimationFrame(gRaf);
      gRaf = requestAnimationFrame(() => { for (const s of SCATTERS) if (s.cfg && s.host.offsetParent) s.draw(false); });
    } else VIEWS[S.tab]();
  }
  document.addEventListener("input", (e) => {
    const el = e.target.closest(".gopts input[data-g]");
    if (!el) return;
    setG(el.dataset.g, el.type === "checkbox" ? el.checked : +el.value);
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".gopts .mseg button");
    if (b) { setG(b.closest(".mseg").dataset.g, b.dataset.v); return; }
    if (e.target.closest(".gopts .greset")) {
      Object.assign(G, { paretoOnly: false, pareto: true, connect: true, labels: "auto", famLine: false, colorText: true, lineW: 1.5, ptSize: 1, fontSize: 1, grid: true, barH: "md", barScale: "zero", oneEff: false, mapNums: true, cmpBars: true, cmpBest: true });
      setG(null);
      for (const s of SCATTERS) if (s.cfg) s.draw(false);
    }
  });
  // Deja solo el mejor effort de cada familia (la lista ya viene ordenada de mejor a peor)
  const oneEach = (list, fam = (x) => x.family) => { const seen = new Set(); return list.filter((x) => !seen.has(fam(x)) && seen.add(fam(x))); };
  function togglePin(slug) {
    if (!slug) return;
    if (PINS.has(slug)) PINS.delete(slug); else PINS.add(slug);
    hideTip(); pinsChanged();
  }
  function clearPins() { if (!PINS.size) return; PINS.clear(); pinsChanged(); }
  function pinsChanged() {
    store.set("pins", [...PINS]);
    markPins();
    for (const sc of SCATTERS) sc.relabel();
    updatePinChip();
  }
  // Marca los elementos con data-pin; el resto se atenúa por CSS
  function markPins() {
    document.body.classList.toggle("has-pins", [...PINS].some((s) => !S.off.has(s)));
    document.querySelectorAll("[data-pin]").forEach((el) => el.classList.toggle("pinned", PINS.has(el.dataset.pin)));
  }
  const pinHint = (slug) => `<div class="tt-k">${PINS.has(slug) ? "Clic: dejar de destacar" : "Clic: destacar en todas las vistas"}</div>`;
  function updatePinChip() {
    const host = $("#pins");
    const ms = [...PINS].filter((s) => !S.off.has(s)).map((s) => MODELS.find((m) => m.slug === s));
    host.hidden = !ms.length;
    if (!ms.length) { host.innerHTML = ""; return; }
    host.innerHTML = `<span class="pin-ic">${icon("pin", 13)}</span>` +
      ms.slice(0, 2).map((m) => `<span class="pn">${famIcon(m.family, 10)}${esc(famShort(m.family))} ${esc(EFF_SHORT[m.effort] || m.effort)}</span>`).join("") +
      (ms.length > 2 ? `<span class="pn more">+${ms.length - 2}</span>` : "") +
      `<button type="button" class="pin-x" title="Quitar destacados (Esc)" aria-label="Quitar destacados">×</button>`;
    host.title = ms.map(modelText).join(" · ");
    host.querySelector(".pin-x").onclick = (e) => { e.stopPropagation(); clearPins(); };
  }
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-pick]");
    if (!el || e.target.closest("button.rm, a, input, select, label, .pin-x")) return;
    togglePin(el.dataset.pick);
  });

  /* ================= Selector de métricas ================= */
  function fillMetricSelect(sel, current, filter = () => true) {
    sel.innerHTML = "";
    const byCat = new Map();
    for (const m of METRICS.values()) {
      if (!filter(m)) continue;
      if (!byCat.has(m.cat)) byCat.set(m.cat, []);
      byCat.get(m.cat).push(m);
    }
    const cats = [...byCat.keys()].sort((a, b) => (CAT_ORDER.indexOf(a) + 1 || 99) - (CAT_ORDER.indexOf(b) + 1 || 99));
    for (const c of cats) {
      const og = document.createElement("optgroup");
      og.label = catName(c);
      for (const m of byCat.get(c)) {
        const o = document.createElement("option");
        o.value = m.id;
        let t = m.short;
        if (m.n < N) t += `  ·  ${m.n}/${N}`;
        if (m.external) t += "  ·  externo";
        o.textContent = t;
        og.appendChild(o);
      }
      sel.appendChild(og);
    }
    if (current && METRICS.has(current)) sel.value = current;
  }

  function metricHelp(id, extra = "") {
    const m = METRICS.get(id);
    if (!m) return "";
    const badges = (m.external ? `<span class="badge ext">externo · ${esc(m.source)}</span>` : "") +
      (m.n < coreMin ? `<span class="badge part">parcial ${m.n}/${N}</span>` : m.n < N ? `<span class="badge">${m.n}/${N} modelos</span>` : "");
    let html = `<b>${esc(m.name)}</b>${badges}<p>${esc(m.desc || "")}${m.desc ? " " : ""}<i>${dirText(m)}${m.log ? " · se compara en escala log" : ""}.</i></p>`;
    if (m.group) {
      html += `<p>Nota 0–100 relativa al dataset, hecha con: ${m.group.items.map(([i, w]) => `${esc(METRICS.get(i).short)} ×${w}`).join(", ")}.</p>`;
    }
    if (m.url) html += `<p><a href="${esc(m.url)}" target="_blank" rel="noopener">Fuente ↗</a></p>`;
    return html + extra;
  }

  /* ================= Scatter ================= */
  class Scatter {
    constructor(host, opts = {}) {
      this.host = host;
      this.opts = opts;
      this.svg = svgEl("svg");
      this.gGrid = svgEl("g");
      this.gLines = svgEl("g");
      this.gPareto = svgEl("g");
      this.gPts = svgEl("g");
      this.gLabels = svgEl("g");
      this.gFam = svgEl("g");
      this.famLabels = new Map(); // familia -> text
      this.gAxes = svgEl("g");
      // Recorte del área de datos (para el zoom) y rectángulo de selección
      Scatter.n = (Scatter.n || 0) + 1;
      const cid = "sc-clip-" + Scatter.n;
      const defs = svgEl("defs"), cp = svgEl("clipPath", { id: cid });
      this.clipRect = svgEl("rect");
      cp.appendChild(this.clipRect); defs.appendChild(cp);
      for (const g of [this.gPareto, this.gLines, this.gPts]) g.setAttribute("clip-path", `url(#${cid})`);
      this.box = svgEl("rect", { class: "zbox" });
      this.box.style.display = "none";
      this.svg.append(defs, this.gGrid, this.gPareto, this.gLines, this.gPts, this.gFam, this.gLabels, this.gAxes, this.box);
      host.appendChild(this.svg);
      this.ui = document.createElement("div");
      this.ui.className = "zoom-ui";
      this.ui.innerHTML = `<span class="zhint">Arrastra para ampliar · clic en un modelo para destacarlo</span>
        <span class="zon">Mayús + arrastrar para moverte</span><button type="button" class="zreset">${icon("zoomout", 14)}Ver todo</button>
        <button type="button" class="zfocus" title="Deja solo la frontera de Pareto; el resto, atenuado y sin nombre (se aplica a todas las gráficas)">${icon("front", 14)}Solo Pareto</button>`;
      this.ui.querySelector(".zreset").onclick = () => this.resetZoom();
      this.ui.querySelector(".zfocus").onclick = () => setG("paretoOnly", !G.paretoOnly);
      host.appendChild(this.ui);
      this.pts = new Map();     // slug -> {g, path, label, cur:{x,y}, tgt:{x,y}}
      this.lines = new Map();   // family -> path
      this.paretoPath = svgEl("path", { class: "pareto-line" });
      this.gPareto.appendChild(this.paretoPath);
      this.cfg = null;
      this.raf = 0;
      this.zoom = null; this.zkey = "";
      this.ro = new ResizeObserver(() => { if (this.cfg) this.draw(false); });
      this.ro.observe(host);
      this.bindZoom();
      SCATTERS.push(this);
    }
    set(cfg) {
      // Cambiar de ejes vuelve a la vista completa
      const key = [cfg.x, cfg.y, cfg.xLog, cfg.yLog].join("|");
      if (key !== this.zkey) { this.zoom = null; this.zkey = key; }
      this.cfg = cfg; this.draw(true);
    }

    /* ---- Zoom: arrastrar = ampliar zona, Mayús+arrastrar = mover, Ctrl+rueda/pellizco = acercar, doble clic = ver todo ---- */
    local(e) { const r = this.svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    inPlot(p) { const M = this.M; return M && p.x >= M.l && p.x <= this.W - M.r && p.y >= M.t && p.y <= this.H - M.b; }
    bindZoom() {
      const svg = this.svg;
      svg.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "touch" || e.button !== 0) return;
        const p = this.local(e);
        if (!this.inPlot(p)) return;
        this.drag = { x0: p.x, y0: p.y, x: p.x, y: p.y, id: e.pointerId, moved: false, pan: e.shiftKey && !!this.zoom, z0: this.zoom };
      });
      svg.addEventListener("pointermove", (e) => {
        const d = this.drag;
        if (!d || e.pointerId !== d.id) return;
        const p = this.local(e), M = this.M, W = this.W, H = this.H;
        if (!d.moved) {
          if (Math.hypot(p.x - d.x0, p.y - d.y0) < 5) return;
          d.moved = true;
          svg.setPointerCapture(d.id);
          hideTip(); this.highlight(null);
          this.host.classList.add(d.pan ? "panning" : "zooming");
        }
        if (d.pan) {
          const fx = (p.x - d.x0) / (W - M.l - M.r), fy = (p.y - d.y0) / (H - M.t - M.b);
          const shift = (dom, log, f) => { const a = fwd(dom[0], log), b = fwd(dom[1], log), s = (b - a) * f; return [back(a - s, log), back(b - s, log)]; };
          this.zoom = { x: shift(d.z0.x, this.cfg.xLog, fx), y: shift(d.z0.y, this.cfg.yLog, -fy) };
          this.drawSoon();
          return;
        }
        d.x = clamp(p.x, M.l, W - M.r); d.y = clamp(p.y, M.t, H - M.b);
        Object.assign(this.box.style, { display: "" });
        this.box.setAttribute("x", Math.min(d.x, d.x0)); this.box.setAttribute("y", Math.min(d.y, d.y0));
        this.box.setAttribute("width", Math.abs(d.x - d.x0)); this.box.setAttribute("height", Math.abs(d.y - d.y0));
      });
      const end = (e, cancel) => {
        const d = this.drag;
        if (!d || e.pointerId !== d.id) return;
        this.drag = null;
        this.host.classList.remove("zooming", "panning");
        this.box.style.display = "none";
        if (!d.moved) return;
        this.noClick = true; setTimeout(() => { this.noClick = false; }, 0);
        if (cancel || d.pan) return;
        const w = Math.abs(d.x - d.x0), h = Math.abs(d.y - d.y0);
        if (w < 10 && h < 10) return;
        // Si la selección es casi una línea, solo se amplía el otro eje
        const xa = w >= 10 ? [this.ix(Math.min(d.x, d.x0)), this.ix(Math.max(d.x, d.x0))] : this.dx;
        const ya = h >= 10 ? [this.iy(Math.max(d.y, d.y0)), this.iy(Math.min(d.y, d.y0))] : this.dy;
        this.zoom = { x: xa, y: ya };
        this.draw(true);
      };
      svg.addEventListener("pointerup", (e) => end(e, false));
      svg.addEventListener("pointercancel", (e) => end(e, true));
      svg.addEventListener("wheel", (e) => {
        if (!(e.ctrlKey || e.metaKey) || !this.M) return;
        const p = this.local(e);
        if (!this.inPlot(p)) return;
        e.preventDefault();
        const k = Math.exp(clamp(e.deltaY, -50, 50) * 0.012);
        const cx = this.ix(p.x), cy = this.iy(p.y);
        const scale = (dom, full, log, c) => {
          const a = fwd(dom[0], log), b = fwd(dom[1], log), m = fwd(c, log);
          const fa = fwd(full[0], log), fb = fwd(full[1], log);
          let na = m - (m - a) * k, nb = m + (b - m) * k;
          if (nb - na >= fb - fa) { na = fa; nb = fb; }
          return [back(na, log), back(nb, log)];
        };
        const z = { x: scale(this.dx, this.full.x, this.cfg.xLog, cx), y: scale(this.dy, this.full.y, this.cfg.yLog, cy) };
        const same = (u, v) => u[0] === v[0] && u[1] === v[1];
        this.zoom = same(z.x, this.full.x) && same(z.y, this.full.y) ? null : z;
        this.drawSoon();
      }, { passive: false });
      // Clic en un punto: destacar; clic en vacío: quitar destacados (salvo que sea un doble clic)
      svg.addEventListener("click", (e) => {
        if (this.noClick) return;
        const g = e.target.closest(".pt");
        clearTimeout(this.clr);
        if (g) { togglePin(g.dataset.pin); return; }
        if (PINS.size && this.inPlot(this.local(e))) this.clr = setTimeout(clearPins, 280);
      });
      svg.addEventListener("dblclick", (e) => {
        clearTimeout(this.clr);
        if (!e.target.closest(".pt") && this.zoom) this.resetZoom();
      });
    }
    drawSoon() {
      if (this.zraf) return;
      this.zraf = requestAnimationFrame(() => { this.zraf = 0; this.draw(false); });
    }
    resetZoom() { if (!this.zoom) return; this.zoom = null; this.draw(true); }
    // Vuelve a colocar etiquetas y clases tras cambiar los destacados
    // «Solo Pareto»: fuera de la frontera (y sin destacar) se atenúa, encoge y pierde el nombre
    applyFade() {
      for (const p of this.pts.values()) {
        const was = !!p.faded;
        p.faded = !!G.paretoOnly && !p.inFront && !PINS.has(p.model.slug);
        p.g.classList.toggle("faded", p.faded);
        if (was !== p.faded && !this.animating) p.g.setAttribute("transform", `translate(${p.cur.x.toFixed(1)},${p.cur.y.toFixed(1)}) scale(${(p.scale * G.ptSize * (p.faded ? 0.72 : 1)).toFixed(3)})`);
      }
    }
    relabel() {
      if (!this.M) return;
      for (const p of this.pts.values()) {
        const on = PINS.has(p.model.slug);
        p.g.classList.toggle("pinned", on); p.label.classList.toggle("pinned", on);
      }
      this.applyFade();
      if (!this.animating) this.placeLabels(this.W, this.H, this.M);
    }

    draw(animate) {
      const cfg = this.cfg;
      const W = this.host.clientWidth, H = this.host.clientHeight;
      if (!W || !H) return;
      this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      const mini = !!this.opts.mini;
      const M = { l: mini ? 52 : 64, r: 20, t: mini ? 18 : 40, b: mini ? 44 : 52 };
      const mx = METRICS.get(cfg.x), my = METRICS.get(cfg.y);
      const pts = cfg.models.filter((m) => {
        const x = val(m, cfg.x), y = val(m, cfg.y);
        return x !== null && y !== null && (!cfg.xLog || x > 0) && (!cfg.yLog || y > 0);
      });
      this.missing = cfg.models.length - pts.length;

      const dom = (vals, log) => {
        if (!vals.length) return [0, 1];
        let a = Math.min(...vals), b = Math.max(...vals);
        if (log) { if (a === b) { a /= 2; b *= 2; } return [a / 1.25, b * 1.25]; }
        if (a === b) { a -= 1; b += 1; }
        const p = (b - a) * 0.08;
        return [a - p, b + p];
      };
      let [x0, x1] = dom(pts.map((m) => val(m, cfg.x)), cfg.xLog);
      let [y0, y1] = dom(pts.map((m) => val(m, cfg.y)), cfg.yLog);
      this.full = { x: [x0, x1], y: [y0, y1] };
      if (this.zoom) { [x0, x1] = this.zoom.x; [y0, y1] = this.zoom.y; }
      this.dx = [x0, x1]; this.dy = [y0, y1];
      this.M = M; this.W = W; this.H = H;
      this.host.classList.toggle("zoomed", !!this.zoom);
      this.clipRect.setAttribute("x", M.l - 6); this.clipRect.setAttribute("y", M.t - 6);
      this.clipRect.setAttribute("width", Math.max(0, W - M.l - M.r + 12)); this.clipRect.setAttribute("height", Math.max(0, H - M.t - M.b + 12));
      // Inversas (píxel -> valor), para el zoom
      this.ix = (px) => { const t = (px - M.l) / (W - M.l - M.r); return back(fwd(x0, cfg.xLog) + t * (fwd(x1, cfg.xLog) - fwd(x0, cfg.xLog)), cfg.xLog); };
      this.iy = (py) => { const t = (H - M.b - py) / (H - M.t - M.b); return back(fwd(y0, cfg.yLog) + t * (fwd(y1, cfg.yLog) - fwd(y0, cfg.yLog)), cfg.yLog); };
      const sx = (v) => {
        const t = cfg.xLog ? (Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0)) : (v - x0) / (x1 - x0);
        return M.l + t * (W - M.l - M.r);
      };
      const sy = (v) => {
        const t = cfg.yLog ? (Math.log10(v) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0)) : (v - y0) / (y1 - y0);
        return H - M.b - t * (H - M.t - M.b);
      };

      // Ejes y rejilla
      this.gGrid.innerHTML = ""; this.gAxes.innerHTML = "";
      let xt = cfg.xLog ? logTicks(x0, x1) : niceTicks(x0, x1, mini ? 5 : 7);
      const maxXT = Math.max(3, Math.floor((W - M.l - M.r) / 62));
      if (cfg.xLog && xt.length > maxXT) xt = xt.filter((v) => /^[15]/.test(v.toExponential()));
      if (cfg.xLog && xt.length > maxXT) xt = xt.filter((v) => /^1/.test(v.toExponential()));
      if (xt.length < 2) xt = niceTicks(x0, x1, 5).filter((v) => v > 0 || !cfg.xLog);
      let yt = cfg.yLog ? logTicks(y0, y1) : niceTicks(y0, y1, mini ? 5 : 6);
      if (yt.length < 2) yt = niceTicks(y0, y1, 5).filter((v) => v > 0 || !cfg.yLog);
      for (const t of yt) {
        const y = sy(t);
        this.gGrid.appendChild(svgEl("line", { class: "gridline", x1: M.l, x2: W - M.r, y1: y, y2: y }));
        const tx = svgEl("text", { x: M.l - 8, y: y + 4, "text-anchor": "end", class: "tick" });
        tx.textContent = fmt(cfg.y, t, true); this.gAxes.appendChild(tx);
      }
      for (const t of xt) {
        const x = sx(t);
        this.gGrid.appendChild(svgEl("line", { class: "gridline", y1: M.t, y2: H - M.b, x1: x, x2: x }));
        const tx = svgEl("text", { x, y: H - M.b + 18, "text-anchor": "middle", class: "tick" });
        tx.textContent = fmt(cfg.x, t, true); this.gAxes.appendChild(tx);
      }
      this.gGrid.appendChild(svgEl("line", { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b, stroke: "var(--axis)" }));
      const xtitle = svgEl("text", { x: (M.l + W - M.r) / 2, y: H - 8, "text-anchor": "middle", class: "axis-title" });
      xtitle.textContent = `${mx.short}${isMoney(cfg.x) ? " · " + priceTag() : ""}${cfg.xLog ? " (log)" : ""}  ${mx.hib ? "→ mejor" : "← mejor"}`;
      const ytitle = svgEl("text", { x: -(M.t + H - M.b) / 2, y: 14, transform: "rotate(-90)", "text-anchor": "middle", class: "axis-title" });
      ytitle.textContent = `${my.short}${isMoney(cfg.y) ? " · " + priceTag() : ""}${cfg.yLog ? " (log)" : ""}  ${my.hib ? "→ mejor" : "← mejor"}`;
      this.gAxes.append(xtitle, ytitle);

      // Pareto
      const frontAll = paretoSet(pts, cfg.x, cfg.y);
      const front = G.pareto || G.paretoOnly ? frontAll : new Set();
      this.front = front; this.frontAll = frontAll;
      this.host.classList.toggle("focus-front", !!G.paretoOnly);
      const zf = this.ui.querySelector(".zfocus");
      zf.classList.toggle("on", !!G.paretoOnly); zf.setAttribute("aria-pressed", G.paretoOnly ? "true" : "false");

      // Puntos
      const seen = new Set();
      for (const m of pts) {
        seen.add(m.slug);
        const tgt = { x: sx(val(m, cfg.x)), y: sy(val(m, cfg.y)) };
        let p = this.pts.get(m.slug);
        if (!p) {
          const g = svgEl("g", { class: "pt", "data-pin": m.slug });
          const hit = svgEl("circle", { r: 13, fill: "transparent" });
          const fam = C.families[m.family] || { shape: "circle", color: "#888" };
          const size = mini ? 9 : 8 + (m.effortLevel || 40) / 20 * 1.6;
          const path = svgEl("path", { d: shapePath(fam.shape, size) });
          const ring = svgEl("circle", { class: "ring", r: 13 });
          g.append(hit, ring, path);
          const label = svgEl("text", { class: "plabel", "data-pin": m.slug });
          this.gPts.appendChild(g); this.gLabels.appendChild(label);
          p = { g, path, label, model: m, cur: { ...tgt }, scale: 0, base: `${famShort(m.family)} ${EFF_SHORT[m.effort] || m.effort}`, tag: undefined };
          g.addEventListener("pointerenter", (e) => { this.highlight(m.family, m.slug); showTip(this.tipHtml(m), e); });
          g.addEventListener("pointermove", moveTip);
          g.addEventListener("pointerleave", () => { this.highlight(null); hideTip(); });
          this.pts.set(m.slug, p);
        }
        p.tgt = tgt;
        p.removing = false;
        const c = famColor(m.family);
        const onFront = !(G.pareto || G.paretoOnly) || front.has(m.slug);
        p.path.style.fill = onFront ? c : "var(--surface)";
        p.path.style.stroke = onFront ? "var(--surface)" : c;
        p.onFront = front.has(m.slug);
        p.inFront = frontAll.has(m.slug);
        p.g.classList.toggle("pinned", PINS.has(m.slug)); p.label.classList.toggle("pinned", PINS.has(m.slug));
        const tag = cfg.marks ? cfg.marks.get(m.slug) || "" : "";
        p.g.classList.toggle("marked", !!tag);
        p.label.classList.toggle("marked", !!tag);
        // Con el nombre de la familia en su línea, cada punto lleva solo su effort
        const text = G.famLine && G.connect ? (EFF_SHORT[m.effort] || m.effort) : p.base;
        if (p.tag !== tag || p.text !== text) {
          p.tag = tag; p.text = text;
          p.label.textContent = "";
          if (tag) { const t = svgEl("tspan", { class: "tag" }); t.textContent = tag + "  "; p.label.appendChild(t); }
          p.label.appendChild(document.createTextNode(text));
        }
        p.label.style.fill = G.colorText ? famDark(m.family) : "";
      }
      let empty = this.host.querySelector(".chart-empty");
      if (!pts.length) {
        if (!empty) { empty = document.createElement("div"); empty.className = "chart-empty"; this.host.appendChild(empty); }
        empty.textContent = "Ningún modelo visible tiene datos en los dos ejes.";
      } else if (empty) empty.remove();
      for (const [slug, p] of this.pts) if (!seen.has(slug)) p.removing = true;

      // Líneas de effort por familia
      for (const path of this.lines.values()) path.remove();
      this.lines.clear();
      if (G.connect) {
        for (const f of FAM_ORDER) {
          if (!pts.some((m) => m.family === f)) continue;
          const path = svgEl("path", { class: "effline", stroke: famColor(f) });
          this.gLines.appendChild(path);
          this.lines.set(f, path);
        }
      }
      this.paretoPath.style.display = G.pareto || G.paretoOnly ? "" : "none";

      this.applyFade();
      for (const p of this.pts.values()) p.label.style.opacity = 0;
      for (const t of this.famLabels.values()) t.style.opacity = 0;
      this.host.classList.toggle("no-grid", !G.grid);
      cancelAnimationFrame(this.raf);
      const t0 = performance.now(), dur = animate && !reduceMotion ? 750 : 0;
      this.animating = true;
      const from = new Map([...this.pts].map(([k, p]) => [k, { x: p.cur.x, y: p.cur.y, s: p.scale }]));
      const step = (now) => {
        const t = dur ? clamp((now - t0) / dur, 0, 1) : 1;
        const e = easeOut(t);
        for (const [k, p] of this.pts) {
          const f = from.get(k);
          if (p.removing) {
            p.scale = f.s * (1 - e);
          } else {
            p.cur.x = f.x + (p.tgt.x - f.x) * e;
            p.cur.y = f.y + (p.tgt.y - f.y) * e;
            p.scale = f.s + (1 - f.s) * e;
          }
          p.g.setAttribute("transform", `translate(${p.cur.x.toFixed(1)},${p.cur.y.toFixed(1)}) scale(${(p.scale * G.ptSize * (p.faded ? 0.72 : 1)).toFixed(3)})`);
        }
        this.drawLines(pts);
        if (t < 1) this.raf = requestAnimationFrame(step);
        else {
          for (const [k, p] of [...this.pts]) if (p.removing) { p.g.remove(); p.label.remove(); this.pts.delete(k); }
          this.animating = false;
          this.placeLabels(W, H, M);
        }
      };
      this.raf = requestAnimationFrame(step);
      if (cfg.onDraw) cfg.onDraw({ pts, front, missing: this.missing });
      markPins();
    }

    drawLines(pts) {
      const cfg = this.cfg;
      for (const [f, path] of this.lines) {
        const seq = pts.filter((m) => m.family === f).sort((a, b) => a.effortLevel - b.effortLevel).map((m) => this.pts.get(m.slug).cur);
        path.setAttribute("d", seq.length > 1 ? "M" + seq.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join("L") : "");
      }
      if (G.pareto || G.paretoOnly) {
        const fp = pts.filter((m) => this.front.has(m.slug)).map((m) => this.pts.get(m.slug).cur).sort((a, b) => a.x - b.x);
        this.paretoPath.setAttribute("d", fp.length > 1 ? "M" + fp.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join("L") : "");
      }
    }

    placeLabels(W, H, M) {
      const boxes = [];
      const pts = [...this.pts.values()].filter((p) => !p.removing);
      const ps = G.ptSize, rad = 5 * ps + 4, fh = 12 * G.fontSize;
      for (const p of pts) boxes.push({ x: p.cur.x - 7 * ps, y: p.cur.y - 7 * ps, w: 14 * ps, h: 14 * ps, own: p });
      const inPlot = (x, y) => x >= M.l - 1 && x <= W - M.r + 1 && y >= M.t - 1 && y <= H - M.b + 1;
      // Los botones de la gráfica (Solo Pareto, Ver todo) no se tapan con etiquetas
      const sr = this.svg.getBoundingClientRect();
      for (const b of this.ui.querySelectorAll("button")) {
        const r = b.getBoundingClientRect();
        if (r.width) boxes.push({ x: r.left - sr.left - 4, y: r.top - sr.top - 2, w: r.width + 8, h: r.height + 4, own: null });
      }

      // Nombre de cada familia junto a su línea de efforts: prueba los tramos de más
      // largo a más corto (y los dos lados), evitando puntos y otros nombres
      const fams = new Set();
      if (G.famLine && G.connect) {
        const circles = pts.filter((p) => inPlot(p.cur.x, p.cur.y)).map((p) => ({ x: p.cur.x, y: p.cur.y, r: 7 * ps + 2 }));
        for (const f of FAM_ORDER) {
          const seq = pts.filter((p) => p.model.family === f).sort((a, b) => a.model.effortLevel - b.model.effortLevel).map((p) => p.cur);
          if (!seq.length || !seq.some((q) => inPlot(q.x, q.y))) continue;
          let t = this.famLabels.get(f);
          if (!t) { t = svgEl("text", { class: "famlabel", "text-anchor": "middle" }); this.gFam.appendChild(t); this.famLabels.set(f, t); }
          t.textContent = famLong(f);
          t.style.fill = G.colorText ? famDark(f) : "";
          const w = t.getComputedTextLength() || 60, h = 13 * G.fontSize;
          // Candidato: centro (cx, cy) del texto y ángulo; se comprueba en el marco del texto
          const free = (cx, cy, ang) => {
            const c = Math.cos(ang), sn = Math.sin(ang);
            for (const [dx, dy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]]) {
              const x = cx + dx * c - dy * sn, y = cy + dx * sn + dy * c;
              if (x < M.l + 2 || x > W - M.r - 2 || y < M.t || y > H - M.b - 2) return false;
            }
            return !circles.some((o) => {
              const u = (o.x - cx) * c + (o.y - cy) * sn, v = -(o.x - cx) * sn + (o.y - cy) * c;
              return Math.abs(u) < w / 2 + o.r && Math.abs(v) < h / 2 + o.r;
            });
          };
          const cands = [];
          const segs = [];
          for (let i = 1; i < seq.length; i++) {
            const A = seq[i - 1], B = seq[i];
            segs.push({ A, B, len: Math.hypot(B.x - A.x, B.y - A.y) });
          }
          segs.sort((a, b) => b.len - a.len);
          const off = h / 2 + 3 + G.lineW / 2;
          for (const { A, B, len } of segs) {
            let ang = Math.atan2(B.y - A.y, B.x - A.x);
            if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
            if (Math.abs(ang) > Math.PI / 3 || len < w * 0.9) continue;
            const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
            for (const side of [1, -1]) cands.push({ x: mx + side * Math.sin(ang) * off, y: my - side * Math.cos(ang) * off, ang });
          }
          // Sin tramo útil: horizontal junto al extremo de más effort (o al de menos)
          for (const E of [seq[seq.length - 1], seq[0]]) {
            const d = 7 * ps + 6;
            cands.push({ x: E.x, y: E.y - d - h / 2, ang: 0 }, { x: E.x + d + w / 2, y: E.y, ang: 0 }, { x: E.x - d - w / 2, y: E.y, ang: 0 }, { x: E.x, y: E.y + d + h / 2, ang: 0 });
          }
          const ok = cands.find((q) => free(q.x, q.y, q.ang));
          if (!ok) { t.style.opacity = 0; continue; }
          // El texto se dibuja con la línea base: se baja medio alto en su propio marco
          const bx = ok.x - Math.sin(ok.ang) * (h * 0.35), by = ok.y + Math.cos(ok.ang) * (h * 0.35);
          t.setAttribute("transform", `translate(${bx.toFixed(1)},${by.toFixed(1)}) rotate(${(ok.ang * 180 / Math.PI).toFixed(1)})`);
          // Ocupa su sitio: otros nombres y etiquetas lo esquivan
          const n = Math.max(1, Math.ceil(w / h));
          for (let i = 0; i <= n; i++) {
            const u = -w / 2 + (w * i) / n, cx = ok.x + u * Math.cos(ok.ang), cy = ok.y + u * Math.sin(ok.ang);
            circles.push({ x: cx, y: cy, r: h / 2 });
            boxes.push({ x: cx - h / 2, y: cy - h / 2, w: h, h, own: null });
          }
          t.style.opacity = 1;
          fams.add(f);
        }
      }
      for (const [f, t] of this.famLabels) if (!fams.has(f)) t.style.opacity = 0;

      const pin = (p) => PINS.has(p.model.slug);
      const mode = G.labels;
      const want = (p) => !p.faded && (pin(p) && mode !== "none" || (mode === "all") || (mode === "auto" && (p.onFront || !!p.tag)) || (mode === "pins" && !!p.tag));
      const order = pts.slice().sort((a, b) => (pin(b) - pin(a)) || (!!b.tag - !!a.tag) || (b.onFront - a.onFront) || (b.model.effortLevel - a.model.effortLevel));
      for (const p of order) {
        const { x, y } = p.cur;
        if (!inPlot(x, y) || !want(p)) { p.label.style.opacity = 0; continue; }
        const w = p.label.getComputedTextLength() || 50, h = fh;
        const cand = [];
        for (const k of [1, 1.9, 2.8]) {
          const d = rad * k;
          cand.push(
            { x: x + d, y: y - h / 2, a: "start" },
            { x: x - d - w, y: y - h / 2, a: "end" },
            { x: x - w / 2, y: y - d - h, a: "middle" },
            { x: x - w / 2, y: y + d, a: "middle" },
            { x: x + d - 1, y: y - h - d + 3, a: "start" },
            { x: x + d - 1, y: y + d - 3, a: "start" },
            { x: x - d - w + 1, y: y - h - d + 3, a: "end" },
            { x: x - d - w + 1, y: y + d - 3, a: "end" },
          );
        }
        const fits = (b) => !(b.x < M.l - 4 || b.x + w > W - 2 || b.y < 0 || b.y + h > H - M.b);
        let ok = null;
        for (const c of cand) {
          const b = { x: c.x, y: c.y, w, h };
          if (!fits(b) || boxes.some((o) => o.own !== p && overlap(o, b))) continue;
          ok = c; break;
        }
        // Con «Todas» o si está destacado, se muestra aunque tenga que solaparse
        if (!ok && (mode === "all" || pin(p))) ok = cand.find((c) => fits({ x: c.x, y: c.y, w, h }));
        if (!ok) { p.label.style.opacity = 0; continue; }
        boxes.push({ x: ok.x, y: ok.y, w, h, own: null });
        const ax = ok.a === "start" ? ok.x : ok.a === "end" ? ok.x + w : ok.x + w / 2;
        p.label.setAttribute("x", ax.toFixed(1));
        p.label.setAttribute("y", (ok.y + h - 2).toFixed(1));
        p.label.setAttribute("text-anchor", ok.a);
        p.label.style.opacity = 1;
      }
    }

    highlight(fam, slug) {
      for (const p of this.pts.values()) {
        const on = !fam || p.model.family === fam;
        p.g.classList.toggle("dim", !on);
        p.g.classList.toggle("hl", p.model.slug === slug);
        p.label.classList.toggle("dim", !on);
      }
      for (const [f, path] of this.lines) path.classList.toggle("dim", !!fam && f !== fam);
      for (const [f, t] of this.famLabels) t.classList.toggle("dim", !!fam && f !== fam);
    }

    tipHtml(m) {
      const cfg = this.cfg;
      const mx = METRICS.get(cfg.x), my = METRICS.get(cfg.y);
      let h = `<div class="tt-h">${famIcon(m.family)}${esc(modelText(m))}</div>`;
      h += ttRow(my.short, fmt(cfg.y, val(m, cfg.y)));
      h += ttRow(mx.short, fmt(cfg.x, val(m, cfg.x)));
      for (const id of ["intelligence_index", "cost_per_task_usd", "time_per_task_s"]) {
        if (id !== cfg.x && id !== cfg.y) h += ttRow(METRICS.get(id).short, fmt(id, val(m, id)));
      }
      const p = this.pts.get(m.slug);
      if (p && p.tag) h += `<div class="tt-n"><b style="color:var(--ink)">${esc(p.tag)}</b></div>`;
      const notes = [extNote(cfg.x, m), extNote(cfg.y, m)].filter(Boolean);
      if (notes.length) h += `<div class="tt-n">${notes.map(esc).join("<br>")}</div>`;
      if (this.front.has(m.slug)) h += `<span class="tt-tag">● En la frontera de Pareto</span>`;
      return h + pinHint(m.slug);
    }
  }

  function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

  function niceTicks(a, b, count) {
    const span = b - a;
    if (span <= 0) return [a];
    let step = Math.pow(10, Math.floor(Math.log10(span / count)));
    const err = span / count / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    const out = [];
    for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toPrecision(12));
    return out;
  }
  function logTicks(a, b) {
    const out = [];
    for (let k = Math.floor(Math.log10(a)); k <= Math.ceil(Math.log10(b)); k++) {
      for (const m of [1, 2, 5]) { const v = m * Math.pow(10, k); if (v >= a && v <= b) out.push(v); }
    }
    if (out.length < 3) {
      out.length = 0;
      for (let k = Math.floor(Math.log10(a)); k <= Math.ceil(Math.log10(b)); k++) {
        for (const m of [1, 1.5, 2, 3, 5, 7]) { const v = m * Math.pow(10, k); if (v >= a && v <= b) out.push(v); }
      }
    }
    return out;
  }
  function paretoSet(pts, xId, yId) {
    const hx = METRICS.get(xId).hib ? 1 : -1, hy = METRICS.get(yId).hib ? 1 : -1;
    const set = new Set();
    for (const p of pts) {
      const px = hx * val(p, xId), py = hy * val(p, yId);
      const dominated = pts.some((q) => {
        if (q === p) return false;
        const qx = hx * val(q, xId), qy = hy * val(q, yId);
        return qx >= px && qy >= py && (qx > px || qy > py);
      });
      if (!dominated) set.add(p.slug);
    }
    return set;
  }

  /* ================= Barras animadas (FLIP) ================= */
  function renderBars(host, rows, opts = {}) {
    host._rows ||= new Map();
    const old = new Map();
    for (const [k, r] of host._rows) old.set(k, r.el.getBoundingClientRect().top);
    const keep = new Set(rows.map((r) => r.key));
    for (const [k, r] of host._rows) if (!keep.has(k)) { r.el.remove(); host._rows.delete(k); }
    const empty = host.querySelector(".empty");
    if (empty) empty.remove();
    if (!rows.length) {
      host.insertAdjacentHTML("beforeend", `<div class="empty">${opts.empty || "No hay datos para los modelos visibles."}</div>`);
      return;
    }

    rows.forEach((r, i) => {
      let rec = host._rows.get(r.key);
      const isNew = !rec;
      if (isNew) {
        const el = document.createElement("div");
        el.className = "bar-row";
        el.innerHTML = `<span class="rk"></span><span class="nm"></span><div class="track"><div class="dot-rail"></div><div class="ci"></div><div class="fill"></div><div class="dotmark"></div></div><span class="val"></span>`;
        rec = { el, fill: el.querySelector(".fill"), dot: el.querySelector(".dotmark"), ci: el.querySelector(".ci"), rail: el.querySelector(".dot-rail") };
        bindTip(el, () => (rec.tip ? rec.tip() : "") + pinHint(rec.pin));
        host._rows.set(r.key, rec);
      }
      rec.tip = r.tip;
      // r.pin: modelo que se destaca al hacer clic (por defecto, el de la fila)
      rec.pin = r.pin || r.key;
      const el = rec.el;
      el.dataset.pin = el.dataset.pick = rec.pin;
      el.classList.toggle("best", i === 0);
      el.querySelector(".rk").textContent = i + 1;
      el.querySelector(".nm").innerHTML = `${r.icon || famIcon(r.family)}<span class="t">${r.name}</span>`;
      el.querySelector(".val").innerHTML = `${esc(r.display)}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}`;
      el.style.setProperty("--c", r.color);
      el.style.setProperty("--cd", r.cd || famDark(r.family));
      const dotMode = r.mode === "dot";
      rec.fill.style.display = dotMode ? "none" : "";
      rec.dot.style.display = dotMode ? "" : "none";
      rec.rail.style.display = dotMode ? "" : "none";
      rec.ci.style.display = dotMode && r.ci ? "" : "none";
      const apply = () => {
        if (dotMode) {
          rec.dot.style.left = (r.frac * 100).toFixed(2) + "%";
          if (r.ci) { rec.ci.style.left = (r.ci[0] * 100) + "%"; rec.ci.style.width = Math.max(0, (r.ci[1] - r.ci[0]) * 100) + "%"; }
        } else {
          rec.fill.style.width = (clamp(r.frac, 0, 1) * 100).toFixed(2) + "%";
          if (r.segs) {
            rec.fill.classList.remove("solid");
            rec.fill.style.background = "transparent";
            if (rec.fill.children.length !== r.segs.length) rec.fill.innerHTML = r.segs.map(() => `<div class="seg"></div>`).join("");
            r.segs.forEach((s, j) => { const d = rec.fill.children[j]; d.style.flexGrow = Math.max(0, s.w); d.style.background = s.color; });
          } else {
            rec.fill.innerHTML = ""; rec.fill.classList.add("solid"); rec.fill.style.background = "";
          }
        }
      };
      if (isNew) {
        rec.fill.style.width = "0%";
        rec.dot.style.left = "0%";
        requestAnimationFrame(() => requestAnimationFrame(apply));
      } else apply();
      host.appendChild(el);
    });

    markPins();
    if (reduceMotion) return;
    for (const [k, rec] of host._rows) {
      const prev = old.get(k);
      if (prev === undefined) {
        rec.el.animate([{ opacity: 0, transform: "translateX(-10px)" }, { opacity: 1, transform: "none" }], { duration: 450, easing: "cubic-bezier(.22,1,.36,1)", delay: Math.min(300, [...host._rows.keys()].indexOf(k) * 18), fill: "backwards" });
      } else {
        const dy = prev - rec.el.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) rec.el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 650, easing: "cubic-bezier(.22,1,.36,1)" });
      }
    }
  }

  // Filas de ranking para una métrica
  function rankRows(id, models) {
    const m = METRICS.get(id);
    const withV = models.filter((x) => val(x, id) !== null);
    withV.sort((a, b) => (m.hib ? val(b, id) - val(a, id) : val(a, id) - val(b, id)));
    if (G.oneEff) withV.splice(0, withV.length, ...oneEach(withV));
    const vs = withV.map((x) => val(x, id));
    const ciVals = m.ci ? withV.flatMap((x) => m.ci.map((c) => x.v[c]).filter((v) => v != null)) : [];
    const lo = Math.min(...vs, ...ciVals), hi = Math.max(...vs, ...ciVals);
    const dot = m.unit === "elo" || lo < 0 || (G.barScale === "fit" && withV.length > 1);
    let a = 0, b = hi;
    if (m.unit === "score") b = 100;
    if (dot) { const p = (hi - lo) * 0.06 || 1; a = lo - p; b = hi + p; }
    const pos = (v) => (b === a ? 1 : (v - a) / (b - a));
    return withV.map((x) => {
      const v = val(x, id);
      const ci = m.ci && x.v[m.ci[0]] != null ? [pos(x.v[m.ci[0]]), pos(x.v[m.ci[1]])] : null;
      return {
        key: x.slug, family: x.family, name: modelName(x), color: famColor(x.family),
        value: v, display: fmt(id, v), frac: dot ? pos(v) : (b ? v / b : 0), mode: dot ? "dot" : "bar", ci,
        sub: ci ? `${fmt(id, x.v[m.ci[0]])}–${fmt(id, x.v[m.ci[1]])}` : "",
        tip: () => {
          let h = `<div class="tt-h">${famIcon(x.family)}${esc(modelText(x))}</div>` + ttRow(m.short, fmt(id, v));
          if (m.group) {
            const r = groupScore(x, m.group);
            for (const p of r.parts) h += ttRow(`${METRICS.get(p.id).short}${p.used ? "" : " (no cuenta)"}`, p.raw === null ? "—" : `${fmt(p.id, p.raw)} · ${nf(0).format(p.n)}`);
            h += `<div class="tt-n">Valor bruto · nota normalizada 0–100. Cuentan ${r.usedN} de ${r.eligible} benchmarks.</div>`;
          } else {
            for (const k of ["intelligence_index", "cost_per_task_usd"]) if (k !== id) h += ttRow(METRICS.get(k).short, fmt(k, val(x, k)));
          }
          const n = extNote(id, x);
          if (n) h += `<div class="tt-n">${esc(n)}</div>`;
          return h;
        },
      };
    });
  }

  /* ================= Componentes: desplegables ================= */
  // Cierra cualquier desplegable abierto con toque al pulsar fuera
  document.addEventListener("click", (e) => {
    document.querySelectorAll(".fam.open, .dd.open").forEach((el) => { if (!el.contains(e.target)) el.classList.remove("open"); });
    document.querySelectorAll(".drawer.open").forEach((el) => { if (!isMouse() && !el.contains(e.target)) el.classList.remove("open"); });
  });

  // Botón con lista que se despliega al pasar el ratón
  function dropdown(host, label, items) {
    host.innerHTML = `<button class="dd-btn" type="button">${esc(label)}<span class="cur"></span></button><div class="dd-pop"><div class="dd-list"></div></div>`;
    const btn = host.querySelector(".dd-btn"), list = host.querySelector(".dd-list");
    btn.onclick = () => { if (!isMouse()) host.classList.toggle("open"); };
    host.addEventListener("pointerleave", () => host.classList.remove("shut"));
    for (const it of items) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = it.text; b.dataset.k = it.key;
      b.onclick = () => { it.fn(); host.classList.remove("open"); host.classList.add("shut"); b.blur(); btn.blur(); };
      list.appendChild(b);
    }
    return {
      update(activeKey) {
        let cur = "";
        list.querySelectorAll("button").forEach((b) => { const on = b.dataset.k === activeKey; b.classList.toggle("active", on); if (on) cur = b.textContent; });
        host.querySelector(".cur").textContent = cur ? "· " + cur : "";
      },
    };
  }

  // Empresas: config.js > companies; las familias se agrupan en el orden de config.js > families
  const COMPANIES = [...new Set(FAM_ORDER.map((f) => (MODELS.find((m) => m.family === f) || {}).provider).filter(Boolean))];
  const coName = (c) => ((C.companies || {})[c] || {}).name || c;
  const coAbbr = (c) => ((C.companies || {})[c] || {}).abbr || coName(c).slice(0, 1);

  // Chips por familia, agrupados por empresa; al pasar el ratón se despliegan sus efforts.
  // El nombre de la empresa marca o desmarca todas sus familias de una vez.
  function famPicker(host, o) {
    host.innerHTML = "";
    const parts = [], cos = [];
    const act = (fn) => { fn(); o.changed(); update(); };
    for (const co of COMPANIES) {
      const fams = FAM_ORDER.filter((f) => famModels(f).some((m) => m.provider === co));
      if (!fams.length) continue;
      const cms = fams.flatMap((f) => famModels(f));
      const g = document.createElement("div");
      g.className = "co"; g.dataset.co = co;
      const cb = document.createElement("button");
      cb.type = "button"; cb.className = "co-btn";
      cb.innerHTML = `<span class="co-box" aria-hidden="true"></span><span class="co-n">${esc(coName(co))}</span><span class="co-a">${esc(coAbbr(co))}</span>`;
      cb.title = o.coTitle || "";
      cb.setAttribute("aria-label", coName(co));
      cb.onclick = () => act(() => o.onCompany(co, cms));
      if (o.onCompanySolo) cb.ondblclick = () => act(() => o.onCompanySolo(co, cms));
      g.appendChild(cb);
      cos.push({ co, cms, cb });
      host.appendChild(g);
      for (const f of fams) {
        const ms = famModels(f);
        const wrap = document.createElement("div");
        wrap.className = "fam";
        const chip = document.createElement("button");
        chip.type = "button"; chip.className = "chip";
        chip.innerHTML = `${famIcon(f)}<span>${esc(famShort(f))}</span><span class="cnt"></span>`;
        chip.title = (famLong(f) || f) + (o.title ? " · " + o.title : "");
        const pop = document.createElement("div");
        pop.className = "fam-pop";
        pop.style.setProperty("--cd", famDark(f));
        pop.innerHTML = `<div class="fam-pop-in"><div class="pop-h">${famIcon(f)}<span>${esc(famLong(f) || f)}</span><span class="pop-co">${esc(coName(co))}</span></div>${ms.map((m) => `<button type="button" class="eff-row" data-s="${m.slug}"><span class="box"></span><span>${esc(m.effort)}</span><span class="ev">${o.hint ? o.hint(m) : ""}</span></button>`).join("")}
          <div class="pop-foot">${o.foot.map((b, i) => `<button type="button" data-i="${i}">${esc(b.text)}</button>`).join("")}</div></div>`;
        chip.onclick = () => {
          if (!isMouse()) {
            const was = wrap.classList.contains("open");
            host.querySelectorAll(".fam.open").forEach((w) => w.classList.remove("open"));
            wrap.classList.toggle("open", !was);
            return;
          }
          act(() => o.onFam(f, ms));
        };
        if (o.onSolo) chip.ondblclick = () => act(() => o.onSolo(f, ms));
        pop.querySelectorAll(".eff-row").forEach((b) => b.onclick = () => act(() => o.onModel(ms.find((x) => x.slug === b.dataset.s))));
        pop.querySelectorAll(".pop-foot button").forEach((b) => b.onclick = () => act(() => o.foot[+b.dataset.i].fn(f, ms)));
        // El desplegable nunca se sale de la pantalla, ni por la derecha ni por la izquierda
        const fit = () => {
          pop.style.marginLeft = "";
          const r = pop.getBoundingClientRect();
          if (r.right > innerWidth - 8) pop.style.marginLeft = Math.round(innerWidth - 8 - r.right) + "px";
          else if (r.left < 8) pop.style.marginLeft = Math.round(8 - r.left) + "px";
        };
        wrap.addEventListener("pointerenter", fit);
        chip.addEventListener("click", fit);
        wrap.append(chip, pop);
        g.appendChild(wrap);
        parts.push({ f, ms, chip, pop });
      }
    }
    function update() {
      for (const p of parts) {
        const on = p.ms.filter(o.isOn).length, tot = p.ms.length;
        if (o.mode === "select") {
          p.chip.classList.toggle("sel", on > 0);
          p.chip.querySelector(".cnt").textContent = on ? on : "";
        } else {
          p.chip.classList.toggle("off", on === 0);
          p.chip.classList.toggle("part", on > 0 && on < tot);
          p.chip.querySelector(".cnt").textContent = on < tot ? `${on}/${tot}` : "";
        }
        p.pop.querySelectorAll(".eff-row").forEach((b) => {
          const m = p.ms.find((x) => x.slug === b.dataset.s);
          b.classList.toggle("on", o.isOn(m));
          b.disabled = o.disabled ? o.disabled(m) : false;
        });
      }
      for (const c of cos) {
        const on = c.cms.filter(o.isOn).length;
        const st = on === 0 ? "off" : on === c.cms.length || o.mode === "select" ? "on" : "part";
        c.cb.classList.toggle("on", st === "on"); c.cb.classList.toggle("part", st === "part"); c.cb.classList.toggle("off", st === "off");
        c.cb.setAttribute("aria-pressed", st === "on" ? "true" : st === "part" ? "mixed" : "false");
      }
    }
    update();
    return { update };
  }

  /* ================= Cabecera plegable ================= */
  const TAB_NAMES = { inicio: "Inicio", tareas: "Para qué", suscripciones: "Suscripciones", explorar: "Explorar", ranking: "Ranking", ponderar: "Ponderar", mapa: "Mapa", comparar: "Comparar" };
  const top = $("#top");
  let hdrClose = 0, hdrSettle = 0, hdrShut = false;
  function openHdr() {
    clearTimeout(hdrClose);
    if (top.classList.contains("open")) return;
    top.classList.add("open");
    moveInk();
    hdrSettle = setTimeout(() => top.classList.add("settled"), 420);
  }
  function closeHdr() {
    clearTimeout(hdrSettle); clearTimeout(hdrClose);
    top.classList.remove("open", "settled");
    top.querySelectorAll(".fam.open").forEach((w) => w.classList.remove("open"));
  }
  // Se despliega al pasar por la barra, salvo encima de los chips de modelos (que tienen su propio desplegable)
  top.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse" || hdrShut) return;
    if (!top.classList.contains("open") && e.target.closest("#famFilter, #pins, #priceSel")) { clearTimeout(hdrClose); return; }
    openHdr();
  });
  top.addEventListener("pointerleave", (e) => { if (e.pointerType !== "mouse") return; hdrShut = false; hdrClose = setTimeout(closeHdr, 260); });
  $("#bar").addEventListener("click", (e) => { if (!isMouse() && !e.target.closest("#famFilter, #pins, #priceSel, #brand")) top.classList.contains("open") ? closeHdr() : openHdr(); });
  top.addEventListener("focusin", openHdr);
  top.addEventListener("focusout", (e) => { if (!top.contains(e.relatedTarget) && !top.matches(":hover")) closeHdr(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const busy = top.classList.contains("open") || document.querySelector(".drawer.open, .fam.open, .dd.open");
      closeHdr(); document.querySelectorAll(".drawer.open, .fam.open, .dd.open").forEach((d) => d.classList.remove("open"));
      // Sin menús abiertos: Esc quita destacados y vuelve a la vista completa
      if (!busy) { clearPins(); SCATTERS.forEach((sc) => sc.resetZoom()); }
    }
    if (/^[1-9]$/.test(e.key) && +e.key <= Object.keys(TAB_NAMES).length && !(e.target.closest && e.target.closest("input, select, textarea")) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      showTab(Object.keys(TAB_NAMES)[+e.key - 1]);
    }
  });

  function updateCrumb() {
    let t = TAB_NAMES[S.tab];
    if (S.tab === "tareas" && T.task) t += ` <span class="ctx">· ${esc(GROUP.get(T.task).name)}</span>`;
    $("#crumb").innerHTML = t;
    const vis = visible();
    $("#sum").innerHTML = `<span class="n">${vis.length}/${N}</span>`;
    $("#sum").title = `${vis.length} de ${N} modelos visibles`;
  }

  /* ================= Panel derecho plegable ================= */
  let docked = store.get("docked", false);
  document.body.classList.toggle("docked", docked);
  document.querySelectorAll(".drawer").forEach((d) => {
    let t = 0;
    const rail = d.querySelector(".rail");
    rail.title = "Pasa el ratón para abrirlo · Clic para dejarlo fijo";
    d.addEventListener("pointerenter", (e) => { if (e.pointerType !== "mouse") return; clearTimeout(t); d.classList.add("open"); });
    d.addEventListener("pointerleave", (e) => { if (e.pointerType !== "mouse") return; t = setTimeout(() => d.classList.remove("open"), 260); });
    rail.addEventListener("click", () => {
      if (isMouse() && innerWidth > 900) {
        docked = !docked; store.set("docked", docked);
        document.body.classList.toggle("docked", docked);
        if (!docked) d.classList.remove("open");
      } else d.classList.toggle("open");
    });
  });
  function setDrawer(on) { document.body.classList.toggle("no-drawer", !on); }

  /* ================= Pestañas ================= */
  const VIEWS = {};
  function showTab(t, push = true) {
    if (!VIEWS[t]) t = "inicio";
    const changedTab = S.tab !== t;
    S.tab = t; store.set("tab", t);
    document.body.dataset.tab = t;
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + t));
    document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"));
    moveInk();
    if (push && location.hash !== "#" + t) history.replaceState(null, "", "#" + t);
    setDrawer(!!$("#drawer-" + t));
    if (changedTab) scrollTo({ top: 0 });
    VIEWS[t]();
    updateCrumb();
  }
  function moveInk() {
    const b = $(`#tabs button[data-tab="${S.tab}"]`), ink = $("#tabInk");
    if (!b) return;
    ink.style.width = b.offsetWidth + "px";
    ink.style.transform = `translateX(${b.offsetLeft}px)`;
  }
  document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => {
    showTab(b.dataset.tab);
    hdrShut = true;
    setTimeout(closeHdr, 160);
  }));
  addEventListener("resize", moveInk);
  addEventListener("hashchange", () => showTab(location.hash.slice(1), false));

  /* ================= Filtro global de modelos ================= */
  let filterUI = null, effUI = [];
  function filtersChanged() {
    store.set("off", [...S.off]);
    filterUI.update(); updateEff(); updateCrumb();
    VIEWS[S.tab]();
    pinsChanged();
  }
  // Oculta un conjunto de modelos sin dejar la vista vacía
  function hideSet(ms) {
    const after = MODELS.filter((m) => !S.off.has(m.slug) && !ms.includes(m)).length;
    if (!after) return;
    ms.forEach((m) => S.off.add(m.slug));
  }
  function initFilters() {
    filterUI = famPicker($("#famFilter"), {
      title: "Clic: mostrar u ocultar la familia · Doble clic: solo esta · Pasa el ratón para elegir efforts",
      isOn: (m) => !S.off.has(m.slug),
      hint: (m) => (val(m, "intelligence_index") !== null ? `índice ${fmt("intelligence_index", val(m, "intelligence_index"), true)}` : ""),
      onFam: (f, ms) => { if (ms.every((m) => !S.off.has(m.slug))) hideSet(ms); else ms.forEach((m) => S.off.delete(m.slug)); },
      onSolo: (f, ms) => { S.off = new Set(MODELS.filter((m) => m.family !== f).map((m) => m.slug)); },
      onModel: (m) => { if (S.off.has(m.slug)) S.off.delete(m.slug); else hideSet([m]); },
      coTitle: "Clic: mostrar u ocultar todos los modelos de la empresa · Doble clic: solo esta empresa",
      onCompany: (co, ms) => { if (ms.every((m) => !S.off.has(m.slug))) hideSet(ms); else ms.forEach((m) => S.off.delete(m.slug)); },
      onCompanySolo: (co) => { S.off = new Set(MODELS.filter((m) => m.provider !== co).map((m) => m.slug)); },
      foot: [
        { text: "Todos", fn: (f, ms) => ms.forEach((m) => S.off.delete(m.slug)) },
        { text: "Ninguno", fn: (f, ms) => hideSet(ms) },
        { text: "Solo esta", fn: (f) => { S.off = new Set(MODELS.filter((m) => m.family !== f).map((m) => m.slug)); } },
      ],
      changed: filtersChanged,
    });
    const ef = $("#effFilter");
    ef.innerHTML = "";
    effUI = C.efforts.filter((e) => MODELS.some((m) => m.effort === e)).map((e) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = e;
      b.title = "Clic: mostrar u ocultar este effort en todas las familias · Doble clic: solo este";
      const ms = MODELS.filter((m) => m.effort === e);
      b.onclick = () => { if (ms.every((m) => !S.off.has(m.slug))) hideSet(ms); else ms.forEach((m) => S.off.delete(m.slug)); filtersChanged(); };
      b.ondblclick = () => { S.off = new Set(MODELS.filter((m) => m.effort !== e).map((m) => m.slug)); filtersChanged(); };
      ef.appendChild(b);
      return { b, ms };
    });
    $("#resetFilters").onclick = () => { S.off.clear(); filtersChanged(); };
  }
  function updateEff() {
    for (const { b, ms } of effUI) {
      const on = ms.filter((m) => !S.off.has(m.slug)).length;
      b.classList.toggle("off", on === 0);
      b.classList.toggle("part", on > 0 && on < ms.length);
    }
  }

  /* ================= Vista: Para qué ================= */
  const T = {
    task: store.get("task2", null), margin: store.get("margin", 5), mode: store.get("tmode", "cost"),
    xLog: store.get("txLog", true), yLog: store.get("tyLog", false),
  };
  if (T.task && !GROUP.has(T.task)) T.task = null;
  const MODES = [["cost", "Nota vs coste"], ["time", "Nota vs tiempo"], ["rank", "Ranking"]];
  let taskScatter = null;

  function selectTask(id) {
    const run = () => { T.task = id; store.set("task2", id); renderTareas(); updateCrumb(); scrollTo({ top: 0 }); };
    if (document.startViewTransition && !reduceMotion) document.startViewTransition(run);
    else run();
  }

  function initTareas() {
    // Rejilla de inicio
    const grid = $("#groupGrid");
    GROUPS.forEach((g, i) => {
      const b = document.createElement("button");
      b.className = "gcard"; b.dataset.g = g.id;
      b.style.animationDelay = i * 30 + "ms";
      b.innerHTML = `<div class="gicon" style="view-transition-name:gi-${g.id}">${icon(g.icon)}</div><div class="gname">${esc(g.name)}</div>
        <div class="gleader"></div><div class="gmini"><span></span></div>`;
      b.onclick = () => selectTask(g.id);
      grid.appendChild(b);
    });
    // Tira compacta
    const strip = $("#gstrip");
    strip.innerHTML = `<button class="gpill all" title="Ver todas las tareas">${icon("grid", 17)}<span class="gl">Todas</span></button><span class="gsep"></span>` +
      GROUPS.map((g) => `<button class="gpill" data-g="${g.id}"><span style="view-transition-name:gi-${g.id};display:inline-flex">${icon(g.icon, 18)}</span><span class="gl">${esc(g.short || g.name)}</span></button>`).join("");
    strip.querySelector(".all").onclick = () => selectTask(null);
    strip.querySelectorAll(".gpill[data-g]").forEach((b) => b.onclick = () => {
      if (b.dataset.g === T.task) return;
      T.task = b.dataset.g; store.set("task2", T.task);
      renderTareas(); updateCrumb();
    });
    // Selector de vista
    const seg = $("#tdMode");
    seg.innerHTML = `<span class="seg-ink"></span>` + MODES.map(([k, t]) => `<button data-k="${k}">${t}</button>`).join("");
    seg.querySelectorAll("button").forEach((b) => b.onclick = () => { T.mode = b.dataset.k; store.set("tmode", T.mode); renderTaskDetail(); });
    // Opciones del panel
    for (const k of ["xLog", "yLog"]) {
      const c = $("#td" + k[0].toUpperCase() + k.slice(1));
      c.checked = T[k];
      c.onchange = () => { T[k] = c.checked; store.set("t" + k, T[k]); renderTaskDetail(); };
    }
    taskScatter = new Scatter($("#tdScatter"));
  }

  function renderTareas() {
    if (!taskScatter) initTareas();
    const landing = !T.task;
    $("#taskLanding").hidden = !landing;
    $("#taskDetail").hidden = landing;
    if (S.tab === "tareas") setDrawer(!landing);
    if (landing) {
      const vis = visible();
      document.querySelectorAll("#groupGrid .gcard").forEach((b) => {
        const id = "grp__" + b.dataset.g;
        const top = vis.filter((m) => val(m, id) !== null).sort((a, c) => val(c, id) - val(a, id))[0];
        b.querySelector(".gleader").innerHTML = top ? `${famIcon(top.family)}<b>${esc(famShort(top.family))} ${esc(top.effort)}</b><span>· ${nf(0).format(val(top, id))}</span>` : "sin datos";
        b.querySelector(".gmini span").style.width = (top ? val(top, id) : 0).toFixed(1) + "%";
      });
      return;
    }
    document.querySelectorAll("#gstrip .gpill[data-g]").forEach((b) => b.classList.toggle("active", b.dataset.g === T.task));
    const act = $("#gstrip .gpill.active");
    if (act) act.scrollIntoView({ block: "nearest", inline: "nearest" });
    renderTaskDetail();
  }

  // Los tres modelos recomendados para el grupo
  function taskPicks(id, vis) {
    const withV = vis.filter((m) => val(m, id) !== null);
    if (!withV.length) return null;
    const best = withV.slice().sort((a, b) => val(b, id) - val(a, id))[0];
    const bs = val(best, id);
    const ok = withV.filter((m) => val(m, id) >= bs - T.margin);
    const minBy = (arr, k) => arr.filter((m) => val(m, k) !== null).sort((a, b) => val(a, k) - val(b, k))[0];
    return { best, bs, cheap: minBy(ok, "cost_per_task_usd"), fast: minBy(ok, "time_per_task_s"), n: withV.length, ok: ok.length };
  }

  function renderTaskDetail(quick = false) {
    const g = GROUP.get(T.task), id = "grp__" + g.id;
    const vis = visible();
    $("#tdTitle").textContent = g.name;
    $("#tdDesc").textContent = g.desc;
    const seg = $("#tdMode");
    seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.k === T.mode));
    const a = seg.querySelector("button.active"), ink = seg.querySelector(".seg-ink");
    requestAnimationFrame(() => { ink.style.width = a.offsetWidth + "px"; ink.style.transform = `translateX(${a.offsetLeft}px)`; });

    const P = taskPicks(id, vis);
    const marks = new Map();
    if (P) {
      const add = (m, t) => m && marks.set(m.slug, marks.has(m.slug) ? marks.get(m.slug) + " · " + t : t);
      add(P.best, "Máximo"); add(P.cheap, "Mejor valor"); add(P.fast, "Más rápido");
    }
    renderTaskPicks(P, id, !quick);
    if (quick && T.mode !== "rank") { taskScatter.cfg.marks = marks; taskScatter.draw(false); return; }

    const rank = T.mode === "rank";
    document.querySelectorAll("#drawer-tareas [data-only]").forEach((el) => { el.hidden = el.dataset.only !== (rank ? "rank" : "chart"); });
    $("#tdScatter").hidden = rank;
    $("#tdBars").hidden = !rank;
    if (rank) {
      const rows = rankRows(id, vis);
      const TAGIC = { "Máximo": "trophy", "Mejor valor": "coin", "Más rápido": "bolt" };
      for (const r of rows) if (marks.has(r.key)) r.name += marks.get(r.key).split(" · ").map((t) => `<span class="ptg" title="${esc(t)}">${icon(TAGIC[t], 11)}</span>`).join("");
      const host = $("#tdBars");
      if (host._metric !== id) { host.innerHTML = ""; host._rows = new Map(); host._metric = id; }
      renderBars(host, rows, { empty: "Ningún modelo visible tiene datos en este grupo." });
    } else {
      const x = T.mode === "time" ? "time_per_task_s" : "cost_per_task_usd";
      taskScatter.set({
        models: vis, x, y: id, xLog: T.xLog, yLog: T.yLog, marks,
        onDraw: ({ pts, front }) => {
          // La lista de Pareto se calcula aunque la frontera no se dibuje
          const fr = G.pareto ? front : paretoSet(pts, x, id);
          const list = pts.filter((m) => fr.has(m.slug)).sort((p, q) => val(q, id) - val(p, id));
          $("#tdPareto").innerHTML = list.map((m, i) => `<li data-pin="${m.slug}" data-pick="${m.slug}" style="--cd:${famDark(m.family)};animation-delay:${i * 40}ms">${famIcon(m.family)}<span class="nm">${modelName(m)}</span>
            <span class="pv">${fmt(id, val(m, id))}<br>${fmt(x, val(m, x))}</span></li>`).join("") || `<li class="empty">Sin datos</li>`;
        },
      });
    }
    if (rank) {
      const list = vis.filter((m) => val(m, id) !== null && val(m, "cost_per_task_usd") !== null);
      const front = paretoSet(list, "cost_per_task_usd", id);
      $("#tdPareto").innerHTML = list.filter((m) => front.has(m.slug)).sort((p, q) => val(q, id) - val(p, id)).map((m) => `<li data-pin="${m.slug}" data-pick="${m.slug}" style="--cd:${famDark(m.family)}">${famIcon(m.family)}<span class="nm">${modelName(m)}</span>
        <span class="pv">${fmt(id, val(m, id))}<br>${fmt("cost_per_task_usd", val(m, "cost_per_task_usd"))}</span></li>`).join("") || `<li class="empty">Sin datos</li>`;
    }
    renderTaskBench(g, vis);
  }

  // Control de margen persistente (no se reconstruye al mover el deslizador)
  function marginCtl(host = $("#tdPicks"), onChange = scheduleTask) {
    let ctl = host.querySelector(".margin-ctl");
    if (!ctl) {
      ctl = document.createElement("div");
      ctl.className = "margin-ctl";
      ctl.innerHTML = `<label><span>Margen aceptable</span><output></output></label>
        <input type="range" min="0" max="25" step="1" aria-label="Margen aceptable en puntos">`;
      host.appendChild(ctl);
      ctl.querySelector("input").oninput = (e) => { T.margin = +e.target.value; store.set("margin", T.margin); onChange(); };
    }
    // El margen se comparte entre secciones: se sincroniza al pintar
    const r = ctl.querySelector("input");
    if (+r.value !== T.margin) r.value = T.margin;
    ctl.querySelector("output").textContent = T.margin + " pt";
    return ctl;
  }

  function renderTaskPicks(P, id, animate = true) {
    const host = $("#tdPicks");
    const ctl = marginCtl();
    host.querySelectorAll(".pickcard, .empty").forEach((c) => c.remove());
    if (!P) {
      ctl.insertAdjacentHTML("beforebegin", `<div class="empty">No hay modelos visibles con datos en este grupo.</div>`);
      $("#tdWhy").innerHTML = ""; $("#tdRailIcons").innerHTML = "";
      return;
    }
    const { best, bs, cheap, fast } = P;
    const ratio = (a, b, k) => (val(a, k) && val(b, k) ? val(a, k) / val(b, k) : null);
    const nameOf = (m) => `${esc(m.name)} <span class="peff">${esc(m.effort)}</span>`;
    const nums = (m) => `<b>${fmt(id, val(m, id))}</b> nota · <b>${fmt("cost_per_task_usd", val(m, "cost_per_task_usd"))}</b> · <b>${fmt("time_per_task_s", val(m, "time_per_task_s"))}</b>`;
    const card = (key, ic, tag, m, hero, delay) => `<div class="pickcard${hero ? " hero-pick" : ""}" data-s="${m.slug}" data-pin="${m.slug}" data-pick="${m.slug}" title="Clic: destacar en todas las vistas" style="--cd:${famDark(m.family)};${animate ? `animation-delay:${delay}ms` : "animation:none"}">
      <span class="pk">${icon(ic, 16)}</span><span class="ptag">${tag}</span>
      <span class="pname">${famIcon(m.family, 12)}${nameOf(m)}</span><span class="pnum">${nums(m)}</span></div>`;
    ctl.insertAdjacentHTML("beforebegin",
      card("best", "trophy", "Máximo rendimiento", best, true, 0) +
      (cheap ? card("cheap", "coin", "Mejor valor", cheap, false, 50) : "") +
      (fast ? card("fast", "bolt", "El más rápido", fast, false, 100) : ""));
    markPins();
    host.querySelectorAll(".pickcard").forEach((c) => {
      const m = MODELS.find((x) => x.slug === c.dataset.s);
      c.onpointerenter = () => { if (T.mode !== "rank") taskScatter.highlight(m.family, m.slug); };
      c.onpointerleave = () => { if (T.mode !== "rank") taskScatter.highlight(null); };
    });
    const cheapWhy = cheap === best ? "El mejor también es el más barato dentro del margen." :
      `${nf(1).format(bs - val(cheap, id))} pt por debajo del mejor y ${nf(1).format(ratio(best, cheap, "cost_per_task_usd"))}× más barato por tarea.`;
    const fastWhy = fast === best ? "El mejor también es el más rápido dentro del margen." :
      `${nf(1).format(bs - val(fast, id))} pt por debajo del mejor y ${nf(1).format(ratio(best, fast, "time_per_task_s"))}× más rápido por tarea.`;
    $("#tdWhy").innerHTML =
      `<p class="why"><b>${icon("trophy", 14)} Máximo rendimiento</b>Nota más alta entre los ${P.n} modelos visibles con datos.</p>` +
      (cheap ? `<p class="why"><b>${icon("coin", 14)} Mejor valor</b>El más barato por tarea entre los ${P.ok} que están a ${T.margin} pt o menos del mejor. ${cheapWhy}</p>` : "") +
      (fast ? `<p class="why"><b>${icon("bolt", 14)} El más rápido</b>El que menos tarda por tarea dentro del mismo margen. ${fastWhy}</p>` : "") +
      `<p class="hint">Sube el margen para aceptar modelos algo peores a cambio de precio o velocidad.</p>`;
    $("#tdRailIcons").innerHTML = [best, cheap, fast].filter((m, i, a) => m && a.indexOf(m) === i).map((m) => famIcon(m.family, 10)).join("");
  }
  // El deslizador redibuja como mucho una vez por fotograma
  let taskRaf = 0;
  function scheduleTask() {
    cancelAnimationFrame(taskRaf);
    taskRaf = requestAnimationFrame(() => renderTaskDetail(true));
  }

  function renderTaskBench(g, vis) {
    const core = g.items.filter(([mid]) => METRICS.get(mid).n >= coreMin);
    const totW = core.reduce((s, [, w]) => s + w, 0) || 1;
    $("#tdBenchSub").textContent = `La nota (0–100) es la media ponderada de estos benchmarks, cada uno normalizado entre el peor y el mejor modelo del dataset. ` +
      `Los parciales (menos de ${coreMin} de ${N} modelos con dato) no cuentan salvo en el Mapa con «Incluir datos parciales». Clic en un benchmark para ver su ranking.`;
    $("#tdBench").innerHTML = g.items.map(([mid, w], i) => {
      const m = METRICS.get(mid);
      const part = m.n < coreMin;
      const share = part ? 0 : w / totW;
      const top = vis.filter((x) => val(x, mid) !== null).sort((a, b) => (m.hib ? val(b, mid) - val(a, mid) : val(a, mid) - val(b, mid)))[0];
      return `<button class="bcard${part ? " off" : ""}" data-m="${mid}" style="animation:cardIn .5s var(--ease) both ${i * 40}ms">
        <div class="bh"><span class="bn">${esc(m.short)}${m.external ? `<span class="badge ext">externo</span>` : ""}${part ? `<span class="badge part">parcial ${m.n}/${N}</span>` : ""}</span>
        <span class="bw">peso ${String(w).replace(".", ",")}${part ? " · no cuenta" : ` · ${nf(0).format(share * 100)} %`}</span></div>
        <div class="wbar"><span style="width:${(part ? 0.04 : share) * 100}%"></span></div>
        <p class="bd">${esc(m.desc || "")} <i>${dirText(m)}.</i></p>
        ${top ? `<div class="bl">Mejor visible: ${famIcon(top.family)}<b>${esc(famShort(top.family))} ${esc(top.effort)}</b> · ${esc(fmt(mid, val(top, mid)))}</div>` : `<div class="bl">Sin datos para los modelos visibles</div>`}
        <span class="go">Ver ranking →</span></button>`;
    }).join("");
    $("#tdBench").querySelectorAll(".bcard").forEach((b) => b.onclick = () => { rankId = b.dataset.m; store.set("rank", rankId); showTab("ranking"); });
  }
  VIEWS.tareas = renderTareas;

  /* ================= Vista: Explorar ================= */
  const X = {
    x: store.get("x", "cost_per_task_usd"), y: store.get("y", "intelligence_index"),
    xLog: store.get("xLog", null), yLog: store.get("yLog", null),
  };
  let mainScatter = null, presetDD = null;
  function initExplorar() {
    const xs = $("#xSel"), ys = $("#ySel");
    if (!METRICS.has(X.x)) X.x = "cost_per_task_usd";
    if (!METRICS.has(X.y)) X.y = "intelligence_index";
    fillMetricSelect(xs, X.x); fillMetricSelect(ys, X.y);
    if (X.xLog === null) X.xLog = !!METRICS.get(X.x).log;
    if (X.yLog === null) X.yLog = !!METRICS.get(X.y).log;
    const setAxis = (axis, id) => {
      X[axis] = id; X[axis + "Log"] = !!METRICS.get(id).log;
      store.set(axis, id); store.set(axis + "Log", X[axis + "Log"]);
      renderExplorar();
    };
    xs.onchange = () => setAxis("x", xs.value);
    ys.onchange = () => setAxis("y", ys.value);
    $("#swapXY").onclick = () => {
      [X.x, X.y, X.xLog, X.yLog] = [X.y, X.x, X.yLog, X.xLog];
      ["x", "y", "xLog", "yLog"].forEach((k) => store.set(k, X[k]));
      renderExplorar();
    };
    for (const [elId, k] of [["xLog", "xLog"], ["yLog", "yLog"]]) {
      const c = $("#" + elId);
      c.onchange = () => { X[k] = c.checked; store.set(k, c.checked); renderExplorar(); };
    }
    presetDD = dropdown($("#scatterPresets"), "Combinaciones", C.scatterPresets.filter((p) => METRICS.has(p.x) && METRICS.has(p.y)).map((p) => ({
      key: p.x + "|" + p.y, text: p.name,
      fn: () => {
        X.x = p.x; X.y = p.y; X.xLog = !!METRICS.get(p.x).log; X.yLog = !!METRICS.get(p.y).log;
        ["x", "y", "xLog", "yLog"].forEach((k) => store.set(k, X[k]));
        renderExplorar();
      },
    })));
    mainScatter = new Scatter($("#scatterMain"));
  }
  function renderExplorar() {
    if (!mainScatter) initExplorar();
    $("#xSel").value = X.x; $("#ySel").value = X.y;
    $("#xLog").checked = X.xLog; $("#yLog").checked = X.yLog;
    presetDD.update(X.x + "|" + X.y);
    mainScatter.set({
      models: visible(), x: X.x, y: X.y, xLog: X.xLog, yLog: X.yLog,
      onDraw: ({ pts, front, missing }) => {
        $("#scatterNote").textContent = (missing ? `${missing} modelo(s) visibles no tienen dato en alguno de los ejes y no aparecen. ` : "") +
          (G.connect ? "Las líneas unen los efforts de cada familia, de low a max." : "");
        const my = METRICS.get(X.y);
        const list = pts.filter((m) => front.has(m.slug)).sort((a, b) => (my.hib ? val(b, X.y) - val(a, X.y) : val(a, X.y) - val(b, X.y)));
        $("#paretoList").innerHTML = G.pareto || G.paretoOnly ? (list.map((m, i) => `<li data-pin="${m.slug}" data-pick="${m.slug}" style="--cd:${famDark(m.family)};animation-delay:${i * 40}ms">${famIcon(m.family)}<span class="nm">${modelName(m)}</span>
          <span class="pv">${fmt(X.y, val(m, X.y))}<br>${fmt(X.x, val(m, X.x))}</span></li>`).join("") || `<li class="empty">Sin datos</li>`) : `<li class="empty">Frontera desactivada</li>`;
        $("#xRailIcons").innerHTML = G.pareto || G.paretoOnly ? list.slice(0, 8).map((m) => famIcon(m.family, 9)).join("") : "";
      },
    });
    $("#axisHelp").innerHTML = `<div class="mh"><p class="mh-k">Eje Y</p>${metricHelp(X.y)}</div><div class="mh"><p class="mh-k">Eje X</p>${metricHelp(X.x)}</div>`;
  }
  VIEWS.explorar = renderExplorar;

  /* ================= Vista: Ranking ================= */
  let rankId = store.get("rank", "intelligence_index");
  let quickDD = null;
  function initRanking() {
    const sel = $("#rankSel");
    if (!METRICS.has(rankId)) rankId = "intelligence_index";
    fillMetricSelect(sel, rankId);
    sel.onchange = () => { rankId = sel.value; store.set("rank", rankId); renderRanking(); };
    quickDD = dropdown($("#quickQs"), "Preguntas rápidas", C.quickQuestions.filter((it) => METRICS.has(it.m)).map((it) => ({
      key: it.m, text: it.q, fn: () => { rankId = it.m; store.set("rank", rankId); renderRanking(); },
    })));
  }
  function renderRanking() {
    if (!quickDD) initRanking();
    if (!METRICS.has(rankId)) rankId = "intelligence_index";
    $("#rankSel").value = rankId;
    quickDD.update(rankId);
    const m = METRICS.get(rankId);
    $("#rankHelp").innerHTML = `<div class="mh"><p class="mh-k">Qué mide</p>${metricHelp(rankId)}</div>`;
    const host = $("#rankBars");
    if (host._metric !== rankId) { host.innerHTML = ""; host._rows = new Map(); host._metric = rankId; }
    renderBars(host, rankRows(rankId, visible()), { empty: `Ningún modelo visible tiene datos de ${esc(m.short)}.` });
  }
  VIEWS.ranking = renderRanking;

  /* ================= Vista: Ponderar ================= */
  const GRAYS = ["#0b0b0b", "#4a4946", "#7a7973", "#a3a29b", "#c6c5bd", "#e0dfd8"];
  const MAX_CRIT = 6;
  let crit = store.get("crit", C.weightPresets[0].criteria.map(([id, w]) => ({ id, w })));
  crit = crit.filter((c) => METRICS.has(c.id)).slice(0, MAX_CRIT);
  const W = { normVisible: store.get("normVisible", false), missingZero: store.get("missingZero", false), preset: store.get("wpreset", null) };
  let weightDD = null;

  function initPonderar() {
    weightDD = dropdown($("#weightPresets"), "Plantillas", C.weightPresets.map((p) => ({
      key: p.name, text: p.name,
      fn: () => { crit = p.criteria.filter(([id]) => METRICS.has(id)).map(([id, w]) => ({ id, w })); W.preset = p.name; saveCrit(); buildCriteria(); renderPonderar(); },
    })));
    const nv = $("#normVisible"), mz = $("#missingZero");
    nv.checked = W.normVisible; mz.checked = W.missingZero;
    nv.onchange = () => { W.normVisible = nv.checked; store.set("normVisible", nv.checked); renderPonderar(); };
    mz.onchange = () => { W.missingZero = mz.checked; store.set("missingZero", mz.checked); renderPonderar(); };
    buildCriteria();
  }
  const saveCrit = () => { store.set("crit", crit); store.set("wpreset", W.preset); };
  const touched = () => { W.preset = null; };

  function buildCriteria() {
    const host = $("#criteria");
    host.innerHTML = "";
    crit.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "crit";
      row.style.animationDelay = i * 40 + "ms";
      row.innerHTML = `<span class="sw" style="background:${GRAYS[i]}"></span><select aria-label="Criterio ${i + 1}"></select><button class="del" title="Quitar" aria-label="Quitar criterio">×</button>
        <div class="wrow"><input type="range" min="0" max="100" step="1" value="${c.w}" aria-label="Peso"><output></output></div><div class="dir"></div>`;
      const sel = row.querySelector("select");
      fillMetricSelect(sel, c.id);
      sel.onchange = () => { c.id = sel.value; touched(); saveCrit(); updateCritMeta(); renderPonderar(); };
      row.querySelector(".del").onclick = () => { crit.splice(i, 1); touched(); saveCrit(); buildCriteria(); renderPonderar(); };
      const r = row.querySelector("input");
      r.oninput = () => { c.w = +r.value; touched(); saveCrit(); updateCritMeta(); renderPonderar(); };
      host.appendChild(row);
    });
    const add = document.createElement("button");
    add.className = "crit-add"; add.textContent = "+ Criterio";
    add.disabled = crit.length >= MAX_CRIT;
    add.onclick = () => {
      if (crit.length >= MAX_CRIT) return;
      const used = new Set(crit.map((c) => c.id));
      const next = ["intelligence_index", "cost_per_task_usd", "time_per_task_s", "grp__software", "grp__qa", "output_speed_tps"].find((i) => !used.has(i)) || "intelligence_index";
      crit.push({ id: next, w: 50 }); touched(); saveCrit(); buildCriteria(); renderPonderar();
    };
    host.appendChild(add);
    updateCritMeta();
  }
  function updateCritMeta() {
    const tot = crit.reduce((s, c) => s + c.w, 0) || 1;
    document.querySelectorAll("#criteria .crit").forEach((row, i) => {
      const c = crit[i], m = METRICS.get(c.id);
      row.querySelector("output").textContent = nf(0).format((c.w / tot) * 100) + " %";
      row.querySelector(".dir").textContent = `${m.hib ? "↑ más es mejor" : "↓ menos es mejor"}${m.log ? " · log" : ""}${m.n < N ? ` · ${m.n}/${N} con dato` : ""}`;
    });
    $("#segLegend").innerHTML = crit.map((c, i) => `<span><i style="background:${GRAYS[i]}"></i>${esc(METRICS.get(c.id).short)} · ${nf(0).format((c.w / tot) * 100)} %</span>`).join("");
    $("#critInfo").innerHTML = crit.map((c, i) => {
      const m = METRICS.get(c.id);
      return `<div class="ci-row"><i style="background:${GRAYS[i]}"></i><span><b>${esc(m.short)}</b> · ${dirText(m)}${m.log ? ", escala log" : ""}. ${esc((m.desc || "").split(". ")[0])}</span></div>`;
    }).join("");
    if (weightDD) weightDD.update(W.preset);
  }

  function renderPonderar() {
    if (!weightDD) initPonderar();
    weightDD.update(W.preset);
    const vis = visible();
    const pool = W.normVisible ? vis : null;
    const active = crit.filter((c) => c.w > 0);
    const rows = [];
    for (const m of vis) {
      let sw = 0, acc = 0, miss = 0;
      const parts = crit.map((c, i) => {
        if (c.w <= 0) return { c, i, n: null, raw: null, contrib: 0 };
        const raw = val(m, c.id);
        const n = norm(c.id, raw, pool);
        if (n === null) { miss++; if (W.missingZero) sw += c.w; return { c, i, n: null, raw, contrib: 0 }; }
        sw += c.w; acc += c.w * n;
        return { c, i, n, raw, contrib: c.w * n };
      });
      if (!sw || miss === active.length) continue;
      rows.push({ m, score: acc / sw, parts, sw, miss });
    }
    rows.sort((a, b) => b.score - a.score);
    renderBars($("#weightBars"), (G.oneEff ? oneEach(rows, (r) => r.m.family) : rows).map(({ m, score, parts, sw, miss }) => ({
      key: m.slug, family: m.family, name: modelName(m) + (miss ? ` <span class="note">*${miss} sin dato</span>` : ""),
      color: famColor(m.family), value: score, display: nf(1).format(score), frac: score / 100,
      segs: parts.map((p) => ({ w: p.contrib / sw, color: GRAYS[p.i] })),
      tip: () => {
        let h = `<div class="tt-h">${famIcon(m.family)}${esc(modelText(m))}</div>` + ttRow("Puntuación", nf(1).format(score));
        for (const p of parts) {
          if (p.c.w <= 0) continue;
          h += ttRow(METRICS.get(p.c.id).short, p.n === null ? (W.missingZero ? "sin dato (0)" : "sin dato") : `${fmt(p.c.id, p.raw)} → ${nf(0).format(p.n)}`);
        }
        h += `<div class="tt-n">Valor bruto → nota 0–100. ${miss && !W.missingZero ? "Los criterios sin dato se ignoran y su peso se reparte." : ""}</div>`;
        return h;
      },
    })), { empty: "Ajusta los pesos: ningún modelo visible tiene datos para estos criterios." });
  }
  VIEWS.ponderar = renderPonderar;

  /* ================= Vista: Mapa ================= */
  const RAMP = ["#e9f1fc", "#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281"];
  const rampColor = (s) => RAMP[clamp(Math.round((s / 100) * (RAMP.length - 1)), 0, RAMP.length - 1)];
  let mapSort = store.get("mapSort", GROUPS[0].id), mapPartial = store.get("mapPartial", false);
  if (!GROUP.has(mapSort)) mapSort = GROUPS[0].id;
  function renderMapa() {
    const pc = $("#partialMap");
    pc.checked = mapPartial;
    pc.onchange = () => { mapPartial = pc.checked; store.set("mapPartial", mapPartial); renderMapa(); };
    const vis = visible();
    const scores = new Map(vis.map((m) => [m.slug, new Map(GROUPS.map((g) => [g.id, groupScore(m, g, mapPartial)]))]));
    let sorted = vis.slice().sort((a, b) => (scores.get(b.slug).get(mapSort).score ?? -1) - (scores.get(a.slug).get(mapSort).score ?? -1));
    if (G.oneEff) sorted = oneEach(sorted);
    let h = `<table><thead><tr><th class="rowh">Modelo</th>${GROUPS.map((g) => `<th data-g="${g.id}" class="${g.id === mapSort ? "sorted" : ""}" title="${esc(g.name + ": " + g.desc)}">${icon(g.icon, 16)}<br>${esc(g.short || g.name)}</th>`).join("")}</tr></thead><tbody>`;
    sorted.forEach((m, ri) => {
      h += `<tr data-pin="${m.slug}"><td class="rowl" data-pick="${m.slug}" style="--cd:${famDark(m.family)}" title="Clic: destacar en todas las vistas">${famIcon(m.family)} ${modelName(m)}</td>`;
      GROUPS.forEach((g, ci) => {
        const r = scores.get(m.slug).get(g.id);
        const delay = Math.min(600, ri * 18 + ci * 10);
        if (r.score === null) h += `<td class="cell na" data-s="${m.slug}" data-g="${g.id}" style="animation-delay:${delay}ms">—</td>`;
        else {
          const bg = rampColor(r.score), fg = r.score >= 58 ? "#fff" : "#0b0b0b";
          h += `<td class="cell" data-s="${m.slug}" data-g="${g.id}" style="background:${bg};color:${fg};animation-delay:${delay}ms">${nf(0).format(r.score)}</td>`;
        }
      });
      h += `</tr>`;
    });
    h += `</tbody></table><div class="heat-legend"><span>0</span><span class="ramp" style="background:linear-gradient(90deg,${RAMP.join(",")})"></span><span>100</span><span>· 0 = peor del dataset en ese grupo, 100 = mejor. Celda rayada = sin datos.</span></div>`;
    const host = $("#heatmap");
    host.innerHTML = h;
    host.querySelectorAll("th[data-g]").forEach((th) => th.onclick = () => { mapSort = th.dataset.g; store.set("mapSort", mapSort); renderMapa(); });
    host.querySelectorAll("td.cell").forEach((td) => {
      const m = MODELS.find((x) => x.slug === td.dataset.s), g = GROUP.get(td.dataset.g);
      bindTip(td, () => {
        const r = scores.get(m.slug).get(g.id);
        let t = `<div class="tt-h">${famIcon(m.family)}${esc(modelText(m))}</div>` + ttRow(g.name, r.score === null ? "—" : nf(1).format(r.score));
        for (const p of r.parts) t += ttRow(`${METRICS.get(p.id).short}${p.used ? "" : " (no cuenta)"}`, p.raw === null ? "—" : `${fmt(p.id, p.raw)} · ${nf(0).format(p.n)}`);
        return t + `<div class="tt-n">Clic para ver «${esc(g.name)}» en detalle.</div>`;
      });
      td.onclick = () => { hideTip(); T.task = g.id; store.set("task2", g.id); showTab("tareas"); };
    });
    markPins();
    const mg = $("#mapGroups");
    if (!mg.childElementCount) {
      mg.innerHTML = GROUPS.map((g) => `<div class="mg"><b>${icon(g.icon, 15)}${esc(g.name)}</b>${esc(g.desc)}
        <div class="mm">${g.items.map(([i, w]) => `${esc(METRICS.get(i).short)} ×${String(w).replace(".", ",")}${METRICS.get(i).n < coreMin ? " (parcial)" : ""}`).join(" · ")}</div></div>`).join("");
    }
  }
  VIEWS.mapa = renderMapa;

  /* ================= Vista: Comparar ================= */
  const MAX_CMP = 6;
  // Por defecto: el effort más alto de cada familia, las 6 familias con mejor índice
  const defaultCmp = FAM_ORDER.map((f) => famModels(f)[0]).filter(Boolean)
    .sort((a, b) => (val(b, "intelligence_index") ?? -1) - (val(a, "intelligence_index") ?? -1)).map((m) => m.slug).slice(0, MAX_CMP);
  let cmpSel = store.get("cmp", defaultCmp).filter((s) => MODELS.some((m) => m.slug === s));
  let cmpCat = store.get("cmpCat", "all"), cmpOnly = store.get("cmpOnly", true);
  let cmpUI = null;
  function initComparar() {
    cmpUI = famPicker($("#cmpPick"), {
      mode: "select",
      title: "Clic: añadir o quitar la familia · Pasa el ratón para elegir efforts",
      isOn: (m) => cmpSel.includes(m.slug),
      disabled: (m) => !cmpSel.includes(m.slug) && cmpSel.length >= MAX_CMP,
      onFam: (f, ms) => {
        if (ms.some((m) => cmpSel.includes(m.slug))) cmpSel = cmpSel.filter((s) => !ms.some((m) => m.slug === s));
        else if (cmpSel.length < MAX_CMP) cmpSel.push(ms[0].slug);
      },
      onModel: (m) => {
        if (cmpSel.includes(m.slug)) cmpSel = cmpSel.filter((s) => s !== m.slug);
        else if (cmpSel.length < MAX_CMP) cmpSel.push(m.slug);
      },
      coTitle: "Clic: añadir el mejor effort de cada familia de la empresa, o quitarlos",
      onCompany: (co, ms) => {
        if (ms.some((m) => cmpSel.includes(m.slug))) { cmpSel = cmpSel.filter((s) => !ms.some((m) => m.slug === s)); return; }
        for (const f of new Set(ms.map((m) => m.family))) if (cmpSel.length < MAX_CMP) cmpSel.push(famModels(f)[0].slug);
      },
      foot: [
        { text: "Quitar familia", fn: (f, ms) => { cmpSel = cmpSel.filter((s) => !ms.some((m) => m.slug === s)); } },
      ],
      changed: () => { store.set("cmp", cmpSel); renderComparar(); },
    });
    const cs = $("#cmpCat");
    cs.innerHTML = `<option value="all">Todas</option>` + CAT_ORDER.filter((c) => [...METRICS.values()].some((m) => m.cat === c)).map((c) => `<option value="${c}">${esc(catName(c))}</option>`).join("");
    cs.onchange = () => { cmpCat = cs.value; store.set("cmpCat", cmpCat); renderComparar(); };
    $("#cmpOnlyData").onchange = (e) => { cmpOnly = e.target.checked; store.set("cmpOnly", cmpOnly); renderComparar(); };
  }
  function renderComparar() {
    if (!cmpUI) initComparar();
    cmpUI.update();
    $("#cmpCat").value = cmpCat; $("#cmpOnlyData").checked = cmpOnly;
    const sel = cmpSel.map((s) => MODELS.find((m) => m.slug === s));
    const host = $("#cmpTable");
    if (!sel.length) { host.innerHTML = `<div class="empty">Elige modelos arriba: pasa el ratón por una familia para escoger sus efforts.</div>`; return; }
    let h = `<table class="cmp"><thead><tr><th>Métrica</th>${sel.map((m) => `<th data-pin="${m.slug}" data-pick="${m.slug}" style="--cd:${famDark(m.family)}" title="Clic: destacar en todas las vistas"><div class="hn">${famIcon(m.family)}${esc(famShort(m.family))}<button class="rm" data-s="${m.slug}" title="Quitar" aria-label="Quitar">×</button></div><span class="he">${esc(m.effort)}</span></th>`).join("")}</tr></thead><tbody>`;
    for (const c of CAT_ORDER) {
      if (cmpCat !== "all" && cmpCat !== c) continue;
      const ms = [...METRICS.values()].filter((m) => m.cat === c && (!cmpOnly || sel.some((x) => val(x, m.id) !== null)));
      if (!ms.length) continue;
      h += `<tr class="cat"><td colspan="${sel.length + 1}">${esc(catName(c))}</td></tr>`;
      for (const m of ms) {
        const vs = sel.map((x) => val(x, m.id));
        const have = vs.filter((v) => v !== null);
        const bestV = have.length > 1 ? (m.hib ? Math.max(...have) : Math.min(...have)) : null;
        h += `<tr><td class="mn">${esc(m.short)}${m.external ? `<span class="badge ext">ext</span>` : ""}<span class="u">${m.hib ? "↑" : "↓"}</span></td>`;
        sel.forEach((x, i) => {
          const v = vs[i];
          if (v === null) { h += `<td class="v na" data-pin="${x.slug}">—</td>`; return; }
          const n = norm(m.id, v);
          h += `<td class="v${v === bestV ? " best" : ""}" data-pin="${x.slug}" style="--c:${famColor(x.family)}">${esc(fmt(m.id, v))}<div class="mb"><span style="width:${n.toFixed(1)}%"></span></div></td>`;
        });
        h += `</tr>`;
      }
    }
    host.innerHTML = h + `</tbody></table>`;
    host.querySelectorAll(".rm").forEach((b) => b.onclick = () => { cmpSel = cmpSel.filter((s) => s !== b.dataset.s); store.set("cmp", cmpSel); renderComparar(); });
    markPins();
  }
  VIEWS.comparar = renderComparar;

  /* ================= Vista: Inicio ================= */
  // Áreas para las gráficas de la portada: índice general + grupos de tareas (sin «Eficiencia», que ya mezcla precio)
  const HOME_AREAS = [{ id: "intelligence_index", name: "Índice general", short: "General", icon: "trophy" },
    ...GROUPS.filter((g) => g.id !== "efficiency").map((g) => ({ id: "grp__" + g.id, name: g.name, short: g.short || g.name, icon: g.icon }))];
  const AREA = new Map(HOME_AREAS.map((a) => [a.id, a]));
  // by: comparar modelos o suscripciones (común a las dos tarjetas)
  const HOME = { sc: store.get("hSc", "intelligence_index"), rk: store.get("hRk", "intelligence_index"), all: false, by: PR ? store.get("hBy", "models") : "models" };
  for (const k of ["sc", "rk"]) if (!AREA.has(HOME[k]) || !METRICS.has(HOME[k])) HOME[k] = "intelligence_index";
  let homeScatter = null;
  const COST = "cost_per_task_usd";
  const longName = (m) => `${esc(m.name)} ${esc(m.effort)}`;
  const nameTag = (m) => `<b class="mname" style="--cd:${famDark(m.family)}">${famIcon(m.family, 10)}${longName(m)}</b>`;
  const subTag = (m) => `<b class="mname" style="--cd:${subDark(m)}">${subIcon(m, 10)}${longName(m)}</b>`;
  // Nivel de precio de la gráfica de suscripciones (≈ 20 € o ≈ 100 € al mes)
  const TIERS = ((PR && PR.homeTiers) || []).map((t) => ({ ...t, plans: t.plans.filter((id) => PLAN.has(id)) })).filter((t) => t.plans.length);
  HOME.tier = store.get("hTier", TIERS[0] ? TIERS[0].id : null);
  if (!TIERS.some((t) => t.id === HOME.tier)) HOME.tier = TIERS[0] ? TIERS[0].id : null;
  const homeTier = () => TIERS.find((t) => t.id === HOME.tier);

  function segInk(seg) {
    const a = seg.querySelector("button.active"), ink = seg.querySelector(".seg-ink");
    if (!a || !ink) return;
    requestAnimationFrame(() => { ink.style.width = a.offsetWidth + "px"; ink.style.transform = `translateX(${a.offsetLeft}px)`; });
  }
  // Cambia la escala de precios desde la portada (sincronizada con el selector de la barra)
  function setPriceMode(m) {
    const next = m === "sub" ? "sub" : PRICE.mode === "sub" ? "eur" : PRICE.mode;
    if (next === PRICE.mode) return;
    PRICE.mode = next; store.set("price", PRICE);
    applyPrice(); priceRender();
    for (const sc of SCATTERS) sc.zoom = null;
    VIEWS[S.tab]();
  }
  // Ejecuta fn con otra escala de precios y deja todo como estaba
  function withPrice(mode, fn) {
    const prev = PRICE.mode;
    if (prev === mode) return fn();
    PRICE.mode = mode; applyPrice();
    try { return fn(); } finally { PRICE.mode = prev; applyPrice(); }
  }

  function initInicio() {
    $("#heroLogo").innerHTML = logoSVG(84, "big");
    document.querySelectorAll("#view-inicio .hstrip").forEach((strip) => {
      const key = strip.dataset.area;
      strip.innerHTML = HOME_AREAS.map((a) => `<button type="button" class="gpill" data-a="${a.id}" title="${esc(a.name)}">${icon(a.icon, 18)}<span class="gl">${esc(a.short)}</span></button>`).join("");
      strip.addEventListener("click", (e) => {
        const b = e.target.closest(".gpill");
        if (!b || HOME[key] === b.dataset.a) return;
        HOME[key] = b.dataset.a; store.set(key === "sc" ? "hSc" : "hRk", HOME[key]);
        if (key === "rk") HOME.all = false;
        renderInicio();
      });
    });
    document.querySelectorAll("#view-inicio [data-price]").forEach((seg) => {
      if (!PR) { seg.remove(); return; }
      seg.innerHTML = `<span class="seg-ink"></span><button type="button" data-m="sub">€ suscripción</button><button type="button" data-m="api">Precio de API</button>`;
      seg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setPriceMode(b.dataset.m); });
    });
    document.querySelectorAll("#view-inicio [data-tier]").forEach((seg) => {
      if (!TIERS.length) { seg.remove(); return; }
      seg.innerHTML = `<span class="seg-ink"></span>` + TIERS.map((t) => `<button type="button" data-t="${esc(t.id)}">${esc(t.name)}</button>`).join("");
      seg.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b || b.dataset.t === HOME.tier) return;
        HOME.tier = b.dataset.t; store.set("hTier", HOME.tier); renderInicio();
      });
    });
    document.querySelectorAll("#view-inicio [data-by]").forEach((seg) => {
      if (!PR) { seg.remove(); return; }
      seg.innerHTML = `<span class="seg-ink"></span><button type="button" data-b="models">Modelos</button><button type="button" data-b="subs">Suscripciones</button>`;
      seg.addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b || b.dataset.b === HOME.by) return;
        HOME.by = b.dataset.b; store.set("hBy", HOME.by); renderInicio();
      });
    });
    homeScatter = new Scatter($("#hpScatter"));
    $("#hrMore").onclick = () => { HOME.all = !HOME.all; renderInicio(); };
    $("#hrOpen").onclick = () => {
      if (HOME.by === "subs") { SUB.area = HOME.rk; SUB.mode = "rank"; saveSub(); showTab("suscripciones"); return; }
      rankId = HOME.rk; store.set("rank", rankId); showTab("ranking");
    };
    document.querySelectorAll("#view-inicio [data-go]").forEach((b) => b.onclick = () => showTab(b.dataset.go));

    // Secciones
    const NAV = [
      ["tareas", "target", "Elige una tarea y te digo qué modelo rinde más, cuál da casi lo mismo por mucho menos y cuál termina antes."],
      ...(PR ? [["suscripciones", "plans", "Compara planes de pago: la frontera de cada uno y lo mejor que te da cada suscripción en tu área."]] : []),
      ["explorar", "scatter", "Cruza dos métricas cualesquiera y busca la frontera de Pareto, con zoom y destacados."],
      ["ranking", "bars", "Quién gana en cada benchmark, en coste, en tokens o en velocidad."],
      ["ponderar", "sliders", "Mezcla varios criterios con tus propios pesos y obtén tu ranking."],
      ["mapa", "grid", "La nota de cada modelo en todas las áreas, de un vistazo."],
      ["comparar", "columns", "Hasta seis modelos cara a cara, métrica a métrica."],
    ];
    const ng = $("#homeNavGrid");
    ng.innerHTML = NAV.map(([t, ic, d], i) => `<a class="ncard" href="#${t}" style="--d:${i * 50}ms"><span class="gicon">${icon(ic)}</span>
      <span class="nn">${esc(TAB_NAMES[t])}<span class="nk">${Object.keys(TAB_NAMES).indexOf(t) + 1}</span></span><span class="nd">${esc(d)}</span><span class="go">Abrir →</span></a>`).join("");

    // Créditos: benchmarks agrupados por fuente, sin repetir página
    const bySrc = new Map();
    for (const m of METRICS.values()) {
      if (!m.url || m.cat === "group") continue;
      const src = m.source || "Otros";
      if (!bySrc.has(src)) bySrc.set(src, new Map());
      const urls = bySrc.get(src);
      if (urls.has(m.url)) continue;
      let t = /personalitybench/.test(m.url) ? "PersonalityBench" : m.short.replace(/\s*\([^)]*\)/g, "").replace(/:.*$/, "").trim();
      urls.set(m.url, t);
    }
    const nBench = [...bySrc.values()].reduce((s, u) => s + u.size, 0);
    const SRC_INFO = {
      "Artificial Analysis": ["https://artificialanalysis.ai", "Índice de inteligencia, índices por dominio, benchmarks, precios, costes por tarea, tokens y velocidades. Es la base de casi todo."],
      "Vals AI": ["https://www.vals.ai", "Benchmark externo de ciberseguridad."],
      "benchmarklist.com": ["https://benchmarklist.com", "Recopilación de resultados de benchmarks externos."],
    };
    const blocks = [...bySrc.entries()].sort((a, b) => b[1].size - a[1].size).map(([src, urls]) => {
      const [home, desc] = SRC_INFO[src] || ["", "Resultados publicados por el fabricante y recogidos por benchmarklist.com."];
      return `<div class="credit"><div class="cr-h">${home ? `<a href="${esc(home)}" target="_blank" rel="noopener">${esc(src)} ↗</a>` : esc(src)}<span>${urls.size} ${urls.size === 1 ? "benchmark" : "benchmarks"}</span></div>
        <p>${esc(desc)}</p><div class="cr-list">${[...urls].map(([u, t]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join("")}</div></div>`;
    });
    if (PR) blocks.push(`<div class="credit"><div class="cr-h">Precios de suscripción<span>${PR.sources.length} fuentes</span></div>
      <p>Estimaciones de terceros de cuánto uso de API cabe en cada plan. Cambio $/€ del BCE (${esc(PR.fxDate)}).</p>
      <div class="cr-list">${PR.sources.map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`).join("")}</div></div>`);
    $("#creditGrid").innerHTML = blocks.join("");
    $("#heroStats").innerHTML = `<span><b>${N}</b> modelos</span><span><b>${FAM_ORDER.length}</b> familias</span><span><b>${nBench}</b> benchmarks</span><span>datos del <b>${esc(fetched.split("-").reverse().join("-"))}</b></span>`;

    // Aparición suave al hacer scroll
    if ("IntersectionObserver" in window && !reduceMotion) {
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
      document.querySelectorAll("#view-inicio .reveal").forEach((el) => io.observe(el));
    } else document.querySelectorAll("#view-inicio .reveal").forEach((el) => el.classList.add("in"));
  }

  function renderInicio() {
    if (!homeScatter) initInicio();
    const vis = visible();
    // Controles
    document.querySelectorAll("#view-inicio .hstrip").forEach((strip) => {
      strip.querySelectorAll(".gpill").forEach((b) => b.classList.toggle("active", b.dataset.a === HOME[strip.dataset.area]));
    });
    const bySubs = HOME.by === "subs";
    document.querySelectorAll("#view-inicio [data-by]").forEach((seg) => {
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.b === HOME.by));
      segInk(seg);
    });
    // Con suscripciones, la gráfica elige el nivel de precio de los planes
    document.querySelectorAll("#view-inicio [data-tier]").forEach((seg) => {
      seg.hidden = !bySubs;
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.t === HOME.tier));
      if (bySubs) segInk(seg);
    });
    // Con suscripciones todo va en € de suscripción: el selector de escala sobra
    document.querySelectorAll("#view-inicio [data-price]").forEach((seg) => {
      seg.hidden = bySubs;
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", (b.dataset.m === "sub") === (PRICE.mode === "sub")));
      seg.querySelector('[data-m="api"]').textContent = PRICE.mode === "usd" ? "$ de API" : "€ de API";
      segInk(seg);
    });
    $("#hpSub").textContent = bySubs
      ? "Cada línea es la frontera de Pareto de un plan: los modelos que incluye que ningún otro del mismo plan mejora a la vez en nota y en € por tarea. Arriba a la izquierda, mejor."
      : "Arriba a la izquierda está lo mejor: más nota por menos dinero. Los puntos rellenos forman la frontera: ningún otro modelo los mejora en las dos cosas a la vez.";
    $("#hrTitle").textContent = bySubs ? "Lo mejor de cada suscripción" : "Inteligencia bruta";
    $("#hrSub").textContent = bySubs
      ? "El mejor modelo al que da acceso cada plan, ordenado por nota. Debajo, la cuota mensual."
      : "Ordenados solo por nota. Debajo de cada nota, lo que cuesta una tarea en la escala que elijas.";

    // Pareto inteligencia / precio
    const y = HOME.sc, area = AREA.get(y);
    $("#hpScatter").hidden = bySubs;
    $("#hpSubs").hidden = $("#hpLegend").hidden = !bySubs;
    let ins = "";
    if (bySubs) {
      // Planes del nivel elegido: uno por empresa, así que todos con trazo continuo (los distingue el color)
      const tier = homeTier(), ids = tier ? tier.plans : SUB.sel;
      const sums = ids.map((id) => planSummary(PLAN.get(id), y, vis));
      const solid = tier ? () => "" : undefined;
      subChart($("#hpSubs"), sums, y, solid);
      $("#hpLegend").innerHTML = sums.map((r) => `<span data-k="${r.p.id}">${dashSw(r.p, tier ? "" : undefined)}${esc(r.p.name)} · ${esc(priceTxt(r.p.priceEur))}/mes</span>`).join("") +
        `<a href="#suscripciones" class="linkbtn">Elegir otros planes →</a>` +
        (tier && tier.note ? `<p class="sl-note">${esc(tier.note)}</p>` : "");
      $("#hpLegend").querySelectorAll("[data-k]").forEach((el) => { el.onpointerenter = () => subHL($("#hpSubs"), el.dataset.k); el.onpointerleave = () => subHL($("#hpSubs"), null); });
      // «Elegir otros planes»: Suscripciones se abre con los planes de este nivel
      $("#hpLegend").querySelector(".linkbtn").onclick = () => {
        if (!tier) return;
        SUB.sel = ids.slice(0, SUB_MAX); SUB.mode = "chart"; SUB.area = y; saveSub();
      };
      const V = subVerdicts(y, vis, tier ? ids.map((id) => PLAN.get(id)) : PR.plans);
      if (V) ins = `${icon("coin", 15)}<span>En <b>${esc(area.name)}</b>${tier ? `, entre los planes de ${esc(tier.name)}` : ""}, la nota más alta la da <b>${esc(V.top.p.name)}</b> con ${subTag(V.top.m)}, desde ${esc(priceTxt(V.top.p.priceEur))} al mes. ` +
        `A ${T.margin} pt o menos, el mejor valor es <b>${esc(V.value.p.name)}</b> con ${subTag(V.value.m)} (${esc(eurTxt(V.value.eur))} por tarea)` +
        (V.cheap.p.id !== V.value.p.id ? ` y la entrada más barata, <b>${esc(V.cheap.p.name)}</b> (${esc(priceTxt(V.cheap.p.priceEur))} al mes).` : ".") + `</span>`;
    }
    const P = taskPicks(y, vis);
    if (!bySubs) {
      const marks = new Map();
      if (P) { marks.set(P.best.slug, "Máximo"); if (P.cheap) marks.set(P.cheap.slug, marks.has(P.cheap.slug) ? "Máximo · Mejor valor" : "Mejor valor"); }
      homeScatter.set({ models: vis, x: COST, y, xLog: true, yLog: false, marks });
    }
    if (P && PR && !bySubs) {
      const sub = withPrice("sub", () => taskPicks(y, vis)), api = withPrice(PRICE.mode === "usd" ? "usd" : "eur", () => taskPicks(y, vis));
      const same = sub && api && sub.cheap && api.cheap && sub.cheap.slug === api.cheap.slug;
      if (sub && api && sub.cheap && api.cheap) ins = `${icon("coin", 15)}<span>En <b>${esc(area.name)}</b>, entre los modelos a ${T.margin} pt o menos del mejor, el de mejor valor es ${nameTag(sub.cheap)} con suscripción` +
        (same ? ` y también con precio de API.` : `, pero sería ${nameTag(api.cheap)} si solo miraras el precio de API.`) + `</span>`;
    }
    $("#hpInsight").innerHTML = ins;
    $("#hpInsight").hidden = !ins;

    // Ranking de inteligencia bruta, con el coste por tarea debajo
    const rk = HOME.rk, rarea = AREA.get(rk);
    const rows = bySubs ? planRankRows(rk, vis) : rankRows(rk, vis);
    if (!bySubs) for (const r of rows) {
      const m = MODELS.find((x) => x.slug === r.key), c = val(m, COST);
      r.sub = c !== null ? fmt(COST, c) + " /tarea" : "sin coste";
    }
    const host = $("#hrBars");
    if (host._metric !== rk + HOME.by) { host.innerHTML = ""; host._rows = new Map(); host._metric = rk + HOME.by; }
    const LIM = 10;
    renderBars(host, HOME.all ? rows : rows.slice(0, LIM), { empty: "Ningún modelo visible tiene datos en esta área." });
    $("#hrMore").hidden = rows.length <= LIM;
    $("#hrMore").textContent = HOME.all ? `Ver solo los ${LIM} primeros` : `Ver los ${rows.length}`;
    $("#hrOpen").textContent = bySubs ? "Abrir en Suscripciones →" : "Abrir en Ranking →";
    // ¿Cambia el líder según el área?
    const leader = (id) => vis.filter((m) => val(m, id) !== null).sort((a, b) => val(b, id) - val(a, id))[0];
    const lead = leader(rk), gen = leader("intelligence_index");
    const leaders = new Set(HOME_AREAS.map((a) => leader(a.id)).filter(Boolean).map((m) => m.slug));
    let rins = "";
    if (bySubs) {
      // ¿Pagar más da más nota? Planes del mismo proveedor con el mismo mejor modelo
      const sums = PR.plans.map((p) => planSummary(p, rk, vis)).filter((r) => r.best);
      const same = PROVIDERS.map((prov) => sums.filter((r) => r.p.provider === prov)).sort((a, b) => b.length - a.length).find((g) => g.length > 1 && g.every((r) => r.best.m === g[0].best.m));
      if (same) rins = `${esc(same.map((r) => r.p.name).join(", ").replace(/, ([^,]*)$/, " y $1"))} dan acceso al mismo modelo, ${subTag(same[0].best.m)}: pagar más te da más uso, no más nota.`;
    } else if (lead && rk !== "intelligence_index" && gen) {
      rins = lead.slug === gen.slug ? `El primero en <b>${esc(rarea.name)}</b>, ${nameTag(lead)}, coincide con el primero del índice general.` :
        `El primero en <b>${esc(rarea.name)}</b> es ${nameTag(lead)}, aunque el índice general lo encabeza ${nameTag(gen)}.`;
    } else if (lead) rins = `Elige un área: entre las ${HOME_AREAS.length - 1} áreas hay <b>${leaders.size}</b> ${leaders.size === 1 ? "modelo distinto" : "modelos distintos"} en primera posición.`;
    $("#hrInsight").innerHTML = rins ? `${icon("trophy", 15)}<span>${rins}</span>` : "";
    $("#hrInsight").hidden = !rins;

    // Por qué comparar suscripciones (con cifras del plan elegido)
    let yieldTxt = "";
    if (PR) {
      const nf1 = (v) => nf(v >= 10 ? 0 : 1).format(v);
      // Una frase por proveedor, con su familia de referencia (config.js > pricing.providers)
      const parts = PROVIDERS.map((prov) => {
        const info = PR.providers[prov] || {}, plan = PLAN.get(PRICE.plan[prov]);
        if (!plan || !info.ref || !MODELS.some((m) => m.family === info.ref)) return null;
        return [plan, info.refName || famLong(info.ref), planYield(plan, info.ref)];
      }).filter(Boolean);
      if (parts.length) yieldTxt = " " + parts.map(([plan, ref, y], i) =>
        i === 0 ? `Con ${esc(plan.name)}, 1 € rinde ≈ <b>${nf1(y)} €</b> de API en ${esc(ref)}` : `con ${esc(plan.name)}, ≈ <b>${nf1(y)} €</b> en ${esc(ref)}`).join("; ") + ".";
    }
    $("#homeWhy").innerHTML = [
      ["coin", "El precio de API distorsiona", `Casi nadie paga por token: paga una cuota al mes. Lo que importa es cuánta inteligencia obtienes por cada euro de esa cuota, y eso cambia mucho entre proveedores.${yieldTxt}${PR ? ` <a class="wlink" href="#suscripciones">Comparar suscripciones →</a>` : ""}`],
      ["briefcase", "Cada oficio necesita algo distinto", `Un índice general mezcla programación, ciencia, derecho o salud. El mejor para tu trabajo no tiene por qué ser el primero del ranking global: hoy hay <b>${leaders.size}</b> líderes distintos según el área.`],
      ["layers", "Todo en un mismo sitio", `CleanAI reúne benchmarks de varios estudios y estimaciones de lo que rinde cada suscripción, para enseñarte lo que de verdad obtienes por lo que pagas.`],
    ].map(([ic, t, d]) => `<div class="wcard"><span class="gicon">${icon(ic)}</span><h3>${esc(t)}</h3><p>${d}</p></div>`).join("");
    markPins();
  }
  VIEWS.inicio = renderInicio;

  /* ================= Vista: Suscripciones ================= */
  // Cada plan se resume en su frontera de Pareto: los modelos que incluye que ningún otro
  // del mismo plan mejora a la vez en nota y en € de suscripción por tarea.
  const SUB_MAX = 4;
  const SUB = {
    area: store.get("subArea", "intelligence_index"), mode: store.get("subMode", "chart"),
    sel: store.get("subSel", null), api: store.get("subApi", false),
  };
  if (!AREA.has(SUB.area) || !METRICS.has(SUB.area)) SUB.area = "intelligence_index";
  if (!Array.isArray(SUB.sel)) SUB.sel = PR ? PROVIDERS.map((p) => PR.defaults[p]) : [];
  SUB.sel = SUB.sel.filter((id) => PLAN.has(id)).slice(0, SUB_MAX);
  // Trazo de cada plan elegido. El color ya dice la empresa, así que el trazo solo separa planes
  // de la misma empresa: se le asigna el primero libre entre los suyos al entrar y lo conserva mientras
  // siga en la gráfica (quitar un plan no cambia el trazo de los demás). El chip de cada plan es su leyenda.
  const DASHES = ["", "9 5", "0.5 4.5", "13 4 0.5 4"];
  SUB.dash = store.get("subDashCo", {});
  function syncDash() {
    for (const k of Object.keys(SUB.dash)) if (!SUB.sel.includes(k)) delete SUB.dash[k];
    for (const id of SUB.sel) if (!(id in SUB.dash)) {
      const prov = PLAN.get(id).provider;
      const used = new Set(Object.entries(SUB.dash).filter(([k]) => PLAN.get(k).provider === prov).map(([, v]) => v));
      SUB.dash[id] = DASHES.findIndex((d, i) => !used.has(i));
    }
  }
  syncDash();
  const saveSub = () => { syncDash(); store.set("subArea", SUB.area); store.set("subMode", SUB.mode); store.set("subSel", SUB.sel); store.set("subApi", SUB.api); store.set("subDashCo", SUB.dash); };
  // Pago por uso: referencia opcional en la gráfica (todos los modelos, a precio de API en €); se distingue por el color
  const API_PLAN = { id: "api", name: "Pago por uso (API)", short: "API", provider: null };
  const planDash = (p) => (p.id === "api" ? "" : DASHES[SUB.dash[p.id] ?? 0]);
  // Muestra del trazo de un plan, en el color de su empresa (dash: trazo forzado, p. ej. "" en la portada)
  const dashSw = (p, dash) => `<svg class="dsw" width="24" height="8" viewBox="0 0 24 8" aria-hidden="true"${p.provider ? ` style="color:${coColor(p.provider)}"` : ""}><path d="M2 4H22" stroke-dasharray="${dash ?? planDash(p)}"/></svg>`;
  const priceTxt = (v) => nf(v % 1 ? 2 : 0).format(v) + " €";
  const tasksTxt = (t) => (t >= 100 ? nf(0).format(+t.toPrecision(2)) : nf(t >= 10 ? 0 : 1).format(t));
  const planHas = (p, m) => p.id === "api" || (m.provider === p.provider && !(p.payg || []).includes(m.family));
  // USD de API que rinde el plan al mes con un modelo (estimación y uso del límite elegidos)
  const usdMonth = (p, m) => p.api[PRICE.est] * ((PR.modelMult || {})[m.family] ?? 1) * PRICE.use;

  // Puntos de un plan en un área: nota, € de suscripción por tarea y tareas al mes
  function planPoints(p, y, vis) {
    const out = [];
    for (const m of vis) {
      if (!planHas(p, m)) continue;
      const s = val(m, y), usd = m.raw[COST];
      if (s === null || !(usd > 0)) continue;
      if (p.id === "api") { out.push({ m, p, s, usd, eur: usd / PR.fxUsdPerEur, tasks: null }); continue; }
      const mo = usdMonth(p, m);
      out.push({ m, p, s, usd, eur: (usd * p.priceEur) / mo, tasks: mo / usd });
    }
    return out;
  }
  // Frontera ordenada de más barata a más cara: termina en la nota más alta del plan
  function planSummary(p, y, vis) {
    const pts = planPoints(p, y, vis);
    const front = pts.filter((a) => !pts.some((b) => b !== a && b.s >= a.s && b.eur <= a.eur && (b.s > a.s || b.eur < a.eur))).sort((a, b) => a.eur - b.eur);
    return { p, pts, front, best: front[front.length - 1] || null };
  }
  // Las tres respuestas, entre todos los planes: la nota más alta (en el plan más barato que la da),
  // el menor coste por tarea a «margen» puntos o menos de esa nota y el plan más barato que llega a ese nivel
  // plans: opcional, para limitar la comparación a esos planes (p. ej. un nivel de precio de la portada)
  function subVerdicts(y, vis, plans = PR.plans) {
    const sums = plans.map((p) => planSummary(p, y, vis)).filter((r) => r.best);
    if (!sums.length) return null;
    const B = Math.max(...sums.map((r) => r.best.s)), floor = B - T.margin;
    const top = sums.filter((r) => r.best.s >= B - 1e-9).sort((a, b) => a.p.priceEur - b.p.priceEur)[0].best;
    let value = null;
    for (const r of sums) for (const q of r.pts) if (q.s >= floor && (!value || q.eur < value.eur)) value = q;
    const ok = sums.filter((r) => r.best.s >= floor).sort((a, b) => a.p.priceEur - b.p.priceEur || b.best.s - a.best.s);
    return { B, top, value, cheap: ok[0].best, n: sums.length, ok: ok.length };
  }

  /* ---- Gráfica: una frontera por plan (X: € por tarea en log, Y: nota) ---- */
  // dash: función opcional plan → trazo (por defecto, el que tiene el plan en la vista Suscripciones)
  function subChart(host, series, y, dash) {
    host._sc = { series, y, dash };
    if (!host._ro) { host._ro = new ResizeObserver(() => drawSubChart(host)); host._ro.observe(host); }
    drawSubChart(host);
  }
  function subHL(host, id) {
    host.classList.toggle("hl", !!id);
    host.querySelectorAll(".sser").forEach((g) => g.classList.toggle("on", g.dataset.k === id));
  }
  function drawSubChart(host) {
    const { series = [], y, dash = planDash } = host._sc || {};
    const W = host.clientWidth, H = host.clientHeight;
    if (!W || !H) return;
    const ser = series.filter((r) => r.front.length);
    const pts = ser.flatMap((r) => r.front);
    if (!pts.length) { host.innerHTML = `<div class="chart-empty">Ningún modelo visible de estos planes tiene datos en esta área.</div>`; return; }
    const my = METRICS.get(y);
    const M = { l: 50, r: 16, t: 16, b: 46 };
    const xs = pts.map((q) => q.eur), ys = pts.map((q) => q.s);
    const x0 = Math.min(...xs) / 1.6, x1 = Math.max(...xs) * 1.6;
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = (y1 - y0) * 0.1 || 2; y0 -= pad; y1 += pad * 1.6; // arriba, sitio para los nombres
    const lx0 = Math.log10(x0), lx1 = Math.log10(x1);
    const sx = (v) => M.l + ((Math.log10(v) - lx0) / (lx1 - lx0)) * (W - M.l - M.r);
    const sy = (v) => H - M.b - ((v - y0) / (y1 - y0)) * (H - M.t - M.b);
    let xt = logTicks(x0, x1);
    const maxXT = Math.max(3, Math.floor((W - M.l - M.r) / 62));
    if (xt.length > maxXT) xt = xt.filter((v) => /^[15]/.test(v.toExponential()));
    if (xt.length > maxXT) xt = xt.filter((v) => /^1/.test(v.toExponential()));
    const yt = niceTicks(y0, y1, 6);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Frontera de Pareto de cada plan: ${esc(my.short)} frente a € de suscripción por tarea"><g class="sgrid">`;
    for (const t of yt) s += `<line class="gridline" x1="${M.l}" x2="${W - M.r}" y1="${sy(t)}" y2="${sy(t)}"/><text class="tick" x="${M.l - 8}" y="${sy(t) + 4}" text-anchor="end">${esc(fmt(y, t, true))}</text>`;
    for (const t of xt) s += `<line class="gridline" x1="${sx(t)}" x2="${sx(t)}" y1="${M.t}" y2="${H - M.b}"/><text class="tick" x="${sx(t)}" y="${H - M.b + 18}" text-anchor="middle">${esc(eurTxt(t, true))}</text>`;
    s += `<line x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}" stroke="var(--axis)"/>`;
    s += `<text class="axis-title" x="${(M.l + W - M.r) / 2}" y="${H - 8}" text-anchor="middle">€ de suscripción por tarea (log)  ← mejor</text>`;
    s += `<text class="axis-title" transform="rotate(-90)" x="${-(M.t + H - M.b) / 2}" y="13" text-anchor="middle">${esc(my.short)}  → mejor</text></g>`;
    for (const r of ser) {
      const d = "M" + r.front.map((q) => `${sx(q.eur).toFixed(1)},${sy(q.s).toFixed(1)}`).join("L");
      // Cada empresa, un color (línea y puntos); la forma del punto dice la familia y el trazo, el plan
      s += `<g class="sser${r.p.id === "api" ? " api" : ""}" data-k="${r.p.id}"${r.p.provider ? ` style="--sc:${coColor(r.p.provider)}"` : ""}><path class="shalo" d="${d}"/><path class="sline" d="${d}" stroke-dasharray="${dash(r.p)}"/>`;
      r.front.forEach((q, i) => {
        const f = C.families[q.m.family] || { shape: "circle" };
        s += `<g class="spt" data-pin="${q.m.slug}" data-pick="${q.m.slug}" data-i="${i}" transform="translate(${sx(q.eur).toFixed(1)},${sy(q.s).toFixed(1)})"><circle r="12" fill="transparent"/><path d="${shapePath(f.shape, 9)}" fill="${coColor(q.m.provider)}"/></g>`;
      });
      s += `<text class="slabel"${r.p.provider ? ` style="--cd:${darkOf(coColor(r.p.provider))}"` : ""}>${esc(r.p.name)}${r.p.priceEur ? `<tspan class="sp"> · ${esc(priceTxt(r.p.priceEur))}</tspan>` : ""}</text></g>`;
    }
    host.innerHTML = s + "</svg>";
    // Nombre de cada plan junto a su mejor punto (el último de la frontera); se apartan si chocan
    const labs = [...host.querySelectorAll(".sser")].map((g, i) => {
      const r = ser[i], q = r.best, t = g.querySelector(".slabel");
      const w = t.getComputedTextLength() || 80, px = sx(q.eur), py = sy(q.s);
      const right = px + 12 + w <= W - 4;
      return { t, w, x: right ? px + 12 : Math.max(M.l + w, px + 4), y: right ? py + 4 : py - 13, a: right ? "start" : "end" };
    }).sort((a, b) => a.y - b.y);
    for (let i = 1; i < labs.length; i++) {
      const a = labs[i], span = (l) => (l.a === "start" ? [l.x, l.x + l.w] : [l.x - l.w, l.x]);
      for (let j = 0; j < i; j++) {
        const b = labs[j], [a0, a1] = span(a), [b0, b1] = span(b);
        if (a0 < b1 && b0 < a1 && a.y - b.y < 15) a.y = b.y + 15;
      }
    }
    for (const l of labs) { l.t.setAttribute("x", l.x.toFixed(1)); l.t.setAttribute("y", Math.max(12, l.y).toFixed(1)); l.t.setAttribute("text-anchor", l.a); }
    host.querySelectorAll(".sser").forEach((g, i) => {
      const r = ser[i];
      g.addEventListener("pointerenter", () => subHL(host, r.p.id));
      g.addEventListener("pointerleave", () => subHL(host, null));
      g.querySelectorAll(".spt").forEach((pt) => bindTip(pt, () => subTip(r.front[+pt.dataset.i], y) + pinHint(pt.dataset.pin)));
    });
    markPins();
  }
  function subTip(q, y) {
    const api = q.p.id === "api";
    let h = `<div class="tt-h">${subIcon(q.m)}${esc(modelText(q.m))}</div>` + ttRow(api ? "Sin suscripción" : "Plan", api ? "precio de API" : `${q.p.name} · ${priceTxt(q.p.priceEur)}/mes`);
    h += ttRow(METRICS.get(y).short, fmt(y, q.s));
    h += ttRow(api ? "€ de API por tarea" : "€ de suscripción por tarea", eurTxt(q.eur));
    if (!api) h += ttRow("Tareas al mes", "≈ " + tasksTxt(q.tasks)) + ttRow("Precio de API por tarea", "$" + nf(q.usd >= 10 ? 1 : 2).format(q.usd));
    return h + (api ? "" : `<div class="tt-n">Si gastas el ${nf(0).format(PRICE.use * 100)} % del límite semanal (estimación ${({ low: "prudente", mid: "central", high: "optimista" })[PRICE.est]}).</div>`);
  }

  /* ---- Ranking: el mejor modelo de cada plan ---- */
  function planRankRows(y, vis) {
    const m = METRICS.get(y);
    const sums = PR.plans.map((p) => planSummary(p, y, vis)).filter((r) => r.best)
      .sort((a, b) => b.best.s - a.best.s || a.p.priceEur - b.p.priceEur);
    const top = Math.max(...sums.map((r) => r.best.s), 0), b = m.unit === "score" ? 100 : top;
    return sums.map(({ p, best: q, front }) => ({
      key: "plan:" + p.id, pin: q.m.slug, family: q.m.family, color: coColor(q.m.provider), icon: subIcon(q.m), cd: subDark(q.m),
      name: `${esc(p.name)} <span class="e">${esc(famShort(q.m.family))} ${esc(q.m.effort)}</span>`,
      value: q.s, display: fmt(y, q.s), frac: b ? q.s / b : 0, mode: "bar", sub: `${priceTxt(p.priceEur)}/mes`,
      tip: () => `<div class="tt-h">${esc(p.name)} · ${esc(priceTxt(p.priceEur))}/mes</div>` +
        ttRow("Mejor modelo", modelText(q.m)) + ttRow(m.short, fmt(y, q.s)) + ttRow("€ por tarea con él", eurTxt(q.eur)) + ttRow("Tareas al mes con él", "≈ " + tasksTxt(q.tasks)) +
        `<div class="tt-n">Frontera del plan: ${front.slice().reverse().map((x) => `${esc(famShort(x.m.family))} ${esc(x.m.effort)}`).join(" · ")}.${(p.payg || []).length ? ` ${esc(p.payg.join(", "))} no entra en el plan.` : ""}</div>`,
    }));
  }

  /* ---- La vista ---- */
  const SUB_MODES = [["chart", "Frontera de cada plan"], ["rank", "Lo mejor de cada plan"]];
  let subReady = false;
  function initSubs() {
    subReady = true;
    const strip = $("#subStrip");
    strip.innerHTML = HOME_AREAS.map((a) => `<button type="button" class="gpill" data-a="${a.id}" title="${esc(a.name)}">${icon(a.icon, 18)}<span class="gl">${esc(a.short)}</span></button>`).join("");
    strip.onclick = (e) => { const b = e.target.closest(".gpill"); if (b && b.dataset.a !== SUB.area) { SUB.area = b.dataset.a; saveSub(); renderSubs(); } };
    const seg = $("#subMode");
    seg.innerHTML = `<span class="seg-ink"></span>` + SUB_MODES.map(([k, t]) => `<button type="button" data-k="${k}">${t}</button>`).join("");
    seg.onclick = (e) => { const b = e.target.closest("button"); if (b && b.dataset.k !== SUB.mode) { SUB.mode = b.dataset.k; saveSub(); renderSubs(); } };
    // Selector de planes (es también la leyenda: cada chip lleva el trazo de su línea)
    const pick = $("#subPick");
    pick.innerHTML = PROVIDERS.map((prov) => `<div class="pp-co"><span class="pp-n">${esc(coName(prov))}</span>` +
      PR.plans.filter((p) => p.provider === prov).map((p) => `<button type="button" class="chip" data-p="${p.id}" title="${esc(p.name)} · ${esc(priceTxt(p.priceEur))}/mes">${dashSw(p)}<span>${esc(p.short)}</span></button>`).join("") + `</div>`).join("") +
      `<div class="pp-co"><button type="button" class="chip pp-api" data-p="api" title="Añade como referencia lo que costaría pagar por uso, a precio de API">${dashSw(API_PLAN)}<span>Pago por uso</span></button></div>`;
    pick.onclick = (e) => {
      const b = e.target.closest(".chip");
      if (!b || b.disabled) return;
      const id = b.dataset.p;
      if (id === "api") SUB.api = !SUB.api;
      else if (SUB.sel.includes(id)) SUB.sel = SUB.sel.filter((x) => x !== id);
      else if (SUB.sel.length < SUB_MAX) SUB.sel.push(id);
      saveSub(); renderSubs();
    };
    pick.addEventListener("pointerover", (e) => { const b = e.target.closest(".chip.sel"); subHL($("#subChart"), b ? b.dataset.p : null); });
    pick.addEventListener("pointerleave", () => subHL($("#subChart"), null));
    // Cálculo: comparte estimación y uso del límite con el selector de precios de la barra
    $("#subCalc").onclick = (e) => {
      const b = e.target.closest(".mseg button");
      if (!b) return;
      const k = b.closest(".mseg").dataset.p;
      PRICE[k] = k === "use" ? +b.dataset.v : b.dataset.v;
      store.set("price", PRICE); applyPrice(); priceRender(); renderSubs();
    };
    $("#subPicks").addEventListener("click", (e) => {
      const c = e.target.closest(".pickcard[data-k]");
      if (!c || SUB.sel.includes(c.dataset.k)) return;
      // Clic en una respuesta: su plan entra en la gráfica (si está llena, sustituye al último)
      if (SUB.sel.length >= SUB_MAX) SUB.sel.pop();
      SUB.sel.push(c.dataset.k); SUB.mode = "chart"; saveSub(); renderSubs();
    });
  }

  function renderSubs() {
    if (!PR) return;
    if (!subReady) initSubs();
    const vis = visible(), y = SUB.area, area = AREA.get(y), chart = SUB.mode === "chart";
    $("#subStrip").querySelectorAll(".gpill").forEach((b) => b.classList.toggle("active", b.dataset.a === y));
    const seg = $("#subMode");
    seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.k === SUB.mode));
    segInk(seg);
    $("#subDesc").innerHTML = chart
      ? `Cada línea es la frontera de Pareto de un plan en <b>${esc(area.name)}</b>: los modelos que incluye que ningún otro del mismo plan mejora a la vez en nota y en coste por tarea. Arriba a la izquierda, mejor.`
      : `El mejor modelo al que da acceso cada suscripción en <b>${esc(area.name)}</b>, con lo que cuesta al mes. Si dos planes dan el mismo modelo, va primero el más barato.`;

    // Respuestas
    const V = subVerdicts(y, vis);
    const host = $("#subPicks");
    const ctl = marginCtl(host, () => { cancelAnimationFrame(subRaf); subRaf = requestAnimationFrame(renderSubs); });
    host.querySelectorAll(".pickcard, .empty").forEach((c) => c.remove());
    if (!V) {
      ctl.insertAdjacentHTML("beforebegin", `<div class="empty">Ningún modelo visible tiene datos en esta área.</div>`);
      $("#subWhy").innerHTML = "";
    } else {
      const mn = (q) => `${subIcon(q.m, 11)}<b>${esc(famShort(q.m.family))} ${esc(q.m.effort)}</b>`;
      const card = (ic, tag, q, nums, hero, i) => `<div class="pickcard${hero ? " hero-pick" : ""}${SUB.sel.includes(q.p.id) ? "" : " addable"}" data-k="${q.p.id}" title="${SUB.sel.includes(q.p.id) ? "" : "Clic: añadirlo a la gráfica"}" style="animation-delay:${i * 50}ms">
        <span class="pk">${icon(ic, 16)}</span><span class="ptag">${tag}</span><span class="pname">${esc(q.p.name)}</span><span class="pnum">${nums}</span></div>`;
      ctl.insertAdjacentHTML("beforebegin",
        card("trophy", "La nota más alta", V.top, `${mn(V.top)} · <b>${fmt(y, V.top.s)}</b> · desde <b>${priceTxt(V.top.p.priceEur)}</b>/mes`, true, 0) +
        card("coin", "Mejor valor", V.value, `${mn(V.value)} · <b>${eurTxt(V.value.eur)}</b>/tarea · ≈ <b>${tasksTxt(V.value.tasks)}</b> al mes`, false, 1) +
        card("wallet", "La más barata", V.cheap, `${mn(V.cheap)} · <b>${fmt(y, V.cheap.s)}</b> · <b>${priceTxt(V.cheap.p.priceEur)}</b>/mes`, false, 2));
      const lim = `${nf(0).format(PRICE.use * 100)} %`;
      $("#subWhy").innerHTML =
        `<p class="why"><b>${icon("trophy", 14)} La nota más alta</b>El plan más barato que da acceso al mejor modelo en esta área, entre los ${V.n} planes con datos.</p>` +
        `<p class="why"><b>${icon("coin", 14)} Mejor valor</b>El menor € de suscripción por tarea entre los modelos que están a ${T.margin} pt o menos de la nota más alta. Supone que gastas el ${lim} del límite semanal: si usas menos, los planes grandes salen peor.</p>` +
        `<p class="why"><b>${icon("wallet", 14)} La más barata</b>La cuota mensual más baja entre los ${V.ok} planes que llegan a ese nivel (${nf(1).format(V.B - T.margin)} o más).</p>` +
        `<p class="hint">Sube el margen para aceptar algo menos de nota a cambio de precio.</p>`;
    }

    // Selector de planes
    const pick = $("#subPick");
    pick.querySelectorAll(".chip").forEach((b) => {
      const id = b.dataset.p, on = id === "api" ? SUB.api : SUB.sel.includes(id);
      b.classList.toggle("sel", on);
      if (on) b.querySelector(".dsw path").setAttribute("stroke-dasharray", planDash(id === "api" ? API_PLAN : PLAN.get(id)));
      b.disabled = !on && id !== "api" && SUB.sel.length >= SUB_MAX;
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    $("#subBar").hidden = !chart;
    $("#subChart").hidden = !chart;
    $("#subBars").hidden = chart;
    $("#subCardSec").hidden = !chart;
    if (chart) {
      const sums = SUB.sel.map((id) => planSummary(PLAN.get(id), y, vis));
      subChart($("#subChart"), SUB.api ? [...sums, planSummary(API_PLAN, y, vis)] : sums, y);
      $("#subCards").innerHTML = sums.map((r, i) => {
        const p = r.p;
        // Las 5 mejores notas a la vista; el resto de la frontera, plegado
        const li = (q) => `<li data-pin="${q.m.slug}" data-pick="${q.m.slug}" style="--cd:${subDark(q.m)}"><span class="nm">${subIcon(q.m)}${esc(famShort(q.m.family))} <span class="e">${esc(q.m.effort)}</span></span>
          <span class="pv"><b>${fmt(y, q.s)}</b> · ${eurTxt(q.eur, true)}/tarea<br>≈ ${tasksTxt(q.tasks)} tareas/mes</span></li>`;
        const fr = r.front.slice().reverse(), LIM = 5;
        const list = fr.slice(0, LIM).map(li).join("") + (fr.length > LIM ? `<li class="more"><details><summary>Ver ${fr.length - LIM} más baratos</summary><ol>${fr.slice(LIM).map(li).join("")}</ol></details></li>` : "");
        return `<div class="plan-card" data-k="${p.id}" style="animation-delay:${i * 50}ms"><div class="pc-h">${dashSw(p)}<span>${esc(p.name)}</span><span class="pc-p">${priceTxt(p.priceEur)}<small>/mes</small></span></div>
          <p class="pc-s">${esc(coName(p.provider))} · confianza ${esc(p.confidence)}${(p.payg || []).length ? ` · ${esc(p.payg.join(", "))} se paga aparte` : ""}</p>
          <ol>${list || `<li class="empty">Ningún modelo visible de este plan tiene datos aquí.</li>`}</ol></div>`;
      }).join("") || `<div class="empty">Elige planes arriba para ver su frontera.</div>`;
      $("#subCards").querySelectorAll(".plan-card").forEach((c) => {
        c.onpointerenter = () => subHL($("#subChart"), c.dataset.k);
        c.onpointerleave = () => subHL($("#subChart"), null);
      });
    } else {
      const bh = $("#subBars");
      if (bh._metric !== y) { bh.innerHTML = ""; bh._rows = new Map(); bh._metric = y; }
      renderBars(bh, planRankRows(y, vis), { empty: "Ningún modelo visible tiene datos en esta área." });
    }

    // Panel: cálculo y notas de cada plan
    const mseg = (k, opts) => `<div class="mseg" data-p="${k}">${opts.map(([v, t]) => `<button type="button" data-v="${v}" class="${String(v) === String(PRICE[k]) ? "on" : ""}">${esc(t)}</button>`).join("")}</div>`;
    $("#subCalc").innerHTML = `<div class="gseg"><span class="gol">Estimación</span>${mseg("est", [["low", "Prudente"], ["mid", "Central"], ["high", "Optimista"]])}</div>
      <div class="gseg"><span class="gol">Parte del límite semanal que agotas</span>${mseg("use", [[1, "100 %"], [0.5, "50 %"], [0.25, "25 %"]])}</div>
      <p class="hint">€ por tarea = coste de API × cuota ÷ uso de API que rinde el plan al mes. Tareas al mes = ese uso ÷ coste de API por tarea. Una tarea es la media de las del Intelligence Index de Artificial Analysis. ${esc(PR.multNote || "")}</p>
      <p class="hint">Son estimaciones de terceros: ningún proveedor publica cuánto uso cabe en cada plan.</p>`;
    $("#subPlans").innerHTML = PR.plans.map((p) => `<p class="why"><b>${esc(p.name)} · ${esc(priceTxt(p.priceEur))}/mes</b>${esc(p.note)} <i>Confianza ${esc(p.confidence)}.</i></p>`).join("");
    markPins();
  }
  let subRaf = 0;
  VIEWS.suscripciones = renderSubs;

  /* ================= Selector de precios (barra superior) ================= */
  let priceRender = () => {};
  function buildPriceUI() {
    const host = $("#priceSel");
    if (!PR) { host.remove(); return; }
    host.className = "fam price";
    host.innerHTML = `<button type="button" class="chip price-chip"></button><div class="fam-pop"><div class="fam-pop-in price-in"></div></div>`;
    const chip = host.querySelector(".chip"), pop = host.querySelector(".price-in");
    chip.addEventListener("click", () => { if (!isMouse()) host.classList.toggle("open"); });
    const seg = (key, opts, curV) => `<div class="mseg" data-p="${key}">${opts.map(([v, t]) => `<button type="button" data-v="${v}" class="${String(v) === String(curV) ? "on" : ""}">${esc(t)}</button>`).join("")}</div>`;
    const nf1 = (v) => nf(v >= 10 ? 0 : 1).format(v);
    const render = () => {
      chip.innerHTML = `${icon("coin", 15)}<span>${esc({ usd: "$ API", eur: "€ API", sub: "€ suscripción" }[PRICE.mode])}</span>`;
      chip.title = "Escala de los costes: € de suscripción, € de API o $ de API";
      let h = `<p class="pr-k">Ver los costes en</p>` + seg("mode", [["sub", "€ suscripción"], ["eur", "€ API"], ["usd", "$ API"]], PRICE.mode);
      if (PRICE.mode === "sub") {
        for (const prov of PROVIDERS) {
          const plans = PR.plans.filter((p) => p.provider === prov);
          h += `<p class="pr-k">${esc((PR.providers[prov] || {}).label || "Plan de " + prov)}</p>` + seg("plan:" + prov, plans.map((p) => [p.id, p.short]), PRICE.plan[prov]);
        }
        h += `<p class="pr-k">Estimación</p>` + seg("est", [["low", "Prudente"], ["mid", "Central"], ["high", "Optimista"]], PRICE.est);
        h += `<p class="pr-k">Parte del límite semanal que agotas</p>` + seg("use", [[1, "100 %"], [0.5, "50 %"], [0.25, "25 %"]], PRICE.use);
        // Cuánto rinde cada euro de suscripción, por familia
        const rows = FAM_ORDER.map((f) => {
          const m = MODELS.find((x) => x.family === f);
          const plan = PLAN.get(PRICE.plan[m.provider]);
          if (!plan) return "";
          const y = planYield(plan, f);
          const what = (plan.payg || []).includes(f) ? "se paga aparte, a precio de API" : `1 € rinde ≈ <b>${nf1(y)} €</b> de API`;
          return `<li>${famIcon(f)}<span>${esc(famLong(f))} <span class="pr-p">· ${esc(plan.short)}</span></span><span class="pr-y">${what}</span></li>`;
        }).join("");
        const sel = PR.plans.filter((p) => PRICE.plan[p.provider] === p.id);
        h += `<ul class="pr-yield">${rows}</ul>`;
        h += `<p class="pr-note">${sel.map((p) => `<b>${esc(p.name)}</b> (${esc(nf(2).format(p.priceEur))} €/mes, confianza ${esc(p.confidence)}): ${esc(p.note)}`).join("<br>")}</p>`;
        h += `<details class="pr-more"><summary>Cómo se calcula</summary><p>Coste en € de suscripción = coste de API × precio del plan ÷ (€ de API que rinde el plan al mes). Supone que agotas el límite semanal; si usas menos, cada tarea te sale más cara: ajústalo arriba. ${esc(PR.multNote || "")} Cambio ${esc(nf(4).format(PR.fxUsdPerEur))} $/€ (${esc(PR.fxDate)}).</p>
          <p>Son estimaciones de terceros; ningún proveedor publica esta cifra.${lowConf.length ? ` Las de ${esc(lowConf.join(" y "))} tienen confianza baja.` : ""}</p>
          <ul>${PR.sources.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join("")}</ul></details>`;
      } else if (PRICE.mode === "eur") {
        h += `<p class="pr-note">Precio de API pasado a euros con ${esc(nf(4).format(PR.fxUsdPerEur))} $/€ (${esc(PR.fxDate)}).</p>`;
      } else h += `<p class="pr-note">Precios de API originales de Artificial Analysis.</p>`;
      pop.innerHTML = h;
    };
    priceRender = render;
    pop.addEventListener("click", (e) => {
      const b = e.target.closest(".mseg button");
      if (!b) return;
      e.stopPropagation();
      const k = b.closest(".mseg").dataset.p, v = b.dataset.v;
      if (k.startsWith("plan:")) PRICE.plan[k.slice(5)] = v;
      else PRICE[k] = k === "use" ? +v : v;
      store.set("price", PRICE);
      applyPrice(); render();
      for (const sc of SCATTERS) sc.zoom = null;
      VIEWS[S.tab]();
    });
    render();
  }

  /* ================= Arranque ================= */
  const fetched = (D.meta.fetched_at || "").slice(0, 10);
  $("#foot").innerHTML = `Datos: <a href="https://artificialanalysis.ai" target="_blank" rel="noopener">Artificial Analysis</a> (descargados el ${esc(fetched)}). ` +
    `CyberBench, CWE-bench y SWE-bench Pro son externos (Vals AI, benchmarklist.com) y se editan a mano en <code>data/external_benchmarks.json</code>. ` +
    `Los costes en € de suscripción son estimaciones de terceros (planes y fuentes en <code>web/config.js</code> y <code>data/subscriptions_research.md</code>). Para actualizar: <code>python3 scripts/fetch_aa.py</code>. Los grupos y plantillas están en <code>web/config.js</code>. Atajos: teclas 1–${Object.keys(TAB_NAMES).length} para cambiar de sección.`;
  $("#brand").innerHTML = logoSVG(26) + `<span class="bn">CleanAI</span>`;
  if (!PR) { delete TAB_NAMES.suscripciones; delete VIEWS.suscripciones; document.querySelector('#tabs [data-tab="suscripciones"]').remove(); $("#view-suscripciones").remove(); }
  buildGOpts(); applyG(); buildPriceUI();
  initFilters(); updateEff(); updatePinChip();
  $("#tabInk").classList.add("no-anim");
  S.tab = null;
  showTab(location.hash ? location.hash.slice(1) : "inicio");
  const settleInk = () => { moveInk(); requestAnimationFrame(() => $("#tabInk").classList.remove("no-anim")); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(settleInk); else settleInk();
})();
