import 'dotenv/config';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import mysql from 'mysql2/promise';

const PORT = Number(process.env.PORT || 3000);
const DB_PORT = Number(process.env.DB_PORT || 3306);
const APP_ORIGIN = process.env.APP_ORIGIN || `http://localhost:${PORT}`;
const configuredCorsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
const CORS_ORIGINS = [...new Set([APP_ORIGIN, ...configuredCorsOrigins])];
const JWT_SECRET = process.env.JWT_SECRET;
const DATA_FILE = new URL('./data/helpdesk.json', import.meta.url);
const scryptAsync = promisify(scrypt);
const roles = ['Agent', 'Manager'];
const priorities = ['Low', 'Medium', 'High', 'Critical'];

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('Invalid PORT');
}
if (!Number.isInteger(DB_PORT) || DB_PORT < 1 || DB_PORT > 65535) {
    throw new Error('Invalid DB_PORT');
}
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
}

const missingDatabaseSettings = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
    .filter(name => process.env[name] === undefined ||
        (name !== 'DB_PASSWORD' && !process.env[name].trim()));
if (missingDatabaseSettings.length) {
    throw new Error(`Missing MySQL settings in .env: ${missingDatabaseSettings.join(', ')}`);
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    timezone: 'Z'
});

function httpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function sendJSON(reply, statusCode, data) {
    return reply
        .code(statusCode)
        .header('Cache-Control', 'no-store')
        .send(data);
}

function normalizedUsername(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validRole(role) {
    return role === 'agent' || role === 'manager' || role === 'customer';
}

function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: 'helpdesk-training',
        audience: 'helpdesk-browser'
    });
}

function parseId(value, label) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
        throw httpError(400, `Invalid ${label}`);
    }
    return id;
}

function objectBody(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw httpError(400, 'Request body must be a JSON object');
    }
    return value;
}

function requiredText(body, key, label, maxLength) {
    const value = typeof body[key] === 'string' ? body[key].trim() : '';
    if (!value || value.length > maxLength) {
        throw httpError(400, `${label} must be 1-${maxLength} characters`);
    }
    return value;
}

function optionalText(body, key, label, maxLength) {
    const value = body[key] === undefined || body[key] === null
        ? ''
        : typeof body[key] === 'string' ? body[key].trim() : null;
    if (value === null || value.length > maxLength) {
        throw httpError(400, `${label} must be at most ${maxLength} characters`);
    }
    return value || null;
}

function emailValue(body) {
    const email = requiredText(body, 'email', 'Email', 190);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw httpError(400, 'Enter a valid email address');
    }
    return email;
}

function loginCredentials(body, required = false) {
    if (body.username !== undefined && typeof body.username !== 'string') {
        throw httpError(400, 'Username must be text');
    }
    if (body.password !== undefined && typeof body.password !== 'string') {
        throw httpError(400, 'Password must be text');
    }
    const username = normalizedUsername(body.username);
    const password = body.password;
    const hasUsername = username.length > 0;
    const hasPassword = typeof password === 'string' && password.length > 0;

    if (required && (!hasUsername || !hasPassword)) {
        throw httpError(400, 'Login username and password are required');
    }
    if (hasUsername && !/^[a-z0-9._-]{3,32}$/.test(username)) {
        throw httpError(400, 'Username must be 3-32 letters, numbers, dots, underscores, or hyphens');
    }
    if (hasPassword && (password.length < 8 || password.length > 128)) {
        throw httpError(400, 'Password must be 8-128 characters');
    }

    return {
        username: hasUsername ? username : null,
        password: hasPassword ? password : null
    };
}

function serializeError(error) {
    if (error.code === 'ER_DUP_ENTRY') {
        return { statusCode: 409, message: 'A record with that email, username, or name already exists' };
    }
    if (['ER_ROW_IS_REFERENCED_2', 'ER_NO_REFERENCED_ROW_2'].includes(error.code)) {
        return { statusCode: 409, message: 'This record is linked to other helpdesk data' };
    }
    const statusCode = error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    return {
        statusCode,
        message: statusCode === 500 ? 'Internal server error' : error.message
    };
}

const app = Fastify({ bodyLimit: 64 * 1024 });
await app.register(cors, {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
});
app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    return payload;
});
app.setErrorHandler((error, request, reply) => {
    const response = serializeError(error);
    if (response.statusCode === 500) {
        request.log.error(error);
    }
    return sendJSON(reply, response.statusCode, { error: response.message });
});

async function createTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS departments (
            department_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            department_name VARCHAR(80) NOT NULL UNIQUE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS customers (
            customer_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            full_name VARCHAR(120) NOT NULL,
            email VARCHAR(190) NOT NULL UNIQUE,
            phone VARCHAR(20) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS agents (
            agent_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            department_id INT UNSIGNED NOT NULL,
            full_name VARCHAR(120) NOT NULL,
            email VARCHAR(190) NOT NULL UNIQUE,
            role ENUM('Agent', 'Manager') NOT NULL DEFAULT 'Agent',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            CONSTRAINT fk_agent_department FOREIGN KEY (department_id)
                REFERENCES departments(department_id) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS tickets (
            ticket_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            customer_id INT UNSIGNED NOT NULL,
            assigned_agent_id INT UNSIGNED NULL,
            title VARCHAR(200) NOT NULL,
            description TEXT NOT NULL,
            priority ENUM('Low', 'Medium', 'High', 'Critical') NOT NULL DEFAULT 'Medium',
            status ENUM('Open', 'In Progress', 'On Hold', 'Completed', 'Resolved', 'Reopened') NOT NULL DEFAULT 'Open',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            resolved_at DATETIME NULL,
            CONSTRAINT fk_ticket_customer FOREIGN KEY (customer_id)
                REFERENCES customers(customer_id),
            CONSTRAINT fk_ticket_agent FOREIGN KEY (assigned_agent_id)
                REFERENCES agents(agent_id) ON DELETE SET NULL,
            INDEX idx_tickets_status_created (status, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    const [ticketColumns] = await pool.query('SHOW COLUMNS FROM tickets');
    const statusColumn = ticketColumns.find(column => column.Field === 'status');
    if (statusColumn?.Type.includes("'Closed'")) {
        await pool.query(`
            UPDATE tickets
            SET status = 'Resolved', resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP)
            WHERE status = 'Closed'
        `);
    }
    await pool.query(`
        CREATE TABLE IF NOT EXISTS app_users (
            id VARCHAR(64) NOT NULL PRIMARY KEY,
            username VARCHAR(32) NOT NULL UNIQUE,
            role ENUM('agent', 'manager', 'customer') NOT NULL,
            customer_id INT UNSIGNED NULL,
            agent_id INT UNSIGNED NULL,
            password_salt CHAR(32) NOT NULL,
            password_hash CHAR(128) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    const [userColumns] = await pool.query('SHOW COLUMNS FROM app_users');
    const userColumnNames = new Set(userColumns.map(column => column.Field));
    if (!userColumnNames.has('customer_id')) {
        await pool.query('ALTER TABLE app_users ADD COLUMN customer_id INT UNSIGNED NULL');
    }
    if (!userColumnNames.has('agent_id')) {
        await pool.query('ALTER TABLE app_users ADD COLUMN agent_id INT UNSIGNED NULL');
    }
    await pool.query(`
        ALTER TABLE app_users
        MODIFY role ENUM('agent', 'manager', 'customer') NOT NULL
    `);
    await pool.query(`
        ALTER TABLE tickets
        MODIFY status ENUM('Open', 'In Progress', 'On Hold', 'Completed', 'Resolved', 'Reopened')
            NOT NULL DEFAULT 'Open'
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS ticket_messages (
            message_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            ticket_id BIGINT UNSIGNED NOT NULL,
            user_id VARCHAR(64) NOT NULL,
            sender_name VARCHAR(120) NOT NULL,
            sender_role ENUM('customer', 'agent', 'manager') NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_message_ticket FOREIGN KEY (ticket_id)
                REFERENCES tickets(ticket_id) ON DELETE CASCADE,
            INDEX idx_messages_ticket_created (ticket_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS notifications (
            notification_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            recipient_role ENUM('manager', 'customer') NOT NULL,
            recipient_id VARCHAR(64) NULL,
            ticket_id BIGINT UNSIGNED NULL,
            message VARCHAR(255) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            read_at DATETIME NULL,
            INDEX idx_notifications_recipient (recipient_role, recipient_id, read_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    const [customerColumns] = await pool.query('SHOW COLUMNS FROM customers');
    if (!customerColumns.some(column => column.Field === 'last_seen_at')) {
        await pool.query('ALTER TABLE customers ADD COLUMN last_seen_at DATETIME NULL');
    }

    await pool.query(`
        INSERT IGNORE INTO departments (department_name)
        VALUES ('Technical Support'), ('Customer Success')
    `);
}

async function passwordHash(password, salt) {
    return scryptAsync(password, salt, 64);
}

async function createUser(id, username, password, role) {
    const passwordSalt = randomBytes(16).toString('hex');
    const passwordHashValue = (await passwordHash(password, passwordSalt)).toString('hex');
    return { id, username, role, passwordSalt, passwordHash: passwordHashValue };
}

async function attachAgentLogin(connection, agentId, credentials) {
    if (!credentials.username || !credentials.password) {
        throw httpError(400, 'Set both a login username and password for the agent');
    }

    const [existingUsers] = await connection.execute(`
        SELECT id, role, agent_id
        FROM app_users
        WHERE username = ?
        LIMIT 1
        FOR UPDATE
    `, [credentials.username]);
    if (existingUsers.length) {
        const existingUser = existingUsers[0];
        if (existingUser.role !== 'agent' || existingUser.agent_id !== null) {
            throw httpError(409, 'That username is already linked to an account');
        }
        const salt = randomBytes(16).toString('hex');
        const hash = (await passwordHash(credentials.password, salt)).toString('hex');
        await connection.execute(`
            UPDATE app_users
            SET agent_id = ?, password_salt = ?, password_hash = ?
            WHERE id = ?
        `, [agentId, salt, hash, existingUser.id]);
        return credentials.username;
    }

    const user = await createUser(
        `u-${randomBytes(12).toString('hex')}`,
        credentials.username,
        credentials.password,
        'agent'
    );
    await connection.execute(`
        INSERT INTO app_users (id, username, role, agent_id, password_salt, password_hash)
        VALUES (?, ?, 'agent', ?, ?, ?)
    `, [user.id, user.username, agentId, user.passwordSalt, user.passwordHash]);
    return user.username;
}

async function seedAuthUsers() {
    const [existingUsers] = await pool.query('SELECT id FROM app_users LIMIT 1');
    if (existingUsers.length) return;

    let users;
    try {
        const legacyData = JSON.parse(await readFile(DATA_FILE, 'utf8'));
        users = Array.isArray(legacyData.users) ? legacyData.users : null;
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    if (!users?.length) {
        users = [
            await createUser('u-101', 'agent', 'Agent@123', 'agent'),
            await createUser('u-102', 'manager', 'Manager@123', 'manager')
        ];
    }

    for (const user of users) {
        await pool.execute(`
            INSERT INTO app_users (id, username, role, password_salt, password_hash)
            VALUES (?, ?, ?, ?, ?)
        `, [
            user.id,
            normalizedUsername(user.username),
            user.role,
            user.passwordSalt,
            user.passwordHash
        ]);
    }
}

async function authenticate(request, reply) {
    const authorization = request.headers.authorization || '';
    if (!authorization.startsWith('Bearer ')) {
        return sendJSON(reply, 401, { error: 'Bearer token required' });
    }

    let payload;
    try {
        payload = verifyToken(authorization.slice(7));
    } catch {
        return sendJSON(reply, 401, { error: 'Invalid or expired token' });
    }

    const [rows] = await pool.execute(`
        SELECT id, username, role, customer_id, agent_id
        FROM app_users
        WHERE id = ?
        LIMIT 1
    `, [payload.sub]);
    const account = rows[0];
    if (!account || account.role !== payload.role || !validRole(account.role)) {
        return sendJSON(reply, 401, { error: 'Invalid or expired token' });
    }
    request.user = account;
}

async function managerOnly(request, reply) {
    if (request.user?.role !== 'manager') {
        return sendJSON(reply, 403, { error: 'Manager only: access denied' });
    }
}

async function notifyManagers(ticketId, message) {
    await pool.execute(`
        INSERT INTO notifications (recipient_role, ticket_id, message)
        VALUES ('manager', ?, ?)
    `, [ticketId, message]);
}

async function ticketForUser(ticketId, user, executor = pool, lock = false) {
    const [rows] = await executor.execute(`
        SELECT ticket_id, customer_id, assigned_agent_id, status
        FROM tickets
        WHERE ticket_id = ?${lock ? ' FOR UPDATE' : ''}
    `, [ticketId]);
    const ticket = rows[0];
    if (!ticket) throw httpError(404, 'Ticket not found');
    if (user.role === 'customer' && ticket.customer_id !== user.customer_id) {
        throw httpError(403, 'You can only access your own tickets');
    }
    if (user.role === 'agent' &&
        ticket.assigned_agent_id !== user.agent_id &&
        !['Open', 'Reopened'].includes(ticket.status)) {
        throw httpError(403, 'This ticket is not available to your account');
    }
    return ticket;
}

function createSession(user) {
    const token = jwt.sign({
        username: user.username,
        role: user.role
    }, JWT_SECRET, {
        algorithm: 'HS256',
        subject: user.id,
        issuer: 'helpdesk-training',
        audience: 'helpdesk-browser',
        expiresIn: '15m'
    });
    return { token, tokenType: 'Bearer', expiresInSeconds: 900, user };
}

function requireJSON(request) {
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
        throw httpError(415, 'Content-Type must be application/json');
    }
}

app.post('/api/login', async (request, reply) => {
    requireJSON(request);
    const credentials = objectBody(request.body);
    const username = normalizedUsername(credentials.username);
    const password = credentials.password;

    if (!username || typeof password !== 'string' ||
        (credentials.role !== undefined &&
            (!validRole(credentials.role) || credentials.role !== credentials.role.toLowerCase()))) {
        return sendJSON(reply, 401, { error: 'Wrong username or password' });
    }

    const [rows] = await pool.execute(`
        SELECT id, username, role, password_salt, password_hash
        FROM app_users
        WHERE username = ?
        LIMIT 1
    `, [username]);
    const account = rows[0];
    if (!account || (credentials.role && credentials.role !== account.role)) {
        return sendJSON(reply, 401, { error: 'Wrong username or password' });
    }

    const suppliedHash = await passwordHash(password, account.password_salt);
    const storedHash = Buffer.from(account.password_hash, 'hex');
    if (suppliedHash.length !== storedHash.length ||
        !timingSafeEqual(suppliedHash, storedHash)) {
        return sendJSON(reply, 401, { error: 'Wrong username or password' });
    }

    const user = {
        id: account.id,
        username: account.username,
        role: account.role,
        customer_id: account.customer_id,
        agent_id: account.agent_id
    };
    return sendJSON(reply, 200, createSession(user));
});

app.post('/api/register/customer', async (request, reply) => {
    requireJSON(request);
    const body = objectBody(request.body);
    const fullName = requiredText(body, 'full_name', 'Full name', 120);
    const email = emailValue(body).toLowerCase();
    const username = normalizedUsername(body.username);
    const password = body.password;
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
        throw httpError(400, 'Username must be 3-32 letters, numbers, dots, underscores, or hyphens');
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        throw httpError(400, 'Password must be 8-128 characters');
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [existing] = await connection.execute(
            'SELECT customer_id FROM customers WHERE email = ? LIMIT 1',
            [email]
        );
        let customerId;
        if (existing.length) {
            customerId = existing[0].customer_id;
            const [linked] = await connection.execute(
                'SELECT id FROM app_users WHERE customer_id = ? LIMIT 1',
                [customerId]
            );
            if (linked.length) throw httpError(409, 'An account already exists for this email address');
        } else {
            const [customerResult] = await connection.execute(`
                INSERT INTO customers (full_name, email, phone)
                VALUES (?, ?, ?)
            `, [fullName, email, optionalText(body, 'phone', 'Phone', 20)]);
            customerId = customerResult.insertId;
        }
        const id = `u-${randomBytes(12).toString('hex')}`;
        const salt = randomBytes(16).toString('hex');
        const hash = (await passwordHash(password, salt)).toString('hex');
        await connection.execute(`
            INSERT INTO app_users (id, username, role, customer_id, password_salt, password_hash)
            VALUES (?, ?, 'customer', ?, ?, ?)
        `, [id, username, customerId, salt, hash]);
        await connection.commit();
        const user = { id, username, role: 'customer', customer_id: customerId, agent_id: null };
        return sendJSON(reply, 201, createSession(user));
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
});

app.post('/api/register/agent', async (request, reply) => {
    requireJSON(request);
    const body = objectBody(request.body);
    const fullName = requiredText(body, 'full_name', 'Full name', 120);
    const email = emailValue(body).toLowerCase();
    const username = normalizedUsername(body.username);
    const password = body.password;
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
        throw httpError(400, 'Username must be 3-32 letters, numbers, dots, underscores, or hyphens');
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        throw httpError(400, 'Password must be 8-128 characters');
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [existingAgents] = await connection.execute(`
            SELECT agent_id, role FROM agents WHERE email = ? LIMIT 1
        `, [email]);
        let agentId;
        if (existingAgents.length) {
            if (existingAgents[0].role !== 'Agent') {
                throw httpError(409, 'This email is already registered for a non-agent team account');
            }
            const [linkedAccounts] = await connection.execute(
                'SELECT id FROM app_users WHERE agent_id = ? LIMIT 1',
                [existingAgents[0].agent_id]
            );
            if (linkedAccounts.length) throw httpError(409, 'An account already exists for this email address');
            agentId = existingAgents[0].agent_id;
        } else {
            const [departmentRows] = await connection.query(
                'SELECT department_id FROM departments ORDER BY department_id LIMIT 1'
            );
            if (!departmentRows.length) throw httpError(409, 'Create a department before agent registration');
            const [agentResult] = await connection.execute(`
                INSERT INTO agents (department_id, full_name, email, role, is_active)
                VALUES (?, ?, ?, 'Agent', TRUE)
            `, [departmentRows[0].department_id, fullName, email]);
            agentId = agentResult.insertId;
        }
        const id = `u-${randomBytes(12).toString('hex')}`;
        const salt = randomBytes(16).toString('hex');
        const hash = (await passwordHash(password, salt)).toString('hex');
        await connection.execute(`
            INSERT INTO app_users (id, username, role, agent_id, password_salt, password_hash)
            VALUES (?, ?, 'agent', ?, ?, ?)
        `, [id, username, agentId, salt, hash]);
        await connection.commit();
        const user = { id, username, role: 'agent', customer_id: null, agent_id: agentId };
        return sendJSON(reply, 201, createSession(user));
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
});

app.get('/api/profile', { preHandler: authenticate }, async (request, reply) =>
    sendJSON(reply, 200, request.user));

app.get('/api/departments', { preHandler: authenticate }, async (request, reply) => {
    if (request.user.role !== 'manager') {
        return sendJSON(reply, 403, { error: 'Manager only: access denied' });
    }
    const [rows] = await pool.query(`
        SELECT department_id, department_name
        FROM departments
        ORDER BY department_name
    `);
    return sendJSON(reply, 200, rows);
});

app.post('/api/departments', { preHandler: [authenticate, managerOnly] }, async (request, reply) => {
    requireJSON(request);
    const body = objectBody(request.body);
    const name = requiredText(body, 'department_name', 'Department name', 80);
    const [result] = await pool.execute(
        'INSERT INTO departments (department_name) VALUES (?)',
        [name]
    );
    return sendJSON(reply, 201, {
        department_id: result.insertId,
        department_name: name
    });
});

app.put('/api/departments/:id', { preHandler: [authenticate, managerOnly] }, async (request, reply) => {
    requireJSON(request);
    const id = parseId(request.params.id, 'department ID');
    const name = requiredText(objectBody(request.body), 'department_name', 'Department name', 80);
    const [result] = await pool.execute(
        'UPDATE departments SET department_name = ? WHERE department_id = ?',
        [name, id]
    );
    if (!result.affectedRows) {
        const [existing] = await pool.execute(
            'SELECT department_id FROM departments WHERE department_id = ?',
            [id]
        );
        if (!existing.length) return sendJSON(reply, 404, { error: 'Department not found' });
    }
    return sendJSON(reply, 200, { department_id: id, department_name: name });
});

app.delete('/api/departments/:id', { preHandler: [authenticate, managerOnly] }, async (request, reply) => {
    const id = parseId(request.params.id, 'department ID');
    const [result] = await pool.execute(
        'DELETE FROM departments WHERE department_id = ?',
        [id]
    );
    if (!result.affectedRows) return sendJSON(reply, 404, { error: 'Department not found' });
    return sendJSON(reply, 200, { deleted: id });
});

app.get('/api/customers', { preHandler: authenticate }, async (request, reply) => {
    if (request.user.role !== 'manager') {
        return sendJSON(reply, 403, { error: 'Manager only: access denied' });
    }
    const [rows] = await pool.query(`
        SELECT c.customer_id, c.full_name, c.email, c.phone, c.created_at,
               u.username
        FROM customers c
        LEFT JOIN app_users u ON u.customer_id = c.customer_id AND u.role = 'customer'
        ORDER BY c.created_at DESC, c.customer_id DESC
    `);
    return sendJSON(reply, 200, rows);
});

app.post('/api/customers', { preHandler: [authenticate, managerOnly] }, async (request, reply) => {
    requireJSON(request);
    const body = objectBody(request.body);
    const customer = {
        fullName: requiredText(body, 'full_name', 'Full name', 120),
        email: emailValue(body),
        phone: optionalText(body, 'phone', 'Phone', 20)
    };
    const credentials = loginCredentials(body, true);
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [result] = await connection.execute(`
            INSERT INTO customers (full_name, email, phone)
            VALUES (?, ?, ?)
        `, [customer.fullName, customer.email, customer.phone]);
        const user = await createUser(
            `u-${randomBytes(12).toString('hex')}`,
            credentials.username,
            credentials.password,
            'customer'
        );
        await connection.execute(`
            INSERT INTO app_users (id, username, role, customer_id, password_salt, password_hash)
            VALUES (?, ?, 'customer', ?, ?, ?)
        `, [
            user.id,
            user.username,
            result.insertId,
            user.passwordSalt,
            user.passwordHash
        ]);
        await connection.commit();
        return sendJSON(reply, 201, {
            customer_id: result.insertId,
            ...customer,
            username: user.username
        });
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
});

app.put('/api/customers/:id', { preHandler: [authenticate, managerOnly] }, async (request, reply) => {
    requireJSON(request);
    const id = parseId(request.params.id, 'customer ID');
    const body = objectBody(request.body);
    const customer = {
        fullName: requiredText(body, 'full_name', 'Full name', 120),
        email: emailValue(body),
        phone: optionalText(body, 'phone', 'Phone', 20)
    };
    const credentials = loginCredentials(body);
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [result] = await connection.execute(`
            UPDATE customers
            SET full_name = ?, email = ?, phone = ?
            WHERE customer_id = ?
        `, [customer.fullName, customer.email, customer.phone, id]);
        if (!result.affectedRows) {
            const [existing] = await connection.execute(
                'SELECT customer_id FROM customers WHERE customer_id = ? FOR UPDATE',
                [id]
            );
            if (!existing.length) {
                await connection.rollback();
                return sendJSON(reply, 404, { error: 'Customer not found' });
            }
        }

        const [linkedUsers] = await connection.execute(`
            SELECT id, username
            FROM app_users
            WHERE customer_id = ? AND role = 'customer'
            LIMIT 1
            FOR UPDATE
        `, [id]);
        let username = linkedUsers[0]?.username || null;

        if (linkedUsers.length) {
            const updates = [];
            const values = [];
            if (credentials.username && credentials.username !== username) {
                updates.push('username = ?');
                values.push(credentials.username);
                username = credentials.username;
            }
            if (credentials.password) {
                const salt = randomBytes(16).toString('hex');
                const hash = (await passwordHash(credentials.password, salt)).toString('hex');
                updates.push('password_salt = ?', 'password_hash = ?');
                values.push(salt, hash);
            }
            if (updates.length) {
                await connection.execute(
                    `UPDATE app_users SET ${updates.join(', ')} WHERE id = ?`,
                    [...values, linkedUsers[0].id]
                );
            }
        } else if (credentials.username || credentials.password) {
            if (!credentials.username || !credentials.password) {
                throw httpError(400, 'Set both a login username and password to create the customer account');
            }
            const user = await createUser(
                `u-${randomBytes(12).toString('hex')}`,
                credentials.username,
                credentials.password,
                'customer'
            );
            await connection.execute(`
                INSERT INTO app_users (id, username, role, customer_id, password_salt, password_hash)
                VALUES (?, ?, 'customer', ?, ?, ?)
            `, [user.id, user.username, id, user.passwordSalt, user.passwordHash]);
            username = user.username;
        }

        await connection.commit();
        return sendJSON(reply, 200, { customer_id: id, ...customer, username });
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
});

app.delete('/api/customers/:id', { preHandler: [authenticate, managerOnly] }, async (request, reply) => {
    const id = parseId(request.params.id, 'customer ID');
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute(
            'DELETE FROM app_users WHERE customer_id = ? AND role = \'customer\'',
            [id]
        );
        const [result] = await connection.execute(
            'DELETE FROM customers WHERE customer_id = ?',
            [id]
        );
        if (!result.affectedRows) {
            await connection.rollback();
            return sendJSON(reply, 404, { error: 'Customer not found' });
        }
        await connection.commit();
        return sendJSON(reply, 200, { deleted: id });
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
});

app.get('/api/agents', { preHandler: authenticate }, async (request, reply) => {
    if (request.user.role !== 'manager') {
        return sendJSON(reply, 403, { error: 'Manager only: access denied' });
    }
    const [rows] = await pool.query(`
        SELECT a.agent_id, a.department_id, d.department_name, a.full_name, a.email,
               a.role, a.is_active, u.username
        FROM agents a
        JOIN departments d ON d.department_id = a.department_id
        LEFT JOIN app_users u ON u.agent_id = a.agent_id AND u.role = 'agent'
        ORDER BY a.full_name
    `);
    return sendJSON(reply, 200, rows);
});

app.post('/api/agents', { preHandler: [authenticate, managerOnly] }, async (request, reply) => {
    requireJSON(request);
    const body = objectBody(request.body);
    const agent = {
        departmentId: parseId(body.department_id, 'department ID'),
        fullName: requiredText(body, 'full_name', 'Full name', 120),
        email: emailValue(body),
        role: body.role || 'Agent',
        isActive: body.is_active === undefined ? true : body.is_active
    };
    if (!roles.includes(agent.role) || typeof agent.isActive !== 'boolean') {
        throw httpError(400, 'Choose a valid agent role and active status');
    }
    const credentials = loginCredentials(body, agent.role === 'Agent');
    if (agent.role !== 'Agent' && (credentials.username || credentials.password)) {
        throw httpError(400, 'Login credentials can only be assigned to Agent profiles');
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [result] = await connection.execute(`
            INSERT INTO agents (department_id, full_name, email, role, is_active)
            VALUES (?, ?, ?, ?, ?)
        `, [agent.departmentId, agent.fullName, agent.email, agent.role, agent.isActive]);
        const username = agent.role === 'Agent'
            ? await attachAgentLogin(connection, result.insertId, credentials)
            : null;
        await connection.commit();
        return sendJSON(reply, 201, { agent_id: result.insertId, ...agent, username });
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
});

app.put('/api/agents/:id', { preHandler: [authenticate, managerOnly] }, async (request, reply) => {
    requireJSON(request);
    const id = parseId(request.params.id, 'agent ID');
    const body = objectBody(request.body);
    const agent = {
        departmentId: parseId(body.department_id, 'department ID'),
        fullName: requiredText(body, 'full_name', 'Full name', 120),
        email: emailValue(body),
        role: body.role,
        isActive: body.is_active
    };
    if (!roles.includes(agent.role) || typeof agent.isActive !== 'boolean') {
        throw httpError(400, 'Choose a valid agent role and active status');
    }
    const credentials = loginCredentials(body);
    if (agent.role !== 'Agent' && (credentials.username || credentials.password)) {
        throw httpError(400, 'Login credentials can only be assigned to Agent profiles');
    }
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [existingAgents] = await connection.execute(
            'SELECT agent_id FROM agents WHERE agent_id = ? FOR UPDATE',
            [id]
        );
        if (!existingAgents.length) {
            await connection.rollback();
            return sendJSON(reply, 404, { error: 'Agent not found' });
        }
        const [linkedUsers] = await connection.execute(`
            SELECT id, username
            FROM app_users
            WHERE agent_id = ? AND role = 'agent'
            LIMIT 1
            FOR UPDATE
        `, [id]);
        if (agent.role !== 'Agent' && linkedUsers.length) {
            throw httpError(409, 'Unlink the agent login before changing this profile to Manager');
        }

        await connection.execute(`
            UPDATE agents
            SET department_id = ?, full_name = ?, email = ?, role = ?, is_active = ?
            WHERE agent_id = ?
        `, [agent.departmentId, agent.fullName, agent.email, agent.role, agent.isActive, id]);

        let username = linkedUsers[0]?.username || null;
        if (linkedUsers.length) {
            const updates = [];
            const values = [];
            if (credentials.username && credentials.username !== username) {
                updates.push('username = ?');
                values.push(credentials.username);
                username = credentials.username;
            }
            if (credentials.password) {
                const salt = randomBytes(16).toString('hex');
                const hash = (await passwordHash(credentials.password, salt)).toString('hex');
                updates.push('password_salt = ?', 'password_hash = ?');
                values.push(salt, hash);
            }
            if (updates.length) {
                await connection.execute(
                    `UPDATE app_users SET ${updates.join(', ')} WHERE id = ?`,
                    [...values, linkedUsers[0].id]
                );
            }
        } else if (credentials.username || credentials.password) {
            username = await attachAgentLogin(connection, id, credentials);
        }

        await connection.commit();
        return sendJSON(reply, 200, { agent_id: id, ...agent, username });
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
});

app.delete('/api/agents/:id', { preHandler: [authenticate, managerOnly] }, async (request, reply) => {
    const id = parseId(request.params.id, 'agent ID');
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute(
            'DELETE FROM app_users WHERE agent_id = ? AND role = \'agent\'',
            [id]
        );
        const [result] = await connection.execute('DELETE FROM agents WHERE agent_id = ?', [id]);
        if (!result.affectedRows) {
            await connection.rollback();
            return sendJSON(reply, 404, { error: 'Agent not found' });
        }
        await connection.commit();
        return sendJSON(reply, 200, { deleted: id });
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
});

const ticketSelect = `
    SELECT t.ticket_id, t.customer_id, c.full_name AS customer_name,
           CASE WHEN c.last_seen_at >= CURRENT_TIMESTAMP - INTERVAL 2 MINUTE
                THEN TRUE ELSE FALSE END AS customer_online,
           t.assigned_agent_id, a.full_name AS assigned_agent_name,
           t.title, t.description, t.priority, t.status, t.created_at,
           UNIX_TIMESTAMP(t.created_at) AS created_at_epoch,
           t.updated_at, t.resolved_at
    FROM tickets t
    JOIN customers c ON c.customer_id = t.customer_id
    LEFT JOIN agents a ON a.agent_id = t.assigned_agent_id
`;

app.get('/api/tickets', { preHandler: authenticate }, async (request, reply) => {
    const user = request.user;
    let condition = '';
    let parameters = [];
    if (user.role === 'customer') {
        condition = 'WHERE t.customer_id = ?';
        parameters = [user.customer_id];
    } else if (user.role === 'agent') {
        condition = 'WHERE t.assigned_agent_id = ? OR (t.assigned_agent_id IS NULL AND t.status IN (\'Open\', \'Reopened\'))';
        parameters = [user.agent_id];
    }
    const [rows] = await pool.execute(
        `${ticketSelect} ${condition} ORDER BY t.created_at DESC, t.ticket_id DESC`,
        parameters
    );
    return sendJSON(reply, 200, rows);
});

app.post('/api/tickets', { preHandler: authenticate }, async (request, reply) => {
    const isCustomer = request.user.role === 'customer' && Boolean(request.user.customer_id);
    const isManager = request.user.role === 'manager';
    if (!isCustomer && !isManager) {
        return sendJSON(reply, 403, { error: 'Only customers and managers can create support tickets' });
    }
    requireJSON(request);
    const body = objectBody(request.body);
    const ticket = {
        customerId: isManager
            ? parseId(body.customer_id, 'customer ID')
            : request.user.customer_id,
        agentId: isManager ? parseId(body.agent_id, 'agent ID') : null,
        title: requiredText(body, 'title', 'Title', 200),
        description: typeof body.description === 'string' ? body.description.trim() : '',
        priority: body.priority || 'Medium',
    };
    if (!priorities.includes(ticket.priority) || ticket.description.length > 10000) {
        throw httpError(400, 'Choose a valid ticket priority and description');
    }

    if (isManager) {
        const [customers] = await pool.execute(
            `SELECT c.customer_id
             FROM customers c
             JOIN app_users u ON u.customer_id = c.customer_id AND u.role = 'customer'
             WHERE c.customer_id = ?
             LIMIT 1`,
            [ticket.customerId]
        );
        if (!customers.length) {
            throw httpError(409, 'Choose a customer with a linked login account');
        }
        const [agents] = await pool.execute(`
            SELECT a.agent_id
            FROM agents a
            JOIN app_users u ON u.agent_id = a.agent_id AND u.role = 'agent'
            WHERE a.agent_id = ? AND a.role = 'Agent' AND a.is_active = TRUE
            LIMIT 1
        `, [ticket.agentId]);
        if (!agents.length) {
            throw httpError(409, 'Choose an active agent with a linked login account');
        }
    }

    const [result] = await pool.execute(`
        INSERT INTO tickets
            (customer_id, assigned_agent_id, title, description, priority, status)
        VALUES (?, ?, ?, ?, ?, 'Open')
    `, [
        ticket.customerId,
        ticket.agentId,
        ticket.title,
        ticket.description,
        ticket.priority
    ]);
    if (isCustomer) {
        await notifyManagers(result.insertId, `New ticket #${result.insertId} was created`);
    }
    const [rows] = await pool.execute(`${ticketSelect} WHERE t.ticket_id = ?`, [result.insertId]);
    return sendJSON(reply, 201, rows[0]);
});

app.put('/api/tickets/:id', { preHandler: authenticate }, async (request, reply) => {
    if (request.user.role !== 'customer' || !request.user.customer_id) {
        return sendJSON(reply, 403, { error: 'Only customers can edit their own tickets' });
    }
    requireJSON(request);
    const id = parseId(request.params.id, 'ticket ID');
    const body = objectBody(request.body);
    const ticket = {
        title: requiredText(body, 'title', 'Title', 200),
        description: typeof body.description === 'string' ? body.description.trim() : '',
        priority: body.priority || 'Medium',
    };
    if (!priorities.includes(ticket.priority) || ticket.description.length > 10000) {
        throw httpError(400, 'Choose a valid ticket priority and description');
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [existing] = await connection.execute(`
            SELECT customer_id
            FROM tickets
            WHERE ticket_id = ?
            FOR UPDATE
        `, [id]);
        if (!existing.length) throw httpError(404, 'Ticket not found');
        if (existing[0].customer_id !== request.user.customer_id) {
            throw httpError(403, 'You can only edit your own tickets');
        }

        const [result] = await connection.execute(`
            UPDATE tickets
            SET title = ?, description = ?, priority = ?
            WHERE ticket_id = ? AND customer_id = ?
              AND created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE)
        `, [ticket.title, ticket.description, ticket.priority, id, request.user.customer_id]);
        if (!result.affectedRows) {
            const [editWindow] = await connection.execute(`
                SELECT created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 5 MINUTE) AS is_editable
                FROM tickets
                WHERE ticket_id = ?
            `, [id]);
            if (!editWindow[0]?.is_editable) {
                throw httpError(409, 'Tickets can only be edited within 5 minutes of creation');
            }
        }

        const [updated] = await connection.execute(
            `${ticketSelect} WHERE t.ticket_id = ?`,
            [id]
        );
        await connection.commit();
        return sendJSON(reply, 200, updated[0]);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
});

app.post('/api/tickets/:id/assign', { preHandler: [authenticate, managerOnly] }, async (request, reply) => {
    requireJSON(request);
    const id = parseId(request.params.id, 'ticket ID');
    const body = objectBody(request.body);
    const agentId = parseId(body.agent_id, 'agent ID');
    const [result] = await pool.execute(`
        UPDATE tickets t
        JOIN agents a ON a.agent_id = ?
        SET t.assigned_agent_id = ?
        WHERE t.ticket_id = ? AND t.status IN ('Open', 'Reopened') AND a.is_active = TRUE
    `, [agentId, agentId, id]);
    if (!result.affectedRows) {
        const [rows] = await pool.execute('SELECT status FROM tickets WHERE ticket_id = ?', [id]);
        if (!rows.length) return sendJSON(reply, 404, { error: 'Ticket not found' });
        throw httpError(409, 'Only open tickets can be assigned to an active agent');
    }
    const [rows] = await pool.execute(`${ticketSelect} WHERE t.ticket_id = ?`, [id]);
    return sendJSON(reply, 200, rows[0]);
});

app.post('/api/tickets/:id/pickup', { preHandler: authenticate }, async (request, reply) => {
    if (request.user.role !== 'agent' || !request.user.agent_id) {
        return sendJSON(reply, 403, { error: 'An active agent account is required' });
    }
    const id = parseId(request.params.id, 'ticket ID');
    const [result] = await pool.execute(`
        UPDATE tickets t
        JOIN agents a ON a.agent_id = ?
        SET t.assigned_agent_id = ?, t.status = 'In Progress'
        WHERE t.ticket_id = ? AND a.is_active = TRUE
          AND t.status IN ('Open', 'Reopened')
          AND (t.assigned_agent_id IS NULL OR t.assigned_agent_id = ?)
    `, [request.user.agent_id, request.user.agent_id, id, request.user.agent_id]);
    if (!result.affectedRows) {
        const [rows] = await pool.execute('SELECT ticket_id FROM tickets WHERE ticket_id = ?', [id]);
        if (!rows.length) return sendJSON(reply, 404, { error: 'Ticket not found' });
        throw httpError(409, 'This ticket is no longer available for pickup');
    }
    const [rows] = await pool.execute(`${ticketSelect} WHERE t.ticket_id = ?`, [id]);
    return sendJSON(reply, 200, rows[0]);
});

app.post('/api/tickets/:id/hold', { preHandler: authenticate }, async (request, reply) => {
    if (request.user.role !== 'agent') return sendJSON(reply, 403, { error: 'Agent only: access denied' });
    const id = parseId(request.params.id, 'ticket ID');
    const [result] = await pool.execute(`
        UPDATE tickets SET status = 'On Hold'
        WHERE ticket_id = ? AND assigned_agent_id = ? AND status = 'In Progress'
    `, [id, request.user.agent_id]);
    if (!result.affectedRows) throw httpError(409, 'Only your in-progress tickets can be placed on hold');
    await notifyManagers(id, `Ticket #${id} was placed on hold`);
    const [rows] = await pool.execute(`${ticketSelect} WHERE t.ticket_id = ?`, [id]);
    return sendJSON(reply, 200, rows[0]);
});

app.post('/api/tickets/:id/complete', { preHandler: authenticate }, async (request, reply) => {
    if (request.user.role !== 'agent') return sendJSON(reply, 403, { error: 'Agent only: access denied' });
    const id = parseId(request.params.id, 'ticket ID');
    const [result] = await pool.execute(`
        UPDATE tickets SET status = 'Completed'
        WHERE ticket_id = ? AND assigned_agent_id = ? AND status = 'In Progress'
    `, [id, request.user.agent_id]);
    if (!result.affectedRows) throw httpError(409, 'Only your in-progress tickets can be completed');
    await notifyManagers(id, `Ticket #${id} is completed and ready for review`);
    const [rows] = await pool.execute(`${ticketSelect} WHERE t.ticket_id = ?`, [id]);
    return sendJSON(reply, 200, rows[0]);
});

app.post('/api/tickets/:id/reactivate', { preHandler: [authenticate, managerOnly] }, async (request, reply) => {
    const id = parseId(request.params.id, 'ticket ID');
    const [result] = await pool.execute(`
        UPDATE tickets SET status = 'Open', assigned_agent_id = NULL
        WHERE ticket_id = ? AND status = 'On Hold'
    `, [id]);
    if (!result.affectedRows) throw httpError(409, 'Only on-hold tickets can be reactivated');
    const [rows] = await pool.execute(`${ticketSelect} WHERE t.ticket_id = ?`, [id]);
    return sendJSON(reply, 200, rows[0]);
});

app.post('/api/tickets/:id/resolve', { preHandler: [authenticate, managerOnly] }, async (request, reply) => {
    const id = parseId(request.params.id, 'ticket ID');
    const [result] = await pool.execute(`
        UPDATE tickets SET status = 'Resolved', resolved_at = CURRENT_TIMESTAMP
        WHERE ticket_id = ? AND status = 'Completed'
    `, [id]);
    if (!result.affectedRows) throw httpError(409, 'Only completed tickets can be resolved');
    const [rows] = await pool.execute(`
        SELECT u.id AS user_id FROM tickets t
        JOIN app_users u ON u.customer_id = t.customer_id
        WHERE t.ticket_id = ?
    `, [id]);
    if (rows[0]) {
        await pool.execute(`
            INSERT INTO notifications (recipient_role, recipient_id, ticket_id, message)
            VALUES ('customer', ?, ?, ?)
        `, [rows[0].user_id, id, `Ticket #${id} has been approved and completed`]);
    }
    const [updated] = await pool.execute(`${ticketSelect} WHERE t.ticket_id = ?`, [id]);
    return sendJSON(reply, 200, updated[0]);
});

app.post('/api/tickets/:id/reopen', { preHandler: authenticate }, async (request, reply) => {
    if (request.user.role !== 'customer') return sendJSON(reply, 403, { error: 'Customer only: access denied' });
    const id = parseId(request.params.id, 'ticket ID');
    const [result] = await pool.execute(`
        UPDATE tickets SET status = 'Reopened', assigned_agent_id = NULL
        WHERE ticket_id = ? AND customer_id = ? AND status = 'Resolved'
    `, [id, request.user.customer_id]);
    if (!result.affectedRows) throw httpError(409, 'Only your resolved tickets can be reopened');
    await notifyManagers(id, `Ticket #${id} was reopened by the customer`);
    const [rows] = await pool.execute(`${ticketSelect} WHERE t.ticket_id = ?`, [id]);
    return sendJSON(reply, 200, rows[0]);
});

app.get('/api/tickets/:id/messages', { preHandler: authenticate }, async (request, reply) => {
    const id = parseId(request.params.id, 'ticket ID');
    await ticketForUser(id, request.user);
    const [rows] = await pool.execute(`
        SELECT message_id, ticket_id, sender_name, sender_role, message, created_at
        FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at, message_id
    `, [id]);
    return sendJSON(reply, 200, rows);
});

app.post('/api/tickets/:id/messages', { preHandler: authenticate }, async (request, reply) => {
    requireJSON(request);
    const id = parseId(request.params.id, 'ticket ID');
    const message = requiredText(objectBody(request.body), 'message', 'Message', 4000);
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const ticket = await ticketForUser(id, request.user, connection, true);
        if (ticket.status === 'Resolved') {
            throw httpError(409, 'This conversation is closed because the ticket is resolved');
        }
        const [result] = await connection.execute(`
            INSERT INTO ticket_messages (ticket_id, user_id, sender_name, sender_role, message)
            VALUES (?, ?, ?, ?, ?)
        `, [id, request.user.id, request.user.username, request.user.role, message]);
        const [rows] = await connection.execute(`
            SELECT message_id, ticket_id, sender_name, sender_role, message, created_at
            FROM ticket_messages WHERE message_id = ?
        `, [result.insertId]);
        await connection.commit();
        return sendJSON(reply, 201, rows[0]);
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
});

app.post('/api/presence', { preHandler: authenticate }, async (request, reply) => {
    if (request.user.role !== 'customer' || !request.user.customer_id) {
        return sendJSON(reply, 200, { updated: false });
    }
    const [before] = await pool.execute(`
        SELECT last_seen_at FROM customers WHERE customer_id = ?
    `, [request.user.customer_id]);
    const wasOffline = !before[0]?.last_seen_at ||
        Date.now() - new Date(before[0].last_seen_at).getTime() > 120000;
    await pool.execute('UPDATE customers SET last_seen_at = CURRENT_TIMESTAMP WHERE customer_id = ?', [
        request.user.customer_id
    ]);
    if (wasOffline) {
        const [heldTickets] = await pool.execute(`
            SELECT ticket_id FROM tickets
            WHERE customer_id = ? AND status = 'On Hold'
        `, [request.user.customer_id]);
        for (const ticket of heldTickets) {
            await notifyManagers(ticket.ticket_id, `Customer for ticket #${ticket.ticket_id} is back online`);
        }
    }
    return sendJSON(reply, 200, { updated: true });
});

app.get('/api/notifications', { preHandler: authenticate }, async (request, reply) => {
    if (request.user.role !== 'manager' && request.user.role !== 'customer') {
        return sendJSON(reply, 403, { error: 'Notifications are not available to this account' });
    }
    const [rows] = request.user.role === 'manager'
        ? await pool.query(`
            SELECT notification_id, ticket_id, message, created_at
            FROM notifications WHERE recipient_role = 'manager' AND read_at IS NULL
            ORDER BY created_at DESC LIMIT 50
        `)
        : await pool.execute(`
            SELECT notification_id, ticket_id, message, created_at
            FROM notifications
            WHERE recipient_role = 'customer' AND recipient_id = ? AND read_at IS NULL
            ORDER BY created_at DESC LIMIT 50
        `, [request.user.id]);
    return sendJSON(reply, 200, rows);
});

app.post('/api/notifications/:id/read', { preHandler: authenticate }, async (request, reply) => {
    const id = parseId(request.params.id, 'notification ID');
    const [result] = await pool.execute(`
        UPDATE notifications SET read_at = CURRENT_TIMESTAMP
        WHERE notification_id = ? AND recipient_role = ? AND
              (recipient_id IS NULL OR recipient_id = ?)
    `, [id, request.user.role, request.user.id]);
    if (!result.affectedRows) throw httpError(404, 'Notification not found');
    return sendJSON(reply, 200, { updated: id });
});

app.delete('/api/tickets/:id', { preHandler: [authenticate, managerOnly] }, async (request, reply) => {
    const id = parseId(request.params.id, 'ticket ID');
    const [result] = await pool.execute('DELETE FROM tickets WHERE ticket_id = ?', [id]);
    if (!result.affectedRows) {
        return sendJSON(reply, 404, { error: 'Ticket not found' });
    }
    return sendJSON(reply, 200, { deleted: id });
});

const assetTypes = {
    '.css': 'text/css;charset=utf-8',
    '.js': 'text/javascript;charset=utf-8',
    '.svg': 'image/svg+xml'
};

app.get('/', async (request, reply) => {
    try {
        const html = await readFile(new URL('./public/app/index.html', import.meta.url));
        return reply.type('text/html;charset=utf-8').header('Cache-Control', 'no-store').send(html);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return reply
            .code(503)
            .type('text/plain;charset=utf-8')
            .send('React UI is not built yet. Run npm run build in the helpdesk project.');
    }
});

app.get('/assets/:filename', async (request, reply) => {
    const { filename } = request.params;
    if (!/^[A-Za-z0-9_-]+\.(?:css|js|svg)$/.test(filename)) {
        return sendJSON(reply, 404, { error: 'Asset not found' });
    }
    try {
        const content = await readFile(
            new URL(`./public/app/assets/${filename}`, import.meta.url)
        );
        const extension = filename.slice(filename.lastIndexOf('.'));
        return reply
            .type(assetTypes[extension])
            .header('Cache-Control', 'public, max-age=31536000, immutable')
            .send(content);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return sendJSON(reply, 404, { error: 'Asset not found' });
    }
});

app.setNotFoundHandler((request, reply) =>
    sendJSON(reply, 404, { error: 'Route not found' }));

try {
    await createTables();
    await seedAuthUsers();
    await pool.query('SELECT 1');
    await app.listen({ port: PORT, host: process.env.HOST || '0.0.0.0' });
    console.log(`Helpdesk API is running at ${APP_ORIGIN}`);
    console.log(`Connected to MySQL database ${process.env.DB_NAME}`);
} catch (error) {
    console.error('Helpdesk startup failed:', error.message);
    await pool.end();
    process.exitCode = 1;
}
