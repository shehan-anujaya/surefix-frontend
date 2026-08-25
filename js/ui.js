// Small UI toolkit: escaping, badges, dates, toasts, modal and drawer.
window.ui = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const LABEL = {
    NEEDS_INFO: 'Needs info', AWAITING_APPROVAL: 'Awaiting approval', FIXING: 'Fixing', FIXED: 'Fixed', CLOSED: 'Closed',
    QUEUED: 'Queued', RUNNING: 'Running', CONFIRMED: 'Confirmed', COMPLETED: 'Completed', FAILED: 'Failed',
    LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical', DETECT: 'Detect', REPRODUCE: 'Reproduce', FIX: 'Fix',
  };
  const label = (v) => LABEL[v] || v;
  const badge = (kind, v) => `<span class="badge ${kind}-${esc(v)}">${esc(label(v))}</span>`;

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString(undefined, { hour12: false }) : '';
  const rel = (iso) => {
    if (!iso) return '—';
    const s = Math.round((Date.now() - new Date(iso)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return `${Math.floor(s / 86400)} d ago`;
  };
  const duration = (ms) => ms == null ? '—' : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
  const bytes = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const shortId = (id) => id ? id.slice(-6) : '';

  function toast(message, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), type === 'err' ? 6000 : 3200);
  }
  const fail = (e) => { console.error(e); toast(e?.message || 'Something went wrong', 'err'); };

  // ---- modal ----
  let modalResolve = null;
  function modal({ title, subtitle, body, okText = 'Save', okClass = 'btn-primary', cancelText = 'Cancel', onSubmit }) {
    const root = $('#modal-root');
    root.innerHTML = `
      <form class="modal" id="modal-form" novalidate>
        <div class="modal-head"><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot">
          <button type="button" class="btn" data-cancel>${esc(cancelText)}</button>
          <button type="submit" class="btn ${okClass}" data-ok>${esc(okText)}</button>
        </div>
      </form>`;
    root.classList.add('show');
    const form = $('#modal-form');
    const first = form.querySelector('input, select, textarea');
    if (first) setTimeout(() => first.focus(), 30);
    return new Promise((resolve) => {
      modalResolve = resolve;
      form.querySelector('[data-cancel]').onclick = () => closeModal(false);
      form.onsubmit = async (e) => {
        e.preventDefault();
        form.querySelectorAll('.err').forEach(el => el.remove());
        const ok = form.querySelector('[data-ok]');
        ok.disabled = true;
        try {
          const result = await onSubmit(Object.fromEntries(new FormData(form)), form);
          closeModal(result ?? true);
        } catch (err) {
          ok.disabled = false;
          if (err?.fieldErrors) {
            Object.entries(err.fieldErrors).forEach(([field, msg]) => {
              const input = form.querySelector(`[name="${field}"]`);
              const holder = input?.closest('.field') || form.querySelector('.modal-body');
              holder.insertAdjacentHTML('beforeend', `<div class="err">${esc(msg)}</div>`);
            });
          }
          fail(err);
        }
      };
    });
  }
  function closeModal(result) {
    $('#modal-root').classList.remove('show');
    $('#modal-root').innerHTML = '';
    if (modalResolve) { modalResolve(result); modalResolve = null; }
  }
  const confirm = (title, text, okText = 'Delete') =>
    modal({ title, body: `<p class="muted" style="margin:0">${esc(text)}</p>`, okText, okClass: 'btn-danger', onSubmit: async () => true });

  // ---- drawer ----
  function openDrawer(html) {
    const d = $('#drawer');
    d.innerHTML = html;
    d.classList.add('show');
    d.setAttribute('aria-hidden', 'false');
    $('#scrim').classList.add('show');
    d.querySelectorAll('[data-close]').forEach(b => b.onclick = closeDrawer);
    return d;
  }
  function closeDrawer() {
    const d = $('#drawer');
    d.classList.remove('show');
    d.setAttribute('aria-hidden', 'true');
    $('#scrim').classList.remove('show');
    document.dispatchEvent(new CustomEvent('drawer:closed'));
  }
  $('#scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if ($('#modal-root').classList.contains('show')) closeModal(false); else closeDrawer(); } });

  const field = (name, labelText, control, hint) => `<div class="field"><label for="f-${name}">${esc(labelText)}</label>${control}${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</div>`;
  const input = (name, { value = '', placeholder = '', type = 'text', required = false, maxlength } = {}) =>
    `<input class="input" id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''} ${maxlength ? `maxlength="${maxlength}"` : ''}>`;
  const select = (name, options, value) => `<select class="select" id="f-${name}" name="${name}">${options.map(o => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(label(o))}</option>`).join('')}</select>`;
  const textarea = (name, { value = '', placeholder = '', rows = 3 } = {}) => `<textarea class="input" id="f-${name}" name="${name}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;

  return { $, esc, label, badge, fmtDate, fmtTime, rel, duration, bytes, shortId, toast, fail, modal, closeModal, confirm, openDrawer, closeDrawer, field, input, select, textarea };
})();
