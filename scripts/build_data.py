#!/usr/bin/env python3
"""Build js/data.js + js/world.js for the 21st Century Compass simulation.

Inputs (cached in /tmp/cc-data):
  unpop.csv     UN WPP 2024 (OWID: population-with-un-projections)
  pm25.csv      OWID pm25-air-pollution (SatPM)
  gdppc.csv     World Bank GDP per capita PPP (constant 2021 intl $)
  world.geojson 180-country GeoJSON (johan/world.geo.json, feature.id = ISO3)
"""
import csv, json, math, os

DATA = "/tmp/cc-data"

# ----------------------------------------------------------------------------
# 1. Region assignment (World Bank style, 7 regions)
# ----------------------------------------------------------------------------
REGION = {}
def R(region, *isos):
    for i in isos:
        REGION[i] = region

R("SSA","AGO","BDI","BEN","BFA","BWA","CAF","CIV","CMR","COD","COG","COM","CPV","DJI","ERI","ETH","GAB","GHA","GIN","GMB","GNB","GNQ","KEN","LBR","LBY","LSO","MDG","MLI","MOZ","MRT","MWI","NAM","NER","NGA","RWA","SDN","SEN","SLE","SOM","SSD","STP","SWZ","SYC","TCD","TGO","TZA","UGA","ZAF","ZMB","ZWE","ESH")
R("SAS","AFG","BGD","BTN","IND","LKA","MDV","NPL","PAK")
R("EAP","AUS","BRN","CHN","FJI","IDN","JPN","KHM","KIR","KOR","LAO","MHL","MMR","MNG","MYS","NCL","NZL","PHL","PNG","PRK","SLB","THA","TLS","TON","TWN","VNM","VUT","WSM")
R("ECA","ALB","ARM","AZE","BIH","BLR","BGR","GEO","HRV","CZE","DNK","EST","FIN","FRA","DEU","GRC","HUN","ISL","IRL","ITA","KAZ","KGZ","XKX","LVA","LTU","LUX","MDA","MNE","MKD","NLD","NOR","POL","PRT","ROU","RUS","SRB","SVK","SVN","ESP","SWE","CHE","TJK","TKM","TUR","UKR","UZB","GBR","AUT","BEL","CYP","MLT")
R("MENA","DZA","BHR","EGY","IRN","IRQ","ISR","JOR","KWT","LBN","MAR","OMN","PSE","QAT","SAU","SYR","TUN","ARE","YEM")
R("LAC","ARG","BLZ","BOL","BRA","CHL","COL","CRI","CUB","DOM","ECU","GTM","GUY","HND","HTI","JAM","MEX","NIC","PAN","PER","PRY","SLV","SUR","TTO","URY","VEN","BHS","BRB","PRI","GUF","GLP","MTQ","FLK","BMU","GRL","SGS","ATF","ATA")
R("NAM","CAN","USA")

# small territories → parent region
REGION.update({"ATA":"NAM","ATF":"ECA","FLK":"LAC","GUF":"LAC","NCL":"EAP","PRI":"LAC","BMU":"NAM","GRL":"NAM","ESH":"SSA"})

REGION_NAME = {
 "SSA":"Sub-Saharan Africa","SAS":"South Asia","EAP":"East Asia & Pacific",
 "ECA":"Europe & Central Asia","MENA":"Middle East & North Africa",
 "LAC":"Latin America & Caribbean","NAM":"North America",
}

# ----------------------------------------------------------------------------
# 2. Anchor tables (hand-calibrated to H Heuristics reports / UN WPP / CCKP)
# ----------------------------------------------------------------------------
# Mean annual temperature 2025 (population-weighted where sensible), °C
TMEAN = {
 "IND":25.5,"PAK":23.5,"BGD":25.8,"NPL":14.5,"LKA":26.4,"AFG":13.8,
 "NGA":27.5,"ETH":22.2,"COD":24.6,"TZA":22.5,"UGA":22.5,"KEN":24.2,
 "NER":28.3,"MLI":28.8,"TCD":27.5,"SDN":27.5,"SSD":27.0,"SEN":28.0,
 "BFA":28.6,"GIN":25.0,"CIV":26.0,"GHA":26.8,"BEN":27.5,"TGO":27.5,
 "CMR":24.8,"ZMB":21.5,"ZWE":21.2,"MWI":21.5,"MOZ":24.0,"MDG":22.5,
 "AGO":22.5,"ZAF":17.5,"NAM":20.0,"BWA":22.0,"RWA":19.5,"BDI":20.0,
 "SOM":27.5,"ERI":24.5,"DJI":28.5,"GMB":27.5,"GNB":27.0,"SLE":26.5,"LBR":25.8,
 "IDN":25.9,"PHL":25.8,"VNM":24.5,"THA":27.0,"MMR":24.8,"KHM":27.4,
 "LAO":24.5,"MYS":25.5,"PNG":25.0,"FJI":24.5,
 "CHN":13.5,"JPN":12.5,"KOR":12.0,"PRK":8.0,"MNG":1.0,"TWN":22.5,
 "AUS":21.5,"NZL":11.5,
 "USA":12.0,"CAN":-1.5,"MEX":21.5,
 "BRA":24.9,"COL":24.5,"PER":19.5,"VEN":25.5,"ECU":21.5,"BOL":18.5,
 "ARG":14.5,"CHL":11.5,"PRY":23.5,"URY":17.5,"GTM":22.5,"HND":24.0,
 "NIC":25.0,"PAN":26.5,"CRI":25.0,"CUB":25.0,"DOM":25.5,"HTI":25.5,
 "SLV":25.0,"JAM":26.0,"GUY":26.5,"SUR":26.5,
 "RUS":0.5,"UKR":8.5,"BLR":6.5,"POL":8.5,"DEU":9.3,"FRA":11.5,"GBR":9.3,
 "ITA":13.5,"ESP":14.5,"PRT":15.5,"GRC":15.5,"TUR":12.5,"ROU":9.5,
 "HUN":10.5,"CZE":8.5,"SVK":8.5,"AUT":7.5,"CHE":6.5,"NLD":10.0,"BEL":10.0,
 "DNK":8.5,"SWE":3.5,"NOR":2.5,"FIN":2.5,"EST":6.0,"LVA":6.5,"LTU":7.0,
 "IRL":10.0,"ISL":3.0,"ALB":12.5,"SRB":11.0,"HRV":12.0,"SVN":9.5,
 "MNE":10.5,"MKD":10.5,"BIH":10.5,"BGR":11.0,"MDA":10.0,"GEO":9.5,
 "ARM":7.5,"AZE":12.5,"KAZ":6.5,"UZB":13.5,"TKM":16.5,"KGZ":5.5,"TJK":7.5,
 "EGY":22.8,"DZA":23.5,"MAR":19.5,"TUN":19.5,"LBY":22.0,"SAU":25.5,
 "IRN":18.5,"IRQ":22.5,"SYR":19.5,"YEM":25.5,"OMN":27.5,"ARE":27.5,
 "QAT":27.5,"KWT":27.0,"JOR":18.5,"LBN":17.5,"ISR":20.0,"PSE":20.0,
}

# Baseline days/year with heat index > 41°C (2025 approx)
HEATDAYS = {
 "IND":25,"PAK":40,"BGD":30,"NPL":3,"LKA":15,
 "NGA":30,"NER":45,"MLI":55,"TCD":42,"SDN":45,"SSD":30,"SEN":25,"BFA":45,
 "BEN":25,"TGO":25,"GHA":22,"CIV":18,"SOM":40,"DJI":35,"GMB":25,"GNB":22,"SLE":20,"LBR":18,
 "THA":20,"MMR":15,"KHM":25,"LAO":18,"MYS":12,"IDN":8,"PHL":10,"VNM":12,
 "EGY":12,"SAU":45,"ARE":50,"OMN":45,"QAT":50,"KWT":45,"IRQ":25,"YEM":40,"SDN":45,
 "BRA":6,"COL":8,"VEN":12,"PAN":10,"MEX":12,"CUB":12,"DOM":12,"HTI":15,"JAM":10,
 "AUS":8,"TWN":14,"USA":4,
}

# Fraction of population living in hotter-than-national-average lowlands
# (calibrated to Lenton et al. 2023 / Xu et al. 2020 unprecedented-heat exposure)
HOTSHARE = {
 "IND":0.35,"NGA":0.50,"PAK":0.35,"BGD":0.40,"IDN":0.35,"PHL":0.40,"VNM":0.30,
 "THA":0.40,"MMR":0.35,"KHM":0.35,"MYS":0.30,"LKA":0.30,"BRA":0.15,"MEX":0.15,
 "COL":0.30,"VEN":0.35,"PER":0.20,"ECU":0.30,"EGY":0.25,"SDN":0.30,"SSD":0.30,
 "SOM":0.30,"TCD":0.20,"MLI":0.20,"NER":0.20,"BFA":0.25,"SEN":0.25,"GHA":0.30,
 "CIV":0.30,"BEN":0.30,"TGO":0.30,"CMR":0.25,"ETH":0.10,"KEN":0.20,"TZA":0.15,
 "UGA":0.10,"COD":0.30,"AGO":0.20,"MOZ":0.20,"MDG":0.15,"ZAF":0.15,"SAU":0.40,
 "YEM":0.40,"OMN":0.50,"ARE":0.50,"QAT":0.50,"KWT":0.50,"IRQ":0.35,"IRN":0.20,
 "AUS":0.15,"USA":0.10,
}

# GDP per capita growth assumptions 2025-2100 (annual %) by convergence group
# (calibrated so Asia's share of world output rises ~44% -> ~50%, Africa rises fast)
GROWTH = {
 "low":    3.6,   # poorest, catch-up + demography
 "lmid":   3.0,
 "umid":   2.1,
 "high":   1.2,
 "frontier":1.1,  # US
 "east_asia_ageing":0.9,  # Japan, Korea, Taiwan (later China)
}
# country growth overrides (annual % 2025-2100)
GROWTH_OVR = {
 "CHN":2.2,"IND":3.4,"IDN":3.2,"VNM":3.4,"BGD":3.8,"PAK":3.2,"PHL":3.2,
 "NGA":3.8,"ETH":4.2,"COD":4.4,"TZA":4.2,"UGA":4.2,"KEN":3.8,"GHA":3.6,"CIV":3.8,
 "EGY":2.8,"TUR":2.4,"MEX":1.8,"BRA":1.7,"ARG":1.6,"COL":2.0,"PER":2.2,
 "USA":1.2,"CAN":1.1,"AUS":1.2,"GBR":1.0,"DEU":0.8,"FRA":0.9,"ITA":0.7,
 "ESP":0.9,"NLD":0.9,"SWE":0.9,"POL":1.4,"ROU":1.6,"RUS":0.7,"UKR":1.5,
 "JPN":0.7,"KOR":0.8,"TWN":1.0,"SAU":1.6,"ARE":1.8,"QAT":1.5,"IRN":1.2,
 "ZAF":1.4,"THA":1.6,"MYS":1.8,"KAZ":1.6,"UZB":3.0,"VNM":3.4,
}

# Western decline / blending anchors (foreign-born share %, mixed-ancestry share %)
WEST = {
 "USA":{"fb":14.3,"fb2100":21.0,"mx":12.0,"mx2100":34.0},
 "CAN":{"fb":23.0,"fb2100":30.0,"mx":8.0,"mx2100":30.0},
 "GBR":{"fb":14.5,"fb2100":22.0,"mx":7.0,"mx2100":26.0},
 "FRA":{"fb":13.0,"fb2100":20.0,"mx":9.0,"mx2100":26.0},
 "DEU":{"fb":18.5,"fb2100":26.0,"mx":6.0,"mx2100":24.0},
 "ESP":{"fb":16.5,"fb2100":24.0,"mx":6.0,"mx2100":22.0},
 "ITA":{"fb":10.5,"fb2100":18.0,"mx":5.0,"mx2100":20.0},
 "NLD":{"fb":14.0,"fb2100":22.0,"mx":6.0,"mx2100":23.0},
 "SWE":{"fb":20.0,"fb2100":27.0,"mx":5.0,"mx2100":20.0},
 "BEL":{"fb":13.5,"fb2100":21.0,"mx":6.0,"mx2100":22.0},
 "AUT":{"fb":17.0,"fb2100":24.0,"mx":5.0,"mx2100":20.0},
 "CHE":{"fb":30.0,"fb2100":35.0,"mx":5.0,"mx2100":20.0},
 "PRT":{"fb":9.5,"fb2100":16.0,"mx":5.0,"mx2100":18.0},
 "GRC":{"fb":12.0,"fb2100":18.0,"mx":3.0,"mx2100":14.0},
 "IRL":{"fb":18.0,"fb2100":25.0,"mx":4.0,"mx2100":16.0},
 "DNK":{"fb":13.0,"fb2100":19.0,"mx":4.0,"mx2100":15.0},
 "NOR":{"fb":16.0,"fb2100":22.0,"mx":4.0,"mx2100":16.0},
 "FIN":{"fb":8.5,"fb2100":14.0,"mx":3.0,"mx2100":12.0},
 "AUS":{"fb":30.0,"fb2100":36.0,"mx":10.0,"mx2100":32.0},
 "NZL":{"fb":28.0,"fb2100":34.0,"mx":8.0,"mx2100":28.0},
}

# Clean transition anchors (renewable share of electricity %, 2025 -> 2100 SSP2)
CLEAN = {
 "CHN":{"r2025":31,"r2100":78},"USA":{"r2025":23,"r2100":72},
 "IND":{"r2025":24,"r2100":80},"BRA":{"r2025":89,"r2100":95},
 "DEU":{"r2025":56,"r2100":92},"GBR":{"r2025":48,"r2100":90},
 "FRA":{"r2025":27,"r2100":88},"ESP":{"r2025":55,"r2100":93},
 "SWE":{"r2025":69,"r2100":96},"NOR":{"r2025":99,"r2100":99},
 "DNK":{"r2025":88,"r2100":97},"CAN":{"r2025":68,"r2100":92},
 "AUS":{"r2025":35,"r2100":85},"JPN":{"r2025":25,"r2100":80},
 "KOR":{"r2025":9,"r2100":70},"ZAF":{"r2025":9,"r2100":65},
 "NGA":{"r2025":18,"r2100":75},"KEN":{"r2025":92,"r2100":97},
 "ETH":{"r2025":99,"r2100":99},"VNM":{"r2025":42,"r2100":82},
 "IDN":{"r2025":18,"r2100":70},"TUR":{"r2025":42,"r2100":78},
 "SAU":{"r2025":1,"r2100":55},"ARE":{"r2025":5,"r2100":60},
 "MEX":{"r2025":20,"r2100":70},"CHL":{"r2025":55,"r2100":88},
}
CLEAN_REGION = {"SSA":58,"SAS":35,"EAP":30,"ECA":30,"MENA":12,"LAC":55,"NAM":25}  # r2025 default
CLEAN_REGION2100 = {"SSA":78,"SAS":82,"EAP":78,"ECA":88,"MENA":60,"LAC":88,"NAM":80}  # r2100 SSP2 default

# AI/technology diffusion index 2025 (US=100) and 2100 SSP2 default by region
AI = {
 "USA":100,"CHN":82,"GBR":72,"DEU":68,"FRA":64,"JPN":66,"KOR":70,"CAN":74,
 "IND":52,"ISR":66,"SGP":70,"BRA":44,"MEX":42,"IDN":38,"VNM":36,"NGA":22,
 "KEN":26,"ETH":16,"ZAF":30,"EGY":30,"TUR":40,"SAU":45,"ARE":50,"RUS":35,
 "AUS":70,"NZL":64,"SWE":70,"FIN":68,"NLD":68,"CHE":70,"ITA":55,"ESP":58,
}
AI_REGION = {"SSA":16,"SAS":30,"EAP":40,"ECA":45,"MENA":32,"LAC":35,"NAM":95}
AI_REGION2100 = {"SSA":72,"SAS":86,"EAP":88,"ECA":90,"MENA":78,"LAC":84,"NAM":98}

# ----------------------------------------------------------------------------
# 3. Load sources
# ----------------------------------------------------------------------------
def load_un():
    out = {}
    for r in csv.DictReader(open(f"{DATA}/unpop.csv")):
        iso = r["code"]
        if not iso: continue
        y = int(r["year"])
        est = r["population__sex_all__age_all__variant_estimates"]
        med = r["population__sex_all__age_all__variant_medium__projected"]
        if y == 2025 and med:
            out.setdefault(iso, {})["p2025"] = float(med)
        elif y == 2050 and med:
            out.setdefault(iso, {})["p2050"] = float(med)
        elif y == 2100 and med:
            out.setdefault(iso, {})["p2100"] = float(med)
    return out

def load_pm25():
    out = {}
    for r in csv.DictReader(open(f"{DATA}/pm25.csv")):
        iso = r["code"]
        if not iso: continue
        y = int(r["year"])
        v = float(r["population_weighted_pm25"])
        cur = out.get(iso)
        if cur is None or y > cur[0]:
            out[iso] = (y, v)
    return {k: v[1] for k, v in out.items()}

def load_gdppc():
    out = {}
    for r in csv.DictReader(open(f"{DATA}/gdppc.csv")):
        iso = r["code"]
        if not iso: continue
        y = int(r["year"])
        v = r["ny_gdp_pcap_pp_kd"]
        if not v: continue
        v = float(v)
        cur = out.get(iso)
        if cur is None or y > cur[0]:
            out[iso] = (y, v)
    return {k: v[1] for k, v in out.items()}

unpop, pm25, gdppc = load_un(), load_pm25(), load_gdppc()

# ----------------------------------------------------------------------------
# 4. GeoJSON
# ----------------------------------------------------------------------------
gj = json.load(open(f"{DATA}/world.geojson"))

def centroid(geom):
    if geom["type"] == "Polygon":
        rings = geom["coordinates"]
    else:
        rings = [p[0] for p in geom["coordinates"]]
    best, besta = None, -1
    for ring in rings:
        # shoelace area + centroid (abs)
        a, cx, cy = 0.0, 0.0, 0.0
        n = len(ring)
        for i in range(n - 1):
            x1, y1 = ring[i]; x2, y2 = ring[i + 1]
            f = x1 * y2 - x2 * y1
            a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f
        if abs(a) > besta:
            besta = abs(a)
            best = (cx / (3 * a) if a else ring[0][0], cy / (3 * a) if a else ring[0][1])
    if best is None:
        best = (rings[0][0][0], rings[0][0][1])
    return best

def lat_factor(lat):
    a = abs(lat)
    if a <= 30: return 1.62
    if a <= 45: return 1.30
    if a <= 55: return 1.50
    return 1.90

# ----------------------------------------------------------------------------
# 5. Assemble countries
# ----------------------------------------------------------------------------
world = []
for f in gj["features"]:
    iso = f.get("id")
    name = f["properties"]["name"]
    if not iso: continue
    region = REGION.get(iso, "ECA")
    c = centroid(f["geometry"])
    lat, lng = round(c[1], 3), round(c[0], 3)
    p = unpop.get(iso, {})
    p2025 = p.get("p2025")
    p2050 = p.get("p2050")
    p2100 = p.get("p2100")
    # default for tiny territories: keep constant small pop
    if p2025 is None:
        p2025 = p2050 = p2100 = 300000
    if p2050 is None: p2050 = p2025
    if p2100 is None: p2100 = p2050
    # temperature
    if iso in TMEAN:
        t = TMEAN[iso]
    else:
        t = 27.2 - 0.52 * abs(lat)
        if abs(lat) > 35: t = 27.2 - 0.52 * 35 - 0.38 * (abs(lat) - 35)
        if region == "ECA" and abs(lat) > 50: t -= 4
        if region == "NAM" and abs(lat) > 40: t -= 5
        if iso in ("ATA","GRL"): t = -25
        t = max(-25, min(30.5, t))
    t = round(t, 2)
    hd = HEATDAYS.get(iso, 0)
    if not hd and t > 26.5 and region in ("SSA","SAS","MENA","LAC"):
        hd = int((t - 26.5) * 18)
    pm = pm25.get(iso)
    if pm is None:
        pm = {"SSA":38,"SAS":52,"EAP":28,"ECA":15,"MENA":40,"LAC":14,"NAM":8}.get(region, 20)
    g = gdppc.get(iso)
    if g is None:
        g = {"TWN": 77000}.get(iso, {"SSA":3200,"SAS":4500,"EAP":14000,"ECA":22000,"MENA":14000,"LAC":13000,"NAM":45000}.get(region, 15000))
    if iso in GROWTH_OVR:
        gr = GROWTH_OVR[iso]
    else:
        gr = GROWTH["low"] if g < 4000 else GROWTH["lmid"] if g < 9000 else GROWTH["umid"] if g < 25000 else GROWTH["high"]
        if iso in ("JPN","KOR","TWN"): gr = GROWTH["east_asia_ageing"]
        if iso == "USA": gr = GROWTH["frontier"]
    west = WEST.get(iso)
    cl = CLEAN.get(iso, {"r2025": CLEAN_REGION.get(region, 30), "r2100": CLEAN_REGION2100.get(region, 80)})
    ai = AI.get(iso, AI_REGION.get(region, 30))
    ai2100 = AI_REGION2100.get(region, 85)
    world.append({
        "i": iso, "n": name, "r": region, "la": lat, "ln": lng,
        "p": [int(p2025), int(p2050), int(p2100)],
        "t": t, "hd": hd, "pm": round(pm, 1), "hs": HOTSHARE.get(iso, 0.0),
        "g": int(g), "gr": gr, "lf": lat_factor(lat),
        "w": west, "c": [cl["r2025"], cl["r2100"]], "a": [ai, ai2100],
    })

# calibration: population-weighted median temperature ~21.9
def wmedian(items):
    tot = sum(x["p"][0] for x in items)
    s = sorted(items, key=lambda x: x["t"])
    acc = 0
    for x in s:
        acc += x["p"][0]
        if acc >= tot / 2:
            return x["t"]
    return s[-1]["t"]

med = wmedian(world)
print(f"pre-calibration population-weighted median MAT: {med:.2f}°C (target 21.9)")
shift = 21.9 - med
if abs(shift) > 0.05:
    for w in world:
        w["t"] = round(max(-25, min(30.5, w["t"] + shift)), 2)
print(f"post-calibration median: {wmedian(world):.2f}°C")

# totals check
tot2025 = sum(w["p"][0] for w in world)
tot2100 = sum(w["p"][2] for w in world)
ssa_sas_2025 = sum(w["p"][0] for w in world if w["r"] in ("SSA","SAS"))
ssa_sas_2100 = sum(w["p"][2] for w in world if w["r"] in ("SSA","SAS"))
afr_2025 = sum(w["p"][0] for w in world if w["r"]=="SSA")
afr_2100 = sum(w["p"][2] for w in world if w["r"]=="SSA")
print(f"world pop: {tot2025/1e9:.2f}B (2025) -> {tot2100/1e9:.2f}B (2100)")
print(f"SSA+SAS share: {ssa_sas_2025/tot2025*100:.1f}% -> {ssa_sas_2100/tot2100*100:.1f}%")
print(f"SSA pop: {afr_2025/1e9:.2f}B -> {afr_2100/1e9:.2f}B")

# ----------------------------------------------------------------------------
# 6. Scenario / region tables
# ----------------------------------------------------------------------------
SCENARIOS = {
 "SSP1_26": {"name":"Net Zero Fast","short":"SSP1-2.6","warming":1.8,
   "pop":{"SSA":0.80,"SAS":0.88,"EAP":0.90,"ECA":0.92,"MENA":0.95,"LAC":0.94,"NAM":0.97},
   "clean":1.25,"ai":1.10,"color":"#4dd0a4"},
 "SSP2_45": {"name":"Middle Road","short":"SSP2-4.5","warming":2.7,
   "pop":{"SSA":1.00,"SAS":1.00,"EAP":1.00,"ECA":1.00,"MENA":1.00,"LAC":1.00,"NAM":1.00},
   "clean":1.00,"ai":1.00,"color":"#e8c15a"},
 "SSP3_70": {"name":"Fragmented World","short":"SSP3-7.0","warming":3.6,
   "pop":{"SSA":1.28,"SAS":1.16,"EAP":1.05,"ECA":1.02,"MENA":1.18,"LAC":1.08,"NAM":1.02},
   "clean":0.72,"ai":0.78,"color":"#e07a5f"},
 "SSP5_85": {"name":"Fossil Rush","short":"SSP5-8.5","warming":4.4,
   "pop":{"SSA":0.90,"SAS":0.92,"EAP":0.95,"ECA":0.98,"MENA":0.96,"LAC":0.96,"NAM":0.99},
   "clean":0.95,"ai":1.05,"color":"#f2cc8f"},
}

REGION_TABLE = {}
for r, nm in REGION_NAME.items():
    REGION_TABLE[r] = {"name": nm}

os.makedirs("js", exist_ok=True)
with open("js/data.js", "w") as fh:
    fh.write("// 21st Century Compass — simulation dataset\n")
    fh.write("// Sources: UN WPP 2024 (medium, via OWID), World Bank GDP/capita PPP,\n")
    fh.write("// Washington U. SatPM PM2.5 (via OWID), CCKP CMIP6 climatologies,\n")
    fh.write("// Lenton et al. 2023 / Xu et al. 2020 climate-niche thresholds,\n")
    fh.write("// H Heuristics reports HH-2026-25 & Digital Report 2026-69.\n")
    fh.write("// Projection fields beyond sourced data are H Heuristics simulation judgments.\n")
    fh.write("window.CC_DATA = ")
    json.dump({
        "scenarios": SCENARIOS,
        "regions": REGION_TABLE,
        "regionOrder": ["SSA","SAS","EAP","ECA","MENA","LAC","NAM"],
        "countries": world,
    }, fh, separators=(",", ":"))
    fh.write(";\n")

# world geojson (rounded coords to shrink)
def round_geom(g):
    t = g["type"]
    if t == "Point":
        return {"type": t, "coordinates": [round(x, 2) for x in g["coordinates"]]}
    if t == "Polygon":
        return {"type": t, "coordinates": [[[round(x, 2) for x in pt] for pt in ring] for ring in g["coordinates"]]}
    if t == "MultiPolygon":
        return {"type": t, "coordinates": [[[[round(x, 2) for x in pt] for pt in ring] for ring in poly] for poly in g["coordinates"]]}
    return g

min_world = {"type": "FeatureCollection", "features": [
    {"type": "Feature", "id": f["id"], "properties": {"n": f["properties"]["name"]},
     "geometry": round_geom(f["geometry"])} for f in gj["features"] if f.get("id")
]}
with open("js/world.js", "w") as fh:
    fh.write("// Natural Earth 110m country boundaries (johan/world.geo.json)\nwindow.CC_WORLD = ")
    json.dump(min_world, fh, separators=(",", ":"))
    fh.write(";\n")

print("data.js bytes:", os.path.getsize("js/data.js"))
print("world.js bytes:", os.path.getsize("js/world.js"))
print("countries:", len(world))
