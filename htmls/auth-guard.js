(async function() {
  const SUPABASE_URL = 'https://nstyqceyjkgevnibfqks.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zdHlxY2V5amtnZXZuaWJmcWtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDMwMzcsImV4cCI6MjA5ODIxOTAzN30.EUozeDCEFqvkLSNOpaBEaXA2D8ZbdPrhGdrNFelpRCU';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  window.signOut = async function() {
    var email = window.__user?.email;
    if (email) {
      try { await fetch('/api/signout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }); } catch (e) {}
    }
    sessionStorage.removeItem('auth_cache');
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  var cached = sessionStorage.getItem('auth_cache');
  if (cached) {
    try {
      var parsed = JSON.parse(cached);
      if (parsed.user) {
        window.__user = parsed.user;
        window.__token = parsed.token;
      }
    } catch (e) {}
  }

  try {
    var { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      sessionStorage.removeItem('auth_cache');
      window.location.href = '/pending';
      return;
    }
    var res = await fetch('/api/verify-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: session.access_token })
    });
    var result = await res.json();

    if (!result.valid) {
      sessionStorage.removeItem('auth_cache');
      var target = result.singleSession ? '/pending?reason=single_session&email=' + encodeURIComponent(result.email || '') : '/pending';
      window.location.href = target;
      return;
    }

    sessionStorage.setItem('auth_cache', JSON.stringify({ user: result.user, token: session.access_token }));
    window.__user = result.user;
    window.__token = session.access_token;

    if (window.location.pathname === '/admin' && result.user.role !== 'admin') {
      window.location.href = '/analytics';
    }
  } catch (e) {
    console.error('Auth guard error:', e);
    if (!window.__user) window.location.href = '/pending';
  }
})();