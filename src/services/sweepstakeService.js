const sweepstakeTeams = require('../data/sweepstakeTeams');
const knockoutSlots = require('../data/knockoutSlots');
const { getBroadcastForFixture } = require('../data/broadcasts');
const {
  getWorldCupFixtures,
  getWorldCupStandings,
  getWorldCupRounds,
  getLiveWorldCupFixtures,
  refreshWorldCupData,
  getProviderStatus,
  isLiveSectionEligible
} = require('./footballApiClient');
const {
  calculateGroupTablesWithDiagnostics,
  buildTeamLookup,
  findTeamByName
} = require('./tableCalculator');
const { buildBracketProjection } = require('./bracketProjectionService');
const { buildQualificationProjection } = require('./qualificationService');
const {
  buildThirdPlaceWatch,
  buildThirdPlaceWatchDebug
} = require('./thirdPlaceWatchService');
const {
  buildEliminationData,
  buildEliminationsDebug
} = require('./eliminationService');
const { calculateMathematicalEliminations } = require('./mathematicalEliminationService');

const KNOCKOUT_ROUNDS = new Set([
  'Round of 32',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  'Third-place play-off',
  'Final'
]);

function groupTeams() {
  return Object.values(sweepstakeTeams.reduce((groups, team) => {
    groups[team.group] = groups[team.group] || {
      group: team.group,
      teams: []
    };
    groups[team.group].teams.push(team);
    return groups;
  }, {})).sort((a, b) => a.group.localeCompare(b.group));
}

function groupFixturesByDate(fixtures) {
  const grouped = fixtures.reduce((dates, fixture) => {
    const key = fixture.date || 'unscheduled';
    dates[key] = dates[key] || [];
    dates[key].push(fixture);
    return dates;
  }, {});

  return Object.entries(grouped)
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, matches]) => ({
      date,
      matches: matches.sort((a, b) => String(a.utcDate || '').localeCompare(String(b.utcDate || '')))
    }));
}

function attachBroadcasts(fixtures) {
  return fixtures.map((fixture) => ({
    ...fixture,
    broadcast: getBroadcastForFixture(fixture)
  }));
}

function getFixtureRound(fixture) {
  return fixture.round || null;
}

function attachFixturesToBracket(fixtures, rounds = []) {
  const byRound = fixtures.reduce((rounds, fixture) => {
    const fixtureRound = getFixtureRound(fixture);

    if (!KNOCKOUT_ROUNDS.has(fixtureRound)) {
      return rounds;
    }

    rounds[fixtureRound] = rounds[fixtureRound] || [];
    rounds[fixtureRound].push(fixture);
    return rounds;
  }, {});

  return knockoutSlots.map((round) => ({
    round: round.round,
    providerRoundAvailable: rounds.includes(round.round),
    matches: round.slots.map((slot, index) => {
      const fixture = byRound[round.round]?.[index] || null;

      return {
        ...slot,
        fixture,
        homeTeam: fixture?.homeTeam || null,
        awayTeam: fixture?.awayTeam || null,
        status: fixture?.status || 'scheduled',
        winner: fixture?.winner || null
      };
    })
  }));
}

function createEmptyStandingRow(team) {
  return {
    group: team.group,
    rank: 0,
    team: team.country,
    teamId: team.id,
    country: team.country,
    played: 0,
    wins: 0,
    won: 0,
    draws: 0,
    drawn: 0,
    losses: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    owner: team.owner,
    flag: team.flag
  };
}

function buildApiGroupTables(standings) {
  if (!standings.length) {
    return [];
  }

  const standingsByTeamId = new Map(
    standings
      .filter((standing) => standing.teamId)
      .map((standing) => [standing.teamId, standing])
  );

  const groups = new Map();

  sweepstakeTeams.forEach((team) => {
    const apiStanding = standingsByTeamId.get(team.id);
    const row = apiStanding ? {
      ...createEmptyStandingRow(team),
      ...apiStanding,
      group: apiStanding.group || team.group,
      team: team.country,
      teamId: team.id,
      country: team.country,
      owner: team.owner,
      flag: team.flag
    } : createEmptyStandingRow(team);

    if (!groups.has(team.group)) {
      groups.set(team.group, []);
    }

    groups.get(team.group).push(row);
  });

  return Array.from(groups.entries())
    .sort(([groupA], [groupB]) => groupA.localeCompare(groupB))
    .map(([group, rows]) => ({
      group,
      table: rows.sort((a, b) => (
        (a.rank || 99) - (b.rank || 99) ||
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        a.country.localeCompare(b.country)
      ))
    }));
}

function hasCompleteProviderGroupTables(groupTables) {
  if (groupTables.length !== 12) {
    return false;
  }

  return groupTables.every((group) => (
    /^[A-L]$/.test(group.group) &&
    group.table.length === 4 &&
    group.table.every((row) => row.teamId && row.owner && row.flag)
  ));
}

function resolveGroupTables(fixtures, standings) {
  const calculated = calculateGroupTablesWithDiagnostics(sweepstakeTeams, fixtures);
  const apiGroupTables = buildApiGroupTables(standings);

  if (calculated.diagnostics.finishedGroupFixturesCount > 0) {
    return {
      groupTables: calculated.groupTables,
      groupTableSource: 'calculated_fixtures',
      tableDiagnostics: calculated.diagnostics,
      comparisonGroupTables: hasCompleteProviderGroupTables(apiGroupTables) ? apiGroupTables : []
    };
  }

  if (hasCompleteProviderGroupTables(apiGroupTables)) {
    return {
      groupTables: apiGroupTables,
      groupTableSource: 'api_standings_fallback',
      tableDiagnostics: calculated.diagnostics,
      comparisonGroupTables: apiGroupTables
    };
  }

  return {
    groupTables: calculated.groupTables,
    groupTableSource: 'calculated_fixtures_empty',
    tableDiagnostics: calculated.diagnostics,
    comparisonGroupTables: []
  };
}

function getEliminatedTeamIds(fixtures) {
  const lookup = buildTeamLookup(sweepstakeTeams);
  const eliminated = new Set();

  fixtures
    .filter((fixture) => fixture.status === 'finished' && KNOCKOUT_ROUNDS.has(fixture.round) && fixture.winner)
    .forEach((fixture) => {
      const homeTeam = findTeamByName(lookup, fixture.homeTeam);
      const awayTeam = findTeamByName(lookup, fixture.awayTeam);
      const winningTeam = findTeamByName(lookup, fixture.winner);

      if (!homeTeam || !awayTeam || !winningTeam) {
        return;
      }

      if (homeTeam.id !== winningTeam.id) {
        eliminated.add(homeTeam.id);
      }

      if (awayTeam.id !== winningTeam.id) {
        eliminated.add(awayTeam.id);
      }
    });

  return eliminated;
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function fixtureIsLiveSectionEligible(fixture) {
  return fixture?.isLiveSectionEligible === true;
}

function getLiveTeamIdsPlayingToday(liveFixtures) {
  const lookup = buildTeamLookup(sweepstakeTeams);
  const today = getTodayDate();
  const liveTeamIds = new Set();

  liveFixtures
    .filter((fixture) => fixture.date === today)
    .forEach((fixture) => {
      const homeTeam = findTeamByName(lookup, fixture.homeTeam);
      const awayTeam = findTeamByName(lookup, fixture.awayTeam);

      if (homeTeam) {
        liveTeamIds.add(homeTeam.id);
      }

      if (awayTeam) {
        liveTeamIds.add(awayTeam.id);
      }
    });

  return liveTeamIds;
}

function hasFranceOrIraq(fixture) {
  return [fixture.homeTeam, fixture.awayTeam]
    .map((team) => String(team || '').toLowerCase())
    .some((team) => team === 'france' || team === 'iraq');
}

function compactDebugFixture(fixture) {
  return {
    id: fixture.id || null,
    homeTeam: fixture.homeTeam || null,
    awayTeam: fixture.awayTeam || null,
    homeScore: Number.isFinite(fixture.homeScore) ? fixture.homeScore : null,
    awayScore: Number.isFinite(fixture.awayScore) ? fixture.awayScore : null,
    status: fixture.status || 'unknown',
    statusLabel: fixture.statusLabel || null,
    statusDetail: fixture.statusDetail || null,
    rawStatus: fixture.rawStatus || null,
    elapsed: Number.isFinite(fixture.elapsed) ? fixture.elapsed : null,
    isLiveSectionEligible: fixtureIsLiveSectionEligible(fixture),
    date: fixture.date || null,
    utcDate: fixture.utcDate || null
  };
}

function mergeFixturesForDebug(fixtures, liveFixtures) {
  const byId = new Map();

  [...fixtures, ...liveFixtures].forEach((fixture) => {
    const key = fixture.id || `${fixture.utcDate || fixture.date}:${fixture.homeTeam}:${fixture.awayTeam}`;
    byId.set(key, fixture);
  });

  return Array.from(byId.values());
}

function buildLiveFixturesDebug(fixtures, liveFixtures) {
  const mergedFixtures = mergeFixturesForDebug(fixtures, liveFixtures);
  const liveFixtureIds = new Set(
    mergedFixtures
      .filter(fixtureIsLiveSectionEligible)
      .map((fixture) => fixture.id)
      .filter(Boolean)
  );
  const fixturesForDebug = mergedFixtures
    .filter((fixture) => fixtureIsLiveSectionEligible(fixture) || hasFranceOrIraq(fixture))
    .sort((a, b) => String(a.utcDate || '').localeCompare(String(b.utcDate || '')))
    .map(compactDebugFixture);
  const ignoredInProgressCandidates = mergedFixtures
    .filter((fixture) => isLiveSectionEligible(fixture.status, fixture.rawStatus) && !fixtureIsLiveSectionEligible(fixture))
    .map((fixture) => ({
      id: fixture.id || null,
      homeTeam: fixture.homeTeam || null,
      awayTeam: fixture.awayTeam || null,
      rawStatus: fixture.rawStatus || null,
      reason: 'not_live_section_eligible'
    }));

  return {
    generatedAt: new Date().toISOString(),
    liveFixtureCount: liveFixtureIds.size,
    fixtures: fixturesForDebug,
    ignoredInProgressCandidates
  };
}

function buildParticipantSummaries(groupTables, fixtures, liveFixtures) {
  const tableStats = new Map();
  const eliminatedTeamIds = getEliminatedTeamIds(fixtures);
  const liveTeamIds = getLiveTeamIdsPlayingToday([
    ...fixtures.filter(fixtureIsLiveSectionEligible),
    ...liveFixtures
  ]);

  groupTables.forEach((group) => {
    group.table.forEach((row) => {
      tableStats.set(row.teamId, {
        points: row.points || 0,
        goalDifference: row.goalDifference || 0
      });
    });
  });

  const owners = sweepstakeTeams.reduce((summary, team) => {
    summary[team.owner] = summary[team.owner] || {
      owner: team.owner,
      teams: [],
      assignedTeams: [],
      totalGroupPoints: 0,
      teamsStillAlive: 0,
      bestTeam: null,
      liveTeamsPlayingToday: 0
    };

    const teamSummary = {
      id: team.id,
      country: team.country,
      flag: team.flag,
      group: team.group,
      points: tableStats.get(team.id)?.points || 0,
      goalDifference: tableStats.get(team.id)?.goalDifference || 0
    };
    summary[team.owner].teams.push(teamSummary);
    summary[team.owner].assignedTeams.push(teamSummary);
    summary[team.owner].totalGroupPoints += teamSummary.points;

    if (!eliminatedTeamIds.has(team.id)) {
      summary[team.owner].teamsStillAlive += 1;
    }

    if (liveTeamIds.has(team.id)) {
      summary[team.owner].liveTeamsPlayingToday += 1;
    }

    if (
      !summary[team.owner].bestTeam ||
      teamSummary.points > summary[team.owner].bestTeam.points ||
      (
        teamSummary.points === summary[team.owner].bestTeam.points &&
        teamSummary.goalDifference > summary[team.owner].bestTeam.goalDifference
      ) ||
      (
        teamSummary.points === summary[team.owner].bestTeam.points &&
        teamSummary.goalDifference === summary[team.owner].bestTeam.goalDifference &&
        teamSummary.country.localeCompare(summary[team.owner].bestTeam.country) < 0
      )
    ) {
      summary[team.owner].bestTeam = teamSummary;
    }

    return summary;
  }, {});

  return Object.values(owners).sort((a, b) => (
    b.totalGroupPoints - a.totalGroupPoints ||
    b.teamsStillAlive - a.teamsStillAlive ||
    a.owner.localeCompare(b.owner)
  ));
}

async function getSweepstakeData() {
  const [rawFixtures, standings, rounds, rawLiveFixtures] = await Promise.all([
    getWorldCupFixtures(),
    getWorldCupStandings(),
    getWorldCupRounds(),
    getLiveWorldCupFixtures()
  ]);
  const fixtures = attachBroadcasts(rawFixtures);
  const liveFixtures = attachBroadcasts(rawLiveFixtures);
  const groups = groupTeams();
  const { groupTables, groupTableSource } = resolveGroupTables(fixtures, standings);
  const players = buildParticipantSummaries(groupTables, fixtures, liveFixtures);
  const providerStatus = getProviderStatus();
  const generatedAt = new Date().toISOString();
  const bracketProjection = buildBracketProjection({
    groupTables,
    fixtures,
    rounds,
    providerStatus,
    generatedAt
  });

  return {
    generatedAt,
    lastUpdated: generatedAt,
    providerStatus,
    groupTableSource,
    projectionStatus: bracketProjection.projectionStatus,
    thirdPlaceProjectionWarning: bracketProjection.thirdPlaceProjectionWarning,
    thirdPlaceGroupsProjectedToQualify: bracketProjection.thirdPlaceGroupsProjectedToQualify,
    annexCKey: bracketProjection.annexCKey,
    annexCMappingStatus: bracketProjection.annexCMappingStatus,
    teams: sweepstakeTeams,
    groups,
    groupTables,
    fixtures: groupFixturesByDate(fixtures),
    roundOf32: bracketProjection.roundOf32,
    laterRounds: bracketProjection.laterRounds,
    bracket: bracketProjection.bracket,
    players
  };
}

async function getGroupsData() {
  const [fixtures, standings] = await Promise.all([
    getWorldCupFixtures(),
    getWorldCupStandings()
  ]);
  const { groupTables, groupTableSource } = resolveGroupTables(fixtures, standings);

  return {
    generatedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    providerStatus: getProviderStatus(),
    groupTableSource,
    groups: groupTeams(),
    groupTables
  };
}

async function getTableSourceDebug() {
  const fixtures = await getWorldCupFixtures();
  const { diagnostics } = calculateGroupTablesWithDiagnostics(sweepstakeTeams, fixtures);

  return diagnostics;
}

async function getFixturesData() {
  const fixtures = attachBroadcasts(await getWorldCupFixtures());

  return {
    generatedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    providerStatus: getProviderStatus(),
    fixtures: groupFixturesByDate(fixtures)
  };
}

async function getLiveFixturesDebugData() {
  const [fixtures, liveFixtures] = await Promise.all([
    getWorldCupFixtures(),
    getLiveWorldCupFixtures()
  ]);

  return buildLiveFixturesDebug(fixtures, liveFixtures);
}

async function getBracketData() {
  const [rawFixtures, standings, rounds] = await Promise.all([
    getWorldCupFixtures(),
    getWorldCupStandings(),
    getWorldCupRounds()
  ]);
  const fixtures = attachBroadcasts(rawFixtures);
  const { groupTables, groupTableSource } = resolveGroupTables(fixtures, standings);
  const generatedAt = new Date().toISOString();
  const projection = buildBracketProjection({
    groupTables,
    fixtures,
    rounds,
    providerStatus: getProviderStatus(),
    generatedAt
  });

  return {
    ...projection,
    groupTableSource
  };
}

async function getThirdPlaceWatchData() {
  const [rawFixtures, standings] = await Promise.all([
    getWorldCupFixtures(),
    getWorldCupStandings()
  ]);
  const fixtures = attachBroadcasts(rawFixtures);
  const { groupTables } = resolveGroupTables(fixtures, standings);
  const generatedAt = new Date().toISOString();

  return buildThirdPlaceWatch({
    groupTables,
    providerStatus: getProviderStatus(),
    generatedAt
  });
}

async function getThirdPlaceWatchDebugData() {
  const [rawFixtures, standings, rounds] = await Promise.all([
    getWorldCupFixtures(),
    getWorldCupStandings(),
    getWorldCupRounds()
  ]);
  const fixtures = attachBroadcasts(rawFixtures);
  const { groupTables } = resolveGroupTables(fixtures, standings);
  const generatedAt = new Date().toISOString();
  const providerStatus = getProviderStatus();
  const qualification = buildQualificationProjection(groupTables);
  const bracketProjection = buildBracketProjection({
    groupTables,
    fixtures,
    rounds,
    providerStatus,
    generatedAt
  });
  const watch = buildThirdPlaceWatch({
    groupTables,
    providerStatus,
    generatedAt
  });

  return buildThirdPlaceWatchDebug({
    watch,
    qualification,
    bracketProjection,
    generatedAt
  });
}

async function getEliminationContext() {
  const [rawFixtures, standings, rounds] = await Promise.all([
    getWorldCupFixtures(),
    getWorldCupStandings(),
    getWorldCupRounds()
  ]);
  const fixtures = attachBroadcasts(rawFixtures);
  const { groupTables } = resolveGroupTables(fixtures, standings);
  const generatedAt = new Date().toISOString();
  const providerStatus = getProviderStatus();
  const bracketProjection = buildBracketProjection({
    groupTables,
    fixtures,
    rounds,
    providerStatus,
    generatedAt
  });

  return {
    groupTables,
    fixtures,
    bracketProjection,
    providerStatus,
    generatedAt
  };
}

async function getEliminatedTeamsData() {
  return buildEliminationData(await getEliminationContext());
}

async function getEliminationsDebugData() {
  return buildEliminationsDebug(await getEliminationContext());
}

async function getMathematicalEliminationsDebugData() {
  const context = await getEliminationContext();
  const mathematical = calculateMathematicalEliminations({
    groups: context.groupTables,
    fixtures: context.fixtures,
    teams: sweepstakeTeams
  });
  const eliminationData = buildEliminationData(context);
  const activeOrAtRiskCountries = new Set([
    ...eliminationData.activeTeams,
    ...(eliminationData.atRiskTeams || [])
  ].map((team) => team.country));
  const eliminatedTeamsRemovedFromActiveTeams = mathematical.eliminatedTeams.every((team) => (
    !activeOrAtRiskCountries.has(team.country)
  ));
  const checks = {
    ...mathematical.checks,
    eliminatedTeamsRemovedFromActiveTeams
  };
  const errors = [...(mathematical.errors || [])];

  if (!eliminatedTeamsRemovedFromActiveTeams) {
    errors.push('One or more mathematically eliminated teams still appears in activeTeams or atRiskTeams.');
  }

  Object.entries(checks).forEach(([name, passed]) => {
    if (!passed && name !== 'eliminatedTeamsRemovedFromActiveTeams') {
      errors.push(`Mathematical eliminations check failed: ${name}.`);
    }
  });

  return {
    ...mathematical,
    generatedAt: context.generatedAt,
    passed: errors.length === 0 && Object.values(checks).every(Boolean),
    errors,
    checks
  };
}

async function getQualificationDebugData() {
  const [rawFixtures, standings, rounds] = await Promise.all([
    getWorldCupFixtures(),
    getWorldCupStandings(),
    getWorldCupRounds()
  ]);
  const fixtures = attachBroadcasts(rawFixtures);
  const { groupTables, groupTableSource } = resolveGroupTables(fixtures, standings);
  const generatedAt = new Date().toISOString();
  const projection = buildBracketProjection({
    groupTables,
    fixtures,
    rounds,
    providerStatus: getProviderStatus(),
    generatedAt
  });

  return {
    generatedAt,
    lastUpdated: generatedAt,
    providerStatus: getProviderStatus(),
    groupTableSource,
    ...projection.qualificationDebug
  };
}

async function refreshData() {
  const {
    fixtures: rawFixtures,
    standings,
    rounds,
    liveFixtures: rawLiveFixtures,
    providerStatus
  } = await refreshWorldCupData();
  const fixtures = attachBroadcasts(rawFixtures);
  const liveFixtures = attachBroadcasts(rawLiveFixtures);
  const { groupTables, groupTableSource } = resolveGroupTables(fixtures, standings);
  const groupsCountAL = groupTables.filter((group) => /^[A-L]$/.test(group.group)).length;
  const generatedAt = new Date().toISOString();
  const bracketProjection = buildBracketProjection({
    groupTables,
    fixtures,
    rounds,
    providerStatus,
    generatedAt
  });

  console.log('world-cup refresh', {
    fixtureCount: fixtures.length,
    groupsCountAL,
    roundsAvailable: providerStatus.roundsAvailable || [],
    unmatchedTeams: providerStatus.unmatchedTeams || []
  });

  return {
    refreshedAt: generatedAt,
    lastUpdated: generatedAt,
    providerStatus,
    groupTableSource,
    projectionStatus: bracketProjection.projectionStatus,
    thirdPlaceProjectionWarning: bracketProjection.thirdPlaceProjectionWarning,
    thirdPlaceGroupsProjectedToQualify: bracketProjection.thirdPlaceGroupsProjectedToQualify,
    annexCKey: bracketProjection.annexCKey,
    annexCMappingStatus: bracketProjection.annexCMappingStatus,
    fixtureCount: fixtures.length,
    fixtures: groupFixturesByDate(fixtures),
    groupTables,
    roundOf32: bracketProjection.roundOf32,
    laterRounds: bracketProjection.laterRounds,
    bracket: bracketProjection.bracket,
    players: buildParticipantSummaries(groupTables, fixtures, liveFixtures)
  };
}

module.exports = {
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
  getProviderStatus,
  buildParticipantSummaries
};
