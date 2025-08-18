// admin.js

function fmt(ts){
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch(e){ return ts; }
}

function loadUsers(){
  return JSON.parse(localStorage.getItem('users') || '{}');
}

function renderAdminLogin(container){
  container.innerHTML = `
    <div class="login-admin">
      <h3>Admin login</h3>
      <label>Admin username</label>
      <input type="text" id="adminUser" value="admin">
      <label>Admin password</label>
      <input type="password" id="adminPass">
      <div style="margin-top:10px">
        <button id="btnAdminLogin" class="btn">Login</button>
      </div>
    </div>
  `;
  document.getElementById('btnAdminLogin').addEventListener('click', ()=>{
    const u = document.getElementById('adminUser').value.trim();
    const p = document.getElementById('adminPass').value;
    const users = loadUsers();
    if (!users[u] || users[u].password !== p || !users[u].isAdmin) {
      alert("Invalid admin credentials");
      return;
    }
    // set as current session admin
    localStorage.setItem('currentUser', u);
    users[u].lastLogin = new Date().toISOString();
    users[u].online = true;
    users[u].lastActive = new Date().toISOString();
    localStorage.setItem('users', JSON.stringify(users));
    renderAdminUI();
  });
}

function renderAdminUI(){
  const container = document.getElementById('adminContent');
  const users = loadUsers();

  // build left list + right detail
  container.innerHTML = `
    <div class="admin-top">
      <div class="users-list" id="usersList"></div>
      <div class="user-details" id="userDetails"><em>Select a user to view details</em></div>
    </div>
  `;

  const usersList = document.getElementById('usersList');
  const userDetails = document.getElementById('userDetails');

  const keys = Object.keys(users).sort();
  if (keys.length === 0) {
    usersList.innerHTML = "<div class='meta'>No users found.</div>";
    return;
  }

  keys.forEach(un => {
    const u = users[un];
    const div = document.createElement('div');
    div.className = 'user-row' + (u.online ? ' online' : '');
    div.innerHTML = `
      <div style="font-weight:600">${un} ${u.isAdmin ? ' (admin)' : ''}</div>
      <div class="meta">${u.province || '—'}</div>
      <div class="meta">Signed: ${fmt(u.createdAt)} • Last login: ${fmt(u.lastLogin)}</div>
    `;
    div.addEventListener('click', ()=>{
      showUserDetails(un);
      // highlight selection
      usersList.querySelectorAll('.user-row').forEach(r=>r.style.background='');
      div.style.background = 'rgba(255,255,255,0.02)';
    });
    usersList.appendChild(div);
  });

  // also quick controls at top of details
  function showUserDetails(username){
    const user = users[username];
    if (!user) {
      userDetails.innerHTML = "<div class='meta'>User not found.</div>";
      return;
    }

    // Emissions summary per year
    let emissionsHtml = '';
    (Object.keys(user.emissions || {}) .length ? Object.keys(user.emissions) : []).forEach(y=>{
      const arr = user.emissions[y] || new Array(12).fill(0);
      emissionsHtml += `<div><strong>${y}</strong> — [${arr.map(v=>v==null?0:v).join(', ')}]</div>`;
    });
    if (!emissionsHtml) emissionsHtml = `<div class="meta">No emissions recorded yet.</div>`;

    // History list
    const history = (user.history || []).slice().reverse(); // latest first
    let historyHtml = '';
    if (history.length === 0) {
      historyHtml = `<div class="meta">No change history.</div>`;
    } else {
      history.forEach((h, idx) => {
        // small diff: show months that changed
        const diffs = [];
        for (let i=0;i<12;i++){
          const b = (h.before && h.before[i]) || 0;
          const a = (h.after && h.after[i]) || 0;
          if (b !== a) diffs.push(`${MONTHS[i]}: ${b} → ${a}`);
        }
        historyHtml += `
          <div class="history-item">
            <div style="font-weight:600">${fmt(h.timestamp)} — ${h.year}</div>
            <div class="meta">${diffs.length ? diffs.join('; ') : 'No month changed (snapshot saved).'}</div>
            <div style="margin-top:6px">
              <button class="btn" data-user="${username}" data-idx="${history.length-1-idx}" onclick="viewSnapshot(this)">View snapshot</button>
            </div>
          </div>
        `;
      });
    }

    userDetails.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h3>${username} ${user.isAdmin ? '(admin)' : ''}</h3>
          <div class="meta">Province: ${user.province || '—'}</div>
          <div class="meta">Signed up: ${fmt(user.createdAt)}</div>
          <div class="meta">Last login: ${fmt(user.lastLogin)} • Last active: ${fmt(user.lastActive)}</div>
          <div class="meta">Online: ${user.online ? 'Yes' : 'No'}</div>
        </div>
        <div style="text-align:right">
          <button id="forceLogoutBtn" class="btn">Force logout</button>
          <button id="deleteUserBtn" class="btn" style="background:#e74c3c; color:#fff">Delete</button>
        </div>
      </div>

      <hr style="border-color:var(--border)">

      <div>
        <h4>Emissions (per year)</h4>
        ${emissionsHtml}
      </div>

      <div class="history">
        <h4>Change history</h4>
        ${historyHtml}
      </div>

      <div id="snapshotModal"></div>
    `;

    // wire buttons
    document.getElementById('forceLogoutBtn').addEventListener('click', ()=>{
      const users2 = loadUsers();
      if (users2[username]) {
        users2[username].online = false;
        users2[username].lastActive = new Date().toISOString();
        localStorage.setItem('users', JSON.stringify(users2));
        alert(`${username} forced to logout (client-side flag).`);
        renderAdminUI(); // refresh UI
      }
    });

    document.getElementById('deleteUserBtn').addEventListener('click', ()=>{
      if (!confirm(`Delete user ${username}? This will remove data from localStorage.`)) return;
      const users2 = loadUsers();
      delete users2[username];
      localStorage.setItem('users', JSON.stringify(users2));
      alert(`${username} deleted.`);
      renderAdminUI();
    });
  }

  // expose viewSnapshot to global scope to be called from buttons
  window.viewSnapshot = function(btn){
    const username = btn.getAttribute('data-user');
    const idx = Number(btn.getAttribute('data-idx'));
    const users = loadUsers();
    const user = users[username];
    if (!user) return alert("User not found");
    const hist = user.history || [];
    const entry = hist[idx];
    if (!entry) return alert("Snapshot not found");
    // show a simple modal / inline
    const md = document.createElement('div');
    md.style = "position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); background:var(--panel); padding:18px; border-radius:10px; border:1px solid var(--border); z-index:9999; max-width:90%; max-height:90%; overflow:auto;";
    md.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
        <strong>Snapshot (${fmt(entry.timestamp)}) — ${entry.year}</strong>
        <button id="closeSnap" class="btn">Close</button>
      </div>
      <div style="margin-top:10px;">
        <div style="font-weight:600">Before</div>
        <pre style="white-space:pre-wrap;">${JSON.stringify(entry.before || [], null, 2)}</pre>
        <div style="font-weight:600">After</div>
        <pre style="white-space:pre-wrap;">${JSON.stringify(entry.after || [], null, 2)}</pre>
      </div>
    `;
    document.body.appendChild(md);
    document.getElementById('closeSnap').addEventListener('click', ()=> md.remove());
  };
}

// start
(function init(){
  const adminContent = document.getElementById('adminContent');
  const current = localStorage.getItem('currentUser');
  const users = loadUsers();

  if (current && users[current] && users[current].isAdmin) {
    renderAdminUI();
  } else {
    renderAdminLogin(adminContent);
  }
})();
