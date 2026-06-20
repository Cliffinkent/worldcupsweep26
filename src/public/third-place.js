const FALLBACK_WARNING = 'Some third-place rankings use a display fallback because conduct/FIFA ranking tie-break data is unavailable.';

const elements = {
  root: document.querySelector('#third-place-root'),
  refreshButton: document.querySelector('#third-place-refresh'),
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

function gd(value) {
  const number = Number(value) || 0;
  return number >= 0 ? `+${number}` : `${number}`;
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

function statusLabel(value) {
  if (value === 'currently_qualifies') {
    return 'currently qualifies';
  }

  if (value === 'currently_out') {
    return 'currently out';
  }

  return String(value || 'unknown').replaceAll('_', ' ');
}

function renderFlag(row, size = 22) {
  if (!row.flagAsset) {
    return '';
  }

  const width = size;
  const height = Math.round(size * 0.75);

  return `<img class="flag" src="${escapeHtml(row.flagAsset)}" width="${width}" height="${height}" alt="${escapeHtml(row.country)} flag" loading="lazy">`;
}

function renderTeamCell(row) {
  return `<span class="tp-team">${renderFlag(row)}<span class="tp-team__body"><span class="tp-team__name">${escapeHtml(row.country)}</span><span class="tp-team__source">${escapeHtml(row.source)}</span></span></span>`;
}

function renderStatus(row) {
  const tone = row.qualificationStatus === 'currently_qualifies' ? 'alive' : 'out';
  const tie = row.unresolvedTie
    ? '<span class="tp-status__sub">tie-break unresolved</span>'
    : '';

  return `<span class="tp-status tp-status--${tone}">${escapeHtml(statusLabel(row.qualificationStatus))}${tie}</span>`;
}

function renderWarnings(data) {
  const rows = [
    ...(data.globalThirdPlaceTable || []),
    ...(data.groupings || []).flatMap((grouping) => grouping.rows || [])
  ];
  const panels = [];

  if (rows.some((row) => row.unresolvedTie)) {
    const warning = (data.warnings || []).find((item) => item.includes('display fallback')) || FALLBACK_WARNING;
    panels.push(`<section class="tp-alert tp-alert--warn"><h3>Tie-break warning</h3><p>${escapeHtml(warning)}</p></section>`);
  }

  if (
    data.annexCMappingStatus === 'missing_combination' ||
    (data.groupings || []).some((grouping) => grouping.annexCMappingStatus === 'missing_combination')
  ) {
    panels.push('<section class="tp-alert tp-alert--pending"><h3>Pending Annexe C mapping</h3><p>No team is being marked as the Annexe C slot team until the current selected third-place combination has a mapping.</p></section>');
  }

  return panels.length ? `<div class="tp-alerts">${panels.join('')}</div>` : '';
}

function renderGlobalTable(data) {
  const rows = data.globalThirdPlaceTable || [];
  const bodyRows = [];

  rows.forEach((row, index) => {
    if (index === 0) {
      bodyRows.push('<tr class="tp-table__band"><td colspan="9">Top 8 - currently qualifies</td></tr>');
    }

    if (index === 8) {
      bodyRows.push('<tr class="tp-table__band tp-table__band--out"><td colspan="9">Bottom 4 - currently out</td></tr>');
    }

    bodyRows.push(`<tr class="tp-table__row tp-table__row--${escapeHtml(row.qualificationStatus)}">
      <td class="tp-rank">${escapeHtml(row.globalRank)}</td>
      <td>${renderTeamCell(row)}</td>
      <td>${escapeHtml(row.owner || '')}</td>
      <td>Group ${escapeHtml(row.group)}</td>
      <td class="tp-num">${escapeHtml(row.played)}</td>
      <td class="tp-num tp-num--pts">${escapeHtml(row.points)}</td>
      <td class="tp-num">${escapeHtml(gd(row.goalDifference))}</td>
      <td class="tp-num">${escapeHtml(row.goalsFor)}</td>
      <td>${renderStatus(row)}</td>
    </tr>`);
  });

  return `<section class="tp-section">
    <div class="sw-sectionhead"><h2 class="sw-h2">Global third-place table</h2><span class="sw-sectionhead__meta">Backend order - top 8 qualify as it stands</span></div>
    <div class="tp-table-wrap">
      <table class="tp-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Team</th>
            <th>Owner</th>
            <th>Group</th>
            <th>P</th>
            <th>Pts</th>
            <th>GD</th>
            <th>GF</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${bodyRows.join('')}</tbody>
      </table>
    </div>
  </section>`;
}

function renderCandidateGroups(groups) {
  return `<span class="tp-candidates">${groups.map((group) => `<span class="tp-candidate">${escapeHtml(group)}</span>`).join('')}</span>`;
}

function renderGroupingBadges(row) {
  const badges = [];

  if (row.isGroupingLeader) {
    badges.push('<span class="tp-badge tp-badge--leader">grouping leader</span>');
  }

  if (row.isAnnexeCMappedTeam) {
    badges.push('<span class="tp-badge tp-badge--annex">Annexe C slot as it stands</span>');
  }

  if (row.unresolvedTie) {
    badges.push('<span class="tp-badge tp-badge--warn">tie-break unresolved</span>');
  }

  return badges.length ? badges.join('') : '<span class="tp-muted">-</span>';
}

function renderGroupingRows(rows) {
  return rows.map((row) => `<tr>
    <td>Group ${escapeHtml(row.group)}</td>
    <td>${renderTeamCell(row)}</td>
    <td class="tp-num">${escapeHtml(row.globalRank)}</td>
    <td class="tp-num">${escapeHtml(row.played)}</td>
    <td class="tp-num tp-num--pts">${escapeHtml(row.points)}</td>
    <td class="tp-num">${escapeHtml(gd(row.goalDifference))}</td>
    <td class="tp-num">${escapeHtml(row.goalsFor)}</td>
    <td><span class="tp-badgebar">${renderGroupingBadges(row)}</span></td>
  </tr>`).join('');
}

function renderGroupingCard(grouping) {
  const annexState = grouping.annexCMappingStatus === 'mapped' && grouping.annexeCMappedTeam
    ? `<span class="tp-card__annex">Annexe C slot as it stands: ${escapeHtml(grouping.annexeCMappedSource)} ${escapeHtml(grouping.annexeCMappedTeam.country)}</span>`
    : '<span class="tp-card__pending">Pending Annexe C mapping</span>';

  return `<article class="tp-card" id="${escapeHtml(grouping.id)}">
    <header class="tp-card__head">
      <span class="tp-match">M${escapeHtml(grouping.matchNumber)}</span>
      <div>
        <h3>${escapeHtml(grouping.bracketWinnerLabel)}</h3>
        <p>${escapeHtml(grouping.thirdPlaceLabel)}</p>
      </div>
    </header>
    <div class="tp-card__meta">
      ${renderCandidateGroups(grouping.candidateGroups || [])}
      ${annexState}
    </div>
    <div class="tp-mini-wrap">
      <table class="tp-table tp-table--mini">
        <thead>
          <tr>
            <th>Group</th>
            <th>Team</th>
            <th>Rank</th>
            <th>P</th>
            <th>Pts</th>
            <th>GD</th>
            <th>GF</th>
            <th>Watch</th>
          </tr>
        </thead>
        <tbody>${renderGroupingRows(grouping.rows || [])}</tbody>
      </table>
    </div>
    <p class="tp-note">${escapeHtml(grouping.note)}</p>
  </article>`;
}

function renderGroupings(data) {
  const cards = (data.groupings || []).map(renderGroupingCard).join('');

  return `<section class="tp-section">
    <div class="sw-sectionhead"><h2 class="sw-h2">Candidate groupings</h2><span class="sw-sectionhead__meta">Grouping leader is monitoring only</span></div>
    <div class="tp-grid">${cards}</div>
  </section>`;
}

function render(data) {
  elements.lastUpdated.textContent = formatDate(data.lastUpdated);
  elements.providerStatus.textContent = data.providerStatus?.providerStatus || 'unknown';
  elements.root.innerHTML = [
    renderWarnings(data),
    renderGlobalTable(data),
    renderGroupings(data)
  ].join('');
}

async function loadThirdPlaceWatch() {
  const response = await fetch('/api/third-place-watch');

  if (!response.ok) {
    throw new Error('Could not load third-place watch');
  }

  render(await response.json());
}

async function refreshThirdPlaceWatch() {
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
      throw new Error('Could not refresh tournament data');
    }

    await loadThirdPlaceWatch();
  } catch (error) {
    elements.root.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  } finally {
    elements.refreshButton.disabled = false;
    elements.refreshButton.textContent = 'Refresh';
  }
}

elements.refreshButton.addEventListener('click', refreshThirdPlaceWatch);

loadThirdPlaceWatch().catch((error) => {
  elements.root.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
});
