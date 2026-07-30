(function() {
  // Wait for window.__user to be set by auth-guard.js
  function init() {
    if (!window.__user) { setTimeout(init, 100); return; }

    const user = window.__user;
    const path = window.location.pathname;
    const isAdmin = user.role === 'admin';

    const initials = (user.fullName || 'U')
      .split(' ')
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    const navItems = isAdmin
      ? [
          { label: 'Overview', icon: 'dashboard', href: '/admin' },
          { label: 'Reports', icon: 'description', href: '/reports' },
          { label: 'Access Management', icon: 'admin_panel_settings', href: '/access' }
        ]
      : [
          { label: 'Submissions', icon: 'description', href: '/submissions' },
          { label: 'Access Management', icon: 'admin_panel_settings', href: '/analytics' }
        ];

    const sidebar = document.getElementById('sidebar-root');
    if (!sidebar) return;

    sidebar.innerHTML = `
      <aside class="hidden lg:flex fixed left-0 top-16 bottom-0 w-64 flex-col p-sm bg-surface-container-low/80 backdrop-blur-sm border-r border-outline-variant z-40">
        <div class="flex items-center gap-sm p-md mb-lg">
          <div class="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-bold flex-shrink-0 overflow-hidden">
            ${user.avatarUrl
              ? '<img src="' + user.avatarUrl + '" alt="" class="w-full h-full object-cover" />'
              : initials}
          </div>
          <div class="min-w-0">
            <p class="font-label-md text-on-surface truncate">${user.fullName || 'User'}</p>
            <p class="text-xs text-on-surface-variant truncate">${user.schoolName || (isAdmin ? 'Division Office' : '—')}</p>
          </div>
        </div>
        <nav class="space-y-xs">
          ${navItems.map(function(item) {
            var isActive = path === item.href;
            var cls = isActive
              ? 'flex items-center gap-sm px-md py-sm rounded-lg font-label-md transition-colors bg-secondary-container text-on-secondary-container'
              : 'flex items-center gap-sm px-md py-sm rounded-lg font-label-md transition-colors text-on-surface-variant hover:bg-surface-variant';
            return '<a class="' + cls + '" href="' + item.href + '">' +
              '<span class="material-symbols-outlined flex-shrink-0">' + item.icon + '</span>' +
              item.label +
            '</a>';
          }).join('')}
        </nav>
      </aside>
    `;
  }

  init();
})();
