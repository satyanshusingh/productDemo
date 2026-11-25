# Stockroom product frontend

A React + Vite frontend for the Express/MySQL product API. It uses Material UI for the interface, React Hook Form for form state, and Zod for validation.

## Run locally

1. Start the backend from `node-mysql-crud` with `npm run dev`. The API listens on the port configured by `API_PORT` in the backend `.env` file (currently `3456`).
2. In this directory, install dependencies with `npm install`.
3. Start the frontend with `npm run dev` and open the local URL printed by Vite.

The Vite development server proxies `/api` requests to `http://localhost:3456` by default. If the backend uses another port or host, set `VITE_API_PROXY_TARGET` in this project's `.env` file, for example:

```env
VITE_API_PROXY_TARGET=http://localhost:3001
```

## Source structure

- `src/pages/ProductsPage.jsx` — page state and product CRUD actions
- `src/components/` — reusable header, summary, catalog, table, dialogs, and notifications
- `src/api/products.js` — product API requests
- `src/schemas/productSchema.js` — form validation and request payload conversion
- `src/utils/formatters.js` — inventory, currency, and number formatting

## Available scripts

- `npm run dev` — start the development server
- `npm run build` — create a production build
- `npm run lint` — run Oxlint
- `npm run preview` — preview the production build
