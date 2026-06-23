#!/usr/bin/env node

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const DEFAULT_VERCEL_PREVIEW_URL = 'https://worldcupsweep26-git-codex-vercel-blob-storage-ceekayapps.vercel.app/';
const VERCEL_PROTECTION_BYPASS_HEADER = 'x-vercel-protection-bypass';

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
  'admin_render_token',
  'vercel_automation_bypass_secret',
  'vercel_protection_bypass_secret'
]);
const SECRET_MARKERS = [
  'sk-',
  'x-admin-render-token',
  VERCEL_PROTECTION_BYPASS_HEADER,
  'BLOB_READ_WRITE_TOKEN',
  'OPENAI_API_KEY',
  'API_FOOTBALL_KEY',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
  'VERCEL_PROTECTION_BYPASS_SECRET'
];

function cleanEnv(name) {
  return String(process.env[name] || '').trim();
}

function normaliseBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function buildVercelProtectionHeaders() {
  const secret = cleanEnv('VERCEL_AUTOMATION_BYPASS_SECRET') || cleanEnv('VERCEL_PROTECTION_BYPASS_SECRET');

  return secret
    ? { [VERCEL_PROTECTION_BYPASS_HEADER]: secret }
    : {};
}

function buildRequestUrl(baseUrl, pathname) {
  const base = new URL(baseUrl);
  const url = new URL(pathname, `${base.protocol}//${base.host}`);

  for (const [key, value] of base.searchParams) {
    url.searchParams.set(key, value);
  }

  return url;
}

function resultLine(status, label, detail = '') {
  console.log(`${status} ${label}${detail ? `: ${detail}` : ''}`);
}

function safeErrorMessage(error) {
  return error?.message || 'Vercel departure scene smoke test failed';
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

function scanMarkers(text) {
  return SECRET_MARKERS
    .filter((marker) => text.includes(marker))
    .map((marker) => `marker ${marker}`);
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

function unique(values) {
  return [...new Set(values)];
}

function assertSafeResponse(label, response) {
  const sourceText = response.json === null ? response.text : JSON.stringify(response.json);
  const findings = unique([
    ...scanSecretFields(response.json),
    ...scanMarkers(sourceText),
    ...scanStackTraces(response.json),
    ...(/\n\s+at\s+/.test(response.text) ? [`stack-like text in ${label}`] : [])
  ]);

  if (findings.length) {
    throw new Error(`${label} returned unsafe response content: ${findings.join(', ')}`);
  }
}

function splitSetCookieHeader(value) {
  return String(value || '')
    .split(/,(?=\s*[^;,\s]+=)/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function storeCookies(cookieJar, response) {
  const getSetCookie = response.headers.getSetCookie?.bind(response.headers);
  const setCookieHeaders = getSetCookie
    ? getSetCookie()
    : splitSetCookieHeader(response.headers.get('set-cookie'));

  for (const header of setCookieHeaders) {
    const cookiePair = header.split(';')[0];
    const equalsIndex = cookiePair.indexOf('=');

    if (equalsIndex > 0) {
      cookieJar.set(cookiePair.slice(0, equalsIndex), cookiePair.slice(equalsIndex + 1));
    }
  }
}

function cookieHeader(cookieJar) {
  return [...cookieJar.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

async function fetchWithCookies(url, options, cookieJar) {
  let currentUrl = url.toString();
  let method = options.method || 'GET';

  for (let redirectCount = 0; redirectCount < 6; redirectCount += 1) {
    const headers = {
      ...buildVercelProtectionHeaders(),
      ...(options.headers || {})
    };

    if (cookieJar.size) {
      headers.Cookie = cookieHeader(cookieJar);
    }

    const response = await fetch(currentUrl, {
      method,
      headers,
      redirect: 'manual'
    });

    storeCookies(cookieJar, response);

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    const location = response.headers.get('location');

    if (!location) {
      return response;
    }

    if (response.status === 303) {
      method = 'GET';
    }

    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new Error('Too many redirects while fetching preview URL.');
}

async function request(baseUrl, pathname, options = {}) {
  const url = buildRequestUrl(baseUrl, pathname);
  const response = await fetchWithCookies(url, options, request.cookieJar);
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
    pathname,
    status: response.status,
    contentType,
    text,
    json
  };
}

request.cookieJar = new Map();

function expect(condition, label, failures, detail = '') {
  if (condition) {
    resultLine('PASS', label, detail);
    return;
  }

  resultLine('FAIL', label, detail);
  failures.push(label);
}

function expectJson(label, response, failures) {
  expect(response.json !== null, `${label} returned JSON`, failures, `HTTP ${response.status}`);
}

function validateStorageStatus(response, failures) {
  const label = '/api/storage-status';

  expect(response.status === 200, `${label} returns 200`, failures, `HTTP ${response.status}`);
  expectJson(label, response, failures);
  assertSafeResponse(label, response);

  const body = response.json || {};
  expect(body.hasBlobToken === true, `${label} has Blob token`, failures);
  expect(
    body.storageStatus !== 'storage_not_configured',
    `${label} storage is configured`,
    failures,
    `storageStatus=${body.storageStatus || 'missing'}`
  );
}

function validateDepartureSceneDebug(response, failures) {
  const label = '/api/debug/departure-scene';

  expect(response.status === 200, `${label} returns 200`, failures, `HTTP ${response.status}`);
  expectJson(label, response, failures);
  assertSafeResponse(label, response);

  const body = response.json || {};
  const previewGenerationAllowed = cleanEnv('IMAGE_GENERATION_ENABLED') === 'true';

  expect(body.hasBlobToken === true, `${label} has Blob token`, failures);
  expect(body.hasAdminRenderToken === true, `${label} has admin render token`, failures);
  expect(
    body.imageGenerationEnabled === false || previewGenerationAllowed,
    `${label} image generation disabled on preview`,
    failures,
    `imageGenerationEnabled=${body.imageGenerationEnabled === true}`
  );
}

function validateEliminatedTeams(response, failures) {
  const label = '/api/eliminated-teams';

  expect(response.status === 200, `${label} returns 200`, failures, `HTTP ${response.status}`);
  expectJson(label, response, failures);
  assertSafeResponse(label, response);

  const body = response.json || {};
  const loungeTeams = Array.isArray(body.loungeTeams) ? body.loungeTeams : [];
  const generatedScene = body.generatedScene || null;

  expect(Boolean(generatedScene), `${label} includes generatedScene`, failures);
  expect(Boolean(generatedScene?.status), `${label} generatedScene has status`, failures);
  expect(
    loungeTeams.length === 0 || Boolean(generatedScene?.sceneHash),
    `${label} generatedScene has sceneHash when lounge teams exist`,
    failures,
    `loungeTeams=${loungeTeams.length}`
  );
}

function validateForbiddenAdminCall(label, response, failures) {
  assertSafeResponse(label, response);
  expect(response.status === 403, `${label} returns 403`, failures, `HTTP ${response.status}`);
}

async function main() {
  const baseUrl = normaliseBaseUrl(cleanEnv('VERCEL_PREVIEW_URL') || DEFAULT_VERCEL_PREVIEW_URL);
  const failures = [];

  if (!baseUrl) {
    throw new Error('VERCEL_PREVIEW_URL is required.');
  }

  const targetHost = new URL(baseUrl).host;
  console.log(`target host: ${targetHost}`);

  validateStorageStatus(await request(baseUrl, '/api/storage-status'), failures);
  validateDepartureSceneDebug(await request(baseUrl, '/api/debug/departure-scene'), failures);
  validateEliminatedTeams(await request(baseUrl, '/api/eliminated-teams'), failures);
  validateForbiddenAdminCall(
    'admin regenerate without token',
    await request(baseUrl, '/api/admin/departure-scene/regenerate', { method: 'POST' }),
    failures
  );
  validateForbiddenAdminCall(
    'admin regenerate with wrong token',
    await request(baseUrl, '/api/admin/departure-scene/regenerate', {
      method: 'POST',
      headers: {
        'x-admin-render-token': 'definitely-wrong-token'
      }
    }),
    failures
  );

  if (failures.length) {
    throw new Error(`${failures.length} smoke check(s) failed`);
  }

  console.log('departure scene Vercel smoke test passed');
}

main().catch((error) => {
  console.error(`departure scene Vercel smoke test failed: ${safeErrorMessage(error)}`);

  if (process.env.DEBUG === 'true' && error?.stack) {
    console.error(error.stack);
  }

  process.exit(1);
});
