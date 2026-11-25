const navigation = [
  { id: 'overview', label: 'Overview', symbol: 'OV' },
  { id: 'tickets', label: 'Tickets', symbol: 'TK' },
  { id: 'customers', label: 'Customers', symbol: 'CU' },
  { id: 'agents', label: 'Agents', symbol: 'AG' },
  { id: 'departments', label: 'Departments', symbol: 'DP' },
];

export default function AppShell({ activePage, onNavigate, onLogout, user, notifications = [], children }) {
  const visibleNavigation = navigation.filter(item =>
    user.role === 'manager' || ['overview', 'tickets'].includes(item.id)
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand sidebar-brand" href="/" aria-label="Helpdesk home">
          <span className="brand-mark">H</span>
          <span>helpdesk<span className="brand-period">.</span></span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {visibleNavigation.map(item => (
            <button
              type="button"
              key={item.id}
              className={`nav-item ${activePage === item.id ? 'is-selected' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <span className="nav-symbol">{item.symbol}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <span className="help-dot" />
            <div><strong>All systems ready</strong><small>Workspace is up to date</small></div>
          </div>
          <button type="button" className="nav-item nav-logout" onClick={onLogout}>
            <span className="nav-symbol">↗</span>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Helpdesk</span><span className="breadcrumb-divider">/</span>
            <strong>{visibleNavigation.find(item => item.id === activePage)?.label || 'Overview'}</strong>
          </div>
          <div className="topbar-actions">
            {['manager', 'customer'].includes(user.role) && (
              <button
                type="button"
                className="notification-button"
                onClick={() => onNavigate('overview')}
                aria-label={`Notifications${notifications.length ? `, ${notifications.length} unread` : ''}`}
                title="View notifications"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M10 21h4" />
                </svg>
                {notifications.length > 0 && (
                  <span className="notification-count" aria-hidden="true">
                    {notifications.length > 9 ? '9+' : notifications.length}
                  </span>
                )}
              </button>
            )}
            <div className="profile-chip">
              <span className="avatar">{user.username.slice(0, 1).toUpperCase()}</span>
              <span className="profile-copy">
                <strong>{user.username}</strong>
                <small>{user.role}</small>
              </span>
            </div>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
