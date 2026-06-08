const state = {
  data: null
};

const elements = {
  overview: document.querySelector('#overview'),
  groups: document.querySelector('#groups'),
  fixtures: document.querySelector('#fixtures'),
  bracket: document.querySelector('#bracket'),
  players: document.querySelector('#players'),
  refreshButton: document.querySelector('#refresh-button'),
  lastUpdated: document.querySelector('#last-updated'),
  providerStatus: document.querySelector('#provider-status')
};
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

function formatKickOffTime(value) {
  if (!value) {
    return 'Kick-off TBC';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Kick-off TBC';
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
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildTeamLookup(teams) {
  const lookup = new Map();

  teams.forEach((team) => {
    [team.country, team.fifaName, ...(team.aliases || [])].forEach((name) => {
      lookup.set(normaliseTeamName(name), team);
    });
  });

  return lookup;
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

  if (name && byName.has(normaliseTeamName(name))) {
    return byName.get(normaliseTeamName(name)).iso;
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

function getFixtureTeam(lookup, apiName) {
  const localTeam = lookup.get(normaliseTeamName(apiName));

  return {
    id: localTeam?.id || null,
    name: localTeam?.country || apiName || 'TBC',
    country: localTeam?.country || apiName || 'TBC',
    owner: localTeam?.owner || ''
  };
}

const STATUS_DISPLAY = {
  scheduled: { label: 'Upcoming', tone: 'scheduled' },
  live: { label: 'Live', tone: 'live' },
  finished: { label: 'Full time', tone: 'ft' },
  unavailable: { label: 'Off', tone: 'off' },
  unknown: { label: '', tone: 'off' }
};

function getStatusDisplay(status) {
  return STATUS_DISPLAY[status] || STATUS_DISPLAY.unknown;
}

function renderOverview(data) {
  const fixtureCount = data.fixtures.reduce((count, group) => count + group.matches.length, 0);
  const finishedCount = data.fixtures.reduce((count, group) => (
    count + group.matches.filter((match) => match.status === 'finished').length
  ), 0);

  elements.overview.innerHTML = [
    ['Teams', data.teams.length],
    ['Players', data.players.length],
    ['Fixtures', fixtureCount],
    ['Finished', finishedCount]
  ].map(([label, value]) => `
    <div class="summary-card">
      <strong>${value}</strong>
      <span>${label}</span>
    </div>
  `).join('');

  const provider = data.providerStatus;
  elements.providerStatus.textContent = provider
    ? `${provider.providerStatus}${provider.message ? ` - ${provider.message}` : ''}`
    : 'unknown';
}

function renderGroups(data) {
  elements.groups.innerHTML = data.groupTables.map((group) => `
    <article class="group-card">
      <h3>Group ${escapeHtml(group.group)}</h3>
      <table>
        <thead>
          <tr>
            <th>Team</th>
            <th>P</th>
            <th>GD</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          ${group.table.map((row) => `
            <tr>
              <td>${renderFlag(row)} ${escapeHtml(row.country)}<br><small>${escapeHtml(row.owner)}</small></td>
              <td>${row.played}</td>
              <td>${row.goalDifference}</td>
              <td>${row.points}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </article>
  `).join('');
}

function renderFixtures(data) {
  if (!data.fixtures.length) {
    elements.fixtures.innerHTML = '<p class="empty">No fixtures loaded yet.</p>';
    return;
  }

  const teamLookup = buildTeamLookup(data.teams || []);

  elements.fixtures.innerHTML = data.fixtures.map((dateGroup) => `
    <article class="fixture-date">
      <h3>${escapeHtml(dateGroup.date)}</h3>
      ${dateGroup.matches.map((match) => {
        const homeTeam = getFixtureTeam(teamLookup, match.homeTeam);
        const awayTeam = getFixtureTeam(teamLookup, match.awayTeam);
        const score = match.homeScore !== null && match.awayScore !== null
          ? `${match.homeScore} - ${match.awayScore}`
          : 'vs';

        return `
          <div class="match">
            <div class="fixture-teams">
              <div class="fixture-team fixture-team-home">
                <div class="fixture-team-name">${renderFlag(homeTeam, 24)} ${escapeHtml(homeTeam.name)}</div>
                <small>${escapeHtml(homeTeam.owner || 'Unassigned')}</small>
              </div>
              <div class="fixture-score">${escapeHtml(score)}</div>
              <div class="fixture-team fixture-team-away">
                <div class="fixture-team-name">${escapeHtml(awayTeam.name)} ${renderFlag(awayTeam, 24)}</div>
                <small>${escapeHtml(awayTeam.owner || 'Unassigned')}</small>
              </div>
            </div>
            <div>
              <span class="status">${escapeHtml(match.status)}</span>
              <small class="kickoff-time">${escapeHtml(formatKickOffTime(match.utcDate))}</small>
              <small>${escapeHtml(match.round || '')}${match.group ? ` Group ${escapeHtml(match.group)}` : ''}</small>
            </div>
          </div>
        `;
      }).join('')}
    </article>
  `).join('');
}

function renderBracket(data) {
  elements.bracket.innerHTML = data.bracket.map((round) => `
    <article class="bracket-round">
      <h3>${escapeHtml(round.round)}</h3>
      ${round.matches.map((match) => `
        <div class="slot">
          <div>${escapeHtml(match.homeTeam || match.homePlaceholder)}</div>
          <div>${escapeHtml(match.awayTeam || match.awayPlaceholder)}</div>
          <small>${escapeHtml(match.status)}${match.winner ? `, winner: ${escapeHtml(match.winner)}` : ''}</small>
        </div>
      `).join('')}
    </article>
  `).join('');
}

function renderPlayers(data) {
  elements.players.innerHTML = `
    <table class="players-table">
      <thead>
        <tr>
          <th>Owner</th>
          <th>Teams</th>
          <th>Group points</th>
          <th>Alive</th>
          <th>Best</th>
          <th>Live today</th>
        </tr>
      </thead>
      <tbody>
        ${data.players.map((player) => `
          <tr>
            <td>${escapeHtml(player.owner)}</td>
            <td>${(player.teams || player.assignedTeams).map((team) => `${renderFlag(team)} ${escapeHtml(team.country)}`).join('<br>')}</td>
            <td>${player.totalGroupPoints}</td>
            <td>${player.teamsStillAlive}</td>
            <td>${player.bestTeam ? `${renderFlag(player.bestTeam)} ${escapeHtml(player.bestTeam.country)} (${player.bestTeam.points})` : '-'}</td>
            <td>${player.liveTeamsPlayingToday ?? 0}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function render(data) {
  state.data = data;
  renderOverview(data);
  renderGroups(data);
  renderFixtures(data);
  renderBracket(data);
  renderPlayers(data);
  elements.lastUpdated.textContent = formatDate(data.generatedAt || data.refreshedAt);
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
  elements.refreshButton.textContent = 'Refreshing...';

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

elements.refreshButton.addEventListener('click', refreshSweepstake);

loadSweepstake().catch((error) => {
  elements.overview.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
});
