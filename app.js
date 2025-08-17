// approximate Zambia bounds (latLng order)
const ZAMBIA_BOUNDS = L.latLngBounds(
  L.latLng(-18.20, 21.85), // SW
  L.latLng(-8.05, 33.75)   // NE
);

// convert GeoJSON [lng,lat] arrays -> Leaflet [lat,lng]
function toLatLngArray(ring){
  return ring.map(([lng, lat]) => [lat, lng]);
}

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
    center: [-15.3875, 28.3228], // Lusaka
    zoom: 6,
    worldCopyJump: false
  });

  // strongly prevent panning out of Zambia
  map.setMaxBounds(ZAMBIA_BOUNDS);
  map.options.maxBoundsViscosity = 1.0;

  // base layers: add bounds to limit tile requests
  baseLayers = {
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© OpenStreetMap',
      bounds: ZAMBIA_BOUNDS
    }),
    esri: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
      attribution:'Tiles © Esri',
      bounds: ZAMBIA_BOUNDS
    }),
    toner: L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/toner/{z}/{x}/{y}.png',{
      attribution:'Map tiles by Stamen',
      bounds: ZAMBIA_BOUNDS
    })
  };

  // start with OSM
  baseLayers.osm.addTo(map);
}

// feature: a GeoJSON Feature for Zambia (Polygon or MultiPolygon)
function addCountryMask(feature){
  if (!feature || !feature.geometry) return;

  // get first polygon ring for the country (for MultiPolygon, take the first polygon)
  let polygonCoords;
  if (feature.geometry.type === 'MultiPolygon') {
    // MultiPolygon: coordinates[0] is the first polygon, [0] is its outer ring
    polygonCoords = feature.geometry.coordinates[0][0];
  } else if (feature.geometry.type === 'Polygon') {
    polygonCoords = feature.geometry.coordinates[0];
  } else {
    console.warn('Country geometry type not supported for mask:', feature.geometry.type);
    return;
  }

  const hole = toLatLngArray(polygonCoords);

  // outer ring covering the whole world (lat,lng)
  const outer = [
    [90, -180],
    [90,  180],
    [-90, 180],
    [-90, -180]
  ];

  // polygon with hole: outer first, then hole (Leaflet supports this array-of-rings format)
  const mask = L.polygon([outer, hole], {
    color: '#000',
    weight: 0,
    fillOpacity: 0.6,
    interactive: false // allow clicks through to underlying layers
  }).addTo(map);

  // zoom/focus to the country precisely
  try {
    const countryLayer = L.geoJSON(feature);
    map.fitBounds(countryLayer.getBounds().pad(0.10));
  } catch(e){ console.warn(e); }
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
    pointToLayer: function(feature, latlng){
      // use emission value to style the marker
      const v = feature.properties.emissionHistory?.[currentMonthIdx];
      const style = {
        radius: 10,
        fillColor: colorForValue(v, min, max),
        color: '#222',
        weight: 1,
        fillOpacity: 0.85
      };
      return L.circleMarker(latlng, style);
    },
    style: styleFeatureFactory(min,max), // in case you still have polygons
    onEachFeature
  }).addTo(map);

  updateLegend(min,max);

  // fit bounds the first time to the data (keeps you inside Zambia because data is Zambia-based)
  if (!map._fitOnce) {
    const b = choroplethLayer.getBounds();
    if (b.isValid && !b.isEmpty()) {
      map.fitBounds(b.pad(0.25));
    }
    map._fitOnce = true;
  }
}


function buildHeat(){
  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
  // Convert features to [lat, lng, intensity]
  const {min,max} = computeMinMax(GEOJSON_DATA.features, currentMonthIdx);
  const pts = GEOJSON_DATA.features.map(f=>{
    const v = f.properties.emissionHistory?.[currentMonthIdx] ?? 0;
    // handle Point or Polygon centroid
    let [lng, lat] = centroid(f.geometry);
    return [lat, lng, v];
  });

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


// centroid: returns [lng, lat] for Polygon or Point
function centroid(geom){
  if (!geom) return [0,0];

  if (geom.type === 'Point') {
    // GeoJSON Point coords are [lng, lat]
    const [lng, lat] = geom.coordinates;
    return [lng, lat];
  }

  if (geom.type === 'Polygon') {
    const ring = geom.coordinates[0] || [];
    if (ring.length === 0) return [0,0];
    let area = 0, x=0, y=0;
    for (let i=0,j=ring.length-1;i<ring.length;j=i++){
      const [x0,y0] = ring[j];
      const [x1,y1] = ring[i];
      const f = x0*y1 - x1*y0;
      area += f;
      x += (x0 + x1) * f;
      y += (y0 + y1) * f;
    }
    if (area === 0) return [ring[0][0] || 0, ring[0][1] || 0];
    area *= 0.5;
    return [x/(6*area), y/(6*area)];
  }

  // fallback for other geometry types
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
  const res = await fetch('regions.geojson');
  return res.json();
}

async function loadZambiaFeature(){
  const res = await fetch('zambia.geo'); // put the big file into /data/ in your project
  const data = await res.json();
  // try a few common property names for the ISO3 code or name
  const z = data.features.find(f =>
    (f.properties && (
      f.properties.ISO_A3 === 'ZMB' ||
      f.properties.ISO3166_1_Alpha_3 === 'ZMB' ||
      f.properties['ISO3166-1-Alpha-3'] === 'ZMB' ||
      /zambia/i.test(f.properties.ADMIN || f.properties.name || f.properties.admin || '')
    ))
  );
  if (!z) throw new Error('Zambia feature not found in countries.geojson');
  return z;
}


(async function boot(){
  initMap();
  initSelectors();
  initChart();

  // load your regions
  GEOJSON_DATA = await loadGeoJSON();

  // build initial overlay for your regions
  buildChoropleth();

  // --- load country polygon and add mask ---
  try {
    // Option A: load the full countries.geojson from your /data/ folder and extract Zambia
    const zFeature = await loadZambiaFeature(); // (function from D(1))
    addCountryMask(zFeature);
  } catch(err){
    console.warn('Could not add Zambia mask:', err);
    // Optionally fetch a single zambia.geo instead:
    // const z = await (await fetch('zambia.geo')).json();
    // addCountryMask(z.features ? z.features[0] : z);
  }
})();

