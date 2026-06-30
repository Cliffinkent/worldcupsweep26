const sweepstakeTeams = require('../data/sweepstakeTeams');
const { rankThirdPlacedRows } = require('./fifaTieBreakerService');

const GROUPS = 'ABCDEFGHIJKL'.split('');
const THIRD_PLACE_PROJECTION_WARNING = 'Some third-place projections use a display fallback because fair play/drawing-of-lots data is unavailable.';

function normaliseName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const teamsById = new Map(sweepstakeTeams.map((team) => [team.id, team]));
const teamsByName = new Map();

sweepstakeTeams.forEach((team) => {
  [team.country, team.fifaName, ...team.aliases].forEach((name) => {
    teamsByName.set(normaliseName(name), team);
  });
});

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getFairPlayScore(row) {
  const value = row.fairPlayScore
    ?? row.teamConductScore
    ?? row.conductScore
    ?? row.fairPlay;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getFifaRanking(row, localTeam) {
  const value = row.fifaRanking
    ?? row.fifaRank
    ?? row.fifaRankingPosition
    ?? row.worldRanking
    ?? row.worldRank
    ?? localTeam?.fifaRanking
    ?? localTeam?.fifaRank
    ?? localTeam?.worldRanking;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function findLocalTeam(row) {
  if (row.teamId && teamsById.has(row.teamId)) {
    return teamsById.get(row.teamId);
  }

  return teamsByName.get(normaliseName(row.country || row.team)) || null;
}

function toProjectedTeam(row, group, groupPosition, groupMatchCount, projectionStatus) {
  if (!row) {
    return null;
  }

  const localTeam = findLocalTeam(row);
  const country = row.country || row.team || localTeam?.country || 'TBC';
  const iso = row.iso || localTeam?.iso || null;
  const fairPlayScore = getFairPlayScore(row);
  const fifaRanking = getFifaRanking(row, localTeam);

  return {
    id: row.teamId || localTeam?.id || null,
    teamId: row.teamId || localTeam?.id || null,
    country,
    owner: row.owner || localTeam?.owner || null,
    flag: row.flag || localTeam?.flag || null,
    iso,
    flagAsset: iso ? `/assets/flags-iso/${iso}.svg` : null,
    group,
    groupPosition,
    played: toNumber(row.played),
    wins: toNumber(row.wins ?? row.won),
    draws: toNumber(row.draws ?? row.drawn),
    losses: toNumber(row.losses ?? row.lost),
    points: toNumber(row.points),
    goalsFor: toNumber(row.goalsFor),
    goalsAgainst: toNumber(row.goalsAgainst),
    goalDifference: toNumber(row.goalDifference),
    fairPlayScore,
    teamConductScore: fairPlayScore,
    fifaRanking,
    provisional: groupMatchCount === 0,
    unresolvedTie: projectionStatus === 'confirmed' ? false : Boolean(row.unresolvedTie),
    projectionType: projectionStatus === 'confirmed' ? 'confirmed' : 'as_it_stands'
  };
}

function getGroupMatchCount(groupTable) {
  const rows = groupTable?.table || [];
  const playedTotal = rows.reduce((total, row) => total + toNumber(row.played), 0);
  return Math.round(playedTotal / 2);
}

function getProjectionStatus(groupTables) {
  const groupsWithRows = GROUPS
    .map((group) => groupTables.find((table) => table.group === group))
    .filter((groupTable) => groupTable?.table?.length);

  if (!groupsWithRows.length) {
    return 'no_group_data';
  }

  const matchCounts = groupsWithRows.map(getGroupMatchCount);

  if (groupsWithRows.length < GROUPS.length || matchCounts.some((count) => count !== matchCounts[0])) {
    return 'partial_group_data';
  }

  if (matchCounts.every((count) => count >= 6)) {
    return 'confirmed';
  }

  return 'as_it_stands';
}

function tieBucketKey(team) {
  return [
    team.points,
    team.goalDifference,
    team.goalsFor
  ].join('|');
}

function compareOfficialTieBreakers(a, b) {
  if (
    a.fairPlayScore !== null &&
    b.fairPlayScore !== null &&
    a.fairPlayScore !== b.fairPlayScore
  ) {
    return b.fairPlayScore - a.fairPlayScore;
  }

  if (
    a.fifaRanking !== null &&
    b.fifaRanking !== null &&
    a.fifaRanking !== b.fifaRanking
  ) {
    return a.fifaRanking - b.fifaRanking;
  }

  return 0;
}

function officialTieBreakersCanResolve(teams) {
  const ordered = teams.slice().sort(compareOfficialTieBreakers);

  for (let index = 1; index < ordered.length; index += 1) {
    if (compareOfficialTieBreakers(ordered[index - 1], ordered[index]) === 0) {
      return false;
    }
  }

  return true;
}

function findUnresolvedThirdPlaceTies(thirdPlacedTeams) {
  const buckets = thirdPlacedTeams.reduce((grouped, team) => {
    const key = tieBucketKey(team);
    grouped.set(key, grouped.get(key) || []);
    grouped.get(key).push(team);
    return grouped;
  }, new Map());
  const unresolvedTeamIds = new Set();
  const unresolvedTies = [];

  buckets.forEach((teams, criteriaKey) => {
    if (teams.length < 2) {
      return;
    }

    if (officialTieBreakersCanResolve(teams)) {
      return;
    }

    teams.forEach((team) => {
      unresolvedTeamIds.add(team.id || `${team.group}:${team.country}`);
    });

    const [points, goalDifference, goalsFor] = criteriaKey.split('|').map(Number);
    unresolvedTies.push({
      criteria: { points, goalDifference, goalsFor },
      teams: teams.map((team) => ({
        country: team.country,
        group: team.group,
        points: team.points,
        goalDifference: team.goalDifference,
        goalsFor: team.goalsFor
      })),
      fallback: 'country_alphabetical_display_only'
    });
  });

  return { unresolvedTeamIds, unresolvedTies };
}

function compareThirdPlacedTeams(a, b) {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    compareOfficialTieBreakers(a, b) ||
    a.country.localeCompare(b.country)
  );
}

function rankThirdPlacedTeams(thirdPlacedTeams) {
  const thirdPlaceRanking = rankThirdPlacedRows(thirdPlacedTeams);
  const unresolvedTies = thirdPlaceRanking.unresolvedTies.length
    ? findUnresolvedThirdPlaceTies(thirdPlacedTeams).unresolvedTies
    : [];

  return {
    ranked: thirdPlaceRanking.rows,
    unresolvedTies,
    warnings: thirdPlaceRanking.unresolvedTies.length ? [THIRD_PLACE_PROJECTION_WARNING] : []
  };
}

function byGroup(teams) {
  return teams.reduce((index, team) => {
    index[team.group] = team;
    return index;
  }, {});
}

function clearUnresolvedTie(team) {
  if (!team || !team.unresolvedTie) {
    return team;
  }

  return { ...team, unresolvedTie: false };
}

function buildQualificationProjection(groupTables = []) {
  const projectionStatus = getProjectionStatus(groupTables);
  const tablesByGroup = new Map(groupTables.map((groupTable) => [groupTable.group, groupTable]));
  let groupWinners = [];
  let groupRunnersUp = [];
  const thirdPlacedTeams = [];

  GROUPS.forEach((group) => {
    const groupTable = tablesByGroup.get(group);
    const rows = groupTable?.table || [];
    const groupMatchCount = getGroupMatchCount(groupTable);
    const winner = toProjectedTeam(rows[0], group, 1, groupMatchCount, projectionStatus);
    const runnerUp = toProjectedTeam(rows[1], group, 2, groupMatchCount, projectionStatus);
    const thirdPlace = toProjectedTeam(rows[2], group, 3, groupMatchCount, projectionStatus);

    if (winner) {
      groupWinners.push(winner);
    }

    if (runnerUp) {
      groupRunnersUp.push(runnerUp);
    }

    if (thirdPlace) {
      thirdPlacedTeams.push(thirdPlace);
    }
  });

  const thirdPlaceRanking = rankThirdPlacedTeams(thirdPlacedTeams);
  let thirdPlacedTeamsRanked = thirdPlaceRanking.ranked;
  const qualifyingThirdPlacedTeams = thirdPlacedTeamsRanked.slice(0, 8);
  const thirdPlaceGroupsProjectedToQualify = qualifyingThirdPlacedTeams
    .map((team) => team.group)
    .sort((a, b) => a.localeCompare(b));
  const annexCKey = thirdPlaceGroupsProjectedToQualify.length === 8
    ? thirdPlaceGroupsProjectedToQualify.join(',')
    : null;

  if (projectionStatus === 'confirmed') {
    groupWinners = groupWinners.map(clearUnresolvedTie);
    groupRunnersUp = groupRunnersUp.map(clearUnresolvedTie);
    thirdPlacedTeamsRanked = thirdPlacedTeamsRanked.map(clearUnresolvedTie);
  }

  return {
    projectionStatus,
    groupWinners,
    groupRunnersUp,
    thirdPlacedTeamsRanked,
    groupWinnerByGroup: byGroup(groupWinners),
    groupRunnerUpByGroup: byGroup(groupRunnersUp),
    thirdPlacedByGroup: byGroup(thirdPlacedTeamsRanked),
    thirdPlaceGroupsProjectedToQualify,
    annexCKey,
    unresolvedTies: projectionStatus === 'confirmed' ? [] : thirdPlaceRanking.unresolvedTies,
    warnings: projectionStatus === 'confirmed' ? [] : thirdPlaceRanking.warnings,
    thirdPlaceProjectionWarning: projectionStatus === 'confirmed'
      ? null
      : (thirdPlaceRanking.warnings.includes(THIRD_PLACE_PROJECTION_WARNING)
        ? THIRD_PLACE_PROJECTION_WARNING
        : null)
  };
}

module.exports = {
  GROUPS,
  THIRD_PLACE_PROJECTION_WARNING,
  buildQualificationProjection,
  rankThirdPlacedTeams
};
