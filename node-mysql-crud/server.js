import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import mysql from 'mysql2/promise';
 
const app = Fastify({ logger: true });

const PORT = Number(process.env.API_PORT) || 3000;

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'shop_training',
  waitForConnections: true,
  connectionLimit: 10
});
 

await app.register(cors, {
  origin: ['http://localhost:5173', 'http://localhost:5500']
});
 

app.get('/api/products', async () => {
  const [rows] = await pool.execute(
    'SELECT * FROM products ORDER BY id'
  );
 
  return rows;
});
 
// GET: Retrieve a product by ID
app.get('/api/products/:id', async (request, reply) => {
  const id = Number(request.params.id);
 
  if (!Number.isSafeInteger(id) || id <= 0) {
    return reply.code(400).send({
      message: 'Invalid product ID'
    });
  }
 
  const [rows] = await pool.execute(
    'SELECT * FROM products WHERE id = ?',
    [id]
  );
 
  if (rows.length === 0) {
    return reply.code(404).send({
      message: 'Product not found'
    });
  }
 
  return rows[0];
});
 
// POST: Create a new product
app.post('/api/products', {
  schema: {
    body: {
      type: 'object',
      required: ['sku', 'name', 'price', 'stock'],
      additionalProperties: false,
      properties: {
        sku: { type: 'string', minLength: 3, maxLength: 32 },
        name: { type: 'string', minLength: 2, maxLength: 100 },
        price: {
          type: 'string',
          pattern: '^(0|[1-9][0-9]{0,7})(\\.[0-9]{1,2})?$'
        },
        stock: { type: 'integer', minimum: 0 }
      }
    }
  }
}, async (request, reply) => {
  const { sku, name, price, stock } = request.body;
 
  const [result] = await pool.execute(
    `INSERT INTO products (sku, name, price, stock)
     VALUES (?, ?, ?, ?)`,
    [sku, name, price, stock]
  );
 
  return reply.code(201).send({
    message: 'Product created successfully',
    id: result.insertId
  });
});

// PUT: Replace a product
app.put('/api/products/:id', {
  schema: {
    body: {
      type: 'object',
      required: ['sku', 'name', 'price', 'stock'],
      additionalProperties: false,
      properties: {
        sku: { type: 'string', minLength: 3, maxLength: 32 },
        name: { type: 'string', minLength: 2, maxLength: 100 },
        price: {
          type: 'string',
          pattern: '^(0|[1-9][0-9]{0,7})(\\.[0-9]{1,2})?$'
        },
        stock: { type: 'integer', minimum: 0 }
      }
    }
  }
}, async (request, reply) => {
  const id = Number(request.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return reply.code(400).send({
      message: 'Invalid product ID'
    });
  }

  const { sku, name, price, stock } = request.body;
  const [result] = await pool.execute(
    `UPDATE products
     SET sku = ?, name = ?, price = ?, stock = ?
     WHERE id = ?`,
    [sku, name, price, stock, id]
  );

  if (result.affectedRows === 0) {
    const [rows] = await pool.execute(
      'SELECT id FROM products WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return reply.code(404).send({
        message: 'Product not found'
      });
    }
  }

  return reply.code(200).send({
    message: 'Product updated successfully'
  });
});

// DELETE: Remove a product
app.delete('/api/products/:id', async (request, reply) => {
  const id = Number(request.params.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    return reply.code(400).send({
      message: 'Invalid product ID'
    });
  }

  const [result] = await pool.execute(
    'DELETE FROM products WHERE id = ?',
    [id]
  );

  if (result.affectedRows === 0) {
    return reply.code(404).send({
      message: 'Product not found'
    });
  }

  return reply.code(200).send({
    message: 'Product deleted successfully'
  });
});
 
// MySQL duplicate error handling
app.setErrorHandler((error, request, reply) => {
  if (error.code === 'ER_DUP_ENTRY') {
    return reply.code(409).send({
      message: 'Product SKU already exists'
    });
  }
 
  const status = error.statusCode || 500;
 
  return reply.code(status).send({
    message: status >= 500
      ? 'Internal server error'
      : error.message
  });
});
 
// Start server
try {
  await pool.query('SELECT 1');
  await app.listen({ port: PORT, host: 'localhost' });
} catch (error) {
  app.log.error(error);
  await pool.end();
  process.exitCode = 1;
}