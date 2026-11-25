async function request(path, { token, body, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  const response = await fetch(path, {
    ...options,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `The API returned a non-JSON response (${response.status}). Check that the Fastify server is running and its MySQL settings are configured.`,
    );
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      `The API returned invalid JSON (${response.status}). Check the Fastify server logs.`,
    );
  }
  if (!response.ok) {
    throw new Error(result.error || 'The request could not be completed.');
  }
  return result;
}

export function signIn(credentials) {
  return request('/api/login', { method: 'POST', body: credentials });
}

export function registerAccount(role, values) {
  return request(`/api/register/${role}`, { method: 'POST', body: values });
}

export function getProfile(token) {
  return request('/api/profile', { token });
}

export async function getWorkspace(token, role) {
  const [customers, departments, agents, tickets] = await Promise.all([
    role === 'manager' ? request('/api/customers', { token }) : Promise.resolve([]),
    role === 'manager' ? request('/api/departments', { token }) : Promise.resolve([]),
    role === 'manager' ? request('/api/agents', { token }) : Promise.resolve([]),
    request('/api/tickets', { token }),
  ]);
  return { customers, departments, agents, tickets };
}

export function saveRecord(token, resource, id, values) {
  return request(`/api/${resource}${id ? `/${id}` : ''}`, {
    method: id ? 'PUT' : 'POST',
    token,
    body: values,
  });
}

export function deleteRecord(token, resource, id) {
  return request(`/api/${resource}/${id}`, { method: 'DELETE', token });
}

export function ticketAction(token, ticketId, action, body) {
  return request(`/api/tickets/${ticketId}/${action}`, {
    method: 'POST',
    token,
    body,
  });
}

export function updateTicket(token, ticketId, values) {
  return request(`/api/tickets/${ticketId}`, {
    method: 'PUT',
    token,
    body: values,
  });
}

export function getMessages(token, ticketId) {
  return request(`/api/tickets/${ticketId}/messages`, { token });
}

export function sendMessage(token, ticketId, message) {
  return request(`/api/tickets/${ticketId}/messages`, {
    method: 'POST',
    token,
    body: { message },
  });
}

export function getNotifications(token) {
  return request('/api/notifications', { token });
}

export function markNotificationRead(token, id) {
  return request(`/api/notifications/${id}/read`, { method: 'POST', token, body: {} });
}

export function updatePresence(token) {
  return request('/api/presence', { method: 'POST', token, body: {} });
}
