const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./db/knex');
const { AppError } = require('./utils/api');
const reconciliationRoutes = require('./routes/reconciliation.routes');
const documentRoutes = require('./routes/document.routes');
const processingRoutes = require('./routes/processing.routes');
const aiRoutes = require('./routes/ai.routes');
const reportingRoutes = require('./routes/reporting.routes');
const knowledgeRoutes = require('./routes/knowledge.routes');
const errorMiddleware = require('./middleware/error.middleware');

const app = express();

app.use(helmet());
const allowedOrigins = String(process.env.FRONTEND_URL || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8080,http://localhost:8080')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new AppError('CORS_ORIGIN_DENIED', 'Frontend origin is not allowed.', 403));
  },
  allowedHeaders: ['Content-Type', 'x-user-id'],
  methods: ['GET', 'POST', 'OPTIONS']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', async (req, res, next) => {
  try {
    await db.raw('select 1 as ok');

    return res.status(200).json({
      success: true,
      message: 'Finance Controller API running'
    });
  } catch (error) {
    return next(new AppError('DATABASE_ERROR', 'Database connectivity check failed.', 503));
  }
});

app.use('/api/reconciliation', reconciliationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/v1', processingRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportingRoutes);
app.use('/api/knowledge', knowledgeRoutes);

app.use((req, res, next) => {
  next(new AppError('NOT_FOUND', 'Route not found.', 404));
});

app.use(errorMiddleware);

module.exports = app;
