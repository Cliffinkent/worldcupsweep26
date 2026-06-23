const {
  BlobNotFoundError,
  head,
  list,
  put
} = require('@vercel/blob');

const STORAGE_PROVIDER = 'vercel-blob';
const HEALTH_ASSET_PATH = 'departure-scenes/_health/blob-health.txt';
const DEPARTURE_SCENE_PREFIX = 'departure-scenes';
const DEFAULT_BLOB_WRITE_TIMEOUT_MS = 15000;
const ALLOWED_DEPARTURE_SCENE_FILENAMES = new Set([
  'lounge.png',
  'departure-board.svg',
  'manifest.json'
]);

function getBlobToken() {
  return String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
}

function getBlobWriteTimeoutMs() {
  const value = Number.parseInt(process.env.BLOB_WRITE_TIMEOUT_MS || '', 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_BLOB_WRITE_TIMEOUT_MS;
}

async function withBlobWriteTimeout(operation) {
  let timeoutId;
  const operationPromise = operation();
  operationPromise.catch(() => {});

  const timeoutPromise = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Blob write timed out'));
    }, getBlobWriteTimeoutMs());
  });

  try {
    return await Promise.race([operationPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function isBlobNotFoundError(error) {
  return error instanceof BlobNotFoundError || error?.name === 'BlobNotFoundError';
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
    const blob = await withBlobWriteTimeout(() => put(pathname, content, {
      token,
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: shouldOverwrite,
      contentType
    }));

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
  listDepartureSceneAssets
};
