require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
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
    } catch (e) {
      console.error('Queue read error:', fp, e.message);
    }
  }
  if (inserts.length > 0) {
    const db = serviceClient || supabase;
    const { error } = await db.from('bullying_reports').insert(inserts);
    if (error) {
      console.error(`Batch insert failed for ${email}:`, error.message);
      entry.files.push(...files);
      scheduleUserQueue(email, null);
    } else {
      console.log(`Inserted ${inserts.length} reports for ${email}`);
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

// Batch buffer — collect submissions, flush every 8s as bulk insert
const BATCH_BUFFER = [];
const FLUSH_INTERVAL_MS = 8000;

async function flushBatch() {
  try {
    const batch = BATCH_BUFFER.splice(0);
    if (batch.length === 0) return;
    const db = serviceClient || supabase;
    const { error } = await db.from('bullying_reports').insert(batch);
    if (error) {
      console.error(`Batch flush failed (${batch.length} items):`, error.message);
      BATCH_BUFFER.push(...batch);
    } else {
      console.log(`Batch flushed: ${batch.length} reports inserted`);
    }
  } catch (e) {
    console.error('Batch flush error:', e.message);
  }
}
setInterval(flushBatch, FLUSH_INTERVAL_MS);

// Submit API Endpoint — enqueue to batch buffer, respond immediately
app.post('/api/submit', async (req, res) => {
  try {
    const reportData = req.body;
    const refNum = reportData.referenceNumber || `LRP-${Date.now()}`;
    const email = reportData.userEmail || 'unknown';

    BATCH_BUFFER.push({
      reference_number: refNum,
      module: reportData.module,
      school_id: reportData.metadata?.schoolId || null,
      school_name: reportData.metadata?.schoolName || null,
      prepared_by: reportData.preparedBy || null,
      validated_by: reportData.validatedBy || null,
      status: 'Submitted',
      report_data: reportData
    });

    console.log(`Queued report ${refNum} for ${email} (buffer: ${BATCH_BUFFER.length})`);
    res.status(200).json({ success: true, referenceNumber: refNum });
  } catch (error) {
    console.error('Submit Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/stats — aggregated analytics (filter by schoolName for non-admin)
app.get('/api/stats', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Invalid token' });

    const db = serviceClient || supabase;
    const { data: profile } = await db
      .from('profiles').select('role, school_name').eq('id', user.id).maybeSingle();

    const role = user.app_metadata?.role || profile?.role || 'user';
    const schoolName = profile?.school_name || null;

    let query = serviceClient.from('bullying_reports').select('*');
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
    const { error } = await serviceClient.from('bullying_reports').delete().eq('id', id);
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
    const { token } = req.query;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return res.status(401).json({ error: 'Invalid token' });

    const db = serviceClient || supabase;
    const { data: profile } = await db
      .from('profiles').select('role, school_name').eq('id', user.id).maybeSingle();

    const role = user.app_metadata?.role || profile?.role || 'user';
    const schoolName = profile?.school_name || null;

    let query = serviceClient.from('bullying_reports').select('*');
    if (role !== 'admin' && schoolName) query = query.eq('school_name', schoolName);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Reports Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== FRONTEND ROUTES WITH AUTH + CLEAN URLs =====
const HTML_DIR = path.join(__dirname, 'htmls');

// Single-session enforcement: map email -> token
const activeSessions = {};
const blockedRequests = []; // { email, schoolName, deviceId, timestamp }
const revokedUsers = {}; // email -> true

// GET /api/access-requests — list pending blocked session attempts (latest per email)
app.get('/api/access-requests', (req, res) => {
  // Keep only the latest entry per email
  var latest = {};
  blockedRequests.forEach(function(r) { latest[r.email] = r; });
  res.json(Object.values(latest));
});

// POST /api/access-requests/:email/approve — clear old session so new device can log in
app.post('/api/access-requests/:email/approve', (req, res) => {
  const { email } = req.params;
  delete activeSessions[email];
  const idx = blockedRequests.findIndex(r => r.email === email);
  if (idx !== -1) blockedRequests.splice(idx, 1);
  // Remove all remaining entries for this email
  for (var i = blockedRequests.length - 1; i >= 0; i--) { if (blockedRequests[i].email === email) blockedRequests.splice(i, 1); }
  res.json({ success: true });
});

// POST /api/access-requests/:email/revoke — permanently block user
app.post('/api/access-requests/:email/revoke', (req, res) => {
  const { email } = req.params;
  delete activeSessions[email];
  revokedUsers[email] = true;
  const idx = blockedRequests.findIndex(r => r.email === email);
  if (idx !== -1) blockedRequests.splice(idx, 1);
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

  // Track token changes for admin visibility (don't block — Supabase rotates tokens)
  if (activeSessions[email] && activeSessions[email] !== token) {
    blockedRequests.push({ email, schoolName, deviceId: token.slice(-8), timestamp: new Date().toISOString() });
  }
  // Always update to the latest token
  activeSessions[email] = token;

  // Check if user is revoked
  if (revokedUsers[email]) {
    return res.json({ valid: false });
  }

  // Register this session
  activeSessions[email] = token;

  res.json({ valid: true, user: { email, role, schoolName, avatarUrl, fullName } });
});

// Sign-out endpoint — clears the active session
app.post('/api/signout', (req, res) => {
  const { email } = req.body;
  if (email) delete activeSessions[email];
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
  { path: '/dashboard', file: 'school_dashboard_review_annex_a_report.html' },
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

// Graceful shutdown — flush remaining buffer
async function shutdown() {
  console.log('Shutting down, flushing buffer...');
  await flushBatch();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

