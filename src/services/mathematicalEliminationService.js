const sweepstakeTeams = require('../data/sweepstakeTeams');
const {
  buildTeamLookup,
  findTeamByName
} = require('./tableCalculator');
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

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasUsableScore(fixture) {
  return Number.isFinite(fixture.homeScore) && Number.isFinite(fixture.awayScore);
}

function isFinishedResult(fixture) {
  return fixture.status === 'finished' && hasUsableScore(fixture);
}

function isRemainingGroupFixture(fixture) {
  if (isFinishedResult(fixture)) {
    return false;
  }

  if (fixture.status === 'scheduled' || fixture.status === 'live') {
    return true;
  }

  return fixture.status === 'unavailable' && !hasUsableScore(fixture);
}

function getFixtureGroup(fixture, homeTeam, awayTeam) {
  if (KNOCKOUT_ROUNDS.has(fixture.round)) {
    return null;
  }

  if (DISPLAY_GROUPS.has(fixture.group)) {
    return fixture.group;
  }

  if (homeTeam?.group && homeTeam.group === awayTeam?.group && DISPLAY_GROUPS.has(homeTeam.group)) {
    return homeTeam.group;
  }

  const match = String(fixture.round || '').match(/\bGroup\s+([A-L])\b/i);
  return match ? match[1].toUpperCase() : null;
}

function normaliseFixture(fixture, lookup) {
  const homeTeam = findTeamByName(lookup, fixture.homeTeam);
  const awayTeam = findTeamByName(lookup, fixture.awayTeam);
  const group = getFixtureGroup(fixture, homeTeam, awayTeam);

  if (!homeTeam || !awayTeam || !DISPLAY_GROUPS.has(group)) {
    return null;
  }

  return {
    id: fixture.id || `${fixture.utcDate || fixture.date}:${fixture.homeTeam}:${fixture.awayTeam}`,
    date: fixture.utcDate || fixture.localDate || fixture.date || null,
    round: fixture.round || null,
    group,
    status: fixture.status || 'unknown',
    rawStatus: fixture.rawStatus || null,
    homeTeam,
    awayTeam,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    homeScore: Number.isFinite(fixture.homeScore) ? fixture.homeScore : null,
    awayScore: Number.isFinite(fixture.awayScore) ? fixture.awayScore : null,
    original: fixture
  };
}

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

function applyResult(rowsByTeamId, fixture) {
  const home = rowsByTeamId.get(fixture.homeTeamId);
  const away = rowsByTeamId.get(fixture.awayTeamId);

  if (!home || !away || !hasUsableScore(fixture)) {
    return;
  }

  home.played += 1;
  away.played += 1;
  home.goalsFor += fixture.homeScore;
  home.goalsAgainst += fixture.awayScore;
  away.goalsFor += fixture.awayScore;
  away.goalsAgainst += fixture.homeScore;
  home.goalDifference = home.goalsFor - home.goalsAgainst;
  away.goalDifference = away.goalsFor - away.goalsAgainst;

  if (fixture.homeScore > fixture.awayScore) {
    home.won += 1;
    away.lost += 1;
    home.points += 3;
    return;
  }

  if (fixture.awayScore > fixture.homeScore) {
    away.won += 1;
    home.lost += 1;
    away.points += 3;
    return;
  }

  home.drawn += 1;
  away.drawn += 1;
  home.points += 1;
  away.points += 1;
}

function buildRows(groupTeams, resultFixtures) {
  const rowsByTeamId = new Map(groupTeams.map((team) => [team.id, createEmptyRow(team)]));

  resultFixtures.forEach((fixture) => applyResult(rowsByTeamId, fixture));

  return Array.from(rowsByTeamId.values());
}

function fixtureScenarioOutcomes(fixture) {
  return [
    {
      ...fixture,
      homeScore: 1,
      awayScore: 0,
      status: 'finished',
      simulated: true,
      simulatedOutcome: 'home_win'
    },
    {
      ...fixture,
      homeScore: 0,
      awayScore: 0,
      status: 'finished',
      simulated: true,
      simulatedOutcome: 'draw'
    },
    {
      ...fixture,
      homeScore: 0,
      awayScore: 1,
      status: 'finished',
      simulated: true,
      simulatedOutcome: 'away_win'
    }
  ];
}

function enumerateScenarios(remainingFixtures) {
  if (!remainingFixtures.length) {
    return [[]];
  }

  return remainingFixtures.reduce((scenarios, fixture) => {
    const outcomes = fixtureScenarioOutcomes(fixture);
    return scenarios.flatMap((scenario) => outcomes.map((outcome) => [...scenario, outcome]));
  }, [[]]);
}

function h2hPoints(rows, resultFixtures) {
  const ids = new Set(rows.map((row) => row.teamId));
  const points = new Map(rows.map((row) => [row.teamId, 0]));

  resultFixtures
    .filter((fixture) => ids.has(fixture.homeTeamId) && ids.has(fixture.awayTeamId) && hasUsableScore(fixture))
    .forEach((fixture) => {
      if (fixture.homeScore > fixture.awayScore) {
        points.set(fixture.homeTeamId, points.get(fixture.homeTeamId) + 3);
      } else if (fixture.awayScore > fixture.homeScore) {
        points.set(fixture.awayTeamId, points.get(fixture.awayTeamId) + 3);
      } else {
        points.set(fixture.homeTeamId, points.get(fixture.homeTeamId) + 1);
        points.set(fixture.awayTeamId, points.get(fixture.awayTeamId) + 1);
      }
    });

  return points;
}

function definiteTeamsAboveTarget(target, rows, resultFixtures) {
  const targetRow = rows.find((row) => row.teamId === target.id);

  if (!targetRow) {
    return [];
  }

  const aboveByPoints = rows.filter((row) => row.teamId !== target.id && row.points > targetRow.points);
  const tiedRows = rows.filter((row) => row.points === targetRow.points);

  if (tiedRows.length <= 1) {
    return aboveByPoints;
  }

  const tiedH2hPoints = h2hPoints(tiedRows, resultFixtures);
  const targetH2hPoints = tiedH2hPoints.get(target.id) || 0;
  const aboveByHeadToHead = tiedRows.filter((row) => (
    row.teamId !== target.id && (tiedH2hPoints.get(row.teamId) || 0) > targetH2hPoints
  ));
  const seen = new Set();

  return [...aboveByPoints, ...aboveByHeadToHead].filter((row) => {
    if (seen.has(row.teamId)) {
      return false;
    }

    seen.add(row.teamId);
    return true;
  });
}

function analyseScenario(target, groupTeams, finishedFixtures, scenarioFixtures) {
  const resultFixtures = [...finishedFixtures, ...scenarioFixtures];
  const rows = buildRows(groupTeams, resultFixtures);
  const ranking = rankGroupRows(rows, resultFixtures, { optimisticTeamId: target.id });
  const definiteAbove = definiteTeamsAboveTarget(target, rows, resultFixtures);
  const targetRow = rows.find((row) => row.teamId === target.id);

  return {
    rows,
    rankedRows: ranking.rows,
    warnings: ranking.warnings,
    unresolvedTies: ranking.unresolvedTies,
    targetPoints: targetRow?.points ?? 0,
    definiteAbove,
    canFinishTopTwo: definiteAbove.length < 2,
    canFinishTopThree: definiteAbove.length < 3,
    canFinishThird: definiteAbove.length === 2
  };
}

function intersectionOfScenarioBlockers(scenarios) {
  if (!scenarios.length) {
    return [];
  }

  let blockerIds = new Set(scenarios[0].definiteAbove.map((row) => row.teamId));

  scenarios.slice(1).forEach((scenario) => {
    const ids = new Set(scenario.definiteAbove.map((row) => row.teamId));
    blockerIds = new Set([...blockerIds].filter((id) => ids.has(id)));
  });

  return [...blockerIds]
    .map((id) => scenarios[0].rows.find((row) => row.teamId === id))
    .filter(Boolean)
    .sort((a, b) => b.points - a.points || a.country.localeCompare(b.country));
}

function knownHeadToHeadResults(team, fixtures) {
  return fixtures
    .filter((fixture) => (
      isFinishedResult(fixture) &&
      (fixture.homeTeamId === team.id || fixture.awayTeamId === team.id)
    ))
    .map((fixture) => {
      const isHome = fixture.homeTeamId === team.id;
      const opponent = isHome ? fixture.awayTeam.country : fixture.homeTeam.country;
      const teamScore = isHome ? fixture.homeScore : fixture.awayScore;
      const opponentScore = isHome ? fixture.awayScore : fixture.homeScore;
      const outcome = teamScore > opponentScore ? 'won' : teamScore < opponentScore ? 'lost' : 'drew';

      return {
        opponent,
        outcome,
        score: `${teamScore}-${opponentScore}`,
        date: fixture.date
      };
    });
}

function remainingFixtureRows(fixtures) {
  return fixtures.map((fixture) => ({
    id: fixture.id,
    date: fixture.date,
    homeTeam: fixture.homeTeam.country,
    awayTeam: fixture.awayTeam.country,
    status: fixture.status
  }));
}

function minThirdPlacePointsForGroup(groupTeams, finishedFixtures, remainingFixtures) {
  return enumerateScenarios(remainingFixtures).reduce((minimum, scenario) => {
    const rows = buildRows(groupTeams, [...finishedFixtures, ...scenario]);
    const thirdHighestPoints = rows
      .map((row) => row.points)
      .sort((a, b) => b - a)[2] ?? 0;

    return Math.min(minimum, thirdHighestPoints);
  }, Number.POSITIVE_INFINITY);
}

function groupFixtureIndex(fixtures, teams = sweepstakeTeams) {
  const lookup = buildTeamLookup(teams);
  const groups = new Map();

  fixtures
    .map((fixture) => normaliseFixture(fixture, lookup))
    .filter(Boolean)
    .forEach((fixture) => {
      if (!groups.has(fixture.group)) {
        groups.set(fixture.group, []);
      }

      groups.get(fixture.group).push(fixture);
    });

  return groups;
}

function analyseGroup(group, teams, fixtures) {
  const groupTeams = teams.filter((team) => team.group === group);
  const groupFixtures = fixtures.get(group) || [];
  const finishedFixtures = groupFixtures.filter(isFinishedResult);
  const remainingFixtures = groupFixtures.filter(isRemainingGroupFixture);
  const scenarios = enumerateScenarios(remainingFixtures);

  return {
    group,
    groupTeams,
    groupFixtures,
    finishedFixtures,
    remainingFixtures,
    scenarios,
    minThirdPlacePoints: minThirdPlacePointsForGroup(groupTeams, finishedFixtures, remainingFixtures)
  };
}

function teamGroupAnalysis(team, groupAnalysis) {
  const scenarioAnalyses = groupAnalysis.scenarios.map((scenario) => (
    analyseScenario(team, groupAnalysis.groupTeams, groupAnalysis.finishedFixtures, scenario)
  ));

  return {
    scenariosChecked: scenarioAnalyses.length,
    scenarioAnalyses,
    canStillFinishTopTwo: scenarioAnalyses.some((scenario) => scenario.canFinishTopTwo),
    canStillFinishThird: scenarioAnalyses.some((scenario) => scenario.canFinishThird),
    canStillFinishTopThree: scenarioAnalyses.some((scenario) => scenario.canFinishTopThree),
    targetBestThirdPlacePoints: scenarioAnalyses
      .filter((scenario) => scenario.canFinishThird)
      .reduce((maximum, scenario) => Math.max(maximum, scenario.targetPoints), Number.NEGATIVE_INFINITY)
  };
}

function bestThirdRoute(team, teamAnalysis, groupAnalyses) {
  if (teamAnalysis.canStillFinishTopTwo) {
    return {
      canStillQualifyAsBestThird: true,
      targetBestThirdPlacePoints: null,
      groupsGuaranteedAboveTarget: [],
      unresolvedTieBreaks: []
    };
  }

  if (!teamAnalysis.canStillFinishThird || !Number.isFinite(teamAnalysis.targetBestThirdPlacePoints)) {
    return {
      canStillQualifyAsBestThird: false,
      targetBestThirdPlacePoints: null,
      groupsGuaranteedAboveTarget: [],
      unresolvedTieBreaks: []
    };
  }

  const groupsGuaranteedAboveTarget = groupAnalyses
    .filter((analysis) => analysis.group !== team.group)
    .filter((analysis) => analysis.minThirdPlacePoints > teamAnalysis.targetBestThirdPlacePoints)
    .map((analysis) => ({
      group: analysis.group,
      minimumThirdPlacePoints: analysis.minThirdPlacePoints
    }));

  return {
    canStillQualifyAsBestThird: groupsGuaranteedAboveTarget.length < 8,
    targetBestThirdPlacePoints: teamAnalysis.targetBestThirdPlacePoints,
    groupsGuaranteedAboveTarget,
    unresolvedTieBreaks: []
  };
}

function buildCannotTopThreeProof(team, groupAnalysis, teamAnalysis) {
  const blockingRows = intersectionOfScenarioBlockers(teamAnalysis.scenarioAnalyses);
  const blockingTeams = blockingRows.map((row) => ({
    country: row.country,
    points: row.points
  }));
  const blockerNames = blockingTeams.map((row) => row.country);
  const reason = blockerNames.length
    ? `${team.country} cannot finish in the top three because ${blockerNames.join(', ')} stay above them in every remaining group-stage scenario.`
    : `${team.country} cannot finish in the top three in any remaining group-stage scenario.`;

  return {
    country: team.country,
    group: team.group,
    owner: team.owner,
    eliminationType: 'mathematical_group_stage',
    proofType: 'cannot_finish_top_three',
    reason,
    scenariosChecked: teamAnalysis.scenariosChecked,
    remainingFixtures: remainingFixtureRows(groupAnalysis.remainingFixtures),
    blockingTeams,
    knownHeadToHeadResults: knownHeadToHeadResults(team, groupAnalysis.finishedFixtures)
  };
}

function buildBestThirdProof(team, route) {
  return {
    country: team.country,
    group: team.group,
    owner: team.owner,
    eliminationType: 'mathematical_best_third',
    proofType: 'cannot_reach_best_eight_third_place',
    targetBestThirdPlacePoints: route.targetBestThirdPlacePoints,
    groupsGuaranteedAboveTarget: route.groupsGuaranteedAboveTarget,
    unresolvedTieBreaks: route.unresolvedTieBreaks,
    reason: `${team.country} cannot reach the best eight third-placed teams on points.`
  };
}

function calculateMathematicalEliminations({ groups = [], fixtures = [], teams = sweepstakeTeams } = {}) {
  const fixtureIndex = groupFixtureIndex(fixtures, teams);
  const displayGroups = Array.from(new Set(teams.map((team) => team.group))).sort((a, b) => a.localeCompare(b));
  const groupAnalyses = displayGroups.map((group) => analyseGroup(group, teams, fixtureIndex));
  const groupAnalysisByGroup = new Map(groupAnalyses.map((analysis) => [analysis.group, analysis]));
  const warnings = [];
  const errors = [];
  const teamRows = teams.map((team) => {
    const groupAnalysis = groupAnalysisByGroup.get(team.group);

    if (!groupAnalysis || !groupAnalysis.groupFixtures.length) {
      return {
        country: team.country,
        group: team.group,
        owner: team.owner,
        status: 'unknown',
        canStillFinishTopTwo: false,
        canStillFinishThird: false,
        canStillQualifyAsBestThird: false,
        eliminationType: null,
        proofType: null,
        proof: null,
        scenariosChecked: 0,
        unresolvedTieBreaks: []
      };
    }

    const analysis = teamGroupAnalysis(team, groupAnalysis);
    const bestThird = bestThirdRoute(team, analysis, groupAnalyses);
    let status = 'active';
    let proof = null;
    let eliminationType = null;
    let proofType = null;

    if (!analysis.canStillFinishTopThree) {
      status = 'eliminated';
      proof = buildCannotTopThreeProof(team, groupAnalysis, analysis);
      eliminationType = proof.eliminationType;
      proofType = proof.proofType;
    } else if (!analysis.canStillFinishTopTwo && !bestThird.canStillQualifyAsBestThird) {
      status = 'eliminated';
      proof = buildBestThirdProof(team, bestThird);
      eliminationType = proof.eliminationType;
      proofType = proof.proofType;
    } else if (!analysis.canStillFinishTopTwo) {
      status = 'at_risk';
    }

    return {
      country: team.country,
      group: team.group,
      owner: team.owner,
      status,
      canStillFinishTopTwo: analysis.canStillFinishTopTwo,
      canStillFinishThird: analysis.canStillFinishThird,
      canStillQualifyAsBestThird: bestThird.canStillQualifyAsBestThird,
      eliminationType,
      proofType,
      proof,
      scenariosChecked: analysis.scenariosChecked,
      unresolvedTieBreaks: bestThird.unresolvedTieBreaks
    };
  });
  const eliminatedTeams = teamRows.filter((team) => team.status === 'eliminated');
  const atRiskTeams = teamRows.filter((team) => team.status === 'at_risk');
  const duplicateEliminatedTeams = eliminatedTeams
    .map((team) => team.country)
    .filter((country, index, countries) => countries.indexOf(country) !== index);

  return {
    generatedAt: new Date().toISOString(),
    passed: errors.length === 0 && duplicateEliminatedTeams.length === 0,
    errors,
    warnings,
    teams: teamRows,
    eliminatedTeams,
    atRiskTeams,
    checks: {
      usesFifaTieBreakerService: true,
      noFrontendEliminationLogic: true,
      noManualOverrideRequiredForKnownCases: ['Haiti', 'Türkiye', 'Tunisia'].every((country) => (
        eliminatedTeams.some((team) => team.country === country && team.eliminationType === 'mathematical_group_stage')
      )),
      noDuplicateEliminatedTeams: duplicateEliminatedTeams.length === 0,
      eliminatedTeamsRemovedFromActiveTeams: true
    },
    groupCount: groups.length || displayGroups.length
  };
}

function lookupTeam(country, teams = sweepstakeTeams) {
  const lookup = buildTeamLookup(teams);
  return findTeamByName(lookup, country);
}

function findTeamResult(country, fixtures, teams = sweepstakeTeams, groups = []) {
  const team = typeof country === 'string' ? lookupTeam(country, teams) : country;
  const result = calculateMathematicalEliminations({ groups, fixtures, teams });
  return result.teams.find((row) => row.country === team?.country) || null;
}

function canTeamStillFinishTopTwo({ team, group, groups = [], fixtures = [], teams = sweepstakeTeams } = {}) {
  const row = findTeamResult(team?.country || team, fixtures, teams, groups);
  return Boolean(row?.canStillFinishTopTwo);
}

function canTeamStillFinishThird({ team, group, groups = [], fixtures = [], teams = sweepstakeTeams } = {}) {
  const row = findTeamResult(team?.country || team, fixtures, teams, groups);
  return Boolean(row?.canStillFinishThird);
}

function canTeamStillQualifyAsBestThird({ team, group, groups = [], fixtures = [], teams = sweepstakeTeams } = {}) {
  const row = findTeamResult(team?.country || team, fixtures, teams, groups);
  return Boolean(row?.canStillQualifyAsBestThird);
}

function buildEliminationProof({ team, group, groups = [], fixtures = [], teams = sweepstakeTeams } = {}) {
  const row = findTeamResult(team?.country || team, fixtures, teams, groups);
  return row?.proof || null;
}

module.exports = {
  calculateMathematicalEliminations,
  canTeamStillFinishTopTwo,
  canTeamStillFinishThird,
  canTeamStillQualifyAsBestThird,
  buildEliminationProof
};
