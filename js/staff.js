import { diatonicIndex, noteName } from './theory.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const STEP = 5; // 線と間ひとつ分の高さ
const BOTTOM_LINE = 30; // 下の線 E4 の通し番号
const TOP_LINE = 38; // 上の線 F5 の通し番号
const CLEF_WIDTH = 44;
const COLUMN_WIDTH = 58;
const LABEL_CHAR_WIDTH = 11; // コード名1文字ぶんのおおよその幅
const LABEL_HEIGHT = 24;
const ACCIDENTALS = { 1: '♯', 2: '♯♯', '-1': '♭', '-2': '♭♭' };

function svgEl(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function svgText(content, attrs) {
  const node = svgEl('text', attrs);
  node.textContent = content;
  return node;
}

function drawLines(svg, yOf, width) {
  for (let d = BOTTOM_LINE; d <= TOP_LINE; d += 2) {
    svg.append(svgEl('line', { x1: 2, x2: width - 2, y1: yOf(d), y2: yOf(d), class: 'staff-line' }));
  }
  svg.append(svgText('𝄞', { x: 2, y: yOf(BOTTOM_LINE) + 3, class: 'clef' }));
}

function drawLedgers(svg, d, x, yOf) {
  const ledgers = [];
  for (let k = BOTTOM_LINE - 2; k >= d; k -= 2) ledgers.push(k);
  for (let k = TOP_LINE + 2; k <= d; k += 2) ledgers.push(k);
  for (const k of ledgers) {
    svg.append(svgEl('line', { x1: x - 11, x2: x + 11, y1: yOf(k), y2: yOf(k), class: 'staff-line' }));
  }
}

// 2度で隣り合う音は符頭が重なるので、上の音を右へずらす
function drawColumn(svg, column, x, yOf) {
  if (column.label) svg.append(svgText(column.label, { x, y: 16, class: 'staff-label' }));
  const sorted = [...column.notes].sort((a, b) => diatonicIndex(a) - diatonicIndex(b));
  let previous = null;
  let shifted = false;
  let accidentalCount = 0;
  for (const note of sorted) {
    const d = diatonicIndex(note);
    shifted = previous !== null && d - previous === 1 && !shifted;
    const noteX = shifted ? x + 12 : x;
    const y = yOf(d);
    drawLedgers(svg, d, noteX, yOf);
    svg.append(svgEl('ellipse', { cx: noteX, cy: y, rx: 6.4, ry: 4.3, transform: `rotate(-20 ${noteX} ${y})`, class: column.mark ? `notehead ${column.mark}` : 'notehead' }));
    if (note.acc !== 0) {
      const accidentalX = x - 11 - (accidentalCount % 2) * 9;
      svg.append(svgText(ACCIDENTALS[note.acc], { x: accidentalX, y: y + 5, class: 'accidental' }));
      accidentalCount += 1;
    }
    previous = d;
  }
}

// columns: [{ notes: [記譜音の音], label: '表示するコード名', mark: マイクで吹けた音は 'done'・次に吹く音は 'current' }]
// fixedColumnWidth: 1音ずつ並べる譜面では、コード名に合わせて列を広げず指定の幅にする
export function drawStaff(columns, fixedColumnWidth) {
  const indices = columns.flatMap((column) => column.notes.map(diatonicIndex));
  const high = Math.max(TOP_LINE + 3, ...indices);
  const low = Math.min(BOTTOM_LINE - 4, ...indices);
  const yOf = (d) => LABEL_HEIGHT + 6 + (high - d) * STEP;
  // 「G7(♭9)」のような長いコード名どうしが重ならないよう、列の幅を名前に合わせて広げる
  const longest = Math.max(0, ...columns.map((column) => (column.label || '').length));
  const columnWidth = fixedColumnWidth ?? Math.max(COLUMN_WIDTH, longest * LABEL_CHAR_WIDTH + 8);
  const width = CLEF_WIDTH + columns.length * columnWidth + 6;
  const height = yOf(low) + 10;
  const description = columns.map((column) => column.label || column.notes.map(noteName).join(' ')).join(', ');
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, class: 'staff', role: 'img', 'aria-label': description });
  // 音数の少ない譜面が画面いっぱいに拡大されすぎないよう上限を決める
  svg.style.maxWidth = `${Math.round(width * 1.35)}px`;
  drawLines(svg, yOf, width);
  columns.forEach((column, i) => drawColumn(svg, column, CLEF_WIDTH + i * columnWidth + columnWidth / 2, yOf));
  return svg;
}
