const elements = {
  root: document.querySelector('#eliminated-root'),
  refreshButton: document.querySelector('#eliminated-refresh'),
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

function formatShortDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short'
  }).format(date);
}

function eliminationTimingLabel(row) {
  if (row.eliminatedAt) {
    return formatShortDate(row.eliminatedAt) || 'Confirmed';
  }

  if (row.confirmedDate) {
    return formatShortDate(`${row.confirmedDate}T12:00:00.000Z`) || 'Confirmed';
  }

  return 'Confirmed';
}

function eliminationReason(row) {
  const reason = row.reason || row.sourceLabel || 'Elimination confirmed';

  if (!row.eliminatedBy) {
    return reason;
  }

  return `${reason} by ${row.eliminatedBy}`;
}

function renderFlag(row, size = 22) {
  if (!row.flagAsset) {
    return '';
  }

  const width = size;
  const height = Math.round(size * 0.75);

  return `<img class="flag" src="${escapeHtml(row.flagAsset)}" width="${width}" height="${height}" alt="${escapeHtml(row.country)} flag" loading="lazy">`;
}

function initials(country) {
  const words = String(country || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return 'FC';
  }

  if (words.length === 1) {
    return words[0].slice(0, 3).toUpperCase();
  }

  return words.map((word) => word[0]).join('').slice(0, 3).toUpperCase();
}

function safeColour(value, fallback) {
  const colour = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(colour) ? colour : fallback;
}

function renderArm(team, side) {
  const accent = safeColour(team.kitAccent, '#9ca3af');

  if (team.poseVariant === 'waving' && side === 'right') {
    return `<path d="M75 60 C92 42 96 32 91 22" fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round"/>`;
  }

  if (team.poseVariant === 'leaning' && side === 'left') {
    return `<path d="M45 62 C32 73 28 83 34 92" fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round"/>`;
  }

  return side === 'left'
    ? `<path d="M45 62 C34 68 31 78 37 87" fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round"/>`
    : `<path d="M75 62 C86 68 89 78 83 87" fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round"/>`;
}

function renderPlayerSvg(team) {
  const primary = safeColour(team.kitPrimary, '#1f2937');
  const secondary = safeColour(team.kitSecondary, '#f9fafb');
  const accent = safeColour(team.kitAccent, '#9ca3af');
  const shirtText = initials(team.country);

  return `<svg class="player-avatar__kit" viewBox="0 0 120 140" role="img" aria-hidden="true" focusable="false">
    <ellipse cx="60" cy="125" rx="46" ry="8" fill="#d9d7ce"/>
    <path d="M26 118 C36 105 84 105 94 118" fill="#15151e" opacity="0.2"/>
    <circle cx="60" cy="30" r="17" fill="#b9825c"/>
    <path d="M43 29 C47 13 72 10 78 27 C67 22 56 21 43 29Z" fill="#15151e"/>
    <rect x="54" y="44" width="12" height="10" rx="4" fill="#b9825c"/>
    ${renderArm(team, 'left')}
    ${renderArm(team, 'right')}
    <path d="M38 57 C43 48 77 48 82 57 L78 91 C71 97 49 97 42 91Z" fill="${primary}"/>
    <path d="M47 92 H73 L81 115 H65 L60 101 L55 115 H39Z" fill="${secondary}"/>
    <path d="M42 91 C51 97 69 97 78 91" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>
    <rect x="46" y="63" width="28" height="17" rx="5" fill="#ffffff" opacity="0.18"/>
    <text x="60" y="75" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="10" font-weight="800" fill="#ffffff">${escapeHtml(shirtText)}</text>
    <path d="M39 116 H54" stroke="${accent}" stroke-width="7" stroke-linecap="round"/>
    <path d="M66 116 H81" stroke="${accent}" stroke-width="7" stroke-linecap="round"/>
  </svg>`;
}

function renderSummary(summary, lastUpdated) {
  const items = [
    { value: summary.eliminatedCount || 0, label: 'Eliminated' },
    { value: summary.mathematicalEliminationCount || 0, label: 'Automatic' },
    { value: summary.atRiskCount || 0, label: 'At risk' },
    { value: summary.activeCount || 0, label: 'Active' },
    { value: formatDate(lastUpdated), label: 'Last updated' }
  ];

  return `<section class="departure-summary" aria-label="Elimination summary">
    ${items.map((item) => `<div class="departure-summary__item"><strong>${escapeHtml(item.value)}</strong><span>${escapeHtml(item.label)}</span></div>`).join('')}
  </section>`;
}

function renderPlayer(team) {
  const owner = team.owner || 'Unassigned';
  return `<article class="player-avatar" aria-label="${escapeHtml(team.country)}, owned by ${escapeHtml(owner)}, eliminated">
    ${renderPlayerSvg(team)}
    <div class="player-avatar__label">
      <strong>${renderFlag(team, 18)}${escapeHtml(team.country)}</strong>
      <span>${escapeHtml(owner)}</span>
      <small>${escapeHtml(team.seatNumber)} · ${escapeHtml(eliminationTimingLabel(team))}</small>
    </div>
  </article>`;
}

function renderAirportScene(teams) {
  const lounge = teams.length
    ? `<div class="airport-seats">${teams.map(renderPlayer).join('')}</div>`
    : '<div class="eliminated-empty-state">No one has checked in yet.</div>';

  return `<section class="airport-scene" aria-label="Airport departure lounge">
    <div class="airport-window" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>
    ${lounge}
    <div class="airport-scene__floor" aria-hidden="true">
      <span class="airport-scene__suitcase"></span>
      <span class="airport-scene__suitcase airport-scene__suitcase--small"></span>
    </div>
  </section>`;
}

function renderDepartureBoard(rows) {
  const body = rows.length
    ? rows.map((row, index) => `<tr class="departure-board__row">
      <td>${escapeHtml(eliminationTimingLabel(row) || `#${index + 1}`)}</td>
      <td>${escapeHtml(row.flightCode)}</td>
      <td>${renderFlag(row, 20)}${escapeHtml(row.country)}</td>
      <td>${escapeHtml(row.owner || 'Unassigned')}</td>
      <td>${escapeHtml(row.gate)}</td>
      <td>${escapeHtml(row.flightStatus || row.status)}</td>
      <td>${escapeHtml(eliminationReason(row))}</td>
    </tr>`).join('')
    : '<tr class="departure-board__row"><td colspan="7">No one has checked in yet.</td></tr>';

  return `<section class="departure-board" aria-label="Departure board">
    <div class="departure-board__header">
      <h2>Departures</h2>
      <span>Home</span>
    </div>
    <div class="departure-board__scroll">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Flight</th>
            <th>Country</th>
            <th>Owner</th>
            <th>Gate</th>
            <th>Status</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </section>`;
}

function generatedSceneStatusMessage(scene) {
  switch (scene?.status) {
    case 'ready':
      return 'Generated departure lounge ready';
    case 'generation_disabled':
      return 'Generated lounge disabled';
    case 'storage_not_configured':
      return 'Image storage not configured';
    case 'openai_not_configured':
      return 'Image generation not configured';
    case 'empty':
      return 'No departures yet';
    case 'failed':
      return 'Generated image unavailable, showing fallback';
    case 'pending':
    case 'generating':
      return 'Scene image pending';
    default:
      return scene ? 'Scene image pending' : '';
  }
}

function renderGeneratedSceneStatus(scene) {
  const message = generatedSceneStatusMessage(scene);

  if (!message) {
    return '';
  }

  return `<p class="generated-scene__status" data-status="${escapeHtml(scene.status || 'unknown')}">${escapeHtml(message)}</p>`;
}

function renderSceneLounge(scene, teams) {
  if (scene?.loungeImageUrl) {
    return `<section class="generated-scene__lounge" aria-label="Generated departure lounge image">
      <img src="${escapeHtml(scene.loungeImageUrl)}" alt="Generated illustrated departure lounge for eliminated teams" loading="lazy">
    </section>`;
  }

  return `<div class="generated-scene__fallback">${renderAirportScene(teams)}</div>`;
}

function renderSceneBoard(scene, rows) {
  if (scene?.boardImageUrl) {
    return `<section class="generated-scene__board" aria-label="Rendered departure board image">
      <img src="${escapeHtml(scene.boardImageUrl)}" alt="Rendered departure board for eliminated teams" loading="lazy">
    </section>`;
  }

  return `<div class="generated-scene__fallback">${renderDepartureBoard(rows)}</div>`;
}

function renderGeneratedScene(data) {
  const scene = data.generatedScene || null;
  const loungeTeams = data.loungeTeams || [];
  const departureBoard = data.departureBoard || [];

  return `<section class="generated-scene" aria-label="Generated departure scene">
    ${renderGeneratedSceneStatus(scene)}
    <div class="eliminated-layout">
      ${renderSceneLounge(scene, loungeTeams)}
      ${renderSceneBoard(scene, departureBoard)}
    </div>
  </section>`;
}

function renderPendingThirdPlace(rows) {
  if (!rows.length) {
    return '';
  }

  return `<section class="pending-third-place-panel">
    <h2>Third-place pending</h2>
    <p>These teams are out of the title race but still have the third-place play-off.</p>
    <div class="pending-third-place-panel__teams">
      ${rows.map((row) => `<span>${renderFlag(row, 18)}${escapeHtml(row.country)} <small>${escapeHtml(row.owner || '')}</small></span>`).join('')}
    </div>
  </section>`;
}

function renderWarnings(warnings) {
  if (!warnings.length) {
    return '';
  }

  return `<section class="tp-alert tp-alert--warn">
    <h3>Elimination warnings</h3>
    <p>${warnings.map(escapeHtml).join(' ')}</p>
  </section>`;
}

function render(data) {
  elements.lastUpdated.textContent = formatDate(data.lastUpdated);
  elements.providerStatus.textContent = data.providerStatus?.providerStatus || 'unknown';
  elements.root.innerHTML = [
    renderWarnings(data.warnings || []),
    renderSummary(data.eliminationSummary || {}, data.lastUpdated),
    renderGeneratedScene(data),
    renderPendingThirdPlace(data.pendingThirdPlaceTeams || [])
  ].join('');
}

async function loadEliminations() {
  const response = await fetch('/api/eliminated-teams');

  if (!response.ok) {
    throw new Error('Could not load eliminated teams');
  }

  render(await response.json());
}

async function refreshEliminations() {
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
      throw new Error('Could not refresh eliminations');
    }

    await loadEliminations();
  } catch (error) {
    elements.root.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  } finally {
    elements.refreshButton.disabled = false;
    elements.refreshButton.textContent = 'Refresh eliminations';
  }
}

elements.refreshButton.addEventListener('click', refreshEliminations);

loadEliminations().catch((error) => {
  elements.root.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
});
