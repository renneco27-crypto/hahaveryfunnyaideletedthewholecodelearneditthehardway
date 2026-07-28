(async function() {
  const SUPABASE_URL = 'https://nstyqceyjkgevnibfqks.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zdHlxY2V5amtnZXZuaWJmcWtzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDMwMzcsImV4cCI6MjA5ODIxOTAzN30.EUozeDCEFqvkLSNOpaBEaXA2D8ZbdPrhGdrNFelpRCU';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Expose signOut globally for logout buttons
  window.signOut = async function() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = '/pending';
      return;
    }

    const token = session.access_token;
    const res = await fetch('/api/verify-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const result = await res.json();

    if (!result.valid) {
      window.location.href = '/pending';
      return;
    }

    // Expose user info globally for the page to use
    window.__user = result.user;

    // Role check: if on /admin but not admin, redirect
    if (window.location.pathname === '/admin' && result.user.role !== 'admin') {
      window.location.href = '/dashboard';
    }
  } catch (e) {
    console.error('Auth guard error:', e);
    window.location.href = '/pending';
  }
})();
