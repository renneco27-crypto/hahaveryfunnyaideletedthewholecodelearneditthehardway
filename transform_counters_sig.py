import re

with open(r'c:\Users\corte\Documents\projects NOT DELETE\New folder (2)\annex_modules_redesigned.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Counters block
old_counters = '''      <div className="bg-surface-container-lowest border border-outline-variant p-lg mb-lg">
        <div className="card-header mb-md">
              <div className="card-header-icon"><span className="material-symbols-outlined">analytics</span></div>
              <div className="card-header-text">
                <div className="card-header-title">Summary Counters</div>
                <div className="card-header-subtitle">METRICS & CONSOLIDATED COUNTERS</div>
              </div>
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

# 2. Update Signatures block
old_signatures = '''      <div className="bg-surface-container-lowest border border-outline-variant p-lg mb-lg">
        <div className="card-header mb-md">
              <div className="card-header-icon"><span className="material-symbols-outlined">draw</span></div>
              <div className="card-header-text">
                <div className="card-header-title">Signatures</div>
                <div className="card-header-subtitle">VERIFICATION & SIGN-OFF</div>
              </div>
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

with open(r'c:\Users\corte\Documents\projects NOT DELETE\New folder (2)\annex_modules_redesigned.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Counters and signatures updated successfully!")
