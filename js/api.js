// Thin client for the SureFix APIs. Every call goes to /api/v1/** which nginx proxies to the
// Spring Cloud API Gateway on GCP; the gateway routes to bug-service, run-service and evidence-service.
window.api = (() => {
  const BASE = '/api/v1';

  class ApiError extends Error {
    constructor(status, body, path) {
      super(body?.message || `${status} ${body?.error || 'Request failed'}`);
      this.status = status;
      this.fieldErrors = body?.fieldErrors || null;
      this.path = path;
    }
  }

  async function request(path, { method = 'GET', body, form } = {}) {
    const headers = {};
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers, body: payload });
    if (res.status === 204) return null;
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
    if (!res.ok) throw new ApiError(res.status, data, path);
    return data;
  }

  const qs = (params) => {
    const clean = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
    return clean.length ? '?' + new URLSearchParams(clean).toString() : '';
  };

  return {
    ApiError,
    health: () => fetch('/api/actuator/health', { cache: 'no-store' }).then(r => r.ok).catch(() => false),
    bugs: {
      list: (filters) => request('/bugs' + qs(filters)),
      get: (id) => request(`/bugs/${id}`),
      stats: () => request('/bugs/stats'),
      create: (data) => request('/bugs', { method: 'POST', body: data }),
      update: (id, data) => request(`/bugs/${id}`, { method: 'PUT', body: data }),
      setStatus: (id, status) => request(`/bugs/${id}/status`, { method: 'PATCH', body: { status } }),
      remove: (id) => request(`/bugs/${id}`, { method: 'DELETE' }),
    },
    runs: {
      list: (filters) => request('/runs' + qs(filters)),
      get: (id) => request(`/runs/${id}`),
      stats: () => request('/runs/stats'),
      create: (data) => request('/runs', { method: 'POST', body: data }),
      log: (id, message, level = 'INFO') => request(`/runs/${id}/logs`, { method: 'POST', body: { level, message } }),
      setStatus: (id, status, summary) => request(`/runs/${id}/status`, { method: 'PATCH', body: { status, summary } }),
      remove: (id) => request(`/runs/${id}`, { method: 'DELETE' }),
    },
    evidence: {
      list: (runId) => request('/evidence' + qs({ runId })),
      upload: (runId, file) => { const f = new FormData(); f.append('runId', runId); f.append('file', file); return request('/evidence', { method: 'POST', form: f }); },
      url: (f, download) => `${BASE}${f.url}${download ? '?download=true' : ''}`,
      remove: (f) => request(`/evidence/${f.runId}/${f.filename}`, { method: 'DELETE' }),
    },
  };
})();
