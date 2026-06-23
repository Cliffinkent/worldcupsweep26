const SVG_WIDTH = 1200;
const HEADER_HEIGHT = 140;
const ROW_HEIGHT = 58;
const FOOTER_HEIGHT = 34;
const MAX_REASON_LENGTH = 78;

function escapeSvg(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function cleanText(value, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function truncateText(value, maxLength = MAX_REASON_LENGTH) {
  const text = cleanText(value);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function statusLabel(row) {
  return cleanText(row.flightStatus || row.status, 'Boarding');
}

function reasonLabel(row) {
  if (row.eliminatedBy) {
    return truncateText(`${row.reason || 'Eliminated'} by ${row.eliminatedBy}`);
  }

  return truncateText(row.reason || row.sourceLabel || 'Elimination confirmed');
}

function renderEmptyBoard(generatedAt) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="360" viewBox="0 0 ${SVG_WIDTH} 360" role="img" aria-labelledby="title desc">
  <title id="title">Departure board</title>
  <desc id="desc">No departures yet. Generated ${escapeSvg(generatedAt || '')}.</desc>
  <rect width="${SVG_WIDTH}" height="360" fill="#15151e"/>
  <rect x="24" y="24" width="1152" height="312" rx="14" fill="#20202b" stroke="#f8d74a" stroke-width="2"/>
  <text x="56" y="78" fill="#f8d74a" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800" letter-spacing="1">Departure board</text>
  <text x="56" y="188" fill="#f7f7f2" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="800">No departures yet</text>
</svg>`;
}

function renderHeader() {
  return `<rect width="${SVG_WIDTH}" height="${HEADER_HEIGHT}" fill="#15151e"/>
  <text x="32" y="62" fill="#f8d74a" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800" letter-spacing="1">Departure board</text>
  <text x="1064" y="62" text-anchor="end" fill="#a8a8b3" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="1">HOME</text>
  <rect x="24" y="86" width="1152" height="1" fill="#373746"/>
  <text x="32" y="126" fill="#8f8f9d" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="1">FLIGHT</text>
  <text x="170" y="126" fill="#8f8f9d" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="1">COUNTRY</text>
  <text x="430" y="126" fill="#8f8f9d" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="1">OWNER</text>
  <text x="650" y="126" fill="#8f8f9d" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="1">GATE</text>
  <text x="780" y="126" fill="#8f8f9d" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="1">STATUS</text>
  <text x="940" y="126" fill="#8f8f9d" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="1">REASON</text>`;
}

function renderRow(row, index) {
  const y = HEADER_HEIGHT + 46 + (index * ROW_HEIGHT);
  const lineY = HEADER_HEIGHT + 62 + (index * ROW_HEIGHT);
  const background = index % 2 === 0 ? '#20202b' : '#191923';

  return `<rect x="24" y="${lineY - 44}" width="1152" height="${ROW_HEIGHT}" fill="${background}"/>
  <text x="32" y="${y}" fill="#f8d74a" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800">${escapeSvg(cleanText(row.flightCode, 'TBC 2026'))}</text>
  <text x="170" y="${y}" fill="#f7f7f2" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="800">${escapeSvg(cleanText(row.country, 'Unknown'))}</text>
  <text x="430" y="${y}" fill="#f7f7f2" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="700">${escapeSvg(cleanText(row.owner, 'Unassigned'))}</text>
  <text x="650" y="${y}" fill="#f8d74a" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800">${escapeSvg(cleanText(row.gate, 'Gate TBC'))}</text>
  <text x="780" y="${y}" fill="#f8d74a" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="800">${escapeSvg(statusLabel(row))}</text>
  <text x="940" y="${y}" fill="#d8d8e0" font-family="Inter, Arial, sans-serif" font-size="17" font-weight="650">${escapeSvg(reasonLabel(row))}</text>`;
}

function renderDepartureBoardSvg({ departureBoard = [], generatedAt = new Date().toISOString() } = {}) {
  const rows = Array.isArray(departureBoard) ? departureBoard : [];

  if (!rows.length) {
    return renderEmptyBoard(generatedAt);
  }

  const height = HEADER_HEIGHT + 54 + (rows.length * ROW_HEIGHT) + FOOTER_HEIGHT;
  const renderedRows = rows.map(renderRow).join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${height}" viewBox="0 0 ${SVG_WIDTH} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Departure board</title>
  <desc id="desc">Departure board for eliminated teams. Generated ${escapeSvg(generatedAt || '')}.</desc>
  <rect width="${SVG_WIDTH}" height="${height}" fill="#15151e"/>
  ${renderHeader()}
  ${renderedRows}
  <text x="32" y="${height - 18}" fill="#8f8f9d" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700">Generated ${escapeSvg(generatedAt || '')}</text>
</svg>`;
}

module.exports = {
  renderDepartureBoardSvg
};
