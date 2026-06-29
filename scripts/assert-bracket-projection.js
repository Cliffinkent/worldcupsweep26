const assert = require('node:assert/strict');
const sweepstakeTeams = require('../src/data/sweepstakeTeams');
const thirdPlaceAnnexC = require('../src/data/thirdPlaceAnnexC');
const { buildBracketProjection } = require('../src/services/bracketProjectionService');
const { buildQualificationProjection } = require('../src/services/qualificationService');
const {
  buildThirdPlaceWatch,
  buildThirdPlaceWatchDebug
} = require('../src/services/thirdPlaceWatchService');

const QUALIFYING_THIRD_PLACE_GROUPS = 'A,B,C,D,E,F,G,H';
const THIRD_PLACE_STATS = {
  A: { points: 8, goalDifference: 3, goalsFor: 5 },
  B: { points: 7, goalDifference: 1, goalsFor: 4 },
  C: { points: 6, goalDifference: 4, goalsFor: 6 },
  D: { points: 5, goalDifference: 2, goalsFor: 3 },
  E: { points: 5, goalDifference: 1, goalsFor: 5 },
  F: { points: 4, goalDifference: 0, goalsFor: 4 },
  G: { points: 4, goalDifference: 0, goalsFor: 3 },
  H: { points: 3, goalDifference: -1, goalsFor: 2 },
  I: { points: 0, goalDifference: -4, goalsFor: 0 },
  J: { points: 0, goalDifference: -4, goalsFor: 0 },
  K: { points: 0, goalDifference: -4, goalsFor: 0 },
  L: { points: 0, goalDifference: -4, goalsFor: 0 }
};
const KNOCKOUT_GROUP_ORDERS = {
  A: ['mexico', 'south-africa', 'czechia', 'south-korea'],
  B: ['switzerland', 'canada', 'bosnia-and-herzegovina', 'qatar'],
  C: ['brazil', 'morocco', 'haiti', 'scotland'],
  D: ['united-states', 'australia', 'paraguay', 'turkiye'],
  E: ['germany', 'curacao', 'cote-divoire', 'ecuador'],
  F: ['netherlands', 'japan', 'sweden', 'tunisia']
};
const teamsById = new Map(sweepstakeTeams.map((team) => [team.id, team]));

function teamsForGroup(group) {
  return sweepstakeTeams.filter((team) => team.group === group);
}

function teamRow(team, stats, rank) {
  return {
    teamId: team.id,
    group: team.group,
    rank,
    team: team.country,
    country: team.country,
    owner: team.owner,
    flag: team.flag,
    played: 3,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: stats.goalsFor,
    goalsAgainst: stats.goalsFor - stats.goalDifference,
    goalDifference: stats.goalDifference,
    points: stats.points
  };
}

function groupTable(group) {
  const teams = teamsForGroup(group);
  const order = group === 'A'
    ? ['mexico', 'south-korea', 'czechia', 'south-africa'].map((id) => teams.find((team) => team.id === id))
    : teams;
  const thirdStats = THIRD_PLACE_STATS[group];

  return {
    group,
    table: [
      teamRow(order[0], { points: 12, goalDifference: 8, goalsFor: 10 }, 1),
      teamRow(order[1], { points: 10, goalDifference: 4, goalsFor: 7 }, 2),
      teamRow(order[2], thirdStats, 3),
      teamRow(order[3], { points: 0, goalDifference: -8, goalsFor: 1 }, 4)
    ]
  };
}

function orderedGroupTable(group, orderedTeamIds) {
  const order = orderedTeamIds.map((teamId) => teamsById.get(teamId));
  const thirdStats = THIRD_PLACE_STATS[group];

  return {
    group,
    table: [
      teamRow(order[0], { points: 12, goalDifference: 8, goalsFor: 10 }, 1),
      teamRow(order[1], { points: 10, goalDifference: 4, goalsFor: 7 }, 2),
      teamRow(order[2], thirdStats, 3),
      teamRow(order[3], { points: 0, goalDifference: -8, goalsFor: 1 }, 4)
    ]
  };
}

function knockoutGroupTable(group) {
  const orderedTeamIds = KNOCKOUT_GROUP_ORDERS[group] || teamsForGroup(group).map((team) => team.id);
  return orderedGroupTable(group, orderedTeamIds);
}

function knockoutFixture({
  id,
  matchNumber = null,
  round = 'Round of 32',
  status = 'finished',
  rawStatus = 'FT',
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  homePenaltyScore = null,
  awayPenaltyScore = null,
  winner = null
}) {
  return {
    id,
    matchNumber,
    round,
    status,
    rawStatus,
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    homePenaltyScore,
    awayPenaltyScore,
    winner
  };
}

function assertThirdPlaceOrdering(ranked) {
  for (let index = 1; index < ranked.length; index += 1) {
    const previous = ranked[index - 1];
    const current = ranked[index];
    const ordered = previous.points > current.points
      || (previous.points === current.points && previous.goalDifference > current.goalDifference)
      || (
        previous.points === current.points
        && previous.goalDifference === current.goalDifference
        && previous.goalsFor >= current.goalsFor
      );

    assert.equal(ordered, true, `${previous.country} should rank ahead of ${current.country}`);
  }
}

const groupTables = 'ABCDEFGHIJKL'.split('').map(groupTable);

assert.equal(Object.keys(thirdPlaceAnnexC).length, 495);
assert.deepEqual(thirdPlaceAnnexC['E,F,G,H,I,J,K,L'], {
  '1A': '3E',
  '1B': '3J',
  '1D': '3I',
  '1E': '3F',
  '1G': '3H',
  '1I': '3G',
  '1K': '3L',
  '1L': '3K'
});

const projection = buildBracketProjection({
  groupTables,
  providerStatus: { providerStatus: 'test' },
  generatedAt: '2026-06-20T00:00:00.000Z'
});

const match73 = projection.roundOf32.find((match) => match.matchNumber === 73);
const match79 = projection.roundOf32.find((match) => match.matchNumber === 79);
const rankedThirdPlacedTeams = projection.qualificationDebug.thirdPlacedTeamsRanked;
const czechiaThirdPlaceSlot = projection.roundOf32
  .flatMap((match) => [match.slotA, match.slotB])
  .find((slot) => slot.source === '3A');
const qualification = buildQualificationProjection(groupTables);
const watch = buildThirdPlaceWatch({
  groupTables,
  providerStatus: { providerStatus: 'test' },
  generatedAt: '2026-06-20T00:00:00.000Z'
});
const watchDebug = buildThirdPlaceWatchDebug({
  watch,
  qualification,
  bracketProjection: projection,
  generatedAt: '2026-06-20T00:00:00.000Z'
});

assert.equal(match79.slotA.label, 'Winner Group A');
assert.equal(match79.slotA.team.country, 'Mexico');
assert.equal(match73.slotA.label, 'Runner-up Group A');
assert.equal(match73.slotA.team.country, 'South Korea');
assert.equal(rankedThirdPlacedTeams.length, 12);
assertThirdPlaceOrdering(rankedThirdPlacedTeams);
assert.deepEqual(projection.thirdPlaceGroupsProjectedToQualify, QUALIFYING_THIRD_PLACE_GROUPS.split(','));
assert.equal(projection.annexCKey, QUALIFYING_THIRD_PLACE_GROUPS);
assert.equal(projection.annexCMappingStatus, 'mapped');
assert.equal(czechiaThirdPlaceSlot.team.country, 'Czechia');

assert.equal(watch.globalThirdPlaceTable.length, 12);
assert.equal(watch.groupings.length, 8);
assert.equal(watch.groupings.every((grouping) => grouping.rows.length === 5), true);
assert.deepEqual(watch.selectedBestThirdGroups, projection.qualificationDebug.thirdPlaceGroupsProjectedToQualify);
assert.deepEqual(
  watch.globalThirdPlaceTable.slice(0, 8).map((row) => row.group),
  watch.selectedBestThirdGroups
);

watch.groupings.forEach((grouping) => {
  assert.equal(grouping.note, 'Grouping leader is for monitoring only. The official slot is assigned by the third-place rules.');

  const bracketMatch = projection.roundOf32.find((match) => match.matchNumber === grouping.matchNumber);
  const bracketThirdPlaceSlot = [bracketMatch.slotA, bracketMatch.slotB]
    .find((slot) => slot.source === grouping.annexeCMappedSource);

  assert.equal(grouping.annexCMappingStatus, 'mapped');
  assert.ok(watch.selectedBestThirdGroups.includes(grouping.annexeCMappedSource.slice(1)));
  assert.ok(bracketThirdPlaceSlot, `missing bracket slot for ${grouping.matchNumber}`);
  assert.equal(grouping.annexeCMappedTeam.country, bracketThirdPlaceSlot.team.country);

  if (grouping.currentGroupingLeader.source !== grouping.annexeCMappedSource) {
    assert.equal(
      [bracketMatch.slotA, bracketMatch.slotB].some((slot) => slot.source === grouping.currentGroupingLeader.source),
      false,
      `grouping leader should not drive bracket assignment for match ${grouping.matchNumber}`
    );
  }
});

assert.equal(watchDebug.passed, true, watchDebug.errors.join('\n'));
assert.deepEqual(watchDebug.consistencyChecks, {
  agreesWithQualificationService: true,
  agreesWithBracketProjection: true,
  topEightMatchSelectedGroups: true,
  allGroupingCardsHaveFiveRows: true,
  frontendSafePayload: true
});

const missingMappingProjection = buildBracketProjection({
  groupTables,
  providerStatus: { providerStatus: 'test' },
  generatedAt: '2026-06-20T00:00:00.000Z',
  annexCMap: {}
});
const missingMappingWatch = buildThirdPlaceWatch({
  groupTables,
  providerStatus: { providerStatus: 'test' },
  generatedAt: '2026-06-20T00:00:00.000Z',
  annexCMap: {}
});
const pendingThirdPlaceSlots = missingMappingProjection.roundOf32
  .flatMap((match) => [match.slotA, match.slotB])
  .filter((slot) => slot.placeholder === 'Pending third-place mapping');

assert.equal(missingMappingProjection.annexCKey, QUALIFYING_THIRD_PLACE_GROUPS);
assert.equal(missingMappingProjection.annexCMappingStatus, 'missing_combination');
assert.equal(pendingThirdPlaceSlots.length, 8);
assert.equal(missingMappingProjection.roundOf32.find((match) => match.matchNumber === 79).slotA.team.country, 'Mexico');
assert.equal(missingMappingWatch.annexCMappingStatus, 'missing_combination');
assert.equal(missingMappingWatch.groupings.every((grouping) => grouping.annexeCMappedSource === null), true);
assert.equal(missingMappingWatch.groupings.every((grouping) => grouping.annexeCMappedTeam === null), true);
assert.equal(
  missingMappingWatch.groupings.every((grouping) => grouping.rows.every((row) => row.isAnnexeCMappedTeam === false)),
  true
);

const knockoutGroupTables = 'ABCDEFGHIJKL'.split('').map(knockoutGroupTable);
const knockoutAnnexCMap = {
  [QUALIFYING_THIRD_PLACE_GROUPS]: {
    ...thirdPlaceAnnexC[QUALIFYING_THIRD_PLACE_GROUPS],
    '1E': '3D'
  }
};
const knockoutProjection = buildBracketProjection({
  groupTables: knockoutGroupTables,
  fixtures: [
    knockoutFixture({
      id: 'ko-73',
      matchNumber: 73,
      homeTeam: 'South Africa',
      awayTeam: 'Canada',
      homeScore: 2,
      awayScore: 1
    }),
    knockoutFixture({
      id: 'ko-75',
      matchNumber: 75,
      status: 'scheduled',
      rawStatus: 'NS',
      homeTeam: 'Netherlands',
      awayTeam: 'Morocco',
      homeScore: null,
      awayScore: null
    }),
    knockoutFixture({
      id: 'ko-74',
      matchNumber: 74,
      rawStatus: 'PEN',
      homeTeam: 'Germany',
      awayTeam: 'Paraguay',
      homeScore: 1,
      awayScore: 1,
      homePenaltyScore: 4,
      awayPenaltyScore: 5
    }),
    knockoutFixture({
      id: 'ko-unmapped',
      round: 'Round of 16',
      homeTeam: 'Canada',
      awayTeam: 'Morocco',
      homeScore: 1,
      awayScore: 0
    })
  ],
  rounds: ['Round of 32', 'Round of 16'],
  providerStatus: { providerStatus: 'test' },
  generatedAt: '2026-06-20T00:00:00.000Z',
  annexCMap: knockoutAnnexCMap
});
const knockoutM73 = knockoutProjection.roundOf32.find((match) => match.matchNumber === 73);
const knockoutM74 = knockoutProjection.roundOf32.find((match) => match.matchNumber === 74);
const knockoutM89 = knockoutProjection.bracket
  .flatMap((round) => round.matches)
  .find((match) => match.matchNumber === 89);
const knockoutM90 = knockoutProjection.bracket
  .flatMap((round) => round.matches)
  .find((match) => match.matchNumber === 90);
const downstreamW73 = [knockoutM89.slotA, knockoutM89.slotB].find((slot) => slot.source === 'W73');
const downstreamW75 = [knockoutM89.slotA, knockoutM89.slotB].find((slot) => slot.source === 'W75');
const downstreamW74 = [knockoutM90.slotA, knockoutM90.slotB].find((slot) => slot.source === 'W74');

assert.equal(knockoutM73.slotA.team.country, 'South Africa');
assert.equal(knockoutM73.slotA.isWinner, true);
assert.equal(knockoutM73.slotA.resultState, 'confirmed_winner');
assert.equal(knockoutM73.slotB.team.country, 'Canada');
assert.equal(knockoutM73.slotB.isLoser, true);
assert.equal(knockoutM73.slotB.isEliminated, true);
assert.equal(knockoutM73.slotB.resultState, 'confirmed_loser');
assert.equal(downstreamW73.team.country, 'South Africa');
assert.equal(downstreamW73.resolvedFromMatch, 73);
assert.equal(downstreamW75.team, null);
assert.equal(downstreamW75.resultState, 'placeholder');

assert.equal(knockoutM74.slotA.team.country, 'Germany');
assert.equal(knockoutM74.slotA.isLoser, true);
assert.equal(knockoutM74.slotA.isEliminated, true);
assert.equal(knockoutM74.slotB.team.country, 'Paraguay');
assert.equal(knockoutM74.slotB.isWinner, true);
assert.equal(downstreamW74.team.country, 'Paraguay');

assert.equal(knockoutProjection.bracketAudit.resolvedWinnerSources.W73, 'South Africa');
assert.equal(knockoutProjection.bracketAudit.resolvedLoserSources.L73, 'Canada');
assert.equal(knockoutProjection.bracketAudit.resolvedWinnerSources.W74, 'Paraguay');
assert.equal(
  knockoutProjection.bracketAudit.mappedKnockoutResults
    .some((result) => result.fixtureId === 'ko-73' && result.matchNumber === 73 && result.winner === 'South Africa' && result.mapped),
  true
);
assert.equal(
  knockoutProjection.bracketAudit.mappedKnockoutResults
    .some((result) => result.fixtureId === 'ko-74' && result.resultReason === 'penalties' && result.winner === 'Paraguay'),
  true
);
assert.equal(
  knockoutProjection.bracketAudit.unresolvedKnockoutFixtures
    .some((fixture) => fixture.fixtureId === 'ko-unmapped' && fixture.reason === 'finished_knockout_fixture_not_mapped'),
  true
);
assert.equal(
  knockoutProjection.bracketAudit.downstreamSlotChecks
    .some((check) => check.source === 'W73' && check.expectedCountry === 'South Africa' && check.actualCountry === 'South Africa' && check.passed),
  true
);

console.log('bracket projection assertions passed');
