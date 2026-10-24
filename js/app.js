/* ============================================================
   21st Century Compass — simulation engine & UI
   H Heuristics · fixed-position world map · 2025–2100 (+2500)
   ============================================================ */
(function () {
  "use strict";

  var D = window.CC_DATA, W = window.CC_WORLD;
  if (!window.d3 || !window.Chart) {
    document.body.innerHTML = '<div style="padding:40px;font-family:monospace;color:#d9544f">21st Century Compass requires network access for D3 + Chart.js CDNs. Reload with a connection.</div>';
    return;
  }
  if (!D || !W) {
    document.body.innerHTML = '<div style="padding:40px;font-family:monospace;color:#d9544f">Data files missing (js/data.js, js/world.js).</div>';
    return;
  }

  /* ---------------- constants & state ---------------- */
  var START = 2025, END = 2100, LONG = 2500;
  var SC = D.scenarios;
  var state = {
    year: 2025, scenario: "SSP2_45", metric: "pop", theme: null,
    playing: false, speed: 1, longRun: false, selected: null, timer: null
  };

  var byIso = {};
  D.countries.forEach(function (c) { byIso[c.i] = c; });
  var geoById = {};
  W.features.forEach(function (f) { geoById[f.id] = f; });

  var REGION_NAME = {};
  D.regionOrder.forEach(function (r) { REGION_NAME[r] = D.regions[r].name; });

  var EUROPE = ["AUT","BEL","CHE","CZE","DEU","DNK","ESP","EST","FIN","FRA","GBR","GRC","HRV","HUN","IRL","ISL","ITA","LTU","LUX","LVA","MLT","NLD","NOR","POL","PRT","ROU","SVK","SVN","SWE"];
  var EU_SET = {}; EUROPE.forEach(function (i) { EU_SET[i] = 1; });

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function ramp(y) { var t = clamp((y - START) / (END - START), 0, 1); return Math.pow(t, 1.4); }

  /* ---------------- metric registry ---------------- */
  var RAMP_GOOD = ["#16374f", "#2c7d83", "#8fae63", "#d9a441", "#c75b3f", "#8f2f3f"];
  var RAMP_BAD = RAMP_GOOD.slice().reverse();

  var METRICS = {
    pop:      { label: "Population", unit: "million", good: "neutral", domain: [0, 1600],  fmt: function (v) { return fmtPop(v); }, desc: "Total population, UN WPP 2024 medium variant with SSP adjustment." },
    popchg:   { label: "Population change", unit: "% vs 2025", good: "neutral", domain: [-70, 350], fmt: function (v) { return (v > 0 ? "+" : "") + v.toFixed(0) + "%"; }, desc: "Population growth or decline since 2025. Blue = Western/ageing decline, warm = Africa & South Asia expansion." },
    tmean:    { label: "Mean annual temperature", unit: "°C", good: "bad", domain: [-8, 31], fmt: function (v) { return v.toFixed(1) + "°C"; }, desc: "Mean annual temperature (CCKP CMIP6 pattern + SSP warming)." },
    heatdays: { label: "Dangerous heat days", unit: "days/yr", good: "bad", domain: [0, 250], fmt: function (v) { return v.toFixed(0) + " d"; }, desc: "Days per year with heat index above 41 °C (US NWS dangerous-heat threshold)." },
    pm25:     { label: "PM2.5 pollution", unit: "µg/m³", good: "bad", domain: [0, 90], fmt: function (v) { return v.toFixed(0) + " µg/m³"; }, desc: "Population-weighted fine-particle pollution (SatPM, latest year, region trends)." },
    risk:     { label: "Survivability risk", unit: "index 0–100", good: "bad", domain: [0, 100], fmt: function (v) { return v.toFixed(0); }, desc: "Composite: heat + pollution + poverty + institutional fragility (H Heuristics index)." },
    gdppc:    { label: "GDP per capita", unit: "$ PPP", good: "good", domain: [0, 90000], fmt: function (v) { return "$" + fmtMoney(v); }, desc: "GDP per capita, PPP (World Bank base, scenario growth)." },
    converge: { label: "Convergence", unit: "% of US", good: "good", domain: [0, 120], fmt: function (v) { return v.toFixed(0) + "%"; }, desc: "Income as % of US level — the great convergence in motion." },
    clean:    { label: "Clean electricity", unit: "% share", good: "good", domain: [0, 100], fmt: function (v) { return v.toFixed(0) + "%"; }, desc: "Renewables + nuclear share of electricity (scenario-adjusted)." },
    ai:       { label: "AI diffusion", unit: "index 0–100", good: "good", domain: [0, 100], fmt: function (v) { return v.toFixed(0); }, desc: "Technology/AI diffusion index (US = 100 in 2025)." },
    blend:    { label: "Mixed ancestry share", unit: "%", good: "good", domain: [0, 40], fmt: function (v) { return v.toFixed(1) + "%"; }, desc: "Mixed-ancestry / diaspora share of Western populations (H Heuristics projection)." },
    migrant:  { label: "Foreign-born share", unit: "%", good: "good", domain: [0, 40], fmt: function (v) { return v.toFixed(1) + "%"; }, desc: "Foreign-born share of Western populations (H Heuristics projection)." }
  };

  var METRIC_ORDER = ["pop", "popchg", "tmean", "heatdays", "pm25", "risk", "gdppc", "converge", "clean", "ai", "blend", "migrant"];

  function fmtPop(v) { // v in millions
    if (v >= 1000) return (v / 1000).toFixed(2) + "B";
    return v.toFixed(0) + "M";
  }
  function fmtMoney(v) {
    if (v >= 1000) return (v / 1000).toFixed(1) + "k";
    return v.toFixed(0);
  }
  function fmtB(v) { return (v / 1e9).toFixed(2) + "B"; }

  /* ---------------- scenario helpers ---------------- */
  function sc() { return SC[state.scenario]; }
  function growthAdj() { return { SSP1_26: 1.04, SSP2_45: 1.0, SSP3_70: 0.80, SSP5_85: 1.12 }[state.scenario]; }
  function cleanAdj() { return { SSP1_26: 1.12, SSP2_45: 1.0, SSP3_70: 0.72, SSP5_85: 0.9 }[state.scenario]; }
  function aiAdj() { return { SSP1_26: 1.10, SSP2_45: 1.0, SSP3_70: 0.72, SSP5_85: 1.05 }[state.scenario]; }
  function pmAdj() { return { SSP1_26: 0.85, SSP2_45: 1.0, SSP3_70: 1.18, SSP5_85: 1.02 }[state.scenario]; }
  function fragAdj() { return { SSP1_26: -2, SSP2_45: 0, SSP3_70: 3, SSP5_85: 0 }[state.scenario]; }
  function migAdj() { return { SSP1_26: 1.15, SSP2_45: 1.0, SSP3_70: 0.78, SSP5_85: 1.05 }[state.scenario]; }

  /* ---------------- country value engine ---------------- */
  function popAt(c, y) {
    var f = sc().pop[c.r], p25 = c.p[0], p50 = c.p[1], p100 = c.p[2];
    var p50e = p50 * (1 + (f - 1) * 0.55), p100e = p100 * f;
    var v;
    if (y <= 2050) v = lerp(p25, p50e, (y - 2025) / 25);
    else if (y <= 2100) v = lerp(p50e, p100e, (y - 2050) / 50);
    else {
      var drift = (c.r === "SSA" || c.r === "SAS") ? 0.0004 : 0.0011;
      v = p100e * Math.max(0.35, 1 - drift * (y - 2100));
    }
    return Math.max(0, v);
  }

  function tmeanAt(c, y) {
    var add = (sc().warming - 1.3) * c.lf;
    var d = y >= 2100 ? add : add * ramp(y);
    return c.t + d;
  }

  function heatAt(c, y) {
    var t0 = c.t, t1 = tmeanAt(c, y);
    var fromBase = c.hd * Math.exp(0.9 * (t1 - t0));
    var fromThr = t1 > 24.5 ? Math.pow(t1 - 24.5, 2.8) * 0.9 : 0;
    return clamp(Math.max(fromBase, fromThr), 0, 320);
  }

  function pmAt(c, y) {
    var m;
    var r = c.r;
    if (r === "SSA") m = y <= 2040 ? lerp(1, 1.15, (y - 2025) / 15) : lerp(1.15, 0.72, clamp((y - 2040) / 60, 0, 1));
    else if (r === "SAS") m = lerp(1, 0.55, clamp((y - 2025) / 75, 0, 1));
    else if (r === "EAP") m = lerp(1, 0.35, clamp((y - 2025) / 75, 0, 1));
    else if (r === "MENA") m = lerp(1, 0.60, clamp((y - 2025) / 75, 0, 1));
    else if (r === "LAC") m = lerp(1, 0.50, clamp((y - 2025) / 75, 0, 1));
    else if (r === "ECA") m = lerp(1, 0.45, clamp((y - 2025) / 75, 0, 1));
    else m = lerp(1, 0.55, clamp((y - 2025) / 75, 0, 1));
    return c.pm * m * pmAdj();
  }

  var FRAGILE = { TCD: 0.5, SSD: 0.5, SOM: 0.55, CAF: 0.5, NER: 0.6, MLI: 0.6, BFA: 0.65, AFG: 0.6, YEM: 0.55, SYR: 0.6, HTI: 0.65, COD: 0.7, GNB: 0.7, LBR: 0.7, SLE: 0.7, BDI: 0.7, ERI: 0.6, MOZ: 0.7, ZWE: 0.7, PRK: 0.6, VEN: 0.6, SDN: 0.75, IRQ: 0.8, LBY: 0.8 };

  function gdppcAt(c, y) {
    var gr = c.gr * growthAdj() * (FRAGILE[c.i] || 1);
    var K = c.i === "USA" ? 115000 : 95000;
    var g0 = c.g, r = gr / 100, t = y - 2025;
    var g;
    if (y <= 2100) g = K / (1 + (K / g0 - 1) * Math.exp(-r * t));
    else {
      var g2100 = K / (1 + (K / g0 - 1) * Math.exp(-r * 75));
      g = g2100 * Math.pow(1 + gr * 0.25 / 100, t - 75);
    }
    return clamp(g, 300, 150000);
  }

  function usGdppc(y) { return byIso.USA ? gdppcAt(byIso.USA, y) : 80000; }

  function cleanAt(c, y) {
    var target = clamp(c.c[1] * cleanAdj(), 0, 99);
    var v = lerp(c.c[0], target, y >= 2100 ? 1 : ramp(y));
    return clamp(v, 0, 99);
  }

  function aiAt(c, y) {
    var target = clamp(c.a[1] * aiAdj(), 0, 100);
    return clamp(lerp(c.a[0], target, y >= 2100 ? 1 : ramp(y)), 0, 100);
  }

  function riskAt(c, y) {
    var hd = heatAt(c, y), pm = pmAt(c, y), g = gdppcAt(c, y);
    var heatScore = clamp(hd / 150 * 35, 0, 35);
    var pmScore = clamp(pm / 70 * 25, 0, 25);
    var povScore = clamp((15000 - g) / 15000 * 25, 0, 25);
    var frag = { SSA: 20, SAS: 16, MENA: 15, LAC: 10, EAP: 8, ECA: 4, NAM: 1 }[c.r] + fragAdj();
    var risk = heatScore + pmScore + povScore + frag;
    if (y > 2100) risk += Math.min(8, 0.006 * (y - 2100));
    return clamp(risk, 0, 100);
  }

  function metricAt(c, metric, y) {
    switch (metric) {
      case "pop": return popAt(c, y) / 1e6;
      case "popchg": return (popAt(c, y) / c.p[0] - 1) * 100;
      case "tmean": return tmeanAt(c, y);
      case "heatdays": return heatAt(c, y);
      case "pm25": return pmAt(c, y);
      case "risk": return riskAt(c, y);
      case "gdppc": return gdppcAt(c, y);
      case "converge": return clamp(gdppcAt(c, y) / usGdppc(y) * 100, 0, 140);
      case "clean": return cleanAt(c, y);
      case "ai": return aiAt(c, y);
      case "blend": return c.w ? clamp(lerp(c.w.mx, c.w.mx2100, y >= 2100 ? 1 : ramp(y)) * migAdj(), 0, 60) : 0;
      case "migrant": return c.w ? clamp(lerp(c.w.fb, c.w.fb2100, y >= 2100 ? 1 : ramp(y)) * migAdj(), 0, 60) : 0;
    }
    return 0;
  }

  /* ---------------- color scale ---------------- */
  function colorScale() {
    var m = METRICS[state.metric];
    var ramp = m.good === "bad" ? RAMP_BAD : RAMP_GOOD;
    var interp = d3.piecewise(d3.interpolateRgb, ramp);
    return function (v) {
      var t = clamp((v - m.domain[0]) / (m.domain[1] - m.domain[0]), 0, 1);
      return interp(t);
    };
  }

  /* ---------------- DOM refs ---------------- */
  function $(id) { return document.getElementById(id); }
  var el = {
    year: $("yearDisplay"), slider: $("yearSlider"), btnPrev: $("btnPrev"), btnPlay: $("btnPlay"),
    btnNext: $("btnNext"), speed: $("speedSelect"), longRun: $("longRunToggle"),
    tlMid: $("tlMidLabel"), tlMax: $("tlMaxLabel"), badge: $("scenarioBadge"),
    scenGrid: $("scenarioGrid"), metricGrid: $("metricGrid"), themeGrid: $("themeGrid"),
    kpiGrid: $("kpiGrid"), kpiTag: $("kpiScenarioTag"),
    hdrPop: $("hdrPop"), hdrMedT: $("hdrMedT"), hdrAsia: $("hdrAsia"),
    mapContainer: $("mapContainer"), svg: $("mapSvg"), tooltip: $("mapTooltip"),
    legend: $("mapLegend"), narrative: $("narrativeCard"), ncHead: $("ncHead"), ncBody: $("ncBody"), ncClose: $("ncClose"),
    cdPlaceholder: $("countryPlaceholder"), cdData: $("countryData"), cdName: $("cdName"),
    cdRegion: $("cdRegion"), cdGrid: $("cdGrid"), cdSparkTitle: $("cdSparkTitle"), cdSpark: $("cdSpark"), cdNote: $("cdNote"),
    rankTitle: $("rankTitle"), rankSub: $("rankSub"), rankTable: $("rankTable"), rankMetricName: $("rankMetricName"),
  };

  /* ---------------- map ---------------- */
  var svg = d3.select(el.svg);
  var gWorld = svg.append("g");
  var projection, path, zoomBehavior;
  var R = 0; // resize observer

  function initMap() {
    var rect = el.mapContainer.getBoundingClientRect();
    var w = rect.width, h = rect.height;
    projection = d3.geoNaturalEarth1().fitExtent([[6, 6], [w - 6, h - 6]], { type: "Sphere" });
    path = d3.geoPath(projection);

    gWorld.selectAll("path").data(W.features, function (d) { return d.id; })
      .join("path")
      .attr("class", "country-path")
      .attr("d", path)
      .attr("fill", "#0d141c")
      .attr("stroke", "#16212c")
      .attr("stroke-width", 0.35)
      .on("mousemove", tooltipMove)
      .on("mouseleave", function () { el.tooltip.style.display = "none"; })
      .on("click", selectCountry);

    zoomBehavior = d3.zoom()
      .scaleExtent([1, 9])
      .on("zoom", function (ev) { gWorld.attr("transform", ev.transform); });

    svg.call(zoomBehavior).on("dblclick.zoom", null);
    $("zoomIn").onclick = function () { svg.transition().call(zoomBehavior.scaleBy, 1.5); };
    $("zoomOut").onclick = function () { svg.transition().call(zoomBehavior.scaleBy, 1 / 1.5); };
    $("zoomReset").onclick = function () { svg.transition().call(zoomBehavior.transform, d3.zoomIdentity); };
  }

  function resizeMap() {
    var rect = el.mapContainer.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return;
    svg.attr("width", rect.width).attr("height", rect.height);
    if (!projection) { initMap(); }
    else {
      projection.fitExtent([[6, 6], [rect.width - 6, rect.height - 6]], { type: "Sphere" });
      gWorld.selectAll("path").attr("d", path);
    }
    updateMap();
  }

  function tooltipMove(ev, d) {
    var c = byIso[d.id];
    if (!c) return;
    var m = METRICS[state.metric];
    var v = metricAt(c, state.metric, state.year);
    var rows = "";
    rows += ttRow("Population", fmtPop(popAt(c, state.year) / 1e6));
    rows += ttRow("Region", REGION_NAME[c.r] || c.r);
    rows += ttRow(m.label, m.fmt(v));
    if (state.metric !== "tmean") rows += ttRow("Mean temp", tmeanAt(c, state.year).toFixed(1) + "°C");
    if (c.w) rows += ttRow("Foreign-born", (metricAt(c, "migrant", state.year)).toFixed(1) + "%");
    var note = "";
    if (riskAt(c, state.year) >= 62) note = "Inside the survivability-risk zone.";
    else if (tmeanAt(c, state.year) >= 29) note = "Unprecedented heat (≥29 °C).";
    el.tooltip.innerHTML =
      '<div class="tt-name">' + c.n + '</div>' + rows +
      (note ? '<div class="tt-note">' + note + '</div>' : "");
    var rect = el.mapContainer.getBoundingClientRect();
    var x = ev.clientX - rect.left + 14, y = ev.clientY - rect.top + 10;
    var tw = el.tooltip.offsetWidth, th = el.tooltip.offsetHeight;
    if (x + tw > rect.width - 8) x = ev.clientX - rect.left - tw - 8;
    if (y + th > rect.height - 8) y = ev.clientY - rect.top - th - 8;
    el.tooltip.style.left = x + "px";
    el.tooltip.style.top = y + "px";
    el.tooltip.style.display = "block";
  }
  function ttRow(k, v) { return '<div class="tt-row"><span>' + k + '</span><b>' + v + '</b></div>'; }

  function selectCountry(ev, d) {
    state.selected = d.id;
    updateMap();
    renderCountry();
  }

  function updateMap() {
    if (!projection) return;
    var color = colorScale();
    var m = METRICS[state.metric];
    gWorld.selectAll("path")
      .attr("fill", function (d) {
        var c = byIso[d.id];
        if (!c) return "#0d141c";
        if (state.metric === "blend" || state.metric === "migrant") { if (!c.w) return "#0c1117"; }
        return color(metricAt(c, state.metric, state.year));
      })
      .attr("stroke", function (d) { return d.id === state.selected ? "#f0d48a" : "#16212c"; })
      .attr("stroke-width", function (d) { return d.id === state.selected ? 1.1 : 0.35; });
    renderLegend(m, color);
  }

  function renderLegend(m, color) {
    var grad = d3.piecewise(d3.interpolateRgb, m.good === "bad" ? RAMP_BAD : RAMP_GOOD);
    var stops = "";
    for (var i = 0; i <= 10; i++) stops += grad(i / 10) + " " + (i * 10) + "%,";
    var bar = "linear-gradient(90deg," + stops.slice(0, -1) + ")";
    el.legend.innerHTML =
      '<div class="lg-title">' + m.label + ' · <b>' + state.year + '</b></div>' +
      '<div class="lg-bar" style="background:' + bar + '"></div>' +
      '<div class="lg-labels"><span>' + m.fmt(m.domain[0]) + '</span><span>' + m.fmt(m.domain[1]) + '</span></div>';
  }

  function zoomToFeatures(ids) {
    if (!projection) return;
    var bounds = [[Infinity, Infinity], [-Infinity, -Infinity]];
    ids.forEach(function (id) {
      var f = geoById[id];
      if (!f) return;
      var b = path.bounds(f);
      if (b[0][0] < bounds[0][0]) bounds[0][0] = b[0][0];
      if (b[0][1] < bounds[0][1]) bounds[0][1] = b[0][1];
      if (b[1][0] > bounds[1][0]) bounds[1][0] = b[1][0];
      if (b[1][1] > bounds[1][1]) bounds[1][1] = b[1][1];
    });
    var rect = el.mapContainer.getBoundingClientRect();
    var dx = bounds[1][0] - bounds[0][0], dy = bounds[1][1] - bounds[0][1];
    var cx = (bounds[0][0] + bounds[1][0]) / 2, cy = (bounds[0][1] + bounds[1][1]) / 2;
    var scale = Math.max(1, Math.min(7, 0.82 / Math.max(dx / rect.width, dy / rect.height)));
    svg.transition().duration(750).call(zoomBehavior.transform,
      d3.zoomIdentity.translate(rect.width / 2 - scale * cx, rect.height / 2 - scale * cy).scale(scale));
  }

  /* ---------------- UI builders ---------------- */
  function buildControls() {
    // scenarios
    el.scenGrid.innerHTML = "";
    Object.keys(SC).forEach(function (k) {
      var b = document.createElement("button");
      b.className = "scen-btn" + (k === state.scenario ? " active" : "");
      b.textContent = SC[k].short;
      b.title = SC[k].name + " — " + SC[k].warming.toFixed(1) + " °C by 2100";
      b.onclick = function () { state.scenario = k; onScenario(); };
      el.scenGrid.appendChild(b);
    });
    // metrics
    el.metricGrid.innerHTML = "";
    METRIC_ORDER.forEach(function (k) {
      var m = METRICS[k];
      var b = document.createElement("button");
      b.className = "metric-btn" + (k === state.metric ? " active" : "");
      b.innerHTML = m.label + '<span class="u">' + m.unit + "</span>";
      b.onclick = function () { state.metric = k; onMetric(); };
      el.metricGrid.appendChild(b);
    });
    // themes
    var themes = [
      { id: "western", label: "Western Collapse", metric: "popchg" },
      { id: "africa", label: "Africa Rises", metric: "pop" },
      { id: "asia", label: "Asia & Convergence", metric: "converge" },
      { id: "clean", label: "Clean Transition", metric: "clean" },
      { id: "ai", label: "Technology / AI", metric: "ai" },
      { id: "risk", label: "Survivability Risk", metric: "risk" }
    ];
    el.themeGrid.innerHTML = "";
    themes.forEach(function (t) {
      var b = document.createElement("button");
      b.className = "theme-chip";
      b.textContent = t.label;
      b.onclick = function () { setTheme(t); };
      el.themeGrid.appendChild(b);
    });
  }

  function onScenario() {
    el.badge.textContent = SC[state.scenario].short + " · " + SC[state.scenario].name;
    el.kpiTag.textContent = SC[state.scenario].short;
    var btns = el.scenGrid.querySelectorAll(".scen-btn");
    btns.forEach(function (b) { b.classList.toggle("active", b.textContent === SC[state.scenario].short); });
    renderAll();
  }
  function onMetric() {
    var btns = el.metricGrid.querySelectorAll(".metric-btn");
    btns.forEach(function (b) { b.classList.remove("active"); });
    el.metricGrid.querySelectorAll(".metric-btn")[METRIC_ORDER.indexOf(state.metric)].classList.add("active");
    renderAll();
  }

  /* ---------------- theme narratives ---------------- */
  var THEME_TEXT = {
    western: {
      head: "Western Collapse — decline by fertility, reshaped by migration",
      body: function () {
        var idx = europeIndex();
        var gb = byIso.GBR, us = byIso.USA;
        return "Europe's population peaked around 2020 and falls ~20% by 2100 — cause: fertility near 1.4, not immigration. Migration has kept the EU growing since deaths exceeded births (~2012). By 2100 foreign-born and mixed-ancestry shares climb sharply (" +
          (gb ? metricAt(gb, "migrant", state.year).toFixed(0) : "—") + "% foreign-born in the UK, " +
          (us ? metricAt(us, "blend", state.year).toFixed(0) : "—") + "% mixed ancestry in the US). " +
          "Population index (2025=100): <b>" + idx.toFixed(0) + "</b>. A relative decline of the West — with blending, not disappearance.";
      },
      zoom: function () { zoomToFeatures(EUROPE.concat(["USA", "CAN", "AUS", "NZL"])); }
    },
    africa: {
      head: "Africa — from 1.5 to 3.8 billion",
      body: function () {
        var pop = 0; D.countries.forEach(function (c) { if (c.r === "SSA") pop += popAt(c, state.year); });
        var share = pop / worldPop() * 100;
        return "Sub-Saharan Africa grows from ~1.3 billion today to <b>3.5 billion by 2100</b> — from one in five humans to more than one in three. Dividend or trap depends on jobs, schooling and electricity. Africa is now <b>" + share.toFixed(0) + "%</b> of humanity (" + fmtB(pop) + ").";
      },
      zoom: function () { zoomToFeatures(D.countries.filter(function (c) { return c.r === "SSA"; }).map(function (c) { return c.i; })); }
    },
    asia: {
      head: "The Asian century, split in two",
      body: function () {
        var share = asiaOutputShare();
        return "Asia's share of world output climbed from 17% (1950) to ~44% today. East Asia ages faster than any society in history — China's population roughly halves by 2100 — shifting growth leadership to South and Southeast Asia. Projected share: <b>" + share.toFixed(0) + "%</b>. Convergence is the upside engine of the century.";
      },
      zoom: function () { zoomToFeatures(D.countries.filter(function (c) { return c.r === "EAP" || c.r === "SAS"; }).map(function (c) { return c.i; })); }
    },
    clean: {
      head: "Clean transition — the race between diffusion and damage",
      body: function () {
        var solar = 89;
        return "Solar module prices fell <b>89% since 2010</b>; clean technologies now reach poor countries in years, not generations. The clean-electricity share rises across every region — the difference between 0.6 and 3.8 billion people in unprecedented heat. Mitigation keeps the long-run floor low.";
      },
      zoom: null
    },
    ai: {
      head: "Technology / AI — diffusion accelerates convergence",
      body: function () {
        return "AI and digital diffusion compress the development cycle: extreme poverty fell from 43% of humanity (1990) to ~10% today, and child mortality from one in four (1950) to under 4%. AI is the newest layer of the upside engine — if its diffusion reaches the Global South, convergence accelerates; if it stalls, the century bifurcates.";
      },
      zoom: null
    },
    risk: {
      head: "The survivability trap — heat × pollution × poverty",
      body: function () {
        var trap = trappedShare();
        var hp = hotPolluted();
        return "Africa and South Asia face compounding pollution–climate feedback loops. The overlap of heat, polluted air, poverty and weak states traps roughly <b>" + trap.toFixed(0) + "%</b> of humanity (~" + fmtB(trap / 100 * worldPop()) + ") by 2100 under the middle road — and " + fmtB(hp) + " live hot <i>and</i> heavily polluted. In a fragmented, high-warming world the trap becomes the median human condition.";
      },
      zoom: function () { zoomToFeatures(D.countries.filter(function (c) { return c.r === "SSA" || c.r === "SAS" || c.r === "MENA"; }).map(function (c) { return c.i; })); }
    }
  };

  function setTheme(t) {
    if (state.theme === t.id) { state.theme = null; }
    else { state.theme = t.id; state.metric = t.metric; }
    var chips = el.themeGrid.querySelectorAll(".theme-chip");
    chips.forEach(function (b, i) { b.classList.toggle("active", state.theme && b.textContent === t.label); });
    if (state.theme) {
      el.narrative.style.display = "block";
      el.ncHead.textContent = THEME_TEXT[t.id].head;
      el.ncBody.innerHTML = THEME_TEXT[t.id].body();
      if (THEME_TEXT[t.id].zoom) setTimeout(THEME_TEXT[t.id].zoom, 60);
    } else {
      el.narrative.style.display = "none";
      zoomToFeatures(D.countries.map(function (c) { return c.i; }));
    }
    var btns = el.metricGrid.querySelectorAll(".metric-btn");
    btns.forEach(function (b) { b.classList.remove("active"); });
    el.metricGrid.querySelectorAll(".metric-btn")[METRIC_ORDER.indexOf(state.metric)].classList.add("active");
    renderAll();
  }
  el.ncClose.onclick = function () { state.theme = null; el.narrative.style.display = "none"; };

  /* ---------------- aggregate stats ---------------- */
  function worldPop() { var s = 0; D.countries.forEach(function (c) { s += popAt(c, state.year); }); return s; }
  function asiaOutputShare() {
    var asia = 0, world = 0;
    D.countries.forEach(function (c) {
      var o = gdppcAt(c, state.year) * popAt(c, state.year);
      world += o;
      if (c.r === "EAP" || c.r === "SAS") asia += o;
    });
    return world ? asia / world * 100 : 0;
  }
  function europeIndex() {
    var now = 0, base = 0;
    D.countries.forEach(function (c) {
      if (EU_SET[c.i]) { now += popAt(c, state.year); base += c.p[0]; }
    });
    return base ? now / base * 100 : 100;
  }
  function medianT() { return wQuantile("tmean", 0.5); }
  function cdfHeat(t) { return 1 / (1 + Math.exp((29 - t) / 1.15)); }
  var TRAP_SHIFT = { SSP1_26: 4, SSP2_45: 0, SSP3_70: -14, SSP5_85: -5 };
  function trapFrac(risk, y) { return clamp((risk - (64 - 18 * ramp(y) + TRAP_SHIFT[state.scenario])) / 34, 0, 0.9); }
  function trappedShare() {
    var n = 0, tot = 0;
    D.countries.forEach(function (c) {
      var p = popAt(c, state.year);
      tot += p;
      n += p * trapFrac(riskAt(c, state.year), state.year);
    });
    return tot ? n / tot * 100 : 0;
  }
  function heatShare() {
    var n = 0, tot = 0;
    D.countries.forEach(function (c) {
      var p = popAt(c, state.year), t = tmeanAt(c, state.year);
      tot += p;
      var hsEff = c.hs * (state.year >= 2100 ? 1 : ramp(state.year));
      var share = (1 - hsEff) * cdfHeat(t) + hsEff * cdfHeat(t + 2.5);
      n += p * share;
    });
    return tot ? n / tot * 100 : 0;
  }
  function hotPolluted() {
    var n = 0;
    D.countries.forEach(function (c) {
      var t = tmeanAt(c, state.year);
      if ((t >= 27 || heatAt(c, state.year) >= 30) && c.pm >= 35) n += popAt(c, state.year);
    });
    return n;
  }

  function wQuantile(metric, q) {
    var arr = D.countries.map(function (c) { return { v: metricAt(c, metric, state.year), p: popAt(c, state.year) }; });
    arr.sort(function (a, b) { return a.v - b.v; });
    var tot = arr.reduce(function (s, x) { return s + x.p; }, 0), acc = 0;
    for (var i = 0; i < arr.length; i++) { acc += arr[i].p; if (acc >= tot * q) return arr[i].v; }
    return arr[arr.length - 1].v;
  }
  function wShare(metric, test) {
    var n = 0, tot = 0;
    D.countries.forEach(function (c) {
      var p = popAt(c, state.year);
      tot += p;
      if (test(metricAt(c, metric, state.year))) n += p;
    });
    return tot ? n / tot : 0;
  }

  /* ---------------- KPI render ---------------- */
  function renderKpis() {
    var medT = medianT(), trap = trappedShare(), asia = asiaOutputShare();
    el.hdrPop.textContent = fmtB(worldPop());
    el.hdrMedT.textContent = medT.toFixed(1) + "°C";
    el.hdrAsia.textContent = asia.toFixed(0) + "%";
    el.kpiTag.textContent = SC[state.scenario].short;

    var pop = worldPop();
    var heat = heatShare();
    var hp = hotPolluted();
    var idx = europeIndex();
    var cards = [
      { v: fmtB(pop), l: "World population", d: "peak ~10.3B mid-2080s", tone: "gold" },
      { v: medT.toFixed(1) + "°C", l: "Median human temp", d: "21.9°C today → ~26°C SSP2", tone: "coral" },
      { v: heat.toFixed(0) + "%", l: "Unprecedented heat", d: "mean annual ≥29 °C", tone: "danger" },
      { v: trap.toFixed(0) + "%", l: "Risk-zone share", d: "survivability trap", tone: "danger" },
      { v: asia.toFixed(0) + "%", l: "Asia output share", d: "17% (1950) → ~44% today", tone: "teal" },
      { v: idx.toFixed(0), l: "Europe pop index", d: "2025 = 100 · −20% by 2100", tone: "blue" }
    ];
    el.kpiGrid.innerHTML = "";
    cards.forEach(function (k) {
      var div = document.createElement("div");
      div.className = "kpi tone-" + k.tone;
      div.innerHTML = '<div class="v">' + k.v + '</div><div class="l">' + k.l + '</div><div class="d">' + k.d + "</div>";
      el.kpiGrid.appendChild(div);
    });
    if (state.theme) { el.ncBody.innerHTML = THEME_TEXT[state.theme].body(); }
  }

  /* ---------------- rankings ---------------- */
  function renderRankings() {
    var m = METRICS[state.metric];
    el.rankMetricName.textContent = m.label;
    el.rankSub.textContent = m.desc + " (" + state.year + ", " + SC[state.scenario].short + ")";
    var rows = D.countries.slice()
      .filter(function (c) { return !(state.metric === "blend" || state.metric === "migrant") || c.w; })
      .map(function (c) { return { c: c, v: metricAt(c, state.metric, state.year) }; })
      .sort(function (a, b) { return b.v - a.v; })
      .slice(0, 12);
    el.rankTable.innerHTML = "";
    rows.forEach(function (r, i) {
      var div = document.createElement("div");
      div.className = "rank-row";
      div.innerHTML = '<span class="pos">' + (i + 1) + '</span><span class="nm">' + r.c.n + '</span>' +
        '<span class="d">' + REGION_NAME[r.c.r] + '</span><span class="val">' + m.fmt(r.v) + "</span>";
      div.onclick = function () { state.selected = r.c.i; updateMap(); renderCountry(); };
      el.rankTable.appendChild(div);
    });
  }

  /* ---------------- country panel ---------------- */
  function renderCountry() {
    var c = state.selected ? byIso[state.selected] : null;
    if (!c) {
      el.cdPlaceholder.style.display = "block";
      el.cdData.style.display = "none";
      return;
    }
    el.cdPlaceholder.style.display = "none";
    el.cdData.style.display = "block";
    el.cdName.textContent = c.n;
    el.cdRegion.textContent = (REGION_NAME[c.r] || c.r) + " · " + SC[state.scenario].short;

    var cells = [
      { v: fmtPop(popAt(c, state.year) / 1e6), l: "Population" },
      { v: tmeanAt(c, state.year).toFixed(1) + "°C", l: "Mean temp" },
      { v: heatAt(c, state.year).toFixed(0) + " d", l: "Heat days HI>41" },
      { v: pmAt(c, state.year).toFixed(0) + " µg/m³", l: "PM2.5" },
      { v: riskAt(c, state.year).toFixed(0), l: "Risk index" },
      { v: "$" + fmtMoney(gdppcAt(c, state.year)), l: "GDP/cap PPP" },
      { v: metricAt(c, "converge", state.year).toFixed(0) + "%", l: "Convergence" },
      { v: cleanAt(c, state.year).toFixed(0) + "%", l: "Clean power" }
    ];
    if (c.w) cells.push({ v: metricAt(c, "migrant", state.year).toFixed(1) + "%", l: "Foreign-born" });
    if (c.w) cells.push({ v: metricAt(c, "blend", state.year).toFixed(1) + "%", l: "Mixed ancestry" });
    el.cdGrid.innerHTML = "";
    cells.forEach(function (k) {
      var div = document.createElement("div");
      div.className = "cd-cell";
      div.innerHTML = '<div class="v">' + k.v + '</div><div class="l">' + k.l + "</div>";
      el.cdGrid.appendChild(div);
    });

    el.cdSparkTitle.textContent = METRICS[state.metric].label + " · " + state.year + " (" + SC[state.scenario].short + ")";
    drawSpark(c);
    el.cdNote.innerHTML = noteFor(c);
  }

  function noteFor(c) {
    var risk = riskAt(c, state.year), t = tmeanAt(c, state.year);
    if (risk >= 62) return "Inside the survivability-risk zone: heat, pollution and poverty compound here. Cheap electricity, cooling, clean air and mobility are the exit levers.";
    if (t >= 29) return "Living in unprecedented heat (mean annual ≥29 °C) — outside the historical human climate niche.";
    if (c.r === "SSA") return "Africa's demographic rise: dividend or trap depends on jobs, schooling and electricity.";
    if (c.r === "EAP" || c.r === "SAS") return "The Asian century — rapid convergence, with growth leadership shifting to South and Southeast Asia.";
    if (c.w) return "Western decline by fertility, reshaped by migration and blending.";
    return "Select any metric and scrub the timeline to explore this country's trajectory.";
  }

  var sparkChart = null;
  function drawSpark(c) {
    var labels = [], vals = [];
    for (var y = 2025; y <= 2100; y += 5) {
      labels.push(y);
      vals.push(metricAt(c, state.metric, y));
    }
    if (sparkChart) sparkChart.destroy();
    sparkChart = new Chart(el.cdSpark, {
      type: "line",
      data: { labels: labels, datasets: [{ data: vals, borderColor: "#d9a441", backgroundColor: "rgba(217,164,65,.12)", fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.4 }] },
      options: {
        responsive: true, maintainAspectRatio: true, animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
          x: { ticks: { color: "#6d8297", font: { size: 8, family: "JetBrains Mono" }, maxTicksLimit: 5 }, grid: { color: "rgba(29,42,55,.6)" } },
          y: { ticks: { color: "#6d8297", font: { size: 8, family: "JetBrains Mono" }, maxTicksLimit: 4 }, grid: { color: "rgba(29,42,55,.6)" } }
        }
      }
    });
  }

  /* ---------------- charts ---------------- */
  var chartInstances = {};
  function lineChart(id, labels, datasets, opts) {
    var c = chartInstances[id];
    if (c) c.destroy();
    var ctx = document.getElementById(id);
    if (!ctx) return;
    chartInstances[id] = new Chart(ctx, {
      type: "line",
      data: { labels: labels, datasets: datasets },
      options: Object.assign({
        responsive: true, maintainAspectRatio: true, animation: false,
        plugins: { legend: { labels: { color: "#a9bac9", boxWidth: 10, font: { size: 8.5, family: "Inter" } } } },
        scales: {
          x: { ticks: { color: "#6d8297", font: { size: 8, family: "JetBrains Mono" }, maxTicksLimit: 6 }, grid: { color: "rgba(29,42,55,.6)" } },
          y: { ticks: { color: "#6d8297", font: { size: 8, family: "JetBrains Mono" }, maxTicksLimit: 5 }, grid: { color: "rgba(29,42,55,.6)" } }
        }
      }, opts || {})
    });
  }

  function renderCharts() {
    var maxY = state.longRun ? LONG : END;
    var labels = [], step = maxY > 2100 ? 25 : 5;
    for (var y = 2025; y <= maxY; y += step) labels.push(y);

    // region population
    var regionColors = { SSA: "#e06a5c", SAS: "#d9a441", EAP: "#4f9ecf", ECA: "#8b7ec8", MENA: "#e0a040", LAC: "#3fb6a3", NAM: "#5f8f6f" };
    var datasets = D.regionOrder.map(function (r) {
      return {
        label: REGION_NAME[r], data: labels.map(function (y) {
          var s = 0; D.countries.forEach(function (c) { if (c.r === r) s += popAt(c, y); });
          return +(s / 1e9).toFixed(2);
        }), borderColor: regionColors[r], backgroundColor: regionColors[r] + "22", fill: true, tension: 0.25, pointRadius: 0, borderWidth: 1.2
      };
    });
    lineChart("chartRegions", labels, datasets, {
      plugins: { legend: { position: "bottom", labels: { color: "#a9bac9", boxWidth: 8, font: { size: 7.5 } } } },
      scales: { y: { stacked: false, title: { display: true, text: "billions", color: "#6d8297", font: { size: 8 } } } }
    });

    // output shares
    var asia = labels.map(function (y) {
      var a = 0, w = 0;
      D.countries.forEach(function (c) {
        var o = gdppcAt(c, y) * popAt(c, y);
        w += o; if (c.r === "EAP" || c.r === "SAS") a += o;
      });
      return +(a / w * 100).toFixed(1);
    });
    var west = labels.map(function (y) {
      var a = 0, w = 0;
      D.countries.forEach(function (c) {
        var o = gdppcAt(c, y) * popAt(c, y);
        w += o; if (c.r === "NAM" || c.r === "ECA") a += o;
      });
      return +(a / w * 100).toFixed(1);
    });
    lineChart("chartOutput", labels, [
      { label: "Asia (EAP+SAS)", data: asia, borderColor: "#d9a441", backgroundColor: "rgba(217,164,65,.1)", fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.6 },
      { label: "West (NAM+ECA)", data: west, borderColor: "#4f9ecf", backgroundColor: "rgba(79,158,207,.1)", fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.4 }
    ], { scales: { y: { title: { display: true, text: "% of world output", color: "#6d8297", font: { size: 8 } } } } });

    // exposed
    var heat = labels.map(function (y) { return +(heatShareAt(y) * worldPopAt(y) / 1e9).toFixed(2); });
    var hp = labels.map(function (y) {
      var n = 0;
      D.countries.forEach(function (c) {
        var t = tmeanAt(c, y);
        if ((t >= 27 || heatAt(c, y) >= 30) && c.pm >= 35) n += popAt(c, y);
      });
      return +(n / 1e9).toFixed(2);
    });
    var trap = labels.map(function (y) { return +(trapShareAt(y) * worldPopAt(y) / 1e9).toFixed(2); });
    lineChart("chartExposed", labels, [
      { label: "Unprecedented heat (≥29°C)", data: heat, borderColor: "#d9544f", backgroundColor: "rgba(217,84,79,.1)", fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.4 },
      { label: "Hot + polluted (PM2.5 ≥35)", data: hp, borderColor: "#e0a040", backgroundColor: "rgba(224,160,64,.08)", fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.4 },
      { label: "Survivability-risk zone", data: trap, borderColor: "#8b7ec8", backgroundColor: "rgba(139,126,200,.08)", fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.4 }
    ], { scales: { y: { title: { display: true, text: "billions of people", color: "#6d8297", font: { size: 8 } } } } });

    // long run
    var lr = [];
    for (var yy = 2025; yy <= LONG; yy += 25) lr.push(yy);
    var lrT = lr.map(function (y) { return +wQuantileAt(y, "tmean", 0.5).toFixed(1); });
    var lrRisk = lr.map(function (y) { return +trapShareAt(y).toFixed(0); });
    lineChart("chartLongrun", lr, [
      { label: "Median human temp (°C)", data: lrT, borderColor: "#d9544f", backgroundColor: "rgba(217,84,79,.08)", fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.5, yAxisID: "y" },
      { label: "Risk-zone share (%)", data: lrRisk, borderColor: "#d9a441", backgroundColor: "rgba(217,164,65,.08)", fill: false, tension: 0.3, pointRadius: 0, borderWidth: 1.5, yAxisID: "y2" }
    ], {
      scales: {
        y: { position: "left", title: { display: true, text: "°C", color: "#d9544f", font: { size: 8 } } },
        y2: { position: "right", min: 0, max: 100, title: { display: true, text: "%", color: "#d9a441", font: { size: 8 } }, grid: { drawOnChartArea: false } }
      }
    });
  }

  function worldPopAt(y) { var s = 0; D.countries.forEach(function (c) { s += popAt(c, y); }); return s; }
  function wShareAt(y, metric, test) {
    var n = 0, tot = 0;
    D.countries.forEach(function (c) {
      var p = popAt(c, y);
      tot += p;
      if (test(metricAt(c, metric, y))) n += p;
    });
    return tot ? n / tot : 0;
  }
  function wQuantileAt(y, metric, q) {
    var arr = D.countries.map(function (c) { return { v: metricAt(c, metric, y), p: popAt(c, y) }; });
    arr.sort(function (a, b) { return a.v - b.v; });
    var tot = arr.reduce(function (s, x) { return s + x.p; }, 0), acc = 0;
    for (var i = 0; i < arr.length; i++) { acc += arr[i].p; if (acc >= tot * q) return arr[i].v; }
    return arr[arr.length - 1].v;
  }
  function heatShareAt(y) {
    var n = 0, tot = 0;
    D.countries.forEach(function (c) {
      var p = popAt(c, y), t = tmeanAt(c, y);
      tot += p;
      var hsEff = c.hs * (y >= 2100 ? 1 : ramp(y));
      var share = (1 - hsEff) * cdfHeat(t) + hsEff * cdfHeat(t + 2.5);
      n += p * share;
    });
    return tot ? n / tot : 0;
  }
  function trapShareAt(y) {
    var n = 0, tot = 0;
    D.countries.forEach(function (c) {
      var p = popAt(c, y);
      tot += p;
      n += p * trapFrac(riskAt(c, y), y);
    });
    return tot ? n / tot * 100 : 0;
  }

  /* ---------------- timeline ---------------- */
  function setYear(y, fromSlider) {
    state.year = clamp(Math.round(y), START, state.longRun ? LONG : END);
    if (!fromSlider) el.slider.value = state.year;
    el.year.textContent = state.year + "<small>CE</small>";
    renderAll();
  }

  function play() {
    state.playing = !state.playing;
    el.btnPlay.textContent = state.playing ? "❚❚" : "▶";
    el.btnPlay.classList.toggle("active", state.playing);
    if (state.playing) {
      state.timer = setInterval(function () {
        var next = state.year + 1;
        var maxY = state.longRun ? LONG : END;
        if (next > maxY) { setYear(START); }
        else setYear(next);
      }, 420 / state.speed);
    } else if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  function setLongRun(on) {
    state.longRun = on;
    var maxY = on ? LONG : END;
    el.slider.max = maxY;
    el.tlMax.textContent = maxY;
    el.tlMid.textContent = Math.round((START + maxY) / 2);
    if (state.year > maxY) setYear(maxY);
    el.badge.textContent = (on ? "LONG RUN → 2500 · " : "") + SC[state.scenario].short + " · " + SC[state.scenario].name;
    renderAll();
  }

  /* ---------------- render all ---------------- */
  var activeTab = "country";
  function renderAll() {
    updateMap();
    renderKpis();
    renderRankings();
    if (state.selected) renderCountry();
    if (activeTab === "brief" || activeTab === "longrun") renderCharts();
  }

  /* ---------------- events ---------------- */
  function bind() {
    el.slider.addEventListener("input", function () { setYear(+el.slider.value, true); });
    el.btnPrev.onclick = function () { setYear(state.year - 1); };
    el.btnNext.onclick = function () { setYear(state.year + 1); };
    el.btnPlay.onclick = play;
    el.speed.onchange = function () { state.speed = +el.speed.value; if (state.playing) { clearInterval(state.timer); play(); play(); } };
    el.longRun.onchange = function () { setLongRun(el.longRun.checked); };
    document.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") setYear(state.year - 1);
      else if (e.key === "ArrowRight") setYear(state.year + 1);
      else if (e.key === " ") { e.preventDefault(); play(); }
    });
    document.querySelectorAll(".tab").forEach(function (t) {
      t.onclick = function () {
        activeTab = t.dataset.tab;
        document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
        t.classList.add("active");
        ["country", "rank", "brief", "longrun"].forEach(function (id) {
          $("tab" + id[0].toUpperCase() + id.slice(1)).style.display = (id === t.dataset.tab) ? "block" : "none";
        });
        if (t.dataset.tab === "brief" || t.dataset.tab === "longrun") renderCharts();
      };
    });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    buildControls();
    bind();
    if (typeof ResizeObserver !== "undefined") {
      R = new ResizeObserver(function () { resizeMap(); });
      R.observe(el.mapContainer);
    }
    window.addEventListener("resize", resizeMap);
    resizeMap();
    el.badge.textContent = SC[state.scenario].short + " · " + SC[state.scenario].name;
    el.tlMax.textContent = END; el.tlMid.textContent = "2050";
    setYear(2025);
    // default narrative
    el.ncHead.textContent = "The century in brief";
    el.ncBody.innerHTML = "Humanity finishes the demographic and development transitions and races to complete the energy transition. <b>The direction is upward — the distribution is the problem.</b> World population peaks ~10.3B in the mid-2080s; Africa passes 3B; Asia's share of output reaches ~44%; the survivability trap concentrates heat, pollution and poverty where populations still grow. Scrub the timeline, switch scenarios, click a country.";
  }

  boot();
})();
