const thirdPlaceAnnexC = require('../data/thirdPlaceAnnexC');
const { buildQualificationProjection } = require('./qualificationService');

const DISPLAY_FALLBACK_WARNING = 'Some third-place rankings use a display fallback because conduct/FIFA ranking tie-break data is unavailable.';
const ANNEX_C_PENDING_WARNING = 'The official third-place slot mapping is pending for the current selected third-place groups.';
const GROUPING_NOTE = 'Grouping leader is for monitoring only. The official slot is assigned by the third-place rules.';

const GROUPING_CARDS = Object.freeze([
  Object.freeze({
    id: 'match-74-1e',
    matchNumber: 74,
    bracketWinnerSlot: '1E',
    bracketWinnerLabel: 'Winner Group E',
    thirdPlaceLabel: 'Best 3rd place of A/B/C/D/F',
    candidateGroups: Object.freeze(['A', 'B', 'C', 'D', 'F'])
  }),
  Object.freeze({
    id: 'match-77-1i',
    matchNumber: 77,
    bracketWinnerSlot: '1I',
    bracketWinnerLabel: 'Winner Group I',
    thirdPlaceLabel: 'Best 3rd place of C/D/F/G/H',
    candidateGroups: Object.freeze(['C', 'D', 'F', 'G', 'H'])
  }),
  Object.freeze({
    id: 'match-79-1a',
    matchNumber: 79,
    bracketWinnerSlot: '1A',
    bracketWinnerLabel: 'Winner Group A',
    thirdPlaceLabel: 'Best 3rd place of C/E/F/H/I',
    candidateGroups: Object.freeze(['C', 'E', 'F', 'H', 'I'])
  }),
  Object.freeze({
    id: 'match-80-1l',
    matchNumber: 80,
    bracketWinnerSlot: '1L',
    bracketWinnerLabel: 'Winner Group L',
    thirdPlaceLabel: 'Best 3rd place of E/H/I/J/K',
    candidateGroups: Object.freeze(['E', 'H', 'I', 'J', 'K'])
  }),
  Object.freeze({
    id: 'match-81-1d',
    matchNumber: 81,
    bracketWinnerSlot: '1D',
    bracketWinnerLabel: 'Winner Group D',
    thirdPlaceLabel: 'Best 3rd place of B/E/F/I/J',
    candidateGroups: Object.freeze(['B', 'E', 'F', 'I', 'J'])
  }),
  Object.freeze({
    id: 'match-82-1g',
    matchNumber: 82,
    bracketWinnerSlot: '1G',
    bracketWinnerLabel: 'Winner Group G',
    thirdPlaceLabel: 'Best 3rd place of A/E/H/I/J',
    candidateGroups: Object.freeze(['A', 'E', 'H', 'I', 'J'])
  }),
  Object.freeze({
    id: 'match-85-1b',
    matchNumber: 85,
    bracketWinnerSlot: '1B',
    bracketWinnerLabel: 'Winner Group B',
    thirdPlaceLabel: 'Best 3rd place of E/F/G/I/J',
    candidateGroups: Object.freeze(['E', 'F', 'G', 'I', 'J'])
  }),
  Object.freeze({
    id: 'match-87-1k',
    matchNumber: 87,
    bracketWinnerSlot: '1K',
    bracketWinnerLabel: 'Winner Group K',
    thirdPlaceLabel: 'Best 3rd place of D/E/I/J/L',
    candidateGroups: Object.freeze(['D', 'E', 'I', 'J', 'L'])
  })
]);

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sourceForGroup(group) {
  return `3${group}`;
}

function sourceGroup(source) {
  const match = String(source || '').match(/^3([A-L])$/);
  return match ? match[1] : null;
}

function sameMembers(a = [], b = []) {
  if (a.length !== b.length) {
    return false;
  }

  const sortedA = a.slice().sort((left, right) => left.localeCompare(right));
  const sortedB = b.slice().sort((left, right) => left.localeCompare(right));
  return sortedA.every((value, index) => value === sortedB[index]);
}

function sameOrder(a = [], b = []) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function toGlobalRow(team) {
  return {
    globalRank: team.rank,
    group: team.group,
    source: sourceForGroup(team.group),
    country: team.country,
    owner: team.owner,
    flagAsset: team.flagAsset,
    played: numeric(team.played),
    wins: numeric(team.wins),
    draws: numeric(team.draws),
    losses: numeric(team.losses),
    goalsFor: numeric(team.goalsFor),
    goalsAgainst: numeric(team.goalsAgainst),
    goalDifference: numeric(team.goalDifference),
    points: numeric(team.points),
    qualificationStatus: team.projectedToQualify ? 'currently_qualifies' : 'currently_out',
    unresolvedTie: Boolean(team.unresolvedTie)
  };
}

function toGroupingRow(row, isGroupingLeader, annexeCMappedSource) {
  return {
    group: row.group,
    source: row.source,
    country: row.country,
    owner: row.owner,
    flagAsset: row.flagAsset,
    globalRank: row.globalRank,
    played: row.played,
    points: row.points,
    goalDifference: row.goalDifference,
    goalsFor: row.goalsFor,
    qualificationStatus: row.qualificationStatus,
    isGroupingLeader,
    isAnnexeCMappedTeam: row.source === annexeCMappedSource,
    unresolvedTie: row.unresolvedTie
  };
}

function buildGroupingRows(candidateGroups, globalRowsByGroup, annexeCMappedSource) {
  return candidateGroups
    .map((group) => globalRowsByGroup.get(group))
    .filter(Boolean)
    .sort((left, right) => left.globalRank - right.globalRank)
    .map((row, index) => toGroupingRow(row, index === 0, annexeCMappedSource));
}

function buildGroupings(globalThirdPlaceTable, qualification, annexCMap) {
  const globalRowsByGroup = new Map(globalThirdPlaceTable.map((row) => [row.group, row]));
  const annexCMapping = qualification.annexCKey ? annexCMap[qualification.annexCKey] || null : null;

  return GROUPING_CARDS.map((grouping) => {
    const annexeCMappedSource = annexCMapping ? annexCMapping[grouping.bracketWinnerSlot] || null : null;
    const mappedGroup = sourceGroup(annexeCMappedSource);
    const mappingIsUsable = Boolean(
      annexeCMappedSource &&
      mappedGroup &&
      grouping.candidateGroups.includes(mappedGroup) &&
      globalRowsByGroup.has(mappedGroup)
    );
    const rows = buildGroupingRows(
      grouping.candidateGroups,
      globalRowsByGroup,
      mappingIsUsable ? annexeCMappedSource : null
    );
    const currentGroupingLeader = rows[0] || null;
    const annexeCMappedTeam = mappingIsUsable
      ? rows.find((row) => row.source === annexeCMappedSource) || null
      : null;

    return {
      ...grouping,
      candidateGroups: [...grouping.candidateGroups],
      currentGroupingLeader,
      annexeCMappedSource: mappingIsUsable ? annexeCMappedSource : null,
      annexeCMappedTeam,
      annexCMappingStatus: mappingIsUsable ? 'mapped' : 'missing_combination',
      rows,
      note: GROUPING_NOTE
    };
  });
}

function buildThirdPlaceWatch({
  groupTables = [],
  providerStatus = null,
  generatedAt = new Date().toISOString(),
  annexCMap = thirdPlaceAnnexC
} = {}) {
  const qualification = buildQualificationProjection(groupTables);
  const globalThirdPlaceTable = qualification.thirdPlacedTeamsRanked.map(toGlobalRow);
  const selectedBestThirdGroups = globalThirdPlaceTable
    .slice(0, 8)
    .map((row) => row.group);
  const annexCMapping = qualification.annexCKey ? annexCMap[qualification.annexCKey] || null : null;
  const annexCMappingStatus = annexCMapping ? 'mapped' : 'missing_combination';
  const groupings = buildGroupings(globalThirdPlaceTable, qualification, annexCMap);
  const warnings = [];

  if (globalThirdPlaceTable.some((row) => row.unresolvedTie)) {
    warnings.push(DISPLAY_FALLBACK_WARNING);
  }

  if (!annexCMapping) {
    warnings.push(ANNEX_C_PENDING_WARNING);
  }

  return {
    lastUpdated: generatedAt,
    projectionStatus: qualification.projectionStatus,
    providerStatus,
    warnings,
    annexCKey: qualification.annexCKey,
    annexCMappingStatus,
    selectedBestThirdGroups,
    globalThirdPlaceTable,
    groupings
  };
}

function getBracketThirdPlaceSlot(bracketProjection, matchNumber, expectedSource) {
  const match = (bracketProjection?.roundOf32 || [])
    .find((roundOf32Match) => roundOf32Match.matchNumber === matchNumber);

  if (!match) {
    return null;
  }

  return [match.slotA, match.slotB].find((slot) => (
    slot?.source === expectedSource ||
    String(slot?.source || '').startsWith('3') ||
    slot?.placeholder === 'Pending third-place mapping'
  )) || null;
}

function buildThirdPlaceWatchDebug({
  watch,
  qualification,
  bracketProjection,
  generatedAt = new Date().toISOString()
} = {}) {
  const errors = [];
  const warnings = [...(watch?.warnings || [])];
  const globalThirdPlaceTable = watch?.globalThirdPlaceTable || [];
  const groupings = watch?.groupings || [];
  const selectedBestThirdGroups = watch?.selectedBestThirdGroups || [];
  const qualificationRows = qualification?.thirdPlacedTeamsRanked || [];
  const qualificationSelectedGroups = qualification?.thirdPlaceGroupsProjectedToQualify || [];
  const topEightGroups = globalThirdPlaceTable.slice(0, 8).map((row) => row.group);
  const groupingRowCounts = groupings.map((grouping) => ({
    id: grouping.id,
    matchNumber: grouping.matchNumber,
    rowCount: (grouping.rows || []).length
  }));

  const agreesWithQualificationService = (
    sameOrder(
      globalThirdPlaceTable.map((row) => `${row.group}:${row.country}:${row.points}:${row.goalDifference}:${row.goalsFor}`),
      qualificationRows.map((row) => `${row.group}:${row.country}:${row.points}:${row.goalDifference}:${row.goalsFor}`)
    ) &&
    sameMembers(selectedBestThirdGroups, qualificationSelectedGroups)
  );

  const topEightMatchSelectedGroups = sameOrder(topEightGroups, selectedBestThirdGroups);
  const allGroupingCardsHaveFiveRows = groupings.length === GROUPING_CARDS.length
    && groupings.every((grouping) => (grouping.rows || []).length === 5);

  if (globalThirdPlaceTable.length !== 12) {
    errors.push(`Expected 12 global third-place rows, received ${globalThirdPlaceTable.length}.`);
  }

  if (groupings.length !== GROUPING_CARDS.length) {
    errors.push(`Expected 8 grouping cards, received ${groupings.length}.`);
  }

  groupingRowCounts
    .filter((grouping) => grouping.rowCount !== 5)
    .forEach((grouping) => {
      errors.push(`Grouping ${grouping.matchNumber} has ${grouping.rowCount} rows.`);
    });

  if (!agreesWithQualificationService) {
    errors.push('Third-place watch does not agree with qualification service ranking.');
  }

  if (!topEightMatchSelectedGroups) {
    errors.push('Top eight global third-place groups do not match selectedBestThirdGroups.');
  }

  const bracketErrors = [];
  let leaderUsedAsAssignment = false;
  let mappedTeamsAgreeWithBracket = true;

  groupings.forEach((grouping) => {
    const leaderSource = grouping.currentGroupingLeader?.source || null;

    if (grouping.annexCMappingStatus === 'mapped') {
      const selectedGroup = sourceGroup(grouping.annexeCMappedSource);

      if (!selectedBestThirdGroups.includes(selectedGroup)) {
        bracketErrors.push(`Grouping ${grouping.matchNumber} maps ${grouping.annexeCMappedSource}, which is not selected.`);
      }

      const bracketSlot = getBracketThirdPlaceSlot(
        bracketProjection,
        grouping.matchNumber,
        grouping.annexeCMappedSource
      );

      if (!bracketSlot || bracketSlot.source !== grouping.annexeCMappedSource) {
        mappedTeamsAgreeWithBracket = false;
        bracketErrors.push(`Grouping ${grouping.matchNumber} does not match the bracket slot source.`);
      }

      if (bracketSlot?.team?.country !== grouping.annexeCMappedTeam?.country) {
        mappedTeamsAgreeWithBracket = false;
        bracketErrors.push(`Grouping ${grouping.matchNumber} mapped team does not match bracket projection.`);
      }

      if (leaderSource && leaderSource !== grouping.annexeCMappedSource && bracketSlot?.source === leaderSource) {
        leaderUsedAsAssignment = true;
        bracketErrors.push(`Grouping ${grouping.matchNumber} uses the grouping leader as bracket assignment.`);
      }
    } else if (
      grouping.annexeCMappedSource ||
      grouping.annexeCMappedTeam ||
      (grouping.rows || []).some((row) => row.isAnnexeCMappedTeam)
    ) {
      bracketErrors.push(`Grouping ${grouping.matchNumber} marks an official slot team while mapping is missing.`);
    }
  });

  errors.push(...bracketErrors);

  const agreesWithBracketProjection = bracketErrors.length === 0 && !leaderUsedAsAssignment && mappedTeamsAgreeWithBracket;
  const serialisedPayload = JSON.stringify(watch || {}).toLowerCase();
  const frontendSafePayload = Boolean(watch)
    && globalThirdPlaceTable.length === 12
    && groupings.length === GROUPING_CARDS.length
    && !serialisedPayload.includes('api_football_key')
    && !serialisedPayload.includes('x-apisports-key')
    && !serialisedPayload.includes('authorization');

  return {
    generatedAt,
    passed: errors.length === 0,
    errors,
    warnings,
    globalThirdPlaceCount: globalThirdPlaceTable.length,
    groupingCount: groupings.length,
    groupingRowCounts,
    selectedBestThirdGroups,
    annexCKey: watch?.annexCKey || null,
    annexCMappingStatus: watch?.annexCMappingStatus || null,
    consistencyChecks: {
      agreesWithQualificationService,
      agreesWithBracketProjection,
      topEightMatchSelectedGroups,
      allGroupingCardsHaveFiveRows,
      frontendSafePayload
    }
  };
}

module.exports = {
  ANNEX_C_PENDING_WARNING,
  DISPLAY_FALLBACK_WARNING,
  GROUPING_CARDS,
  GROUPING_NOTE,
  buildThirdPlaceWatch,
  buildThirdPlaceWatchDebug
};
