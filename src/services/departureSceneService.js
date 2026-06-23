const OpenAI = require('openai');
const { getEliminatedTeamsData } = require('./sweepstakeService');
const {
  putDepartureSceneAsset,
  getDepartureSceneAssetMetadata
} = require('./blobStorageService');
const {
  buildDepartureLoungePrompt,
  buildDepartureSceneHash,
  getSafePromptPreview
} = require('./departureScenePromptService');
const { renderDepartureBoardSvg } = require('./departureBoardRenderService');

const LOUNGE_FILENAME = 'lounge.png';
const BOARD_FILENAME = 'departure-board.svg';
const MANIFEST_FILENAME = 'manifest.json';

class DepartureSceneError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DepartureSceneError';
    this.code = code;
  }
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getStyleVersion() {
  return cleanText(process.env.DEPARTURE_SCENE_STYLE_VERSION || '1') || '1';
}

function imageGenerationEnabled() {
  return process.env.IMAGE_GENERATION_ENABLED === 'true';
}

function hasOpenAiKey() {
  return Boolean(cleanText(process.env.OPENAI_API_KEY));
}

function assetPath(sceneHash, filename) {
  return sceneHash ? `departure-scenes/${sceneHash}/${filename}` : null;
}

function serialiseAsset(response) {
  const metadata = response?.metadata || null;

  return {
    exists: response?.exists === true,
    pathname: response?.pathname || metadata?.pathname || null,
    url: metadata?.url || null,
    uploadedAt: metadata?.uploadedAt || null,
    contentType: metadata?.contentType || null,
    size: metadata?.size || null,
    storageStatus: response?.storageStatus || null
  };
}

function getStorageStatusFromAssets(assets) {
  const statuses = [assets.lounge, assets.board, assets.manifest]
    .map((asset) => asset.storageStatus)
    .filter(Boolean);

  if (statuses.includes('storage_not_configured')) {
    return 'storage_not_configured';
  }

  if (statuses.includes('storage_error')) {
    return 'storage_error';
  }

  return 'ready';
}

function newestUploadedAt(...assets) {
  return assets
    .map((asset) => asset?.uploadedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

function sceneErrorMessage(status) {
  switch (status) {
    case 'storage_not_configured':
      return 'Image storage is not configured.';
    case 'generation_disabled':
      return 'Generated lounge images are disabled.';
    case 'openai_not_configured':
      return 'Image generation is not configured.';
    case 'failed':
      return 'Generated image unavailable, showing fallback.';
    default:
      return null;
  }
}

function buildSceneResponse({
  status,
  storageStatus = 'ready',
  sceneHash = null,
  styleVersion = getStyleVersion(),
  prompt = null,
  assets = null,
  generatedAt = null,
  errorMessage = null
}) {
  const promptPreview = getSafePromptPreview(prompt);

  return {
    status,
    storageStatus,
    sceneHash,
    styleVersion,
    loungeImageUrl: assets?.lounge?.url || null,
    boardImageUrl: assets?.board?.url || null,
    generatedAt: generatedAt || newestUploadedAt(assets?.manifest, assets?.lounge, assets?.board),
    promptPreview,
    loungePromptPreview: promptPreview,
    errorMessage: errorMessage || sceneErrorMessage(status)
  };
}

function logSceneFailure({ sceneHash, status, error }) {
  const errorCategory = error?.code || error?.name || 'unknown_error';
  const payload = { sceneHash, status, errorCategory };

  if (process.env.DEBUG === 'true') {
    console.warn('departure scene generation failed', payload, error?.stack || error);
    return;
  }

  console.warn('departure scene generation failed', payload);
}

function getSceneBase(eliminatedData) {
  const loungeTeams = Array.isArray(eliminatedData?.loungeTeams) ? eliminatedData.loungeTeams : [];
  const departureBoard = Array.isArray(eliminatedData?.departureBoard) ? eliminatedData.departureBoard : [];
  const styleVersion = getStyleVersion();
  const sceneHash = buildDepartureSceneHash({ loungeTeams, styleVersion });
  const prompt = buildDepartureLoungePrompt({ loungeTeams, styleVersion });

  return {
    loungeTeams,
    departureBoard,
    styleVersion,
    sceneHash,
    prompt
  };
}

async function getExistingSceneAssets({ sceneHash }) {
  if (!sceneHash) {
    return {
      storageStatus: 'empty',
      lounge: serialiseAsset(null),
      board: serialiseAsset(null),
      manifest: serialiseAsset(null)
    };
  }

  const [lounge, board, manifest] = await Promise.all([
    getDepartureSceneAssetMetadata({ sceneHash, filename: LOUNGE_FILENAME }),
    getDepartureSceneAssetMetadata({ sceneHash, filename: BOARD_FILENAME }),
    getDepartureSceneAssetMetadata({ sceneHash, filename: MANIFEST_FILENAME })
  ]);
  const assets = {
    lounge: serialiseAsset(lounge),
    board: serialiseAsset(board),
    manifest: serialiseAsset(manifest)
  };

  return {
    storageStatus: getStorageStatusFromAssets(assets),
    ...assets
  };
}

async function generateAndStoreDepartureBoard({ departureBoard, sceneHash, force = false }) {
  const generatedAt = new Date().toISOString();
  const svg = renderDepartureBoardSvg({ departureBoard, generatedAt });

  return putDepartureSceneAsset({
    sceneHash,
    filename: BOARD_FILENAME,
    content: svg,
    contentType: 'image/svg+xml',
    forceOverwrite: force === true
  });
}

async function storeManifest({
  sceneHash,
  styleVersion,
  loungeTeams,
  prompt,
  assets,
  force = false
}) {
  const generatedAt = new Date().toISOString();
  const manifest = {
    sceneHash,
    styleVersion,
    countries: (loungeTeams || []).map((team) => team.country).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    generatedAt,
    loungeImageUrl: assets?.lounge?.url || null,
    boardImageUrl: assets?.board?.url || null,
    promptPreview: getSafePromptPreview(prompt)
  };

  return putDepartureSceneAsset({
    sceneHash,
    filename: MANIFEST_FILENAME,
    content: JSON.stringify(manifest, null, 2),
    contentType: 'application/json',
    forceOverwrite: force === true
  });
}

async function generateDepartureLoungeImage({
  loungeTeams,
  sceneHash,
  prompt,
  force = false
}) {
  if (!loungeTeams?.length) {
    return {
      status: 'empty',
      uploaded: false,
      url: null
    };
  }

  if (!imageGenerationEnabled()) {
    return {
      status: 'generation_disabled',
      uploaded: false,
      url: null
    };
  }

  const apiKey = cleanText(process.env.OPENAI_API_KEY);

  if (!apiKey) {
    return {
      status: 'openai_not_configured',
      uploaded: false,
      url: null
    };
  }

  if (!prompt) {
    throw new DepartureSceneError('prompt_missing', 'Departure lounge prompt is missing.');
  }

  const openai = new OpenAI({ apiKey });
  const result = await openai.images.generate({
    model: 'gpt-image-2',
    prompt,
    size: '1536x1024',
    quality: 'medium',
    output_format: 'png'
  });
  const b64Json = result?.data?.[0]?.b64_json;

  if (!b64Json) {
    throw new DepartureSceneError('openai_image_missing', 'OpenAI image response did not include image data.');
  }

  const imageBuffer = Buffer.from(b64Json, 'base64');

  if (!imageBuffer.length) {
    throw new DepartureSceneError('openai_image_empty', 'OpenAI image response was empty.');
  }

  return putDepartureSceneAsset({
    sceneHash,
    filename: LOUNGE_FILENAME,
    content: imageBuffer,
    contentType: 'image/png',
    forceOverwrite: force === true
  });
}

async function ensureBoardAsset({ departureBoard, sceneHash, assets, force }) {
  if (assets.board.exists && !force) {
    return assets;
  }

  const boardResult = await generateAndStoreDepartureBoard({ departureBoard, sceneHash, force });

  if (boardResult.storageStatus === 'storage_error' || boardResult.storageStatus === 'storage_not_configured') {
    return {
      ...assets,
      storageStatus: boardResult.storageStatus,
      board: serialiseAsset(boardResult)
    };
  }

  return getExistingSceneAssets({ sceneHash });
}

async function resolveDepartureScene({
  eliminatedData,
  force = false,
  allowOpenAi = false,
  allowWrites = false
}) {
  const {
    loungeTeams,
    departureBoard,
    styleVersion,
    sceneHash,
    prompt
  } = getSceneBase(eliminatedData);

  if (!loungeTeams.length) {
    return buildSceneResponse({
      status: 'empty',
      storageStatus: 'ready',
      sceneHash,
      styleVersion,
      prompt
    });
  }

  let assets = await getExistingSceneAssets({ sceneHash });

  if (assets.storageStatus === 'storage_not_configured') {
    return buildSceneResponse({
      status: 'storage_not_configured',
      storageStatus: 'storage_not_configured',
      sceneHash,
      styleVersion,
      prompt,
      assets
    });
  }

  if (assets.storageStatus === 'storage_error') {
    return buildSceneResponse({
      status: 'failed',
      storageStatus: 'storage_error',
      sceneHash,
      styleVersion,
      prompt,
      assets
    });
  }

  if (allowWrites) {
    assets = await ensureBoardAsset({ departureBoard, sceneHash, assets, force });
  }

  if (assets.storageStatus === 'storage_not_configured' || assets.storageStatus === 'storage_error') {
    return buildSceneResponse({
      status: assets.storageStatus === 'storage_not_configured' ? 'storage_not_configured' : 'failed',
      storageStatus: assets.storageStatus,
      sceneHash,
      styleVersion,
      prompt,
      assets
    });
  }

  const sceneReady = assets.lounge.exists && assets.board.exists;

  if (sceneReady && !force) {
    if (allowWrites && !assets.manifest.exists) {
      await storeManifest({ sceneHash, styleVersion, loungeTeams, prompt, assets, force: false });
      assets = await getExistingSceneAssets({ sceneHash });
    }

    return buildSceneResponse({
      status: 'ready',
      storageStatus: 'ready',
      sceneHash,
      styleVersion,
      prompt,
      assets
    });
  }

  if (!imageGenerationEnabled()) {
    return buildSceneResponse({
      status: sceneReady ? 'ready' : 'generation_disabled',
      storageStatus: 'ready',
      sceneHash,
      styleVersion,
      prompt,
      assets
    });
  }

  if (!hasOpenAiKey()) {
    return buildSceneResponse({
      status: sceneReady ? 'ready' : 'openai_not_configured',
      storageStatus: 'ready',
      sceneHash,
      styleVersion,
      prompt,
      assets
    });
  }

  if (!allowOpenAi) {
    return buildSceneResponse({
      status: sceneReady ? 'ready' : 'pending',
      storageStatus: 'ready',
      sceneHash,
      styleVersion,
      prompt,
      assets
    });
  }

  try {
    const shouldGenerate = force || !assets.lounge.exists;

    if (shouldGenerate) {
      const loungeResult = await generateDepartureLoungeImage({
        loungeTeams,
        sceneHash,
        prompt,
        force
      });

      if (loungeResult.storageStatus === 'storage_error' || loungeResult.storageStatus === 'storage_not_configured') {
        throw new DepartureSceneError(loungeResult.storageStatus, 'Lounge image upload failed.');
      }
    }

    assets = await getExistingSceneAssets({ sceneHash });

    if (assets.lounge.exists && assets.board.exists) {
      await storeManifest({ sceneHash, styleVersion, loungeTeams, prompt, assets, force });
      assets = await getExistingSceneAssets({ sceneHash });

      return buildSceneResponse({
        status: 'ready',
        storageStatus: 'ready',
        sceneHash,
        styleVersion,
        prompt,
        assets
      });
    }

    return buildSceneResponse({
      status: 'failed',
      storageStatus: assets.storageStatus,
      sceneHash,
      styleVersion,
      prompt,
      assets
    });
  } catch (error) {
    logSceneFailure({ sceneHash, status: 'failed', error });
    assets = await getExistingSceneAssets({ sceneHash });

    return buildSceneResponse({
      status: 'failed',
      storageStatus: assets.storageStatus,
      sceneHash,
      styleVersion,
      prompt,
      assets,
      errorMessage: assets.lounge.exists && assets.board.exists
        ? 'Generated image unavailable, showing previous scene.'
        : 'Generated image unavailable, showing fallback.'
    });
  }
}

async function getDepartureSceneState({ eliminatedData } = {}) {
  return resolveDepartureScene({
    eliminatedData,
    force: false,
    allowOpenAi: false,
    allowWrites: false
  });
}

async function ensureDepartureSceneGenerated({ force = false } = {}) {
  const eliminatedData = await getEliminatedTeamsData();

  return resolveDepartureScene({
    eliminatedData,
    force,
    allowOpenAi: true,
    allowWrites: true
  });
}

module.exports = {
  getDepartureSceneState,
  ensureDepartureSceneGenerated,
  generateDepartureLoungeImage,
  generateAndStoreDepartureBoard,
  getExistingSceneAssets,
  assetPath,
  imageGenerationEnabled,
  hasOpenAiKey
};
