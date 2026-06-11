const assert = require('node:assert/strict');
const sweepstakeTeams = require('../src/data/sweepstakeTeams');
const { calculateGroupTablesWithDiagnostics } = require('../src/services/tableCalculator');
const { buildParticipantSummaries } = require('../src/services/sweepstakeService');
const { normaliseFixture } = require('../src/services/footballApiClient');

const rawMexicoSouthAfricaFixture = {
  fixture: {
    id: 1,
    date: '2026-06-11T19:00:00+00:00',
    status: {
      short: 'FT',
      long: 'Match Finished',
      elapsed: 90
    },
    venue: {}
  },
  league: {
    round: 'Group A - 1'
  },
  teams: {
    home: {
      name: 'Mexico',
      winner: true
    },
    away: {
      name: 'South Africa',
      winner: false
    }
  },
  goals: {
    home: 2,
    away: 1
  }
};

const nilNilFixture = {
  id: 'draw-0-0',
  round: 'Group A',
  group: 'A',
  homeTeam: 'Czechia',
  awayTeam: 'South Korea',
  homeScore: 0,
  awayScore: 0,
  status: 'finished'
};

const fixtures = [
  normaliseFixture(rawMexicoSouthAfricaFixture),
  nilNilFixture,
  {
    id: 'knockout',
    round: 'Round of 32',
    homeTeam: 'Mexico',
    awayTeam: 'South Africa',
    homeScore: 1,
    awayScore: 0,
    status: 'finished'
  }
];

const { groupTables, diagnostics } = calculateGroupTablesWithDiagnostics(sweepstakeTeams, fixtures);
const groupA = groupTables.find((group) => group.group === 'A');
const mexico = groupA.table.find((row) => row.teamId === 'mexico');
const southAfrica = groupA.table.find((row) => row.teamId === 'south-africa');
const czechia = groupA.table.find((row) => row.teamId === 'czechia');
const southKorea = groupA.table.find((row) => row.teamId === 'south-korea');

assert.deepEqual({
  played: mexico.played,
  won: mexico.won,
  drawn: mexico.drawn,
  lost: mexico.lost,
  goalsFor: mexico.goalsFor,
  goalsAgainst: mexico.goalsAgainst,
  goalDifference: mexico.goalDifference,
  points: mexico.points
}, {
  played: 1,
  won: 1,
  drawn: 0,
  lost: 0,
  goalsFor: 2,
  goalsAgainst: 1,
  goalDifference: 1,
  points: 3
});

assert.deepEqual({
  played: southAfrica.played,
  won: southAfrica.won,
  drawn: southAfrica.drawn,
  lost: southAfrica.lost,
  goalsFor: southAfrica.goalsFor,
  goalsAgainst: southAfrica.goalsAgainst,
  goalDifference: southAfrica.goalDifference,
  points: southAfrica.points
}, {
  played: 1,
  won: 0,
  drawn: 0,
  lost: 1,
  goalsFor: 1,
  goalsAgainst: 2,
  goalDifference: -1,
  points: 0
});

assert.equal(czechia.played, 1);
assert.equal(czechia.drawn, 1);
assert.equal(czechia.points, 1);
assert.equal(southKorea.played, 1);
assert.equal(southKorea.drawn, 1);
assert.equal(southKorea.points, 1);
assert.equal(diagnostics.finishedGroupFixturesCount, 2);
assert.equal(diagnostics.countedFixtures.some((fixture) => fixture.id === '1' && fixture.homeScore === 2 && fixture.awayScore === 1), true);
assert.equal(diagnostics.ignoredFinishedFixtures.some((fixture) => fixture.id === 'knockout' && fixture.reason === 'not_group_stage_fixture'), true);

const players = buildParticipantSummaries(groupTables, fixtures, []);
const marion = players.find((player) => player.owner === 'Marion');
const dawn = players.find((player) => player.owner === 'Dawn');

assert.equal(marion.teams.find((team) => team.id === 'mexico').points, 3);
assert.equal(dawn.teams.find((team) => team.id === 'south-africa').points, 0);
assert.equal(marion.totalGroupPoints, 3);
assert.equal(dawn.totalGroupPoints, 0);

console.log('table calculation assertions passed');
