(function() {
  function getAvatarSrc(url, email) {
    if (!url) return '';
    var key = 'avatar_cache_' + (email || 'default');
    try {
      var cached = localStorage.getItem(key);
      if (cached) return cached;
    } catch (e) {}
    fetch(url, { referrerPolicy: 'no-referrer' }).then(function(r) {
      if (!r.ok) throw new Error('fetch failed');
      return r.blob();
    }).then(function(blob) {
      return new Promise(function(res) {
        var reader = new FileReader();
        reader.onloadend = function() { res(reader.result); };
        reader.readAsDataURL(blob);
      });
    }).then(function(dataUrl) {
      try { localStorage.setItem(key, dataUrl); } catch (e) {}
      // Update avatar element in sidebar if present
      var img = document.querySelector('#sidebar-root img');
      if (img) img.src = dataUrl;
    }).catch(function() {});
    return url;
  }

  function init() {
    if (!window.__user) { setTimeout(init, 100); return; }

    var user = window.__user;
    var path = window.location.pathname;
    var isAdmin = user.role === 'admin';
    var avatarUrl = getAvatarSrc(user.avatarUrl, user.email);

    var initials = (user.fullName || 'U')
      .split(' ')
      .map(function(w) { return w[0]; })
      .join('')
      .toUpperCase()
      .slice(0, 2);

    var navItems = isAdmin
      ? [
          { label: 'Overview', icon: 'dashboard', href: '/admin' },
          { label: 'Reports', icon: 'description', href: '/reports' },
          { label: 'Access Management', icon: 'admin_panel_settings', href: '/access' }
        ]
      : [
          { label: 'Submissions', icon: 'description', href: '/submissions' },
          { label: 'Access Management', icon: 'admin_panel_settings', href: '/analytics' }
        ];

    var sidebar = document.getElementById('sidebar-root');
    if (!sidebar) return;

    sidebar.innerHTML = [
      '<aside class="flex fixed left-0 top-16 bottom-0 w-[64px] lg:w-64 flex-col p-xs lg:p-sm bg-surface-container-low/80 backdrop-blur-sm border-r border-outline-variant z-40 transition-all overflow-hidden">',
      '<div class="flex items-center justify-center lg:justify-start gap-sm p-xs lg:p-md mb-lg">',
      '<div class="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-bold flex-shrink-0 overflow-hidden">',
      avatarUrl
        ? '<img src="' + avatarUrl + '" alt="" referrerpolicy="no-referrer" crossorigin="anonymous" class="w-full h-full object-cover" />'
        : initials,
      '</div>',
      '<div class="min-w-0 hidden lg:block">',
      '<p class="font-label-md text-on-surface truncate">' + (user.fullName || 'User') + '</p>',
      '<p class="text-xs text-on-surface-variant truncate">' + (user.schoolName || (isAdmin ? 'Division Office' : '—')) + '</p>',
      '</div>',
      '</div>',
      '<nav class="space-y-xs">',
      navItems.map(function(item) {
        var isActive = path === item.href;
        var cls = isActive
          ? 'flex items-center justify-center lg:justify-start gap-sm p-sm lg:px-md lg:py-sm rounded-lg font-label-md transition-colors bg-secondary-container text-on-secondary-container'
          : 'flex items-center justify-center lg:justify-start gap-sm p-sm lg:px-md lg:py-sm rounded-lg font-label-md transition-colors text-on-surface-variant hover:bg-surface-variant';
        return '<a class="' + cls + '" href="' + item.href + '" title="' + item.label + '">' +
          '<span class="material-symbols-outlined flex-shrink-0">' + item.icon + '</span>' +
          '<span class="hidden lg:inline whitespace-nowrap">' + item.label + '</span>' +
        '</a>';
      }).join(''),
      '</nav>',
      '</aside>'
    ].join('');
  }

  window.renderSidebar = init;
  window.addEventListener('user_updated', init);
  init();
})();
