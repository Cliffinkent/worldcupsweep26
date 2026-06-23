const express = require('express');
const crypto = require('node:crypto');
const rateLimit = require('express-rate-limit');
const {
  getSweepstakeData,
  getGroupsData,
  getFixturesData,
  getBracketData,
  getThirdPlaceWatchData,
  getThirdPlaceWatchDebugData,
  getEliminatedTeamsData,
  getEliminationsDebugData,
  getMathematicalEliminationsDebugData,
  getQualificationDebugData,
  getLiveFixturesDebugData,
  getTableSourceDebug,
  refreshData,
  getProviderStatus
} = require('../services/sweepstakeService');
const {
  getDepartureSceneState,
  ensureDepartureSceneGenerated
} = require('../services/departureSceneService');

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
const departureSceneRegenerateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Departure scene regeneration rate limit exceeded'
  }
});

function sanitiseString(value) {
  return String(value).replace(/[^\w\s:.,/@-]/g, '').trim();
}

function timingSafeTokenMatches(provided, expected) {
  const providedBuffer = Buffer.from(String(provided || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));

  return providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer);
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

router.get('/third-place-watch', asyncHandler(async (req, res) => {
  res.json(await getThirdPlaceWatchData());
}));

router.get('/eliminated-teams', asyncHandler(async (req, res) => {
  const eliminatedData = await getEliminatedTeamsData();
  const generatedScene = await getDepartureSceneState(eliminatedData);

  res.json({
    ...eliminatedData,
    generatedScene
  });
}));

router.get('/debug/table-source', asyncHandler(async (req, res) => {
  res.json(await getTableSourceDebug());
}));

router.get('/debug/qualification', asyncHandler(async (req, res) => {
  res.json(await getQualificationDebugData());
}));

router.get('/debug/live-fixtures', asyncHandler(async (req, res) => {
  res.json(await getLiveFixturesDebugData());
}));

router.get('/debug/third-place-watch', asyncHandler(async (req, res) => {
  res.json(await getThirdPlaceWatchDebugData());
}));

router.get('/debug/eliminations', asyncHandler(async (req, res) => {
  res.json(await getEliminationsDebugData());
}));

router.get('/debug/mathematical-eliminations', asyncHandler(async (req, res) => {
  res.json(await getMathematicalEliminationsDebugData());
}));

router.post('/refresh', refreshLimiter, asyncHandler(async (req, res) => {
  if (req.body && Object.keys(req.body).length > 0) {
    res.status(400).json({ error: 'Refresh does not accept a request body' });
    return;
  }

  res.json(await refreshData());
}));

router.post('/admin/departure-scene/regenerate', departureSceneRegenerateLimiter, asyncHandler(async (req, res) => {
  const adminToken = String(process.env.ADMIN_RENDER_TOKEN || '').trim();

  if (!adminToken) {
    res.status(403).json({ error: 'Admin render token is not configured' });
    return;
  }

  if (!timingSafeTokenMatches(req.get('x-admin-render-token'), adminToken)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const generatedScene = await ensureDepartureSceneGenerated({ force: true });

  res.json({ generatedScene });
}));

module.exports = router;
