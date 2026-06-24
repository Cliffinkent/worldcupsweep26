const elements = {
  heroImg: document.querySelector('#dl-hero-img'),
  heroFallback: document.querySelector('#dl-hero-fallback'),
  sceneStatus: document.querySelector('#dl-scene-status'),
  stats: document.querySelector('#dl-stats'),
  board: document.querySelector('#dl-board'),
  clock: document.querySelector('#dl-clock'),
  thirdSlot: document.querySelector('#dl-third-slot'),
  warnSlot: document.querySelector('#dl-warn-slot'),
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

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');

  return `${dd}/${mm}`;
}

function eliminationTimingLabel(row) {
  if (row.eliminatedAt) {
    return formatShortDate(row.eliminatedAt) || 'Out';
  }

  if (row.confirmedDate) {
    return formatShortDate(`${row.confirmedDate}T12:00:00.000Z`) || 'Out';
  }

  return 'Out';
}

function renderFlag(row, size) {
  if (!row.flagAsset) {
    return '';
  }

  const width = size;
  const height = Math.round(size * 0.75);

  return `<img class="flag" src="${escapeHtml(row.flagAsset)}" width="${width}" height="${height}" alt="" loading="lazy">`;
}

function sceneStatusMessage(scene) {
  switch (scene && scene.status) {
    case 'ready':
      return 'Generated lounge ready';
    case 'generation_disabled':
      return 'Generated lounge disabled';
    case 'storage_not_configured':
      return 'Image storage not configured';
    case 'openai_not_configured':
      return 'Image generation not configured';
    case 'empty':
      return 'No departures yet';
    case 'failed':
      return 'Generated image unavailable';
    case 'pending':
    case 'generating':
      return 'Scene image generating...';
    default:
      return 'Departure lounge';
  }
}

function renderHero(data) {
  const scene = data.generatedScene || null;
  const url = scene && scene.loungeImageUrl;

  if (url) {
    elements.heroImg.src = url;
    elements.heroImg.hidden = false;
    elements.heroFallback.hidden = true;
  } else {
    elements.heroImg.hidden = true;
    elements.heroFallback.hidden = false;
    elements.sceneStatus.textContent = sceneStatusMessage(scene);
  }

  const summary = data.eliminationSummary || {};
  const stats = [
    { num: summary.eliminatedCount || 0, label: 'Eliminated' },
    { num: summary.activeCount || 0, label: 'Still in', mod: 'alive' },
    { num: summary.mathematicalEliminationCount || 0, label: 'Automatic' },
    { num: summary.atRiskCount || 0, label: 'At risk' }
  ];

  elements.stats.innerHTML = stats.map((item) =>
    `<div class="dl-stat${item.mod ? ' dl-stat--' + item.mod : ''}">
       <div class="dl-stat__num">${escapeHtml(item.num)}</div>
       <div class="dl-stat__label">${escapeHtml(item.label)}</div>
     </div>`).join('');
}

const BOARD_COLUMNS = [
  { key: 'when', len: 6 },
  { key: 'flight', len: 5 },
  { key: 'country', len: 13, flag: true },
  { key: 'owner', len: 9 },
  { key: 'gate', len: 3 },
  { key: 'status', len: 8 }
];

let board = null;

function stopBoard() {
  if (board) {
    board.stop();
    board = null;
  }
}

function compactFlightCode(value) {
  return String(value || '')
    .trim()
    .replace(/\s*2026$/i, '26')
    .replace(/\s+/g, '');
}

function compactGate(value) {
  return String(value || '')
    .trim()
    .replace(/^gate\s+/i, '');
}

function buildBoard(rows) {
  const root = elements.board;
  stopBoard();

  if (!Array.isArray(rows) || !rows.length) {
    root.innerHTML = '<div class="dl-empty">No nations have checked in yet - the lounge is empty.</div>';
    return;
  }

  const mapped = rows.map((row) => ({
    when: eliminationTimingLabel(row),
    flight: compactFlightCode(row.flightCode),
    country: row.country || '',
    owner: row.owner || 'Unassigned',
    gate: compactGate(row.gate),
    status: row.flightStatus || row.status || 'Departed',
    flagAsset: row.flagAsset || ''
  }));

  board = new FlipBoard(root, BOARD_COLUMNS);
  board.build(mapped);
  board.settle();
}

function playBoard() {
  if (board) {
    board.play();
  }
}

function renderThird(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    elements.thirdSlot.innerHTML = '';
    return;
  }

  elements.thirdSlot.innerHTML = `<section class="dl-third">
    <div class="dl-third__head">
      <h3>Third-place pending</h3>
      <span class="dl-third__pill">${rows.length} ${rows.length === 1 ? 'team' : 'teams'}</span>
    </div>
    <p class="dl-third__note">Out of the title race, but still alive for the third-place play-off.</p>
    <div class="dl-third__teams">
      ${rows.map((row) => `<span class="dl-third__chip">
        ${renderFlag(row, 30)}<strong>${escapeHtml(row.country)}</strong><span>${escapeHtml(row.owner || '')}</span>
      </span>`).join('')}
    </div>
  </section>`;
}

function renderWarnings(warnings) {
  if (!Array.isArray(warnings) || !warnings.length) {
    elements.warnSlot.innerHTML = '';
    return;
  }

  elements.warnSlot.innerHTML = `<div class="dl-warn"><div class="dl-warn__inner">
    ${warnings.map(escapeHtml).join(' ')}
  </div></div>`;
}

function render(data) {
  elements.lastUpdated.textContent = formatDate(data.lastUpdated);
  elements.providerStatus.textContent = (data.providerStatus && data.providerStatus.providerStatus) || 'unknown';
  renderWarnings(data.warnings || []);
  renderHero(data);
  buildBoard(data.departureBoard || []);
  renderThird(data.pendingThirdPlaceTeams || []);
}

async function loadEliminations() {
  const response = await fetch('/api/eliminated-teams');

  if (!response.ok) {
    throw new Error('Could not load eliminated teams');
  }

  render(await response.json());
  playBoard();
}

async function refreshEliminations() {
  elements.refreshButton.disabled = true;
  elements.refreshButton.textContent = 'Refreshing...';

  try {
    const response = await fetch('/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Could not refresh eliminations');
    }

    await loadEliminations();
  } catch (error) {
    elements.warnSlot.innerHTML = `<div class="dl-warn"><div class="dl-warn__inner">${escapeHtml(error.message)}</div></div>`;
  } finally {
    elements.refreshButton.disabled = false;
    elements.refreshButton.textContent = 'Refresh eliminations';
  }
}

function initClock() {
  const root = elements.clock;
  const cells = [];

  '00:00:00'.split('').forEach(() => {
    const cell = document.createElement('span');
    cell.className = 'flap';

    const char = document.createElement('span');
    char.className = 'flap__char';
    char.textContent = '0';

    cell.appendChild(char);
    cell._char = char;
    cell._val = '0';
    root.appendChild(cell);
    cells.push(cell);
  });

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function tick() {
    const now = new Date();
    const value = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((part) => String(part).padStart(2, '0')).join(':');
    const changed = [];

    value.split('').forEach((char, index) => {
      const cell = cells[index];

      if (cell._val !== char) {
        cell._val = char;
        cell._char.textContent = char;

        if (!reduceMotion) {
          cell.classList.remove('is-flip');
          changed.push(cell);
        }
      }
    });

    if (changed.length) {
      void root.offsetWidth;
      changed.forEach((cell) => cell.classList.add('is-flip'));
    }
  }

  tick();
  setInterval(tick, 1000);
}

elements.refreshButton.addEventListener('click', refreshEliminations);
initClock();

loadEliminations().catch((error) => {
  elements.sceneStatus.textContent = error.message;
  elements.board.innerHTML = `<div class="dl-empty">${escapeHtml(error.message)}</div>`;
});
