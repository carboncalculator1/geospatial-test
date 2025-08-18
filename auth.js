function togglePassword(id){
  const input = document.getElementById(id);
  input.type = input.type === "password" ? "text" : "password";
}

function signup(){
  const username = document.getElementById("signupUsername").value.trim();
  const province = document.getElementById("signupProvince").value;
  const password = document.getElementById("signupPassword").value;

  if (!username || !password) {
    alert("Please fill all fields");
    return;
  }

  let users = JSON.parse(localStorage.getItem("users") || "{}");
  if (users[username]) {
    alert("Username already exists!");
    return;
  }

  users[username] = { province, password, emissions: {} };
  localStorage.setItem("users", JSON.stringify(users));

  alert("Signup successful! Please login.");
  window.location.href = "login.html";
}

function login(){
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  let users = JSON.parse(localStorage.getItem("users") || "{}");
  if (!users[username] || users[username].password !== password) {
    alert("Invalid login credentials");
    return;
  }

  localStorage.setItem("currentUser", username);
  window.location.href = "dashboard.html";
}
