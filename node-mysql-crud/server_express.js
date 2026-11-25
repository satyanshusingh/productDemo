import 'dotenv/config';
import mysql from 'mysql2/promise';
import express from 'express';
import cors from 'cors';

const app = express();

const PORT = Number(process.env.API_PORT) || 3000;

//Middleware +1 : Configure CORS
const allowedOrigins = (process.env.CORS_ORIGINS).split(',').map(origin => origin.trim());

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        const error = new Error("origin not allowed");
        error.status = 403;
        callback(error);
    }
}));

// Middleware +2 : Parse JSON
app.use(express.json({ limit: '64kb' }));

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('Invalid Port');
}

//Step 1: create MYSQL connection pool

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
});

// const [rows] = await pool.execute('select * from products');
// console.log(rows);

// Step 4: JSON response helper
function sendJSON(res, status, data, headers = {}) {
    res.writeHead(status, {
        'Content-Type': 'application/json;charset=utf-8',
        ...headers
    });
    res.end(JSON.stringify(data));
}

//Step 5: Creae HTTP error
function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

//Step 6 : Validate Product
function validateProduct(data) {
    const sku = typeof data.sku === 'string' ? data.sku.trim().toUpperCase() : "";
    const name = typeof data.name === 'string' ? data.name.trim().toUpperCase() : "";
    const price = String(data.price ?? '');
    const stock = data.stock;

    if (!/^[A-Z0-9_-]{3,32}$/.test(sku)) {
        throw httpError(400, "Invalid SKU");
    }
    if (name.length < 2 || name.length > 100) {
        throw httpError(400, 'Inavlid Product name');
    }
    if (!/^(?:0|[1-9]\d{0,7})(?:.\d{1,2})?$/.test(price)) {
        throw httpError(400, 'Invalid Price');
    }
    if (!Number.isInteger(stock) || stock < 0 || stock > 4294967295) {
        throw httpError(400, 'Invalid Stock');
    }
    return { sku, name, price, stock };
}

// Step 7 : Validate the Product ID
function parseId(value) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1 || id > 4294967295) {
        throw httpError(400, 'Invalid Produt ID');
    }
    return id;
}

// Step 8 : Handle REST API requests
app.get('/api/products', async (req, res) => {
    const [products] = await pool.execute(
        'SELECT * FROM products ORDER BY id DESC'
    );
    return sendJSON(res, 200, products);
})

app.get('/api/products/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const [rows] = await pool.execute(
        `SELECT * FROM products WHERE id=?`, [id]
    );
    if (rows.length === 0) {
        return sendJSON(res, 404, {
            message: 'Product not found'
        });
    }
    res.status(200).json(rows[0]);
})

app.post('/api/products', async (req, res) => {
    const { sku, name, price, stock } = validateProduct(req.body);
    const [result] = await pool.execute(
        `INSERT INTO products(sku,name,price,stock) values(?,?,?,?)`,
        [sku, name, price, stock]
    );
    res.status(201).json({
        message: "Product Created Successfully",
        id: result.insertId
    });
})

app.put('/api/products/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const { sku, name, price, stock } = validateProduct(req.body);
    const [result] = await pool.execute(
        `UPDATE products SET sku = ?, name = ?, price = ?, stock = ? WHERE id = ?`,
        [sku, name, price, stock, id]
    );
    if (result.affectedRows === 0) {
        return res.status(404).json({
            message: 'Product not found'
        });
    }
    res.status(200).json({
        message: "Product Updated Successfully"
    });
});

app.delete('/api/products/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const [result] = await pool.execute(
        'DELETE FROM products WHERE id = ?', [id]
    );

    if (result.affectedRows === 0) {
        return res.status(404).json({
            message: 'Product not found'
        });
    }

    res.status(200).json({
        message: "Product deleted Successfully"
    });
});

app.get('health', async (req, res) => {
    await pool.query('SELECT 1');
    res.json({
        status: 'Ok',
        database: 'connected'
    });
});

//Unkown endpoints
app.use((req, res) => {
    res.status(404).json({
        message: "Route not found"
    });
});

// Step : 9 Centralised error handling
app.use((error, req, res, next) => {
    if (error.code === 'ER_DUP_ENTRY') {
        return res.status(404).json({
            message: "Product SKU already exists"
        });
    }
    const status = error.status || error.statusCode || 500;
    if (status >= 500) {
        console.error(error);
    }

    res.status(status).json({
        message: status >= 500 ? "Internal Server Error" : error.message
    });
});


//Step 10 : Test Database before starting the server
try {
    await pool.query('SELECT 1');
    app.listen(PORT, () => {
        console.log(`MYSQL Express CRUD API is running at http://localhost:${PORT}`);
    });

} catch (error) {
    console.error('MYSQL connection failed', error.message);
    await pool.end();
    process.exitCode = 1;
}