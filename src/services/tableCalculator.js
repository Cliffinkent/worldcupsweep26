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

function compareRows(a, b) {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    a.country.localeCompare(b.country)
  );
}

function isKnockoutFixture(fixture) {
  return [
    'Round of 32',
    'Round of 16',
    'Quarter-finals',
    'Semi-finals',
    'Third-place play-off',
    'Final'
  ].includes(fixture.round);
}

function calculateGroupTables(teams, fixtures) {
  const lookup = buildTeamLookup(teams);
  const tables = new Map();

  teams.forEach((team) => {
    if (!tables.has(team.group)) {
      tables.set(team.group, new Map());
    }

    tables.get(team.group).set(team.id, createEmptyRow(team));
  });

  fixtures
    .filter((fixture) => fixture.status === 'finished' && !isKnockoutFixture(fixture))
    .forEach((fixture) => {
      const homeTeam = findTeamByName(lookup, fixture.homeTeam);
      const awayTeam = findTeamByName(lookup, fixture.awayTeam);

      if (!homeTeam || !awayTeam || homeTeam.group !== awayTeam.group) {
        return;
      }

      if (fixture.group && fixture.group !== homeTeam.group) {
        return;
      }

      if (!Number.isFinite(fixture.homeScore) || !Number.isFinite(fixture.awayScore)) {
        return;
      }

      applyResult(tables.get(homeTeam.group), homeTeam, awayTeam, fixture.homeScore, fixture.awayScore);
    });

  return Array.from(tables.entries())
    .sort(([groupA], [groupB]) => groupA.localeCompare(groupB))
    .map(([group, rows]) => ({
      group,
      table: Array.from(rows.values()).sort(compareRows)
    }));
}

module.exports = {
  calculateGroupTables,
  buildTeamLookup,
  findTeamByName
};
