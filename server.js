require('dotenv').config({ path: __dirname + '/.env' });
// DNS override: fall back to public resolvers so Atlas SRV lookups work on restricted networks
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (err) {
  console.warn('Could not set custom DNS servers:', err.message);
}
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const Transaction = require('./models/Transaction');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_WAIT_MS = 15000;
const IS_VERCEL = Boolean(process.env.VERCEL);

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
      .connect(MONGODB_URI, { serverSelectionTimeoutMS: DB_WAIT_MS })
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

  await Promise.race([
    connectDatabase().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, DB_WAIT_MS))
  ]);

  if (mongoose.connection.readyState !== 1) {
    throw dbError || new Error('Database is still connecting. Please try again in a moment.');
  }
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
    error: dbError ? dbError.message : null
  });
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
app.post('/api/transactions', async (req, res) => {
  try {
    await waitForDatabase();
    const { type, personName, product, price, quantity, unit, date } = req.body;
    if (!type || !personName || !product || !unit || !date || !(price >= 0) || !(quantity > 0)) {
      return res.status(400).json({ error: 'Missing or invalid fields.' });
    }
    const tx = await Transaction.create({ type, personName, product, price, quantity, unit, date });
    res.status(201).json(tx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/transactions/:id -> remove one
app.delete('/api/transactions/:id', async (req, res) => {
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
