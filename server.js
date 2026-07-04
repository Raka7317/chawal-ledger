require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const crypto = require('crypto');
const Transaction = require('./models/Transaction');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const AUTH_SECRET = process.env.AUTH_SECRET || MONGODB_URI || 'change-this-secret';
const DB_WAIT_MS = 10000;
const IS_VERCEL = Boolean(process.env.VERCEL);
const AUTH_TTL_MS = 12 * 60 * 60 * 1000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // serves index.html locally

let dbError = null;
let dbReady = null;

function connectDatabase() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();

  if (!MONGODB_URI) {
    dbError = new Error('Missing MONGODB_URI. Add it in Vercel Project Settings > Environment Variables.');
    return Promise.reject(dbError);
  }

  if (!dbReady) {
    dbReady = mongoose
      .connect(MONGODB_URI, {
        serverSelectionTimeoutMS: DB_WAIT_MS,
        maxPoolSize: 5
      })
      .then(() => {
        dbError = null;
        console.log('Connected to MongoDB Atlas');
      })
      .catch((err) => {
        dbReady = null;
        dbError = err;
        console.error('MongoDB connection error:', err.message);
        throw err;
      });
  }

  return dbReady;
}

async function waitForDatabase() {
  if (mongoose.connection.readyState === 1) return;

  await connectDatabase();
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(value).digest('base64url');
}

function createToken() {
  const payload = base64url({ role: 'admin', exp: Date.now() + AUTH_TTL_MS });
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return false;

  const [payload, signature] = token.split('.');
  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.role === 'admin' && data.exp > Date.now();
  } catch (_err) {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Admin login required.' });
  }
  next();
}

// ---------- Routes the frontend already calls ----------

// GET / -> serve the frontend on local Node and Vercel
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// GET /api/health -> lets the frontend show database status
app.get('/api/health', (_req, res) => {
  res.json({
    ok: mongoose.connection.readyState === 1,
    state: mongoose.connection.readyState,
    error: dbError ? dbError.message : null,
    authConfigured: Boolean(ADMIN_PASSWORD)
  });
});

// POST /api/login -> admin login for modifying transactions
app.post('/api/login', (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'ADMIN_PASSWORD is not configured.' });
  }

  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin password.' });
  }

  res.json({ token: createToken() });
});

// GET /api/transactions -> list all
app.get('/api/transactions', async (_req, res) => {
  try {
    await waitForDatabase();
    const txs = await Transaction.find().sort({ date: -1 });
    res.json(txs);
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// POST /api/transactions -> create one
app.post('/api/transactions', requireAdmin, async (req, res) => {
  try {
    await waitForDatabase();
    const { type, personName, product, price, quantity, unit, date } = req.body;
    if (!type || !personName || !product || !unit || !date || !(price >= 0) || !(quantity > 0)) {
      return res.status(400).json({ error: 'Missing or invalid fields.' });
    }
    const tx = await Transaction.create({ type, personName, product, price, quantity, unit, date });
    res.status(201).json(tx);
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// DELETE /api/transactions/:id -> remove one
app.delete('/api/transactions/:id', requireAdmin, async (req, res) => {
  try {
    await waitForDatabase();
    await Transaction.findByIdAndDelete(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Start the server ----------

if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
