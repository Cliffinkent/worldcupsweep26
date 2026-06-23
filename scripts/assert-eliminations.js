const assert = require('node:assert/strict');
const sweepstakeTeams = require('../src/data/sweepstakeTeams');
const teamVisuals = require('../src/data/teamVisuals');
const {
  buildEliminationData,
  buildEliminationsDebug
} = require('../src/services/eliminationService');
const {
  buildDepartureLoungePrompt,
  buildDepartureSceneHash
} = require('../src/services/departureScenePromptService');
const { renderDepartureBoardSvg } = require('../src/services/departureBoardRenderService');

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
    won: rank === 1 ? 3 : 0,
    drawn: rank === 2 ? 1 : 0,
    lost: rank >= 3 ? 2 : 0,
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
      teamRow(order[0], { points: 9, goalDifference: 6, goalsFor: 8 }, 1),
      teamRow(order[1], { points: 6, goalDifference: 2, goalsFor: 5 }, 2),
      teamRow(order[2], thirdStats, 3),
      teamRow(order[3], { points: 0, goalDifference: -8, goalsFor: 1 }, 4)
    ]
  };
}

function countryRows(data) {
  return new Map(data.departureBoard.map((team) => [team.country, team]));
}

function fixture({ homeTeam, awayTeam, winner, utcDate }) {
  return {
    status: 'finished',
    homeTeam,
    awayTeam,
    winner,
    utcDate
  };
}

const visualCountries = new Set(teamVisuals.map((team) => team.country));
assert.equal(visualCountries.size, sweepstakeTeams.length);
sweepstakeTeams.forEach((team) => {
  assert.ok(visualCountries.has(team.country), `${team.country} needs team visual metadata`);
});

const manualData = buildEliminationData({
  generatedAt: '2026-06-21T20:00:00.000Z',
  overrides: [
    {
      country: 'Haiti',
      source: 'manual_official',
      eliminatedAt: '2026-06-21T18:00:00.000Z',
      reason: 'Mathematically unable to qualify from the group stage',
      eliminatedBy: null
    }
  ]
});

assert.equal(manualData.eliminationSummary.eliminatedCount, 1);
assert.equal(countryRows(manualData).get('Haiti').source, 'manual_official');
assert.equal(manualData.loungeTeams[0].kitPrimary, '#174EA6');

const departurePrompt = buildDepartureLoungePrompt({
  loungeTeams: manualData.loungeTeams,
  styleVersion: '1'
});
const departureHash = buildDepartureSceneHash({
  loungeTeams: manualData.loungeTeams,
  styleVersion: '1'
});
const sameDepartureHash = buildDepartureSceneHash({
  loungeTeams: manualData.loungeTeams.slice().reverse(),
  styleVersion: '1'
});
const changedDepartureHash = buildDepartureSceneHash({
  loungeTeams: [
    ...manualData.loungeTeams,
    {
      country: 'Exampleland',
      owner: 'Example Owner',
      kitPrimary: '#111111',
      kitSecondary: '#eeeeee',
      kitAccent: '#cc0000'
    }
  ],
  styleVersion: '1'
});
const boardSvg = renderDepartureBoardSvg({
  departureBoard: [{
    ...manualData.departureBoard[0],
    owner: 'Owner <script>',
    reason: 'A & B < C'
  }],
  generatedAt: '2026-06-21T20:00:00.000Z'
});

assert.ok(departurePrompt.includes('Haiti'));
assert.ok(departurePrompt.includes('90\'s'));
assert.ok(departurePrompt.includes('No real people'));
assert.equal(departurePrompt.includes(manualData.loungeTeams[0].owner), false);
assert.ok(departurePrompt.length <= 2500);
assert.equal(departureHash, sameDepartureHash);
assert.notEqual(departureHash, changedDepartureHash);
assert.ok(boardSvg.includes('HAI 2026'));
assert.ok(boardSvg.includes('Owner &lt;script&gt;'));
assert.ok(boardSvg.includes('A &amp; B &lt; C'));
assert.equal(boardSvg.includes('<script>'), false);

const groupTables = 'ABCDEFGHIJKL'.split('').map(groupTable);
const groupData = buildEliminationData({
  groupTables,
  generatedAt: '2026-06-30T22:00:00.000Z'
});
const groupRows = countryRows(groupData);

assert.equal(groupRows.get('South Africa').source, 'group_stage_complete');
assert.equal(groupRows.get('Iraq').source, 'group_stage_complete');
assert.equal(groupRows.has('Czechia'), false);
assert.equal(groupData.activeTeams.some((team) => team.country === 'Czechia' && team.status === 'qualified'), true);

const knockoutProjection = {
  roundOf32: [
    {
      matchNumber: 73,
      round: 'Round of 32',
      status: 'finished',
      fixture: fixture({
        homeTeam: 'Mexico',
        awayTeam: 'South Korea',
        winner: 'Mexico',
        utcDate: '2026-07-04T20:00:00.000Z'
      })
    }
  ],
  laterRounds: [
    {
      round: 'Semi-finals',
      matches: [
        {
          matchNumber: 101,
          fixture: fixture({
            homeTeam: 'Brazil',
            awayTeam: 'France',
            winner: 'Brazil',
            utcDate: '2026-07-14T20:00:00.000Z'
          })
        }
      ]
    },
    {
      round: 'Final',
      matches: [
        {
          matchNumber: 104,
          fixture: fixture({
            homeTeam: 'Brazil',
            awayTeam: 'Mexico',
            winner: 'Mexico',
            utcDate: '2026-07-19T19:00:00.000Z'
          })
        }
      ]
    }
  ]
};
const knockoutData = buildEliminationData({
  bracketProjection: knockoutProjection,
  generatedAt: '2026-07-19T22:00:00.000Z'
});
const knockoutRows = countryRows(knockoutData);

assert.equal(knockoutRows.get('South Korea').source, 'knockout_loss');
assert.equal(knockoutRows.get('Brazil').reason, 'Lost the World Cup final');
assert.equal(knockoutRows.has('Mexico'), false);
assert.equal(knockoutData.pendingThirdPlaceTeams.some((team) => team.country === 'France'), true);

const thirdPlaceProjection = {
  laterRounds: [
    {
      round: 'Semi-finals',
      matches: [
        {
          matchNumber: 101,
          fixture: fixture({
            homeTeam: 'Brazil',
            awayTeam: 'France',
            winner: 'Brazil',
            utcDate: '2026-07-14T20:00:00.000Z'
          })
        },
        {
          matchNumber: 102,
          fixture: fixture({
            homeTeam: 'Argentina',
            awayTeam: 'England',
            winner: 'England',
            utcDate: '2026-07-15T20:00:00.000Z'
          })
        }
      ]
    },
    {
      round: 'Third-place play-off',
      matches: [
        {
          matchNumber: 103,
          fixture: fixture({
            homeTeam: 'France',
            awayTeam: 'Argentina',
            winner: 'France',
            utcDate: '2026-07-18T19:00:00.000Z'
          })
        }
      ]
    }
  ]
};
const thirdPlaceData = buildEliminationData({
  bracketProjection: thirdPlaceProjection,
  generatedAt: '2026-07-18T22:00:00.000Z'
});
const thirdPlaceRows = countryRows(thirdPlaceData);

assert.equal(thirdPlaceRows.get('France').source, 'third_place_complete');
assert.equal(thirdPlaceRows.get('Argentina').source, 'third_place_complete');
assert.equal(thirdPlaceData.pendingThirdPlaceTeams.length, 0);

const debug = buildEliminationsDebug({
  bracketProjection: knockoutProjection,
  generatedAt: '2026-07-19T22:00:00.000Z'
});

assert.equal(debug.passed, true, debug.errors.join('\n'));
assert.equal(debug.checks.noWorldCupWinnerEliminated, true);
assert.equal(debug.checks.noDuplicateEliminatedTeams, true);

console.log('elimination assertions passed');
