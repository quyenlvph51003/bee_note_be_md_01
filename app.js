require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const createError = require('http-errors');

const { testConnection } = require('./config/db');
testConnection();

const authRouter = require('./routes/auth');
const hivesRouter = require('./routes/hives');

const app = express();
app.use(logger('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', authRouter);
app.use('/api/hives', hivesRouter);

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// **Welcome route**
app.get('/', (_req, res) => res.send('Welcome to Bee Note API!'));

// 404 handler
app.use((req, res, next) => next(createError(404)));

// Error handler
app.use((err, req, res) => {
  const wantsJson = req.originalUrl.startsWith('/api/');
  if (wantsJson)
    return res.status(err.status || 500).json({ message: err.message || 'Server error' });
  res.status(err.status || 500).send('Server Error');
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running`);
});

module.exports = app;
