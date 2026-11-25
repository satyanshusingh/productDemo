import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteRecord,
  getNotifications,
  getProfile,
  getWorkspace,
  markNotificationRead,
  registerAccount,
  saveRecord,
  signIn,
  ticketAction,
  updateTicket,
  updatePresence,
} from './api.js';
import AppShell from './components/AppShell.jsx';
import CrudPage from './components/CrudPage.jsx';
import DashboardHome from './components/DashboardHome.jsx';
import LoginPage from './components/LoginPage.jsx';
import Toast from './components/Toast.jsx';
import TicketsPage from './components/TicketsPage.jsx';

const emptyWorkspace = {
  customers: [],
  departments: [],
  agents: [],
  tickets: [],
};

const customerFields = [
  { name: 'full_name', label: 'Full name', required: true, maxLength: 120 },
  { name: 'email', label: 'Email address', type: 'email', required: true, maxLength: 190 },
  { name: 'phone', label: 'Phone', maxLength: 20 },
  {
    name: 'username',
    label: 'Login username',
    required: true,
    requiredOnEdit: false,
    maxLength: 32,
    hint: 'Customers use this username to sign in.',
  },
  {
    name: 'password',
    label: 'Login password',
    type: 'password',
    required: true,
    requiredOnEdit: false,
    minLength: 8,
    maxLength: 128,
    hint: 'At least 8 characters. Passwords are stored as hashes; leave blank when editing to keep the current one.',
  },
];

const departmentFields = [
  { name: 'department_name', label: 'Department name', required: true, maxLength: 80 },
];

function agentFields(departments) {
  return [
    { name: 'full_name', label: 'Full name', required: true, maxLength: 120 },
    { name: 'email', label: 'Email address', type: 'email', required: true, maxLength: 190 },
    {
      name: 'department_id',
      label: 'Department',
      type: 'select',
      required: true,
      placeholder: 'Select a department',
      options: departments.map(item => ({
        value: item.department_id,
        label: item.department_name,
      })),
    },
    {
      name: 'role',
      label: 'Role',
      type: 'select',
      required: true,
      options: [
        { value: 'Agent', label: 'Agent' },
        { value: 'Manager', label: 'Manager' },
      ],
      defaultValue: 'Agent',
    },
    { name: 'is_active', label: 'Active agent', type: 'checkbox', defaultValue: true },
    {
      name: 'username',
      label: 'Login username',
      maxLength: 32,
      requiredWhen: (values, record) => !record && values.role === 'Agent',
      hint: 'Required for Agent profiles. Reuse an unlinked agent username to connect that login.',
    },
    {
      name: 'password',
      label: 'Login password',
      type: 'password',
      minLength: 8,
      maxLength: 128,
      requiredWhen: (values, record) => !record && values.role === 'Agent',
      hint: 'At least 8 characters. Passwords are stored as hashes; on edit, leave blank to keep the current one.',
    },
  ];
}

function messageFromError(error) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('helpdesk-token'));
  const [user, setUser] = useState(null);
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [activePage, setActivePage] = useState('overview');
  const [loading, setLoading] = useState(Boolean(token));
  const [toast, setToast] = useState('');
  const [notifications, setNotifications] = useState([]);

  const refreshWorkspace = useCallback(async (role = user?.role) => {
    if (!token) return;
    const data = await getWorkspace(token, role);
    setWorkspace(data);
  }, [token, user?.role]);

  useEffect(() => {
    let active = true;
    if (!token) {
      setLoading(false);
      setUser(null);
      setWorkspace(emptyWorkspace);
      setNotifications([]);
      return () => { active = false; };
    }

    setLoading(true);
    getProfile(token)
      .then(async profile => {
        const [data, alerts] = await Promise.all([
          getWorkspace(token, profile.role),
          ['manager', 'customer'].includes(profile.role) ? getNotifications(token) : Promise.resolve([]),
        ]);
        if (!active) return;
        setUser(profile);
        setWorkspace(data);
        setNotifications(alerts);
      })
      .catch(error => {
        if (!active) return;
        setToast(messageFromError(error));
        sessionStorage.removeItem('helpdesk-token');
        setToken(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!token || !user) return undefined;
    const refresh = async () => {
      try {
        const [data, alerts] = await Promise.all([
          getWorkspace(token, user.role),
          ['manager', 'customer'].includes(user.role) ? getNotifications(token) : Promise.resolve([]),
        ]);
        setWorkspace(data);
        setNotifications(alerts);
        if (user.role === 'customer') await updatePresence(token);
      } catch (error) {
        setToast(messageFromError(error));
      }
    };
    if (user.role === 'customer') {
      updatePresence(token).catch(error => setToast(messageFromError(error)));
    }
    const refreshInterval = user.role === 'manager' ? 15000 : 5000;
    const refreshOnFocus = () => refresh();
    const timer = window.setInterval(refresh, refreshInterval);
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, [token, user]);

  const handleLogin = async (credentials, mode = 'login') => {
    const result = mode === 'register'
      ? await registerAccount(credentials.role === 'agent' ? 'agent' : 'customer', credentials)
      : await signIn(credentials);
    sessionStorage.setItem('helpdesk-token', result.token);
    setUser(result.user);
    setToken(result.token);
    setActivePage('overview');
  };

  const handleLogout = () => {
    sessionStorage.removeItem('helpdesk-token');
    setToken(null);
    setUser(null);
    setWorkspace(emptyWorkspace);
    setNotifications([]);
  };

  const handleSave = async (resource, id, values) => {
    try {
      await saveRecord(token, resource, id, values);
      await refreshWorkspace();
      setToast(id ? 'Changes saved.' : 'Record created.');
    } catch (error) {
      setToast(messageFromError(error));
      throw error;
    }
  };

  const handleDelete = async (resource, id) => {
    try {
      await deleteRecord(token, resource, id);
      await refreshWorkspace();
      setToast('Record deleted.');
    } catch (error) {
      setToast(messageFromError(error));
    }
  };

  const handleTicketAction = async (ticketId, action, body) => {
    const updated = await ticketAction(token, ticketId, action, body);
    await refreshWorkspace();
    return updated;
  };

  const handleUpdateTicket = async (ticketId, values) => {
    const updated = await updateTicket(token, ticketId, values);
    await refreshWorkspace();
    setToast('Ticket updated.');
    return updated;
  };

  const handleCreateTicket = async values => {
    await saveRecord(token, 'tickets', null, values);
    await refreshWorkspace();
    setToast(user.role === 'manager'
      ? 'Ticket created and assigned to the selected agent.'
      : 'Ticket created. A manager has been notified.');
  };

  const handleReadNotification = async id => {
    try {
      await markNotificationRead(token, id);
      setNotifications(current => current.filter(item => item.notification_id !== id));
    } catch (error) {
      setToast(messageFromError(error));
    }
  };

  const pages = useMemo(() => ({
    customers: {
      title: 'Customers',
      description: 'Manage customer contact details and account records.',
      resource: 'customers',
      rows: workspace.customers,
      fields: customerFields,
      idField: 'customer_id',
      columns: [
        { key: 'full_name', label: 'Customer' },
        { key: 'email', label: 'Email' },
        { key: 'username', label: 'Login ID', empty: 'Not set' },
        { key: 'phone', label: 'Phone', empty: '—' },
        {
          key: 'created_at',
          label: 'Added',
          render: value => value ? new Date(value).toLocaleDateString() : '—',
        },
      ],
    },
    departments: {
      title: 'Departments',
      description: 'Organize the team into the departments that handle support.',
      resource: 'departments',
      rows: workspace.departments,
      fields: departmentFields,
      idField: 'department_id',
      columns: [{ key: 'department_name', label: 'Department' }],
    },
    agents: {
      title: 'Agents',
      description: 'Manage team members, roles, and department assignments.',
      resource: 'agents',
      rows: workspace.agents,
      fields: agentFields(workspace.departments),
      idField: 'agent_id',
      columns: [
        { key: 'full_name', label: 'Agent' },
        { key: 'email', label: 'Email' },
        { key: 'username', label: 'Login ID', empty: 'Not set' },
        { key: 'department_name', label: 'Department' },
        { key: 'role', label: 'Role' },
        {
          key: 'is_active',
          label: 'Status',
          render: value => (
            <span className={`status-pill ${value ? 'is-active' : 'is-inactive'}`}>
              {value ? 'Active' : 'Inactive'}
            </span>
          ),
        },
      ],
    },
  }), [workspace]);

  if (!token) {
    return (
      <>
        <LoginPage onSubmit={handleLogin} />
        <Toast message={toast} onClose={() => setToast('')} />
      </>
    );
  }

  if (loading || !user) {
    return <main className="loading-screen"><span className="spinner" />Loading your workspace…</main>;
  }

  const canManage = user.role === 'manager';
  const selectedPage = pages[activePage];

  return (
    <>
      <AppShell
        activePage={activePage}
        onNavigate={setActivePage}
        onLogout={handleLogout}
        user={user}
        notifications={notifications}
      >
        {activePage === 'overview' ? (
          <DashboardHome
            workspace={workspace}
            onNavigate={setActivePage}
            user={user}
            notifications={notifications}
            onReadNotification={handleReadNotification}
          />
        ) : activePage === 'tickets' ? (
          <TicketsPage
            token={token}
            user={user}
            tickets={workspace.tickets}
            customers={workspace.customers}
            agents={workspace.agents}
            onAction={handleTicketAction}
            onCreate={handleCreateTicket}
            onUpdate={handleUpdateTicket}
            onNavigate={setActivePage}
          />
        ) : selectedPage ? (
          <CrudPage
            key={activePage}
            {...selectedPage}
            canManage={canManage}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        ) : null}
      </AppShell>
      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}
