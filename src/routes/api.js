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
const { getBlobStorageStatus } = require('../services/blobStorageService');
const {
  getDepartureSceneState,
  ensureDepartureSceneGenerated,
  getExistingSceneAssets,
  assetPath,
  imageGenerationEnabled,
  hasOpenAiKey
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
const departureSceneAdminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests'
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

function hasBlobToken() {
  return Boolean(String(process.env.BLOB_READ_WRITE_TOKEN || '').trim());
}

function hasAdminRenderToken() {
  return Boolean(String(process.env.ADMIN_RENDER_TOKEN || '').trim());
}

function safeTokenCompare(expectedValue, providedValue) {
  const expected = Buffer.from(String(expectedValue || ''));
  const provided = Buffer.from(String(providedValue || ''));

  if (!expected.length || !provided.length || expected.length !== provided.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, provided);
}

function requireAdminRenderToken(req, res, next) {
  const expected = String(process.env.ADMIN_RENDER_TOKEN || '').trim();
  const provided = String(req.get('x-admin-render-token') || '').trim();

  if (!safeTokenCompare(expected, provided)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
}

async function buildEliminatedTeamsResponse() {
  const eliminatedData = await getEliminatedTeamsData();
  const generatedScene = await getDepartureSceneState({ eliminatedData });

  return {
    ...eliminatedData,
    generatedScene
  };
}

function serialiseDebugAsset(asset) {
  return {
    exists: asset?.exists === true,
    pathname: asset?.pathname || null,
    urlPresent: Boolean(asset?.url),
    uploadedAt: asset?.uploadedAt || null,
    contentType: asset?.contentType || null,
    size: asset?.size || null
  };
}

function expectedAssets(sceneHash) {
  if (!sceneHash) {
    return {
      loungePath: null,
      boardPath: null,
      manifestPath: null
    };
  }

  return {
    loungePath: assetPath(sceneHash, 'lounge.png'),
    boardPath: assetPath(sceneHash, 'departure-board.svg'),
    manifestPath: assetPath(sceneHash, 'manifest.json')
  };
}

function debugWarnings({ generatedScene, loungeTeamCount }) {
  const warnings = [];

  if (!loungeTeamCount) {
    warnings.push('No eliminated lounge teams are currently available.');
  }

  if (generatedScene.status !== 'ready' && generatedScene.status !== 'empty') {
    warnings.push(`Generated scene status is ${generatedScene.status}.`);
  }

  return warnings;
}

function storageDiagnosticsFromStatus(storageStatus) {
  return {
    canCheckHealthPrefix: storageStatus?.storageStatus === 'ready' || storageStatus?.storageStatus === 'health_asset_missing',
    lastKnownHealthUploadStatus: storageStatus?.storageStatus || 'unknown',
    lastKnownHealthErrorCategory: storageStatus?.storageStatus === 'ready' ? null : (storageStatus?.storageStatus || 'unknown')
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

router.get('/storage-status', asyncHandler(async (req, res) => {
  res.json(await getBlobStorageStatus());
}));

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
  res.json(await buildEliminatedTeamsResponse());
}));

router.get('/debug/departure-scene', asyncHandler(async (req, res) => {
  const eliminatedData = await getEliminatedTeamsData();
  const generatedScene = await getDepartureSceneState({ eliminatedData });
  const storageStatus = await getBlobStorageStatus();
  const existingAssets = generatedScene.sceneHash
    ? await getExistingSceneAssets({ sceneHash: generatedScene.sceneHash })
    : null;
  const loungeTeamCount = Array.isArray(eliminatedData.loungeTeams) ? eliminatedData.loungeTeams.length : 0;
  const departureBoardCount = Array.isArray(eliminatedData.departureBoard) ? eliminatedData.departureBoard.length : 0;

  res.json({
    generatedAt: new Date().toISOString(),
    hasOpenAiKey: hasOpenAiKey(),
    imageGenerationEnabled: imageGenerationEnabled(),
    hasBlobToken: hasBlobToken(),
    hasAdminRenderToken: hasAdminRenderToken(),
    currentSceneHash: generatedScene.sceneHash,
    loungeTeamCount,
    departureBoardCount,
    expectedAssets: expectedAssets(generatedScene.sceneHash),
    existingAssets: {
      lounge: serialiseDebugAsset(existingAssets?.lounge),
      board: serialiseDebugAsset(existingAssets?.board),
      manifest: serialiseDebugAsset(existingAssets?.manifest)
    },
    storageDiagnostics: storageDiagnosticsFromStatus(storageStatus),
    status: generatedScene.status,
    storageStatus: generatedScene.storageStatus,
    warnings: debugWarnings({ generatedScene, loungeTeamCount })
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

router.post(
  '/admin/departure-scene/regenerate',
  departureSceneAdminLimiter,
  requireAdminRenderToken,
  asyncHandler(async (req, res) => {
    res.json({
      generatedScene: await ensureDepartureSceneGenerated({ force: true })
    });
  })
);

router.post(
  '/admin/departure-scene/generate-if-missing',
  departureSceneAdminLimiter,
  requireAdminRenderToken,
  asyncHandler(async (req, res) => {
    res.json({
      generatedScene: await ensureDepartureSceneGenerated({ force: false })
    });
  })
);

module.exports = router;
