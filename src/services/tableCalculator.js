function createEmptyRow(team) {
  return {
    teamId: team.id,
    group: team.group,
    owner: team.owner,
    country: team.country,
    flag: team.flag,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0
  };
}

const { rankGroupRows } = require('./fifaTieBreakerService');

const DISPLAY_GROUPS = new Set('ABCDEFGHIJKL'.split(''));
const KNOCKOUT_ROUNDS = new Set([
  'Round of 32',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  'Third-place play-off',
  'Final'
]);

function normaliseName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildTeamLookup(teams) {
  const lookup = new Map();

  teams.forEach((team) => {
    [team.country, team.fifaName, ...team.aliases].forEach((name) => {
      lookup.set(normaliseName(name), team);
    });
  });

  return lookup;
}

function findTeamByName(lookup, name) {
  return lookup.get(normaliseName(name)) || null;
}

function applyResult(tableRows, homeTeam, awayTeam, homeScore, awayScore) {
  const homeRow = tableRows.get(homeTeam.id);
  const awayRow = tableRows.get(awayTeam.id);

  if (!homeRow || !awayRow) {
    return;
  }

  homeRow.played += 1;
  awayRow.played += 1;
  homeRow.goalsFor += homeScore;
  homeRow.goalsAgainst += awayScore;
  awayRow.goalsFor += awayScore;
  awayRow.goalsAgainst += homeScore;
  homeRow.goalDifference = homeRow.goalsFor - homeRow.goalsAgainst;
  awayRow.goalDifference = awayRow.goalsFor - awayRow.goalsAgainst;

  if (homeScore > awayScore) {
    homeRow.won += 1;
    homeRow.points += 3;
    awayRow.lost += 1;
    return;
  }

  if (awayScore > homeScore) {
    awayRow.won += 1;
    awayRow.points += 3;
    homeRow.lost += 1;
    return;
  }

  homeRow.drawn += 1;
  awayRow.drawn += 1;
  homeRow.points += 1;
  awayRow.points += 1;
}

function isDisplayGroup(group) {
  return DISPLAY_GROUPS.has(group);
}

function getFixtureGroup(fixture, homeTeam, awayTeam) {
  if (KNOCKOUT_ROUNDS.has(fixture.round)) {
    return null;
  }

  if (isDisplayGroup(fixture.group)) {
    return fixture.group;
  }

  if (homeTeam?.group && homeTeam.group === awayTeam?.group && isDisplayGroup(homeTeam.group)) {
    return homeTeam.group;
  }

  const match = String(fixture.round || '').match(/\bGroup\s+([A-L])\b/i);
  return match ? match[1].toUpperCase() : null;
}

function isFinishedFixture(fixture) {
  return fixture.status === 'finished';
}

function hasUsableScore(fixture) {
  return Number.isFinite(fixture.homeScore) && Number.isFinite(fixture.awayScore);
}

function createFixtureDiagnostic(fixture, extra = {}) {
  return {
    id: fixture.id || null,
    round: fixture.round || null,
    ...extra
  };
}

function calculateGroupTablesWithDiagnostics(teams, fixtures) {
  const lookup = buildTeamLookup(teams);
  const tables = new Map();
  const countedFixtures = [];
  const ignoredFinishedFixtures = [];

  teams.forEach((team) => {
    if (!tables.has(team.group)) {
      tables.set(team.group, new Map());
    }

    tables.get(team.group).set(team.id, createEmptyRow(team));
  });

  fixtures
    .filter(isFinishedFixture)
    .forEach((fixture) => {
      const homeTeam = findTeamByName(lookup, fixture.homeTeam);
      const awayTeam = findTeamByName(lookup, fixture.awayTeam);
      const fixtureGroup = getFixtureGroup(fixture, homeTeam, awayTeam);

      if (!isDisplayGroup(fixtureGroup)) {
        ignoredFinishedFixtures.push(createFixtureDiagnostic(fixture, {
          reason: 'not_group_stage_fixture'
        }));
        return;
      }

      if (!homeTeam || !awayTeam) {
        ignoredFinishedFixtures.push(createFixtureDiagnostic(fixture, {
          group: fixtureGroup,
          reason: 'unmatched_team'
        }));
        return;
      }

      if (homeTeam.group !== fixtureGroup || awayTeam.group !== fixtureGroup) {
        ignoredFinishedFixtures.push(createFixtureDiagnostic(fixture, {
          group: fixtureGroup,
          reason: 'team_group_mismatch'
        }));
        return;
      }

      if (!hasUsableScore(fixture)) {
        ignoredFinishedFixtures.push(createFixtureDiagnostic(fixture, {
          group: fixtureGroup,
          reason: 'missing_numeric_score'
        }));
        return;
      }

      applyResult(tables.get(fixtureGroup), homeTeam, awayTeam, fixture.homeScore, fixture.awayScore);
      countedFixtures.push(createFixtureDiagnostic(fixture, {
        group: fixtureGroup,
        homeTeam: fixture.homeTeam || null,
        homeTeamId: homeTeam.id,
        awayTeam: fixture.awayTeam || null,
        awayTeamId: awayTeam.id,
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
        status: fixture.status
      }));
    });

  const groupTables = Array.from(tables.entries())
    .sort(([groupA], [groupB]) => groupA.localeCompare(groupB))
    .map(([group, rows]) => {
      const groupFixtures = countedFixtures.filter((fixture) => fixture.group === group);
      const ranking = rankGroupRows(Array.from(rows.values()), groupFixtures);

      return {
        group,
        table: ranking.rows,
        rankingWarnings: ranking.warnings,
        unresolvedTies: ranking.unresolvedTies
      };
    });

  return {
    groupTables,
    diagnostics: {
      finishedGroupFixturesCount: countedFixtures.length,
      countedFixtures,
      ignoredFinishedFixtures
    }
  };
}

function calculateGroupTables(teams, fixtures) {
  return calculateGroupTablesWithDiagnostics(teams, fixtures).groupTables;
}

module.exports = {
  calculateGroupTables,
  calculateGroupTablesWithDiagnostics,
  buildTeamLookup,
  findTeamByName
};
