(function () {
  const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-:/&'";
  const N = CHARS.length;
  const TICK = 32;
  const ROW_STAGGER = 50;
  const MIN_ROLL = 7;
  const ROLL_JITTER = 12;

  const reduceMotion = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function normalise(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  }

  function clampField(value, len) {
    const text = normalise(value);
    return text.length > len ? text.slice(0, len) : text.padEnd(len, ' ');
  }

  function glyphIndex(char) {
    const index = CHARS.indexOf(char);
    return index < 0 ? 0 : index;
  }

  function setChar(cell, index) {
    cell._char.textContent = CHARS[index] === ' ' ? '\u00A0' : CHARS[index];
  }

  function makeCell() {
    const cell = document.createElement('span');
    cell.className = 'flap';

    const char = document.createElement('span');
    char.className = 'flap__char';
    char.textContent = '\u00A0';

    cell.appendChild(char);
    cell._char = char;
    cell._cur = 0;
    cell._target = 0;

    return cell;
  }

  function FlipBoard(root, columns) {
    this.root = root;
    this.columns = columns;
    this.cells = [];
    this.active = new Set();
    this.timer = null;
    this.rowCells = [];
  }

  FlipBoard.prototype.build = function (rows) {
    this.root.innerHTML = '';
    this.cells = [];
    this.rowCells = [];

    rows.forEach((row) => {
      const rowElement = document.createElement('div');
      rowElement.className = 'flip-row';
      const cellsInRow = [];

      this.columns.forEach((col) => {
        const cellElement = document.createElement('div');
        cellElement.className = `flip-cell flip-cell--${col.key}`;

        if (col.flag && (row.flagAsset || row.iso)) {
          const img = document.createElement('img');
          img.className = 'flip-flag';
          img.src = row.flagAsset || `/assets/flags/${row.iso}.svg`;
          img.alt = '';
          img.width = 26;
          img.height = 20;
          img.loading = 'lazy';
          cellElement.appendChild(img);
        }

        const group = document.createElement('span');
        group.className = 'flap-group';
        const text = clampField(row[col.key], col.len);

        for (let index = 0; index < col.len; index += 1) {
          const cell = makeCell();
          cell._target = glyphIndex(text[index]);
          group.appendChild(cell);
          cellsInRow.push(cell);
          this.cells.push(cell);
        }

        cellElement.appendChild(group);
        rowElement.appendChild(cellElement);
      });

      this.root.appendChild(rowElement);
      this.rowCells.push(cellsInRow);
    });
  };

  FlipBoard.prototype.settle = function () {
    this.cells.forEach((cell) => {
      cell._cur = cell._target;
      setChar(cell, cell._target);
    });
  };

  FlipBoard.prototype.play = function () {
    if (reduceMotion) {
      this.settle();
      return;
    }

    this.stop();
    this.active.clear();

    this.cells.forEach((cell) => {
      const roll = MIN_ROLL + Math.floor(Math.random() * ROLL_JITTER);
      cell._roll = roll;
      cell._cur = ((cell._target - roll) % N + N) % N;
      setChar(cell, cell._cur);
    });

    this.timer = setInterval(() => this._step(), TICK);

    this.rowCells.forEach((cells, rowIndex) => {
      setTimeout(() => {
        cells.forEach((cell) => this.active.add(cell));
      }, rowIndex * ROW_STAGGER);
    });
  };

  FlipBoard.prototype._step = function () {
    if (!this.active.size) {
      return;
    }

    const flipped = [];

    this.active.forEach((cell) => {
      cell._cur = (cell._cur + 1) % N;
      setChar(cell, cell._cur);
      cell.classList.remove('is-flip');
      flipped.push(cell);

      if (cell._cur === cell._target) {
        this.active.delete(cell);
      }
    });

    void this.root.offsetWidth;
    flipped.forEach((cell) => cell.classList.add('is-flip'));
  };

  FlipBoard.prototype.stop = function () {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  };

  window.FlipBoard = FlipBoard;
}());
