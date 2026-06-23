const assert = require('node:assert/strict');
const path = require('node:path');
const dotenv = require('dotenv');
const sweepstakeTeams = require('../src/data/sweepstakeTeams');
const { calculateMathematicalEliminations } = require('../src/services/mathematicalEliminationService');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const {
  getEliminatedTeamsData,
  getEliminationsDebugData,
  getMathematicalEliminationsDebugData
} = require('../src/services/sweepstakeService');

const expectedAutomaticEliminations = new Map([
  ['Haiti', 'Dawn'],
  ['Türkiye', 'Blaine'],
  ['Tunisia', 'Christina']
]);

function indexByCountry(rows) {
  return new Map((rows || []).map((row) => [row.country, row]));
}

function teamsForGroups(groups) {
  const wanted = new Set(groups);
  return sweepstakeTeams.filter((team) => wanted.has(team.group));
}

function assertTeamPresent(index, country, collectionName) {
  assert.ok(index.has(country), `${country} missing from ${collectionName}`);
  return index.get(country);
}

function finished(homeTeam, awayTeam, homeScore, awayScore, date = '2026-06-20T18:00:00.000Z') {
  const winner = homeScore > awayScore ? homeTeam : awayScore > homeScore ? awayTeam : null;

  return {
    status: 'finished',
    round: 'Group Stage',
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    winner,
    utcDate: date
  };
}

function scheduled(homeTeam, awayTeam, date = '2026-06-25T18:00:00.000Z') {
  return {
    status: 'scheduled',
    round: 'Group Stage',
    homeTeam,
    awayTeam,
    homeScore: null,
    awayScore: null,
    utcDate: date
  };
}

function findMathRow(result, country) {
  return result.teams.find((team) => team.country === country);
}

function assertMockEliminated({ label, teams, fixtures, country, proofType, proofCheck }) {
  const result = calculateMathematicalEliminations({ fixtures, teams });
  const row = findMathRow(result, country);

  assert.ok(row, `${label}: ${country} missing from mathematical result`);
  assert.equal(row.status, 'eliminated', `${label}: ${country} should be eliminated`);
  assert.equal(row.source, undefined, `${label}: mathematical service should not assign public API source`);
  assert.equal(row.proofType, proofType, `${label}: ${country} proofType mismatch`);
  assert.ok(row.proof, `${label}: ${country} should include an elimination proof`);

  if (proofCheck) {
    proofCheck(row.proof);
  }
}

function runMockScenarioTests() {
  assertMockEliminated({
    label: 'Mock Group D',
    teams: teamsForGroups(['D']),
    country: 'Türkiye',
    proofType: 'cannot_finish_top_three',
    fixtures: [
      finished('United States', 'Paraguay', 4, 1),
      finished('Australia', 'Türkiye', 2, 0),
      finished('United States', 'Australia', 2, 0),
      finished('Türkiye', 'Paraguay', 0, 1),
      scheduled('Türkiye', 'United States'),
      scheduled('Paraguay', 'Australia')
    ],
    proofCheck: (proof) => {
      const blockers = new Set(proof.blockingTeams.map((team) => team.country));
      assert.ok(blockers.has('Australia'), 'Mock Group D: Australia should block Türkiye');
      assert.ok(blockers.has('Paraguay'), 'Mock Group D: Paraguay should block Türkiye');
    }
  });

  assertMockEliminated({
    label: 'Mock Group C',
    teams: teamsForGroups(['C']),
    country: 'Haiti',
    proofType: 'cannot_finish_top_three',
    fixtures: [
      finished('Brazil', 'Morocco', 1, 1),
      finished('Haiti', 'Scotland', 0, 1),
      finished('Scotland', 'Morocco', 0, 1),
      finished('Brazil', 'Haiti', 3, 0),
      scheduled('Morocco', 'Haiti'),
      scheduled('Scotland', 'Brazil')
    ],
    proofCheck: (proof) => {
      const blockers = new Set(proof.blockingTeams.map((team) => team.country));
      const headToHead = proof.knownHeadToHeadResults.find((result) => result.opponent === 'Scotland');

      assert.ok(blockers.has('Scotland'), 'Mock Group C: Scotland should be a Haiti blocker');
      assert.equal(headToHead?.outcome, 'lost', 'Mock Group C: Haiti head-to-head with Scotland should be recorded');
    }
  });

  assertMockEliminated({
    label: 'Mock Group F',
    teams: teamsForGroups(['F']),
    country: 'Tunisia',
    proofType: 'cannot_finish_top_three',
    fixtures: [
      finished('Netherlands', 'Japan', 2, 2),
      finished('Sweden', 'Tunisia', 5, 1),
      finished('Netherlands', 'Sweden', 5, 1),
      finished('Tunisia', 'Japan', 0, 4),
      scheduled('Japan', 'Sweden'),
      scheduled('Tunisia', 'Netherlands')
    ]
  });

  const safetyResult = calculateMathematicalEliminations({
    teams: teamsForGroups(['C']),
    fixtures: [
      finished('Brazil', 'Haiti', 3, 0),
      finished('Morocco', 'Haiti', 2, 0),
      finished('Brazil', 'Scotland', 1, 0),
      finished('Morocco', 'Scotland', 1, 0),
      scheduled('Haiti', 'Scotland'),
      scheduled('Brazil', 'Morocco')
    ]
  });
  const safetyHaiti = findMathRow(safetyResult, 'Haiti');

  assert.notEqual(
    safetyHaiti?.status,
    'eliminated',
    'Safety mock: a 0-point team that can still win the relevant head-to-head must stay alive or at_risk'
  );
}

function currentFixtureHelp(mathDebug, country) {
  const row = (mathDebug.teams || []).find((team) => team.country === country);

  return {
    country,
    status: row?.status || 'missing',
    canStillFinishTopTwo: row?.canStillFinishTopTwo ?? null,
    canStillFinishThird: row?.canStillFinishThird ?? null,
    canStillQualifyAsBestThird: row?.canStillQualifyAsBestThird ?? null,
    scenariosChecked: row?.scenariosChecked ?? null,
    proof: row?.proof || null
  };
}

async function main() {
  runMockScenarioTests();

  const [data, debug, mathDebug] = await Promise.all([
    getEliminatedTeamsData(),
    getEliminationsDebugData(),
    getMathematicalEliminationsDebugData()
  ]);
  const board = indexByCountry(data.departureBoard);
  const lounge = indexByCountry(data.loungeTeams);
  const active = indexByCountry(data.activeTeams);
  const atRisk = indexByCountry(data.atRiskTeams);

  expectedAutomaticEliminations.forEach((owner, country) => {
    const boardRow = assertTeamPresent(board, country, 'departureBoard');
    const loungeRow = assertTeamPresent(lounge, country, 'loungeTeams');

    assert.equal(boardRow.owner, owner, `${country} has wrong departureBoard owner`);
    assert.equal(loungeRow.owner, owner, `${country} has wrong loungeTeams owner`);
    assert.equal(active.has(country), false, `${country} should not be active`);
    assert.equal(atRisk.has(country), false, `${country} should not be at_risk`);
    assert.equal(boardRow.source, 'automatic_mathematical', `${country} should be automatic, not manual-only`);
    assert.equal(boardRow.eliminationType, 'mathematical_group_stage', `${country} should be a group-stage mathematical elimination`);
    assert.equal(boardRow.proofType, 'cannot_finish_top_three', `${country} should prove it cannot finish top three`);
    assert.ok(boardRow.reason, `${country} should include a proof reason`);
  });

  assert.ok(data.eliminationSummary.eliminatedCount >= 3, 'expected at least three eliminated teams');
  assert.ok(data.eliminationSummary.mathematicalEliminationCount >= 3, 'expected at least three mathematical eliminations');
  assert.equal(debug.passed, true, debug.errors.join('\n'));
  assert.equal(mathDebug.passed, true, JSON.stringify({
    errors: mathDebug.errors,
    checks: mathDebug.checks,
    knownCases: Array.from(expectedAutomaticEliminations.keys()).map((country) => currentFixtureHelp(mathDebug, country))
  }, null, 2));

  console.log('elimination audit passed');
  console.log(JSON.stringify({
    eliminatedCount: data.eliminationSummary.eliminatedCount,
    mathematicalEliminationCount: data.eliminationSummary.mathematicalEliminationCount,
    manualOverrideCount: data.eliminationSummary.manualOverrideCount,
    expectedAutomaticEliminations: Array.from(expectedAutomaticEliminations.entries()).map(([country, owner]) => ({
      country,
      owner
    })),
    debugChecks: debug.checks,
    mathematicalDebugChecks: mathDebug.checks
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
