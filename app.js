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
app.set('trust proxy', 1); // quan trọng khi chạy sau proxy (Railway)

app.use(logger('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Health & welcome
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/', (_req, res) => res.send('Welcome to Bee Note API!'));

// API routes
app.use('/api/auth', authRouter);
app.use('/api/hives', hivesRouter);

// 404
app.use((req, res, next) => next(createError(404)));

// Error handler
app.use((err, req, res, next) => {
  const wantsJson = req.originalUrl.startsWith('/api/');
  if (wantsJson) {
    return res.status(err.status || 500)
      .json({ message: err.message || 'Server error' });
  }
  res.status(err.status || 500).send('Server Error');
});

module.exports = app;   // ❗ chỉ export app, KHÔNG listen ở đây
