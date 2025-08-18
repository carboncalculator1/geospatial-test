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

// ====== COLOR HELPERS ======

// simple wrapper to keep compatibility
function getColor(value) {
  // Default to range 0–100 for single value styling
  return colorForValue(value, 0, 100);
}

// factory for choropleth styles
function styleFeatureFactory(min, max) {
  return function (feature) {
    const arr = getEmissionsForYear(feature, currentYear);
    const v = arr[currentMonthIdx] || 0;
    return {
      fillColor: colorForValue(v, min, max),
      weight: 1,
      opacity: 1,
      color: "#333",
      fillOpacity: 0.7
    };
  };
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

// returns an emissions array of length 12 for that feature+year
function getEmissionsForYear(feature, year){
  if (!feature || !feature.properties) return new Array(12).fill(0);
  const e = feature.properties.emissions;
  if (!e) return new Array(12).fill(0);
  return e[String(year)] || new Array(12).fill(0);
}

// create emissions data structure on each feature (but default to zero arrays)
function ensureEmissionsOnFeatures(features){
  features.forEach(f=>{
    if (!f.properties) f.properties = {};
    if (!f.properties.emissions) f.properties.emissions = {};

    YEARS.forEach(y=>{
      if (!f.properties.emissions[String(y)] || !Array.isArray(f.properties.emissions[String(y)])) {
        f.properties.emissions[String(y)] = new Array(12).fill(0);
      } else if (f.properties.emissions[String(y)].length !== 12) {
        const arr = new Array(12).fill(0).map((_,i)=> Number(f.properties.emissions[String(y)][i]) || 0);
        f.properties.emissions[String(y)] = arr;
      }
    });
  });
}

// ====== INIT UI ======
function initSelectors(){
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

// ====== Load GeoJSON ======
fetch("zm.json")
  .then(res => res.json())
  .then(data => {
    geojsonLayer = L.geoJSON(data, {
      style: styleFeature,
      onEachFeature: onEachFeature
    }).addTo(map);
  });

// ====== DATA + LAYERS ======
function styleFeature(feature) {
  let emissions = 0;
  const arr = getEmissionsForYear(feature, currentYear);
  emissions = arr[currentMonthIdx] || 0;
  
  return {
    fillColor: getColor(emissions),
    weight: 1,
    opacity: 1,
    color: "#333",
    fillOpacity: 0.7
  };
}

function onEachFeature(feature, layer){
  layer.on('click', ()=> {
    activeFeature = feature;
    const name = feature.properties.name || feature.properties.NAME || 'Region';
    const arr = getEmissionsForYear(feature, currentYear);
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
    const arr = getEmissionsForYear(f, currentYear);
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
    const arr = getEmissionsForYear(activeFeature, currentYear);
    const v = arr[currentMonthIdx];
    document.getElementById('infoEmission').textContent = formatNumber(v);
    updateChart(arr);
  } else {
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

// ====== centroid + chart helpers stay unchanged ======

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
  chart.data.datasets[0].data = (arr && arr.length===12) ? arr : new Array(12).fill(0);
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
    if (data.province && data.emissions) {
      let feature = GEOJSON_DATA.features.find(f => f.properties.name === data.province);
      if (feature) {
        Object.keys(data.emissions).forEach(year=>{
          feature.properties.emissions[year] = data.emissions[year];
        });
      }
    }
  }

  // ensure emissions structure (default zeros if missing)
  ensureEmissionsOnFeatures(GEOJSON_DATA.features);

  buildChoropleth();
})();

