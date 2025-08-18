const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

let currentUser = localStorage.getItem("currentUser");
if (!currentUser) {
  window.location.href = "login.html";
}
let users = JSON.parse(localStorage.getItem("users") || "{}");
let userData = users[currentUser];

document.getElementById("userName").textContent = currentUser;
document.getElementById("userProvince").textContent = userData.province;

const monthInputsDiv = document.getElementById("monthInputs");
MONTHS.forEach((m,i)=>{
  const val = userData.emissions["2024"]?.[i] ?? "";
  monthInputsDiv.innerHTML += `<label>${m}<input type="number" id="m${i}" value="${val}" min="0"></label>`;
});

let ctx = document.getElementById("yearChart").getContext("2d");
let chart = new Chart(ctx,{
  type:"line",
  data:{
    labels: MONTHS,
    datasets:[{ label:"kg CO₂e", data: userData.emissions["2024"] || new Array(12).fill(null), tension:0.25 }]
  },
  options:{ plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
});

function saveEmissions(){
  let arr = [];
  for(let i=0;i<12;i++){
    arr.push(Number(document.getElementById("m"+i).value) || 0);
  }
  userData.emissions["2024"] = arr;
  users[currentUser] = userData;
  localStorage.setItem("users", JSON.stringify(users));

  chart.data.datasets[0].data = arr;
  chart.update();

  alert("Emissions updated!");
}
