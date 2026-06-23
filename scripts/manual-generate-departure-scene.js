#!/usr/bin/env node

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const SECRET_FIELD_NAMES = new Set([
  'token',
  'apikey',
  'api_key',
  'openaiapikey',
  'blobtoken',
  'blobreadwritetoken',
  'adminrendertoken',
  'api_football_key',
  'openai_api_key',
  'blob_read_write_token',
  'admin_render_token'
]);
const SECRET_MARKERS = [
  'sk-',
  'x-admin-render-token',
  'BLOB_READ_WRITE_TOKEN',
  'OPENAI_API_KEY',
  'API_FOOTBALL_KEY'
];

function cleanEnv(name) {
  return String(process.env[name] || '').trim();
}

function normaliseBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function safeErrorMessage(error) {
  return error?.message || 'Manual departure scene generation failed';
}

function responsePath(basePath, key) {
  return /^[A-Za-z_$][\w$]*$/.test(key)
    ? `${basePath}.${key}`
    : `${basePath}[${JSON.stringify(key)}]`;
}

function scanSecretFields(value, basePath = '$', findings = []) {
  if (!value || typeof value !== 'object') {
    return findings;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanSecretFields(entry, `${basePath}[${index}]`, findings));
    return findings;
  }

  for (const [key, childValue] of Object.entries(value)) {
    const currentPath = responsePath(basePath, key);

    if (SECRET_FIELD_NAMES.has(key.toLowerCase())) {
      findings.push(`field ${currentPath}`);
    }

    scanSecretFields(childValue, currentPath, findings);
  }

  return findings;
}

function scanStackTraces(value, basePath = '$', findings = []) {
  if (typeof value === 'string') {
    if (/\n\s+at\s+/.test(value) || /\bat\s+.+:\d+:\d+\)?/.test(value)) {
      findings.push(`stack-like text at ${basePath}`);
    }

    return findings;
  }

  if (!value || typeof value !== 'object') {
    return findings;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanStackTraces(entry, `${basePath}[${index}]`, findings));
    return findings;
  }

  for (const [key, childValue] of Object.entries(value)) {
    const currentPath = responsePath(basePath, key);

    if (key.toLowerCase() === 'stack') {
      findings.push(`stack field ${currentPath}`);
    }

    scanStackTraces(childValue, currentPath, findings);
  }

  return findings;
}

function assertSafeResponse(label, response) {
  const text = response.json === null ? response.text : JSON.stringify(response.json);
  const findings = [
    ...new Set([
      ...scanSecretFields(response.json),
      ...SECRET_MARKERS
        .filter((marker) => text.includes(marker))
        .map((marker) => `marker ${marker}`),
      ...scanStackTraces(response.json),
      ...(/\n\s+at\s+/.test(text) ? [`stack-like text in ${label}`] : [])
    ])
  ];

  if (findings.length) {
    throw new Error(`${label} returned unsafe response content: ${findings.join(', ')}`);
  }
}

async function request(baseUrl, pathname, options = {}) {
  const url = new URL(pathname, `${baseUrl}/`);
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.headers || {}
  });
  const text = await response.text();
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  let json = null;

  if (text && (contentType.includes('application/json') || /^[\s]*[\[{]/.test(text))) {
    try {
      json = JSON.parse(text);
    } catch (error) {
      json = null;
    }
  }

  return {
    status: response.status,
    text,
    json
  };
}

function safeSceneSummary(response) {
  const generatedScene = response?.json?.generatedScene || null;

  return {
    httpStatus: response.status,
    sceneStatus: generatedScene?.status || null,
    sceneHash: generatedScene?.sceneHash || null,
    loungeImageUrlPresent: Boolean(generatedScene?.loungeImageUrl),
    boardImageUrlPresent: Boolean(generatedScene?.boardImageUrl)
  };
}

function printSceneSummary(label, summary) {
  console.log(`${label} HTTP status: ${summary.httpStatus}`);
  console.log(`${label} generatedScene.status: ${summary.sceneStatus || 'missing'}`);
  console.log(`${label} sceneHash: ${summary.sceneHash || 'missing'}`);
  console.log(`${label} loungeImageUrl present: ${summary.loungeImageUrlPresent}`);
  console.log(`${label} boardImageUrl present: ${summary.boardImageUrlPresent}`);
}

function nextActionForStatus(status) {
  switch (status) {
    case 'generation_disabled':
      return 'Set IMAGE_GENERATION_ENABLED=true in Vercel when ready, then rerun the manual script.';
    case 'openai_not_configured':
      return 'Confirm OPENAI_API_KEY is configured server-side in Vercel, then rerun the manual script.';
    case 'storage_not_configured':
    case 'failed':
      return 'Check Vercel Blob configuration and deployment logs before retrying.';
    case 'assets_missing':
    case 'board_ready_lounge_missing':
      return 'Retry the manual generation after confirming admin and image-generation env vars.';
    case 'empty':
      return 'No eliminated teams are available yet, so no generation is needed.';
    default:
      return 'Check safe diagnostics at /api/debug/departure-scene before retrying.';
  }
}

async function main() {
  const baseUrl = normaliseBaseUrl(cleanEnv('VERCEL_PROD_URL'));
  const adminToken = cleanEnv('ADMIN_RENDER_TOKEN');

  if (!baseUrl) {
    throw new Error('VERCEL_PROD_URL is required.');
  }

  if (!adminToken) {
    throw new Error('ADMIN_RENDER_TOKEN is required.');
  }

  const targetHost = new URL(baseUrl).host;
  console.log(`target host: ${targetHost}`);
  console.log(`has admin token: ${Boolean(adminToken)}`);

  const generateResponse = await request(baseUrl, '/api/admin/departure-scene/generate-if-missing', {
    method: 'POST',
    headers: {
      'x-admin-render-token': adminToken
    }
  });
  assertSafeResponse('admin generate-if-missing', generateResponse);
  printSceneSummary('admin generate-if-missing', safeSceneSummary(generateResponse));

  if (generateResponse.status < 200 || generateResponse.status >= 300) {
    throw new Error(`admin generate-if-missing returned HTTP ${generateResponse.status}.`);
  }

  if (!generateResponse?.json?.generatedScene) {
    throw new Error('admin generate-if-missing did not include generatedScene.');
  }

  const eliminatedResponse = await request(baseUrl, '/api/eliminated-teams');
  assertSafeResponse('/api/eliminated-teams', eliminatedResponse);

  if (eliminatedResponse.status !== 200) {
    throw new Error(`/api/eliminated-teams returned HTTP ${eliminatedResponse.status}.`);
  }

  const generatedScene = eliminatedResponse?.json?.generatedScene || null;

  if (!generatedScene) {
    throw new Error('/api/eliminated-teams did not include generatedScene.');
  }

  const summary = safeSceneSummary(eliminatedResponse);
  printSceneSummary('/api/eliminated-teams', summary);

  if (generatedScene.status === 'ready') {
    if (!generatedScene.loungeImageUrl || !generatedScene.boardImageUrl) {
      throw new Error('Generated scene is ready but one or more image URLs are missing.');
    }

    console.log('manual departure scene generation confirmed ready');
    return;
  }

  console.log(`safe next action: ${nextActionForStatus(generatedScene.status)}`);
}

main().catch((error) => {
  console.error(`manual departure scene generation failed: ${safeErrorMessage(error)}`);

  if (process.env.DEBUG === 'true' && error?.stack) {
    console.error(error.stack);
  }

  process.exit(1);
});
