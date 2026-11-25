const $ = id => document.getElementById(id);
const priorities = ['Critical', 'High', 'Medium', 'Low'];
const statuses = ['Open', 'In Progress', 'Pending Approval', 'Closed', 'Cancelled'];
let accessToken = null;
let socket = null;
let user = null;
let connected = false;
let tickets = [];
let agents = [];
let pendingAgentRemoval = null;

function log(message) {
    const item = document.createElement('li');
    item.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
    $('log').prepend(item);
}

function setConnected(value) {
    connected = value;
    $('loginView').hidden = value;
    $('workspace').hidden = !value;
    $('sendMessage').disabled = !connected;
    $('logout').disabled = !connected;
    $('logout').hidden = !connected;
    $('loginButton').hidden = connected;
    $('loginMessage').hidden = connected;
    $('loginRole').disabled = connected;
    $('username').disabled = connected;
    $('password').disabled = connected;
    $('loginButton').disabled = connected;
    $('managerTools').hidden = !connected || user?.role !== 'manager';
    $('status').className = connected
        ? 'connection-status online'
        : 'connection-status';
    $('status').textContent = connected
        ? `Connected as ${user.username} (${user.role})`
        : 'Not connected';
    renderTickets();
}

function renderAgents() {
    for (const id of ['ticketAssignee', 'editTicketAssignee']) {
        const select = $(id);
        const selected = select.value;
        select.replaceChildren(new Option('Unassigned', ''));
        for (const agent of agents) {
            select.append(new Option(agent.username, agent.id));
        }
        if (agents.some(agent => agent.id === selected)) {
            select.value = selected;
        }
    }

    $('agentCount').textContent = `${agents.length} ${agents.length === 1 ? 'agent' : 'agents'}`;
    const list = $('agentsList');
    list.replaceChildren();
    if (!agents.length) {
        const empty = document.createElement('li');
        empty.className = 'agent-list-empty';
        empty.textContent = 'No agents registered.';
        list.append(empty);
        return;
    }

    for (const agent of agents) {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = agent.username;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'button-danger';
        remove.dataset.removeAgent = agent.id;
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Remove agent ${agent.username}`);
        item.append(name, remove);
        list.append(item);
    }
}

function sortTickets(items) {
    const statusOrder = new Map(statuses.map((status, index) => [status, index]));
    const priorityOrder = new Map(priorities.map((priority, index) => [priority, index]));
    return [...items].sort((a, b) =>
        (priorityOrder.get(a.priority) ?? priorities.length) -
        (priorityOrder.get(b.priority) ?? priorities.length) ||
        (statusOrder.get(a.status) ?? statuses.length) -
        (statusOrder.get(b.status) ?? statuses.length) ||
        a.createdAt.localeCompare(b.createdAt)
    );
}

function upsertTicket(ticket) {
    const index = tickets.findIndex(item => item.id === ticket.id);
    if (index === -1) {
        tickets.push(ticket);
    } else {
        tickets[index] = ticket;
    }
    renderTickets();
}

function renderTickets() {
    const body = $('tickets');
    body.replaceChildren();

    if (!tickets.length) {
        const row = body.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 6;
        cell.textContent = connected ? 'No tickets yet.' : 'Log in to load tickets.';
        return;
    }

    const hasActiveTicket = user?.role === 'agent' && tickets.some(ticket =>
        ticket.status === 'In Progress' && ticket.assignee === user.username
    );

    for (const ticket of sortTickets(tickets)) {
        const row = body.insertRow();
        row.insertCell().textContent = ticket.id;
        const detailCell = row.insertCell();
        const titleButton = document.createElement('button');
        titleButton.type = 'button';
        titleButton.className = 'ticket-open';
        titleButton.dataset.openTicket = ticket.id;
        titleButton.textContent = ticket.title;
        detailCell.append(titleButton);
        if (ticket.description) {
            const description = document.createElement('small');
            description.textContent = ticket.description;
            detailCell.append(document.createElement('br'), description);
        }
        row.insertCell().textContent = ticket.priority;
        const statusCell = row.insertCell();
        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge status-${ticket.status.toLowerCase().replaceAll(' ', '-')}`;
        statusBadge.textContent = ticket.status;
        statusCell.append(statusBadge);
        row.insertCell().textContent = ticket.assignee || '—';

        const actionCell = row.insertCell();
        if (!connected) {
            actionCell.textContent = '—';
        } else if (user.role === 'manager') {
            if (ticket.status === 'Pending Approval') {
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.approveTicket = ticket.id;
                button.textContent = 'Approve';
                actionCell.append(button);
            }
            if (!['Closed', 'Cancelled'].includes(ticket.status)) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'button-danger';
                button.dataset.cancelTicket = ticket.id;
                button.textContent = 'Cancel';
                actionCell.append(button);
            }
            if (!actionCell.childElementCount) actionCell.textContent = '—';
        } else if (ticket.status === 'Open' &&
                   (!ticket.assignee || ticket.assignee === user.username)) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.claimTicket = ticket.id;
            button.disabled = hasActiveTicket;
            button.textContent = hasActiveTicket ? 'Active ticket in progress' : 'Claim ticket';
            actionCell.append(button);
        } else if (ticket.status === 'In Progress' &&
                   ticket.assignee === user.username) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.resolveTicket = ticket.id;
            button.textContent = 'Send for approval';
            actionCell.append(button);
        } else if (ticket.status === 'Pending Approval') {
            actionCell.textContent = 'Awaiting manager review';
        } else {
            actionCell.textContent = '—';
        }
    }
}

function sendSocketMessage(message) {
    if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        return true;
    }
    log('Not connected to the helpdesk.');
    return false;
}

function showTicketDetails(ticket) {
    $('ticketDetailsTitle').textContent = `${ticket.id} · ${ticket.title}`;
    const details = $('ticketDetails');
    details.replaceChildren();
    const rows = [
        ['Description', ticket.description || 'No description provided'],
        ['Priority', ticket.priority],
        ['Status', ticket.status],
        ['Assigned agent', ticket.assignee || 'Unassigned'],
        ['Created', new Date(ticket.createdAt).toLocaleString()],
        ['Sent for approval', ticket.resolvedAt
            ? new Date(ticket.resolvedAt).toLocaleString()
            : '—']
    ];
    for (const [label, value] of rows) {
        const term = document.createElement('dt');
        term.textContent = label;
        const description = document.createElement('dd');
        description.textContent = value;
        details.append(term, description);
    }
    $('editTicketFromDetails').hidden = user?.role !== 'manager' ||
        ['Closed', 'Cancelled'].includes(ticket.status);
    $('editTicketFromDetails').dataset.editTicket = ticket.id;
    $('ticketDetailsDialog').showModal();
}

function showTicketEditor(ticket) {
    $('editTicketId').value = ticket.id;
    $('editTicketTitle').value = ticket.title;
    $('editTicketDescription').value = ticket.description || '';
    $('editTicketPriority').value = ticket.priority;
    const assignedAgent = agents.find(agent => agent.username === ticket.assignee);
    $('editTicketAssignee').value = assignedAgent?.id || '';
    $('ticketDetailsDialog').close();
    $('ticketEditDialog').showModal();
}

function connectWebSocket() {
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const currentSocket = new WebSocket(`${scheme}//${location.host}/ws`);
    socket = currentSocket;

    currentSocket.addEventListener('open', () => {
        currentSocket.send(JSON.stringify({ type: 'auth', token: accessToken }));
    });

    currentSocket.addEventListener('message', event => {
        if (socket !== currentSocket) return;

        let data;
        try {
            data = JSON.parse(event.data);
        } catch {
            log('Received an invalid server message.');
            return;
        }

        switch (data.type) {
            case 'auth:ok':
                user = data.user;
                tickets = data.tickets;
                agents = data.agents || [];
                renderAgents();
                setConnected(true);
                log(`Connected as ${data.user.username} (${data.user.role}).`);
                break;
            case 'chat:new':
                log(`${data.from} (${data.role}): ${data.text}`);
                break;
            case 'ticket:created':
                upsertTicket(data.ticket);
                log(`${data.createdBy} created ${data.ticket.id} (${data.ticket.priority}).`);
                break;
            case 'ticket:updated':
                upsertTicket(data.ticket);
                log(`${data.updatedBy} updated ${data.ticket.id} to ${data.ticket.status}.`);
                break;
            case 'agent:registered':
                if (!agents.some(agent => agent.username === data.username)) {
                    agents.push({ id: data.id, username: data.username });
                    renderAgents();
                }
                log(`Agent ${data.username} was registered.`);
                break;
            case 'agent:removed':
                agents = agents.filter(agent => agent.id !== data.id);
                renderAgents();
                log(`Agent ${data.username} was removed.`);
                break;
            case 'error':
                log(`Server error: ${data.message}`);
                break;
        }
    });

    currentSocket.addEventListener('close', event => {
        if (socket !== currentSocket) return;
        accessToken = null;
        user = null;
        tickets = [];
        agents = [];
        setConnected(false);
        log(`WebSocket closed (${event.code}).`);
    });

    currentSocket.addEventListener('error', () => {
        if (socket === currentSocket) {
            log('WebSocket connection error.');
        }
    });
}

$('loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    $('loginMessage').textContent = '';
    socket?.close();
    socket = null;
    accessToken = null;
    user = null;
    tickets = [];
    agents = [];
    setConnected(false);

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: $('username').value,
                password: $('password').value,
                role: $('loginRole').value
            })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Login failed');
        }

        accessToken = result.token;
        user = result.user;
        $('loginMessage').textContent = '';
        log('Login successful. Connecting to live helpdesk.');
        connectWebSocket();
    } catch (error) {
        const message = error.message || 'Wrong login ID or password. Please try again.';
        $('loginMessage').textContent = message;
        log(`Login error: ${message}`);
    }
});

$('agentForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!sendSocketMessage({
        type: 'agent:register',
        username: $('agentUsername').value,
        password: $('agentPassword').value
    })) return;

    $('agentPassword').value = '';
    $('agentForm').reset();
});

$('ticketForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!sendSocketMessage({
        type: 'ticket:create',
        title: $('ticketTitle').value,
        description: $('ticketDescription').value,
        priority: $('ticketPriority').value,
        assigneeId: $('ticketAssignee').value || null
    })) return;
    $('ticketForm').reset();
});

$('tickets').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.dataset.openTicket) {
        const ticket = tickets.find(item => item.id === button.dataset.openTicket);
        if (ticket) showTicketDetails(ticket);
    } else if (button.dataset.claimTicket) {
        sendSocketMessage({
            type: 'ticket:claim',
            ticketId: button.dataset.claimTicket
        });
    } else if (button.dataset.resolveTicket) {
        sendSocketMessage({
            type: 'ticket:resolve',
            ticketId: button.dataset.resolveTicket
        });
    } else if (button.dataset.approveTicket) {
        sendSocketMessage({
            type: 'ticket:approve',
            ticketId: button.dataset.approveTicket
        });
    } else if (button.dataset.cancelTicket) {
        sendSocketMessage({
            type: 'ticket:cancel',
            ticketId: button.dataset.cancelTicket
        });
    }
});

$('editTicketFromDetails').addEventListener('click', event => {
    const ticket = tickets.find(item => item.id === event.currentTarget.dataset.editTicket);
    if (ticket) showTicketEditor(ticket);
});

$('ticketEditForm').addEventListener('submit', event => {
    event.preventDefault();
    if (!sendSocketMessage({
        type: 'ticket:update',
        ticketId: $('editTicketId').value,
        title: $('editTicketTitle').value,
        description: $('editTicketDescription').value,
        priority: $('editTicketPriority').value,
        assigneeId: $('editTicketAssignee').value || null
    })) return;
    $('ticketEditDialog').close();
});

$('agentsList').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-agent]');
    if (!button) return;
    const agent = agents.find(item => item.id === button.dataset.removeAgent);
    if (!agent) return;
    pendingAgentRemoval = agent.id;
    $('removeAgentMessage').textContent =
        `Do you want to remove ${agent.username}? Any active tickets assigned to this agent will be reopened.`;
    $('removeAgentDialog').showModal();
});

$('confirmRemoveAgent').addEventListener('click', () => {
    if (!pendingAgentRemoval) return;
    sendSocketMessage({
        type: 'agent:remove',
        agentId: pendingAgentRemoval
    });
    pendingAgentRemoval = null;
    $('removeAgentDialog').close();
});

document.querySelectorAll('[data-close-dialog]').forEach(button => {
    button.addEventListener('click', () => button.closest('dialog').close());
});

$('removeAgentDialog').addEventListener('close', () => {
    pendingAgentRemoval = null;
});

$('chatForm').addEventListener('submit', event => {
    event.preventDefault();
    const text = $('message').value.trim();
    if (!text || !sendSocketMessage({ type: 'chat:send', text })) return;
    $('message').value = '';
});

$('logout').addEventListener('click', () => {
    accessToken = null;
    user = null;
    tickets = [];
    agents = [];
    socket?.close(1000, 'User disconnected');
    setConnected(false);
    log('Disconnected from the WebSocket.');
});

renderTickets();
