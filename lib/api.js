/**
 * frontend/lib/api.js
 * Central API client — every backend call goes through here.
 * Features: auto-timeout (30s), 1 retry on network fail, typed errors,
 * loading state hooks (window.onApiStart / window.onApiEnd).
 */
(function () {
  'use strict';

  function getBase() {
    var url = (window.ENV && window.ENV.API_URL) || 'http://localhost:3001/api';
    if (!url.endsWith('/api')) url = url.replace(/\/$/, '') + '/api';
    return url;
  }

  // Typed error
  function ApiError(message, status, code) {
    this.message = message; this.status = status || 0; this.code = code || 'API_ERROR';
    this.name = 'ApiError';
  }
  ApiError.prototype = Object.create(Error.prototype);

  var FRIENDLY = {
    0:   'Cannot reach the server. Check your internet connection.',
    401: 'Your session expired. Please sign in again.',
    403: 'You do not have permission to do that.',
    404: 'Resource not found.',
    413: 'File too large. Max 20 MB.',
    429: 'Too many requests — please wait a moment.',
    500: 'Server error. Please try again shortly.',
    503: 'Server temporarily unavailable.',
  };

  function friendly(status, raw) {
    return FRIENDLY[status] || raw || ('Error ' + status);
  }

  function fetchTimeout(url, opts, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () {
        reject(new ApiError('Request timed out after ' + (ms / 1000) + 's.', 0, 'TIMEOUT'));
      }, ms);
      fetch(url, opts).then(function (r) { clearTimeout(t); resolve(r); })
        .catch(function (e) {
          clearTimeout(t);
          reject(new ApiError(
            'Cannot reach the server (' + e.message + '). Is the backend running?',
            0, 'NETWORK_ERROR'
          ));
        });
    });
  }

  function ApiClient() { this._token = null; this._inflight = 0; }

  ApiClient.prototype.setToken   = function (t) { this._token = t; };
  ApiClient.prototype.clearToken = function ()  { this._token = null; };

  ApiClient.prototype._notify = function (d) {
    this._inflight = Math.max(0, this._inflight + d);
    try {
      if (d > 0 && window.onApiStart) window.onApiStart();
      if (this._inflight === 0 && window.onApiEnd) window.onApiEnd();
    } catch (_) {}
  };

  ApiClient.prototype._request = function (method, path, body, isFormData, attempt) {
    var self = this; attempt = attempt || 1;
    var url  = getBase() + path;
    var hdrs = {};
    if (self._token) hdrs['Authorization'] = 'Bearer ' + self._token;
    if (!isFormData) hdrs['Content-Type']  = 'application/json';
    var opts = { method: method, headers: hdrs };
    if (body) opts.body = isFormData ? body : JSON.stringify(body);
    self._notify(+1);
    var ms = path.indexOf('/reports/') !== -1 ? 60000 : 30000;

    return fetchTimeout(url, opts, ms)
      .then(function (res) {
        self._notify(-1);
        var ct = res.headers.get('Content-Type') || '';
        if (ct.indexOf('application/pdf') !== -1) return res.blob();
        return res.json().then(function (data) {
          if (!res.ok) throw new ApiError(friendly(res.status, data && data.error), res.status, 'HTTP_' + res.status);
          return data;
        }).catch(function (e) {
          if (e instanceof ApiError) throw e;
          throw new ApiError('Unreadable server response.', res.status, 'PARSE_ERROR');
        });
      })
      .catch(function (err) {
        self._notify(-1);
        // One retry on pure network failure
        if (attempt === 1 && err.code === 'NETWORK_ERROR') {
          console.warn('[API] Network error — retrying in 2s…', path);
          return new Promise(function (ok) { setTimeout(ok, 2000); })
            .then(function () { return self._request(method, path, body, isFormData, 2); });
        }
        // Force logout on 401
        if (err.status === 401 && window.authClient) {
          console.warn('[API] 401 — clearing session');
          window.authClient.signOut();
        }
        throw err;
      });
  };

  ApiClient.prototype.get    = function (p)     { return this._request('GET',    p); };
  ApiClient.prototype.post   = function (p, b)  { return this._request('POST',   p, b); };
  ApiClient.prototype.put    = function (p, b)  { return this._request('PUT',    p, b); };
  ApiClient.prototype.del    = function (p)     { return this._request('DELETE', p); };
  ApiClient.prototype.upload = function (p, fd) { return this._request('POST',   p, fd, true); };

  // Auth
  ApiClient.prototype.getProfile    = function ()  { return this.get('/auth/profile'); };
  ApiClient.prototype.updateProfile = function (d) { return this.put('/auth/profile', d); };
  ApiClient.prototype.getTeam       = function ()  { return this.get('/auth/team'); };
  // Dashboard
  ApiClient.prototype.getDashboard  = function ()  { return this.get('/dashboard'); };
  // Projects
  ApiClient.prototype.getProjects   = function ()  { return this.get('/projects'); };
  ApiClient.prototype.createProject = function (d) { return this.post('/projects', d); };
  // Inspections
  ApiClient.prototype.getInspections = function (p) {
    var qs = p ? new URLSearchParams(p).toString() : '';
    return this.get('/inspections' + (qs ? '?' + qs : ''));
  };
  ApiClient.prototype.getInspection    = function (id)    { return this.get('/inspections/' + id); };
  ApiClient.prototype.createInspection = function (d)     { return this.post('/inspections', d); };
  ApiClient.prototype.updateInspection = function (id, d) { return this.put('/inspections/' + id, d); };
  ApiClient.prototype.deleteInspection = function (id)    { return this.del('/inspections/' + id); };
  // Issues
  ApiClient.prototype.getIssues = function (p) {
    var qs = p ? new URLSearchParams(p).toString() : '';
    return this.get('/issues' + (qs ? '?' + qs : ''));
  };
  ApiClient.prototype.createIssue = function (d)     { return this.post('/issues', d); };
  ApiClient.prototype.updateIssue = function (id, d) { return this.put('/issues/' + id, d); };
  ApiClient.prototype.deleteIssue = function (id)    { return this.del('/issues/' + id); };
  // AI
  ApiClient.prototype.generateReport  = function (d) { return this.post('/reports/generate', d); };
  ApiClient.prototype.suggestSeverity = function (d) { return this.post('/reports/suggest-severity', d); };
  ApiClient.prototype.suggestActions  = function (d) { return this.post('/reports/suggest-actions', d); };
  // PDF
  ApiClient.prototype.downloadPDF = function (id, filename) {
    return this._request('GET', '/reports/pdf/' + id)
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var a   = document.createElement('a');
        a.href = url; a.download = filename || 'QC_Report.pdf';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
  };
  // Images
  ApiClient.prototype.uploadImages = function (files) {
    var fd = new FormData();
    Array.from(files).forEach(function (f) { fd.append('images', f); });
    return this.upload('/upload/images', fd);
  };

  window.api      = new ApiClient();
  window.ApiError = ApiError;
}());
