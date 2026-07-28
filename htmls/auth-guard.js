(async function() {
  const SUPABASE_URL = 'https://nstyqceyjkgevnibfqks.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zdHlxY2V5amtnZXZuaWJmcWtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDMwMzcsImV4cCI6MjA5ODIxOTAzN30.EUozeDCEFqvkLSNOpaBEaXA2D8ZbdPrhGdrNFelpRCU';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  window.signOut = async function() {
    sessionStorage.removeItem('auth_cache');
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  // Step 1: Use cached auth data immediately (sidebars renders instantly)
  var cached = sessionStorage.getItem('auth_cache');
  if (cached) {
    try {
      var parsed = JSON.parse(cached);
      if (parsed.valid && parsed.user) {
        window.__user = parsed.user;
      }
    } catch (e) {}
  }

  // Step 2: Verify with server (background refresh)
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
      window.location.href = '/pending';
      return;
    }

    // Cache for instant load on next navigation
    sessionStorage.setItem('auth_cache', JSON.stringify(result));
    window.__user = result.user;

    if (window.location.pathname === '/admin' && result.user.role !== 'admin') {
      window.location.href = '/dashboard';
    }
  } catch (e) {
    console.error('Auth guard error:', e);
    if (!window.__user) window.location.href = '/pending';
  }
})();