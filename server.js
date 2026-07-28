require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

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

// Microsoft OAuth token helper
async function getMicrosoftGraphToken() {
  const url = `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const res = await axios.post(url, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return res.data.access_token;
}

// 10-Minute Temp File Cleanup Task
setInterval(() => {
  console.log('Running 10-minute temp file cleanup task...');
  fs.readdir(TEMP_DIR, (err, files) => {
    if (err) return console.error(err);
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(TEMP_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return console.error(err);
        // If file is older than 10 minutes (600,000 ms)
        if (now - stats.mtimeMs > 600000) {
          fs.unlink(filePath, err => {
            if (err) console.error(`Error deleting ${file}:`, err);
            else console.log(`Deleted temporary file: ${file}`);
          });
        }
      });
    });
  });
}, 60000); // Check every minute

// Submit API Endpoint
app.post('/api/submit', async (req, res) => {
  try {
    const reportData = req.body;
    const refNum = reportData.referenceNumber || `LRP-${Date.now()}`;
    const filename = `${refNum}.json`;
    const filePath = path.join(TEMP_DIR, filename);

    // 1. Write local temporary JSON file
    fs.writeFileSync(filePath, JSON.stringify(reportData, null, 2));
    console.log(`Saved local JSON: ${filename}`);

    // 2. Insert to Supabase Database
    const { data: dbData, error: dbError } = await supabase
      .from('lrp_reports')
      .insert([
        {
          reference_number: refNum,
          module_type: reportData.module,
          school_id: reportData.metadata.schoolId,
          school_name: reportData.metadata.schoolName,
          reporting_year: reportData.metadata.reportingYear,
          prepared_by_name: reportData.preparedBy.name,
          validated_by_name: reportData.validatedBy.name,
          report_status: 'Submitted',
          report_data: reportData
        }
      ]);

    if (dbError) throw dbError;

    // 3. Write Row to Excel Online via Graph API
    try {
      if (process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET) {
        const token = await getMicrosoftGraphToken();
        const excelUrl = `https://graph.microsoft.com/v1.0/drives/${process.env.MS_DRIVE_ID}/items/${process.env.MS_FILE_ID}/workbook/worksheets('${reportData.module}')/tables('Table_${reportData.module}')/rows/add`;
        
        const newRow = [
          refNum,
          reportData.metadata.schoolName,
          reportData.metadata.schoolId,
          reportData.metadata.reportingYear,
          reportData.validatedBy.name,
          new Date().toISOString()
        ];

        await axios.post(excelUrl, { values: [newRow] }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Successfully pushed row to Excel Online.');
      } else {
        console.log('Microsoft Graph API environment variables not configured. Skipping Excel live sync.');
      }
    } catch (excelErr) {
      console.error('Excel Live Sync Failed (But Supabase + Local Storage succeeded):', excelErr.message);
    }

    res.status(200).json({ success: true, referenceNumber: refNum });
  } catch (error) {
    console.error('Submission Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/stats — aggregated analytics
app.get('/api/stats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('lrp_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const total = data.length;
    const lastSubmission = data.length > 0 ? data[0].created_at : null;

    // Monthly breakdown
    const monthly = {};
    data.forEach(r => {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthly[key] = (monthly[key] || 0) + 1;
    });

    const statusCounts = { Submitted: 0, 'Pending Review': 0 };
    data.forEach(r => {
      if (r.report_status === 'Submitted') statusCounts.Submitted++;
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
    const { error } = await supabase.from('lrp_reports').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Delete Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reports — list all reports
app.get('/api/reports', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('lrp_reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Reports Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== FRONTEND ROUTES WITH AUTH + CLEAN URLs =====
const HTML_DIR = path.join(__dirname, 'htmls');

// Verify session endpoint (called by frontend auth guard)
app.post('/api/verify-session', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.json({ valid: false });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.json({ valid: false });

  // Check app_metadata (raw_app_meta_data in auth.users) first, fall back to profiles table
  let role = user.app_metadata?.role;

  if (!role) {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single();
    role = profile?.role || 'user';
  }

  res.json({ valid: true, user: { email: user.email, role } });
});

// Public routes
app.get('/', (req, res) => {
  res.sendFile(path.join(HTML_DIR, 'login_ormoc_city_division_lrp_wired_1.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(HTML_DIR, 'login_ormoc_city_division_lrp_wired_1.html'));
});
app.get('/pending', (req, res) => {
  res.sendFile(path.join(HTML_DIR, 'access_pending_approval.html'));
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

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
