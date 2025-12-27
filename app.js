require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const createError = require('http-errors');

// Kết nối DB
const { testConnection } = require('./config/db');
// Kiểm tra kết nối DB (không chặn tiến trình chính)
setTimeout(() => testConnection(), 0);

// Import routers
const authRouter = require('./routes/auth');
const hivesRouter = require('./routes/hives');
const queenRouter = require('./routes/queen');
const frameRouter = require('./routes/frame');
const honeyRoutes = require("./routes/honey");

const orderRouter = require('./routes/order');

const diaryRouter = require('./routes/diary');
const diseaseRouter = require('./routes/disease');

const statsRouter = require('./routes/stats');
const farmsRouter = require('./routes/farms');
const usersRouter = require('./routes/users');
const notificationsRouter = require('./routes/notifications');

// post api
const postRouter = require('./routes/post');

const users1Router = require("./routes/users1");

const iotRouter = require('./routes/iot');

const paymentStats = require("./routes/paymentStats");

// ⚠️ Route cảnh báo từ Python AI
const alertsRouter = require('./routes/alerts');

// const uploadsRouter = require('./routes/uploads');
const uploads = require('./routes/uploads');


const app = express();

// Tin cậy proxy (quan trọng khi deploy Railway / VPS / Nginx / Cloudflare)
app.set('trust proxy', 1);

// Middleware
app.use(logger('dev'));
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ limit: "5mb", extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/', (_req, res) => res.send('Welcome to Bee Note API!'));

// API routes
app.use('/api/auth', authRouter);
app.use('/api/hives', hivesRouter);

app.use('/api/queen', queenRouter);
app.use('/api/frame', frameRouter);
app.use("/api/honey", honeyRoutes);



app.use('/api/diary', diaryRouter);
app.use('/api/disease', diseaseRouter);

app.use('/api/users/profile', require('./routes/userprofile'));
app.use('/api/order', orderRouter);


app.use('/api/diary', diaryRouter);
app.use('/api/disease', diseaseRouter);

app.use('/api/stats', statsRouter);
app.use('/api/farms', farmsRouter);
app.use('/api/users', usersRouter);
app.use('/api/notifications', notificationsRouter);

app.use('/api/posts', postRouter);  

app.use("/api/users1", users1Router);

app.use('/api/iot', iotRouter);

app.use("/api/paymentStats", paymentStats);
// app.use('/api/uploads', uploadsRouter);
app.use('/api/uploads', uploads.router);

// webcam
app.use('/api/alerts', alertsRouter);

// 404 handler
app.use((req, res, next) => {
  next(createError(404));
});

// Global error handler
app.use((err, req, res, next) => {
  const wantsJson = req.originalUrl.startsWith('/api/');

  if (wantsJson) {
    return res
      .status(err.status || 500)
      .json({ message: err.message || 'Server Error' });
  }

  res.status(err.status || 500).send('Server Error');
});

module.exports = app; // KHÔNG listen ở đây
