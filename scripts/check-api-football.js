const path = require('path');
const dotenv = require('dotenv');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DOTENV_PATH = path.join(PROJECT_ROOT, '.env');

dotenv.config({ path: DOTENV_PATH });

const fs = require('fs/promises');
const axios = require('axios');

const API_BASE_URL = 'https://v3.football.api-sports.io';
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'diagnostics', 'api-football');
const DEBUG = process.env.DEBUG === 'true';
const AUTH_MODE = 'api-sports-direct';

const endpoints = [
  {
    label: 'leagues',
    path: '/leagues',
    params: { id: '1', season: '2026' },
    sampleFile: 'leagues.sample.json'
  },
  {
    label: 'fixtures',
    path: '/fixtures',
    params: { league: '1', season: '2026' },
    sampleFile: 'fixtures.sample.json'
  },
  {
    label: 'teams',
    path: '/teams',
    params: { league: '1', season: '2026' },
    sampleFile: 'teams.sample.json'
  },
  {
    label: 'standings',
    path: '/standings',
    params: { league: '1', season: '2026' },
    sampleFile: 'standings.sample.json'
  },
  {
    label: 'rounds',
    path: '/fixtures/rounds',
    params: { league: '1', season: '2026' },
    sampleFile: 'rounds.sample.json'
  },
  {
    label: 'live fixtures',
    path: '/fixtures',
    params: { league: '1', season: '2026', status: '1H-HT-2H-ET-P-BT-LIVE-SUSP-INT' },
    sampleFile: 'live-fixtures.sample.json'
  }
];

const smokeEndpoints = [
  {
    label: 'status smoke',
    path: '/status',
    params: {},
    sampleFile: 'status.sample.json'
  },
  {
    label: 'countries smoke',
    path: '/countries',
    params: {},
    sampleFile: 'countries.sample.json'
  }
];

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function normaliseApiKey(rawValue) {
  if (typeof rawValue !== 'string') {
    return '';
  }

  return stripWrappingQuotes(rawValue.trim());
}

function getKeyDiagnostics(rawValue, normalisedKey) {
  return {
    hasKey: Boolean(normalisedKey),
    keyLength: normalisedKey.length,
    containsWhitespace: /\s/.test(rawValue || ''),
    baseUrl: API_BASE_URL,
    authMode: AUTH_MODE
  };
}

function classifyKey(rawValue, normalisedKey) {
  if (!rawValue) {
    return 'missing local env';
  }

  if (!normalisedKey || /\s/.test(normalisedKey)) {
    return 'malformed local env';
  }

  return null;
}

function printKeyDiagnostics(diagnostics) {
  console.log('API-Football auth diagnostics');
  console.log(`Has key: ${diagnostics.hasKey}`);
  console.log(`Key length: ${diagnostics.keyLength}`);
  console.log(`Contains whitespace: ${diagnostics.containsWhitespace}`);
  console.log(`Base URL: ${diagnostics.baseUrl}`);
  console.log(`Auth mode: ${diagnostics.authMode}`);
  console.log('Header: x-apisports-key');
  console.log('Not sending: apikey query parameter, Authorization, x-rapidapi-key, x-rapidapi-host');
}

function getRemainingQuota(headers) {
  const remaining = {};

  Object.entries(headers || {}).forEach(([key, value]) => {
    const lowered = key.toLowerCase();

    if (lowered.includes('rate') && lowered.includes('remaining')) {
      remaining[key] = value;
    }
  });

  return remaining;
}

function getStandingsGroupCount(responseItems) {
  const groups = new Set();

  responseItems.forEach((item) => {
    (item?.league?.standings || []).forEach((standingGroup) => {
      standingGroup.forEach((standing) => {
        if (standing?.group) {
          groups.add(standing.group);
        }
      });
    });
  });

  return groups.size;
}

function buildSample(payload) {
  return {
    get: payload?.get || null,
    parameters: payload?.parameters || {},
    errors: payload?.errors || [],
    results: payload?.results || 0,
    paging: payload?.paging || null,
    response: Array.isArray(payload?.response) ? payload.response.slice(0, 3) : []
  };
}

function hasProviderErrors(payload) {
  if (!payload?.errors) {
    return false;
  }

  if (Array.isArray(payload.errors)) {
    return payload.errors.length > 0;
  }

  if (typeof payload.errors === 'object') {
    return Object.keys(payload.errors).length > 0;
  }

  return Boolean(payload.errors);
}

function sanitiseProviderErrors(errors) {
  if (!errors) {
    return [];
  }

  if (Array.isArray(errors)) {
    return errors.map((error) => String(error));
  }

  if (typeof errors === 'object') {
    return Object.entries(errors).map(([key, value]) => `${key}: ${String(value)}`);
  }

  return [String(errors)];
}

function classifyProviderFailure(endpoint, payload) {
  const safeErrors = sanitiseProviderErrors(payload?.errors);
  const joined = safeErrors.join(' ').toLowerCase();

  if (joined.includes('missing application key') || joined.includes('application key')) {
    return endpoint.label.includes('smoke') ? 'wrong key type' : 'provider/account issue';
  }

  if (joined.includes('invalid') || joined.includes('token') || joined.includes('key')) {
    return 'wrong key type';
  }

  if (
    joined.includes('account') ||
    joined.includes('subscription') ||
    joined.includes('plan') ||
    joined.includes('blocked')
  ) {
    return 'provider/account issue';
  }

  return endpoint.label.includes('smoke') ? 'provider/account issue' : 'World Cup endpoint issue';
}

async function writeSample(endpoint, payload) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(
    path.join(OUTPUT_DIR, endpoint.sampleFile),
    `${JSON.stringify(buildSample(payload), null, 2)}\n`
  );
}

async function writeDiagnosticsGitignore() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIR, '.gitignore'), '*.sample.json\n');
}

async function callEndpoint(client, endpoint) {
  const response = await client.get(endpoint.path, {
    params: endpoint.params
  });

  await writeSample(endpoint, response.data);

  if (response.status >= 400) {
    return {
      endpoint: endpoint.label,
      path: endpoint.path,
      failed: true,
      failureType: response.status === 404 ? 'endpoint unavailable' : 'provider/account issue',
      failureMessage: `HTTP ${response.status}`,
      safeErrors: [],
      results: 0,
      responseItems: [],
      remainingQuota: getRemainingQuota(response.headers)
    };
  }

  if (hasProviderErrors(response.data)) {
    return {
      endpoint: endpoint.label,
      path: endpoint.path,
      failed: true,
      failureType: classifyProviderFailure(endpoint, response.data),
      failureMessage: 'Provider returned an error payload',
      safeErrors: sanitiseProviderErrors(response.data.errors),
      results: response.data?.results || 0,
      responseItems: Array.isArray(response.data?.response) ? response.data.response : [],
      remainingQuota: getRemainingQuota(response.headers)
    };
  }

  return {
    endpoint: endpoint.label,
    path: endpoint.path,
    failed: false,
    failureType: null,
    failureMessage: null,
    safeErrors: [],
    results: response.data?.results || 0,
    responseItems: Array.isArray(response.data?.response) ? response.data.response : [],
    remainingQuota: getRemainingQuota(response.headers)
  };
}

async function runSmokeTest(client) {
  const statusResult = await callEndpoint(client, smokeEndpoints[0]);

  if (!statusResult.failed || statusResult.failureType !== 'endpoint unavailable') {
    return statusResult;
  }

  return callEndpoint(client, smokeEndpoints[1]);
}

function printEndpointFailure(result) {
  console.log(`Endpoint failed: ${result.path}`);
  console.log(`Failure type: ${result.failureType}`);
  console.log(`Message: ${result.failureMessage}`);

  if (result.safeErrors.length) {
    console.log('Provider errors:');
    result.safeErrors.forEach((error) => {
      console.log(`- ${error}`);
    });
  }
}

function printSummary(results, smokeResult) {
  const byEndpoint = new Map(results.map((result) => [result.endpoint, result]));
  const fixtures = byEndpoint.get('fixtures');
  const teams = byEndpoint.get('teams');
  const standings = byEndpoint.get('standings');
  const rounds = byEndpoint.get('rounds');
  const liveFixtures = byEndpoint.get('live fixtures');
  const failures = results.filter((result) => result.failed);
  const quota = [...results, smokeResult].reduce((allQuota, result) => ({
    ...allQuota,
    ...result.remainingQuota
  }), {});

  console.log('API-Football data diagnostics');
  console.log(`Auth smoke test: passed (${smokeResult.path})`);
  console.log(`Provider reachable: true`);
  console.log(`Fixture count: ${fixtures?.results || 0}`);
  console.log(`Team count: ${teams?.results || 0}`);
  console.log(`Standings group count: ${standings ? getStandingsGroupCount(standings.responseItems) : 0}`);
  console.log(`Rounds count: ${rounds?.results || 0}`);
  console.log(`Live fixture count: ${liveFixtures?.results || 0}`);

  if (Object.keys(quota).length) {
    console.log(`Remaining request quota: ${JSON.stringify(quota)}`);
  } else {
    console.log('Remaining request quota: not reported');
  }

  console.log(`Sample files written to: ${path.relative(process.cwd(), OUTPUT_DIR)}`);

  if (failures.length) {
    console.log('Endpoint failures:');
    failures.forEach((failure) => {
      console.log(`- ${failure.endpoint}: ${failure.failureType}`);
    });
  } else if (
    (fixtures?.results || 0) === 0 &&
    (teams?.results || 0) === 0 &&
    (standings?.results || 0) === 0 &&
    (rounds?.results || 0) === 0
  ) {
    console.log('Classification: World Cup endpoint issue');
  } else {
    console.log('Classification: World Cup data available');
  }
}

async function main() {
  const rawApiKey = process.env.API_FOOTBALL_KEY;
  const apiKey = normaliseApiKey(rawApiKey);
  const keyDiagnostics = getKeyDiagnostics(rawApiKey, apiKey);
  const localKeyProblem = classifyKey(rawApiKey, apiKey);

  printKeyDiagnostics(keyDiagnostics);

  if (localKeyProblem) {
    console.error(`Classification: ${localKeyProblem}`);
    process.exit(1);
  }

  await writeDiagnosticsGitignore();

  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15000,
    validateStatus: () => true,
    headers: {
      'x-apisports-key': apiKey
    }
  });

  let smokeResult;

  try {
    smokeResult = await runSmokeTest(client);
  } catch (error) {
    console.error('Provider reachable: false');
    console.error('Endpoint failed: auth smoke test');

    if (DEBUG) {
      console.error(error);
    } else {
      console.error('Run with DEBUG=true for the full error.');
    }

    process.exit(1);
  }

  if (smokeResult.failed) {
    console.log('Auth smoke test: failed');
    printEndpointFailure(smokeResult);
    process.exit(1);
  }

  const results = [];

  for (const endpoint of endpoints) {
    try {
      results.push(await callEndpoint(client, endpoint));
    } catch (error) {
      console.error('Provider reachable: false');
      console.error(`Endpoint failed: ${endpoint.path}`);

      if (DEBUG) {
        console.error(error);
      } else {
        console.error('Run with DEBUG=true for the full error.');
      }

      process.exit(1);
    }
  }

  printSummary(results, smokeResult);

  if (results.some((result) => result.failed)) {
    process.exit(1);
  }
}

main();
