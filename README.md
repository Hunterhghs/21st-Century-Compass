# 21st Century Compass

**World map simulation · 2025–2100 (+ long run to 2500)** — a fixed-position, single-page web app by H Heuristics.

A forward simulation of the 21st century built around two H Heuristics reports:

- [The Century Compass](https://researchreports.hheuristics.com/reports/century-compass/) (HH-2026-25)
- [The Survivability Trap](https://digitalreports.hheuristics.com/reports/survivability-trap-demographic-shift/) (Digital Report 2026-69)

---

## What it shows

A dark, GIS-style world map with a full simulation engine. Scrub the 2025–2100 timeline, switch between four SSP scenarios, change the choropleth metric, click any country, and read the briefing charts.

### Theme lenses

| Lens | Narrative |
|------|-----------|
| **Western Collapse** | Europe's population declines ~20% by 2100 (fertility ~1.4), reshaped by immigration and rising foreign-born / mixed-ancestry shares — relative decline by fertility, blending rather than disappearance. |
| **Africa Rises** | Sub-Saharan Africa grows from ~1.3 to ~3.5 billion — from one in five humans to more than one in three. |
| **Asia & Convergence** | Asia's share of world output ~44%; East Asia ages fastest in history while growth leadership shifts to South and Southeast Asia. |
| **Clean Transition** | Solar module prices −89% since 2010; clean electricity diffuses across every region. |
| **Technology / AI** | AI and digital diffusion compress the development cycle — the newest layer of the upside engine. |
| **Survivability Risk** | Africa and South Asia face compounding pollution–climate feedback loops; the overlap of heat, pollution, poverty and weak states concentrates the trap. |

### Scenarios

- **SSP1-2.6 · Net Zero Fast** (+1.8 °C) — the low-floor world
- **SSP2-4.5 · Middle Road** (+2.7 °C) — central estimate
- **SSP3-7.0 · Fragmented World** (+3.6 °C) — the pessimistic tail: ≈ half of humanity in the survivability-risk zone
- **SSP5-8.5 · Fossil Rush** (+4.4 °C) — high emissions, high technology

A **Long Run → 2500** toggle extends the timeline: warming stops only at net-zero CO₂ and then *holds*, so the conditions of the 2090s are a floor for centuries — the "polycrisis apocalypse" tail.

### Metrics (choropleth)

Population · population change % · mean annual temperature · dangerous-heat days (HI > 41 °C) · PM2.5 · survivability-risk index · GDP per capita · convergence (% of US) · clean-electricity share · AI diffusion · mixed-ancestry share · foreign-born share.

## Data & method

- **Population**: UN World Population Prospects 2024 (medium variant, via Our World in Data), with SSP region factors for other scenarios.
- **Climate**: CCKP CMIP6 climatology pattern + SSP warming levels, calibrated to the human-climate-niche thresholds of Xu et al. (2020) and Lenton et al. (2023) (mean annual temperature ≥ 29 °C).
- **Air pollution**: Washington University SatPM population-weighted PM2.5 (via Our World in Data), with regional trajectories.
- **Economy**: World Bank GDP per capita PPP (constant 2021 intl $) with logistic catch-up growth and fragility damping.
- **Western demographics**: foreign-born and mixed-ancestry shares — H Heuristics projection judgments, labelled as such.
- **Survivability risk**: H Heuristics composite index (heat + pollution + poverty + institutional fragility).

All projection fields beyond sourced data are **H Heuristics simulation judgments** — simulation output, not prediction. Key aggregates are calibrated to the two source reports (median human temperature 21.9 °C today → ~26 °C by the 2090s under SSP2-4.5; 0.6 → 3.5 billion hot + polluted; ~17–19% in the survivability-risk zone under the middle road).

## Quick start

No build step. Serve the directory (or open `index.html` directly):

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Requires network for Google Fonts, D3 v7, and Chart.js (CDN). Country geometry is self-hosted (`js/world.js`), so the map carries **no API-key tile watermarks**.

## Project structure

```
index.html        App shell (fixed 3-panel layout)
css/style.css     "Cartographic Gothic" design system
js/app.js         Simulation engine + UI (D3 choropleth, Chart.js)
js/data.js        Country dataset (generated)
js/world.js       Natural Earth 110m country boundaries (generated)
scripts/build_data.py   Regenerates js/data.js + js/world.js from source CSVs
favicon.svg, _headers, README.md
```

## Regenerate data

```bash
python3 scripts/build_data.py   # reads cached CSVs in /tmp/cc-data
```

## Deploy

Static. Cloudflare Pages / GitHub Pages — `_headers` ships security headers.

---

© 2026 H Heuristics · Hunter Hughes. Sources cited in the footer. Simulation output, not prediction.
