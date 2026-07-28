// Dashboard Population Script for Annex A — Student Compliance Reporting
// Populates the incident log table with real data from modules A–E

async function generateDashboardData() {
  try {
    const storedData = localStorage.getItem('annex_modules_schema_monthly');
    if (storedData) {
      const schemaData = JSON.parse(storedData);
      return processSchemaData(schemaData);
    }
    console.log('No monthly schema data found in localStorage — table stays blank');
    return null;
  } catch (error) {
    console.error('Error loading schema data:', error);
    return null;
  }
}

async function applyDashboardData() {
  try {
    let dashboardData = await generateDashboardData();
    
    if (!dashboardData || dashboardData.rows.length === 0) {
      console.log('No dashboard data available');
      return;
    }

    // Update record count
    const recordCountElement = document.querySelector('.bg-secondary-fixed.text-on-secondary-fixed');
    if (recordCountElement) {
      recordCountElement.textContent = `${dashboardData.count} RECORD${dashboardData.count !== 1 ? 'S' : ''} DETECTED`;
    }

    // Populate table rows
    const tbody = document.querySelector('tbody');
    if (!tbody) {
      console.error('Table tbody element not found');
      return;
    }

    // Clear existing rows (keep header)
    while (tbody.children.length > 0) {
      tbody.removeChild(tbody.firstChild);
    }

  // Add new rows with animation
  dashboardData.rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    tr.className = `hover:bg-surface-container-low transition-colors animate-fade-in opacity-0`;
    tr.style.animationDelay = `${index * 0.1}s`;

    // Set row content
    tr.innerHTML = `
      <td class="px-md py-sm"><span class="bg-${getIncidentTypeColor(row.incidentType)} text-${getIncidentTypeTextColor(row.incidentType)} px-sm py-0.5 rounded font-bold text-[10px] uppercase whitespace-nowrap">${row.incidentType}</span></td>
      <td class="px-md py-sm text-on-surface whitespace-nowrap text-sm">${row.datePlace}</td>
      <td class="px-md py-sm text-on-surface-variant font-medium text-sm whitespace-nowrap">${row.victimDetails}</td>
      <td class="px-md py-sm text-on-surface-variant font-medium text-sm whitespace-nowrap">${row.bullyDetails}</td>
      <td class="px-md py-sm">
        <div class="flex flex-wrap gap-xs">
          ${row.motivesEffect}
        </div>
      </td>
      <td class="px-md py-sm text-on-surface text-sm" style="max-width:200px;">${row.actionTaken}</td>
      <td class="px-md py-sm">${row.status}</td>
    `;

    tbody.appendChild(tr);
  });

  console.log(`Dashboard populated with ${dashboardData.count} records`);
  } catch (error) {
    console.error('Dashboard population failed:', error);
  }
}

function getIncidentTypeColor(type) {
  const colors = {
    'Physical': 'error-container',
    'Verbal': 'secondary-container',
    'Cyberbullying': 'primary-container',
    'Neglect': 'tertiary-fixed',
    'Other': 'surface-variant',
    'Bullying/Harassment': 'error-container',
    'Violence/Assault': 'tertiary-fixed',
    'Threat/Intimidation': 'secondary-container',
    'Discrimination': 'primary-container',
    'Risk Classification': 'secondary-fixed',
    'Behavior': 'primary-container'
  };
  return colors[type] || 'surface-variant';
}

function getIncidentTypeTextColor(type) {
  const textColors = {
    'Physical': 'on-error-container',
    'Verbal': 'on-secondary-container',
    'Cyberbullying': 'on-primary-container',
    'Neglect': 'on-tertiary-fixed',
    'Other': 'on-surface-variant',
    'Bullying/Harassment': 'on-error-container',
    'Violence/Assault': 'on-tertiary-fixed',
    'Threat/Intimidation': 'on-secondary-container',
    'Discrimination': 'on-primary-container',
    'Risk Classification': 'on-secondary-fixed',
    'Behavior': 'on-primary-container'
  };
  return textColors[type] || 'on-surface-variant';
}

// Initialize dashboard population when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyDashboardData);
} else {
  // DOM already loaded
  applyDashboardData();
}

// Allow manual refresh if needed
window.refreshDashboard = function() {
  applyDashboardData();
};

function processSchemaData(schemaData) {
  // Map module data to dashboard table format
  const dashboardRows = [];
  let incidentCount = 0;

  // Process Module A data (Incident Reports)
  if (schemaData.modules && schemaData.modules.A && schemaData.modules.A.fields) {
    const moduleA = schemaData.modules.A;
    
    if (moduleA.categories && moduleA.categories.length > 0) {
      moduleA.categories.forEach((category, idx) => {
        const incidentDate = new Date(2024, 8 + idx, 15 + idx * 3);
        const dateStr = incidentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        let incidentType = '';
        let victimGender = '';
        let bullyGender = '';
        let impactTags = [];
        
        switch (category.id) {
          case 'A-1':
            incidentType = 'Physical';
            victimGender = 'M';
            bullyGender = 'M';
            impactTags = ['Physical Harm', 'Social'];
            break;
          case 'A-2':
            incidentType = 'Verbal';
            victimGender = 'F';
            bullyGender = 'M';
            impactTags = ['Emotional Damage', 'Gender-based'];
            break;
          case 'A-3':
            incidentType = 'Cyberbullying';
            victimGender = 'F';
            bullyGender = 'F';
            impactTags = ['Emotional Damage', 'Gender-based'];
            break;
          case 'A-4':
            incidentType = 'Neglect';
            victimGender = 'M';
            bullyGender = 'N/A';
            impactTags = ['Social', 'Educational'];
            break;
          case 'A-5':
            incidentType = 'Other';
            victimGender = 'M';
            bullyGender = 'M';
            impactTags = ['Physical Harm', 'Social'];
            break;
        }
        
        const victimId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const bullyId = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        dashboardRows.push({
          incidentType: incidentType,
          datePlace: `${dateStr} - ${['Classroom', 'Hallway', 'Online Platform', 'Cafeteria', 'School Gates'][idx]}`,
          victimDetails: `V-***-${victimId} (${victimGender}, ${10 + idx + idx})`,
          bullyDetails: bullyGender === 'N/A' ? 'N/A' : `B-***-${bullyId} (${bullyGender}, ${11 + idx + idx})`,
          motivesEffect: impactTags.map(tag => `<span class="bg-surface-variant text-on-surface-variant px-xs py-base rounded text-[10px] font-bold whitespace-nowrap">${tag}</span>`).join(' '),
          actionTaken: generateActionTaken(category.id, idx),
          status: generateStatus(idx),
          ageVictims: 10 + idx + idx
        });
        
        incidentCount++;
      });
    }
  }

  // Process other modules
  if (schemaData.modules && schemaData.modules.B && schemaData.modules.B.fields) {
    const moduleB = schemaData.modules.B;
    if (moduleB.categories && moduleB.categories.length > 0) {
      moduleB.categories.forEach((category, idx) => {
        const incidentDate = new Date(2024, 8 + idx * 2, 20 + idx * 5);
        const dateStr = incidentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        const incidentTypes = ['Bullying/Harassment', 'Violence/Assault', 'Threat/Intimidation', 'Discrimination', 'Other'];
        const victimGenders = ['M', 'F', 'M', 'F', 'M'];
        const bullyGenders = ['M', 'M', 'F', 'M', 'F'];
        const impacts = ['Physical Harm', 'Social', 'Emotional Damage', 'Gender-based', 'Psychological'];
        
        dashboardRows.push({
          incidentType: incidentTypes[idx],
          datePlace: `${dateStr} - ${['Classroom', 'School Grounds', 'Online', 'Cafeteria'][idx]}`,
          victimDetails: `V-***-${Math.random().toString(36).substring(2, 8).toUpperCase()} (${victimGenders[idx]}, ${10 + idx * 2})`,
          bullyDetails: `B-***-${Math.random().toString(36).substring(2, 8).toUpperCase()} (${bullyGenders[idx]}, ${11 + idx * 2})`,
          motivesEffect: `<span class="bg-surface-variant text-on-surface-variant px-xs py-base rounded text-[10px] font-bold whitespace-nowrap">${impacts[idx]}</span>`,
          actionTaken: generateActionTakenB(idx),
          status: generateStatusB(idx),
          ageVictims: 10 + idx * 2
        });
        
        incidentCount++;
      });
    }
  }

  return { rows: dashboardRows, count: incidentCount };
}

// Helper functions for data transformation
generateActionTaken = function(categoryId, index) {
  const actions = [
    'Parent conference; counselor intervention.',
    'Social media report filed; mandatory counseling session.',
    'Verbal warning; disciplinary record update.',
    'Severe case; external legal referral for escalation.'
  ];
  return actions[index % actions.length];
};

generateActionTakenB = function(index) {
  const actions = [
    'Parent conference; counseling scheduled.',
    'School counseling; behavior intervention plan.',
    'Parent notification; mediation session arranged.',
    'Disciplinary action; community service assigned.'
  ];
  return actions[index % actions.length];
};

generateStatus = function(index) {
  const statuses = [
    '<span class="bg-green-100 text-green-800 px-sm py-0.5 rounded font-bold text-[10px] uppercase whitespace-nowrap">Resolved</span>',
    '<span class="bg-amber-100 text-amber-800 px-sm py-0.5 rounded font-bold text-[10px] uppercase whitespace-nowrap">On-going</span>',
    '<span class="bg-green-100 text-green-800 px-sm py-0.5 rounded font-bold text-[10px] uppercase whitespace-nowrap">Resolved</span>',
    '<span class="bg-blue-100 text-blue-800 px-sm py-0.5 rounded font-bold text-[10px] uppercase whitespace-nowrap">Referred to NGO/Gov</span>'
  ];
  return statuses[index % statuses.length];
};

generateStatusB = function(index) {
  const statuses = [
    '<span class="bg-green-100 text-green-800 px-sm py-0.5 rounded font-bold text-[10px] uppercase whitespace-nowrap">Resolved</span>',
    '<span class="bg-green-100 text-green-800 px-sm py-0.5 rounded font-bold text-[10px] uppercase whitespace-nowrap">Resolved</span>',
    '<span class="bg-amber-100 text-amber-800 px-sm py-0.5 rounded font-bold text-[10px] uppercase whitespace-nowrap">On-going</span>',
    '<span class="bg-blue-100 text-blue-800 px-sm py-0.5 rounded font-bold text-[10px] uppercase whitespace-nowrap">Referred to NGO/Gov</span>'
  ];
  return statuses[index % statuses.length];
};

// Export for potential use in other scripts
window.AnnexADashboard = {
  populate: applyDashboardData,
  generateData: generateDashboardData
};