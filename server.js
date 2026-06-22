require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const apiRouter = require('./src/routes/api');

const app = express();
const port = Number.parseInt(process.env.PORT || '3000', 10);
const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

app.disable('x-powered-by');

app.use(helmet({
  hsts: false,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://va.vercel-scripts.com'],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://va.vercel-scripts.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'"]
    }
  }
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin is not allowed by CORS'));
  }
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests'
  }
}));

app.use(express.json({
  limit: '10kb',
  strict: true
}));

app.use('/api', apiRouter);
app.use(express.static(path.join(__dirname, 'src/public')));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status = err.status || err.statusCode || 500;
  const publicMessage = status >= 500 ? 'Internal server error' : err.message;

  res.status(status).json({
    error: publicMessage
  });
});

app.listen(port, () => {
  console.log(`world-cup-sweepstake listening on http://localhost:${port}`);
});
