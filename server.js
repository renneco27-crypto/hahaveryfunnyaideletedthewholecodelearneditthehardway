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
      if (inserts[0]?.school_name && email) {
        await db.from('profiles').update({ school_name: inserts[0].school_name }).eq('email', email);
      }
      // Dispatch formatted JSON to Make.com webhook according to deped_lrp_report_schema.json
      const webhookUrl = process.env.MAKE_WEBHOOK_URL || 'https://hook.eu1.make.com/9acokbud64bqr23nugs4gfhjvfdzyj8f';
      for (const row of inserts) {
        const payloads = transformReportToMakePayloads(row);
        for (const payload of payloads) {
          fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(() => console.log(`Make.com webhook dispatched for [${payload.report_type}]: ${payload.school_name}`))
            .catch(err => console.error('Make.com webhook error:', err.message));
        }
      }
    }
  }
}

// Transformer function mapping submitted report row to deped_lrp_report_schema.json
function transformReportToMakePayloads(row) {
  const mod = (row.module || row.report_data?.module || '').toUpperCase();
  const rd = row.report_data || {};
  const meta = rd.metadata || {};
  const data = rd.data || rd.categories || {};
  const prepared = row.prepared_by || rd.preparedBy || {};
  const validated = row.validated_by || rd.validatedBy || {};

  const common = {
    division: 'Ormoc City Division',
    submission_date: row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    submitted_by: prepared.name || '—',
    designation: prepared.designation || 'Guidance Counselor',
    validated_by: validated.name || 'School Principal',
    school_sector: meta.classification || 'Public',
    school_level: meta.level || 'Elementary',
    school_name: row.school_name || meta.schoolName || 'Unknown School',
    school_id: String(row.school_id || meta.schoolId || '000000')
  };

  const results = [];

  if (mod === 'A') {
    const payload = {
      report_type: 'bullying',
      school_year: meta.reportingYear || '2024-2025',
      ...common,
      physical_male: 0, physical_female: 0,
      social_male: 0, social_female: 0,
      gender_based_male: 0, gender_based_female: 0,
      cyber_bullying_male: 0, cyber_bullying_female: 0,
      retaliation_male: 0, retaliation_female: 0,
      total_male_victims: 0, total_female_victims: 0, total_incidents: 0,
      resolved_cases: 0, cases_for_monitoring: 0,
      referred_government_agencies: 0, referred_ngo: 0,
      action_taken: '', remarks: ''
    };

    const actions = [];
    Object.keys(data).forEach(catKey => {
      const cat = data[catKey];
      if (!cat) return;
      if (cat.actionsTaken) actions.push(`${catKey}: ${cat.actionsTaken}`);
      const st = (cat.status || '').toLowerCase();
      if (st.includes('resolved')) payload.resolved_cases++;
      else if (st.includes('ongoing') || st.includes('on-going') || st.includes('monitoring')) payload.cases_for_monitoring++;
      else if (st.includes('gov')) payload.referred_government_agencies++;
      else if (st.includes('ngo') || st.includes('non-gov')) payload.referred_ngo++;

      (cat.affectedStudents || []).forEach(stu => {
        const g = (stu.gender || 'M').toUpperCase();
        if (g === 'M') {
          payload.total_male_victims++;
          if (catKey === 'A-1') payload.physical_male++;
          else if (catKey === 'A-2') payload.social_male++;
          else if (catKey === 'A-3') payload.gender_based_male++;
          else if (catKey === 'A-4') payload.cyber_bullying_male++;
          else if (catKey === 'A-5') payload.retaliation_male++;
        } else {
          payload.total_female_victims++;
          if (catKey === 'A-1') payload.physical_female++;
          else if (catKey === 'A-2') payload.social_female++;
          else if (catKey === 'A-3') payload.gender_based_female++;
          else if (catKey === 'A-4') payload.cyber_bullying_female++;
          else if (catKey === 'A-5') payload.retaliation_female++;
        }
      });
    });

    payload.total_incidents = payload.total_male_victims + payload.total_female_victims;
    payload.action_taken = actions.join(' | ');
    results.push(payload);
  } else if (mod === 'B') {
    const nature = data.nature || [];
    const victims = data.victims || [];
    const perps = data.perpetrators || [];

    const payload = {
      report_type: 'child_abuse',
      school_year: meta.reportingYear || '2024-2025',
      ...common,
      physical_male: 0, physical_female: 0,
      sexual_male: 0, sexual_female: 0,
      verbal_psychological_male: 0, verbal_psychological_female: 0,
      total_male_victims: 0, total_female_victims: 0, total_incidents: 0,
      perpetrator_relatives: 0, perpetrator_school_personnel: 0,
      resolved_cases: 0, cases_for_monitoring: 0,
      referred_government_agencies: 0, referred_ngo: 0,
      action_taken: data.actionsTaken || '', remarks: ''
    };

    const st = (data.status || '').toLowerCase();
    if (st.includes('resolved')) payload.resolved_cases = 1;
    else if (st.includes('ongoing') || st.includes('on-going') || st.includes('intervention')) payload.cases_for_monitoring = 1;
    else if (st.includes('gov')) payload.referred_government_agencies = 1;
    else if (st.includes('ngo') || st.includes('non-gov')) payload.referred_ngo = 1;

    victims.forEach(v => {
      const g = (v.gender || 'M').toUpperCase();
      if (g === 'M') {
        payload.total_male_victims++;
        if (nature.includes('N-1')) payload.physical_male++;
        if (nature.includes('N-2')) payload.sexual_male++;
        if (nature.includes('N-3') || nature.includes('N-4')) payload.verbal_psychological_male++;
      } else {
        payload.total_female_victims++;
        if (nature.includes('N-1')) payload.physical_female++;
        if (nature.includes('N-2')) payload.sexual_female++;
        if (nature.includes('N-3') || nature.includes('N-4')) payload.verbal_psychological_female++;
      }
    });

    payload.total_incidents = payload.total_male_victims + payload.total_female_victims;

    perps.forEach(p => {
      const r = (p.relationship || '').toLowerCase();
      if (r.includes('relative')) payload.perpetrator_relatives++;
      else if (r.includes('personnel') || r.includes('teacher')) payload.perpetrator_school_personnel++;
    });

    results.push(payload);
  } else if (mod === 'C') {
    const children = data.children || [];
    const payload = {
      report_type: 'children_at_risk',
      period_covered: data.periodCovered || meta.reportingYear || 'SY 2024-2025',
      ...common,
      victim_of_abuse_male: 0, victim_of_abuse_female: 0,
      victim_of_neglect_male: 0, victim_of_neglect_female: 0,
      dysfunctional_family_male: 0, dysfunctional_family_female: 0,
      gang_member_male: 0, gang_member_female: 0,
      high_criminality_community_male: 0, high_criminality_community_female: 0,
      armed_conflict_male: 0, armed_conflict_female: 0,
      status_offense_ra9344_male: 0, status_offense_ra9344_female: 0,
      mendicant_pd1563_male: 0, mendicant_pd1563_female: 0,
      solvent_rugby_user_male: 0, solvent_rugby_user_female: 0,
      drug_use_dependency_male: 0, drug_use_dependency_female: 0,
      smoking_male: 0, smoking_female: 0,
      others_male: 0, others_female: 0, others_description: 'Involved in gambling / other risks',
      action_taken: '',
      division_alleviation_actions: data.narrative || '',
      remarks: ''
    };

    const actions = [];
    children.forEach(c => {
      const g = (c.gender || 'M').toUpperCase();
      const code = String(c.classification || '');
      if (c.actionTaken) actions.push(c.actionTaken);

      if (g === 'M') {
        if (code === '1') payload.dysfunctional_family_male++;
        else if (code === '2') payload.gang_member_male++;
        else if (code === '3') payload.high_criminality_community_male++;
        else if (code === '4') payload.armed_conflict_male++;
        else if (code === '5') payload.status_offense_ra9344_male++;
        else if (code === '6') payload.mendicant_pd1563_male++;
        else if (code === '7') payload.solvent_rugby_user_male++;
        else if (code === '8') payload.drug_use_dependency_male++;
        else if (code === '9') payload.smoking_male++;
        else payload.others_male++;
      } else {
        if (code === '1') payload.dysfunctional_family_female++;
        else if (code === '2') payload.gang_member_female++;
        else if (code === '3') payload.high_criminality_community_female++;
        else if (code === '4') payload.armed_conflict_female++;
        else if (code === '5') payload.status_offense_ra9344_female++;
        else if (code === '6') payload.mendicant_pd1563_female++;
        else if (code === '7') payload.solvent_rugby_user_female++;
        else if (code === '8') payload.drug_use_dependency_female++;
        else if (code === '9') payload.smoking_female++;
        else payload.others_female++;
      }
    });

    payload.action_taken = actions.join(' | ');
    results.push(payload);
  } else if (mod === 'D') {
    const list = data.ciclList || [];
    if (list.length === 0) {
      list.push({ lrn: '—', age: null, gender: 'M', caseViolation: 'None reported', status: 'Resolved' });
    }

    list.forEach(c => {
      const st = (c.status || '').toLowerCase();
      results.push({
        report_type: 'cicl',
        school_year: meta.reportingYear || '2024-2025',
        period_covered: data.periodCovered || 'SY 2024-2025',
        ...common,
        learner_reference_number: c.lrn || '',
        age: c.age ? parseInt(c.age, 10) : null,
        sex: c.gender === 'F' ? 'F' : 'M',
        case_violation: c.caseViolation || '',
        action_taken: c.actionsTaken || '',
        intervention_diversion_program: c.status || '',
        resolved_cases: st.includes('resolved') ? 1 : 0,
        cases_for_monitoring: (st.includes('ongoing') || st.includes('monitoring')) ? 1 : 0,
        referred_government_agencies: st.includes('gov') ? 1 : 0,
        referred_ngo: (st.includes('ngo') || st.includes('non-gov')) ? 1 : 0,
        diversion_program_description: data.interventionNarrative || '',
        remarks: ''
      });
    });
  } else if (mod === 'E') {
    const rows = data.rows || [];
    const payload = {
      report_type: 'other_lrp_concerns',
      school_year: meta.reportingYear || '2024-2025',
      ...common,
      child_labor_male: 0, child_labor_female: 0,
      child_trafficking_male: 0, child_trafficking_female: 0,
      online_sexual_exploitation_male: 0, online_sexual_exploitation_female: 0,
      sexual_exploitation_male: 0, sexual_exploitation_female: 0,
      corporal_punishment_male: 0, corporal_punishment_female: 0,
      other_learner_to_learner_abuse_male: 0, other_learner_to_learner_abuse_female: 0,
      total_male_victims: 0, total_female_victims: 0, total_incidents: 0,
      resolved_cases: 0, cases_for_monitoring: 0,
      referred_government_agencies: 0, referred_ngo: 0,
      action_taken: '', remarks: ''
    };

    const actions = [];
    rows.forEach(r => {
      const type = (r.concernType || '').toUpperCase();
      if (r.actionsTaken) actions.push(`${type}: ${r.actionsTaken}`);

      const st = (r.status || '').toLowerCase();
      if (st.includes('resolved')) payload.resolved_cases++;
      else if (st.includes('ongoing') || st.includes('intervention')) payload.cases_for_monitoring++;
      else if (st.includes('gov')) payload.referred_government_agencies++;
      else if (st.includes('ngo') || st.includes('non-gov')) payload.referred_ngo++;

      (r.victims || []).forEach(v => {
        const g = (v.sexGender || 'M').toUpperCase();
        if (g === 'M') {
          payload.total_male_victims++;
          if (type === 'EC-1') payload.child_labor_male++;
          else if (type === 'EC-2') payload.child_trafficking_male++;
          else if (type === 'EC-3') payload.corporal_punishment_male++;
          else if (type === 'EC-6') payload.online_sexual_exploitation_male++;
          else if (type === 'EC-8' || type === 'EC-9') payload.sexual_exploitation_male++;
          else payload.other_learner_to_learner_abuse_male++;
        } else {
          payload.total_female_victims++;
          if (type === 'EC-1') payload.child_labor_female++;
          else if (type === 'EC-2') payload.child_trafficking_female++;
          else if (type === 'EC-3') payload.corporal_punishment_female++;
          else if (type === 'EC-6') payload.online_sexual_exploitation_female++;
          else if (type === 'EC-8' || type === 'EC-9') payload.sexual_exploitation_female++;
          else payload.other_learner_to_learner_abuse_female++;
        }
      });
    });

    payload.total_incidents = payload.total_male_victims + payload.total_female_victims;
    payload.action_taken = actions.join(' | ');
    results.push(payload);
  }

  return results;
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

// POST /api/access-requests/:email/approve — approve user and clear IP history
app.post('/api/access-requests/:email/approve', async (req, res) => {
  const { email } = req.params;
  const db = serviceClient || supabase;
  // Ensure profile is created / approved in profiles table
  const { data: existingProfile } = await db.from('profiles').select('id, email').eq('email', email).maybeSingle();
  if (!existingProfile) {
    await db.from('profiles').insert({ email, role: 'user' });
  }
  delete revokedUsers[email];
  // Clear all registered IPs for this account in Supabase
  const { error } = await db.from('registered_ips').delete().eq('email', email);
  if (error) console.error('approve: clear IPs failed:', error.message);
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

  const db = serviceClient || supabase;
  let { data: profile } = await db
    .from('profiles').select('id, role, school_name, email').eq('id', user.id).maybeSingle();

  // If not found by user.id, check by email (in case pre-registered by admin)
  if (!profile && user.email) {
    const { data: byEmail } = await db
      .from('profiles').select('id, role, school_name, email').eq('email', user.email).maybeSingle();
    if (byEmail) {
      profile = byEmail;
      // Sync the Supabase Auth user ID with the profile row
      await db.from('profiles').update({ id: user.id }).eq('email', user.email);
    }
  }

  // Strict check: If account is not in the profiles database or not approved, reject access
  if (!profile || !['admin', 'user'].includes(profile.role)) {
    console.log(`[ACCESS DENIED] ${user.email} is not in the authorized profiles database.`);
    const clientIp = getClientIp(req);
    if (!blockedRequests.some(r => r.email === user.email)) {
      blockedRequests.push({ email: user.email, schoolName: null, deviceId: clientIp, timestamp: new Date().toISOString() });
    }
    return res.json({ valid: false, reason: 'unauthorized', email: user.email });
  }

  let role = profile.role || user.app_metadata?.role || 'user';
  let schoolName = profile.school_name || null;

  const avatarUrl = user.user_metadata?.avatar_url || null;
  const fullName = user.user_metadata?.full_name || user.email || 'User';
  const email = user.email;

  // If schoolName is not in profile, look up recent submissions for this user
  if (!schoolName && email) {
    const { data: recentReports } = await db
      .from('bullying_reports')
      .select('school_name')
      .eq('user_email', email)
      .order('created_at', { ascending: false })
      .limit(1);
    if (recentReports && recentReports.length > 0 && recentReports[0].school_name) {
      schoolName = recentReports[0].school_name;
      await db.from('profiles').update({ school_name: schoolName }).eq('id', user.id);
    }
  }

  // Check if user is revoked
  if (revokedUsers[email]) {
    return res.json({ valid: false, reason: 'revoked', email });
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
  { path: '/history', file: 'reporting_history_wired.html' },
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

