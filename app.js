// ====== CONFIG ======
const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"
];

// ====== STATE ======
let map, baseLayers, choroplethLayer, heatLayer, activeFeature = null;
let currentMonthIdx = new Date().getMonth();
let chart;

// ====== HELPERS ======
function colorForValue(v, min, max) {
  if (v == null || isNaN(v)) return '#888888';
  const t = Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
  // interpolate green (0) -> yellow (0.5) -> red (1)
  const toRGB = (r,g,b)=>`rgb(${r|0},${g|0},${b|0})`;
  let r,g,b;
  if (t < 0.5) {
    // green (46,204,113) to yellow (241,196,15)
    const u = t / 0.5;
    r = 46 + (241-46)*u;
    g = 204 + (196-204)*u;
    b = 113 + (15-113)*u;
  } else {
    // yellow (241,196,15) to red (231,76,60)
    const u = (t-0.5)/0.5;
    r = 241 + (231-241)*u;
    g = 196 + (76-196)*u;
    b = 15 + (60-15)*u;
  }
  return toRGB(r,g,b);
}

function computeMinMax(features, monthIdx){
  let min=Infinity, max=-Infinity;
  features.forEach(f=>{
    const arr = f.properties.emissionHistory || [];
    const v = arr[monthIdx];
    if (typeof v === 'number') {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  });
  if (!isFinite(min)) min = 0;
  if (!isFinite(max)) max = 100;
  if (min === max) max = min + 1; // avoid divide-by-zero
  return {min,max};
}

function formatNumber(n){
  return (n==null || isNaN(n)) ? '—' : n.toLocaleString(undefined,{maximumFractionDigits:2});
}

// ====== INIT UI ======
function initSelectors(){
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
    worldCopyJump: true, // allows panning infinitely horizontally
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
let GEOJSON_DATA = null;

function styleFeatureFactory(min, max){
  return function style(feature){
    const v = feature.properties.emissionHistory?.[currentMonthIdx];
    return {
      fillColor: colorForValue(v, min, max),
      color: '#222',
      weight: 1,
      fillOpacity: 0.65
    };
  };
}

function onEachFeature(feature, layer){
  layer.on('click', ()=>{
    activeFeature = feature;
    const name = feature.properties.name || 'Region';
    const v = feature.properties.emissionHistory?.[currentMonthIdx];
    document.getElementById('regionTitle').textContent = name;
    document.getElementById('infoMonth').textContent = MONTHS[currentMonthIdx];
    document.getElementById('infoEmission').textContent = formatNumber(v);
    updateChart(feature.properties.emissionHistory);
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
  const {min,max} = computeMinMax(GEOJSON_DATA.features, currentMonthIdx);
  choroplethLayer = L.geoJSON(GEOJSON_DATA, {
    style: styleFeatureFactory(min,max),
    onEachFeature
  }).addTo(map);
  updateLegend(min,max);
  // fit bounds on first load
  if (!map._fitOnce) {
    map.fitBounds(choroplethLayer.getBounds(), {padding:[20,20]});
    map._fitOnce = true;
  }
}

function buildHeat(){
  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
  // Convert polygon centroids to points with intensity
  const pts = GEOJSON_DATA.features.map(f=>{
    const v = f.properties.emissionHistory?.[currentMonthIdx] ?? 0;
    const [lng, lat] = centroid(f.geometry);
    // leaflet-heat expects: [lat, lng, intensity]
    // Normalize intensity 0..1 across dataset
    return [lat, lng, v];
  });

  const {min,max} = computeMinMax(GEOJSON_DATA.features, currentMonthIdx);
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
  // refresh info label
  document.getElementById('infoMonth').textContent = MONTHS[currentMonthIdx];
  // rebuild whichever overlay is selected
  const mode = document.getElementById('overlayMode').value;
  setOverlay(mode);

  // refresh sidebar number if a region is active
  if (activeFeature){
    const v = activeFeature.properties.emissionHistory?.[currentMonthIdx];
    document.getElementById('infoEmission').textContent = formatNumber(v);
    updateChart(activeFeature.properties.emissionHistory);
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

// centroid: returns [lng, lat] for Point, Polygon, or MultiPolygon
function centroid(geom){
  if (!geom) return [0,0];

  // GeoJSON Point: coordinates are [lng, lat]
  if (geom.type === 'Point') {
    const [lng = 0, lat = 0] = geom.coordinates || [];
    return [lng, lat];
  }

  // MultiPolygon: use first polygon's outer ring
  if (geom.type === 'MultiPolygon') {
    // For each polygon take its outer ring centroid and area, then compute area-weighted mean
    const polys = geom.coordinates || [];
    let totalArea = 0;
    let weightedX = 0;
    let weightedY = 0;

    for (let p = 0; p < polys.length; p++) {
      const poly = polys[p];
      if (!poly || !poly[0] || poly[0].length === 0) continue;
      const outer = poly[0]; // outer ring
      // compute polygon area (signed area*0.5)
      let area2 = 0; // will be 2*area (signed)
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

  // Polygon: compute centroid of outer ring (returns [lng, lat])
  if (geom.type === 'Polygon') {
    const ring = geom.coordinates && geom.coordinates[0] || [];
    if (ring.length === 0) return [0,0];

    let area = 0, cx = 0, cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x0 = 0, y0 = 0] = ring[j]; // x = lng, y = lat
      const [x1 = 0, y1 = 0] = ring[i];
      const f = x0 * y1 - x1 * y0;
      area += f;
      cx += (x0 + x1) * f;
      cy += (y0 + y1) * f;
    }
    if (area === 0) {
      // fallback: return first coordinate
      return [ring[0]?.[0] || 0, ring[0]?.[1] || 0];
    }
    area *= 0.5;
    return [cx / (6 * area), cy / (6 * area)];
  }

  // fallback for unsupported geometry types
  return [0,0];
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

  // build initial overlay
  buildChoropleth();
})();



