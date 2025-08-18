// ====== CONFIG ======
const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"
];
const YEARS = [2022, 2023, 2024]; // supported years (2024 default)

// ====== STATE ======
let map, baseLayers, choroplethLayer, heatLayer, activeFeature = null;
let currentMonthIdx = new Date().getMonth();
let currentYear = 2024;
let chart;
let GEOJSON_DATA = null;

// ====== HELPERS ======
function colorForValue(v, min, max) {
  if (v == null || isNaN(v)) return '#888888';
  const t = Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
  const toRGB = (r,g,b)=>`rgb(${r|0},${g|0},${b|0})`;
  let r,g,b;
  if (t < 0.5) {
    const u = t / 0.5;
    r = 46 + (241-46)*u;
    g = 204 + (196-204)*u;
    b = 113 + (15-113)*u;
  } else {
    const u = (t-0.5)/0.5;
    r = 241 + (231-241)*u;
    g = 196 + (76-196)*u;
    b = 15 + (60-15)*u;
  }
  return toRGB(r,g,b);
}

function computeMinMax(features, monthIdx, year){
  let min=Infinity, max=-Infinity;
  features.forEach(f=>{
    const arr = getEmissionsForYear(f, year) || [];
    const v = arr[monthIdx];
    if (typeof v === 'number') {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  });
  if (!isFinite(min)) min = 0;
  if (!isFinite(max)) max = 100;
  if (min === max) max = min + 1;
  return {min,max};
}

function formatNumber(n){
  return (n==null || isNaN(n)) ? '—' : n.toLocaleString(undefined,{maximumFractionDigits:2});
}

// returns an emissions array of length 12 for that feature+year, or null
function getEmissionsForYear(feature, year){
  if (!feature || !feature.properties) return null;
  const e = feature.properties.emissions;
  if (!e) return null;
  return e[String(year)] || null;
}

// create/ensure emissions data structure on each feature
function ensureEmissionsOnFeatures(features){
  features.forEach(f=>{
    if (!f.properties) f.properties = {};
    // If existing legacy emissionHistory present and it's length 12, treat as 2024 if 2024 missing
    if (!f.properties.emissions) f.properties.emissions = {};
    if (!f.properties.emissions['2024'] && Array.isArray(f.properties.emissionHistory) && f.properties.emissionHistory.length === 12) {
      f.properties.emissions['2024'] = f.properties.emissionHistory.slice();
    }
    // Ensure every year in YEARS has an array; if missing create random placeholders
    YEARS.forEach(y=>{
      if (!f.properties.emissions[String(y)] || !Array.isArray(f.properties.emissions[String(y)])) {
        // generate random, but try to be aged: older years slightly lower/higher? keep simple
        f.properties.emissions[String(y)] = generateRandomSeriesForFeature(f, y);
      } else {
        // normalize if length != 12
        if (f.properties.emissions[String(y)].length !== 12) {
          const arr = new Array(12).fill(null).map((_,i)=> Number(f.properties.emissions[String(y)][i]) || null);
          f.properties.emissions[String(y)] = arr;
        }
      }
    });
  });
}

// Simple random series generator (deterministic-ish not required)
function generateRandomSeriesForFeature(feature, year){
  // Make random values in a reasonable range. Use a hash from coordinates to add some variance per feature.
  let seed = 1;
  try {
    const coords = JSON.stringify(feature.geometry?.coordinates?.slice(0,3) || '');
    for(let i=0;i<coords.length;i++){ seed = (seed * 31 + coords.charCodeAt(i)) % 9973; }
    seed = (seed + year) % 9973;
  } catch(e){}
  const rnd = ()=> {
    // simple LCG
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return (seed % 1000) / 1000;
  };
  // base amplitude vary per feature
  const base = 20 + Math.floor(rnd() * 200); // between ~20 and 220
  const seasonal = Array.from({length:12}, (_,i)=> {
    const seasonalFactor = 0.6 + 0.8 * Math.abs(Math.sin((i / 12) * Math.PI * 2)); // some seasonality
    const noise = rnd() * 0.5 + 0.75;
    return Math.round((base * seasonalFactor * noise) * 100) / 100;
  });
  return seasonal;
}

// ====== INIT UI ======
function initSelectors(){
  // Year select
  const yearSelect = document.getElementById('yearSelect');
  YEARS.forEach(y=>{
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    if (y === currentYear) opt.selected = true;
    yearSelect.appendChild(opt);
  });
  yearSelect.addEventListener('change', e=>{
    currentYear = Number(e.target.value);
    document.getElementById('yearInfo').textContent = currentYear;
    updateVisualization();
  });
  document.getElementById('yearInfo').textContent = currentYear;

  // Month select
  const monthSelect = document.getElementById('monthSelect');
  MONTHS.forEach((m,i)=>{
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = m;
    if (i === currentMonthIdx) opt.selected = true;
    monthSelect.appendChild(opt);
  });
  monthSelect.addEventListener('change', e=>{
    currentMonthIdx = Number(e.target.value);
    updateVisualization();
  });

  document.getElementById('basemapSelect').addEventListener('change', e=>{
    setBasemap(e.target.value);
  });

  document.getElementById('overlayMode').addEventListener('change', e=>{
    setOverlay(e.target.value);
  });

  document.getElementById('infoMonth').textContent = MONTHS[currentMonthIdx];
}

// ====== MAP ======
function initMap(){
  map = L.map('map', {
    center: [0, 20],
    zoom: 2,
    worldCopyJump: true,
  });

  baseLayers = {
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© OpenStreetMap'
    }),
    esri: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
      attribution:'Tiles © Esri'
    }),
    toner: L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',{
      attribution:'Map tiles by Stamen'
    })
  };
  baseLayers.osm.addTo(map);
}

function setBasemap(key){
  Object.values(baseLayers).forEach(l=>map.removeLayer(l));
  (baseLayers[key] || baseLayers.osm).addTo(map);
}

// ====== DATA + LAYERS ======
function styleFeatureFactory(min, max){
  return function style(feature){
    const arr = getEmissionsForYear(feature, currentYear) || [];
    const v = arr[currentMonthIdx];
    return {
      fillColor: colorForValue(v, min, max),
      color: '#222',
      weight: 1,
      fillOpacity: 0.65
    };
  };
}

function onEachFeature(feature, layer){
  layer.on('click', ()=> {
    activeFeature = feature;
    const name = feature.properties.name || feature.properties.NAME || 'Region';
    const arr = getEmissionsForYear(feature, currentYear) || [];
    const v = arr[currentMonthIdx];
    document.getElementById('regionTitle').textContent = name;
    document.getElementById('infoMonth').textContent = MONTHS[currentMonthIdx];
    document.getElementById('infoEmission').textContent = formatNumber(v);
    updateChart(arr);
  });
  layer.on('mouseover', (e)=> {
    e.target.setStyle({weight:2});
  });
  layer.on('mouseout', (e)=> {
    e.target.setStyle({weight:1});
  });
}

function buildChoropleth(){
  if (choroplethLayer) {
    map.removeLayer(choroplethLayer);
    choroplethLayer = null;
  }
  const {min,max} = computeMinMax(GEOJSON_DATA.features, currentMonthIdx, currentYear);
  choroplethLayer = L.geoJSON(GEOJSON_DATA, {
    style: styleFeatureFactory(min,max),
    onEachFeature
  }).addTo(map);
  updateLegend(min,max);
  if (!map._fitOnce) {
    try {
      map.fitBounds(choroplethLayer.getBounds(), {padding:[20,20]});
      map._fitOnce = true;
    } catch(e){}
  }
}

function buildHeat(){
  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
  const pts = GEOJSON_DATA.features.map(f=>{
    const arr = getEmissionsForYear(f, currentYear) || [];
    const v = arr[currentMonthIdx] ?? 0;
    const [lng, lat] = centroid(f.geometry);
    return [lat, lng, v];
  });

  const {min,max} = computeMinMax(GEOJSON_DATA.features, currentMonthIdx, currentYear);
  const norm = (v)=> (v - min) / (max - min || 1);
  const normalized = pts.map(([lat,lng,v])=>[lat,lng, Math.max(0,Math.min(1,norm(v))) || 0.01]);

  heatLayer = L.heatLayer(normalized, {
    radius: 28,
    blur: 20,
    maxZoom: 10
  }).addTo(map);

  updateLegend(min,max);
}

function setOverlay(mode){
  if (mode === 'heat'){
    if (choroplethLayer) map.removeLayer(choroplethLayer);
    buildHeat();
  } else {
    if (heatLayer) map.removeLayer(heatLayer);
    buildChoropleth();
  }
}

function updateVisualization(){
  document.getElementById('infoMonth').textContent = MONTHS[currentMonthIdx];
  document.getElementById('yearInfo').textContent = currentYear;

  const mode = document.getElementById('overlayMode').value;
  setOverlay(mode);

  if (activeFeature){
    const arr = getEmissionsForYear(activeFeature, currentYear) || [];
    const v = arr[currentMonthIdx];
    document.getElementById('infoEmission').textContent = formatNumber(v);
    updateChart(arr);
  } else {
    // no feature active => chart shows aggregated/selected-year placeholder
    updateChart(null);
    document.getElementById('infoEmission').textContent = '—';
  }
}

function updateLegend(min, max){
  const legend = document.getElementById('legend');
  legend.innerHTML = `
    <div class="row">
      <div>Emissions (kg CO₂e)</div>
      <div class="scale"></div>
      <div class="ticks"><span>${formatNumber(min)}</span><span>${formatNumber((min+max)/2)}</span><span>${formatNumber(max)}</span></div>
    </div>
  `;
}

// centroid, polygonCentroidCoords helpers (kept same behavior as original)
function centroid(geom){
  if (!geom) return [0,0];
  if (geom.type === 'Point') {
    const [lng = 0, lat = 0] = geom.coordinates || [];
    return [lng, lat];
  }
  if (geom.type === 'MultiPolygon') {
    const polys = geom.coordinates || [];
    let totalArea = 0;
    let weightedX = 0;
    let weightedY = 0;
    for (let p = 0; p < polys.length; p++) {
      const poly = polys[p];
      if (!poly || !poly[0] || poly[0].length === 0) continue;
      const outer = poly[0];
      let area2 = 0;
      for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
        const [x0 = 0, y0 = 0] = outer[j];
        const [x1 = 0, y1 = 0] = outer[i];
        area2 += x0 * y1 - x1 * y0;
      }
      const area = Math.abs(area2) * 0.5;
      if (area === 0) continue;
      const [cx, cy] = polygonCentroidCoords(outer);
      totalArea += area;
      weightedX += cx * area;
      weightedY += cy * area;
    }
    if (totalArea === 0) return [0, 0];
    return [weightedX / totalArea, weightedY / totalArea];
  }
  if (geom.type === 'Polygon') {
    const ring = geom.coordinates && geom.coordinates[0] || [];
    if (ring.length === 0) return [0,0];
    let area = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x0 = 0, y0 = 0] = ring[j];
      const [x1 = 0, y1 = 0] = ring[i];
      const f = x0 * y1 - x1 * y0;
      area += f;
      cx += (x0 + x1) * f;
      cy += (y0 + y1) * f;
    }
    if (area === 0) {
      return [ring[0]?.[0] || 0, ring[0]?.[1] || 0];
    }
    area *= 0.5;
    return [cx / (6 * area), cy / (6 * area)];
  }
  return [0,0];
}

function polygonCentroidCoords(coords){
  // coords: array of [lng,lat] for the ring
  let area = 0, cx = 0, cy = 0;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [x0 = 0, y0 = 0] = coords[j];
    const [x1 = 0, y1 = 0] = coords[i];
    const f = x0 * y1 - x1 * y0;
    area += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (area === 0) return [coords[0]?.[0] || 0, coords[0]?.[1] || 0];
  area *= 0.5;
  return [cx / (6 * area), cy / (6 * area)];
}

// ====== CHART ======
function initChart(){
  const ctx = document.getElementById('emissionChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: MONTHS,
      datasets: [{
        label: 'kg CO₂e',
        data: new Array(12).fill(null),
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });
}

function updateChart(arr){
  if (!chart) return;
  chart.data.datasets[0].data = (arr && arr.length===12) ? arr : new Array(12).fill(null);
  chart.update();
}

// ====== LOAD DATA & BOOT ======
async function loadGeoJSON(){
  const res = await fetch('zm.json');
  return res.json();
}

(async function boot(){
  initMap();
  initSelectors();
  initChart();

  GEOJSON_DATA = await loadGeoJSON();

// Merge user data if available
const users = JSON.parse(localStorage.getItem("users") || "{}");
for (const [username, data] of Object.entries(users)) {
  if (data.province && data.emissions["2024"]) {
    let feature = GEOJSON_DATA.features.find(f => f.properties.name === data.province);
    if (feature) {
      feature.properties.emissions["2024"] = data.emissions["2024"];
    }
  }
}


  // ensure emissions properties exist & populate random placeholders if missing
  ensureEmissionsOnFeatures(GEOJSON_DATA.features);

  // build initial overlay (2024 default)
  buildChoropleth();
})();
