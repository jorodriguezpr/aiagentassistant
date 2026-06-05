/* AiAgentAssistant Admin Portal — Dashboard */

// ── Auth guard ────────────────────────────────────────────────
(async () => {
  try {
    const r = await fetch('/api/auth/me');
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      if (data.requiresTotp) {
        window.location.href = data.needsSetup ? '/totp-setup' : '/totp-verify';
      } else {
        window.location.href = '/';
      }
      return;
    }
    const u = await r.json();
    document.getElementById('sidebarUser').textContent = `${u.username} (${u.role})`;
    window._role = u.role;
    window._username = u.username;
  } catch { window.location.href = '/'; }
})();

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const el   = document.getElementById('toast');
  const body = document.getElementById('toastMsg');
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  body.textContent = `${icon} ${msg}`;
  el.style.background = type === 'error' ? '#450a0a' : type === 'warning' ? '#3f2005' : '#0d2818';
  bootstrap.Toast.getOrCreateInstance(el, { delay: 3500 }).show();
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function numFmt(n) { return (n || 0).toLocaleString(); }

// ── Navigation ────────────────────────────────────────────────
const loaders = {
  overview:        loadStatus,
  settings:        loadSettings,
  logs:            startLogs,
  'token-usage':   loadTokenUsage,
  credentials:     loadCredentials,
  nlscripts:       loadNlScripts,
  playbooks:       loadPlaybooks,
  'scheduled-tasks': loadScheduledTasks,
  'email-accounts': loadEmailAccounts,
  tasks:           loadTasks,
  chat:            initChat,
  users:           loadUsers,
};

document.querySelectorAll('[data-section]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const id = link.dataset.section;
    document.querySelectorAll('[data-section]').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`section-${id}`).classList.add('active');
    if (loaders[id]) loaders[id]();
  });
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

// ──────────────────────────────────────────────────────────────
// OVERVIEW
// ──────────────────────────────────────────────────────────────
async function loadStatus() {
  try {
    const r = await fetch('/api/service/status');
    renderStatus(await r.json());
  } catch { document.getElementById('statusText').textContent = 'Error'; }
}

function renderStatus(s) {
  const badge = document.getElementById('statusBadge');
  const dot   = badge.querySelector('.status-dot');
  badge.className = `status-badge ${s.state}`;
  dot.className   = `status-dot ${s.state}`;
  document.getElementById('statusText').textContent = s.state.charAt(0).toUpperCase() + s.state.slice(1);
  document.getElementById('statusMeta').textContent = [s.pid ? `PID: ${s.pid}` : '', s.uptime ? `Uptime: ${s.uptime}` : ''].filter(Boolean).join('  ·  ');
}

async function serviceAction(action) {
  const btn  = document.getElementById(`btn${action.charAt(0).toUpperCase() + action.slice(1)}`);
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
  try {
    const r = await fetch(`/api/service/${action}`, { method: 'POST' });
    const d = await r.json();
    if (r.ok) { renderStatus(d.status); toast(`Service ${action} successful`); }
    else toast(d.error || `${action} failed`, 'error');
  } catch (e) { toast(e.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = orig; }
}

document.getElementById('btnStart').addEventListener('click',         () => serviceAction('start'));
document.getElementById('btnStop').addEventListener('click',          () => serviceAction('stop'));
document.getElementById('btnRestart').addEventListener('click',       () => serviceAction('restart'));
document.getElementById('btnRefreshStatus').addEventListener('click', loadStatus);

// ──────────────────────────────────────────────────────────────
// SETTINGS
// ──────────────────────────────────────────────────────────────
let _schema = [], _values = {};

async function loadSettings() {
  try {
    const r = await fetch('/api/settings');
    const d = await r.json();
    _schema = d.schema; _values = d.values;
    renderQuickInfo(d.values);
    buildSettingsTabs(d.schema, d.values);
  } catch (e) { toast(e.message, 'error'); }
}

function renderQuickInfo(v) {
  document.getElementById('quickProvider').textContent = v.AI_PROVIDER || '—';
  document.getElementById('quickModel').textContent    = v.AI_MODEL    || '—';
  const gates = [v.TELEGRAM_BOT_TOKEN ? '📱 Telegram' : null, v.ENABLE_DISCORD === 'true' ? '💬 Discord' : null, v.ENABLE_WHATSAPP === 'true' ? '📞 WhatsApp' : null].filter(Boolean);
  document.getElementById('quickMessaging').textContent = gates.join('  ·  ') || 'None enabled';
}

function buildSettingsTabs(schema, values) {
  const tabsEl = document.getElementById('settingsTabs');
  const contentEl = document.getElementById('settingsTabContent');
  tabsEl.innerHTML = ''; contentEl.innerHTML = '';
  schema.forEach((section, idx) => {
    const li = document.createElement('li'); li.className = 'nav-item';
    const a  = document.createElement('a');
    a.className = 'nav-link' + (idx === 0 ? ' active' : '');
    a.href = '#'; a.dataset.tab = section.id;
    a.innerHTML = `<i class="${section.icon} me-1"></i>${section.label}`;
    li.appendChild(a); tabsEl.appendChild(li);
    const pane = document.createElement('div');
    pane.id = `tab-${section.id}`; pane.style.display = idx === 0 ? '' : 'none';
    const row = document.createElement('div'); row.className = 'row g-3';
    section.fields.forEach(field => {
      const col = document.createElement('div'); col.className = 'col-sm-6';
      const val = values[field.key] || '';
      if (field.type === 'boolean') {
        col.innerHTML = `<div class="d-flex align-items-center gap-2 pt-3"><div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" id="f_${field.key}" data-key="${field.key}" ${val === 'true' ? 'checked' : ''}><label class="form-check-label text-muted" for="f_${field.key}">${field.label}</label></div></div>`;
      } else if (field.type === 'select') {
        const opts = (field.options||[]).map(o => `<option ${val===o?'selected':''}>${o}</option>`).join('');
        col.innerHTML = `<label class="form-label">${field.label}</label><select class="form-select" id="f_${field.key}" data-key="${field.key}">${opts}</select>${field.description?`<div class="form-text">${field.description}</div>`:''}`;
      } else {
        const t = field.type === 'password' ? 'password' : 'text';
        col.innerHTML = `<label class="form-label">${field.label}</label><div class="input-group"><input type="${t}" class="form-control" id="f_${field.key}" data-key="${field.key}" value="${escHtml(val)}">${field.type==='password'?`<button class="btn btn-outline-secondary btn-sm" type="button" onclick="togglePw(this)" tabindex="-1"><i class="bi bi-eye"></i></button>`:''}</div>${field.description?`<div class="form-text">${field.description}</div>`:''}`;
      }
      row.appendChild(col);
    });
    pane.appendChild(row); contentEl.appendChild(pane);
    a.addEventListener('click', e => {
      e.preventDefault();
      tabsEl.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active')); a.classList.add('active');
      contentEl.querySelectorAll('[id^="tab-"]').forEach(p => p.style.display = 'none'); pane.style.display = '';
    });
  });
}

function togglePw(btn) {
  const input = btn.previousElementSibling;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.querySelector('i').className = showing ? 'bi bi-eye' : 'bi bi-eye-slash';
}

document.getElementById('btnSaveSettings').addEventListener('click', async () => {
  const updates = {};
  document.querySelectorAll('[data-key]').forEach(el => {
    updates[el.dataset.key] = el.type === 'checkbox' ? (el.checked ? 'true' : 'false') : el.value;
  });
  const btn = document.getElementById('btnSaveSettings');
  btn.disabled = true; const orig = btn.innerHTML;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving…';
  try {
    const r = await fetch('/api/settings', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(updates) });
    const d = await r.json();
    if (r.ok) { toast(`Saved ${d.updated} setting(s)`); if (document.getElementById('restartAfterSave').checked) serviceAction('restart'); }
    else toast(d.error || 'Save failed', 'error');
  } catch (e) { toast(e.message, 'error'); }
  finally { btn.disabled = false; btn.innerHTML = orig; }
});

// ──────────────────────────────────────────────────────────────
// LOGS
// ──────────────────────────────────────────────────────────────
let _logSource = null, _logPaused = false;

function startLogs() {
  if (_logSource) return;
  const output = document.getElementById('logOutput'); output.textContent = '';
  _logSource = new EventSource('/api/logs/stream?lines=100');
  _logSource.onmessage = e => {
    if (_logPaused) return;
    output.textContent += e.data.replace(/\\n/g, '\n') + '\n';
    output.scrollTop = output.scrollHeight;
  };
  _logSource.onerror = () => { output.textContent += '\n[Stream disconnected]\n'; _logSource = null; };
}

document.getElementById('btnClearLogs').addEventListener('click', () => { document.getElementById('logOutput').textContent = ''; });
document.getElementById('btnToggleLogs').addEventListener('click', () => {
  _logPaused = !_logPaused;
  document.getElementById('btnToggleLogs').innerHTML = _logPaused ? '<i class="bi bi-play me-1"></i><span>Resume</span>' : '<i class="bi bi-pause me-1"></i><span>Pause</span>';
});

// ──────────────────────────────────────────────────────────────
// TOKEN USAGE
// ──────────────────────────────────────────────────────────────
async function loadTokenUsage() {
  try {
    const r = await fetch('/api/token-usage');
    const d = await r.json();
    const s = d.summary;
    // Summary cards
    document.getElementById('tokenSummaryCards').innerHTML = [
      ['Total Tokens', numFmt(s.total), 'text-info'],
      ['Prompt Tokens', numFmt(s.totalPrompt), 'text-warning'],
      ['Completion Tokens', numFmt(s.totalCompletion), 'text-success'],
      ['Total Calls', numFmt(s.entryCount), 'text-muted'],
    ].map(([label, val, cls]) =>
      `<div class="col-sm-3"><div class="stat-card"><div class="stat-value ${cls}">${val}</div><div class="stat-label">${label}</div></div></div>`
    ).join('');

    // By provider
    renderBars('tokenByProvider', d.byProvider, s.total);
    renderBars('tokenByModel',    d.byModel,    s.total);

    // Recent table
    document.getElementById('tokenTable').innerHTML = (d.recent || []).map(e =>
      `<tr><td class="text-muted small">${fmtDate(e.timestamp)}</td><td>${escHtml(e.provider||'')}</td><td class="text-muted small">${escHtml(e.model||'')}</td><td>${numFmt(e.promptTokens)}</td><td>${numFmt(e.completionTokens)}</td><td class="fw-semibold">${numFmt(e.totalTokens)}</td></tr>`
    ).join('') || '<tr><td colspan="6" class="text-muted text-center py-3">No data</td></tr>';
  } catch (e) { toast(e.message, 'error'); }
}

function renderBars(elId, data, total) {
  const el = document.getElementById(elId);
  const entries = Object.entries(data || {}).sort((a,b) => b[1] - a[1]);
  if (!entries.length) { el.innerHTML = '<div class="text-muted small">No data</div>'; return; }
  const max = entries[0][1];
  el.innerHTML = entries.map(([k,v]) =>
    `<div class="bar-row"><span class="bar-label">${escHtml(k)}</span><div class="bar-fill" style="width:${Math.max(4, Math.round(v/max*120))}px"></div><span class="bar-count">${numFmt(v)}</span></div>`
  ).join('');
}

document.getElementById('btnResetTokens').addEventListener('click', async () => {
  if (!confirm('Reset all token usage counters? A backup will be created.')) return;
  const r = await fetch('/api/token-usage/reset', { method: 'POST' });
  const d = await r.json();
  if (r.ok) { toast('Token counters reset'); loadTokenUsage(); }
  else toast(d.error || 'Reset failed', 'error');
});

// ──────────────────────────────────────────────────────────────
// CREDENTIALS
// ──────────────────────────────────────────────────────────────
async function loadCredentials() {
  try {
    const r = await fetch('/api/credentials');
    renderCredentials(await r.json());
  } catch (e) { toast(e.message, 'error'); }
}

function renderCredentials(creds) {
  document.getElementById('credentialsTable').innerHTML = creds.map(c =>
    `<tr>
      <td class="fw-semibold font-monospace">${escHtml(c.key)}</td>
      <td class="text-muted small">${fmtDate(c.updatedAt)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary me-1" onclick="revealCred('${escHtml(c.key)}')"><i class="bi bi-eye"></i></button>
        <button class="btn btn-sm btn-outline-warning me-1" onclick="openUpdateCred('${escHtml(c.key)}')"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteCred('${escHtml(c.key)}')"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`
  ).join('') || '<tr><td colspan="3" class="text-muted text-center py-3">No credentials stored</td></tr>';
}

document.getElementById('btnAddCred').addEventListener('click', () => {
  document.getElementById('addCredTitle').textContent = 'Add Credential';
  ['credName','credValue'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('btnConfirmAddCred').onclick = async () => {
    const key = document.getElementById('credName').value.trim();
    const val = document.getElementById('credValue').value;
    if (!key || !val) { toast('Key and value required', 'error'); return; }
    const r = await fetch('/api/credentials', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ key, value: val }) });
    const d = await r.json();
    if (r.ok) { bootstrap.Modal.getInstance('#addCredModal').hide(); toast('Credential saved'); loadCredentials(); }
    else toast(d.error || 'Failed', 'error');
  };
  new bootstrap.Modal('#addCredModal').show();
});

async function revealCred(key) {
  const r = await fetch(`/api/credentials/${encodeURIComponent(key)}/value`);
  const d = await r.json();
  if (r.ok) alert(`${key}:\n\n${d.value}`);
  else toast(d.error || 'Cannot reveal', 'error');
}

function openUpdateCred(key) {
  document.getElementById('updateCredName').textContent = key;
  document.getElementById('updateCredValue').value = '';
  document.getElementById('btnConfirmUpdateCred').onclick = async () => {
    const val = document.getElementById('updateCredValue').value;
    if (!val) { toast('Enter new value', 'error'); return; }
    const r = await fetch(`/api/credentials/${encodeURIComponent(key)}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ value: val }) });
    const d = await r.json();
    if (r.ok) { bootstrap.Modal.getInstance('#updateCredModal').hide(); toast('Credential updated'); loadCredentials(); }
    else toast(d.error || 'Failed', 'error');
  };
  new bootstrap.Modal('#updateCredModal').show();
}

async function deleteCred(key) {
  if (!confirm(`Delete credential "${key}"?`)) return;
  const r = await fetch(`/api/credentials/${encodeURIComponent(key)}`, { method: 'DELETE' });
  const d = await r.json();
  if (r.ok) { toast(`Credential "${key}" deleted`); loadCredentials(); }
  else toast(d.error || 'Failed', 'error');
}

document.getElementById('btnConfirmAddCred').onclick = () => {};

// ──────────────────────────────────────────────────────────────
// NL SCRIPTS
// ──────────────────────────────────────────────────────────────
async function loadNlScripts() {
  try {
    const r = await fetch('/api/nlscripts');
    renderNlScripts(await r.json());
  } catch (e) { toast(e.message, 'error'); }
}

function renderNlScripts(scripts) {
  document.getElementById('nlscriptsTable').innerHTML = scripts.map(s =>
    `<tr>
      <td class="fw-semibold">${escHtml(s.name)}</td>
      <td><span class="badge bg-secondary">${(s.steps||[]).length}</span></td>
      <td class="text-muted small">${escHtml(s.description||'')}</td>
      <td class="text-muted">${s.runCount||0}</td>
      <td class="text-muted small">${fmtDateShort(s.lastRun)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary me-1" onclick='openNlScript(${JSON.stringify(s)})'><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteNlScript('${escHtml(s.name)}')"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`
  ).join('') || '<tr><td colspan="6" class="text-muted text-center py-3">No NL scripts saved</td></tr>';
}

document.getElementById('btnAddNlScript').addEventListener('click', () => openNlScript(null));

function openNlScript(script) {
  document.getElementById('nlscriptModalTitle').textContent = script ? `Edit: ${script.name}` : 'New NL Script';
  document.getElementById('nlsName').value  = script?.name        || '';
  document.getElementById('nlsName').readOnly = !!script;
  document.getElementById('nlsDesc').value  = script?.description || '';
  document.getElementById('nlsSteps').value = script ? (script.steps||[]).join('\n') : '';
  document.getElementById('btnConfirmNlScript').onclick = async () => {
    const name  = document.getElementById('nlsName').value.trim();
    const desc  = document.getElementById('nlsDesc').value.trim();
    const steps = document.getElementById('nlsSteps').value.split('\n').map(s=>s.trim()).filter(Boolean);
    if (!name || !steps.length) { toast('Name and at least one step required', 'error'); return; }
    const url    = script ? `/api/nlscripts/${encodeURIComponent(script.name)}` : '/api/nlscripts';
    const method = script ? 'PUT' : 'POST';
    const r = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, steps, description: desc }) });
    const d = await r.json();
    if (r.ok) { bootstrap.Modal.getInstance('#nlscriptModal').hide(); toast(`Script "${name}" saved`); loadNlScripts(); }
    else toast(d.error || 'Failed', 'error');
  };
  new bootstrap.Modal('#nlscriptModal').show();
}

async function deleteNlScript(name) {
  if (!confirm(`Delete NL script "${name}"?`)) return;
  const r = await fetch(`/api/nlscripts/${encodeURIComponent(name)}`, { method: 'DELETE' });
  const d = await r.json();
  if (r.ok) { toast(`Script "${name}" deleted`); loadNlScripts(); }
  else toast(d.error || 'Failed', 'error');
}

// ──────────────────────────────────────────────────────────────
// PLAYBOOKS
// ──────────────────────────────────────────────────────────────
let _allPlaybooks = [];

async function loadPlaybooks() {
  try {
    const r = await fetch('/api/playbooks');
    _allPlaybooks = await r.json();
    renderPlaybooks(_allPlaybooks);
  } catch (e) { toast(e.message, 'error'); }
}

function renderPlaybooks(pbs) {
  document.getElementById('playbooksTable').innerHTML = pbs.map(p =>
    `<tr>
      <td class="fw-semibold">${escHtml(p.title)}</td>
      <td><span class="badge bg-secondary">${escHtml(p.category||'general')}</span></td>
      <td>${p.stepCount||0}</td>
      <td class="text-muted small">${p.successCount||0}✓ / ${p.failureCount||0}✗</td>
      <td class="text-muted small">${fmtDateShort(p.lastUsed)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary me-1" onclick="openPlaybook('${escHtml(p.id)}')"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deletePlaybook('${escHtml(p.id)}','${escHtml(p.title)}')"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`
  ).join('') || '<tr><td colspan="6" class="text-muted text-center py-3">No playbooks in knowledge base</td></tr>';
}

document.getElementById('playbookSearch').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  renderPlaybooks(q ? _allPlaybooks.filter(p => (p.title+p.description+p.category).toLowerCase().includes(q)) : _allPlaybooks);
});

async function openPlaybook(id) {
  const r  = await fetch(`/api/playbooks/${id}`);
  const pb = await r.json();
  document.getElementById('playbookModalTitle').textContent = pb.title;
  document.getElementById('pbTitle').value    = pb.title       || '';
  document.getElementById('pbCategory').value = pb.category    || '';
  document.getElementById('pbService').value  = pb.targetService || '';
  document.getElementById('pbDesc').value     = pb.description || '';
  document.getElementById('pbNotes').value    = pb.notes       || '';
  // Steps: array of objects with {description} or plain strings
  const stepsText = (pb.steps||[]).map(s => typeof s === 'string' ? s : (s.description || s.command || JSON.stringify(s))).join('\n');
  document.getElementById('pbSteps').value = stepsText;
  document.getElementById('btnSavePlaybook').onclick = async () => {
    const steps = document.getElementById('pbSteps').value.split('\n').map(s=>s.trim()).filter(Boolean);
    const body = {
      title:         document.getElementById('pbTitle').value,
      category:      document.getElementById('pbCategory').value,
      targetService: document.getElementById('pbService').value,
      description:   document.getElementById('pbDesc').value,
      notes:         document.getElementById('pbNotes').value,
      steps:         steps.map(s => ({ description: s })),
    };
    const res = await fetch(`/api/playbooks/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const d   = await res.json();
    if (res.ok) { bootstrap.Modal.getInstance('#playbookModal').hide(); toast('Playbook saved'); loadPlaybooks(); }
    else toast(d.error || 'Failed', 'error');
  };
  new bootstrap.Modal('#playbookModal').show();
}

async function deletePlaybook(id, title) {
  if (!confirm(`Delete playbook "${title}"?`)) return;
  const r = await fetch(`/api/playbooks/${id}`, { method: 'DELETE' });
  const d = await r.json();
  if (r.ok) { toast(`Playbook deleted`); loadPlaybooks(); }
  else toast(d.error || 'Failed', 'error');
}

// ──────────────────────────────────────────────────────────────
// SCHEDULED TASKS
// ──────────────────────────────────────────────────────────────
async function loadScheduledTasks() {
  try {
    const r = await fetch('/api/scheduled-tasks');
    renderScheduledTasks(await r.json());
  } catch (e) { toast(e.message, 'error'); }
}

function renderScheduledTasks(tasks) {
  document.getElementById('scheduledTasksTable').innerHTML = tasks.map(t =>
    `<tr>
      <td class="fw-semibold">${escHtml(t.name)}</td>
      <td><span class="badge bg-secondary">${escHtml(t.type||'')}</span></td>
      <td class="text-muted small font-monospace">${escHtml(t.scheduleDescription||t.schedule||'')}</td>
      <td>
        <div class="form-check form-switch mb-0">
          <input class="form-check-input" type="checkbox" onchange="toggleTask('${t.id}',this.checked)" ${t.enabled ? 'checked' : ''}>
        </div>
      </td>
      <td class="text-muted">${t.runCount||0}</td>
      <td class="text-muted small">${fmtDateShort(t.lastRun)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-danger" onclick="deleteTask('${escHtml(t.id)}','${escHtml(t.name)}')"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`
  ).join('') || '<tr><td colspan="7" class="text-muted text-center py-3">No scheduled tasks</td></tr>';
}

async function toggleTask(id, enabled) {
  const r = await fetch(`/api/scheduled-tasks/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ enabled }) });
  const d = await r.json();
  if (r.ok) toast(`Task ${enabled ? 'enabled' : 'disabled'} — restart service to apply`);
  else toast(d.error || 'Failed', 'error');
}

async function deleteTask(id, name) {
  if (!confirm(`Delete scheduled task "${name}"?`)) return;
  const r = await fetch(`/api/scheduled-tasks/${id}`, { method: 'DELETE' });
  const d = await r.json();
  if (r.ok) { toast(`Task "${name}" deleted`); loadScheduledTasks(); }
  else toast(d.error || 'Failed', 'error');
}

// ──────────────────────────────────────────────────────────────
// EMAIL ACCOUNTS
// ──────────────────────────────────────────────────────────────
async function loadEmailAccounts() {
  try {
    const r = await fetch('/api/email-accounts');
    const d = await r.json();
    renderEmailAccounts(d.accounts, d.default);
  } catch (e) { toast(e.message, 'error'); }
}

function renderEmailAccounts(accounts, def) {
  document.getElementById('emailAccountsTable').innerHTML = accounts.map(a =>
    `<tr>
      <td class="fw-semibold">${escHtml(a.accountName)}</td>
      <td class="text-muted small">${escHtml(a.email||'')}</td>
      <td><span class="badge bg-secondary">${escHtml(a.provider||'custom')}</span></td>
      <td class="text-muted small">${escHtml(a.smtpHost||'')}:${a.smtpPort||''}</td>
      <td class="text-muted small">${escHtml(a.imapHost||'')}:${a.imapPort||''}</td>
      <td>${a.accountName === def ? '<span class="badge" style="background:#388bfd30;color:#79c0ff;border:1px solid #388bfd40">default</span>' : `<button class="btn btn-xs btn-outline-secondary btn-sm" onclick="setDefaultEmail('${escHtml(a.accountName)}')">Set default</button>`}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary me-1" onclick='openEmailEdit(${JSON.stringify(a)})'><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteEmail('${escHtml(a.accountName)}')"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`
  ).join('') || '<tr><td colspan="7" class="text-muted text-center py-3">No email accounts configured</td></tr>';
}

function openEmailEdit(account) {
  document.getElementById('emailModalTitle').textContent = `Edit: ${account.accountName}`;
  document.getElementById('emDisplayName').value = account.displayName || '';
  document.getElementById('emProvider').value    = account.provider    || 'custom';
  document.getElementById('emSmtpHost').value    = account.smtpHost    || '';
  document.getElementById('emSmtpPort').value    = account.smtpPort    || '';
  document.getElementById('emSmtpSec').value     = account.smtpSecurity|| 'TLS';
  document.getElementById('emSmtpUser').value    = account.smtpUser    || '';
  document.getElementById('emSmtpPw').value      = '';
  document.getElementById('emImapHost').value    = account.imapHost    || '';
  document.getElementById('emImapPort').value    = account.imapPort    || '';
  document.getElementById('emImapSec').value     = account.imapSecurity|| 'TLS';
  document.getElementById('emImapUser').value    = account.imapUser    || '';
  document.getElementById('emImapPw').value      = '';

  document.getElementById('btnSaveEmail').onclick = async () => {
    const body = {
      displayName:  document.getElementById('emDisplayName').value,
      provider:     document.getElementById('emProvider').value,
      smtpHost:     document.getElementById('emSmtpHost').value,
      smtpPort:     parseInt(document.getElementById('emSmtpPort').value) || undefined,
      smtpSecurity: document.getElementById('emSmtpSec').value,
      smtpUser:     document.getElementById('emSmtpUser').value,
      imapHost:     document.getElementById('emImapHost').value,
      imapPort:     parseInt(document.getElementById('emImapPort').value) || undefined,
      imapSecurity: document.getElementById('emImapSec').value,
      imapUser:     document.getElementById('emImapUser').value,
    };
    const smtpPw = document.getElementById('emSmtpPw').value;
    const imapPw = document.getElementById('emImapPw').value;
    if (smtpPw) body.smtpPassword = smtpPw;
    if (imapPw) body.imapPassword = imapPw;
    const r = await fetch(`/api/email-accounts/${encodeURIComponent(account.accountName)}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const d = await r.json();
    if (r.ok) { bootstrap.Modal.getInstance('#emailModal').hide(); toast('Account updated'); loadEmailAccounts(); }
    else toast(d.error || 'Failed', 'error');
  };
  new bootstrap.Modal('#emailModal').show();
}

async function setDefaultEmail(name) {
  const r = await fetch(`/api/email-accounts/${encodeURIComponent(name)}/default`, { method: 'POST' });
  const d = await r.json();
  if (r.ok) { toast(`"${name}" set as default`); loadEmailAccounts(); }
  else toast(d.error || 'Failed', 'error');
}

async function deleteEmail(name) {
  if (!confirm(`Delete email account "${name}" and its stored passwords?`)) return;
  const r = await fetch(`/api/email-accounts/${encodeURIComponent(name)}`, { method: 'DELETE' });
  const d = await r.json();
  if (r.ok) { toast(`Account "${name}" deleted`); loadEmailAccounts(); }
  else toast(d.error || 'Failed', 'error');
}

// ──────────────────────────────────────────────────────────────
// ACTIVE TASKS
// ──────────────────────────────────────────────────────────────
async function loadTasks() {
  const tbody = document.getElementById('tasksTable');
  tbody.innerHTML = '<tr><td colspan="7" class="text-muted text-center py-3"><span class="spinner-border spinner-border-sm me-2"></span>Loading…</td></tr>';
  try {
    const r = await fetch('/api/tasks');
    if (!r.ok) {
      const d = await r.json();
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-3"><span class="text-warning">${escHtml(d.error)}</span></td></tr>`;
      return;
    }
    const tasks = await r.json();
    renderTasks(tasks);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center py-3">${escHtml(e.message)}</td></tr>`;
  }
}

const PHASE_COLORS = { planning: 'text-warning', executing: 'text-info', validating: 'text-success' };

function renderTasks(tasks) {
  const tbody = document.getElementById('tasksTable');
  if (!tasks.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted text-center py-3">No checkpointed tasks in Redis</td></tr>';
    return;
  }
  tbody.innerHTML = tasks.map(t => {
    const phase      = t.phase || 'executing';
    const phaseColor = PHASE_COLORS[phase] || 'text-muted';
    const desc       = escHtml((t.description || t.originalMessage || '').slice(0, 80));
    return `<tr>
      <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(t.originalMessage||'')}">${desc || '<span class="text-muted">—</span>'}</td>
      <td><span class="fw-semibold ${phaseColor}">${escHtml(phase)}</span></td>
      <td class="text-muted small font-monospace">${escHtml(String(t.chatId||''))}</td>
      <td class="text-muted">${t.toolCallCount || 0}</td>
      <td class="text-muted small">${fmtDate(t.createdAt)}</td>
      <td class="text-muted small">${fmtDate(t.updatedAt)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-danger" onclick="cancelTask('${escHtml(t.taskId)}', this)"
          title="Delete checkpoint — stops this task from being resumed">
          <i class="bi bi-x-circle me-1"></i>Cancel
        </button>
      </td>
    </tr>`;
  }).join('');
}

async function cancelTask(taskId, btn) {
  if (!confirm(`Delete checkpoint for task "${taskId}"?\n\nThis removes the resumable state. If the task is currently running, send /cancel from Telegram to stop it immediately.`)) return;
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
  try {
    const r = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
    const d = await r.json();
    if (r.ok) { toast('Task checkpoint deleted'); loadTasks(); }
    else { toast(d.error || 'Failed', 'error'); btn.disabled = false; btn.innerHTML = orig; }
  } catch (e) {
    toast(e.message, 'error');
    btn.disabled = false; btn.innerHTML = orig;
  }
}

document.getElementById('btnRefreshTasks').addEventListener('click', loadTasks);

// ──────────────────────────────────────────────────────────────
// AI CHAT
// ──────────────────────────────────────────────────────────────
let chatSessionId = null;
let chatSSE = null;
let chatRunning = false;
let chatPendingHITL = null; // { opId }
let chatPendingCredential = null; // { key }
let chatActivityWrap = null; // single tool-activity widget for current turn
let chatStepCount = 0;       // total steps this turn

function getOrCreateActivity() {
  if (chatActivityWrap && chatMessages().contains(chatActivityWrap)) return chatActivityWrap;
  chatStepCount = 0;
  chatActivityWrap = document.createElement('div');
  chatActivityWrap.className = 'd-flex mb-1 justify-content-start';
  chatActivityWrap.innerHTML =
    '<div class="chat-activity">' +
      '<div class="activity-status">' +
        '<span class="spinner-border spinner-border-sm me-1" style="width:10px;height:10px;border-width:1.5px"></span>' +
        '<span class="activity-label text-muted" style="font-size:12px">Working…</span>' +
      '</div>' +
      '<div class="activity-log" style="padding-left:8px;margin-top:4px;border-left:2px solid var(--border)"></div>' +
    '</div>';
  chatMessages().appendChild(chatActivityWrap);
  scrollChat();
  return chatActivityWrap;
}

function addStepLine(stepNumber, stepText) {
  const wrap = getOrCreateActivity();
  chatStepCount = Math.max(chatStepCount, stepNumber);
  const label = wrap.querySelector('.activity-label');
  label.textContent = stepText + '…';

  const log = wrap.querySelector('.activity-log');
  const line = document.createElement('div');
  line.id = 'chat-step-' + stepNumber;
  line.className = 'step-line';
  line.innerHTML =
    '<span class="step-icon" style="display:inline-block;width:16px;animation:spin 1s linear infinite">⟳</span> ' +
    '<span class="step-num text-muted" style="font-size:11px">' + stepNumber + '.</span> ' +
    '<span class="step-text" style="font-size:12px">' + escHtml(stepText) + '</span>';
  log.appendChild(line);
  scrollChat();
}

function resolveStepLine(stepNumber, success) {
  const line = document.getElementById('chat-step-' + stepNumber);
  if (!line) return;
  const icon = line.querySelector('.step-icon');
  if (icon) {
    icon.style.animation = 'none';
    icon.textContent = success ? '✅' : '❌';
  }
}

function finalizeActivity() {
  if (!chatActivityWrap || !chatMessages().contains(chatActivityWrap)) return;
  const count = chatStepCount;
  const act = chatActivityWrap.querySelector('.chat-activity');
  const log = act.querySelector('.activity-log');
  const hasErrors = log.querySelectorAll('.step-icon').length > 0
    ? Array.from(log.querySelectorAll('.step-icon')).some(el => el.textContent === '❌')
    : false;
  const icon = hasErrors ? '⚠️' : '🔧';

  if (count === 0) { chatActivityWrap.remove(); chatActivityWrap = null; return; }

  // Replace spinner header with collapsible toggle; log stays but collapses
  const statusDiv = act.querySelector('.activity-status');
  statusDiv.innerHTML =
    `<a href="#" class="activity-toggle text-muted text-decoration-none" style="font-size:12px">` +
      `${icon} ${count} step${count > 1 ? 's' : ''} <span class="activity-arrow" style="font-size:10px">▶</span>` +
    `</a>`;
  log.classList.add('d-none');

  statusDiv.querySelector('.activity-toggle').addEventListener('click', e => {
    e.preventDefault();
    const hidden = log.classList.toggle('d-none');
    statusDiv.querySelector('.activity-arrow').textContent = hidden ? '▶' : '▼';
  });

  chatActivityWrap = null;
  chatStepCount = 0;
}

function chatSessionKey() {
  if (!chatSessionId) chatSessionId = 'webchat_' + Math.random().toString(36).slice(2);
  return chatSessionId;
}

function initChat() {
  if (chatSSE) return; // already connected
  connectChatSSE();
}

function connectChatSSE() {
  const sid = chatSessionKey();
  chatSSE = new EventSource(`/api/chat/stream/${sid}`);
  chatSSE.onmessage = (e) => {
    try { handleChatEvent(JSON.parse(e.data)); } catch {}
  };
  chatSSE.onerror = () => {
    setChatStatus('Disconnected — reconnecting…');
    chatSSE.close();
    chatSSE = null;
    setTimeout(connectChatSSE, 3000);
  };
}

function handleChatEvent(evt) {
  switch (evt.type) {
    case 'connected':
      setChatStatus('Connected');
      break;

    case 'thinking': {
      removeThinking();
      const el = document.createElement('div');
      el.id = 'chatThinking';
      el.className = 'chat-thinking d-flex align-items-center gap-1 mb-2';
      el.innerHTML = '<span class="dot">●</span><span class="dot">●</span><span class="dot">●</span>';
      chatMessages().appendChild(el);
      scrollChat();
      setChatStatus('Thinking…');
      break;
    }

    case 'tool_call': {
      removeThinking();
      const stepNum  = evt.stepNumber || 0;
      const stepText = evt.stepText   || evt.name;
      addStepLine(stepNum, stepText);
      setChatStatus(stepText + '…');
      break;
    }

    case 'tool_result': {
      resolveStepLine(evt.stepNumber || 0, evt.success !== false);
      break;
    }

    case 'message':
      removeThinking();
      appendMarkdown('ai', evt.content || '');
      break;

    case 'system':
      removeThinking();
      appendMarkdown('system', evt.content || '');
      break;

    case 'plan': {
      removeThinking();
      let planObj;
      try { planObj = JSON.parse(evt.description); } catch { planObj = null; }
      const stepsHtml = planObj?.steps
        ? planObj.steps.map((s, i) => `${i+1}. <strong>[${escHtml(s.id)}]</strong> ${escHtml(s.description)}`).join('<br>')
        : escHtml(evt.description || '');
      const risksHtml = planObj?.risks?.length
        ? `<br><em>Risks: ${planObj.risks.map(r => escHtml(r)).join(', ')}</em>` : '';
      showHITL(evt.opId, stepsHtml + risksHtml);
      break;
    }

    case 'hitl': {
      removeThinking();
      let descHtml = '';
      try {
        const p = JSON.parse(evt.description);
        if (p.steps) {
          descHtml = p.steps.map((s, i) => `${i+1}. [${escHtml(s.id)}] ${escHtml(s.description)}`).join('\n');
          if (p.risks?.length) descHtml += '\n\nRisks: ' + p.risks.join(', ');
        } else { descHtml = evt.description; }
      } catch { descHtml = evt.description || ''; }
      showHITL(evt.opId, descHtml);
      break;
    }

    case 'credential_needed': {
      removeThinking();
      showCredentialPanel(evt.key);
      setChatStatus('Waiting for credential…');
      break;
    }

    case 'done':
      removeThinking();
      finalizeActivity();
      hideCredentialPanel();
      chatRunning = false;
      setChatStatus('');
      document.getElementById('chatInput').disabled = false;
      document.getElementById('btnSendChat').disabled = false;
      break;

    case 'cancelled':
      removeThinking();
      finalizeActivity();
      hideCredentialPanel();
      appendBubble('system', '🛑 Task cancelled.');
      chatRunning = false;
      setChatStatus('');
      document.getElementById('chatInput').disabled = false;
      document.getElementById('btnSendChat').disabled = false;
      break;

    case 'error':
      removeThinking();
      finalizeActivity();
      hideCredentialPanel();
      appendBubble('system', `❌ ${escHtml(evt.message || 'Unknown error')}`);
      chatRunning = false;
      setChatStatus('');
      document.getElementById('chatInput').disabled = false;
      document.getElementById('btnSendChat').disabled = false;
      break;
  }
}

function chatMessages() { return document.getElementById('chatMessages'); }

function appendBubble(cls, html) {
  const wrap = document.createElement('div');
  wrap.className = 'd-flex mb-2 ' + (cls.startsWith('user') ? 'justify-content-end' : 'justify-content-start');
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble chat-' + cls.trim().split(' ').join(' chat-');
  bubble.innerHTML = html;
  wrap.appendChild(bubble);
  chatMessages().appendChild(wrap);
  scrollChat();
}

function appendMarkdown(role, text) {
  // Simple markdown: bold, code blocks, inline code, newlines
  let html = escHtml(text)
    .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
  appendBubble(role, html);
}

function removeThinking() {
  const el = document.getElementById('chatThinking');
  if (el) el.remove();
}

function scrollChat() {
  const c = chatMessages();
  c.scrollTop = c.scrollHeight;
}

function setChatStatus(msg) {
  document.getElementById('chatStatus').textContent = msg;
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showHITL(opId, descriptionHtml) {
  chatPendingHITL = { opId };
  document.getElementById('chatHITLText').textContent = descriptionHtml;
  document.getElementById('chatHITL').classList.remove('d-none');
  setChatStatus('Waiting for approval…');
}

function hideHITL() {
  chatPendingHITL = null;
  document.getElementById('chatHITL').classList.add('d-none');
  document.getElementById('chatHITLText').textContent = '';
}

async function sendHITLResponse(approved) {
  if (!chatPendingHITL) return;
  const { opId } = chatPendingHITL;
  hideHITL();
  await fetch('/api/chat/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: chatSessionKey(), opId, approved }),
  });
}

function showCredentialPanel(key) {
  chatPendingCredential = { key };
  document.getElementById('chatCredentialKey').textContent = key;
  document.getElementById('chatCredentialInput').value = '';
  document.getElementById('chatCredentialPanel').classList.remove('d-none');
  setTimeout(() => document.getElementById('chatCredentialInput').focus(), 50);
}

function hideCredentialPanel() {
  chatPendingCredential = null;
  document.getElementById('chatCredentialPanel').classList.add('d-none');
  document.getElementById('chatCredentialInput').value = '';
}

async function submitCredential(skip = false) {
  if (!chatPendingCredential) return;
  const { key } = chatPendingCredential;
  const value = skip ? '' : document.getElementById('chatCredentialInput').value;
  if (!skip && !value) { toast('Please enter a value', 'warning'); return; }
  hideCredentialPanel();
  if (skip) {
    appendBubble('system', `⚠️ Credential <code>${escHtml(key)}</code> skipped — agent will continue without it.`);
    return;
  }
  try {
    const r = await fetch('/api/chat/provide-credential', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: chatSessionKey(), key, value }),
    });
    const d = await r.json();
    if (r.ok) {
      appendBubble('system', `🔑 Credential <code>${escHtml(key)}</code> saved — agent will continue.`);
    } else {
      appendBubble('system', `❌ Failed to submit credential: ${escHtml(d.error || 'Unknown error')}`);
    }
  } catch (e) {
    appendBubble('system', `❌ Failed to submit credential: ${escHtml(e.message)}`);
  }
}

document.getElementById('btnSubmitCredential').addEventListener('click', () => submitCredential(false));
document.getElementById('btnSkipCredential').addEventListener('click', () => submitCredential(true));
document.getElementById('chatCredentialInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); submitCredential(false); }
});

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  appendBubble('user', escHtml(text));
  chatRunning = true;
  input.disabled = true;
  document.getElementById('btnSendChat').disabled = true;
  setChatStatus('Sending…');

  if (!chatSSE || chatSSE.readyState === EventSource.CLOSED) connectChatSSE();

  try {
    await fetch('/api/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: chatSessionKey(), text }),
    });
  } catch (e) {
    toast('Chat error: ' + e.message, 'error');
    chatRunning = false;
    input.disabled = false;
    document.getElementById('btnSendChat').disabled = false;
  }
}

document.getElementById('btnSendChat').addEventListener('click', sendChatMessage);
document.getElementById('chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
});

document.getElementById('btnCancelChat').addEventListener('click', async () => {
  await fetch(`/api/chat/cancel/${chatSessionKey()}`, { method: 'POST' });
});

document.getElementById('btnClearChat').addEventListener('click', async () => {
  if (!confirm('Clear conversation history?')) return;
  chatMessages().innerHTML = '';
  await fetch(`/api/chat/history/${chatSessionKey()}`, { method: 'DELETE' });
  toast('Conversation cleared');
});

document.getElementById('btnApproveHITL').addEventListener('click', () => sendHITLResponse(true));
document.getElementById('btnDenyHITL').addEventListener('click',    () => sendHITLResponse(false));

// ──────────────────────────────────────────────────────────────
// USERS
// ──────────────────────────────────────────────────────────────
async function loadUsers() {
  try {
    const r = await fetch('/api/users');
    if (!r.ok) { toast('Admin required', 'error'); return; }
    renderUsers(await r.json());
  } catch (e) { toast(e.message, 'error'); }
}

function renderUsers(users) {
  document.getElementById('usersTable').innerHTML = users.map(u =>
    `<tr>
      <td><i class="bi bi-person-circle me-2 text-muted"></i>${escHtml(u.username)}</td>
      <td><span class="badge badge-role-${u.role} px-2 py-1">${u.role}</span></td>
      <td class="text-muted">${new Date(u.createdAt).toLocaleDateString()}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary me-1" onclick="openChangePw('${escHtml(u.username)}')"><i class="bi bi-key"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteUser('${escHtml(u.username)}')" ${u.username===window._username?'disabled':''}>
          <i class="bi bi-trash"></i></button>
      </td>
    </tr>`
  ).join('');
}

document.getElementById('btnAddUser').addEventListener('click', () => {
  ['newUsername','newPassword'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('newRole').value = 'admin';
  new bootstrap.Modal('#addUserModal').show();
});

document.getElementById('btnConfirmAddUser').addEventListener('click', async () => {
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;
  const role     = document.getElementById('newRole').value;
  if (!username || !password) { toast('All fields required', 'error'); return; }
  const r = await fetch('/api/users', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username, password, role }) });
  const d = await r.json();
  if (r.ok) { bootstrap.Modal.getInstance('#addUserModal').hide(); toast(`User "${username}" created`); loadUsers(); }
  else toast(d.error || 'Failed', 'error');
});

function openChangePw(username) {
  document.getElementById('changePwUser').textContent = username;
  document.getElementById('changePwValue').value = '';
  document.getElementById('btnConfirmChangePw').onclick = async () => {
    const pw = document.getElementById('changePwValue').value;
    if (!pw) { toast('Enter a password', 'error'); return; }
    const r = await fetch(`/api/users/${encodeURIComponent(username)}/password`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password: pw }) });
    const d = await r.json();
    if (r.ok) { bootstrap.Modal.getInstance('#changePwModal').hide(); toast('Password changed'); }
    else toast(d.error || 'Failed', 'error');
  };
  new bootstrap.Modal('#changePwModal').show();
}

async function deleteUser(username) {
  if (!confirm(`Delete user "${username}"?`)) return;
  const r = await fetch(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
  const d = await r.json();
  if (r.ok) { toast(`User "${username}" deleted`); loadUsers(); }
  else toast(d.error || 'Failed', 'error');
}

// ── Initial load ──────────────────────────────────────────────
loadStatus();
loadSettings();
