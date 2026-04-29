/**
 * frontend/lib/auth.js
 * Supabase auth — validates config before initializing,
 * shows a clear error if Supabase keys are missing.
 */
(function () {
  'use strict';

  var SUPABASE_URL     = window.ENV && window.ENV.SUPABASE_URL;
  var SUPABASE_ANON_KEY = window.ENV && window.ENV.SUPABASE_ANON_KEY;

  // Guard: if keys look like placeholders, bail with clear UI message
  if (!SUPABASE_URL || SUPABASE_URL.indexOf('YOUR_') !== -1 ||
      !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.indexOf('YOUR_') !== -1) {
    console.error('[Auth] Supabase not configured. Edit frontend/config.js');
    window.authClient = {
      signIn:  function () { return Promise.reject(new Error('Supabase not configured — see config.js')); },
      signUp:  function () { return Promise.reject(new Error('Supabase not configured — see config.js')); },
      signOut: function () { return Promise.resolve(); },
      getSession: function () { return Promise.resolve(null); },
      supabase: null,
    };
    return;
  }

  var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  async function signUp(email, password, fullName, role) {
    role = role || 'inspector';
    var result = await supabase.auth.signUp({
      email: email, password: password,
      options: { data: { full_name: fullName, role: role } },
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function signIn(email, password) {
    var result = await supabase.auth.signInWithPassword({ email: email, password: password });
    if (result.error) throw result.error;
    window.api.setToken(result.data.session.access_token);
    return result.data;
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.api.clearToken();
    if (typeof showAuthPage === 'function') showAuthPage();
  }

  async function getSession() {
    var result = await supabase.auth.getSession();
    return result.data.session;
  }

  // React to auth state changes (e.g. token refresh, tab refocus)
  supabase.auth.onAuthStateChange(async function (event, session) {
    if (session) {
      window.api.setToken(session.access_token);
      window.currentUser = session.user;
      if (event === 'SIGNED_IN' && typeof hideAuthPage === 'function') {
        hideAuthPage();
        if (typeof initApp === 'function') await initApp();
      }
      // TOKEN_REFRESHED — silently update token
    } else {
      window.api.clearToken();
      window.currentUser = null;
      if (typeof showAuthPage === 'function') showAuthPage();
    }
  });

  window.authClient = { signUp: signUp, signIn: signIn, signOut: signOut, getSession: getSession, supabase: supabase };
}());
