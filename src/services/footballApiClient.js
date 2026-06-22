const cacheService = require('./cacheService');
const sweepstakeTeams = require('../data/sweepstakeTeams');
const {
  buildTeamLookup,
  findTeamByName
} = require('./tableCalculator');

const API_BASE_URL = 'https://v3.football.api-sports.io';
const LEAGUE_ID = '1';
const SEASON = '2026';
const CACHE_TTL_MS = 60 * 1000;
const LIVE_STATUS_QUERY = '1H-HT-2H-ET-P-BT-LIVE-SUSP-INT';

const CACHE_KEYS = {
  fixtures: 'api-football:world-cup-2026:fixtures',
  standings: 'api-football:world-cup-2026:standings',
  rounds: 'api-football:world-cup-2026:rounds',
  liveFixtures: 'api-football:world-cup-2026:live-fixtures'
};

const STATUS_MAP = {
  NS: 'scheduled',
  TBD: 'scheduled',
  '1H': 'live',
  HT: 'live',
  '2H': 'live',
  ET: 'live',
  BT: 'live',
  P: 'live',
  LIVE: 'live',
  SUSP: 'live',
  INT: 'live',
  FT: 'finished',
  AET: 'finished',
  PEN: 'finished',
  PST: 'unavailable',
  CANC: 'unavailable',
  ABD: 'unavailable',
  AWD: 'unavailable',
  WO: 'unavailable'
};
const STATUS_DETAIL_LABELS = {
  NS: 'Scheduled',
  TBD: 'Scheduled',
  '1H': 'Live',
  HT: 'Half-time',
  '2H': 'Live',
  ET: 'Live',
  BT: 'Break',
  P: 'Penalties',
  LIVE: 'Live',
  SUSP: 'Suspended',
  INT: 'Interrupted',
  FT: 'Finished',
  AET: 'Finished',
  PEN: 'Finished',
  PST: 'Postponed',
  CANC: 'Cancelled',
  ABD: 'Abandoned',
  AWD: 'Awarded',
  WO: 'Walkover'
};
const LIVE_SECTION_RAW_STATUSES = new Set([
  '1H',
  'HT',
  '2H',
  'ET',
  'BT',
  'P',
  'LIVE',
  'SUSP',
  'INT'
]);
const DISPLAY_GROUPS = new Set('ABCDEFGHIJKL'.split(''));
const NORMALISED_KNOCKOUT_ROUNDS = new Set([
  'Round of 32',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  'Third-place play-off',
  'Final'
]);

const state = {
  provider: 'api-football',
  providerStatus: process.env.API_FOOTBALL_KEY ? 'ready' : 'missing_api_key',
  message: process.env.API_FOOTBALL_KEY ? null : 'API-Football key is not configured',
  lastSuccessfulRefresh: null,
  lastAttemptedRefresh: null,
  cachedFixturesCount: 0,
  cachedStandingsGroupsCount: 0,
  unmatchedTeams: [],
  unknownRoundStrings: [],
  roundsAvailable: [],
  lastRateLimit: {},
  providerErrorCount: 0
};

const lastSuccessfulData = {
  fixtures: [],
  standings: [],
  rounds: [],
  liveFixtures: []
};

const teamLookup = buildTeamLookup(sweepstakeTeams);
const unmatchedTeamNames = new Set();

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function getApiKey() {
  return stripWrappingQuotes(String(process.env.API_FOOTBALL_KEY || '').trim());
}

function hasApiKey() {
  return Boolean(getApiKey());
}

function setMissingApiKeyStatus() {
  state.providerStatus = 'missing_api_key';
  state.message = 'API-Football key is not configured';
}

function setOkStatus() {
  state.providerStatus = 'ok';
  state.message = null;
}

function setProviderErrorStatus() {
  state.providerStatus = 'provider_error';
  state.message = 'Live football data is temporarily unavailable';
}

function getProviderStatus() {
  return {
    provider: state.provider,
    hasApiKey: hasApiKey(),
    lastSuccessfulRefresh: state.lastSuccessfulRefresh,
    lastAttemptedRefresh: state.lastAttemptedRefresh,
    cachedFixturesCount: state.cachedFixturesCount,
    cachedStandingsGroupsCount: state.cachedStandingsGroupsCount,
    unmatchedTeams: state.unmatchedTeams,
    unknownRoundStrings: state.unknownRoundStrings,
    roundsAvailable: state.roundsAvailable,
    providerStatus: hasApiKey() ? state.providerStatus : 'missing_api_key',
    message: hasApiKey() ? state.message : 'API-Football key is not configured'
  };
}

function logProviderStatus(extra = {}) {
  console.log('api-football status', {
    providerStatus: getProviderStatus().providerStatus,
    fixtureCount: state.cachedFixturesCount,
    groupsCountAL: state.cachedStandingsGroupsCount,
    roundsAvailable: state.roundsAvailable,
    unmatchedTeams: state.unmatchedTeams,
    rateLimit: state.lastRateLimit,
    ...extra
  });
}

function captureRateLimitHeaders(headers) {
  const rateLimit = {};

  headers.forEach((value, key) => {
    const lowered = key.toLowerCase();

    if (lowered.includes('rate') && lowered.includes('remaining')) {
      rateLimit[key] = value;
    }
  });

  state.lastRateLimit = rateLimit;
}

function getGroupLetter(value) {
  const match = String(value || '').match(/\bGroup\s+([A-L])\b/i);
  return match ? match[1].toUpperCase() : null;
}

function normaliseStatus(rawStatus) {
  const rawCode = normaliseRawStatus(rawStatus);
  return STATUS_MAP[rawCode] || 'unknown';
}

function inferRawStatusFromLongStatus(value) {
  const longStatus = String(value || '').trim().toLowerCase();

  if (!longStatus) {
    return null;
  }

  if (longStatus.includes('time to be defined')) {
    return 'TBD';
  }

  if (longStatus.includes('not started')) {
    return 'NS';
  }

  if (longStatus.includes('first half')) {
    return '1H';
  }

  if (longStatus.includes('halftime') || longStatus.includes('half-time')) {
    return 'HT';
  }

  if (longStatus.includes('second half')) {
    return '2H';
  }

  if (longStatus.includes('extra time')) {
    return 'ET';
  }

  if (longStatus.includes('break time')) {
    return 'BT';
  }

  if (longStatus.includes('penalty in progress')) {
    return 'P';
  }

  if (longStatus.includes('in progress')) {
    return 'LIVE';
  }

  if (longStatus.includes('suspend')) {
    return 'SUSP';
  }

  if (longStatus.includes('interrupt')) {
    return 'INT';
  }

  if (longStatus.includes('finished after penalty')) {
    return 'PEN';
  }

  if (longStatus.includes('finished after extra')) {
    return 'AET';
  }

  if (longStatus.includes('finished')) {
    return 'FT';
  }

  if (longStatus.includes('postpon')) {
    return 'PST';
  }

  if (longStatus.includes('cancel')) {
    return 'CANC';
  }

  if (longStatus.includes('abandon')) {
    return 'ABD';
  }

  if (longStatus.includes('technical loss')) {
    return 'AWD';
  }

  if (longStatus.includes('walkover') || longStatus.includes('walk over')) {
    return 'WO';
  }

  return null;
}

function normaliseRawStatus(rawStatus) {
  const rawCode = String(rawStatus?.short || '').trim().toUpperCase();

  if (rawCode) {
    return rawCode;
  }

  const inferredCode = inferRawStatusFromLongStatus(rawStatus?.long);

  if (inferredCode) {
    return inferredCode;
  }

  return rawStatus?.long ? String(rawStatus.long).trim().toUpperCase() : null;
}

function stripMatchPrefix(value) {
  return String(value || '').replace(/^match\s+/i, '').trim();
}

function hasSpecificSuspensionDetail(value) {
  return /\b(due to|weather|lightning|storm|rain|pitch|security|crowd|medical)\b/i.test(value);
}

function normaliseStatusDetail(rawCode, rawStatus, status) {
  const providerLong = String(rawStatus?.long || '').trim();
  const defaultDetail = STATUS_DETAIL_LABELS[rawCode] || (
    status === 'scheduled' ? 'Scheduled' :
      status === 'finished' ? 'Finished' :
        status === 'live' ? 'Live' :
          status === 'unavailable' ? 'Unavailable' :
            'Unknown'
  );

  if ((rawCode === 'SUSP' || rawCode === 'INT') && providerLong) {
    const detail = stripMatchPrefix(providerLong);

    if (detail && hasSpecificSuspensionDetail(detail)) {
      return detail;
    }
  }

  return defaultDetail;
}

function isLiveSectionEligible(status, rawStatus) {
  return status === 'live' || LIVE_SECTION_RAW_STATUSES.has(rawStatus);
}

function normaliseRound(round) {
  if (!round) {
    return null;
  }

  const lowered = String(round).toLowerCase();
  const group = getGroupLetter(round);

  if (group) {
    return `Group ${group}`;
  }

  if (lowered.includes('round of 32')) {
    return 'Round of 32';
  }

  if (lowered.includes('round of 16')) {
    return 'Round of 16';
  }

  if (lowered.includes('quarter')) {
    return 'Quarter-finals';
  }

  if (lowered.includes('semi')) {
    return 'Semi-finals';
  }

  if (lowered.includes('3rd') || lowered.includes('third')) {
    return 'Third-place play-off';
  }

  if (lowered.includes('final')) {
    return 'Final';
  }

  return round;
}

function collectUnknownRoundStrings(fixtures) {
  const unknownRounds = new Set();

  fixtures.forEach((fixture) => {
    const rawRound = fixture.rawRound || fixture.round;

    if (!rawRound || fixture.group || NORMALISED_KNOCKOUT_ROUNDS.has(fixture.round)) {
      return;
    }

    unknownRounds.add(rawRound);
  });

  state.unknownRoundStrings = Array.from(unknownRounds).sort();
  return state.unknownRoundStrings;
}

function normaliseTeamName(team) {
  return team?.name || null;
}

function findLocalTeam(apiName) {
  const localTeam = findTeamByName(teamLookup, apiName);

  if (!localTeam && apiName) {
    unmatchedTeamNames.add(apiName);
    state.unmatchedTeams = Array.from(unmatchedTeamNames).sort();
  }

  return localTeam;
}

function normaliseScore(value) {
  return Number.isFinite(value) ? value : null;
}

function normaliseWinner(rawFixture, status, homeTeam, awayTeam, homeScore, awayScore) {
  if (rawFixture?.teams?.home?.winner === true) {
    return homeTeam;
  }

  if (rawFixture?.teams?.away?.winner === true) {
    return awayTeam;
  }

  if (status === 'finished' && Number.isFinite(homeScore) && Number.isFinite(awayScore)) {
    if (homeScore > awayScore) {
      return homeTeam;
    }

    if (awayScore > homeScore) {
      return awayTeam;
    }
  }

  return null;
}

function normaliseFixture(rawFixture) {
  const rawProviderStatus = rawFixture?.fixture?.status || {};
  const rawStatus = normaliseRawStatus(rawProviderStatus);
  const status = normaliseStatus(rawProviderStatus);
  const homeTeam = normaliseTeamName(rawFixture?.teams?.home);
  const awayTeam = normaliseTeamName(rawFixture?.teams?.away);
  const localHomeTeam = findLocalTeam(homeTeam);
  const localAwayTeam = findLocalTeam(awayTeam);
  const homeScore = normaliseScore(rawFixture?.goals?.home);
  const awayScore = normaliseScore(rawFixture?.goals?.away);
  const utcDate = rawFixture?.fixture?.date || null;
  const localDate = utcDate ? new Date(utcDate).toISOString() : null;
  const date = utcDate ? utcDate.slice(0, 10) : null;
  const rawRound = rawFixture?.league?.round || null;
  const round = normaliseRound(rawRound);
  const explicitGroup = getGroupLetter(rawRound);
  const inferredGroup = localHomeTeam?.group === localAwayTeam?.group ? localHomeTeam?.group : null;

  return {
    id: rawFixture?.fixture?.id ? String(rawFixture.fixture.id) : null,
    date,
    utcDate,
    localDate,
    status,
    statusLabel: rawProviderStatus.long || rawStatus || status,
    statusDetail: normaliseStatusDetail(rawStatus, rawProviderStatus, status),
    round,
    rawRound,
    group: explicitGroup || inferredGroup || null,
    venue: rawFixture?.fixture?.venue?.name || null,
    city: rawFixture?.fixture?.venue?.city || null,
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    winner: normaliseWinner(rawFixture, status, homeTeam, awayTeam, homeScore, awayScore),
    elapsed: Number.isFinite(rawProviderStatus.elapsed) ? rawProviderStatus.elapsed : null,
    rawStatus,
    isLiveSectionEligible: isLiveSectionEligible(status, rawStatus)
  };
}

function normaliseStanding(rawStanding) {
  const apiTeamName = rawStanding?.team?.name || null;
  const localTeam = findLocalTeam(apiTeamName);
  const goalsFor = Number(rawStanding?.all?.goals?.for || 0);
  const goalsAgainst = Number(rawStanding?.all?.goals?.against || 0);
  const group = getGroupLetter(rawStanding?.group) || localTeam?.group || null;
  const wins = Number(rawStanding?.all?.win || 0);
  const draws = Number(rawStanding?.all?.draw || 0);
  const losses = Number(rawStanding?.all?.lose || 0);

  return {
    group,
    rank: Number(rawStanding?.rank || 0),
    team: localTeam?.country || apiTeamName,
    teamId: localTeam?.id || null,
    country: localTeam?.country || apiTeamName,
    played: Number(rawStanding?.all?.played || 0),
    wins,
    won: wins,
    draws,
    drawn: draws,
    losses,
    lost: losses,
    goalsFor,
    goalsAgainst,
    goalDifference: Number.isFinite(rawStanding?.goalsDiff)
      ? rawStanding.goalsDiff
      : goalsFor - goalsAgainst,
    points: Number(rawStanding?.points || 0),
    owner: localTeam?.owner || null,
    flag: localTeam?.flag || null
  };
}

function flattenStandings(payload) {
  return (payload.response || [])
    .flatMap((leagueEntry) => leagueEntry?.league?.standings || [])
    .filter((standingsGroup) => {
      const providerGroup = standingsGroup?.[0]?.group || null;
      return DISPLAY_GROUPS.has(getGroupLetter(providerGroup));
    })
    .flatMap((group) => group || [])
    .map(normaliseStanding)
    .filter((standing) => standing.team && DISPLAY_GROUPS.has(standing.group));
}

function countStandingGroups(standings) {
  return new Set(
    standings
      .map((standing) => standing.group)
      .filter((group) => DISPLAY_GROUPS.has(group))
  ).size;
}

function buildUrl(path, params = {}) {
  const url = new URL(path, API_BASE_URL);
  url.searchParams.set('league', LEAGUE_ID);
  url.searchParams.set('season', SEASON);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url;
}

async function fetchFromProvider(path, params = {}) {
  if (!hasApiKey()) {
    setMissingApiKeyStatus();
    logProviderStatus();
    return null;
  }

  state.lastAttemptedRefresh = new Date().toISOString();

  const response = await fetch(buildUrl(path, params), {
    headers: {
      'x-apisports-key': getApiKey()
    }
  });

  captureRateLimitHeaders(response.headers);

  if (!response.ok) {
    throw new Error('Provider request failed');
  }

  const payload = await response.json();

  if (payload?.errors && Object.keys(payload.errors).length > 0) {
    throw new Error('Provider returned an error payload');
  }

  return payload;
}

async function getResource(resourceName, fetcher, options = {}) {
  const { forceRefresh = false } = options;
  const cacheKey = CACHE_KEYS[resourceName];

  if (!forceRefresh) {
    const cached = cacheService.get(cacheKey);

    if (cached) {
      return cached;
    }
  }

  if (!hasApiKey()) {
    setMissingApiKeyStatus();
    logProviderStatus();
    return [];
  }

  try {
    const data = await fetcher();

    cacheService.set(cacheKey, data, CACHE_TTL_MS);
    lastSuccessfulData[resourceName] = data;
    state.lastSuccessfulRefresh = new Date().toISOString();
    setOkStatus();

    if (resourceName === 'fixtures') {
      state.cachedFixturesCount = data.length;
      const unknownRoundStrings = collectUnknownRoundStrings(data);

      if (forceRefresh && unknownRoundStrings.length) {
        console.warn('api-football unknown fixture rounds', {
          unknownRoundStrings
        });
      }
    }

    if (resourceName === 'standings') {
      state.cachedStandingsGroupsCount = countStandingGroups(data);
    }

    if (resourceName === 'rounds') {
      state.roundsAvailable = data;
    }

    logProviderStatus({ refreshedResource: resourceName });
    return data;
  } catch (error) {
    state.providerErrorCount += 1;
    setProviderErrorStatus();
    logProviderStatus({ failedResource: resourceName });
    return lastSuccessfulData[resourceName] || [];
  }
}

async function getWorldCupFixtures(options = {}) {
  return getResource('fixtures', async () => {
    const payload = await fetchFromProvider('/fixtures');

    if (!payload || !Array.isArray(payload.response)) {
      return [];
    }

    return payload.response.map(normaliseFixture).filter((fixture) => fixture.id);
  }, options);
}

async function getWorldCupStandings(options = {}) {
  return getResource('standings', async () => {
    const payload = await fetchFromProvider('/standings');

    if (!payload || !Array.isArray(payload.response)) {
      return [];
    }

    return flattenStandings(payload);
  }, options);
}

async function getWorldCupRounds(options = {}) {
  return getResource('rounds', async () => {
    const payload = await fetchFromProvider('/fixtures/rounds');

    if (!payload || !Array.isArray(payload.response)) {
      return [];
    }

    return payload.response.map((round) => normaliseRound(round)).filter(Boolean);
  }, options);
}

async function getLiveWorldCupFixtures(options = {}) {
  return getResource('liveFixtures', async () => {
    let payload;

    try {
      payload = await fetchFromProvider('/fixtures', {
        status: LIVE_STATUS_QUERY
      });
    } catch (error) {
      console.warn('api-football live fixture status query failed; falling back to full fixtures');
      payload = await fetchFromProvider('/fixtures');
    }

    if (!payload || !Array.isArray(payload.response)) {
      return [];
    }

    return payload.response
      .map(normaliseFixture)
      .filter((fixture) => fixture.id && fixture.isLiveSectionEligible);
  }, options);
}

async function refreshWorldCupData() {
  const providerErrorCountBeforeRefresh = state.providerErrorCount;
  const [fixtures, standings, rounds, liveFixtures] = await Promise.all([
    getWorldCupFixtures({ forceRefresh: true }),
    getWorldCupStandings({ forceRefresh: true }),
    getWorldCupRounds({ forceRefresh: true }),
    getLiveWorldCupFixtures({ forceRefresh: true })
  ]);

  if (state.providerErrorCount > providerErrorCountBeforeRefresh) {
    setProviderErrorStatus();
  }

  return {
    fixtures,
    standings,
    rounds,
    liveFixtures,
    providerStatus: getProviderStatus()
  };
}

module.exports = {
  getWorldCupFixtures,
  getWorldCupStandings,
  getWorldCupRounds,
  getLiveWorldCupFixtures,
  refreshWorldCupData,
  normaliseFixture,
  normaliseStanding,
  isLiveSectionEligible,
  getProviderStatus
};
