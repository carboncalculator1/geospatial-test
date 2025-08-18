// auth.js (updated)
// small utilities
function nowIso(){ return new Date().toISOString(); }

function togglePassword(id){
  const input = document.getElementById(id);
  input.type = input.type === "password" ? "text" : "password";
}

// Ensure users object + a default admin exists
function _getUsers(){
  return JSON.parse(localStorage.getItem("users") || "{}");
}
function _saveUsers(u){
  localStorage.setItem("users", JSON.stringify(u));
}

function ensureDefaultAdmin(){
  const users = _getUsers();
  if (!users['admin']) {
    users['admin'] = {
      province: 'admin',
      password: 'admin123', // change this quickly after first use
      emissions: {},
      history: [],
      createdAt: nowIso(),
      isAdmin: true,
      lastLogin: null,
      lastActive: null,
      online: false
    };
    _saveUsers(users);
    console.info("Default admin created: username=admin password=admin123");
  }
}
ensureDefaultAdmin();

function signup(){
  const username = document.getElementById("signupUsername").value.trim();
  const province = document.getElementById("signupProvince").value;
  const password = document.getElementById("signupPassword").value;

  if (!username || !password) {
    alert("Please fill all fields");
    return;
  }

  let users = _getUsers();
  if (users[username]) {
    alert("Username already exists!");
    return;
  }

  users[username] = {
    province,
    password,
    emissions: {},   // year -> [12]
    history: [],     // array of { timestamp, year, before, after }
    createdAt: nowIso(),
    isAdmin: false,
    lastLogin: null,
    lastActive: null,
    online: false
  };
  _saveUsers(users);

  alert("Signup successful! Please login.");
  window.location.href = "login.html";
}

function login(){
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  let users = _getUsers();
  if (!users[username] || users[username].password !== password) {
    alert("Invalid login credentials");
    return;
  }

  users[username].lastLogin = nowIso();
  users[username].lastActive = nowIso();
  users[username].online = true;
  _saveUsers(users);

  localStorage.setItem("currentUser", username);
  window.location.href = "dashboard.html";
}

// optional logout function (useful when testing or navigating away)
function logout(){
  const current = localStorage.getItem("currentUser");
  if (current) {
    let users = _getUsers();
    if (users[current]) {
      users[current].online = false;
      users[current].lastActive = new Date().toISOString();
      _saveUsers(users);
    }
  }
  localStorage.removeItem("currentUser");
  window.location.href = "login.html";
}
