import { useEffect, useMemo, useState } from 'react';
import { getMessages, sendMessage } from '../api.js';
import { ticketStatusLabel } from '../ticketStatus.js';

const formatDate = value => value ? new Date(value).toLocaleString() : '—';

function Conversation({ token, ticket, onClose }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await getMessages(token, ticket.ticket_id);
        if (active) {
          setMessages(result);
          setError('');
        }
      } catch (loadError) {
        if (active) setError(loadError.message);
      }
    };
    load();
    const timer = window.setInterval(load, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [ticket.ticket_id, token]);

  useEffect(() => {
    if (ticket.status === 'Resolved') setDraft('');
  }, [ticket.status]);

  const submit = async event => {
    event.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    setError('');
    try {
      const message = await sendMessage(token, ticket.ticket_id, draft);
      setMessages(current => [...current, message]);
      setDraft('');
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="conversation-dialog" role="dialog" aria-modal="true" aria-labelledby="conversation-title">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">TICKET #{ticket.ticket_id}</p>
            <h2 id="conversation-title">{ticket.title}</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close conversation">×</button>
        </div>
        <div className="conversation-history" aria-live="polite">
          {messages.length ? messages.map(message => (
            <article className={`conversation-message message-${message.sender_role}`} key={message.message_id}>
              <div><strong>{message.sender_name}</strong><small>{message.sender_role} · {formatDate(message.created_at)}</small></div>
              <p>{message.message}</p>
            </article>
          )) : (
            <p className="conversation-empty">
              {ticket.status === 'Resolved'
                ? 'This ticket has been resolved.'
                : 'No messages yet. Start the conversation below.'}
            </p>
          )}
        </div>
        {ticket.status === 'Resolved' ? (
          <div className="conversation-closed" role="status">
            This conversation is closed. The customer can reopen the ticket to continue chatting.
          </div>
        ) : (
          <form className="conversation-compose" onSubmit={submit}>
            <label className="field" htmlFor="ticket-message">
              <span>Reply</span>
              <textarea id="ticket-message" value={draft} onChange={event => setDraft(event.target.value)} maxLength={4000} rows={3} required />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="button" className="button-secondary" onClick={onClose}>Close</button>
              <button type="submit" className="button-primary" disabled={sending || !draft.trim()}>
                {sending ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function TicketDialog({ ticket, user, customers, agents, onClose, onCreate, onUpdate }) {
  const [values, setValues] = useState(() => ticket
    ? { title: ticket.title, description: ticket.description || '', priority: ticket.priority }
    : { title: '', description: '', priority: 'Medium', customer_id: '', agent_id: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const customerAccounts = customers.filter(customer => customer.username);
  const activeAgents = agents.filter(
    agent => agent.is_active && agent.role === 'Agent' && agent.username,
  );
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (ticket) await onUpdate(ticket.ticket_id, values);
      else await onCreate(values);
      onClose();
    } catch (createError) {
      setError(createError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="form-dialog" role="dialog" aria-modal="true" aria-labelledby="ticket-form-title">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">{ticket ? 'EDIT REQUEST' : 'NEW REQUEST'}</p>
            <h2 id="ticket-form-title">{ticket ? 'Edit support ticket' : 'Create a support ticket'}</h2>
          </div>
          <button type="button" className="close-button" onClick={onClose} disabled={saving} aria-label="Close dialog">×</button>
        </div>
        <form className="entity-form" onSubmit={submit}>
          {!ticket && user.role === 'manager' && (
            <>
              <label className="field" htmlFor="ticket-customer">
                <span>Customer <b>*</b></span>
                <select
                  id="ticket-customer"
                  value={values.customer_id}
                  onChange={event => setValues(current => ({ ...current, customer_id: event.target.value }))}
                  required
                >
                  <option value="">Select a customer</option>
                  {customerAccounts.map(customer => (
                    <option value={customer.customer_id} key={customer.customer_id}>
                      {customer.full_name} ({customer.email})
                    </option>
                  ))}
                </select>
                {!customerAccounts.length && (
                  <small className="field-hint">Create or link a customer login before creating a ticket.</small>
                )}
              </label>
              <label className="field" htmlFor="ticket-agent">
                <span>Assign to agent <b>*</b></span>
                <select
                  id="ticket-agent"
                  value={values.agent_id}
                  onChange={event => setValues(current => ({ ...current, agent_id: event.target.value }))}
                  required
                >
                  <option value="">Select an active agent</option>
                  {activeAgents.map(agent => (
                    <option value={agent.agent_id} key={agent.agent_id}>
                      {agent.full_name}
                    </option>
                  ))}
                </select>
                {!activeAgents.length && (
                  <small className="field-hint">Create or link an active agent login before assigning a ticket.</small>
                )}
              </label>
            </>
          )}
          <label className="field" htmlFor="ticket-title"><span>Issue summary <b>*</b></span>
            <input id="ticket-title" value={values.title} onChange={event => setValues(current => ({ ...current, title: event.target.value }))} maxLength={200} required />
          </label>
          <label className="field" htmlFor="ticket-description"><span>Describe the issue</span>
            <textarea id="ticket-description" value={values.description} onChange={event => setValues(current => ({ ...current, description: event.target.value }))} maxLength={10000} rows={4} />
          </label>
          <label className="field" htmlFor="ticket-priority"><span>Priority</span>
            <select id="ticket-priority" value={values.priority} onChange={event => setValues(current => ({ ...current, priority: event.target.value }))}>
              {['Low', 'Medium', 'High', 'Critical'].map(priority => <option key={priority}>{priority}</option>)}
            </select>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button type="button" className="button-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="button-primary" disabled={saving}>
              {saving ? 'Saving…' : ticket ? 'Save changes' : 'Create ticket'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function TicketsPage({
  token,
  user,
  tickets,
  customers,
  agents,
  onAction,
  onCreate,
  onUpdate,
  onNavigate,
}) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDirection, setSortDirection] = useState(-1);
  const [page, setPage] = useState(0);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editingTicket, setEditingTicket] = useState(null);
  const [assignments, setAssignments] = useState({});
  const [busyTicket, setBusyTicket] = useState(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const pageSize = 8;
  const availableAgents = agents.filter(agent => agent.is_active && agent.role === 'Agent');
  const selectedTicket = tickets.find(ticket => ticket.ticket_id === selectedTicketId);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleTickets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tickets
      .filter(ticket => !query || [
        ticket.ticket_id,
        ticket.title,
        ticket.customer_name,
        ticket.assigned_agent_name,
        ticket.status,
        ticketStatusLabel(ticket.status),
        ticket.priority,
      ].some(value => `${value ?? ''}`.toLowerCase().includes(query)))
      .sort((first, second) => {
        const a = first[sortKey] ?? '';
        const b = second[sortKey] ?? '';
        const comparison = typeof a === 'number' && typeof b === 'number'
          ? a - b
          : `${a}`.localeCompare(`${b}`, undefined, { numeric: true, sensitivity: 'base' });
        return comparison * sortDirection;
      });
  }, [search, sortDirection, sortKey, tickets]);
  const pageCount = Math.max(1, Math.ceil(visibleTickets.length / pageSize));
  const pageTickets = visibleTickets.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => setPage(0), [search, sortKey]);
  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  const sortBy = key => {
    if (sortKey === key) setSortDirection(direction => -direction);
    else {
      setSortKey(key);
      setSortDirection(1);
    }
  };

  const canEditTicket = ticket => {
    const createdAtEpoch = Number(ticket.created_at_epoch);
    const createdAt = Number.isFinite(createdAtEpoch) && createdAtEpoch > 0
      ? createdAtEpoch * 1000
      : Date.parse(ticket.created_at);
    return Number.isFinite(createdAt) && now >= createdAt && now - createdAt < 5 * 60 * 1000;
  };

  const perform = async (ticket, action, body) => {
    setBusyTicket(ticket.ticket_id);
    setError('');
    try {
      await onAction(ticket.ticket_id, action, body);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusyTicket(null);
    }
  };

  const actionsFor = ticket => {
    const busy = busyTicket === ticket.ticket_id;
    if (user.role === 'manager') {
      if (ticket.status === 'On Hold') {
        return <button className="icon-action" disabled={busy} onClick={() => perform(ticket, 'reactivate')}>Reopen queue</button>;
      }
      if (ticket.status === 'Completed') {
        return <button className="icon-action" disabled={busy} onClick={() => perform(ticket, 'resolve')}>Approve</button>;
      }
      if (['Open', 'Reopened'].includes(ticket.status)) {
        return (
          <span className="assign-controls">
            <select aria-label={`Assign ticket ${ticket.ticket_id}`} value={assignments[ticket.ticket_id] || ''} onChange={event => setAssignments(current => ({ ...current, [ticket.ticket_id]: event.target.value }))}>
              <option value="">Assign agent…</option>
              {availableAgents.map(agent => <option value={agent.agent_id} key={agent.agent_id}>{agent.full_name}</option>)}
            </select>
            <button className="icon-action" disabled={busy || !assignments[ticket.ticket_id]} onClick={() => perform(ticket, 'assign', { agent_id: assignments[ticket.ticket_id] })}>Assign</button>
          </span>
        );
      }
    }
    if (user.role === 'agent') {
      if (['Open', 'Reopened'].includes(ticket.status)) {
        return <button className="icon-action" disabled={busy} onClick={() => perform(ticket, 'pickup')}>Pick up</button>;
      }
      if (ticket.status === 'In Progress' && ticket.assigned_agent_id === user.agent_id) {
        return <>
          <button className="icon-action" disabled={busy} onClick={() => perform(ticket, 'hold')}>On hold</button>
          <button className="icon-action" disabled={busy} onClick={() => perform(ticket, 'complete')}>Complete</button>
        </>;
      }
    }
    if (user.role === 'customer' && ticket.status === 'Resolved') {
      return (
        <>
          {canEditTicket(ticket) && (
            <button className="icon-action" disabled={busy} onClick={() => setEditingTicket(ticket)}>Edit</button>
          )}
          <button className="icon-action" disabled={busy} onClick={() => perform(ticket, 'reopen')}>Reopen</button>
        </>
      );
    }
    if (user.role === 'customer' && canEditTicket(ticket)) {
      return <button className="icon-action" disabled={busy} onClick={() => setEditingTicket(ticket)}>Edit</button>;
    }
    return null;
  };

  const tableColumns = [
    ['ticket_id', '#'], ['title', 'Ticket'], ['customer_name', 'Customer'],
    ['assigned_agent_name', 'Assignee'], ['priority', 'Priority'], ['status', 'Status'], ['created_at', 'Created'],
  ];

  return (
    <>
      <section className="page-heading">
        <div><p className="eyebrow">SUPPORT WORKSPACE</p><h1>{user.role === 'customer' ? 'My tickets' : 'Tickets'}</h1>
          <p className="page-description">{user.role === 'customer' ? 'Raise a request, follow updates, and talk to your support team.' : 'Pick up work, keep customers updated, and move tickets through review.'}</p>
          <button type="button" className="text-button back-link" onClick={() => onNavigate('overview')}>
            ← Back to overview
          </button>
        </div>
        {['customer', 'manager'].includes(user.role) && (
          <button className="button-primary create-button" onClick={() => setCreating(true)}>
            <span>+</span> New ticket
          </button>
        )}
      </section>
      <section className="content-card">
        <div className="table-toolbar">
          <div><h2>{visibleTickets.length} {visibleTickets.length === 1 ? 'ticket' : 'tickets'}</h2><p>{user.role === 'manager' ? 'Manager review and assignment queue' : user.role === 'agent' ? 'Your work and tickets available for pickup' : 'Your support requests'}</p></div>
          <label className="search-box"><span className="search-icon">⌕</span><input type="search" placeholder="Search tickets" value={search} onChange={event => setSearch(event.target.value)} /></label>
        </div>
        {error && <p className="ticket-error" role="alert">{error}</p>}
        <div className="table-scroll">
          <table className="data-table ticket-table">
            <thead><tr>{tableColumns.map(([key, label]) => (
              <th key={key}><button className="sort-button" onClick={() => sortBy(key)}>{label}{sortKey === key ? (sortDirection > 0 ? ' ↑' : ' ↓') : ''}</button></th>
            ))}<th>Conversation</th><th>Actions</th></tr></thead>
            <tbody>{pageTickets.length ? pageTickets.map(ticket => (
              <tr key={ticket.ticket_id}>
                <td>#{ticket.ticket_id}</td>
                <td><strong>{ticket.title}</strong><br /><span className="table-subtitle">{ticket.description || 'No description'}</span></td>
                <td>{ticket.customer_name}{user.role === 'manager' && ticket.status === 'On Hold' && <small className={`availability ${ticket.customer_online ? 'online' : ''}`}>{ticket.customer_online ? 'Online' : 'Offline'}</small>}</td>
                <td>{ticket.assigned_agent_name || 'Unassigned'}</td>
                <td><span className={`priority-pill priority-${ticket.priority.toLowerCase()}`}>{ticket.priority}</span></td>
                <td><span className={`status-pill status-${ticket.status.toLowerCase().replaceAll(' ', '-')}`}>{ticketStatusLabel(ticket.status)}</span></td>
                <td>{formatDate(ticket.created_at)}</td>
                <td><button className="icon-action" onClick={() => setSelectedTicketId(ticket.ticket_id)}>View chat</button></td>
                <td className="row-actions">{actionsFor(ticket)}</td>
              </tr>
            )) : <tr><td className="empty-table" colSpan={tableColumns.length + 2}>No tickets match this view.</td></tr>}</tbody>
          </table>
        </div>
        {visibleTickets.length > pageSize && <div className="pagination">
          <span>Page {page + 1} of {pageCount}</span>
          <div><button className="button-secondary" onClick={() => setPage(value => Math.max(0, value - 1))} disabled={page === 0}>Previous</button>
            <button className="button-secondary" onClick={() => setPage(value => Math.min(pageCount - 1, value + 1))} disabled={page + 1 >= pageCount}>Next</button></div>
        </div>}
      </section>
      {selectedTicket && <Conversation token={token} ticket={selectedTicket} onClose={() => setSelectedTicketId(null)} />}
      {creating && (
        <TicketDialog
          user={user}
          customers={customers}
          agents={agents}
          onClose={() => setCreating(false)}
          onCreate={onCreate}
          onUpdate={onUpdate}
        />
      )}
      {editingTicket && (
        <TicketDialog
          key={editingTicket.ticket_id}
          ticket={editingTicket}
          user={user}
          customers={customers}
          agents={agents}
          onClose={() => setEditingTicket(null)}
          onCreate={onCreate}
          onUpdate={onUpdate}
        />
      )}
    </>
  );
}
