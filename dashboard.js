const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEARS = [2022, 2023, 2024];
let currentYear = 2024;

let currentUser = localStorage.getItem("currentUser");
if (!currentUser) {
  window.location.href = "login.html";
}

let users = JSON.parse(localStorage.getItem("users") || "{}");
let userData = users[currentUser];

document.getElementById("userName").textContent = currentUser;
document.getElementById("userProvince").textContent = userData.province;

// ====== Initialize Year Selector ======
function initYearSelector() {
  const yearSelect = document.getElementById('yearSelect');
  YEARS.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === currentYear) opt.selected = true;
    yearSelect.appendChild(opt);
  });

  yearSelect.addEventListener('change', e => {
    currentYear = Number(e.target.value);
    populateMonthInputs();
    updateChart();
  });
}

// ====== Populate Monthly Inputs ======
function populateMonthInputs() {
  const monthInputsDiv = document.getElementById("monthInputs");
  monthInputsDiv.innerHTML = ""; // clear previous inputs
  const arr = userData.emissions[currentYear] || new Array(12).fill(0);
  MONTHS.forEach((m, i) => {
    monthInputsDiv.innerHTML += `
      <label>${m}<input type="number" id="m${i}" value="${arr[i]}" min="0"></label>
    `;
  });
}

// ====== Chart Setup ======
let ctx = document.getElementById("yearChart").getContext("2d");
let chart = new Chart(ctx, {
  type: "line",
  data: {
    labels: MONTHS,
    datasets: [{
      label: "kg CO₂e",
      data: userData.emissions[currentYear] || new Array(12).fill(0),
      tension: 0.25
    }]
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } }
  }
});

// ====== Update Chart ======
function updateChart() {
  const arr = userData.emissions[currentYear] || new Array(12).fill(0);
  chart.data.datasets[0].data = arr;
  chart.update();
}

// ====== Save Emissions ======
function saveEmissions() {
  let arr = [];
  for (let i = 0; i < 12; i++) {
    arr.push(Number(document.getElementById("m" + i).value) || 0);
  }
  if (!userData.emissions) userData.emissions = {};
  userData.emissions[currentYear] = arr;

  users[currentUser] = userData;
  localStorage.setItem("users", JSON.stringify(users));

  updateChart();
  alert(`Emissions for ${currentYear} updated!`);
}

// ====== Boot ======
(function boot() {
  initYearSelector();
  populateMonthInputs();
})();
