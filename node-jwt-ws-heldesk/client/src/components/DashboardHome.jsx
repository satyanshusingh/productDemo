import { useEffect, useState } from 'react';
import { ticketStatusLabel } from '../ticketStatus.js';

const formatDate = value => value ? new Date(value).toLocaleDateString() : '—';

export default function DashboardHome({ workspace, onNavigate, user, notifications = [], onReadNotification }) {
  const [recentPage, setRecentPage] = useState(0);
  const recentPageSize = 5;
  const openTickets = workspace.tickets.filter(ticket =>
    ['Open', 'Reopened', 'In Progress'].includes(ticket.status)
  ).length;
  const activeAgents = workspace.agents.filter(agent => Boolean(agent.is_active)).length;
  const recentPageCount = Math.max(1, Math.ceil(workspace.tickets.length / recentPageSize));
  const recentTickets = workspace.tickets.slice(
    recentPage * recentPageSize,
    (recentPage + 1) * recentPageSize,
  );
  const statuses = ['Open', 'In Progress', 'On Hold', 'Completed', 'Resolved', 'Reopened'];
  const statusCounts = statuses.map(status => ({
    status,
    count: workspace.tickets.filter(ticket => ticket.status === status).length,
  }));
  const maxStatusCount = Math.max(1, ...statusCounts.map(item => item.count));

  useEffect(() => {
    if (recentPage >= recentPageCount) setRecentPage(recentPageCount - 1);
  }, [recentPage, recentPageCount]);

  return (
    <>
      <section className="welcome-banner">
        <div>
          <p className="eyebrow">YOUR SUPPORT DESK</p>
          <h1>Welcome back, {user.username}.</h1>
          <p>{user.role === 'customer' ? 'Track your support requests and replies from your support team.' : 'Here’s what’s happening across your customer support team.'}</p>
        </div>
        <div className="welcome-art" aria-hidden="true"><span>H</span></div>
      </section>

      <section className="stats-grid" aria-label="Workspace summary">
        <article className="stat-card">
          <span className="stat-icon icon-blue">TK</span>
          <span className="stat-label">Total tickets</span>
          <strong>{workspace.tickets.length}</strong>
          <small>Across all statuses</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon icon-amber">OP</span>
          <span className="stat-label">Open work</span>
          <strong>{openTickets}</strong>
          <small>Open or in progress</small>
        </article>
        {user.role === 'manager' ? <>
          <article className="stat-card">
            <span className="stat-icon icon-green">CU</span>
            <span className="stat-label">Customers</span>
            <strong>{workspace.customers.length}</strong>
            <small>In your directory</small>
          </article>
          <article className="stat-card">
            <span className="stat-icon icon-purple">AG</span>
            <span className="stat-label">Active agents</span>
            <strong>{activeAgents}</strong>
            <small>Ready to support</small>
          </article>
        </> : <>
          <article className="stat-card">
            <span className="stat-icon icon-green">IP</span>
            <span className="stat-label">In progress</span>
            <strong>{workspace.tickets.filter(ticket => ticket.status === 'In Progress').length}</strong>
            <small>{user.role === 'customer' ? 'Being worked on' : 'Assigned to your queue'}</small>
          </article>
          <article className="stat-card">
            <span className="stat-icon icon-purple">DN</span>
            <span className="stat-label">{user.role === 'customer' ? 'Complete' : 'Available'}</span>
            <strong>{user.role === 'customer'
              ? workspace.tickets.filter(ticket => ticket.status === 'Resolved').length
              : workspace.tickets.filter(ticket => ['Open', 'Reopened'].includes(ticket.status)).length}</strong>
            <small>{user.role === 'customer' ? 'Completed requests' : 'Ready for pickup'}</small>
          </article>
        </>}
      </section>

      {user.role === 'manager' && (
        <section className="content-card report-card">
          <div className="table-toolbar"><div><h2>Ticket status distribution</h2><p>Current workload across all tickets</p></div></div>
          <div className="status-chart" role="img" aria-label="Ticket counts by status">
            {statusCounts.map(item => (
              <div className="chart-row" key={item.status}>
                <span>{ticketStatusLabel(item.status)}</span>
                <div className="chart-track"><span style={{ width: `${Math.max(item.count ? 4 : 0, (item.count / maxStatusCount) * 100)}%` }} /></div>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      {notifications.length > 0 && (
        <section className="content-card notification-card">
          <div className="table-toolbar"><div><h2>{user.role === 'manager' ? 'Team notifications' : 'Ticket updates'}</h2><p>Recent activity that may need your attention</p></div></div>
          <ul className="notification-list">
            {notifications.slice(0, 5).map(notification => (
              <li key={notification.notification_id}>
                <span>{notification.message}<small>{formatDate(notification.created_at)}</small></span>
                <button className="text-button" onClick={() => onReadNotification(notification.notification_id)}>Dismiss</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="content-card overview-card">
        <div className="table-toolbar">
          <div>
            <h2>Recent tickets</h2>
            <p>The latest requests from your customers</p>
          </div>
          <button type="button" className="text-button" onClick={() => onNavigate('tickets')}>
            View all tickets <span aria-hidden="true">→</span>
          </button>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Ticket</th><th>Customer</th><th>Priority</th><th>Status</th><th>Created</th></tr>
            </thead>
            <tbody>
              {recentTickets.length ? recentTickets.map(ticket => (
                <tr key={ticket.ticket_id}>
                  <td><strong>#{ticket.ticket_id}</strong><br /><span className="table-subtitle">{ticket.title}</span></td>
                  <td>{ticket.customer_name}</td>
                  <td><span className={`priority-pill priority-${ticket.priority.toLowerCase()}`}>{ticket.priority}</span></td>
                  <td><span className={`status-pill status-${ticket.status.toLowerCase().replaceAll(' ', '-')}`}>{ticketStatusLabel(ticket.status)}</span></td>
                  <td>{formatDate(ticket.created_at)}</td>
                </tr>
              )) : (
                <tr><td className="empty-table" colSpan="5">No tickets have been created yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {workspace.tickets.length > recentPageSize && (
          <div className="pagination">
            <span>
              Showing {recentPage * recentPageSize + 1}–
              {Math.min((recentPage + 1) * recentPageSize, workspace.tickets.length)} of {workspace.tickets.length} tickets
            </span>
            <div>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setRecentPage(page => Math.max(0, page - 1))}
                disabled={recentPage === 0}
              >
                Previous
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setRecentPage(page => Math.min(recentPageCount - 1, page + 1))}
                disabled={recentPage + 1 >= recentPageCount}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {user.role === 'manager' && (
        <section className="quick-actions">
          <div>
            <p className="eyebrow">GET ORGANIZED</p>
            <h2>Manage your workspace</h2>
          </div>
          <button type="button" className="quick-action" onClick={() => onNavigate('customers')}>
            <span className="nav-symbol">CU</span><span><strong>Customers</strong><small>Update contact records</small></span><b>→</b>
          </button>
          <button type="button" className="quick-action" onClick={() => onNavigate('agents')}>
            <span className="nav-symbol">AG</span><span><strong>Agents</strong><small>Organize your team</small></span><b>→</b>
          </button>
          <button type="button" className="quick-action" onClick={() => onNavigate('departments')}>
            <span className="nav-symbol">DP</span><span><strong>Departments</strong><small>Group support work</small></span><b>→</b>
          </button>
        </section>
      )}
    </>
  );
}
