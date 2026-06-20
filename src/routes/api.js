const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  getSweepstakeData,
  getGroupsData,
  getFixturesData,
  getBracketData,
  getQualificationDebugData,
  getTableSourceDebug,
  refreshData,
  getProviderStatus
} = require('../services/sweepstakeService');

const router = express.Router();
const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Refresh rate limit exceeded'
  }
});

function sanitiseString(value) {
  return String(value).replace(/[^\w\s:.,/@-]/g, '').trim();
}

function validateRequest(req, res, next) {
  const queryEntries = Object.entries(req.query || {});

  if (queryEntries.length > 10) {
    res.status(400).json({ error: 'Too many query parameters' });
    return;
  }

  for (const [key, value] of queryEntries) {
    if (key.length > 40 || String(value).length > 200) {
      res.status(400).json({ error: 'Invalid query parameter' });
      return;
    }
  }

  req.safeQuery = Object.fromEntries(queryEntries.map(([key, value]) => [
    sanitiseString(key),
    sanitiseString(value)
  ]));

  next();
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
}

router.use(validateRequest);

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    generatedAt: new Date().toISOString()
  });
});

router.get('/provider-status', (req, res) => {
  res.json(getProviderStatus());
});

router.get('/sweepstake', asyncHandler(async (req, res) => {
  res.json(await getSweepstakeData());
}));

router.get('/groups', asyncHandler(async (req, res) => {
  res.json(await getGroupsData());
}));

router.get('/fixtures', asyncHandler(async (req, res) => {
  res.json(await getFixturesData());
}));

router.get('/bracket', asyncHandler(async (req, res) => {
  res.json(await getBracketData());
}));

router.get('/debug/table-source', asyncHandler(async (req, res) => {
  res.json(await getTableSourceDebug());
}));

router.get('/debug/qualification', asyncHandler(async (req, res) => {
  res.json(await getQualificationDebugData());
}));

router.post('/refresh', refreshLimiter, asyncHandler(async (req, res) => {
  if (req.body && Object.keys(req.body).length > 0) {
    res.status(400).json({ error: 'Refresh does not accept a request body' });
    return;
  }

  res.json(await refreshData());
}));

module.exports = router;
