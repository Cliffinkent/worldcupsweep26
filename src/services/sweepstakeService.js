const sweepstakeTeams = require('../data/sweepstakeTeams');
const knockoutSlots = require('../data/knockoutSlots');
const { getBroadcastForFixture } = require('../data/broadcasts');
const {
  getWorldCupFixtures,
  getWorldCupStandings,
  getWorldCupRounds,
  getLiveWorldCupFixtures,
  refreshWorldCupData,
  getProviderStatus
} = require('./footballApiClient');
const {
  calculateGroupTablesWithDiagnostics,
  buildTeamLookup,
  findTeamByName
} = require('./tableCalculator');

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

function buildParticipantSummaries(groupTables, fixtures, liveFixtures) {
  const tableStats = new Map();
  const eliminatedTeamIds = getEliminatedTeamIds(fixtures);
  const liveTeamIds = getLiveTeamIdsPlayingToday([
    ...fixtures.filter((fixture) => fixture.status === 'live'),
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

  return {
    generatedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    providerStatus,
    groupTableSource,
    teams: sweepstakeTeams,
    groups,
    groupTables,
    fixtures: groupFixturesByDate(fixtures),
    bracket: attachFixturesToBracket(fixtures, rounds),
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

async function getBracketData() {
  const [rawFixtures, rounds] = await Promise.all([
    getWorldCupFixtures(),
    getWorldCupRounds()
  ]);
  const fixtures = attachBroadcasts(rawFixtures);

  return {
    generatedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    providerStatus: getProviderStatus(),
    bracket: attachFixturesToBracket(fixtures, rounds)
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

  console.log('world-cup refresh', {
    fixtureCount: fixtures.length,
    groupsCountAL,
    roundsAvailable: providerStatus.roundsAvailable || [],
    unmatchedTeams: providerStatus.unmatchedTeams || []
  });

  return {
    refreshedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    providerStatus,
    groupTableSource,
    fixtureCount: fixtures.length,
    fixtures: groupFixturesByDate(fixtures),
    groupTables,
    bracket: attachFixturesToBracket(fixtures, rounds),
    players: buildParticipantSummaries(groupTables, fixtures, liveFixtures)
  };
}

module.exports = {
  getSweepstakeData,
  getGroupsData,
  getFixturesData,
  getBracketData,
  getTableSourceDebug,
  refreshData,
  getProviderStatus,
  buildParticipantSummaries
};
