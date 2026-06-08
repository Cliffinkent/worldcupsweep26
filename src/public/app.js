const OWNER_STORAGE_KEY = 'sw26.owner';

const state = {
  data: null,
  screen: 'leaderboard',
  openOwner: null,
  filterOwner: null,
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

const KNOCKOUT_ROUNDS = new Set([
  'Round of 32',
  'Round of 16',
  'Quarter-finals',
  'Semi-finals',
  'Third-place play-off',
  'Final'
]);

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

function getFixtureTeam(apiName) {
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

/* Single memoised pass over the fixtures tree (keyed on the loaded payload)
   produces both the eliminated-team set and the live-match count. */
function getFixtureStats() {
  if (state.fixtureStats && state.fixtureStatsFor === state.data) {
    return state.fixtureStats;
  }

  const { byName } = getTeamIndex();
  const eliminated = new Set();
  let liveCount = 0;

  (state.data?.fixtures || []).forEach((day) => {
    (day.matches || []).forEach((match) => {
      if (match.status === 'live') {
        liveCount += 1;
      }

      if (match.status !== 'finished' || !KNOCKOUT_ROUNDS.has(match.round) || !match.winner) {
        return;
      }

      const home = byName.get(normaliseTeamName(match.homeTeam));
      const away = byName.get(normaliseTeamName(match.awayTeam));
      const winner = byName.get(normaliseTeamName(match.winner));

      if (!home || !away || !winner) {
        return;
      }

      if (home.id !== winner.id) {
        eliminated.add(home.id);
      }

      if (away.id !== winner.id) {
        eliminated.add(away.id);
      }
    });
  });

  state.fixtureStats = { eliminated, liveCount };
  state.fixtureStatsFor = state.data;
  return state.fixtureStats;
}

function getEliminatedTeamIds() {
  return getFixtureStats().eliminated;
}

function getLiveCount() {
  return getFixtureStats().liveCount;
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

  const eliminated = getEliminatedTeamIds();
  const leader = players[0];
  const liveCount = getLiveCount();

  const filteredIndex = state.filterOwner
    ? players.findIndex((player) => player.owner === state.filterOwner)
    : -1;
  const hero = filteredIndex >= 0 ? ownerHero(players[filteredIndex], filteredIndex + 1) : '';

  const stats = [
    statCard({ value: (state.data.teams || []).length, label: 'Teams in play' }),
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
        const alive = !eliminated.has(team.id);
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

function fixtureRow(match) {
  const home = getFixtureTeam(match.homeTeam);
  const away = getFixtureTeam(match.awayTeam);
  const live = match.status === 'live';
  const finished = match.status === 'finished';
  const hasScore = match.homeScore !== null && match.homeScore !== undefined
    && match.awayScore !== null && match.awayScore !== undefined;

  const centre = hasScore
    ? `<span class="sw-fix__score">${match.homeScore}<i>–</i>${match.awayScore}</span>`
    : '<span class="sw-fix__vs">vs</span>';

  let pill = '';
  if (live) {
    pill = statusPill('live', match.elapsed ? `${match.elapsed}'` : 'Live');
  } else if (finished) {
    pill = statusPill('ft', 'Full time');
  } else if (match.status === 'scheduled') {
    pill = statusPill('scheduled', formatKickOffTime(match.utcDate));
  }

  return `<div class="sw-fix${live ? ' sw-fix--live' : ''}">
    <div class="sw-fix__side sw-fix__side--home">
      <span class="sw-fix__owner">${escapeHtml(home.owner || 'Unassigned')}</span>
      <span class="sw-fix__team">${escapeHtml(home.country)}</span>
      ${renderFlag(home, 34)}
    </div>
    <div class="sw-fix__center">${centre}${pill}</div>
    <div class="sw-fix__side sw-fix__side--away">
      ${renderFlag(away, 34)}
      <span class="sw-fix__team">${escapeHtml(away.country)}</span>
      <span class="sw-fix__owner">${escapeHtml(away.owner || 'Unassigned')}</span>
    </div>
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
    return `${sectionHead('Fixtures', meta)}<p class="empty">${empty}</p>`;
  }

  const list = days.map((day) => `<section class="sw-day">
    <h3 class="sw-day__date">${escapeHtml(formatDayLabel(day.date))}</h3>
    <div class="sw-day__list">${day.matches.map(fixtureRow).join('')}</div>
  </section>`).join('');

  return `${sectionHead('Fixtures', meta)}${list}`;
}

function bracketTieSide(name, placeholder) {
  if (!name) {
    return `<div class="sw-tie__team sw-tie__team--tbc">${escapeHtml(placeholder || 'To be confirmed')}</div>`;
  }

  const team = getFixtureTeam(name);
  return `<div class="sw-tie__team">${renderFlag(team, 22)}<span class="sw-tie__name">${escapeHtml(team.country)}</span><span class="sw-tie__owner">${escapeHtml(team.owner || '')}</span></div>`;
}

function screenBracket() {
  const rounds = state.data.bracket || [];

  const columns = rounds.map((round) => {
    const ties = round.matches.map((match) => {
      const tbc = !match.homeTeam && !match.awayTeam;
      const mine = (match.homeTeam && getFixtureTeam(match.homeTeam).owner === state.filterOwner)
        || (match.awayTeam && getFixtureTeam(match.awayTeam).owner === state.filterOwner);
      return `<div class="sw-tie${tbc ? ' sw-tie--tbc' : ''}${mine ? ' sw-tie--mine' : ''}">${bracketTieSide(match.homeTeam, match.homePlaceholder)}${bracketTieSide(match.awayTeam, match.awayPlaceholder)}</div>`;
    }).join('');

    return `<details class="sw-bracket__col" open><summary class="sw-bracket__round">${escapeHtml(round.round)}</summary><div class="sw-bracket__ties">${ties}</div></details>`;
  }).join('');

  return `${sectionHead('Knockout bracket', 'Slots fill as the group stage finishes')}<div class="sw-bracket">${columns}</div>`;
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

function renderScreen() {
  const build = SCREENS[state.screen] || screenLeaderboard;
  elements.screen.innerHTML = build();
  elements.screen.scrollTop = 0;

  elements.tabs.querySelectorAll('.tab').forEach((button) => {
    button.classList.toggle('tab--on', button.dataset.screen === state.screen);
  });
}

function render(data) {
  state.data = data;

  if (state.openOwner === null && data.players && data.players.length) {
    state.openOwner = data.players[0].owner;
  }

  updateLive();
  updateFooter(data);
  populateOwnerFilter();
  renderScreen();
}

async function loadSweepstake() {
  const response = await fetch('/api/sweepstake');

  if (!response.ok) {
    throw new Error('Could not load sweepstake data');
  }

  render(await response.json());
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

  if (!button) {
    return;
  }

  state.screen = button.dataset.screen;
  renderScreen();
});

elements.screen.addEventListener('click', (event) => {
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

loadSweepstake().catch((error) => {
  elements.screen.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
});
