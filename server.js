require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors({ origin: true, credentials: true, allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());

const PORT = process.env.PORT || 5000;
const TEMP_DIR = path.join(__dirname, 'temp_json');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Supabase Initialization
const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'placeholder-key';
const supabase = createClient(supabaseUrl, supabaseKey);
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
const serviceClient = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

// Per-user queue: delay DB insert 1-3 min after each user's last submission
const userQueue = {}; // { email: { timer, files } }

function scheduleUserQueue(email, filePath) {
  if (!userQueue[email]) userQueue[email] = { timer: null, files: [] };
  if (filePath) userQueue[email].files.push(filePath);
  if (userQueue[email].timer) clearTimeout(userQueue[email].timer);
  const delay = 60000 + Math.random() * 120000;
  userQueue[email].timer = setTimeout(() => processUserQueue(email), delay);
}

async function processUserQueue(email) {
  const entry = userQueue[email];
  if (!entry) return;
  const files = entry.files.splice(0);
  entry.timer = null;
  if (files.length === 0) return;
  const inserts = [];
  for (const fp of files) {
    try {
      const raw = fs.readFileSync(fp, 'utf8');
      const content = JSON.parse(raw);
      // Batch multi-module submission
      if (content.modules && Array.isArray(content.modules)) {
        const refNum = content.referenceNumber || path.basename(fp, '.json');
        content.modules.forEach(modEntry => {
          inserts.push({
            reference_number: refNum,
            module: modEntry.module,
            school_id: content.metadata?.schoolId,
            school_name: content.metadata?.schoolName,
            prepared_by: content.preparedBy,
            validated_by: content.validatedBy,
            status: 'Submitted',
            report_data: { ...content, module: modEntry.module, data: modEntry.data }
          });
        });
      } else {
        // Legacy single-module submission
        inserts.push({
          reference_number: path.basename(fp, '.json'),
          module: content.module,
          school_id: content.metadata?.schoolId,
          school_name: content.metadata?.schoolName,
          prepared_by: content.preparedBy,
          validated_by: content.validatedBy,
          status: 'Submitted',
          report_data: content
        });
      }
    } catch (e) {
      console.error('Queue read error:', fp, e.message);
    }
  }
  if (inserts.length > 0) {
    const db = serviceClient || supabase;
    let failed = false;
    for (const row of inserts) {
      const { error } = await db.from('bullying_reports').insert(row);
      if (error) {
        console.error(`Insert failed for ${email} (${row.reference_number}/${row.module}):`, error.message);
        failed = true;
      }
    }
    if (failed) {
      entry.files.push(...files);
      scheduleUserQueue(email, null);
    } else {
      console.log(`Inserted ${inserts.length} reports for ${email}`);
      // Fire Make.com webhook (fire-and-forget)
      try {
        const webhookUrl = 'https://hook.eu1.make.com/9acokbud64bqr23nugs4gfhjvfdzyj8f';
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'INSERT', table: 'bullying_reports', count: inserts.length, email: email })
        }).catch(function(err) {
          console.error('Webhook failed:', err.message);
        });
      } catch (whErr) {
        console.error('Webhook error:', whErr.message);
      }
    }
  }
}

// 10-Minute Temp File Cleanup Task (recurses into per-user subdirectories)
function cleanDir(dir) {
  fs.readdir(dir, { withFileTypes: true }, (err, entries) => {
    if (err) return;
    const now = Date.now();
    entries.forEach(entry => {
      const fp = path.join(dir, entry.name);
      if (entry.isDirectory()) return cleanDir(fp);
      fs.stat(fp, (err, stats) => {
        if (err) return;
        if (now - stats.mtimeMs > 600000) {
          fs.unlink(fp, err => {
            if (err && err.code !== 'ENOENT') console.error('Cleanup error:', fp, err.message);
            else console.log('Deleted temp file:', fp);
          });
        }
      });
    });
  });
}
setInterval(() => cleanDir(TEMP_DIR), 60000);

// Extract auth token from Authorization header or query param
function getToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return req.query.token || null;
}

// Submit API Endpoint — save JSON only, defer DB insert via per-user queue
app.post('/api/submit', async (req, res) => {
  try {
    const reportData = req.body;
    const refNum = reportData.referenceNumber || `LRP-${Date.now()}`;
    const email = reportData.userEmail || 'unknown';
    const userDir = path.join(TEMP_DIR, email);
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    const filename = `${refNum}.json`;
    const filePath = path.join(userDir, filename);

    fs.writeFileSync(filePath, JSON.stringify(reportData, null, 2));
    console.log(`Saved JSON for ${email}: ${filename}`);

    scheduleUserQueue(email, filePath);
    res.status(200).json({ success: true, referenceNumber: refNum });
  } catch (error) {
    console.error('Submit Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Draft API — Save, List, Load, Delete drafts
app.post('/api/drafts', async (req, res) => {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Invalid token' });

    const db = serviceClient || supabase;
    const { data: profile } = await db
      .from('profiles').select('role, school_name').eq('id', user.id).maybeSingle();
    const schoolName = profile?.school_name || null;

    const draftData = req.body;
    const refNum = draftData.referenceNumber || `DRFT-${Date.now()}`;

    const { data: existing } = await db
      .from('form_drafts').select('id').eq('reference_number', refNum).maybeSingle();

    if (existing) {
      await db.from('form_drafts').update({
        report_data: draftData,
        updated_at: new Date().toISOString()
      }).eq('reference_number', refNum);
    } else {
      await db.from('form_drafts').insert({
        reference_number: refNum,
        school_name: schoolName || draftData.metadata?.schoolName || 'Unknown',
        school_id: draftData.metadata?.schoolId || null,
        report_data: draftData
      });
    }

    res.json({ success: true, referenceNumber: refNum });
  } catch (error) {
    console.error('Save Draft Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/drafts', async (req, res) => {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Invalid token' });

    const db = serviceClient || supabase;
    const { data: profile } = await db
      .from('profiles').select('role, school_name').eq('id', user.id).maybeSingle();
    const role = user.app_metadata?.role || profile?.role || 'user';
    const schoolName = profile?.school_name || null;

    let query = db.from('form_drafts').select('*').eq('status', 'Draft');
    if (role !== 'admin' && schoolName) query = query.eq('school_name', schoolName);
    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('List Drafts Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/drafts/:ref', async (req, res) => {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Invalid token' });

    const db = serviceClient || supabase;
    const { data, error } = await db
      .from('form_drafts').select('*').eq('reference_number', req.params.ref).maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Draft not found' });
    res.json(data);
  } catch (error) {
    console.error('Load Draft Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/drafts/:ref', async (req, res) => {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Invalid token' });

    const db = serviceClient || supabase;
    const { error } = await db
      .from('form_drafts').delete().eq('reference_number', req.params.ref);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Delete Draft Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/stats — aggregated analytics (filter by schoolName for non-admin)
app.get('/api/stats', async (req, res) => {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Invalid token' });

    const db = serviceClient || supabase;
    const { data: profile } = await db
      .from('profiles').select('role, school_name').eq('id', user.id).maybeSingle();

    const role = user.app_metadata?.role || profile?.role || 'user';
    const schoolName = profile?.school_name || null;

    let query = db.from('bullying_reports').select('*');
    if (role !== 'admin' && schoolName) query = query.eq('school_name', schoolName);
    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    const total = data.length;
    const lastSubmission = data.length > 0 ? data[0].created_at : null;

    const monthly = {};
    data.forEach(r => {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthly[key] = (monthly[key] || 0) + 1;
    });

    const statusCounts = { Submitted: 0, 'Pending Review': 0 };
    data.forEach(r => {
      if (r.status === 'Submitted') statusCounts.Submitted++;
      else statusCounts['Pending Review']++;
    });

    res.json({ total, lastSubmission, monthly, statusCounts, reports: data });
  } catch (error) {
    console.error('Stats Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/reports/:id
app.delete('/api/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = serviceClient || supabase;
    const { error } = await db.from('bullying_reports').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Delete Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reports — list reports (filter by schoolName for non-admin)
app.get('/api/reports', async (req, res) => {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Invalid token' });

    const db = serviceClient || supabase;
    const { data: profile } = await db
      .from('profiles').select('role, school_name').eq('id', user.id).maybeSingle();

    const role = user.app_metadata?.role || profile?.role || 'user';
    const schoolName = profile?.school_name || null;

    let query = db.from('bullying_reports').select('*');
    if (role !== 'admin' && schoolName) query = query.eq('school_name', schoolName);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Reports Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/schools — list all division schools from database (with JSON fallback)
app.get('/api/schools', async (req, res) => {
  try {
    const db = serviceClient || supabase;
    const { data, error } = await db.from('division_schools').select('*').order('district').order('name');
    if (!error && data && data.length > 0) {
      // Group by district to match expected format
      const districtMap = {};
      data.forEach(s => {
        if (!districtMap[s.district]) {
          districtMap[s.district] = { district: s.district, psds: s.psds, schools: [] };
        }
        districtMap[s.district].schools.push(s.name);
      });
      return res.json(Object.values(districtMap));
    }
    // Fallback to JSON file if table is not yet seeded
    const jsonPath = path.join(HTML_DIR, 'ormoc_city_division_schools.json');
    if (fs.existsSync(jsonPath)) {
      const fallback = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      return res.json(fallback);
    }
    res.json([]);
  } catch (error) {
    console.error('Schools API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== FRONTEND ROUTES WITH AUTH + CLEAN URLs =====
const HTML_DIR = path.join(__dirname, 'htmls');

// IP-limit enforcement: registered IPs are persisted in the registered_ips table.
// Each non-admin account may register up to 3 IPs before requiring admin approval.
const blockedRequests = []; // { email, schoolName, deviceId: clientIp, timestamp }
const revokedUsers = {}; // email -> true

// getClientIp() - extract the client IP address from headers or socket
function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// GET /api/access-requests — list pending blocked session attempts (latest per email)
app.get('/api/access-requests', (req, res) => {
  // Keep only the latest entry per email
  var latest = {};
  blockedRequests.forEach(function(r) { latest[r.email] = r; });
  res.json(Object.values(latest));
});

// POST /api/access-requests/:email/approve — clear IP history so new location can log in
app.post('/api/access-requests/:email/approve', async (req, res) => {
  const { email } = req.params;
  // Clear all registered IPs for this account in Supabase
  if (serviceClient) {
    const { error } = await serviceClient.from('registered_ips').delete().eq('email', email);
    if (error) console.error('approve: clear IPs failed:', error.message);
  }
  // Remove all remaining entries for this email from the pending queue
  for (var i = blockedRequests.length - 1; i >= 0; i--) {
    if (blockedRequests[i].email === email) blockedRequests.splice(i, 1);
  }
  res.json({ success: true });
});

// POST /api/access-requests/:email/revoke — permanently block user
app.post('/api/access-requests/:email/revoke', (req, res) => {
  const { email } = req.params;
  revokedUsers[email] = true;
  // Remove all remaining entries for this email
  for (var i = blockedRequests.length - 1; i >= 0; i--) { if (blockedRequests[i].email === email) blockedRequests.splice(i, 1); }
  res.json({ success: true });
});

// Verify session endpoint (called by frontend auth guard)
app.post('/api/verify-session', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.json({ valid: false });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.json({ valid: false });

  let role = user.app_metadata?.role;
  let schoolName = null;

  const db = serviceClient || supabase;
  const { data: profile } = await db
    .from('profiles').select('role, school_name').eq('id', user.id).maybeSingle();

  if (!role) role = profile?.role || 'user';
  schoolName = profile?.school_name || null;

  const avatarUrl = user.user_metadata?.avatar_url || null;
  const fullName = user.user_metadata?.full_name || user.email || 'User';
  const email = user.email;

  // Check if user is revoked
  if (revokedUsers[email]) {
    return res.json({ valid: false });
  }

  // Admins bypass the IP limit entirely
  if (role === 'admin') {
    return res.json({ valid: true, user: { email, role, schoolName, avatarUrl, fullName } });
  }

  // Enforce 3 IP limit for non-admin accounts (persisted in Supabase)
  const clientIp = getClientIp(req);
  const { data: existing } = await db
    .from('registered_ips').select('ip_address').eq('email', email);
  const registeredIps = existing ? existing.map(r => r.ip_address) : [];

  if (!registeredIps.includes(clientIp)) {
    if (registeredIps.length >= 3) {
      blockedRequests.push({ email, schoolName, deviceId: clientIp, timestamp: new Date().toISOString() });
      return res.json({ valid: false, reason: 'ip_limit', email });
    }
    const { error: insertErr } = await db
      .from('registered_ips').insert({ email, ip_address: clientIp });
    if (insertErr) console.error('register IP failed:', insertErr.message);
  }

  res.json({ valid: true, user: { email, role, schoolName, avatarUrl, fullName } });
});

// Sign-out endpoint — nothing in-memory to clear (IPs persist until approved)
app.post('/api/signout', (req, res) => {
  res.json({ success: true });
});

// Public routes
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'favicon.ico')));
app.get('/', (req, res) => {
  res.sendFile(path.join(HTML_DIR, 'login_ormoc_city_division_lrp_wired_1.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(HTML_DIR, 'login_ormoc_city_division_lrp_wired_1.html'));
});
app.get('/pending', (req, res) => {
  res.sendFile(path.join(HTML_DIR, 'access_pending_approval.html'));
});
app.get('/auth/callback', (req, res) => {
  res.sendFile(path.join(HTML_DIR, 'auth-callback.html'));
});

// Protected routes (frontend auth guard enforces on each page)
const protectedPages = [
  { path: '/submissions', file: 'annex_modules_redesigned.html' },
  { path: '/analytics', file: 'school_dashboard_access_management_analytics.html' },
  { path: '/admin', file: 'admin_overview_wired.html' },
];
protectedPages.forEach(({ path: routePath, file }) => {
  app.get(routePath, (req, res) => {
    res.sendFile(path.join(HTML_DIR, file));
  });
});

// Additional routes for existing pages
app.get('/reports', (req, res) => {
  res.sendFile(path.join(HTML_DIR, 'latest_excel_division_consolidated_reports.html'));
});
app.get('/access', (req, res) => {
  res.sendFile(path.join(HTML_DIR, 'access_management_wired.html'));
});

// Block direct .html file access — only serve through clean routes
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    return res.sendFile(path.join(HTML_DIR, 'access_pending_approval.html'));
  }
  next();
});

// Serve static assets (js, css, images, fonts) from htmls directory
app.use(express.static(HTML_DIR));

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

