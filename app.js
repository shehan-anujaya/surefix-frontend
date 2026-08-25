// SureFix Lite frontend. Every call goes to /api/** which nginx proxies to the API Gateway on GCP.
const $ = (s) => document.querySelector(s);
const status = (msg, ok = true) => { const el = $('#status'); el.textContent = msg; el.className = ok ? 'ok' : 'err'; };

async function api(path, opts = {}) {
  const res = await fetch('/api/v1' + path, opts);
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).message || detail; } catch {}
    status(`${opts.method || 'GET'} ${path} → ${res.status} ${detail}`, false);
    throw new Error(detail);
  }
  status(`${opts.method || 'GET'} ${path} → ${res.status}`);
  return res.status === 204 ? null : res.json();
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const BUG_STATUSES = ['NEEDS_INFO', 'AWAITING_APPROVAL', 'FIXING', 'FIXED', 'CLOSED'];
const RUN_STATUSES = ['QUEUED', 'RUNNING', 'CONFIRMED', 'COMPLETED', 'FAILED'];
let bugs = [], runs = [];

// ---- bugs ----
async function loadBugs() {
  bugs = await api('/bugs');
  $('#bug-table tbody').innerHTML = bugs.map(b => `
    <tr>
      <td>${b.id}</td><td>${esc(b.title)}</td><td>${b.severity}</td>
      <td><select data-bug="${b.id}" class="bug-status">${BUG_STATUSES.map(s => `<option ${s === b.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td>${esc(b.targetRepo || '')}</td>
      <td><button data-del-bug="${b.id}">delete</button></td>
    </tr>`).join('');
  $('#run-bug').innerHTML = bugs.map(b => `<option value="${b.id}">#${b.id} ${esc(b.title)}</option>`).join('');
  await loadRuns();
}
$('#bug-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  await api('/bugs', json('POST', f));
  e.target.reset();
  loadBugs();
});
$('#bug-table').addEventListener('change', async (e) => {
  if (e.target.matches('.bug-status')) {
    await api(`/bugs/${e.target.dataset.bug}/status`, json('PATCH', { status: e.target.value }));
  }
});
$('#bug-table').addEventListener('click', async (e) => {
  if (e.target.dataset.delBug) { await api(`/bugs/${e.target.dataset.delBug}`, { method: 'DELETE' }); loadBugs(); }
});

// ---- runs ----
async function loadRuns() {
  runs = await api('/runs');
  $('#run-list').innerHTML = runs.map(r => `
    <article class="run">
      <header><b>${r.type}</b> for bug #${r.bugId} · <code>${r.id}</code>
        <select data-run="${r.id}" class="run-status">${RUN_STATUSES.map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <button data-del-run="${r.id}">delete</button>
      </header>
      ${r.suspectedFiles?.length ? `<p>Suspected files: ${r.suspectedFiles.map(esc).join(', ')}</p>` : ''}
      <pre>${r.logs.map(esc).join('\n')}</pre>
      <form class="log-form" data-run="${r.id}"><input name="line" placeholder="Append log line" required><button>Log</button></form>
    </article>`).join('') || '<p class="muted">No runs yet.</p>';
  $('#evidence-run').innerHTML = runs.map(r => `<option value="${r.id}">${r.type} · bug #${r.bugId} · ${r.id.slice(-6)}</option>`).join('');
  await loadEvidence();
}
$('#run-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const body = { bugId: Number(f.bugId), type: f.type, suspectedFiles: f.suspectedFiles ? f.suspectedFiles.split(',').map(s => s.trim()).filter(Boolean) : [] };
  await api('/runs', json('POST', body));
  e.target.reset();
  loadRuns();
});
$('#run-list').addEventListener('change', async (e) => {
  if (e.target.matches('.run-status')) {
    await api(`/runs/${e.target.dataset.run}/status`, json('PATCH', { status: e.target.value }));
    loadBugs(); // run-service may have updated the bug's status through bug-service
  }
});
$('#run-list').addEventListener('submit', async (e) => {
  if (e.target.matches('.log-form')) {
    e.preventDefault();
    await api(`/runs/${e.target.dataset.run}/logs`, json('POST', { line: e.target.line.value }));
    loadRuns();
  }
});
$('#run-list').addEventListener('click', async (e) => {
  if (e.target.dataset.delRun) { await api(`/runs/${e.target.dataset.delRun}`, { method: 'DELETE' }); loadRuns(); }
});

// ---- evidence ----
async function loadEvidence() {
  const runId = $('#evidence-run').value;
  if (!runId) { $('#evidence-list').innerHTML = '<p class="muted">Create a run first.</p>'; return; }
  const files = await api(`/evidence?runId=${encodeURIComponent(runId)}`);
  $('#evidence-list').innerHTML = files.map(f => `
    <div class="file">
      ${f.contentType?.startsWith('image/') ? `<img src="/api/v1${f.url}" alt="">` : ''}
      <a href="/api/v1${f.url}" target="_blank">${esc(f.filename)}</a> <span class="muted">${f.contentType} · ${f.size} B</span>
      <button data-del-file="${f.runId}/${f.filename}">delete</button>
    </div>`).join('') || '<p class="muted">No evidence uploaded for this run.</p>';
}
$('#evidence-run').addEventListener('change', loadEvidence);
$('#evidence-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await api('/evidence', { method: 'POST', body: fd });
  e.target.file.value = '';
  loadEvidence();
});
$('#evidence-list').addEventListener('click', async (e) => {
  if (e.target.dataset.delFile) { await api(`/evidence/${e.target.dataset.delFile}`, { method: 'DELETE' }); loadEvidence(); }
});

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
loadBugs().catch(() => {});
