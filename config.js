(function () {
  'use strict';
  var isLocal = (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  window.ENV = {
    SUPABASE_URL:      'https://xvofoksoqsipdtxdyeni.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_qv2ZoAnf7-7yVo8URTc9Zg_dScRA-Qv',
    API_URL:           isLocal ? 'http://localhost:3001/api' : 'https://qc-inspector-pro-production.up.railway.app/api',
    COMPANY_NAME:      'QC Inspector Pro',
    IS_LOCAL:          isLocal,
  };
  console.log('[QC Inspector] Config loaded — API:', window.ENV.API_URL);
}());
