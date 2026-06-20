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

console.log('bracket projection assertions passed');
