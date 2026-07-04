# Chawal Ledger — Backend (Express + MongoDB Atlas)

This connects your `index2.html` frontend to a real MongoDB Atlas database via a
small Express API that matches the endpoints the page already calls:
`GET/POST /api/transactions` and `DELETE /api/transactions/:id`.

## 1. Get your Atlas connection string
1. Go to [MongoDB Atlas](https://cloud.mongodb.com) → your cluster → **Connect** → **Drivers** → Node.js.
2. Copy the connection string. It looks like:
   `mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority`
3. In Atlas, under **Database Access**, make sure you have a database user with a password (not your Atlas login — a separate DB user).
4. Under **Network Access**, add your current IP (or `0.0.0.0/0` for testing — not for production).

## 2. Configure the project
```bash
cp .env.example .env
```
Edit `.env` and paste your real connection string into `MONGODB_URI`, and pick a database name
(e.g. `.../chawal-ledger?retryWrites=true...`).

## 3. Install & run
```bash
npm install
npm start
```
You should see:
```
Connected to MongoDB Atlas
Server running at http://localhost:3000
```

## 4. Open the app
Visit `http://localhost:3000` — this serves your `public/index.html` (the Chawal Ledger UI),
which will now load, save, and delete transactions from your Atlas database.

## Project structure
```
rice-mill-backend/
├── server.js              # Express app + Mongo connection + routes
├── models/Transaction.js  # Mongoose schema (transactions collection)
├── public/index.html      # Your frontend (unchanged)
├── .env.example           # Template for your connection string
└── package.json
```

## Notes
- Never commit your real `.env` file — it contains your DB password.
- `qtyKg` is computed server-side from `quantity` + `unit` (kg / quintal / gram) whenever
  transactions are returned, matching what the frontend's table and charts expect.
- For production hosting (Render, Railway, Fly.io, etc.), set `MONGODB_URI` as an environment
  variable in that platform's dashboard instead of a `.env` file.
