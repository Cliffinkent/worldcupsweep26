const UNRESOLVED_TIE_WARNING = 'Some group rankings use display ordering because conduct/FIFA ranking tie-break data is unavailable.';

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rowId(row) {
  return row.teamId || row.id || row.country || row.team;
}

function normaliseRow(row) {
  const goalsFor = numeric(row.goalsFor);
  const goalsAgainst = numeric(row.goalsAgainst);
  const goalDifference = Number.isFinite(Number(row.goalDifference))
    ? Number(row.goalDifference)
    : goalsFor - goalsAgainst;

  return {
    ...row,
    id: rowId(row),
    teamId: row.teamId || row.id || null,
    country: row.country || row.team || 'TBC',
    played: numeric(row.played),
    wins: numeric(row.wins ?? row.won),
    won: numeric(row.won ?? row.wins),
    draws: numeric(row.draws ?? row.drawn),
    drawn: numeric(row.drawn ?? row.draws),
    losses: numeric(row.losses ?? row.lost),
    lost: numeric(row.lost ?? row.losses),
    goalsFor,
    goalsAgainst,
    goalDifference,
    points: numeric(row.points),
    fairPlayScore: getFairPlayScore(row),
    fifaRanking: getFifaRanking(row),
    unresolvedTie: Boolean(row.unresolvedTie)
  };
}

function getFairPlayScore(row) {
  const value = row.fairPlayScore
    ?? row.teamConductScore
    ?? row.conductScore
    ?? row.fairPlay;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getFifaRanking(row) {
  const value = row.fifaRanking
    ?? row.fifaRank
    ?? row.fifaRankingPosition
    ?? row.worldRanking
    ?? row.worldRank;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function matchTeamIds(match) {
  return {
    homeTeamId: match.homeTeamId || match.homeId || match.homeTeam?.id || null,
    awayTeamId: match.awayTeamId || match.awayId || match.awayTeam?.id || null
  };
}

function hasScore(match) {
  return Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore);
}

function createHeadToHeadRows(rows, fixtures) {
  const ids = new Set(rows.map(rowId));
  const stats = new Map(rows.map((row) => [rowId(row), {
    points: 0,
    goalDifference: 0,
    goalsFor: 0,
    played: 0
  }]));

  fixtures
    .filter(hasScore)
    .forEach((fixture) => {
      const { homeTeamId, awayTeamId } = matchTeamIds(fixture);

      if (!ids.has(homeTeamId) || !ids.has(awayTeamId)) {
        return;
      }

      const home = stats.get(homeTeamId);
      const away = stats.get(awayTeamId);

      home.played += 1;
      away.played += 1;
      home.goalsFor += fixture.homeScore;
      away.goalsFor += fixture.awayScore;
      home.goalDifference += fixture.homeScore - fixture.awayScore;
      away.goalDifference += fixture.awayScore - fixture.homeScore;

      if (fixture.homeScore > fixture.awayScore) {
        home.points += 3;
      } else if (fixture.awayScore > fixture.homeScore) {
        away.points += 3;
      } else {
        home.points += 1;
        away.points += 1;
      }
    });

  return stats;
}

function splitByValue(rows, getValue, direction) {
  const groups = new Map();
  const unresolved = rows.some((row) => getValue(row) === null || getValue(row) === undefined);

  rows.forEach((row) => {
    const value = getValue(row);
    groups.set(value, groups.get(value) || []);
    groups.get(value).push(row);
  });

  const sortedValues = Array.from(groups.keys()).sort((left, right) => {
    if (direction === 'asc') {
      return numeric(left, Number.POSITIVE_INFINITY) - numeric(right, Number.POSITIVE_INFINITY);
    }

    return numeric(right, Number.NEGATIVE_INFINITY) - numeric(left, Number.NEGATIVE_INFINITY);
  });

  return {
    unresolved,
    groups: sortedValues.map((value) => groups.get(value))
  };
}

function applyCriterion(groups, criterion) {
  const nextGroups = [];
  let used = false;
  let unresolved = false;

  groups.forEach((group) => {
    if (group.length <= 1) {
      nextGroups.push(group);
      return;
    }

    const split = splitByValue(group, criterion.value, criterion.direction);
    unresolved = unresolved || split.unresolved;

    if (split.groups.length > 1) {
      used = true;
    }

    split.groups.forEach((item) => nextGroups.push(item));
  });

  return { groups: nextGroups, used, unresolved };
}

function markUnresolved(groups, unresolvedTieIds, unresolvedTies, reason) {
  groups
    .filter((group) => group.length > 1)
    .forEach((group) => {
      group.forEach((row) => unresolvedTieIds.add(rowId(row)));
      unresolvedTies.push({
        reason,
        teams: group.map((row) => row.country)
      });
    });
}

function sortUnresolvedGroup(group, optimisticTeamId = null) {
  return group.slice().sort((a, b) => {
    if (optimisticTeamId) {
      if (rowId(a) === optimisticTeamId && rowId(b) !== optimisticTeamId) {
        return -1;
      }

      if (rowId(b) === optimisticTeamId && rowId(a) !== optimisticTeamId) {
        return 1;
      }
    }

    return a.country.localeCompare(b.country);
  });
}

function rankGroupRows(rows = [], fixtures = [], options = {}) {
  const rankedRows = rows.map(normaliseRow);
  const unresolvedTieIds = new Set();
  const unresolvedTies = [];
  const byPoints = splitByValue(rankedRows, (row) => row.points, 'desc').groups;
  const finalGroups = [];

  byPoints.forEach((pointsGroup) => {
    if (pointsGroup.length <= 1) {
      finalGroups.push(pointsGroup);
      return;
    }

    const headToHead = createHeadToHeadRows(pointsGroup, fixtures);
    let groups = [pointsGroup];
    const criteria = [
      {
        value: (row) => headToHead.get(rowId(row))?.points ?? 0,
        direction: 'desc'
      },
      {
        value: (row) => headToHead.get(rowId(row))?.goalDifference ?? 0,
        direction: 'desc'
      },
      {
        value: (row) => headToHead.get(rowId(row))?.goalsFor ?? 0,
        direction: 'desc'
      },
      {
        value: (row) => row.goalDifference,
        direction: 'desc'
      },
      {
        value: (row) => row.goalsFor,
        direction: 'desc'
      },
      {
        value: (row) => row.fairPlayScore,
        direction: 'desc',
        needsOfficialData: true
      },
      {
        value: (row) => row.fifaRanking,
        direction: 'asc',
        needsOfficialData: true
      }
    ];

    criteria.forEach((criterion) => {
      if (!groups.some((group) => group.length > 1)) {
        return;
      }

      const result = applyCriterion(groups, criterion);

      if (criterion.needsOfficialData && result.unresolved && groups.some((group) => group.length > 1)) {
        result.groups
          .filter((group) => group.length > 1)
          .forEach((group) => {
            group.forEach((row) => unresolvedTieIds.add(rowId(row)));
          });
      }

      groups = result.groups;
    });

    markUnresolved(groups, unresolvedTieIds, unresolvedTies, 'conduct_or_fifa_ranking_unavailable');
    groups.forEach((group) => {
      finalGroups.push(group.length > 1 ? sortUnresolvedGroup(group, options.optimisticTeamId) : group);
    });
  });

  const ranked = finalGroups
    .flat()
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      unresolvedTie: row.unresolvedTie || unresolvedTieIds.has(rowId(row))
    }));

  return {
    rows: ranked,
    unresolvedTies,
    warnings: unresolvedTies.length ? [UNRESOLVED_TIE_WARNING] : []
  };
}

function rankThirdPlacedRows(rows = []) {
  const rankedRows = rows.map(normaliseRow);
  let groups = [rankedRows];
  const unresolvedTieIds = new Set();
  const unresolvedTies = [];
  const criteria = [
    { value: (row) => row.points, direction: 'desc' },
    { value: (row) => row.goalDifference, direction: 'desc' },
    { value: (row) => row.goalsFor, direction: 'desc' },
    { value: (row) => row.fairPlayScore, direction: 'desc', needsOfficialData: true },
    { value: (row) => row.fifaRanking, direction: 'asc', needsOfficialData: true }
  ];

  criteria.forEach((criterion) => {
    if (!groups.some((group) => group.length > 1)) {
      return;
    }

    const result = applyCriterion(groups, criterion);

    if (criterion.needsOfficialData && result.unresolved && groups.some((group) => group.length > 1)) {
      result.groups
        .filter((group) => group.length > 1)
        .forEach((group) => {
          group.forEach((row) => unresolvedTieIds.add(rowId(row)));
        });
    }

    groups = result.groups;
  });

  markUnresolved(groups, unresolvedTieIds, unresolvedTies, 'conduct_or_fifa_ranking_unavailable');

  return {
    rows: groups
      .flatMap((group) => (group.length > 1 ? sortUnresolvedGroup(group) : group))
      .map((row, index) => ({
        ...row,
        rank: index + 1,
        unresolvedTie: row.unresolvedTie || unresolvedTieIds.has(rowId(row)),
        projectedToQualify: index < 8
      })),
    unresolvedTies,
    warnings: unresolvedTies.length ? [UNRESOLVED_TIE_WARNING] : []
  };
}

module.exports = {
  UNRESOLVED_TIE_WARNING,
  rankGroupRows,
  rankThirdPlacedRows
};
