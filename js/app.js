// SureFix Lite — dashboard application (hash router + views). No build step.
(() => {
  const { $, esc, label, badge, fmtDate, fmtTime, rel, duration, bytes, shortId, toast, fail, modal, confirm, openDrawer, closeDrawer, field, input, select, textarea } = ui;

  const BUG_STATUSES = ['NEEDS_INFO', 'AWAITING_APPROVAL', 'FIXING', 'FIXED', 'CLOSED'];
  const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const RUN_TYPES = ['DETECT', 'REPRODUCE', 'FIX'];
  const RUN_STATUSES = ['QUEUED', 'RUNNING', 'CONFIRMED', 'COMPLETED', 'FAILED'];
  // mirrors BugService.TRANSITIONS on the server
  const BUG_NEXT = {
    NEEDS_INFO: ['AWAITING_APPROVAL', 'FIXING', 'FIXED', 'CLOSED'], AWAITING_APPROVAL: ['NEEDS_INFO', 'FIXING', 'FIXED', 'CLOSED'],
    FIXING: ['NEEDS_INFO', 'AWAITING_APPROVAL', 'FIXED', 'CLOSED'], FIXED: ['NEEDS_INFO', 'CLOSED'], CLOSED: ['NEEDS_INFO'],
  };
  const state = { filters: { q: '', status: '', severity: '' }, evidenceRun: '' };

  // ---------- router ----------
  const routes = { dashboard: renderDashboard, bugs: renderBugs, runs: renderRuns, evidence: renderEvidence };
  const TITLES = { dashboard: 'Dashboard', bugs: 'Bugs', runs: 'Pipeline runs', evidence: 'Evidence' };
  async function navigate() {
    const [route, param] = location.hash.replace(/^#\/?/, '').split('/');
    const name = routes[route] ? route : 'dashboard';
    document.querySelectorAll('.nav a[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === name));
    $('#page-title').textContent = TITLES[name];
    $('#sidebar').classList.remove('open');
    const view = $('#view');
    view.innerHTML = skeleton();
    try { await routes[name](view, param); } catch (e) { view.innerHTML = errorBox(e); }
  }
  window.addEventListener('hashchange', navigate);
  $('#menu-btn').onclick = () => $('#sidebar').classList.toggle('open');
  $('#new-bug-btn').onclick = () => newBug();
  document.addEventListener('drawer:closed', () => { if (location.hash.includes('/bugs/') || location.hash.includes('/runs/')) history.replaceState(null, '', '#/' + location.hash.split('/')[1]); });

  const skeleton = () => `<div class="card"><div class="card-body" style="display:grid;gap:12px"><div class="skeleton" style="width:40%"></div><div class="skeleton"></div><div class="skeleton" style="width:70%"></div></div></div>`;
  const errorBox = (e) => `<div class="card"><div class="empty"><div class="big">⚠︎</div><b>Could not load this page</b><span>${esc(e.message)}</span><button class="btn" onclick="location.reload()">Retry</button></div></div>`;
  const emptyBox = (icon, title, text, action = '') => `<div class="empty"><div class="big">${icon}</div><b>${esc(title)}</b><span>${esc(text)}</span>${action}</div>`;

  // ---------- gateway health ----------
  async function pollHealth() {
    const up = await api.health();
    const pill = $('#gateway-pill');
    pill.classList.toggle('up', up); pill.classList.toggle('down', !up);
    pill.title = up ? 'API Gateway healthy (via external load balancer)' : 'API Gateway unreachable';
  }
  pollHealth(); setInterval(pollHealth, 30000);

  // ---------- dashboard ----------
  async function renderDashboard(view) {
    const [bugStats, runStats, bugs, runs] = await Promise.all([api.bugs.stats(), api.runs.stats(), api.bugs.list(), api.runs.list()]);
    const max = (o) => Math.max(1, ...Object.values(o));
    const bars = (obj, cls) => `<div class="bars">${Object.entries(obj).map(([k, v]) => `<div class="bar"><span>${badge(cls, k)}</span><div class="track"><div class="fill" style="width:${(v / max(obj)) * 100}%"></div></div><span class="n">${v}</span></div>`).join('')}</div>`;
    view.innerHTML = `
      <div class="grid-4">
        <div class="card stat"><span class="label">Bugs</span><span class="value">${bugStats.total}</span><span class="sub">${bugStats.open} open · ${bugStats.byStatus.FIXED} fixed · ${bugStats.byStatus.CLOSED} closed</span></div>
        <div class="card stat"><span class="label">Awaiting approval</span><span class="value warn">${bugStats.byStatus.AWAITING_APPROVAL}</span><span class="sub">reproduced, waiting for a fix run</span></div>
        <div class="card stat"><span class="label">Pipeline runs</span><span class="value">${runStats.total}</span><span class="sub">${runStats.active} active · ${runStats.byStatus.FAILED} failed</span></div>
        <div class="card stat"><span class="label">Fixes landed</span><span class="value ok">${runStats.byType.FIX ? runStats.byStatus.COMPLETED : 0}</span><span class="sub">completed runs · ${bugStats.byStatus.FIXING} fixing now</span></div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h2>Bugs by severity</h2><span class="muted">PostgreSQL · Cloud SQL</span></div><div class="card-body">${bars(bugStats.bySeverity, 'sev')}</div></div>
        <div class="card"><div class="card-head"><h2>Runs by status</h2><span class="muted">MongoDB API · Firestore</span></div><div class="card-body">${bars(runStats.byStatus, 'st')}</div></div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h2>Recent bugs</h2><a href="#/bugs">View all →</a></div><div class="card-body flush list">
          ${bugs.slice(0, 6).map(b => `<div class="list-item" data-bug="${b.id}"><div class="grow"><div class="t">#${b.id} ${esc(b.title)}</div><div class="s">${esc(b.targetRepo || 'no repo')} · ${rel(b.createdAt)}</div></div>${badge('sev', b.severity)}${badge('st', b.status)}</div>`).join('') || emptyBox('✱', 'No bugs yet', 'Create the first bug to start the pipeline.')}
        </div></div>
        <div class="card"><div class="card-head"><h2>Recent runs</h2><a href="#/runs">View all →</a></div><div class="card-body flush list">
          ${runs.slice(0, 6).map(r => `<div class="list-item" data-run="${r.id}"><div class="grow"><div class="t">${badge('type', r.type)} bug #${r.bugId}</div><div class="s">${esc(r.agent || '')} · ${rel(r.createdAt)} · ${duration(r.durationMs)}</div></div>${badge('st', r.status)}</div>`).join('') || emptyBox('▶', 'No runs yet', 'Start a run from a bug.')}
        </div></div>
      </div>`;
    view.querySelectorAll('[data-bug]').forEach(el => el.onclick = () => openBug(el.dataset.bug));
    view.querySelectorAll('[data-run]').forEach(el => el.onclick = () => openRun(el.dataset.run));
  }

  // ---------- bugs ----------
  async function renderBugs(view, param) {
    const f = state.filters;
    view.innerHTML = `
      <div class="card">
        <div class="card-head"><div class="toolbar" style="flex:1">
          <input class="input search" id="q" placeholder="Search title or description…" value="${esc(f.q)}">
          <select class="select" id="f-status"><option value="">All statuses</option>${BUG_STATUSES.map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select>
          <select class="select" id="f-severity"><option value="">All severities</option>${SEVERITIES.map(s => `<option value="${s}" ${f.severity === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select>
          <span class="spacer"></span><span class="muted" id="count"></span>
        </div></div>
        <div class="card-body flush" id="bug-table"></div>
      </div>`;
    const load = async () => {
      const bugs = await api.bugs.list({ q: f.q, status: f.status, severity: f.severity });
      $('#count').textContent = `${bugs.length} bug${bugs.length === 1 ? '' : 's'}`;
      $('#bug-table').innerHTML = bugs.length ? `<table><thead><tr><th>ID</th><th>Bug</th><th>Severity</th><th>Status</th><th>Repo</th><th>Reporter</th><th>Updated</th></tr></thead><tbody>
        ${bugs.map(b => `<tr class="row" data-bug="${b.id}"><td class="num">#${b.id}</td><td><div class="title">${esc(b.title)}</div><div class="sub">${b.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}${esc((b.description || '').slice(0, 90))}</div></td><td>${badge('sev', b.severity)}</td><td>${badge('st', b.status)}</td><td class="mono">${esc(b.targetRepo || '—')}</td><td>${esc(b.reporter || '—')}</td><td class="num">${rel(b.updatedAt)}</td></tr>`).join('')}
        </tbody></table>` : emptyBox('✱', 'No bugs match', 'Try another search or create a new bug.', `<button class="btn btn-primary" id="empty-new">＋ New bug</button>`);
      view.querySelectorAll('[data-bug]').forEach(el => el.onclick = () => openBug(el.dataset.bug));
      const en = $('#empty-new'); if (en) en.onclick = newBug;
    };
    let t; $('#q').oninput = (e) => { f.q = e.target.value; clearTimeout(t); t = setTimeout(load, 250); };
    $('#f-status').onchange = (e) => { f.status = e.target.value; load(); };
    $('#f-severity').onchange = (e) => { f.severity = e.target.value; load(); };
    await load();
    if (param) openBug(param);
  }

  function bugForm(b = {}) {
    return `<div class="form-grid">
      ${field('title', 'Title', input('title', { value: b.title, placeholder: 'Short, specific summary', required: true, maxlength: 200 })).replace('class="field"', 'class="field full"')}
      ${field('description', 'Description', textarea('description', { value: b.description, placeholder: 'Steps to reproduce, expected vs actual…' })).replace('class="field"', 'class="field full"')}
      ${field('severity', 'Severity', select('severity', SEVERITIES, b.severity || 'MEDIUM'))}
      ${field('targetRepo', 'Target repository', input('targetRepo', { value: b.targetRepo, placeholder: 'org/repo' }))}
      ${field('reporter', 'Reporter', input('reporter', { value: b.reporter, placeholder: 'who found it' }))}
      ${field('assignee', 'Assignee', input('assignee', { value: b.assignee, placeholder: 'who owns the fix' }))}
      ${field('tags', 'Tags', input('tags', { value: (b.tags || []).join(', '), placeholder: 'ui, safari, checkout' }), 'comma separated').replace('class="field"', 'class="field full"')}
    </div>`;
  }
  const bugPayload = (v) => ({ ...v, tags: v.tags ? v.tags.split(',').map(s => s.trim()).filter(Boolean) : [] });

  async function newBug() {
    const created = await modal({ title: 'New bug', subtitle: 'Stored in PostgreSQL through bug-service', body: bugForm(), okText: 'Create bug',
      onSubmit: async (v) => { const b = await api.bugs.create(bugPayload(v)); toast(`Bug #${b.id} created`, 'ok'); return b; } });
    if (created) { location.hash = `#/bugs/${created.id}`; navigate(); }
  }

  async function openBug(id) {
    history.replaceState(null, '', `#/bugs/${id}`);
    const d = openDrawer(`<div class="drawer-head"><div style="flex:1"><h2>Loading…</h2></div><button class="icon-btn" data-close aria-label="Close">✕</button></div><div class="drawer-body">${skeleton()}</div>`);
    let bug, runs;
    try { [bug, runs] = await Promise.all([api.bugs.get(id), api.runs.list({ bugId: id })]); } catch (e) { d.querySelector('.drawer-body').innerHTML = errorBox(e); return; }
    d.innerHTML = `
      <div class="drawer-head"><div style="flex:1"><h2>#${bug.id} ${esc(bug.title)}</h2><div class="meta">${esc(bug.targetRepo || 'no repository')} · reported ${fmtDate(bug.createdAt)}${bug.reporter ? ` by ${esc(bug.reporter)}` : ''}</div></div><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="drawer-body">
        <div class="actions">${badge('sev', bug.severity)} ${badge('st', bug.status)}<span class="spacer" style="flex:1"></span>
          <button class="btn btn-sm" id="edit">Edit</button><button class="btn btn-sm btn-danger" id="del">Delete</button></div>
        ${bug.description ? `<p style="margin:0;white-space:pre-wrap">${esc(bug.description)}</p>` : ''}
        <div><h3>Details</h3><dl class="dl"><dt>Assignee</dt><dd>${esc(bug.assignee || '—')}</dd><dt>Tags</dt><dd>${bug.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('') || '—'}</dd><dt>Updated</dt><dd>${fmtDate(bug.updatedAt)}</dd></dl></div>
        <div><h3>Move to</h3><div class="actions">${BUG_NEXT[bug.status].map(s => `<button class="btn btn-sm" data-status="${s}">${label(s)}</button>`).join('')}</div></div>
        <div><div class="toolbar" style="margin-bottom:10px"><h3 style="margin:0">Pipeline runs (${runs.length})</h3><span class="spacer"></span><button class="btn btn-sm btn-primary" id="start-run">▶ Start run</button></div>
          <div class="timeline">${runs.map(runCard).join('') || `<div class="muted">No runs yet — start a Detect, Reproduce or Fix run.</div>`}</div></div>
      </div>`;
    d.querySelectorAll('[data-close]').forEach(b => b.onclick = closeDrawer);
    d.querySelectorAll('[data-status]').forEach(b => b.onclick = async () => { try { await api.bugs.setStatus(bug.id, b.dataset.status); toast(`Bug #${bug.id} → ${label(b.dataset.status)}`, 'ok'); openBug(bug.id); refresh(); } catch (e) { fail(e); } });
    d.querySelector('#edit').onclick = async () => { const ok = await modal({ title: `Edit bug #${bug.id}`, body: bugForm(bug), onSubmit: (v) => api.bugs.update(bug.id, bugPayload(v)) }); if (ok) { toast('Bug updated', 'ok'); openBug(bug.id); refresh(); } };
    d.querySelector('#del').onclick = async () => { if (await confirm(`Delete bug #${bug.id}?`, 'Runs and evidence referencing it will remain but become orphaned.')) { try { await api.bugs.remove(bug.id); toast('Bug deleted'); closeDrawer(); refresh(); } catch (e) { fail(e); } } };
    d.querySelector('#start-run').onclick = () => startRun(bug, () => openBug(bug.id));
    bindRunCards(d, () => openBug(bug.id));
  }

  // ---------- runs ----------
  function runCard(r) {
    return `<div class="run-card" data-run-card="${r.id}">
      <div class="rh">${badge('type', r.type)}${badge('st', r.status)}<span class="mono muted">${shortId(r.id)}</span><span class="grow"></span><span class="muted">${esc(r.agent || '')}</span><span class="num">${duration(r.durationMs)}</span></div>
      ${r.summary ? `<div>${esc(r.summary)}</div>` : ''}
      ${r.suspectedFiles?.length ? `<div class="muted">Suspected: ${r.suspectedFiles.map(f => `<code>${esc(f)}</code>`).join(' ')}</div>` : ''}
      <div class="actions">${runActions(r)}<button class="btn btn-sm btn-ghost" data-open-run="${r.id}">Details →</button></div>
    </div>`;
  }
  function runActions(r) {
    const b = (s, text, cls = '') => `<button class="btn btn-sm ${cls}" data-run-status="${s}" data-run-id="${r.id}">${text}</button>`;
    if (r.status === 'QUEUED') return b('RUNNING', '▶ Start', 'btn-primary') + b('FAILED', 'Fail', 'btn-danger');
    if (r.status === 'RUNNING') return (r.type === 'REPRODUCE' ? b('CONFIRMED', '✓ Confirm', 'btn-ok') : b('COMPLETED', '✓ Complete', 'btn-ok')) + b('FAILED', 'Fail', 'btn-danger');
    return '';
  }
  function bindRunCards(root, after) {
    root.querySelectorAll('[data-run-status]').forEach(b => b.onclick = () => transitionRun(b.dataset.runId, b.dataset.runStatus, after));
    root.querySelectorAll('[data-open-run]').forEach(b => b.onclick = () => openRun(b.dataset.openRun));
  }
  async function transitionRun(id, status, after) {
    const terminal = ['CONFIRMED', 'COMPLETED', 'FAILED'].includes(status);
    if (!terminal) { try { await api.runs.setStatus(id, status); toast(`Run ${label(status).toLowerCase()}`, 'ok'); after(); refresh(); } catch (e) { fail(e); } return; }
    const ok = await modal({ title: `${label(status)} run`, subtitle: status === 'CONFIRMED' ? 'The bug moves to Awaiting approval.' : status === 'COMPLETED' ? 'A completed Fix run marks the bug as Fixed.' : 'Mark this run as failed.',
      body: field('summary', 'Summary', textarea('summary', { placeholder: 'What did the agent find / change?' })), okText: label(status), okClass: status === 'FAILED' ? 'btn-danger' : 'btn-primary',
      onSubmit: (v) => api.runs.setStatus(id, status, v.summary) });
    if (ok) { toast(`Run ${label(status).toLowerCase()}`, 'ok'); after(); refresh(); }
  }
  async function startRun(bug, after) {
    const created = await modal({ title: `Start run for #${bug.id}`, subtitle: 'run-service validates the bug through Eureka and stores the run in Firestore (MongoDB API)',
      body: `<div class="form-grid">${field('type', 'Run type', select('type', RUN_TYPES, bug.status === 'AWAITING_APPROVAL' ? 'FIX' : 'REPRODUCE'))}${field('agent', 'Agent', input('agent', { placeholder: 'defaults per type' }))}${field('suspectedFiles', 'Suspected files', input('suspectedFiles', { placeholder: 'src/cart/total.ts, src/api/coupon.ts' }), 'comma separated').replace('class="field"', 'class="field full"')}</div>`,
      okText: 'Queue run', onSubmit: (v) => api.runs.create({ bugId: bug.id, type: v.type, agent: v.agent, suspectedFiles: v.suspectedFiles ? v.suspectedFiles.split(',').map(s => s.trim()).filter(Boolean) : [] }) });
    if (created) { toast(`${label(created.type)} run queued`, 'ok'); after(); refresh(); }
  }

  async function renderRuns(view, param) {
    view.innerHTML = `<div class="card"><div class="card-head"><div class="toolbar" style="flex:1">
        <select class="select" id="r-type"><option value="">All types</option>${RUN_TYPES.map(t => `<option value="${t}">${label(t)}</option>`).join('')}</select>
        <select class="select" id="r-status"><option value="">All statuses</option>${RUN_STATUSES.map(s => `<option value="${s}">${label(s)}</option>`).join('')}</select>
        <span class="spacer"></span><span class="muted" id="count"></span></div></div><div class="card-body flush" id="run-table"></div></div>`;
    const load = async () => {
      const runs = await api.runs.list({ type: $('#r-type').value, status: $('#r-status').value });
      $('#count').textContent = `${runs.length} run${runs.length === 1 ? '' : 's'}`;
      $('#run-table').innerHTML = runs.length ? `<table><thead><tr><th>Run</th><th>Type</th><th>Bug</th><th>Status</th><th>Agent</th><th>Created</th><th>Duration</th><th></th></tr></thead><tbody>
        ${runs.map(r => `<tr class="row" data-run="${r.id}"><td class="mono">${shortId(r.id)}</td><td>${badge('type', r.type)}</td><td class="num">#${r.bugId}</td><td>${badge('st', r.status)}</td><td>${esc(r.agent || '—')}</td><td class="num">${rel(r.createdAt)}</td><td class="num">${duration(r.durationMs)}</td><td><div class="actions" onclick="event.stopPropagation()">${runActions(r)}</div></td></tr>`).join('')}
        </tbody></table>` : emptyBox('▶', 'No runs', 'Start a run from a bug to see it here.');
      view.querySelectorAll('[data-run]').forEach(el => el.onclick = () => openRun(el.dataset.run));
      bindRunCards(view, load);
    };
    $('#r-type').onchange = load; $('#r-status').onchange = load;
    await load();
    if (param) openRun(param);
  }

  async function openRun(id) {
    const d = openDrawer(`<div class="drawer-head"><div style="flex:1"><h2>Loading…</h2></div><button class="icon-btn" data-close aria-label="Close">✕</button></div><div class="drawer-body">${skeleton()}</div>`);
    let run, bug = null, files = [];
    try { run = await api.runs.get(id); [bug, files] = await Promise.all([api.bugs.get(run.bugId).catch(() => null), api.evidence.list(id).catch(() => [])]); } catch (e) { d.querySelector('.drawer-body').innerHTML = errorBox(e); return; }
    const render = () => {
      d.innerHTML = `
        <div class="drawer-head"><div style="flex:1"><h2>${label(run.type)} run <span class="mono muted">${shortId(run.id)}</span></h2><div class="meta">for ${bug ? `<a href="#" data-bug-link>#${bug.id} ${esc(bug.title)}</a>` : `bug #${run.bugId}`} · ${esc(run.agent || '')} · created ${fmtDate(run.createdAt)}</div></div><button class="icon-btn" data-close aria-label="Close">✕</button></div>
        <div class="drawer-body">
          <div class="actions">${badge('type', run.type)}${badge('st', run.status)}<span style="flex:1"></span>${runActions(run)}<button class="btn btn-sm btn-danger" id="del-run">Delete</button></div>
          <dl class="dl"><dt>Started</dt><dd>${fmtDate(run.startedAt)}</dd><dt>Finished</dt><dd>${fmtDate(run.finishedAt)}</dd><dt>Duration</dt><dd>${duration(run.durationMs)}</dd><dt>Summary</dt><dd>${esc(run.summary || '—')}</dd><dt>Suspected files</dt><dd>${run.suspectedFiles.map(f => `<code>${esc(f)}</code>`).join('<br>') || '—'}</dd></dl>
          <div><h3>Log</h3><div class="logs" id="logs">${run.logs.map(l => `<div><span class="ts">${fmtTime(l.at)}</span><span class="lvl lvl-${esc(l.level)}">${esc(l.level)}</span>${esc(l.message)}</div>`).join('') || '<span class="muted">empty</span>'}</div>
            ${['CONFIRMED', 'COMPLETED', 'FAILED'].includes(run.status) ? '' : `<form class="log-form" id="log-form" style="margin-top:8px"><select class="select" name="level"><option>INFO</option><option>DEBUG</option><option>WARN</option><option>ERROR</option></select><input class="input" name="message" placeholder="Append a log line…" required maxlength="2000"><button class="btn btn-sm">Log</button></form>`}</div>
          <div><div class="toolbar" style="margin-bottom:10px"><h3 style="margin:0">Evidence (${files.length})</h3><span class="spacer"></span><label class="btn btn-sm">⇧ Upload<input type="file" id="ev-file" hidden></label></div>
            <div class="files" id="ev-files">${files.map(fileCard).join('') || '<div class="muted">No files yet — upload a screenshot, trace or log. Stored in the Cloud Storage bucket.</div>'}</div></div>
        </div>`;
      d.querySelectorAll('[data-close]').forEach(b => b.onclick = closeDrawer);
      const bl = d.querySelector('[data-bug-link]'); if (bl) bl.onclick = (e) => { e.preventDefault(); openBug(bug.id); };
      bindRunCards(d, () => openRun(id));
      d.querySelector('#del-run').onclick = async () => { if (await confirm('Delete this run?', 'The run document and its log are removed from Firestore. Evidence files stay in the bucket.')) { try { await api.runs.remove(id); toast('Run deleted'); closeDrawer(); refresh(); } catch (e) { fail(e); } } };
      const lf = d.querySelector('#log-form'); if (lf) lf.onsubmit = async (e) => { e.preventDefault(); try { run = await api.runs.log(id, lf.message.value, lf.level.value); render(); const logs = d.querySelector('#logs'); logs.scrollTop = logs.scrollHeight; } catch (err) { fail(err); } };
      d.querySelector('#ev-file').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { await api.evidence.upload(id, f); toast(`${f.name} uploaded to the bucket`, 'ok'); files = await api.evidence.list(id); render(); } catch (err) { fail(err); } };
      bindFileCards(d, async () => { files = await api.evidence.list(id); render(); });
    };
    render();
  }

  // ---------- evidence ----------
  function fileCard(f) {
    const name = f.originalFilename || f.filename;              // stored object name is a uuid
    const img = (f.contentType || '').startsWith('image/');
    const ext = (name.includes('.') ? name.split('.').pop() : (f.contentType || 'file').split('/').pop()).toUpperCase().slice(0, 5);
    return `<div class="file-card"><a class="thumb" href="${api.evidence.url(f)}" target="_blank" rel="noopener">${img ? `<img src="${api.evidence.url(f)}" alt="${esc(name)}" loading="lazy">` : esc(ext)}</a>
      <div class="fb"><div class="fn" title="stored in the bucket as ${esc(f.filename)}">${esc(name)}</div><div class="muted">${bytes(f.size)} · ${rel(f.uploadedAt)}</div>
      <div class="fa"><a class="btn btn-sm" href="${api.evidence.url(f, true)}">Download</a><button class="btn btn-sm btn-danger" data-del-file='${esc(JSON.stringify({ runId: f.runId, filename: f.filename, name }))}'>Delete</button></div></div></div>`;
  }
  function bindFileCards(root, after) {
    root.querySelectorAll('[data-del-file]').forEach(b => b.onclick = async () => { const f = JSON.parse(b.dataset.delFile); if (await confirm('Delete file?', `${f.name || f.filename} will be removed from the bucket.`)) { try { await api.evidence.remove(f); toast('File deleted'); after(); } catch (e) { fail(e); } } });
  }
  async function renderEvidence(view) {
    const runs = await api.runs.list();
    if (!state.evidenceRun && runs[0]) state.evidenceRun = runs[0].id;
    view.innerHTML = `<div class="card"><div class="card-head"><div class="toolbar" style="flex:1"><label class="muted">Run</label>
        <select class="select" id="ev-run" style="min-width:320px">${runs.map(r => `<option value="${r.id}" ${r.id === state.evidenceRun ? 'selected' : ''}>${label(r.type)} · bug #${r.bugId} · ${shortId(r.id)} · ${label(r.status)}</option>`).join('') || '<option value="">No runs yet</option>'}</select>
        <span class="spacer"></span><span class="muted" id="count"></span></div></div>
      <div class="card-body" style="display:grid;gap:18px"><div class="dropzone" id="drop">Drop files here or <b>click to choose</b> — screenshots, HAR traces, logs (max 20 MB). Files are stored in <code>gs://surefix-eca-evidence/runs/&lt;runId&gt;/</code><input type="file" id="drop-input" hidden multiple></div><div class="files" id="ev-files"></div></div></div>`;
    const load = async () => {
      const runId = $('#ev-run').value; state.evidenceRun = runId;
      if (!runId) { $('#ev-files').innerHTML = emptyBox('▤', 'No runs', 'Create a run first, then attach evidence to it.'); return; }
      const files = await api.evidence.list(runId);
      $('#count').textContent = `${files.length} file${files.length === 1 ? '' : 's'}`;
      $('#ev-files').innerHTML = files.map(fileCard).join('') || emptyBox('▤', 'No evidence for this run', 'Upload the first file.');
      bindFileCards(view, load);
    };
    const upload = async (list) => { for (const f of list) { try { await api.evidence.upload($('#ev-run').value, f); toast(`${f.name} uploaded`, 'ok'); } catch (e) { fail(e); } } load(); };
    const drop = $('#drop');
    drop.onclick = () => $('#drop-input').click();
    $('#drop-input').onchange = (e) => upload([...e.target.files]);
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => upload([...e.dataTransfer.files]));
    $('#ev-run').onchange = load;
    await load();
  }

  // re-render the current page (after mutations) without touching the drawer
  function refresh() { const [route, param] = location.hash.replace(/^#\/?/, '').split('/'); if (routes[route] && !param) navigate(); else if (routes[route]) routes[route]($('#view')); }

  navigate();
})();
