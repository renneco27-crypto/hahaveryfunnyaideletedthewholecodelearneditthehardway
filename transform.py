import re

with open(r'c:\Users\corte\Documents\projects NOT DELETE\New folder (2)\annex_modules_redesigned.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Replace card CSS comment and rules if needed
content = content.replace(
    '/* ── Card ── */\n.card {\n  background:#ffffff;\n  border:1px solid #c4c6cf;\n  border-radius:16px;\n  padding:0;\n  box-shadow:0 2px 8px rgba(0,32,70,.05);\n  margin-bottom:16px;\n  overflow:hidden;\n}',
    '/* ── Card ── */\n.card {\n  background: #ffffff;\n  border: 1px solid #c4c6cf;\n  border-radius: 16px;\n  padding: 0;\n  box-shadow: 0 2px 8px rgba(0,32,70,.05);\n  margin-bottom: 40px;\n  overflow: hidden;\n}'
)

# 2. Replace all .card divs with bg-surface-container-lowest border border-outline-variant p-lg mb-lg
# Note: we update both standard divs and React JSX className divs if any
content = content.replace('className="card"', 'className="bg-surface-container-lowest border border-outline-variant p-lg mb-lg"')
content = content.replace('class="card"', 'class="bg-surface-container-lowest border border-outline-variant p-lg mb-lg"')

# 3. Replace .section-title and .section-title-sm with new card-header structure
def replace_section(match):
    is_sm = match.group(1) == '-sm'
    emoji = match.group(2)
    title = match.group(3).strip()
    
    icon_map = {
        '🏫': ('school', 'INSTITUTIONAL METADATA'),
        '📑': ('category', 'INCIDENT CATEGORY SELECTION'),
        '📍': ('place', 'LOCATION & TIMELINE DETAILS'),
        '👥': ('groups', 'INDIVIDUALS / PARTIES INVOLVED'),
        '⚖️': ('gavel', 'INTERVENTION & RESOLUTION'),
        '🚩': ('flag', 'RISK ASSESSMENT & FACTORS'),
        '👨‍👩‍👧': ('family_restroom', 'FAMILY CONTEXT & INDIVIDUALS'),
        '📋': ('fact_check', 'OFFENSE & VIOLATION DETAILS'),
        '🛡️': ('shield', 'OFFENDER / SUBJECT PROFILES'),
        '📊': ('analytics', 'METRICS & CONSOLIDATED COUNTERS'),
        '✍️': ('draw', 'VERIFICATION & SIGN-OFF'),
        '👤': ('person', 'PARTY DETAILS'),
        '⚠️': ('warning', 'CONCERN DETAILS'),
        '🎯': ('track_changes', 'PROGRAM & ACTION DETAILS')
    }
    
    icon, subtitle = icon_map.get(emoji, ('folder', 'SECTION DETAILS'))
    if is_sm:
        subtitle = 'SUB-SECTION DETAILS'
        
    return f'''<div className="card-header mb-md">
              <div className="card-header-icon"><span className="material-symbols-outlined">{icon}</span></div>
              <div className="card-header-text">
                <div className="card-header-title">{title}</div>
                <div className="card-header-subtitle">{subtitle}</div>
              </div>
            </div>'''

pattern = re.compile(r'<div className="section-title(-sm)?">\s*<span style=\{\{[^}]*\}\}>([^<]+)</span>\s*([^<]+)\s*</div>')
content = pattern.sub(replace_section, content)

# 4. Redesign Counters section
old_counters = '''      <div className="bg-surface-container-lowest border border-outline-variant p-lg mb-lg">
        <div className="section-title">
          <span style={{ fontSize: '20px' }}>📊</span> Summary Counters
        </div>
        <div className="counter-row">
          <div className="counter-pill">
            <div className="counter-num">{counters.resolved}</div>
            <div className="counter-label">Resolved</div>
          </div>
          <div className="counter-pill">
            <div className="counter-num">{counters.ongoing}</div>
            <div className="counter-label">Ongoing</div>
          </div>
          <div className="counter-pill">
            <div className="counter-num">{counters.external}</div>
            <div className="counter-label">Gov Agency</div>
          </div>
          <div className="counter-pill">
            <div className="counter-num">{counters.ngo}</div>
            <div className="counter-label">NGO</div>
          </div>
        </div>
      </div>'''

new_counters = '''      <div className="bg-surface-container-lowest border border-outline-variant p-lg mb-lg">
        <div className="card-header mb-md">
          <div className="card-header-icon"><span className="material-symbols-outlined">analytics</span></div>
          <div className="card-header-text">
            <div className="card-header-title">Summary Counters</div>
            <div className="card-header-subtitle">METRICS & CONSOLIDATED COUNTERS</div>
          </div>
        </div>
        <div className="counter-row">
          <div className="counter-pill resolved">
            <div className="counter-icon"><span className="material-symbols-outlined">check_circle</span></div>
            <div className="counter-num">{counters.resolved}</div>
            <div className="counter-label">Resolved</div>
          </div>
          <div className="counter-pill ongoing">
            <div className="counter-icon"><span className="material-symbols-outlined">pending_actions</span></div>
            <div className="counter-num">{counters.ongoing}</div>
            <div className="counter-label">Ongoing</div>
          </div>
          <div className="counter-pill external">
            <div className="counter-icon"><span className="material-symbols-outlined">account_balance</span></div>
            <div className="counter-num">{counters.external}</div>
            <div className="counter-label">Gov Agency</div>
          </div>
          <div className="counter-pill ngo">
            <div className="counter-icon"><span className="material-symbols-outlined">corporate_fare</span></div>
            <div className="counter-num">{counters.ngo}</div>
            <div className="counter-label">NGO</div>
          </div>
        </div>
      </div>'''

content = content.replace(old_counters, new_counters)

# 5. Redesign Signatures section
old_signatures = '''      <div className="bg-surface-container-lowest border border-outline-variant p-lg mb-lg">
        <div className="section-title">
          <span style={{ fontSize: '20px' }}>✍️</span> Signatures
        </div>
        <div className="panel-grid">
          <div className="row-card">
            <div style={{ fontSize: '11px', fontWeight: '800', color: '#1261a3', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '12px' }}>Prepared By</div>
            <div className="panel-grid-1">
              <div>
                <label className="field-label">Name <span className="required">*</span></label>
                <input className={`field-input ${validationErrors.preparedName ? 'field-error' : ''}`} value={preparedBy.name} onChange={e => setPreparedBy(p => ({ ...p, name: e.target.value }))} placeholder="Full Name" />
              </div>
              <div>
                <label className="field-label">Designation</label>
                <input className="field-input" value={preparedBy.designation} onChange={e => setPreparedBy(p => ({ ...p, designation: e.target.value }))} placeholder="e.g., Guidance Counselor" />
              </div>
              <div>
                <label className="field-label">Date <span className="required">*</span></label>
                <input type="date" className={`field-input ${validationErrors.preparedDate ? 'field-error' : ''}`} value={preparedBy.date} onChange={e => setPreparedBy(p => ({ ...p, date: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="row-card">
            <div style={{ fontSize: '11px', fontWeight: '800', color: '#1261a3', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '12px' }}>Validated By</div>
            <div className="panel-grid-1">
              <div>
                <label className="field-label">Name <span className="required">*</span></label>
                <input className={`field-input ${validationErrors.validatedName ? 'field-error' : ''}`} value={validatedBy.name} onChange={e => setValidatedBy(p => ({ ...p, name: e.target.value }))} placeholder="Full Name" />
              </div>
              <div>
                <label className="field-label">Designation</label>
                <input className="field-input" value={validatedBy.designation} onChange={e => setValidatedBy(p => ({ ...p, designation: e.target.value }))} placeholder="e.g., School Principal" />
              </div>
              <div>
                <label className="field-label">Date <span className="required">*</span></label>
                <input type="date" className={`field-input ${validationErrors.validatedDate ? 'field-error' : ''}`} value={validatedBy.date} onChange={e => setValidatedBy(p => ({ ...p, date: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>
      </div>'''

new_signatures = '''      <div className="bg-surface-container-lowest border border-outline-variant p-lg mb-lg">
        <div className="card-header mb-md">
          <div className="card-header-icon"><span className="material-symbols-outlined">draw</span></div>
          <div className="card-header-text">
            <div className="card-header-title">Signatures & Approvals</div>
            <div className="card-header-subtitle">VERIFICATION & SIGN-OFF</div>
          </div>
        </div>
        <div className="panel-grid">
          <div className="row-card">
            <div className="sig-header">
              <span className="material-symbols-outlined">edit_note</span> Prepared By
            </div>
            <div className="panel-grid-1">
              <div>
                <label className="field-label">Name <span className="required">*</span></label>
                <input className={`field-input ${validationErrors.preparedName ? 'field-error' : ''}`} value={preparedBy.name} onChange={e => setPreparedBy(p => ({ ...p, name: e.target.value }))} placeholder="Full Name" />
              </div>
              <div>
                <label className="field-label">Designation</label>
                <input className="field-input" value={preparedBy.designation} onChange={e => setPreparedBy(p => ({ ...p, designation: e.target.value }))} placeholder="e.g., Guidance Counselor" />
              </div>
              <div>
                <label className="field-label">Date <span className="required">*</span></label>
                <input type="date" className={`field-input ${validationErrors.preparedDate ? 'field-error' : ''}`} value={preparedBy.date} onChange={e => setPreparedBy(p => ({ ...p, date: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="row-card">
            <div className="sig-header">
              <span className="material-symbols-outlined">verified</span> Validated By
            </div>
            <div className="panel-grid-1">
              <div>
                <label className="field-label">Name <span className="required">*</span></label>
                <input className={`field-input ${validationErrors.validatedName ? 'field-error' : ''}`} value={validatedBy.name} onChange={e => setValidatedBy(p => ({ ...p, name: e.target.value }))} placeholder="Full Name" />
              </div>
              <div>
                <label className="field-label">Designation</label>
                <input className="field-input" value={validatedBy.designation} onChange={e => setValidatedBy(p => ({ ...p, designation: e.target.value }))} placeholder="e.g., School Principal" />
              </div>
              <div>
                <label className="field-label">Date <span className="required">*</span></label>
                <input type="date" className={`field-input ${validationErrors.validatedDate ? 'field-error' : ''}`} value={validatedBy.date} onChange={e => setValidatedBy(p => ({ ...p, date: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>
      </div>'''

content = content.replace(old_signatures, new_signatures)

# 6. Redesign Footer (sticky footer buttons & page footer if applicable)
old_footer = '''      <div className="sticky-footer">
        <button className="secondary-btn" type="button">💾 Save Draft</button>
        <button className="primary-btn" type="button" onClick={handleSubmit}>📤 Submit Report</button>
      </div>'''

new_footer = '''      <div className="sticky-footer">
        <button className="secondary-btn" type="button">
          <span className="material-symbols-outlined">save</span> Save Draft
        </button>
        <button className="primary-btn" type="button" onClick={handleSubmit}>
          <span className="material-symbols-outlined">send</span> Submit Report
        </button>
      </div>'''

content = content.replace(old_footer, new_footer)

# 7. Replace remaining emojis with Material Symbol icons or elements
# Replace button emojis
content = content.replace('➕ Add Student', '<><span className="material-symbols-outlined">person_add</span> Add Student</>')
content = content.replace('➕ Add Respondent', '<><span className="material-symbols-outlined">person_add</span> Add Respondent</>')
content = content.replace('➕ Add Individual', '<><span className="material-symbols-outlined">person_add</span> Add Individual</>')
content = content.replace('➕ Add Victim', '<><span className="material-symbols-outlined">person_add</span> Add Victim</>')
content = content.replace('➕ Add Subject', '<><span className="material-symbols-outlined">person_add</span> Add Subject</>')
content = content.replace('🗑️ Remove', '<span className="material-symbols-outlined">delete</span>')
content = content.replace('🗑️', '<span className="material-symbols-outlined">delete</span>')
content = content.replace('⚠️', '<span className="material-symbols-outlined text-error">warning</span>')
content = content.replace('✓ SUBMITTED', '✓ SUBMITTED') # Keep text, replace in submission banner below
content = content.replace('✓ Submission Complete', 'Submission Complete')

# Replace tooltips info icon
content = content.replace('ℹ️', '<span className="material-symbols-outlined tip-icon">info</span>')

with open(r'c:\Users\corte\Documents\projects NOT DELETE\New folder (2)\annex_modules_redesigned.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Update completed successfully!")
