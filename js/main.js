import { NOTATIONS, parseNote, parseChord, noteName, chordName, chordNotes, toWritten, transpose, placeRoot } from './theory.js';
import { drawStaff } from './staff.js';
import { unlockAudio, playColumns } from './audio.js';
import { buildQuiz } from './quiz.js';

// 日本語版と同じドメインで公開するため、進み具合が混ざらないよう別の名前で保存する
const STORAGE_KEY = 'jazz-theory-en';
const QUIZ_LENGTH = 10;
const TOKEN = /\{([nc]):([^}]+)\}/g;

const state = { notation: 'concert', units: [], progress: {}, quiz: null };
const view = document.getElementById('view');

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    if (saved.notation in NOTATIONS) state.notation = saved.notation;
    state.progress = saved.progress ?? {};
  } catch {
    // 非公開モードなどで読めなくても、既定値のまま使えるようにする
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ notation: state.notation, progress: state.progress }));
  } catch {
    // 保存できない環境でも学習自体は続けられるので、失敗は無視する
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, text, onClick) {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

// {n:C4} や {c:Dm7} を、いま選んでいる記譜の音名・コード名に置き換える
function renderTokens(text) {
  const fragment = document.createDocumentFragment();
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    fragment.append(text.slice(last, match.index));
    const value = match[1] === 'n'
      ? noteName(toWritten(parseNote(match[2]), state.notation))
      : chordName(parseChord(match[2]), state.notation);
    fragment.append(el('span', 'pitch', value));
    last = match.index + match[0].length;
  }
  fragment.append(text.slice(last));
  return fragment;
}

function exampleColumns(example) {
  if (example.seq) return example.seq.map((text) => ({ notes: [parseNote(text)], chord: null }));
  if (example.chords) {
    return example.chords.map((text) => {
      const chord = parseChord(text);
      return { notes: chordNotes(chord), chord };
    });
  }
  return example.columns.map((column) => {
    const chord = column.chord ? parseChord(column.chord) : null;
    return { notes: column.notes ? column.notes.map(parseNote) : chordNotes(chord), chord };
  });
}

function staffFigure(columns, notation = state.notation) {
  const figure = el('figure', 'example');
  figure.append(drawStaff(columns.map((column) => ({
    notes: column.notes.map((note) => toWritten(note, notation)),
    label: column.chord ? chordName(column.chord, notation) : ''
  }))));
  figure.append(button('play-button', '▶ Play', () => playColumns(columns)));
  return figure;
}

const ARPEGGIO_COLUMN_WIDTH = 32;
const ARPEGGIO_CHORDS_PER_ROW = 2;

// 同じコードが続く譜例（ヴォイシングの比べ方など）では、アルペジオを1回にまとめる
function arpeggioChords(columns) {
  const chords = [];
  for (const column of columns) {
    if (!column.chord) continue;
    const previous = chords[chords.length - 1];
    if (previous && chordName(previous, 'concert') === chordName(column.chord, 'concert')) continue;
    chords.push(column.chord);
  }
  return chords;
}

const KEY_COUNT = 12;
const FOURTH_SEMITONES = 5;
// 画面を描き直しても（記譜の切り替えなど）、譜例ごとに選んだキーを覚えておく
const arpeggioKeys = new Map();

// ダブル♯♭は避け、C♭・F♭・E♯・B♯も読みにくいので同じ高さの別の綴りより不利にする
function spellingCost(note) {
  if (Math.abs(note.acc) >= 2) return 100;
  const odd = (note.acc === -1 && (note.letter === 0 || note.letter === 3)) || (note.acc === 1 && (note.letter === 2 || note.letter === 6));
  return Math.abs(note.acc) + (odd ? 2 : 0);
}

// 表示中の記譜で♯♭の付き方がいちばん読みやすくなる文字の進み方を選ぶ
function bestSpelling(chords, semitones, notation) {
  let best = null;
  // 文字を7つ進める（＝同じ文字で1オクターブ上）まで試すと、D→D♭のような綴りも候補に入る
  for (let letters = 0; letters <= 7; letters += 1) {
    const moved = chords.map((chord) => ({ ...chord, root: placeRoot(transpose(chord.root, letters, semitones)) }));
    const cost = moved.flatMap(chordNotes).reduce((sum, note) => sum + spellingCost(toWritten(note, notation)), 0);
    if (!best || cost < best.cost) best = { moved, cost };
  }
  return best.moved;
}

// 4度ずつ回したkeyIndex番目のキーへ移す。進行全体で綴りをそろえ、それでもダブル♯♭が残るコード（dim7など）だけ個別に綴り直す
function transposeChords(chords, keyIndex, notation) {
  if (keyIndex === 0) return chords;
  const semitones = (keyIndex * FOURTH_SEMITONES) % KEY_COUNT;
  return bestSpelling(chords, semitones, notation).map((chord, i) => {
    const hasDouble = chordNotes(chord).some((note) => spellingCost(toWritten(note, notation)) >= 100);
    return hasDouble ? bestSpelling([chords[i]], semitones, notation)[0] : chord;
  });
}

// 7(♯5)はキーによってどう綴ってもダブル♯♭が出るので、吹く譜面では同じ高さの隣の文字で書く
function readable(note) {
  if (note.acc >= 2) return transpose(note, 1, 0);
  if (note.acc <= -2) return transpose(note, -1, 0);
  return note;
}

// 1音ずつの列は狭くてよいので、2コードずつ1段にして小さな画面でも音符が小さくなりすぎないようにする
function arpeggioStaves(chords, notation) {
  const staves = [];
  for (let i = 0; i < chords.length; i += ARPEGGIO_CHORDS_PER_ROW) {
    const row = chords.slice(i, i + ARPEGGIO_CHORDS_PER_ROW).flatMap((chord) => chordNotes(chord).map((note, k) => ({
      notes: [readable(toWritten(note, notation))],
      label: k === 0 ? chordName(chord, notation) : ''
    })));
    staves.push(drawStaff(row, ARPEGGIO_COLUMN_WIDTH));
  }
  return staves;
}

function keyControls(id, redraw) {
  const keyIndex = arpeggioKeys.get(id) ?? 0;
  const step = (delta) => () => {
    arpeggioKeys.set(id, (keyIndex + delta + KEY_COUNT) % KEY_COUNT);
    redraw();
  };
  const row = el('div', 'arpeggio-controls');
  row.append(button('play-button', '◀ Prev key', step(-1)), el('span', 'key-label', `Key ${keyIndex + 1} / ${KEY_COUNT}`), button('play-button', 'Next key ▶', step(1)));
  return row;
}

function arpeggioFigure(columns, notation) {
  const original = arpeggioChords(columns);
  if (original.length === 0) return null;
  const id = original.map((chord) => chordName(chord, 'concert')).join(' ');
  const figure = el('figure', 'example');
  const redraw = () => {
    const chords = transposeChords(original, arpeggioKeys.get(id) ?? 0, notation);
    const sequence = chords.flatMap((chord) => chordNotes(chord).map((note) => ({ notes: [note], chord: null })));
    figure.replaceChildren(
      el('figcaption', 'note', 'Arpeggio (chord tones one at a time, from the bottom)'),
      ...arpeggioStaves(chords, notation),
      keyControls(id, redraw),
      button('play-button', '▶ Play arpeggio', () => playColumns(sequence))
    );
  };
  redraw();
  return figure;
}

function renderNotationBar() {
  const bar = document.getElementById('notation-bar');
  bar.replaceChildren();
  for (const [key, notation] of Object.entries(NOTATIONS)) {
    const option = button('segment', notation.label, () => {
      state.notation = key;
      saveSettings();
      renderNotationBar();
      render(false);
    });
    option.setAttribute('aria-pressed', String(key === state.notation));
    bar.append(option);
  }
}

function renderHome() {
  view.append(el('p', 'lead', 'Learn step by step from the basics: read, listen, and answer.'));
  let list = null;
  let section = null;
  state.units.forEach((unit, i) => {
    // 既存の単元に手を入れずに済むよう、sectionのない単元は「Basics」とみなす
    const unitSection = unit.section ?? 'Basics';
    if (unitSection !== section) {
      section = unitSection;
      list = el('ol', 'unit-list');
      view.append(el('h2', 'section-title', section), list);
    }
    const item = el('li');
    const best = state.progress[unit.id];
    const row = button('unit-button', '', () => { location.hash = `#/${unit.id}`; });
    const body = el('span', 'unit-body');
    body.append(el('span', 'unit-title', unit.title), el('span', 'unit-summary', unit.summary));
    row.append(el('span', 'unit-number', String(i + 1)), body, el('span', 'unit-score', best === undefined ? '' : `${best}/${QUIZ_LENGTH}`));
    item.append(row);
    list.append(item);
  });
}

function renderCard(card) {
  const article = el('article', 'card');
  article.append(el('h3', '', card.title));
  for (const paragraph of card.text) {
    const p = el('p');
    p.append(renderTokens(paragraph));
    article.append(p);
  }
  if (card.example) {
    const columns = exampleColumns(card.example);
    const notation = card.example.concert ? 'concert' : state.notation;
    article.append(staffFigure(columns, notation));
    if (card.example.concert) article.append(el('p', 'note', '* This example is always shown in concert pitch.'));
    const arpeggio = arpeggioFigure(columns, notation);
    if (arpeggio) article.append(arpeggio);
  }
  if (card.link) {
    const link = el('a', 'link-button', card.link.label);
    link.href = card.link.url;
    link.target = '_blank';
    link.rel = 'noopener';
    article.append(link);
  }
  return article;
}

function renderUnitHeader(unit, tab) {
  const header = el('div', 'unit-header');
  header.append(button('back-button', '‹ Units', () => { location.hash = ''; }), el('h2', '', unit.title));
  const tabs = el('div', 'tabs');
  for (const [key, label] of [['read', 'Read'], ['quiz', 'Practice']]) {
    const tabButton = button('tab', label, () => { location.hash = key === 'read' ? `#/${unit.id}` : `#/${unit.id}/quiz`; });
    tabButton.setAttribute('aria-pressed', String(key === tab));
    tabs.append(tabButton);
  }
  view.append(header, tabs);
}

function renderRead(unit) {
  unit.cards.forEach((card) => view.append(renderCard(card)));
  view.append(button('primary-button', 'Go to practice', () => { location.hash = `#/${unit.id}/quiz`; }));
}

function startQuiz(unit) {
  state.quiz = { unitId: unit.id, questions: buildQuiz(unit.quiz, QUIZ_LENGTH), index: 0, score: 0, chosen: null, played: -1 };
}

function choose(i) {
  const quiz = state.quiz;
  if (quiz.chosen !== null) return;
  quiz.chosen = i;
  if (i === quiz.questions[quiz.index].answer) quiz.score += 1;
  render(false);
}

function nextQuestion(unit) {
  const quiz = state.quiz;
  quiz.index += 1;
  quiz.chosen = null;
  if (quiz.index >= quiz.questions.length) {
    state.progress[unit.id] = Math.max(state.progress[unit.id] ?? 0, quiz.score);
    saveSettings();
  }
  render(false);
}

function renderFeedback(container, question, unit) {
  const quiz = state.quiz;
  const isCorrect = quiz.chosen === question.answer;
  const feedback = el('div', `feedback ${isCorrect ? 'is-correct' : 'is-wrong'}`);
  feedback.append(el('p', 'verdict', isCorrect ? 'Correct!' : 'Not quite'));
  const explain = el('p');
  explain.append(renderTokens(question.explain));
  feedback.append(explain, staffFigure(question.columns));
  const isLast = quiz.index + 1 >= quiz.questions.length;
  feedback.append(button('primary-button', isLast ? 'See results' : 'Next', () => nextQuestion(unit)));
  container.append(feedback);
}

function renderQuestion(unit) {
  const quiz = state.quiz;
  const question = quiz.questions[quiz.index];
  view.append(el('p', 'quiz-progress', `${quiz.index + 1} / ${quiz.questions.length}  Correct: ${quiz.score}`));
  const prompt = el('p', 'prompt');
  prompt.append(renderTokens(question.prompt));
  view.append(prompt);
  if (question.ear) view.append(button('play-button', '▶ Listen', () => playColumns(question.columns)));
  const choices = el('div', 'choices');
  question.choices.forEach((choice, i) => {
    const choiceButton = button('choice', '', () => choose(i));
    choiceButton.append(renderTokens(choice));
    if (quiz.chosen !== null) {
      choiceButton.disabled = true;
      if (i === question.answer) choiceButton.classList.add('is-answer');
      else if (i === quiz.chosen) choiceButton.classList.add('is-chosen');
    }
    choices.append(choiceButton);
  });
  view.append(choices);
  if (quiz.chosen !== null) renderFeedback(view, question, unit);
  // 聴く問題は表示した時点で一度だけ自動で鳴らす（記譜の切り替えで再描画しても鳴らし直さない）
  if (question.ear && quiz.played !== quiz.index) {
    quiz.played = quiz.index;
    playColumns(question.columns);
  }
}

function renderResult(unit) {
  const quiz = state.quiz;
  const result = el('div', 'result');
  result.append(el('p', 'result-score', `${quiz.score} of ${quiz.questions.length} correct`));
  // 7点以下は読み直す方へ、次の一歩を1つに絞ってすすめる
  const passed = quiz.score >= 8;
  result.append(el('p', '', passed ? 'Well done. On to the next unit.' : 'Review the Read section, then try again.'));
  if (!passed) result.append(button('primary-button', 'Review the reading', () => { location.hash = `#/${unit.id}`; }));
  result.append(button(passed ? 'primary-button' : 'secondary-button', 'Try again', () => { startQuiz(unit); render(false); }));
  result.append(button('secondary-button', 'Back to units', () => { location.hash = ''; }));
  view.append(result);
}

// 単元のデータはネットから新しい版を、プログラムは端末に保存した古い版を読むことがあるため、
// 問題が作れないときは空の画面にせず、新しい版を取りに行って読み直してもらう
function renderUpdating() {
  view.append(el('p', 'lead', 'Loading the new version. If nothing changes, tap Reload.'));
  view.append(button('primary-button', 'Reload', () => location.reload()));
  navigator.serviceWorker?.getRegistration().then((registration) => registration?.update());
}

function renderQuiz(unit) {
  if (!state.quiz || state.quiz.unitId !== unit.id) {
    try {
      startQuiz(unit);
    } catch {
      renderUpdating();
      return;
    }
  }
  if (state.quiz.index >= state.quiz.questions.length) renderResult(unit);
  else renderQuestion(unit);
}

// 画面の切り替えは #/単元id と #/単元id/quiz で表し、iPhoneの戻る操作にも対応させる
function render(scrollTop = true) {
  view.replaceChildren();
  const [unitId, tab] = location.hash.replace(/^#\//, '').split('/');
  const unit = state.units.find((item) => item.id === unitId);
  if (!unit) renderHome();
  else {
    renderUnitHeader(unit, tab === 'quiz' ? 'quiz' : 'read');
    if (tab === 'quiz') renderQuiz(unit);
    else renderRead(unit);
  }
  if (scrollTop) window.scrollTo(0, 0);
}

async function init() {
  loadSettings();
  renderNotationBar();
  // iPhoneの音の制限を外すため、どこをタップしても音声を準備する
  document.addEventListener('click', unlockAudio, true);
  document.addEventListener('touchend', unlockAudio, true);
  const response = await fetch('data/lessons.json');
  state.units = (await response.json()).units;
  window.addEventListener('hashchange', () => render());
  render();
  if (!('serviceWorker' in navigator)) return;
  // 新しい版に入れ替わったら1回だけ読み直す。初めて入れたときは読み直さない
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) location.reload();
  });
  navigator.serviceWorker.register('sw.js');
}

init();
