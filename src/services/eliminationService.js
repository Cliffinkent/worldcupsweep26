const sweepstakeTeams = require('../data/sweepstakeTeams');
const eliminationOverrides = require('../data/eliminationOverrides');
const teamVisuals = require('../data/teamVisuals');
const { buildQualificationProjection } = require('./qualificationService');
const { calculateMathematicalEliminations } = require('./mathematicalEliminationService');
const {
  buildTeamLookup,
  findTeamByName
} = require('./tableCalculator');

const FALLBACK_VISUAL = Object.freeze({
  kitPrimary: '#1f2937',
  kitSecondary: '#f9fafb',
  kitAccent: '#9ca3af',
  poseVariant: 'seated'
});

const KNOCKOUT_ROUND_NAMES = new Set([
  'Round of 32',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  'Third-place play-off',
  'Final'
]);

const SOURCE_PRIORITY = Object.freeze({
  manual_official: 1,
  group_stage_complete: 2,
  automatic_mathematical_best_third: 3,
  automatic_mathematical_group_stage: 4,
  knockout_loss: 5,
  third_place_complete: 5
});

const FLIGHT_CODE_OVERRIDES = Object.freeze({
  'Bosnia and Herzegovina': 'BIH',
  'Cape Verde': 'CPV',
  'Côte d’Ivoire': 'CIV',
  'Curaçao': 'CUR',
  Czechia: 'CZE',
  'DR Congo': 'COD',
  England: 'ENG',
  Ghana: 'GHA',
  Haiti: 'HAI',
  'New Zealand': 'NZL',
  Scotland: 'SCO',
  'Saudi Arabia': 'KSA',
  'South Korea': 'KOR',
  Türkiye: 'TUR',
  'United States': 'USA'
});

function normaliseName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getFlagAsset(team) {
  return team?.iso ? `/assets/flags-iso/${team.iso}.svg` : null;
}

function getVisualIndex(visuals) {
  return new Map((visuals || []).map((visual) => [normaliseName(visual.country), visual]));
}

function getTeamVisual(team, visualIndex) {
  const visual = visualIndex.get(normaliseName(team.country));

  return {
    ...FALLBACK_VISUAL,
    ...(visual || {}),
    visualSource: visual ? 'configured' : 'fallback'
  };
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getGroupMatchCount(groupTable) {
  const rows = groupTable?.table || [];
  const playedTotal = rows.reduce((total, row) => total + numeric(row.played), 0);
  return Math.round(playedTotal / 2);
}

function isGroupComplete(groupTable) {
  return (groupTable?.table || []).length >= 4 && getGroupMatchCount(groupTable) >= 6;
}

function compareEliminatedRecords(a, b) {
  const timeA = Date.parse(a.eliminatedAt || '');
  const timeB = Date.parse(b.eliminatedAt || '');
  const validA = Number.isFinite(timeA);
  const validB = Number.isFinite(timeB);

  if (validA && validB && timeA !== timeB) {
    return timeA - timeB;
  }

  if (validA !== validB) {
    return validA ? -1 : 1;
  }

  return a.country.localeCompare(b.country);
}

function latestFinishedFixtureDate(fixtures, predicate) {
  const dates = fixtures
    .filter((fixture) => fixture.status === 'finished' && predicate(fixture))
    .map((fixture) => fixture.utcDate || fixture.localDate || fixture.date)
    .filter(Boolean)
    .map((value) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    })
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime());

  return dates[0]?.toISOString() || null;
}

function uniqueStrings(values) {
  const seen = new Set();

  return values
    .filter((value) => value !== null && value !== undefined && String(value).trim())
    .map((value) => String(value).trim())
    .filter((value) => {
      const key = normaliseName(value);

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function uniqueExactStrings(values) {
  const seen = new Set();

  return values
    .filter((value) => value !== null && value !== undefined && String(value).trim())
    .map((value) => String(value).trim())
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    });
}

function getLocalTeamAliases(team) {
  return uniqueStrings([
    team.country,
    team.fifaName,
    ...(team.aliases || [])
  ]);
}

function getOverrideAliases(override) {
  return uniqueExactStrings([
    override.country,
    ...(override.aliases || [])
  ]);
}

function findOverrideTeam(teams, override) {
  const aliasesChecked = getOverrideAliases(override);
  const overrideKeys = new Set(aliasesChecked.map(normaliseName));
  const team = teams.find((candidate) => (
    getLocalTeamAliases(candidate).some((alias) => overrideKeys.has(normaliseName(alias)))
  )) || null;

  return {
    team,
    aliasesChecked
  };
}

function teamMatchesGroupFixture(team, lookup, fixture) {
  if (fixture.group && fixture.group !== team.group) {
    return false;
  }

  const homeTeam = findTeamByName(lookup, fixture.homeTeam);
  const awayTeam = findTeamByName(lookup, fixture.awayTeam);

  return homeTeam?.group === team.group && awayTeam?.group === team.group;
}

function createBaseTeam(team) {
  return {
    country: team.country,
    owner: team.owner || 'Unknown',
    flagAsset: getFlagAsset(team),
    group: team.group
  };
}

function createEliminatedRecord(team, details) {
  return {
    ...createBaseTeam(team),
    status: 'eliminated',
    eliminatedAt: details.eliminatedAt || null,
    confirmedDate: details.confirmedDate || null,
    reason: details.reason || 'Tournament elimination confirmed',
    eliminatedBy: details.eliminatedBy || null,
    source: details.source,
    sourceLabel: details.sourceLabel || null,
    eliminationType: details.eliminationType || null,
    proofType: details.proofType || null,
    proof: details.proof || null,
    blockingTeams: details.blockingTeams || [],
    knownHeadToHeadResults: details.knownHeadToHeadResults || []
  };
}

function sourcePriority(record) {
  if (record.source === 'automatic_mathematical') {
    return SOURCE_PRIORITY[`automatic_${record.eliminationType}`] || 0;
  }

  return SOURCE_PRIORITY[record.source] || 0;
}

function setEliminated(eliminatedById, team, details) {
  const current = eliminatedById.get(team.id);
  const next = createEliminatedRecord(team, details);

  if (!current) {
    eliminatedById.set(team.id, next);
    return;
  }

  const currentPriority = sourcePriority(current);
  const nextPriority = sourcePriority(next);

  if (nextPriority > currentPriority) {
    eliminatedById.set(team.id, next);
    return;
  }

  if (nextPriority < currentPriority) {
    return;
  }

  const currentTime = Date.parse(current.eliminatedAt || '');
  const nextTime = Date.parse(next.eliminatedAt || '');

  if (!Number.isFinite(currentTime) || (Number.isFinite(nextTime) && nextTime < currentTime)) {
    eliminatedById.set(team.id, next);
  }
}

function getThirdPlacedTeam(qualification, group) {
  return qualification.thirdPlacedByGroup?.[group] || null;
}

function parseDateToIso(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function confirmedDateFallback(confirmedDate) {
  if (!confirmedDate) {
    return null;
  }

  return parseDateToIso(`${confirmedDate}T12:00:00.000Z`);
}

function getFixtureTeams(fixture, lookup) {
  return {
    home: findTeamByName(lookup, fixture.homeTeam),
    away: findTeamByName(lookup, fixture.awayTeam),
    winner: findTeamByName(lookup, fixture.winner)
  };
}

function teamLostFixture(team, fixture, lookup) {
  if (fixture.status !== 'finished') {
    return false;
  }

  const { home, away, winner } = getFixtureTeams(fixture, lookup);

  if (!home || !away || (team.id !== home.id && team.id !== away.id)) {
    return false;
  }

  if (winner) {
    return winner.id !== team.id;
  }

  if (!Number.isFinite(fixture.homeScore) || !Number.isFinite(fixture.awayScore)) {
    return false;
  }

  if (team.id === home.id) {
    return fixture.homeScore < fixture.awayScore;
  }

  return fixture.awayScore < fixture.homeScore;
}

function latestFinishedLosingFixtureDate(team, fixtures, lookup) {
  return latestFinishedFixtureDate(fixtures, (fixture) => teamLostFixture(team, fixture, lookup));
}

function teamPlayedFixture(team, fixture, lookup) {
  if (fixture.status !== 'finished') {
    return false;
  }

  const { home, away } = getFixtureTeams(fixture, lookup);

  return home?.id === team.id || away?.id === team.id;
}

function latestFinishedTeamFixtureDate(team, fixtures, lookup) {
  return latestFinishedFixtureDate(fixtures, (fixture) => teamPlayedFixture(team, fixture, lookup));
}

function resolveManualEliminatedAt(override, team, fixtures, lookup, warnings) {
  const explicitDate = parseDateToIso(override.eliminatedAt);

  if (override.eliminatedAt && !explicitDate) {
    warnings.push(`Manual elimination override for ${team.country} has an invalid eliminatedAt value.`);
  }

  return explicitDate
    || latestFinishedLosingFixtureDate(team, fixtures, lookup)
    || confirmedDateFallback(override.confirmedDate);
}

function applyManualOverrides({
  eliminatedById,
  warnings,
  errors,
  lookup,
  teams,
  fixtures,
  overrides,
  manualOverrideChecks,
  unmatchedManualOverrides
}) {
  (overrides || []).forEach((override) => {
    const { team, aliasesChecked } = findOverrideTeam(teams, override);
    const check = {
      overrideCountry: override.country || null,
      matchedCountry: team?.country || null,
      matchedOwner: team?.owner || null,
      matchedGroup: team?.group || null,
      matched: Boolean(team),
      aliasesChecked
    };

    manualOverrideChecks.push(check);

    if (!team) {
      const message = `Manual elimination override could not be matched: ${override.country || 'Unknown'}.`;
      errors.push(message);
      warnings.push(message);
      unmatchedManualOverrides.push({
        country: override.country || null,
        aliasesChecked
      });
      return;
    }

    if (!team.owner) {
      warnings.push(`Manual elimination override for ${team.country} matched, but no sweepstake owner was found.`);
    }

    setEliminated(eliminatedById, team, {
      source: override.source || 'manual_official',
      sourceLabel: override.sourceLabel || 'Confirmed eliminated',
      confirmedDate: override.confirmedDate || null,
      eliminatedAt: resolveManualEliminatedAt(override, team, fixtures, lookup, warnings),
      reason: override.reason || 'Official elimination confirmed manually',
      eliminatedBy: override.eliminatedBy || null
    });
  });
}

function applyMathematicalEliminations({
  eliminatedById,
  math,
  lookup,
  teams,
  fixtures
}) {
  (math.eliminatedTeams || []).forEach((mathRow) => {
    const team = findTeamByName(lookup, mathRow.country);

    if (!team) {
      return;
    }

    const proof = mathRow.proof || {};

    setEliminated(eliminatedById, team, {
      source: 'automatic_mathematical',
      sourceLabel: 'Mathematically eliminated',
      eliminationType: mathRow.eliminationType,
      proofType: mathRow.proofType,
      proof,
      eliminatedAt: latestFinishedTeamFixtureDate(team, fixtures, lookup),
      reason: proof.reason || 'Mathematically unable to qualify from the group stage',
      eliminatedBy: null,
      blockingTeams: proof.blockingTeams || proof.groupsGuaranteedAboveTarget || [],
      knownHeadToHeadResults: proof.knownHeadToHeadResults || []
    });
  });
}

function applyGroupStageEliminations({
  eliminatedById,
  groupTables,
  fixtures,
  lookup,
  qualification,
  thirdPlaceSelectionConfirmed
}) {
  groupTables
    .filter(isGroupComplete)
    .forEach((groupTable) => {
      const rows = groupTable.table || [];
      const completionDate = latestFinishedFixtureDate(
        fixtures,
        (fixture) => teamMatchesGroupFixture({ group: groupTable.group }, lookup, fixture)
      );
      const fourthPlaceRow = rows[3];
      const fourthPlaceTeam = fourthPlaceRow ? findTeamByName(lookup, fourthPlaceRow.country || fourthPlaceRow.team) : null;

      if (fourthPlaceTeam) {
        setEliminated(eliminatedById, fourthPlaceTeam, {
          source: 'group_stage_complete',
          eliminatedAt: completionDate,
          reason: `Finished fourth in Group ${groupTable.group}`,
          eliminatedBy: null
        });
      }

      const thirdPlaceRow = rows[2];
      const thirdPlaceTeam = thirdPlaceRow ? findTeamByName(lookup, thirdPlaceRow.country || thirdPlaceRow.team) : null;
      const projectedThirdPlaceTeam = getThirdPlacedTeam(qualification, groupTable.group);

      if (
        thirdPlaceTeam &&
        thirdPlaceSelectionConfirmed &&
        projectedThirdPlaceTeam &&
        !projectedThirdPlaceTeam.projectedToQualify
      ) {
        setEliminated(eliminatedById, thirdPlaceTeam, {
          source: 'group_stage_complete',
          eliminatedAt: completionDate,
          reason: `Finished third in Group ${groupTable.group} and outside the best eight third-placed teams`,
          eliminatedBy: null
        });
      }
    });
}

function getFixtureTeamNames(match) {
  const fixture = match.fixture || match;

  return {
    homeTeam: fixture.homeTeam || match.homeTeam || null,
    awayTeam: fixture.awayTeam || match.awayTeam || null,
    winner: fixture.winner || match.winner || null,
    eliminatedAt: fixture.utcDate || fixture.localDate || fixture.date || null
  };
}

function getMatchStage(match) {
  const matchNumber = Number(match.matchNumber);

  if (Number.isFinite(matchNumber)) {
    if (matchNumber >= 73 && matchNumber <= 88) {
      return 'round_of_32';
    }

    if (matchNumber >= 89 && matchNumber <= 96) {
      return 'round_of_16';
    }

    if (matchNumber >= 97 && matchNumber <= 100) {
      return 'quarter_final';
    }

    if (matchNumber >= 101 && matchNumber <= 102) {
      return 'semi_final';
    }

    if (matchNumber === 103) {
      return 'third_place';
    }

    if (matchNumber === 104) {
      return 'final';
    }
  }

  switch (match.round) {
    case 'Round of 32':
      return 'round_of_32';
    case 'Round of 16':
      return 'round_of_16';
    case 'Quarter-finals':
      return 'quarter_final';
    case 'Semi-finals':
      return 'semi_final';
    case 'Third-place play-off':
      return 'third_place';
    case 'Final':
      return 'final';
    default:
      return null;
  }
}

function knockoutStageLabel(stage, round) {
  switch (stage) {
    case 'round_of_32':
      return 'Round of 32';
    case 'round_of_16':
      return 'Round of 16';
    case 'quarter_final':
      return 'quarter-finals';
    default:
      return round || 'knockout stage';
  }
}

function knockoutStageSortValue(match) {
  const matchNumber = Number(match.matchNumber);

  if (Number.isFinite(matchNumber)) {
    return matchNumber;
  }

  return {
    round_of_32: 73,
    round_of_16: 89,
    quarter_final: 97,
    semi_final: 101,
    third_place: 103,
    final: 104
  }[getMatchStage(match)] || 999;
}

function sortKnockoutMatches(matches) {
  return matches
    .slice()
    .sort((a, b) => knockoutStageSortValue(a) - knockoutStageSortValue(b));
}

function getKnockoutMatches(bracketProjection, fixtures) {
  const projectedMatches = [
    ...(bracketProjection?.roundOf32 || []),
    ...(bracketProjection?.laterRounds || []).flatMap((round) => (
      (round.matches || []).map((match) => ({
        ...match,
        round: round.round
      }))
    ))
  ];

  if (projectedMatches.length) {
    return sortKnockoutMatches(projectedMatches);
  }

  return sortKnockoutMatches((fixtures || [])
    .filter((fixture) => KNOCKOUT_ROUND_NAMES.has(fixture.round))
    .map((fixture) => ({
      fixture,
      round: fixture.round,
      matchNumber: fixture.matchNumber || null,
      status: fixture.status,
      winner: fixture.winner
    })));
}

function getFinishedMatchTeams(match, lookup) {
  const { homeTeam, awayTeam, winner, eliminatedAt } = getFixtureTeamNames(match);
  const home = findTeamByName(lookup, homeTeam);
  const away = findTeamByName(lookup, awayTeam);
  const winningTeam = findTeamByName(lookup, winner);

  return { home, away, winningTeam, eliminatedAt };
}

function applyKnockoutEliminations({
  eliminatedById,
  pendingThirdPlaceById,
  finalWinnerRef,
  knockoutMatches,
  lookup
}) {
  knockoutMatches
    .filter((match) => (match.fixture?.status || match.status) === 'finished')
    .forEach((match) => {
      const stage = getMatchStage(match);
      const { home, away, winningTeam, eliminatedAt } = getFinishedMatchTeams(match, lookup);

      if (!stage || !home || !away) {
        return;
      }

      if (stage === 'third_place') {
        [home, away].forEach((team) => {
          pendingThirdPlaceById.delete(team.id);
          setEliminated(eliminatedById, team, {
            source: 'third_place_complete',
            eliminatedAt,
            reason: 'Third-place play-off complete',
            eliminatedBy: winningTeam?.country || null
          });
        });
        return;
      }

      if (!winningTeam) {
        return;
      }

      const losers = [home, away].filter((team) => team.id !== winningTeam.id);

      if (stage === 'semi_final') {
        losers.forEach((team) => {
          if (!eliminatedById.has(team.id)) {
            pendingThirdPlaceById.set(team.id, {
              ...createBaseTeam(team),
              status: 'third_place_pending',
              reason: 'Out of the title race, awaiting the third-place play-off'
            });
          }
        });
        return;
      }

      if (stage === 'final') {
        finalWinnerRef.team = winningTeam;
      }

      if (['round_of_32', 'round_of_16', 'quarter_final', 'final'].includes(stage)) {
        losers.forEach((team) => {
          setEliminated(eliminatedById, team, {
            source: 'knockout_loss',
            eliminatedAt,
            reason: stage === 'final' ? 'Lost the World Cup final' : `Lost in the ${knockoutStageLabel(stage, match.round)}`,
            eliminatedBy: winningTeam.country
          });
        });
      }
    });
}

function removeWorldCupWinner(eliminatedById, pendingThirdPlaceById, finalWinner, warnings) {
  if (!finalWinner) {
    return;
  }

  if (eliminatedById.delete(finalWinner.id)) {
    warnings.push(`${finalWinner.country} was removed from eliminations because they are the World Cup winner.`);
  }

  pendingThirdPlaceById.delete(finalWinner.id);
}

function getRowByTeam(groupTables, lookup) {
  const index = new Map();

  groupTables.forEach((groupTable) => {
    const complete = isGroupComplete(groupTable);

    (groupTable.table || []).forEach((row, positionIndex) => {
      const team = findTeamByName(lookup, row.country || row.team);

      if (team) {
        index.set(team.id, {
          row,
          groupComplete: complete,
          groupPosition: positionIndex + 1
        });
      }
    });
  });

  return index;
}

function getActiveStatus(team, rowMeta, qualification, thirdPlaceSelectionConfirmed, mathRow) {
  if (!rowMeta) {
    return mathRow?.status || 'unknown';
  }

  if (!rowMeta.groupComplete && mathRow?.status === 'at_risk') {
    return 'at_risk';
  }

  if (!rowMeta.groupComplete && mathRow?.status === 'active') {
    return 'active';
  }

  if (rowMeta.groupPosition <= 2) {
    return rowMeta.groupComplete ? 'qualified' : 'active';
  }

  if (rowMeta.groupComplete && rowMeta.groupPosition === 3) {
    const thirdPlaceTeam = getThirdPlacedTeam(qualification, team.group);

    if (!thirdPlaceSelectionConfirmed) {
      return 'at_risk';
    }

    return thirdPlaceTeam?.projectedToQualify ? 'qualified' : 'at_risk';
  }

  if (mathRow?.status === 'at_risk') {
    return 'at_risk';
  }

  if (mathRow?.status === 'active') {
    return 'active';
  }

  if (!rowMeta || numeric(rowMeta.row.played) === 0) {
    return mathRow?.status || 'unknown';
  }

  if (!rowMeta.groupComplete) {
    return rowMeta.groupPosition <= 2 ? 'active' : 'at_risk';
  }

  return 'at_risk';
}

function flightCode(country) {
  if (FLIGHT_CODE_OVERRIDES[country]) {
    return `${FLIGHT_CODE_OVERRIDES[country]} 2026`;
  }

  const letters = String(country || 'TBC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, 'X');

  return `${letters} 2026`;
}

function gateForIndex(index) {
  const letter = String.fromCharCode(65 + (index % 6));
  return `Gate ${letter}${Math.floor(index / 6) + 1}`;
}

function toDepartureBoardRow(record, index) {
  return {
    country: record.country,
    owner: record.owner,
    flagAsset: record.flagAsset,
    group: record.group,
    status: 'Boarding',
    flightCode: flightCode(record.country),
    gate: gateForIndex(index),
    destination: 'Home',
    eliminatedAt: record.eliminatedAt,
    confirmedDate: record.confirmedDate,
    reason: record.reason,
    eliminatedBy: record.eliminatedBy,
    eliminationStatus: record.status,
    status: record.status,
    flightStatus: 'Boarding',
    source: record.source,
    sourceLabel: record.sourceLabel,
    eliminationType: record.eliminationType,
    proofType: record.proofType,
    proof: record.proof,
    blockingTeams: record.blockingTeams,
    knownHeadToHeadResults: record.knownHeadToHeadResults
  };
}

function toLoungeTeam(record, team, visual, index) {
  return {
    country: record.country,
    owner: record.owner,
    flagAsset: record.flagAsset,
    group: record.group,
    kitPrimary: visual.kitPrimary,
    kitSecondary: visual.kitSecondary,
    kitAccent: visual.kitAccent,
    poseVariant: visual.poseVariant,
    seatNumber: `L${String(index + 1).padStart(2, '0')}`,
    eliminatedAt: record.eliminatedAt,
    confirmedDate: record.confirmedDate,
    reason: record.reason,
    eliminatedBy: record.eliminatedBy,
    status: record.status,
    source: record.source,
    sourceLabel: record.sourceLabel,
    eliminationType: record.eliminationType,
    proofType: record.proofType,
    proof: record.proof,
    blockingTeams: record.blockingTeams,
    knownHeadToHeadResults: record.knownHeadToHeadResults,
    visualSource: visual.visualSource,
    teamId: team.id
  };
}

function sourceCounts(eliminatedRecords, pendingThirdPlaceTeams) {
  return {
    manualOverrides: eliminatedRecords.filter((team) => team.source === 'manual_official').length,
    mathematicalEliminations: eliminatedRecords.filter((team) => team.source === 'automatic_mathematical').length,
    groupStageCompleteEliminations: eliminatedRecords.filter((team) => team.source === 'group_stage_complete').length,
    knockoutEliminations: eliminatedRecords.filter((team) => (
      team.source === 'knockout_loss' || team.source === 'third_place_complete'
    )).length,
    pendingThirdPlace: pendingThirdPlaceTeams.length
  };
}

function stripInternalFields(row) {
  const { teamId, visualSource, ...publicRow } = row;
  return publicRow;
}

function buildEliminationData({
  teams = sweepstakeTeams,
  groupTables = [],
  fixtures = [],
  bracketProjection = null,
  providerStatus = null,
  generatedAt = new Date().toISOString(),
  overrides = eliminationOverrides,
  visuals = teamVisuals
} = {}) {
  const lookup = buildTeamLookup(teams);
  const visualIndex = getVisualIndex(visuals);
  const qualification = buildQualificationProjection(groupTables);
  const thirdPlaceSelectionConfirmed = qualification.projectionStatus === 'confirmed';
  const mathematical = calculateMathematicalEliminations({ groups: groupTables, fixtures, teams });
  const mathByTeamId = new Map((mathematical.teams || [])
    .map((row) => {
      const team = findTeamByName(lookup, row.country);
      return team ? [team.id, row] : null;
    })
    .filter(Boolean));
  const eliminatedById = new Map();
  const pendingThirdPlaceById = new Map();
  const warnings = [
    ...(qualification.warnings || []),
    ...(mathematical.warnings || [])
  ];
  const errors = [];
  const manualOverrideChecks = [];
  const unmatchedManualOverrides = [];
  const finalWinnerRef = { team: null };

  applyManualOverrides({
    eliminatedById,
    warnings,
    errors,
    lookup,
    teams,
    fixtures,
    overrides,
    manualOverrideChecks,
    unmatchedManualOverrides
  });
  applyMathematicalEliminations({
    eliminatedById,
    math: mathematical,
    lookup,
    teams,
    fixtures
  });
  applyGroupStageEliminations({
    eliminatedById,
    groupTables,
    fixtures,
    lookup,
    qualification,
    thirdPlaceSelectionConfirmed
  });
  applyKnockoutEliminations({
    eliminatedById,
    pendingThirdPlaceById,
    finalWinnerRef,
    knockoutMatches: getKnockoutMatches(bracketProjection, fixtures),
    lookup
  });
  removeWorldCupWinner(eliminatedById, pendingThirdPlaceById, finalWinnerRef.team, warnings);

  const rowByTeam = getRowByTeam(groupTables, lookup);
  const eliminatedRecords = Array.from(eliminatedById.values()).sort(compareEliminatedRecords);
  const eliminatedIds = new Set(eliminatedById.keys());
  const pendingThirdPlaceTeams = Array.from(pendingThirdPlaceById.values())
    .sort((a, b) => a.country.localeCompare(b.country));
  const pendingThirdPlaceIds = new Set(pendingThirdPlaceById.keys());
  const departureBoardInternal = eliminatedRecords.map(toDepartureBoardRow);
  const loungeTeamsInternal = eliminatedRecords.map((record, index) => {
    const team = findTeamByName(lookup, record.country);
    const visual = getTeamVisual(team, visualIndex);
    return toLoungeTeam(record, team, visual, index);
  });
  const nonEliminatedTeams = teams
    .filter((team) => !eliminatedIds.has(team.id) && !pendingThirdPlaceIds.has(team.id))
    .map((team) => ({
      ...createBaseTeam(team),
      status: getActiveStatus(
        team,
        rowByTeam.get(team.id),
        qualification,
        thirdPlaceSelectionConfirmed,
        mathByTeamId.get(team.id)
      )
    }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.country.localeCompare(b.country));
  const atRiskTeams = nonEliminatedTeams.filter((team) => team.status === 'at_risk');
  const activeTeams = nonEliminatedTeams.filter((team) => team.status !== 'at_risk');
  const counts = sourceCounts(eliminatedRecords, pendingThirdPlaceTeams);
  const payload = {
    lastUpdated: generatedAt,
    providerStatus,
    eliminationSummary: {
      eliminatedCount: eliminatedRecords.length,
      activeCount: activeTeams.length,
      atRiskCount: atRiskTeams.length,
      pendingThirdPlaceCount: pendingThirdPlaceTeams.length,
      mathematicalEliminationCount: counts.mathematicalEliminations,
      manualOverrideCount: counts.manualOverrides
    },
    departureBoard: departureBoardInternal.map(stripInternalFields),
    loungeTeams: loungeTeamsInternal.map(stripInternalFields),
    pendingThirdPlaceTeams,
    activeTeams,
    atRiskTeams,
    warnings
  };

  Object.defineProperty(payload, '_debug', {
    enumerable: false,
    value: {
      finalWinner: finalWinnerRef.team ? finalWinnerRef.team.country : null,
      sourceCounts: counts,
      departureBoard: departureBoardInternal,
      loungeTeams: loungeTeamsInternal,
      manualOverrideChecks,
      unmatchedManualOverrides,
      mathematical,
      atRiskTeams,
      errors
    }
  });

  return payload;
}

function hasDuplicates(values) {
  return new Set(values).size !== values.length;
}

function buildEliminationsDebug(context = {}) {
  const data = buildEliminationData(context);
  const eliminatedCountries = data.departureBoard.map((team) => team.country);
  const activeCountries = new Set(data.activeTeams.map((team) => team.country));
  const atRiskCountries = new Set((data.atRiskTeams || []).map((team) => team.country));
  const loungeCountries = new Set(data.loungeTeams.map((team) => team.country));
  const boardCountries = new Set(data.departureBoard.map((team) => team.country));
  const manualOverrideChecks = data._debug.manualOverrideChecks || [];
  const matchedManualOverrideCountries = manualOverrideChecks
    .filter((check) => check.matched)
    .map((check) => check.matchedCountry);
  const finalWinner = data._debug.finalWinner;
  const checks = {
    manualOverridesLoaded: manualOverrideChecks.length > 0,
    allManualOverridesMatched: manualOverrideChecks.every((check) => check.matched),
    manualOverridesIncludedInDepartureBoard: matchedManualOverrideCountries.every((country) => boardCountries.has(country)),
    manualOverridesIncludedInLoungeTeams: matchedManualOverrideCountries.every((country) => loungeCountries.has(country)),
    manualOverridesRemovedFromActiveTeams: matchedManualOverrideCountries.every((country) => !activeCountries.has(country)),
    noWorldCupWinnerEliminated: !finalWinner || !eliminatedCountries.includes(finalWinner),
    noActiveTeamInDepartureLounge: data.loungeTeams.every((team) => !activeCountries.has(team.country)),
    noAtRiskTeamInDepartureLounge: data.loungeTeams.every((team) => !atRiskCountries.has(team.country)),
    noDuplicateEliminatedTeams: !hasDuplicates(eliminatedCountries),
    allEliminatedTeamsHaveVisuals: data._debug.loungeTeams.every((team) => team.visualSource === 'configured'),
    allEliminatedTeamsHaveOwners: data.departureBoard.every((team) => Boolean(team.owner))
  };
  const errors = [...(data._debug.errors || [])];

  if (!checks.manualOverridesLoaded) {
    errors.push('No manual elimination overrides are loaded.');
  }

  if (!checks.allManualOverridesMatched) {
    errors.push('One or more manual elimination overrides did not match a local team.');
  }

  if (!checks.manualOverridesIncludedInDepartureBoard) {
    errors.push('One or more manual elimination overrides are missing from the departure board.');
  }

  if (!checks.manualOverridesIncludedInLoungeTeams) {
    errors.push('One or more manual elimination overrides are missing from lounge teams.');
  }

  if (!checks.manualOverridesRemovedFromActiveTeams) {
    errors.push('One or more manual elimination overrides still appear in active teams.');
  }

  if (!checks.noWorldCupWinnerEliminated) {
    errors.push('World Cup winner appears in the eliminated teams list.');
  }

  if (!checks.noActiveTeamInDepartureLounge) {
    errors.push('An active team appears in the departure lounge.');
  }

  if (!checks.noAtRiskTeamInDepartureLounge) {
    errors.push('An at-risk team appears in the departure lounge.');
  }

  if (!checks.noDuplicateEliminatedTeams) {
    errors.push('Duplicate countries appear in the eliminated teams list.');
  }

  if (!checks.allEliminatedTeamsHaveVisuals) {
    errors.push('One or more eliminated teams are using fallback visual metadata.');
  }

  if (!checks.allEliminatedTeamsHaveOwners) {
    errors.push('One or more eliminated teams are missing sweepstake owners.');
  }

  return {
    generatedAt: data.lastUpdated,
    passed: errors.length === 0 && Object.values(checks).every(Boolean),
    errors,
    warnings: data.warnings,
    sourceCounts: data._debug.sourceCounts,
    eliminatedTeams: data.departureBoard.map((team) => ({
      country: team.country,
      source: team.source,
      eliminationType: team.eliminationType,
      proofType: team.proofType,
      reason: team.reason,
      eliminatedAt: team.eliminatedAt
    })),
    manualOverrideChecks,
    unmatchedManualOverrides: data._debug.unmatchedManualOverrides || [],
    activeTeamsCount: data.activeTeams.length,
    atRiskTeamsCount: (data.atRiskTeams || []).length,
    mathematical: data._debug.mathematical,
    checks
  };
}

module.exports = {
  buildEliminationData,
  buildEliminationsDebug,
  getGroupMatchCount,
  isGroupComplete
};
