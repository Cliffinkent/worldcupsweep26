const OWNER_STORAGE_KEY = 'sw26.owner';
const BRACKET_VIEW_MODE_STORAGE_KEY = 'bracketViewMode';
const BRACKET_COLLAPSE_STORAGE_KEY = 'bracketCollapseEmpty';
const LIVE_FIXTURE_REFRESH_MS = 60 * 1000;

const state = {
  data: null,
  screen: 'leaderboard',
  openOwner: null,
  filterOwner: null,
  bracketViewMode: 'compact',
  bracketCollapseEmpty: false,
  bracketExpandedMatches: new Set(),
  teamIndex: null,
  teamIndexFor: null,
  fixtureStats: null,
  fixtureStatsFor: null
};

try {
  state.filterOwner = localStorage.getItem(OWNER_STORAGE_KEY) || null;
} catch (error) {
  state.filterOwner = null;
}

try {
  const storedViewMode = localStorage.getItem(BRACKET_VIEW_MODE_STORAGE_KEY);
  const storedCollapseEmpty = localStorage.getItem(BRACKET_COLLAPSE_STORAGE_KEY);

  if (['full', 'compact'].includes(storedViewMode)) {
    state.bracketViewMode = storedViewMode;
  }

  state.bracketCollapseEmpty = storedCollapseEmpty === 'true';
} catch (error) {
  state.bracketViewMode = 'compact';
  state.bracketCollapseEmpty = false;
}

const elements = {
  screen: document.querySelector('#screen'),
  tabs: document.querySelector('#tabs'),
  ownerFilter: document.querySelector('#owner-filter'),
  refreshButton: document.querySelector('#refresh-button'),
  liveIndicator: document.querySelector('#live-indicator'),
  liveCount: document.querySelector('#live-count'),
  lastUpdated: document.querySelector('#last-updated'),
  providerStatus: document.querySelector('#provider-status')
};

const fixtureAutoRefresh = {
  timerId: null,
  inFlight: false
};

let fixtureJumpMessageTimer = null;
let fixtureJumpHighlightTimer = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function gd(value) {
  const n = Number(value) || 0;
  return n >= 0 ? `+${n}` : `${n}`;
}

function formatDate(value) {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function formatDayLabel(value) {
  if (!value || value === 'unscheduled') {
    return 'Date TBC';
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long'
  }).format(date);
}

function formatKickOffTime(value) {
  if (!value) {
    return 'TBC';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'TBC';
  }

  return `${new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/London'
  }).format(date)} BST`;
}

function normaliseFixtureStatus(status) {
  if (['scheduled', 'live', 'finished', 'unavailable', 'unknown'].includes(status)) {
    return status;
  }

  return 'unknown';
}

const KNOCKOUT_ROUNDS = new Set([
  'Round of 32',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  'Third-place play-off',
  'Final'
]);

function isKnockoutFixture(match) {
  return KNOCKOUT_ROUNDS.has(match?.round);
}

function fixtureDateValue(match, fallbackDate) {
  return match?.utcDate || match?.date || fallbackDate || '';
}

function fixtureCalendarDateValue(match, fallbackDate) {
  return match?.date || fallbackDate || '';
}

function fixtureIdentifier(match, fallbackDate) {
  return match?.id || [
    fixtureDateValue(match, fallbackDate),
    match?.round,
    match?.homeTeam,
    match?.awayTeam
  ].filter(Boolean).join('|');
}

function parseFixtureDate(value) {
  if (!value || value === 'unscheduled') {
    return null;
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function isSameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function compareFixtureCandidatesAsc(a, b) {
  return a.date.getTime() - b.date.getTime() || a.index - b.index;
}

function compareFixtureCandidatesDesc(a, b) {
  return b.date.getTime() - a.date.getTime() || b.index - a.index;
}

function normaliseTeamName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getTeamIndex() {
  if (!state.data) {
    return { byId: new Map(), byName: new Map() };
  }

  if (state.teamIndex && state.teamIndexFor === state.data) {
    return state.teamIndex;
  }

  const byId = new Map();
  const byName = new Map();

  (state.data.teams || []).forEach((team) => {
    byId.set(team.id, team);
    [team.country, team.fifaName, ...(team.aliases || [])].forEach((name) => {
      byName.set(normaliseTeamName(name), team);
    });
  });

  state.teamIndex = { byId, byName };
  state.teamIndexFor = state.data;
  return state.teamIndex;
}

function resolveIso(team) {
  if (!team) {
    return null;
  }

  if (team.iso) {
    return team.iso;
  }

  const { byId, byName } = getTeamIndex();
  const id = team.id || team.teamId;

  if (id && byId.has(id)) {
    return byId.get(id).iso;
  }

  const name = team.country || team.name;

  if (name) {
    const match = byName.get(normaliseTeamName(name));

    if (match) {
      return match.iso;
    }
  }

  return null;
}

function renderFlag(team, size = 20) {
  const iso = resolveIso(team);

  if (!iso) {
    return '';
  }

  const width = size;
  const height = Math.round(size * 0.75);
  const alt = `${team.country || team.name || 'Team'} flag`;

  return `<img class="flag" src="/assets/flags-iso/${escapeHtml(iso)}.svg" width="${width}" height="${height}" alt="${escapeHtml(alt)}" loading="lazy">`;
}

function renderBroadcast(broadcast) {
  if (!broadcast) {
    return '';
  }

  const name = broadcast.name || broadcast.channel || 'TV TBC';
  const logo = broadcast.logo
    ? `<img class="sw-broadcast__logo" src="${escapeHtml(broadcast.logo)}" alt="" width="42" height="16" loading="lazy">`
    : '';

  return `<span class="sw-broadcast sw-broadcast--${escapeHtml(broadcast.id || 'tbc')}" title="${escapeHtml(broadcast.channel || name)}">${logo}<span class="sw-broadcast__name">${escapeHtml(name)}</span></span>`;
}

function getFixtureTeam(apiName) {
  if (apiName && typeof apiName === 'object') {
    return {
      id: apiName.id || apiName.teamId || null,
      name: apiName.country || apiName.name || 'TBC',
      country: apiName.country || apiName.name || 'TBC',
      iso: apiName.iso || resolveIso(apiName),
      owner: apiName.owner || '',
      unresolvedTie: Boolean(apiName.unresolvedTie)
    };
  }

  const { byName } = getTeamIndex();
  const team = byName.get(normaliseTeamName(apiName));

  return {
    id: team?.id || null,
    name: team?.country || apiName || 'TBC',
    country: team?.country || apiName || 'TBC',
    iso: team?.iso || null,
    owner: team?.owner || ''
  };
}

function fixturePenaltyResult(match, home, away) {
  if (!isKnockoutFixture(match) || normaliseFixtureStatus(match.status) !== 'finished') {
    return null;
  }

  const homePenaltyScore = Number(match.homePenaltyScore);
  const awayPenaltyScore = Number(match.awayPenaltyScore);

  if (!Number.isFinite(homePenaltyScore) || !Number.isFinite(awayPenaltyScore)) {
    return null;
  }

  const rawStatus = String(match.rawStatus || '').toUpperCase();
  const homeScore = Number(match.homeScore);
  const awayScore = Number(match.awayScore);
  const decidedOnPenalties = rawStatus === 'PEN'
    || (Number.isFinite(homeScore)
      && Number.isFinite(awayScore)
      && homeScore === awayScore
      && homePenaltyScore !== awayPenaltyScore);

  if (!decidedOnPenalties) {
    return null;
  }

  let winner = null;
  let winnerScore = null;
  let loserScore = null;

  if (homePenaltyScore > awayPenaltyScore) {
    winner = home;
    winnerScore = homePenaltyScore;
    loserScore = awayPenaltyScore;
  } else if (awayPenaltyScore > homePenaltyScore) {
    winner = away;
    winnerScore = awayPenaltyScore;
    loserScore = homePenaltyScore;
  } else if (match.winner) {
    winner = getFixtureTeam(match.winner);
    winnerScore = homePenaltyScore;
    loserScore = awayPenaltyScore;
  }

  if (!winner?.country || winnerScore === null || loserScore === null) {
    return null;
  }

  return {
    winner: winner.country,
    winnerScore,
    loserScore
  };
}

function renderFixturePenaltyNote(match, home, away) {
  const result = fixturePenaltyResult(match, home, away);

  if (!result) {
    return '';
  }

  return `<p class="sw-fix__result-note">${escapeHtml(result.winner)} wins ${result.winnerScore}<i>–</i>${result.loserScore} on penalties</p>`;
}

function fixtureDecidedInExtraTime(match) {
  if (!isKnockoutFixture(match) || normaliseFixtureStatus(match.status) !== 'finished') {
    return false;
  }

  return String(match.rawStatus || '').toUpperCase() === 'AET';
}

function renderFixtureExtraTimeNote(match) {
  if (!fixtureDecidedInExtraTime(match)) {
    return '';
  }

  return '<p class="sw-fix__result-note">A.E.T</p>';
}

function renderFixtureResultNote(match, home, away) {
  return renderFixturePenaltyNote(match, home, away) || renderFixtureExtraTimeNote(match);
}

/* Single memoised pass over the fixtures tree (keyed on the loaded payload)
   produces the live-match count. Team status comes from the backend payload. */
function getFixtureStats() {
  if (state.fixtureStats && state.fixtureStatsFor === state.data) {
    return state.fixtureStats;
  }

  let liveCount = 0;

  (state.data?.fixtures || []).forEach((day) => {
    (day.matches || []).forEach((match) => {
      if (isFixtureLiveSectionEligible(match)) {
        liveCount += 1;
      }
    });
  });

  state.fixtureStats = { liveCount };
  state.fixtureStatsFor = state.data;
  return state.fixtureStats;
}

function getLiveCount() {
  return getFixtureStats().liveCount;
}

function numericSummaryValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function getTeamStatusOverview() {
  const fallbackTotal = (state.data?.teams || []).length;
  const summary = state.data?.teamStatusSummary || {};
  const totalTeams = numericSummaryValue(summary.totalTeams) ?? fallbackTotal;
  const teamsInPlay = numericSummaryValue(summary.teamsInPlay) ?? totalTeams;

  return {
    totalTeams,
    teamsInPlay
  };
}

function ownsTeam(team) {
  return Boolean(state.filterOwner) && team && team.owner === state.filterOwner;
}

function matchInvolvesOwner(match) {
  if (!state.filterOwner) {
    return true;
  }

  return getFixtureTeam(match.homeTeam).owner === state.filterOwner
    || getFixtureTeam(match.awayTeam).owner === state.filterOwner;
}

function isFixtureLiveSectionEligible(match) {
  return match?.isLiveSectionEligible === true;
}

/* ---------- Primitives (vanilla ports of the design-system components) ---------- */

const AVATAR_PALETTE_SIZE = 6;

function hashName(name) {
  let hash = 0;
  const value = String(name || '');

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }

  return Math.abs(hash);
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatar(name, size = 'md') {
  const colour = hashName(name) % AVATAR_PALETTE_SIZE;
  return `<span class="sw26-avatar sw26-avatar--${size} sw26-avatar--c${colour}" title="${escapeHtml(name)}">${escapeHtml(initials(name))}</span>`;
}

const PILL_WITH_DOT = new Set(['live', 'alive']);

function statusPill(tone, label, dot) {
  const showDot = dot === undefined ? PILL_WITH_DOT.has(tone) : dot;
  const dotHtml = showDot ? '<span class="sw26-pill__dot"></span>' : '';
  return `<span class="sw26-pill sw26-pill--${tone}">${dotHtml}${escapeHtml(label ?? '')}</span>`;
}

function teamChip({ country, flag, owner, status, size }) {
  const cls = [
    'sw26-team',
    size === 'lg' ? 'sw26-team--lg' : '',
    status === 'out' ? 'sw26-team--out' : ''
  ].filter(Boolean).join(' ');

  const tag = status === 'alive'
    ? '<span class="sw26-team__tag sw26-team__tag--alive">In</span>'
    : status === 'out'
      ? '<span class="sw26-team__tag sw26-team__tag--out">Out</span>'
      : '';

  const flagHtml = flag ? `<span class="sw26-team__flag">${flag}</span>` : '';
  const ownerHtml = owner ? `<span class="sw26-team__owner"><b>${escapeHtml(owner)}</b></span>` : '';

  return `<span class="${cls}">${flagHtml}<span class="sw26-team__body"><span class="sw26-team__name">${escapeHtml(country)}</span>${ownerHtml}</span>${tag}</span>`;
}

function statCard({ value, label, hint, variant }) {
  const cls = `sw26-stat sw26-stat--${variant || 'default'}`;
  const hintHtml = hint ? `<span class="sw26-stat__hint">${escapeHtml(hint)}</span>` : '';
  return `<div class="${cls}"><span class="sw26-stat__value">${escapeHtml(String(value))}</span><span class="sw26-stat__label">${escapeHtml(label)}</span>${hintHtml}</div>`;
}

function sectionHead(title, meta) {
  return `<div class="sw-sectionhead"><h2 class="sw-h2">${escapeHtml(title)}</h2><span class="sw-sectionhead__meta">${escapeHtml(meta)}</span></div>`;
}

/* ---------- Screens ---------- */

function ownerHero(player, rank) {
  const teams = player.teams || player.assignedTeams || [];
  const flags = teams.map((team) => renderFlag(team, 24)).join('');

  return `<div class="sw-hero">
    <div class="sw-hero__top">
      ${avatar(player.owner, 'lg')}
      <div class="sw-hero__id"><span class="sw-hero__hi">${escapeHtml(player.owner)}</span><span class="sw-hero__sub">Your sweepstake</span></div>
      <div class="sw-hero__rank"><b>${rank}</b><i>rank</i></div>
    </div>
    <div class="sw-hero__stats">
      <div class="sw-hero__stat"><b>${player.totalGroupPoints}</b><span>Points</span></div>
      <div class="sw-hero__stat"><b>${player.teamsStillAlive}</b><span>Still in</span></div>
      <div class="sw-hero__stat"><b>${teams.length}</b><span>Teams</span></div>
    </div>
    <div class="sw-hero__teams">${flags}</div>
  </div>`;
}

function screenLeaderboard() {
  const players = state.data.players || [];

  if (!players.length) {
    return `${sectionHead('Leaderboard', 'No players loaded yet')}<p class="empty">No data.</p>`;
  }

  const leader = players[0];
  const liveCount = getLiveCount();
  const teamStatusOverview = getTeamStatusOverview();

  const filteredIndex = state.filterOwner
    ? players.findIndex((player) => player.owner === state.filterOwner)
    : -1;
  const hero = filteredIndex >= 0 ? ownerHero(players[filteredIndex], filteredIndex + 1) : '';

  const stats = [
    statCard({ value: `${teamStatusOverview.teamsInPlay} / ${teamStatusOverview.totalTeams}`, label: 'Teams in play' }),
    statCard({ value: players.length, label: 'Players' }),
    statCard({ value: leader.totalGroupPoints, label: 'Top score', variant: 'accent', hint: `${leader.owner} leads` }),
    statCard({ value: liveCount, label: 'Live now', variant: 'ink', hint: liveCount ? 'Matches in play' : 'Nothing live' })
  ].join('');

  const board = players.map((player, index) => {
    const rank = index + 1;
    const open = player.owner === state.openOwner;
    const teams = player.teams || player.assignedTeams || [];
    const flags = teams.map((team) => renderFlag(team, 18)).join('');

    const detail = teams
      .slice()
      .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference)
      .map((team) => {
        const alive = team.status !== 'eliminated';
        return `<div class="sw-teamline">${teamChip({
          country: team.country,
          flag: renderFlag(team, 20),
          status: alive ? 'alive' : 'out'
        })}<span class="sw-teamline__grp">Grp ${escapeHtml(team.group)}</span><span class="sw-teamline__gd">${gd(team.goalDifference)}</span><span class="sw-teamline__pts">${team.points} pts</span></div>`;
      })
      .join('');

    const mine = player.owner === state.filterOwner;

    return `<div class="sw-rowcard${rank === 1 ? ' sw-rowcard--lead' : ''}${mine ? ' sw-rowcard--you' : ''}${open ? ' is-open' : ''}" data-owner="${escapeHtml(player.owner)}">
      <button class="sw-rowcard__main" type="button">
        <span class="sw-rank">${rank === 1 ? '🏆' : rank}</span>
        ${avatar(player.owner, 'md')}
        <span class="sw-rowcard__name">${escapeHtml(player.owner)}</span>
        <span class="sw-rowcard__teams">${flags}</span>
        <span class="sw-rowcard__alive">${statusPill('alive', `${player.teamsStillAlive} in`)}</span>
        <span class="sw-rowcard__pts"><b>${player.totalGroupPoints}</b><i>pts</i></span>
        <span class="sw-chev" aria-hidden="true">›</span>
      </button>
      <div class="sw-rowcard__detail">${detail}</div>
    </div>`;
  }).join('');

  return `${hero}<div class="sw-overview">${stats}</div>${sectionHead('Leaderboard', 'Group points · ties broken by teams still in')}<div class="sw-board">${board}</div>`;
}

function screenGroups() {
  const groups = state.data.groupTables || [];

  const tables = groups.map((group) => {
    const rows = group.table.map((team, index) => {
      const qualifying = index < 2;
      const mine = ownsTeam(team);
      return `<div class="sw-group__row${qualifying ? ' sw-group__row--q' : ''}${mine ? ' sw-group__row--mine' : ''}">
        <span class="sw-group__team"><span class="sw-group__pos">${index + 1}</span>${teamChip({
        country: team.country,
        flag: renderFlag(team, 20),
        owner: team.owner
      })}</span>
        <span class="sw-num">${team.played}</span>
        <span class="sw-num">${gd(team.goalDifference)}</span>
        <span class="sw-num sw-num--pts">${team.points}</span>
      </div>`;
    }).join('');

    return `<article class="sw-group">
      <header class="sw-group__head"><span class="sw-group__badge">${escapeHtml(group.group)}</span><span class="sw-group__title">Group ${escapeHtml(group.group)}</span></header>
      <div class="sw-group__rowhead"><span>Team</span><span class="sw-num">P</span><span class="sw-num">GD</span><span class="sw-num">Pts</span></div>
      ${rows}
    </article>`;
  }).join('');

  return `${sectionHead('Group stage', 'Top two qualify · highlighted')}<div class="sw-groups">${tables}</div>`;
}

function fixtureRow(match, fallbackDate) {
  const home = getFixtureTeam(match.homeTeam);
  const away = getFixtureTeam(match.awayTeam);
  const status = normaliseFixtureStatus(match.status);
  const live = isFixtureLiveSectionEligible(match);
  const finished = status === 'finished';
  const statusDetail = match.statusDetail || (
    live ? 'Live' :
      finished ? 'Finished' :
        status === 'scheduled' ? 'Scheduled' :
          status === 'unavailable' ? 'Unavailable' :
            'Unknown'
  );
  const hasScore = match.homeScore !== null && match.homeScore !== undefined
    && match.awayScore !== null && match.awayScore !== undefined;
  const fixtureDate = fixtureCalendarDateValue(match, fallbackDate);
  const fixtureUtcDate = match.utcDate || '';
  const fixtureId = fixtureIdentifier(match, fallbackDate);

  const centre = hasScore
    ? `<span class="sw-fix__score">${match.homeScore}<i>–</i>${match.awayScore}</span>`
    : '<span class="sw-fix__vs">vs</span>';

  let pill = '';
  if (live) {
    const liveLabel = Number.isFinite(match.elapsed)
      ? `${statusDetail} ${match.elapsed}'`
      : statusDetail;
    pill = statusPill('live', liveLabel);
  } else if (finished) {
    pill = statusPill('ft', statusDetail);
  } else if (status === 'scheduled') {
    pill = statusPill('scheduled', formatKickOffTime(match.utcDate));
  } else if (status === 'unavailable') {
    pill = statusPill('scheduled', statusDetail, false);
  }
  const broadcast = renderBroadcast(match.broadcast);
  const resultNote = renderFixtureResultNote(match, home, away);

  return `<div class="sw-fix${live ? ' sw-fix--live' : ''}" data-fixture-id="${escapeHtml(fixtureId)}" data-fixture-date="${escapeHtml(fixtureDate)}" data-fixture-utc-date="${escapeHtml(fixtureUtcDate)}" data-fixture-status="${escapeHtml(status)}" data-fixture-live-section-eligible="${live ? 'true' : 'false'}">
    <div class="sw-fix__side sw-fix__side--home">
      <span class="sw-fix__owner">${escapeHtml(home.owner || 'Unassigned')}</span>
      <span class="sw-fix__team">${escapeHtml(home.country)}</span>
      ${renderFlag(home, 34)}
    </div>
    <div class="sw-fix__center">${centre}${pill}${broadcast}</div>
    <div class="sw-fix__side sw-fix__side--away">
      ${renderFlag(away, 34)}
      <span class="sw-fix__team">${escapeHtml(away.country)}</span>
      <span class="sw-fix__owner">${escapeHtml(away.owner || 'Unassigned')}</span>
    </div>
    ${resultNote}
  </div>`;
}

function fixtureDaySection(day) {
  return `<section class="sw-day" data-fixture-date-section data-date="${escapeHtml(day.date || '')}">
    <h3 class="sw-day__date">${escapeHtml(formatDayLabel(day.date))}</h3>
    <div class="sw-day__list">${day.matches.map((match) => fixtureRow(match, day.date)).join('')}</div>
  </section>`;
}

function fixtureJumpControls() {
  return `<div class="sw-fixture-jump">
    <button id="fixture-jump-button" class="btn sw-fixture-jump__button" type="button" aria-label="Jump to today or next upcoming fixture">Jump To Today</button>
    <span id="fixture-jump-message" class="sw-fixture-jump__message" role="status" aria-live="polite"></span>
  </div>`;
}

function screenFixtures() {
  let days = state.data.fixtures || [];
  const meta = state.filterOwner ? `${state.filterOwner}'s matches` : 'Owners shown above each nation';

  if (state.filterOwner) {
    days = days
      .map((day) => ({ date: day.date, matches: day.matches.filter(matchInvolvesOwner) }))
      .filter((day) => day.matches.length);
  }

  if (!days.length) {
    const empty = state.filterOwner ? `No matches for ${escapeHtml(state.filterOwner)}.` : 'No fixtures loaded yet.';
    return `${sectionHead('Fixtures', meta)}${fixtureJumpControls()}<p class="empty">${empty}</p>`;
  }

  const liveMatches = days.flatMap((day) => day.matches
    .filter(isFixtureLiveSectionEligible)
    .map((match) => ({ match, fallbackDate: day.date })));

  const liveNow = liveMatches.length
    ? `<section class="sw-live-now" aria-label="Live now">
      <div class="sw-live-now__head">
        <h3 class="sw-live-now__title">Live now</h3>
        <span class="sw-live-now__count">${liveMatches.length} ${liveMatches.length === 1 ? 'match' : 'matches'} in play</span>
      </div>
      <div class="sw-day__list">${liveMatches.map(({ match, fallbackDate }) => fixtureRow(match, fallbackDate)).join('')}</div>
    </section>`
    : '';

  const list = days.map(fixtureDaySection).join('');

  return `${sectionHead('Fixtures', meta)}${fixtureJumpControls()}${liveNow}${list}`;
}

function renderedFixtureCandidates() {
  return Array.from(elements.screen.querySelectorAll('.sw-fix[data-fixture-status]'))
    .map((element, index) => {
      const date = parseFixtureDate(element.dataset.fixtureUtcDate || element.dataset.fixtureDate);

      if (!date) {
        return null;
      }

      return {
        element,
        index,
        date,
        status: normaliseFixtureStatus(element.dataset.fixtureStatus),
        liveSectionEligible: element.dataset.fixtureLiveSectionEligible === 'true'
      };
    })
    .filter(Boolean);
}

function selectFixtureCandidate(candidates) {
  const today = new Date();
  const tomorrowStart = addDays(startOfLocalDay(today), 1);
  const liveToday = candidates
    .filter((candidate) => candidate.liveSectionEligible && isSameLocalDay(candidate.date, today))
    .sort(compareFixtureCandidatesAsc)[0];

  if (liveToday) {
    return liveToday;
  }

  const scheduledToday = candidates
    .filter((candidate) => candidate.status === 'scheduled' && isSameLocalDay(candidate.date, today))
    .sort(compareFixtureCandidatesAsc)[0];

  if (scheduledToday) {
    return scheduledToday;
  }

  const nextScheduled = candidates
    .filter((candidate) => candidate.status === 'scheduled' && candidate.date >= tomorrowStart)
    .sort(compareFixtureCandidatesAsc)[0];

  if (nextScheduled) {
    return nextScheduled;
  }

  return candidates
    .filter((candidate) => candidate.status === 'finished')
    .sort(compareFixtureCandidatesDesc)[0] || null;
}

function renderedDateSectionCandidates() {
  return Array.from(elements.screen.querySelectorAll('[data-fixture-date-section]'))
    .map((element, index) => {
      const date = parseFixtureDate(element.dataset.date);

      if (!date) {
        return null;
      }

      return { element, index, date };
    })
    .filter(Boolean);
}

function selectDateSectionCandidate(candidates) {
  const today = new Date();
  const tomorrowStart = addDays(startOfLocalDay(today), 1);
  const todaySection = candidates
    .filter((candidate) => isSameLocalDay(candidate.date, today))
    .sort(compareFixtureCandidatesAsc)[0];

  if (todaySection) {
    return todaySection;
  }

  const nextSection = candidates
    .filter((candidate) => candidate.date >= tomorrowStart)
    .sort(compareFixtureCandidatesAsc)[0];

  if (nextSection) {
    return nextSection;
  }

  return candidates.sort(compareFixtureCandidatesDesc)[0] || null;
}

function setFixtureJumpMessage(message) {
  const messageElement = elements.screen.querySelector('#fixture-jump-message');

  if (!messageElement) {
    return;
  }

  if (fixtureJumpMessageTimer !== null) {
    window.clearTimeout(fixtureJumpMessageTimer);
    fixtureJumpMessageTimer = null;
  }

  messageElement.textContent = message;

  if (message) {
    fixtureJumpMessageTimer = window.setTimeout(() => {
      if (messageElement.isConnected) {
        messageElement.textContent = '';
      }
      fixtureJumpMessageTimer = null;
    }, 2200);
  }
}

function highlightFixtureJumpTarget(element) {
  elements.screen.querySelectorAll('.sw-jump-highlight').forEach((target) => {
    target.classList.remove('sw-jump-highlight');
  });

  if (fixtureJumpHighlightTimer !== null) {
    window.clearTimeout(fixtureJumpHighlightTimer);
    fixtureJumpHighlightTimer = null;
  }

  element.classList.add('sw-jump-highlight');
  fixtureJumpHighlightTimer = window.setTimeout(() => {
    if (element.isConnected) {
      element.classList.remove('sw-jump-highlight');
    }
    fixtureJumpHighlightTimer = null;
  }, 2000);
}

function jumpToRelevantFixture() {
  const fixtureTarget = selectFixtureCandidate(renderedFixtureCandidates());
  const dateSectionTarget = fixtureTarget ? null : selectDateSectionCandidate(renderedDateSectionCandidates());
  const target = fixtureTarget?.element || dateSectionTarget?.element || null;

  if (!target) {
    setFixtureJumpMessage('No fixtures available yet.');
    return;
  }

  setFixtureJumpMessage('');
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  highlightFixtureJumpTarget(target);
}

function normaliseBracketSlot(slotOrName, placeholder) {
  if (slotOrName && typeof slotOrName === 'object' && ('team' in slotOrName || 'label' in slotOrName)) {
    return slotOrName;
  }

  return {
    label: placeholder || 'To be confirmed',
    placeholder: placeholder || 'To be confirmed',
    team: slotOrName ? getFixtureTeam(slotOrName) : null,
    projectionType: null,
    resultState: slotOrName ? 'projected' : 'placeholder',
    unresolvedTie: false,
    isWinner: false,
    isLoser: false,
    isEliminated: false,
    resolvedFromMatch: null
  };
}

function bracketMatchFixture(match) {
  return match?.fixture || null;
}

function bracketMatchHasScore(fixture) {
  return Boolean(fixture)
    && fixture.homeScore !== null && fixture.homeScore !== undefined
    && fixture.awayScore !== null && fixture.awayScore !== undefined;
}

function isBracketMatchLive(match) {
  const fixture = bracketMatchFixture(match);

  if (fixture?.isLiveSectionEligible === true || fixture?.status === 'live') {
    return true;
  }

  return normaliseFixtureStatus(match?.status) === 'live';
}

function bracketMatchShowsScore(match) {
  const fixture = bracketMatchFixture(match);

  if (!bracketMatchHasScore(fixture)) {
    return false;
  }

  const status = normaliseFixtureStatus(fixture?.status || match?.status);
  return status === 'live' || status === 'finished';
}

function bracketLiveLabel(match) {
  const fixture = bracketMatchFixture(match);
  const statusDetail = fixture?.statusDetail || 'Live';

  if (Number.isFinite(fixture?.elapsed)) {
    return `${statusDetail} ${fixture.elapsed}'`;
  }

  return statusDetail;
}

function hasLiveBracketMatches() {
  return (state.data?.bracket || []).some((round) => (
    (round.matches || []).some(isBracketMatchLive)
  ));
}

function bracketSlotTeam(slot) {
  return slot?.team ? getFixtureTeam(slot.team) : null;
}

function bracketSlotLabel(slot, fallback) {
  return slot?.placeholder || slot?.label || fallback || 'To be confirmed';
}

function compactBracketPathLabel(label) {
  const text = String(label || 'TBC').trim();
  const matchPath = text.match(/^(Winner|Loser) Match (\d+)$/i);

  if (matchPath) {
    return `${matchPath[1].slice(0, 1).toUpperCase()}${matchPath[2]}`;
  }

  const winnerGroup = text.match(/^Winner Group ([A-L])$/i);

  if (winnerGroup) {
    return `1${winnerGroup[1].toUpperCase()}`;
  }

  const runnerUpGroup = text.match(/^Runner-up Group ([A-L])$/i);

  if (runnerUpGroup) {
    return `2${runnerUpGroup[1].toUpperCase()}`;
  }

  const thirdPlaceGroup = text.match(/^Third-place Group ([A-L])$/i);

  if (thirdPlaceGroup) {
    return `3${thirdPlaceGroup[1].toUpperCase()}`;
  }

  if (/pending third-place mapping/i.test(text)) {
    return 'Pending mapping';
  }

  return text;
}

function bracketEmptyPath(slotA, slotB, homePlaceholder, awayPlaceholder) {
  const left = compactBracketPathLabel(bracketSlotLabel(slotA, homePlaceholder));
  const right = compactBracketPathLabel(bracketSlotLabel(slotB, awayPlaceholder));
  return `${left} vs ${right}`;
}

function bracketTieSide(slotOrName, placeholder, { score = null, showScore = false } = {}) {
  const slot = normaliseBracketSlot(slotOrName, placeholder);
  const team = bracketSlotTeam(slot);
  const label = bracketSlotLabel(slot, placeholder);
  const scoreHtml = showScore && score !== null && score !== undefined
    ? `<span class="sw-tie__score" aria-hidden="true">${score}</span>`
    : '';
  const scoreLabel = showScore && score !== null && score !== undefined
    ? `, score ${score}`
    : '';

  if (!team) {
    return `<div class="bracket-slot bracket-slot--placeholder sw-tie__team sw-tie__team--tbc" title="${escapeHtml(label)}">${escapeHtml(label)}</div>`;
  }

  const tieBreakIsLockedIn = (
    slot.resultState === 'confirmed_winner' ||
    slot.resultState === 'confirmed_loser' ||
    slot.isWinner ||
    slot.isLoser ||
    slot.isEliminated ||
    slot.projectionType === 'confirmed'
  );
  const unresolved = !tieBreakIsLockedIn && (slot.unresolvedTie || team.unresolvedTie)
    ? '<span class="sw-tie__tag sw-tie__tag--warn">Tie-break unresolved</span>'
    : '';
  const resultTag = slot.isEliminated
    ? '<span class="sw-tie__tag sw-tie__tag--lost">Eliminated</span>'
    : slot.resultState === 'confirmed_winner'
      ? '<span class="sw-tie__tag sw-tie__tag--advanced">Advanced</span>'
      : '';
  const slotClasses = [
    'bracket-slot',
    'bracket-slot--team',
    'sw-tie__team',
    slot.isWinner ? 'bracket-slot--winner' : '',
    slot.isLoser ? 'bracket-slot--loser' : '',
    slot.isEliminated ? 'bracket-slot--eliminated' : '',
    slot.resultState === 'confirmed_winner' ? 'bracket-slot--advanced' : ''
  ].filter(Boolean).join(' ');
  const stateText = slot.isEliminated
    ? ', eliminated'
    : slot.resultState === 'confirmed_winner'
      ? ', advanced'
      : '';

  return `<div class="${slotClasses}" aria-label="${escapeHtml(`${team.country}${team.owner ? `, ${team.owner}` : ''}${stateText}${scoreLabel}`)}">${renderFlag(team, 22)}<span class="sw-tie__main"><span class="sw-tie__line"><span class="sw-tie__name" title="${escapeHtml(team.country)}">${escapeHtml(team.country)}</span>${scoreHtml}</span><span class="sw-tie__owner">${escapeHtml(team.owner || '')}</span>${unresolved}${resultTag}</span></div>`;
}

const BRACKET_WINGS = {
  left: [
    { round: 'Round of 32', matches: [73, 75, 74, 77, 83, 84, 81, 82] },
    { round: 'Round of 16', matches: [89, 90, 93, 94] },
    { round: 'Quarter-finals', matches: [97, 98] },
    { round: 'Semi-finals', matches: [101] }
  ],
  right: [
    { round: 'Semi-finals', matches: [102] },
    { round: 'Quarter-finals', matches: [99, 100] },
    { round: 'Round of 16', matches: [91, 92, 95, 96] },
    { round: 'Round of 32', matches: [76, 78, 79, 80, 86, 88, 85, 87] }
  ]
};

function bracketMatchKey(match) {
  return String(match.matchNumber || match.id || `${match.homePlaceholder || ''}:${match.awayPlaceholder || ''}`);
}

function bracketMatch(match, side = '') {
  const slotA = match.slotA || {
    label: match.homePlaceholder,
    placeholder: match.homePlaceholder,
    team: match.homeTeam
  };
  const slotB = match.slotB || {
    label: match.awayPlaceholder,
    placeholder: match.awayPlaceholder,
    team: match.awayTeam
  };
  const teamA = bracketSlotTeam(slotA);
  const teamB = bracketSlotTeam(slotB);
  const tbc = !teamA && !teamB;
  const mine = Boolean(state.filterOwner) && (
    teamA?.owner === state.filterOwner || teamB?.owner === state.filterOwner
  );
  const fixture = bracketMatchFixture(match);
  const live = isBracketMatchLive(match);
  const showScore = bracketMatchShowsScore(match);
  const number = match.matchNumber ? `<span class="sw-tie__number">M${match.matchNumber}</span>` : '';
  const liveBadge = live
    ? `<div class="sw-tie__status">${statusPill('live', bracketLiveLabel(match))}</div>`
    : '';
  const matchKey = bracketMatchKey(match);
  const pathText = bracketEmptyPath(slotA, slotB, match.homePlaceholder, match.awayPlaceholder);
  const collapsed = state.bracketCollapseEmpty && tbc && !state.bracketExpandedMatches.has(matchKey);
  const sideClass = side ? ` sw-tie--${side}` : '';
  const cardClasses = [
    'bracket-card',
    'sw-tie',
    sideClass.trim(),
    tbc ? 'bracket-card--empty sw-tie--tbc' : '',
    live ? 'sw-tie--live' : '',
    mine ? 'sw-tie--mine' : ''
  ].filter(Boolean).join(' ');

  if (collapsed) {
    return `<button class="${cardClasses} bracket-card--collapsed" type="button" data-bracket-empty-toggle="${escapeHtml(matchKey)}" aria-expanded="false" aria-label="Expand match ${escapeHtml(match.matchNumber ? `M${match.matchNumber}` : pathText)}">
      <span class="bracket-card__collapsed-number">${escapeHtml(match.matchNumber ? `M${match.matchNumber}` : 'Match')}</span>
      <span class="bracket-card__collapsed-path">${escapeHtml(pathText)}</span>
    </button>`;
  }

  const interactive = state.bracketCollapseEmpty && tbc;
  const interactiveAttributes = interactive
    ? ` role="button" tabindex="0" data-bracket-empty-toggle="${escapeHtml(matchKey)}" aria-expanded="true" aria-label="Collapse match ${escapeHtml(match.matchNumber ? `M${match.matchNumber}` : pathText)}"`
    : '';

  return `<div class="${cardClasses}${interactive ? ' bracket-card--expanded-empty' : ''}"${interactiveAttributes}>
    ${number}
    ${liveBadge}
    ${bracketTieSide(slotA, match.homePlaceholder, { score: fixture?.homeScore, showScore })}
    ${bracketTieSide(slotB, match.awayPlaceholder, { score: fixture?.awayScore, showScore })}
  </div>`;
}

function buildBracketIndex(rounds) {
  return rounds.reduce((index, round) => {
    (round.matches || []).forEach((match) => {
      if (match.matchNumber) {
        index.set(match.matchNumber, match);
      }
    });
    return index;
  }, new Map());
}

function bracketRoundColumn(stage, matchesByNumber, side) {
  const ties = stage.matches
    .map((matchNumber) => matchesByNumber.get(matchNumber))
    .filter(Boolean)
    .map((match) => bracketMatch(match, side))
    .join('');

  return `<div class="sw-bracket__col sw-bracket__col--${side}">
    <div class="sw-bracket__round">${escapeHtml(stage.round)}</div>
    <div class="sw-bracket__ties sw-bracket__ties--${stage.matches.length}">${ties}</div>
  </div>`;
}

function bracketProjectionNotice() {
  switch (state.data?.projectionStatus) {
    case 'confirmed':
      return 'Bracket confirmed.';
    case 'partial_group_data':
      return 'Bracket projection shown as it stands. Some groups have played fewer matches.';
    case 'no_group_data':
      return 'Bracket projection shown as it stands. Slots will fill once group data is available.';
    default:
      return 'Bracket projection shown as it stands. Slots update after each match.';
  }
}

function bracketToolbar() {
  const full = state.bracketViewMode === 'full';
  const compact = state.bracketViewMode === 'compact';
  const collapse = state.bracketCollapseEmpty;

  return `<div class="bracket-toolbar" role="toolbar" aria-label="Bracket view">
    <button class="bracket-toolbar__button${full ? ' is-active' : ''}" type="button" data-bracket-view-mode="full" aria-pressed="${full ? 'true' : 'false'}">Full view</button>
    <button class="bracket-toolbar__button${compact ? ' is-active' : ''}" type="button" data-bracket-view-mode="compact" aria-pressed="${compact ? 'true' : 'false'}">Compact view</button>
    <button class="bracket-toolbar__button${collapse ? ' is-active' : ''}" type="button" data-bracket-collapse-toggle aria-pressed="${collapse ? 'true' : 'false'}">Collapse empty slots</button>
  </div>`;
}

function bracketPageHead() {
  return `<div class="bracket-page__head">
    ${sectionHead('Knockout bracket', 'Official match path · slots fill as the group stage finishes')}
    <p class="bracket-projection-notice">${escapeHtml(bracketProjectionNotice())}</p>
    ${bracketToolbar()}
  </div>`;
}

function screenBracket() {
  const rounds = state.data.bracket || [];
  const matchesByNumber = buildBracketIndex(rounds);
  const finalMatch = matchesByNumber.get(104);
  const thirdPlaceMatch = matchesByNumber.get(103);

  const left = BRACKET_WINGS.left
    .map((stage) => bracketRoundColumn(stage, matchesByNumber, 'left'))
    .join('');
  const right = BRACKET_WINGS.right
    .map((stage) => bracketRoundColumn(stage, matchesByNumber, 'right'))
    .join('');
  const centre = `<div class="sw-bracket__finals">
    <div class="sw-bracket__round">Final</div>
    ${finalMatch ? bracketMatch(finalMatch, 'final') : ''}
    <div class="sw-bracket__round sw-bracket__round--minor">Third place</div>
    ${thirdPlaceMatch ? bracketMatch(thirdPlaceMatch, 'final') : ''}
  </div>`;

  const boardClasses = [
    'bracket-board',
    'sw-bracket',
    state.bracketViewMode === 'compact' ? 'bracket-board--compact' : 'bracket-board--full',
    state.bracketCollapseEmpty ? 'bracket-board--collapse-empty' : ''
  ].filter(Boolean).join(' ');

  return `<section class="bracket-page">${bracketPageHead()}<div class="${boardClasses}"><div class="sw-bracket__wing">${left}</div>${centre}<div class="sw-bracket__wing sw-bracket__wing--right">${right}</div></div></section>`;
}

const SCREENS = {
  leaderboard: screenLeaderboard,
  groups: screenGroups,
  fixtures: screenFixtures,
  bracket: screenBracket
};

/* ---------- Shell ---------- */

function updateLive() {
  const count = getLiveCount();

  if (count > 0) {
    elements.liveCount.textContent = `${count} live now`;
    elements.liveIndicator.hidden = false;
  } else {
    elements.liveIndicator.hidden = true;
  }
}

function updateFooter(data) {
  elements.lastUpdated.textContent = formatDate(data.generatedAt || data.refreshedAt);

  const provider = data.providerStatus;
  elements.providerStatus.textContent = provider ? provider.providerStatus : 'unknown';
}

function populateOwnerFilter() {
  const owners = Array.from(new Set((state.data.players || []).map((player) => player.owner)))
    .sort((a, b) => a.localeCompare(b));

  if (state.filterOwner && !owners.includes(state.filterOwner)) {
    state.filterOwner = null;
  }

  const options = ['<option value="">All players</option>']
    .concat(owners.map((owner) => `<option value="${escapeHtml(owner)}"${owner === state.filterOwner ? ' selected' : ''}>${escapeHtml(owner)}</option>`));

  elements.ownerFilter.innerHTML = options.join('');
}

function renderScreen(options = {}) {
  const { preserveScroll = false } = options;
  const scrollTop = preserveScroll ? elements.screen.scrollTop : 0;
  const build = SCREENS[state.screen] || screenLeaderboard;
  elements.screen.innerHTML = build();
  elements.screen.scrollTop = preserveScroll
    ? Math.min(scrollTop, Math.max(0, elements.screen.scrollHeight - elements.screen.clientHeight))
    : 0;

  elements.tabs.querySelectorAll('.tab').forEach((button) => {
    button.classList.toggle('tab--on', button.dataset.screen === state.screen);
  });
}

function persistBracketPreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    /* localStorage unavailable - bracket controls still work for the session */
  }
}

function setBracketViewMode(mode) {
  if (!['full', 'compact'].includes(mode) || state.bracketViewMode === mode) {
    return;
  }

  state.bracketViewMode = mode;
  persistBracketPreference(BRACKET_VIEW_MODE_STORAGE_KEY, mode);
  renderScreen({ preserveScroll: true });
}

function setBracketCollapseEmpty(collapse) {
  if (state.bracketCollapseEmpty === collapse) {
    return;
  }

  state.bracketCollapseEmpty = collapse;

  if (!collapse) {
    state.bracketExpandedMatches.clear();
  }

  persistBracketPreference(BRACKET_COLLAPSE_STORAGE_KEY, collapse ? 'true' : 'false');
  renderScreen({ preserveScroll: true });
}

function toggleBracketEmptyMatch(matchKey) {
  if (!matchKey) {
    return;
  }

  if (state.bracketExpandedMatches.has(matchKey)) {
    state.bracketExpandedMatches.delete(matchKey);
  } else {
    state.bracketExpandedMatches.add(matchKey);
  }

  renderScreen({ preserveScroll: true });
}

function shouldAutoRefreshFixtures() {
  if (!state.data || document.hidden) {
    return false;
  }

  if (state.screen === 'fixtures') {
    return true;
  }

  if (state.screen === 'bracket') {
    return hasLiveBracketMatches();
  }

  return false;
}

function clearFixtureAutoRefresh() {
  if (fixtureAutoRefresh.timerId !== null) {
    window.clearTimeout(fixtureAutoRefresh.timerId);
    fixtureAutoRefresh.timerId = null;
  }
}

function scheduleFixtureAutoRefresh() {
  clearFixtureAutoRefresh();

  if (!shouldAutoRefreshFixtures()) {
    return;
  }

  fixtureAutoRefresh.timerId = window.setTimeout(refreshLiveFixtures, LIVE_FIXTURE_REFRESH_MS);
}

async function refreshLiveFixtures() {
  fixtureAutoRefresh.timerId = null;

  if (!shouldAutoRefreshFixtures()) {
    return;
  }

  if (fixtureAutoRefresh.inFlight) {
    scheduleFixtureAutoRefresh();
    return;
  }

  fixtureAutoRefresh.inFlight = true;

  try {
    await loadSweepstake({ preserveScroll: true });
  } catch (error) {
    elements.lastUpdated.innerHTML = `<span class="error">${escapeHtml(error.message)}</span>`;
  } finally {
    fixtureAutoRefresh.inFlight = false;
    scheduleFixtureAutoRefresh();
  }
}

function render(data, options = {}) {
  state.data = data;

  if (state.openOwner === null && data.players && data.players.length) {
    state.openOwner = data.players[0].owner;
  }

  updateLive();
  updateFooter(data);
  populateOwnerFilter();
  renderScreen(options);
  scheduleFixtureAutoRefresh();
}

async function loadSweepstake(options = {}) {
  const response = await fetch('/api/sweepstake');

  if (!response.ok) {
    throw new Error('Could not load sweepstake data');
  }

  render(await response.json(), options);
}

async function refreshSweepstake() {
  elements.refreshButton.disabled = true;
  elements.refreshButton.textContent = 'Refreshing…';

  try {
    const response = await fetch('/api/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Could not refresh fixtures');
    }

    await loadSweepstake();
  } catch (error) {
    elements.lastUpdated.innerHTML = `<span class="error">${escapeHtml(error.message)}</span>`;
  } finally {
    elements.refreshButton.disabled = false;
    elements.refreshButton.textContent = 'Refresh';
  }
}

elements.tabs.addEventListener('click', (event) => {
  const button = event.target.closest('.tab');

  if (!button || !button.dataset.screen) {
    return;
  }

  state.screen = button.dataset.screen;
  renderScreen();
  scheduleFixtureAutoRefresh();
});

elements.screen.addEventListener('click', (event) => {
  const viewModeButton = event.target.closest('[data-bracket-view-mode]');

  if (viewModeButton) {
    setBracketViewMode(viewModeButton.dataset.bracketViewMode);
    return;
  }

  const collapseButton = event.target.closest('[data-bracket-collapse-toggle]');

  if (collapseButton) {
    setBracketCollapseEmpty(!state.bracketCollapseEmpty);
    return;
  }

  const bracketEmptyToggle = event.target.closest('[data-bracket-empty-toggle]');

  if (bracketEmptyToggle) {
    toggleBracketEmptyMatch(bracketEmptyToggle.dataset.bracketEmptyToggle);
    return;
  }

  const jumpButton = event.target.closest('#fixture-jump-button');

  if (jumpButton) {
    jumpToRelevantFixture();
    return;
  }

  const main = event.target.closest('.sw-rowcard__main');

  if (!main) {
    return;
  }

  const card = main.closest('.sw-rowcard');
  const owner = card.dataset.owner;
  const willOpen = !card.classList.contains('is-open');

  elements.screen.querySelectorAll('.sw-rowcard.is-open').forEach((other) => {
    other.classList.remove('is-open');
  });

  if (willOpen) {
    card.classList.add('is-open');
    state.openOwner = owner;
  } else {
    state.openOwner = null;
  }
});

elements.screen.addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key)) {
    return;
  }

  const bracketEmptyToggle = event.target.closest('[data-bracket-empty-toggle]');

  if (!bracketEmptyToggle || bracketEmptyToggle.tagName === 'BUTTON') {
    return;
  }

  event.preventDefault();
  toggleBracketEmptyMatch(bracketEmptyToggle.dataset.bracketEmptyToggle);
});

elements.ownerFilter.addEventListener('change', (event) => {
  state.filterOwner = event.target.value || null;

  try {
    if (state.filterOwner) {
      localStorage.setItem(OWNER_STORAGE_KEY, state.filterOwner);
    } else {
      localStorage.removeItem(OWNER_STORAGE_KEY);
    }
  } catch (error) {
    /* localStorage unavailable — filter still works for the session */
  }

  renderScreen();
});

elements.refreshButton.addEventListener('click', refreshSweepstake);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearFixtureAutoRefresh();
  } else {
    scheduleFixtureAutoRefresh();
  }
});

loadSweepstake().catch((error) => {
  elements.screen.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
});
