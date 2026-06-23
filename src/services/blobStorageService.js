const {
  BlobNotFoundError,
  head,
  list,
  put
} = require('@vercel/blob');

const STORAGE_PROVIDER = 'vercel-blob';
const HEALTH_ASSET_PATH = 'departure-scenes/_health/blob-health.txt';
const DEPARTURE_SCENE_PREFIX = 'departure-scenes';
const ALLOWED_DEPARTURE_SCENE_FILENAMES = new Set([
  'lounge.png',
  'departure-board.svg',
  'manifest.json'
]);

function getBlobToken() {
  return String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
}

function isBlobNotFoundError(error) {
  return error instanceof BlobNotFoundError || error?.name === 'BlobNotFoundError';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCategory(error) {
  const message = String(error?.message || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();

  if (message.includes('aborted') || name.includes('abort')) {
    return 'request_aborted';
  }

  if (message.includes('fetch failed') || message.includes('network')) {
    return 'network_error';
  }

  if (message.includes('timeout') || message.includes('timed out')) {
    return 'network_timeout';
  }

  if (message.includes('rate limit') || message.includes('429')) {
    return 'rate_limited';
  }

  if (message.includes('token') || message.includes('authorization') || message.includes('auth')) {
    return 'auth_error';
  }

  if (message.includes('bad request') || message.includes('invalid')) {
    return 'invalid_request';
  }

  return error?.name || 'blob_error';
}

function isTransientBlobError(error) {
  return new Set([
    'request_aborted',
    'network_error',
    'network_timeout',
    'rate_limited'
  ]).has(errorCategory(error));
}

function contentLength(content) {
  if (Buffer.isBuffer(content)) {
    return content.length;
  }

  if (typeof content === 'string') {
    return Buffer.byteLength(content, 'utf8');
  }

  if (content instanceof Uint8Array) {
    return content.byteLength;
  }

  return null;
}

function normaliseUploadContent({ content, contentType }) {
  if (typeof content === 'string' && String(contentType || '').toLowerCase().startsWith('image/svg+xml')) {
    return Buffer.from(content, 'utf8');
  }

  return content;
}

function safeUploadDiagnostics({ pathname, content, contentType, attempt, error }) {
  return {
    pathname,
    contentType,
    contentLength: contentLength(content),
    attempt,
    errorCategory: error ? errorCategory(error) : undefined
  };
}

function logUploadRetry(details) {
  if (process.env.DEBUG === 'true' && details.error) {
    console.warn('vercel blob upload retry', safeUploadDiagnostics(details), details.error.stack || details.error);
    return;
  }

  console.warn('vercel blob upload retry', safeUploadDiagnostics(details));
}

async function uploadWithRetry({ pathname, content, options, retries = 2 }) {
  const backoffs = [500, 1500];
  const uploadContent = normaliseUploadContent({ content, contentType: options?.contentType });
  let lastError = null;

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      return await put(pathname, uploadContent, options);
    } catch (error) {
      lastError = error;

      if (!isTransientBlobError(error) || attempt > retries) {
        throw error;
      }

      logUploadRetry({
        pathname,
        content: uploadContent,
        contentType: options?.contentType,
        attempt,
        error
      });
      await sleep(backoffs[attempt - 1] || backoffs.at(-1));
    }
  }

  throw lastError;
}

function validateSceneHash(sceneHash) {
  const value = String(sceneHash || '').trim();

  if (!/^[a-z0-9_-]{8,128}$/i.test(value)) {
    throw new Error('Invalid departure scene hash');
  }

  return value;
}

function validateDepartureSceneFilename(filename) {
  const value = String(filename || '').trim();

  if (!ALLOWED_DEPARTURE_SCENE_FILENAMES.has(value)) {
    throw new Error('Invalid departure scene filename');
  }

  return value;
}

function getDepartureSceneAssetPath({ sceneHash, filename }) {
  return `${DEPARTURE_SCENE_PREFIX}/${validateSceneHash(sceneHash)}/${validateDepartureSceneFilename(filename)}`;
}

function serialiseBlobMetadata(metadata) {
  if (!metadata) {
    return null;
  }

  return {
    pathname: metadata.pathname,
    url: metadata.url,
    downloadUrl: metadata.downloadUrl,
    contentType: metadata.contentType,
    contentDisposition: metadata.contentDisposition,
    cacheControl: metadata.cacheControl,
    size: metadata.size,
    uploadedAt: metadata.uploadedAt instanceof Date
      ? metadata.uploadedAt.toISOString()
      : metadata.uploadedAt,
    etag: metadata.etag
  };
}

function storageNotConfiguredResponse(extra = {}) {
  return {
    storageProvider: STORAGE_PROVIDER,
    hasBlobToken: false,
    storageStatus: 'storage_not_configured',
    ...extra
  };
}

async function getBlobStorageStatus() {
  const token = getBlobToken();
  const lastCheckedAt = new Date().toISOString();

  if (!token) {
    return storageNotConfiguredResponse({
      healthAssetPath: HEALTH_ASSET_PATH,
      healthAssetExists: false,
      lastCheckedAt
    });
  }

  try {
    await head(HEALTH_ASSET_PATH, { token });

    return {
      storageProvider: STORAGE_PROVIDER,
      hasBlobToken: true,
      storageStatus: 'ready',
      healthAssetPath: HEALTH_ASSET_PATH,
      healthAssetExists: true,
      lastCheckedAt
    };
  } catch (error) {
    if (isBlobNotFoundError(error)) {
      return {
        storageProvider: STORAGE_PROVIDER,
        hasBlobToken: true,
        storageStatus: 'health_asset_missing',
        healthAssetPath: HEALTH_ASSET_PATH,
        healthAssetExists: false,
        lastCheckedAt
      };
    }

    return {
      storageProvider: STORAGE_PROVIDER,
      hasBlobToken: true,
      storageStatus: 'storage_error',
      healthAssetPath: HEALTH_ASSET_PATH,
      healthAssetExists: false,
      lastCheckedAt
    };
  }
}

async function getDepartureSceneAssetMetadata({ sceneHash, filename }) {
  const pathname = getDepartureSceneAssetPath({ sceneHash, filename });
  const token = getBlobToken();

  if (!token) {
    return storageNotConfiguredResponse({
      pathname,
      exists: false,
      metadata: null
    });
  }

  try {
    const metadata = await head(pathname, { token });

    return {
      storageProvider: STORAGE_PROVIDER,
      hasBlobToken: true,
      storageStatus: 'ready',
      pathname,
      exists: true,
      metadata: serialiseBlobMetadata(metadata)
    };
  } catch (error) {
    if (isBlobNotFoundError(error)) {
      return {
        storageProvider: STORAGE_PROVIDER,
        hasBlobToken: true,
        storageStatus: 'asset_not_found',
        pathname,
        exists: false,
        metadata: null
      };
    }

    return {
      storageProvider: STORAGE_PROVIDER,
      hasBlobToken: true,
      storageStatus: 'storage_error',
      pathname,
      exists: false,
      metadata: null
    };
  }
}

async function departureSceneAssetExists({ sceneHash, filename }) {
  const metadata = await getDepartureSceneAssetMetadata({ sceneHash, filename });
  return metadata.exists === true;
}

async function listDepartureSceneAssets({ sceneHash }) {
  const hash = validateSceneHash(sceneHash);
  const prefix = `${DEPARTURE_SCENE_PREFIX}/${hash}/`;
  const token = getBlobToken();

  if (!token) {
    return storageNotConfiguredResponse({
      prefix,
      assets: []
    });
  }

  try {
    const result = await list({ token, prefix });

    return {
      storageProvider: STORAGE_PROVIDER,
      hasBlobToken: true,
      storageStatus: 'ready',
      prefix,
      assets: result.blobs.map(serialiseBlobMetadata)
    };
  } catch (error) {
    return {
      storageProvider: STORAGE_PROVIDER,
      hasBlobToken: true,
      storageStatus: 'storage_error',
      prefix,
      assets: []
    };
  }
}

async function putDepartureSceneAsset({
  sceneHash,
  filename,
  content,
  contentType,
  forceOverwrite = false,
  force = false
}) {
  const pathname = getDepartureSceneAssetPath({ sceneHash, filename });
  const token = getBlobToken();
  const shouldOverwrite = forceOverwrite === true || force === true;

  if (!token) {
    return storageNotConfiguredResponse({
      pathname,
      uploaded: false,
      url: null,
      metadata: null
    });
  }

  if (content === undefined || content === null) {
    throw new Error('Departure scene asset content is required');
  }

  if (!shouldOverwrite) {
    const existing = await getDepartureSceneAssetMetadata({ sceneHash, filename });

    if (existing.exists) {
      return {
        storageProvider: STORAGE_PROVIDER,
        hasBlobToken: true,
        storageStatus: 'asset_exists',
        pathname,
        uploaded: false,
        url: existing.metadata?.url || null,
        metadata: existing.metadata
      };
    }

    if (existing.storageStatus === 'storage_error') {
      return {
        storageProvider: STORAGE_PROVIDER,
        hasBlobToken: true,
        storageStatus: 'storage_error',
        pathname,
        uploaded: false,
        url: null,
        metadata: null
      };
    }
  }

  try {
    const uploadContent = normaliseUploadContent({ content, contentType });
    const blob = await uploadWithRetry({
      pathname,
      content: uploadContent,
      options: {
        token,
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: shouldOverwrite,
        contentType
      }
    });

    return {
      storageProvider: STORAGE_PROVIDER,
      hasBlobToken: true,
      storageStatus: 'ready',
      pathname,
      uploaded: true,
      url: blob.url,
      metadata: serialiseBlobMetadata(blob)
    };
  } catch (error) {
    return {
      storageProvider: STORAGE_PROVIDER,
      hasBlobToken: true,
      storageStatus: 'storage_error',
      pathname,
      uploaded: false,
      url: null,
      metadata: null
    };
  }
}

module.exports = {
  getBlobStorageStatus,
  putDepartureSceneAsset,
  getDepartureSceneAssetMetadata,
  departureSceneAssetExists,
  listDepartureSceneAssets,
  uploadWithRetry
};
