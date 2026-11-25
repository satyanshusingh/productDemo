# Helpdesk

A role-based helpdesk app for managing customers, agents, departments, tickets, ticket messages, and notifications.

## Architecture and request flow

```text
Browser
  React UI (client/src)
    └── client/src/api.js ── JSON requests with Bearer JWT
          └── Fastify API (server.js)
                ├── validates input, token, role, and record access
                └── mysql2 connection pool ── MySQL database
```

In development, Vite serves the UI on port 5173 and proxies `/api` requests to Fastify on port 3000 (or the configured `PORT`). For a built run, Vite writes the UI to `public/app`; Fastify serves that UI and the API from the same origin. The UI refreshes workspace data periodically; it does not use WebSockets.

## Project structure

| Path | Purpose |
| --- | --- |
| `server.js` | Fastify server, API routes, authentication, startup table creation/migrations, and built UI serving |
| `schema.sql` | SQL schema and sample statements for reference/manual database setup |
| `token.js` | Small Node script that prints a random hex secret |
| `client/index.html` | Vite UI entry HTML |
| `client/vite.config.js` | React/Vite settings, API proxy, and build output path |
| `client/src/main.jsx` | React entry point |
| `client/src/App.jsx` | App state, login/session flow, workspace loading, and page composition |
| `client/src/api.js` | Browser-side API requests |
| `client/src/components/` | Login, dashboard, ticket, table, form, and notification UI |
| `client/src/styles.css` | UI styles |
| `public/app/` | Generated production UI files created by `npm run build` |

## Technology

- **UI:** React 19, JavaScript, Vite 8
- **API:** Node.js (ES modules), Fastify 5, `@fastify/cors`
- **Database:** MySQL with `mysql2/promise` and a connection pool
- **Authentication:** JWT bearer tokens (`jsonwebtoken`); passwords are salted and hashed with Node.js `scrypt`
- **Configuration:** `.env` loaded by `dotenv`

## Prerequisites

- Node.js compatible with the installed Vite version (Node.js 20.19+ or 22.12+ recommended)
- MySQL Server running locally or reachable over the network
- MySQL command-line client (`mysql`) or MySQL Workbench

## Database setup

1. Start the MySQL service. On Windows, check its installed service name with:

   ```powershell
   Get-Service *mysql*
   ```

   If the service is named `MySQL80`, start it from an elevated PowerShell:

   ```powershell
   Start-Service MySQL80
   ```

2. Create an empty database. In PowerShell, run the following and enter the MySQL password when prompted:

   ```powershell
   mysql -u root -p -e "CREATE DATABASE helpdesk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   ```

   Alternatively, execute the `CREATE DATABASE` statement in MySQL Workbench.

3. Create a `.env` file in this project directory (beside `package.json`) and set the database connection and JWT secret:

   ```dotenv
   PORT=3000
   HOST=127.0.0.1
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=helpdesk
   JWT_SECRET=paste_a_generated_secret_here
   ```

   Generate a secret with:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   `JWT_SECRET` must be at least 32 characters. Keep `.env` private and do not commit it. The MySQL account must be allowed to create and alter tables in the selected database.

4. On first server startup, the app creates or updates its tables and inserts the default departments. You do not need to import `schema.sql` for a new installation. That file also contains sample data statements; do not re-run it on every startup.

   The main tables are:

   - `customers` and `agents`: people, with agents linked to `departments`
   - `departments`: support teams
   - `tickets`: customer requests, optionally assigned to an agent
   - `app_users`: usernames, roles, password salt/hash, and optional customer/agent links
   - `ticket_messages`: ticket conversation, linked to tickets
   - `notifications`: unread alerts for managers or customers

   Foreign keys enforce the ticket/customer/agent and agent/department relationships. The API uses parameterized SQL queries; operations that create linked account and profile records use transactions. MySQL stores passwords as hashes, not plaintext. Existing database records are retained between runs.

## Run the app

1. Open PowerShell in this project:

   ```powershell
   cd C:\Users\user\Desktop\productDemo\node-jwt-ws-heldesk
   ```

2. Install the dependencies:

   ```powershell
   npm ci
   ```

3. Start the API in one terminal:

   ```powershell
   npm start
   ```

   The server checks its configuration, creates/migrates tables, seeds initial login accounts if `app_users` is empty, connects to MySQL, and listens on `http://localhost:3000`.

4. For local UI development, open a second terminal in the project directory and run:

   ```powershell
   npm run dev
   ```

   Open the Vite URL shown in the terminal (normally `http://localhost:5173`). API requests are proxied to the Fastify server.

5. To run the built UI instead, stop the Vite dev server, then run:

   ```powershell
   npm run build
   npm start
   ```

   Open `http://localhost:3000`. Rebuild after changing client source files. The build output in `public/app/` is generated.

### Initial sign-in

If `app_users` is empty and no legacy user data is available, the app creates these demo accounts:

| Role | Username | Password |
| --- | --- | --- |
| Manager | `manager` | `Manager@123` |
| Agent | `agent` | `Agent@123` |

Change demo credentials before using the app beyond local development. Seed accounts are only created when there are no existing users. Customers can register through the UI; an agent profile/login can be created or linked by a manager.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Fastify listen port |
| `HOST` | `0.0.0.0` | Fastify bind address |
| `DB_HOST` | Required | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USER` | Required | MySQL user |
| `DB_PASSWORD` | Required (may be empty) | MySQL password |
| `DB_NAME` | Required | Existing database name |
| `JWT_SECRET` | Required | Secret of at least 32 characters |
| `APP_ORIGIN` | `http://localhost:<PORT>` | Allowed app origin |
| `CORS_ORIGINS` | Empty | Optional comma-separated additional origins |
| `VITE_API_PROXY_TARGET` | `http://localhost:<PORT>` | Optional Vite development API target |

## Troubleshooting

- **Missing MySQL settings / `JWT_SECRET` error:** Confirm `.env` is in the project root and contains every required setting.
- **Connection refused:** Start MySQL and verify `DB_HOST`, `DB_PORT`, credentials, and firewall settings.
- **Access denied / table creation error:** Grant the configured MySQL user access to `DB_NAME`, including table creation and alteration privileges.
- **Page reports the UI is not built:** Run `npm run build`, or use the Vite development server with `npm run dev`.
