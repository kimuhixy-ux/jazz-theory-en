import {
  INTERVALS, QUALITIES, DIATONIC, MODES, NOTATIONS, parseNote, noteToText, noteToMidi, chordToText, chordNotes,
  addInterval, transpose, placeRoot, diatonicIndex, majorScale, modeScale, makeChord, twoFiveOne, minorTwoFiveOne, toWritten
} from './theory.js';

const DEGREE_NAMES = ['Root', '3rd', '5th', '7th'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// ♭のつくルートでm7♭5やdim7を作るとダブルフラットが出て読みにくいので、ルートを絞る
const HALF_DIMINISHED_ROOTS = ['C', 'D', 'E', 'G', 'A', 'B'];
const DIMINISHED_ROOTS = ['C#', 'E', 'F#', 'G#', 'A', 'B'];
// 7(♯5)は♯のつくルートだとアルト・テナーでダブルシャープになる
const AUGMENTED_ROOTS = ['C', 'Eb', 'F', 'G', 'Ab', 'Bb'];
const RESTRICTED_ROOTS = { m7b5: HALF_DIMINISHED_ROOTS, dim7: DIMINISHED_ROOTS, '7#5': AUGMENTED_ROOTS };

function randomChord(roots, qualities) {
  const quality = pick(qualities);
  const root = pick(RESTRICTED_ROOTS[quality] ?? roots);
  return makeChord(parseNote(root), quality);
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 画面側で記譜に合わせて書き換えられるよう、音名とコード名は印つきの文字列で持つ
const n = (note) => `{n:${noteToText(note)}}`;
const c = (chord) => `{c:${chordToText(chord)}}`;
const spell = (notes) => notes.map(n).join(' ');
const single = (note) => ({ notes: [note], chord: null });
const chordColumn = (chord) => ({ notes: chordNotes(chord), chord });

function makeQuestion({ prompt, correct, wrong, explain, columns, ear = false }) {
  const choices = shuffle([correct, ...wrong]);
  return { prompt, choices, answer: choices.indexOf(correct), explain, columns, ear };
}

function keyRoot(keys) {
  return placeRoot(parseNote(pick(keys)));
}

// 五線の中ほど（E4〜D5）に収めて、ガイドトーンを読みやすくする
function fitRange(note) {
  let octave = note.octave;
  while (octave * 7 + note.letter > 36) octave -= 1;
  while (octave * 7 + note.letter < 30) octave += 1;
  return { ...note, octave };
}

function guideColumn(chord) {
  const tones = chordNotes(chord);
  return { notes: [fitRange(tones[1]), fitRange(tones[3])], chord };
}

const earGenerators = {
  step() {
    const root = parseNote(pick(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B3']));
    const isHalf = Math.random() < 0.5;
    const upper = transpose(root, 1, isHalf ? 1 : 2);
    const answer = isHalf ? 'half step' : 'whole step';
    return makeQuestion({
      prompt: 'Is the distance between the two notes a half step or a whole step?', correct: answer, wrong: [isHalf ? 'whole step' : 'half step'],
      explain: `${n(root)} → ${n(upper)} is a ${answer}.`, columns: [single(root), single(upper)], ear: true
    });
  },
  interval({ list }) {
    const code = pick(list);
    const root = parseNote(pick(['C4', 'D4', 'F4', 'G3', 'A3']));
    const upper = addInterval(root, code);
    const { name, semitones } = INTERVALS[code];
    return makeQuestion({
      prompt: 'Which interval did you hear?', correct: name, wrong: list.filter((x) => x !== code).map((x) => INTERVALS[x].name),
      explain: `${n(root)} → ${n(upper)} is a ${name} (${semitones} half steps).`,
      columns: [{ notes: [root, upper], chord: null }], ear: true
    });
  },
  quality({ list }) {
    const chord = randomChord(['C', 'D', 'F', 'G', 'A', 'Bb', 'Eb'], list);
    const quality = chord.quality;
    const label = (q) => (QUALITIES[q].label ? `${QUALITIES[q].label} (${QUALITIES[q].name})` : QUALITIES[q].name);
    return makeQuestion({
      prompt: 'Which chord quality did you hear?', correct: label(quality), wrong: list.filter((x) => x !== quality).map(label),
      explain: `${c(chord)} = ${spell(chordNotes(chord))}`,
      columns: [{ notes: chordNotes(chord), chord: null }], ear: true
    });
  },
  progression({ keys }) {
    const root = keyRoot(keys);
    const chords = twoFiveOne(root);
    const romans = ['IIm7', 'V7', 'Imaj7'];
    const i = Math.floor(Math.random() * 3);
    return makeQuestion({
      prompt: 'Imaj7 sets the key first. What is the second chord?', correct: romans[i], wrong: romans.filter((_, j) => j !== i),
      explain: `Key of ${n(root)}: the second chord was ${c(chords[i])} (${romans[i]}).`,
      columns: [chordColumn(chords[2]), chordColumn(chords[i])], ear: true
    });
  }
};

const readGenerators = {
  intervalName({ list }) {
    const code = pick(list);
    const root = parseNote(pick(['C4', 'D4', 'F4', 'G3', 'A3']));
    const upper = addInterval(root, code);
    const wrong = shuffle(list.filter((x) => x !== code)).slice(0, 3).map((x) => INTERVALS[x].name);
    return makeQuestion({
      prompt: `What is the interval from ${n(root)} up to ${n(upper)}?`, correct: INTERVALS[code].name, wrong,
      explain: `It spans ${INTERVALS[code].semitones} half steps, so it is a ${INTERVALS[code].name}.`,
      columns: [{ notes: [root, upper], chord: null }]
    });
  },
  scaleDegree({ keys }) {
    const root = keyRoot(keys);
    const scale = majorScale(root);
    const i = 1 + Math.floor(Math.random() * 6);
    const wrong = shuffle(scale.filter((_, j) => j !== i && j !== 0)).slice(0, 3).map(n);
    return makeQuestion({
      prompt: `In the ${n(root)} major scale, what is note number ${i + 1}?`, correct: n(scale[i]), wrong,
      explain: `Key of ${n(root)}: ${spell(scale)}`, columns: scale.map(single)
    });
  },
  chordTone({ roots, qualities }) {
    const chord = randomChord(roots, qualities);
    const tones = chordNotes(chord);
    const i = 1 + Math.floor(Math.random() * (tones.length - 1));
    return makeQuestion({
      prompt: `What is the ${DEGREE_NAMES[i]} of ${c(chord)}?`, correct: n(tones[i]),
      wrong: tones.filter((_, j) => j !== i).map(n),
      explain: `${c(chord)} = ${spell(tones)} (${DEGREE_NAMES.slice(0, tones.length).join(', ')})`,
      columns: [chordColumn(chord)]
    });
  },
  diatonic({ keys }) {
    const root = keyRoot(keys);
    const scale = majorScale(root);
    const i = Math.floor(Math.random() * 7);
    const { quality, roman } = DIATONIC[i];
    const chord = makeChord(scale[i], quality);
    const otherQualities = shuffle(['maj7', '7', 'm7', 'm7b5'].filter((q) => q !== quality)).slice(0, 2);
    const neighbor = makeChord(scale[(i + 1) % 7], DIATONIC[(i + 1) % 7].quality);
    return makeQuestion({
      prompt: `What is ${roman} in the key of ${n(root)}?`, correct: c(chord),
      wrong: [...otherQualities.map((q) => c(makeChord(scale[i], q))), c(neighbor)],
      explain: `Stack scale notes only on note ${i + 1}, ${n(scale[i])}, and you get ${c(chord)}.`,
      columns: [chordColumn(chord)]
    });
  },
  twoFive({ keys }) {
    const root = keyRoot(keys);
    const chords = twoFiveOne(root);
    const line = (list) => list.map(c).join(' → ');
    const swapped = [makeChord(chords[0].root, '7'), makeChord(chords[1].root, 'm7'), chords[2]];
    return makeQuestion({
      prompt: `What is the II–V–I in the key of ${n(root)}?`, correct: line(chords),
      wrong: [line(twoFiveOne(addInterval(root, 'P4'))), line(twoFiveOne(addInterval(root, 'P5'))), line(swapped)],
      explain: `m7 on the 2nd note → 7 on the 5th note → maj7 on the 1st note.`,
      columns: chords.map(chordColumn)
    });
  },
  guideTone({ keys }) {
    const [two, five, one] = twoFiveOne(keyRoot(keys));
    const variant = pick([
      { from: two, to: five, fromDegree: 3, answerDegree: 1 },
      { from: five, to: one, fromDegree: 3, answerDegree: 1 },
      { from: two, to: five, fromDegree: 1, answerDegree: 3, askDegree: true }
    ]);
    const fromTone = chordNotes(variant.from)[variant.fromDegree];
    const toTones = chordNotes(variant.to);
    const columns = [guideColumn(variant.from), guideColumn(variant.to)];
    if (variant.askDegree) {
      return makeQuestion({
        prompt: `The 3rd of ${c(variant.from)}, ${n(fromTone)}, stays put. What is it in the next chord, ${c(variant.to)}?`,
        correct: '7th', wrong: ['Root', '3rd', '5th'],
        explain: `${n(fromTone)} doesn't move and becomes the 7th of ${c(variant.to)}.`, columns
      });
    }
    return makeQuestion({
      prompt: `The 7th of ${c(variant.from)}, ${n(fromTone)}, drops a half step into ${c(variant.to)}. What note does it become?`,
      correct: n(toTones[1]), wrong: [toTones[0], toTones[2], toTones[3]].map(n),
      explain: `${n(fromTone)} drops a half step to ${n(toTones[1])} (the 3rd of ${c(variant.to)}).`, columns
    });
  }
};

const TENSIONS = { maj7: ['M9', 'A11', 'M13'], 7: ['M9', 'm9', 'A9', 'M13'], m7: ['M9', 'P11'] };
const SCALE_FOR = { maj7: 'ionian', m7: 'dorian', 7: 'mixolydian', m7b5: 'locrian' };
const QUALITY_FOR_MODE = { ionian: 'maj7', dorian: 'm7', mixolydian: '7', locrian: 'm7b5', lydian: 'maj7', lydianDominant: '7' };
const BLUES_FORM = [['I7'], ['IV7'], ['I7'], ['I7'], ['IV7'], ['IV7'], ['I7'], ['VI7'], ['IIm7'], ['V7'], ['I7', 'VI7'], ['IIm7', 'V7']];
const BLUES_ROMANS = { I7: [null, '7'], IV7: ['P4', '7'], V7: ['P5', '7'], VI7: ['M6', '7'], IIm7: ['M2', 'm7'] };

const line = (chords) => chords.map(c).join(' → ');

// アルト・テナーに直したときにダブルシャープ・ダブルフラットになる音は、出題に使わない
const isPlain = (note) => Object.keys(NOTATIONS).every((key) => Math.abs(toWritten(note, key).acc) < 2);

// 同じ高さの音が選択肢に並ばないよう、音の高さ（12で割った余り）が違うものだけ選ぶ
function distinctWrong(pool, correct, count) {
  const used = new Set([noteToMidi(correct) % 12]);
  const result = [];
  for (const note of shuffle(pool.filter(isPlain))) {
    const pitchClass = noteToMidi(note) % 12;
    if (used.has(pitchClass)) continue;
    used.add(pitchClass);
    result.push(note);
  }
  return result.slice(0, count);
}

function bluesChord(keyRootNote, roman) {
  const [interval, quality] = BLUES_ROMANS[roman];
  return makeChord(interval ? addInterval(keyRootNote, interval) : keyRootNote, quality);
}

const stepUpEarGenerators = {
  twoFiveMode({ keys }) {
    const root = keyRoot(keys);
    const isMinor = Math.random() < 0.5;
    const answer = isMinor ? 'Minor' : 'Major';
    const chords = isMinor ? minorTwoFiveOne(root) : twoFiveOne(root);
    return makeQuestion({
      prompt: 'Which II–V–I did you hear?', correct: answer, wrong: [isMinor ? 'Major' : 'Minor'],
      explain: `${answer}: ${line(chords)}`, columns: chords.map(chordColumn), ear: true
    });
  },
  subEar({ keys }) {
    const [two, five, one] = twoFiveOne(keyRoot(keys));
    const isSub = Math.random() < 0.5;
    const middle = isSub ? makeChord(addInterval(five.root, 'd5'), '7') : five;
    const answer = isSub ? 'Tritone sub (♭II7)' : 'V7';
    return makeQuestion({
      prompt: 'Is the middle chord V7 or a tritone sub?', correct: answer, wrong: [isSub ? 'V7' : 'Tritone sub (♭II7)'],
      explain: `${line([two, middle, one])}. With the tritone sub, the bass walks down in half steps.`,
      columns: [two, middle, one].map(chordColumn), ear: true
    });
  },
  // qualityを渡すと、どのスケールでも同じコードを鳴らす（コードの違いで答えがわからないように）
  modeEar({ list, quality }) {
    const mode = pick(list);
    const root = parseNote(pick(['C4', 'D4', 'F4', 'G3']));
    const chord = makeChord(root, quality ?? QUALITY_FOR_MODE[mode]);
    const scale = modeScale(chord.root, mode);
    return makeQuestion({
      prompt: 'A chord plays, then a scale. Which scale is it?', correct: MODES[mode].name,
      wrong: list.filter((x) => x !== mode).map((x) => MODES[x].name),
      explain: `${MODES[mode].name} over ${c(chord)}: ${spell(scale)}`,
      columns: [chordColumn(chord), ...scale.map(single)], ear: true
    });
  }
};

const stepUpReadGenerators = {
  // codesを渡すと、7のコードの指定したテンション（オルタードなど）だけを出す
  tension({ roots, codes }) {
    let chord;
    let code;
    let target;
    do {
      chord = randomChord(roots, codes ? ['7'] : Object.keys(TENSIONS));
      code = pick(codes ?? TENSIONS[chord.quality]);
      target = addInterval(chord.root, code);
    } while (!isPlain(target));
    const pool = [...chordNotes(chord).slice(1), ...['m9', 'M9', 'A9', 'P11', 'A11', 'm13', 'M13'].map((x) => addInterval(chord.root, x))];
    return makeQuestion({
      prompt: `What is the ${INTERVALS[code].name} of ${c(chord)}?`, correct: n(target), wrong: distinctWrong(pool, target, 3).map(n),
      explain: `The 9th, 11th and 13th are the 2nd, 4th and 6th counted an octave up. The ${INTERVALS[code].name} of ${c(chord)} is ${n(target)}.`,
      columns: [{ notes: [...chordNotes(chord), target], chord }]
    });
  },
  minorTwoFive({ keys }) {
    const root = keyRoot(keys);
    const chords = minorTwoFiveOne(root);
    const broken = [makeChord(chords[0].root, 'm7'), makeChord(chords[1].root, 'maj7'), chords[2]];
    return makeQuestion({
      prompt: `What is the II–V–I in ${n(root)} minor?`, correct: line(chords),
      wrong: [line(twoFiveOne(root)), line(minorTwoFiveOne(addInterval(root, 'P4'))), line(broken)],
      explain: 'm7♭5 on the 2nd note → 7(♭9) on the 5th note → m7 on the 1st note.', columns: chords.map(chordColumn)
    });
  },
  secondary({ keys }) {
    const root = keyRoot(keys);
    const scale = majorScale(root);
    const targets = [1, 2, 3, 4, 5];
    const i = pick(targets);
    const target = makeChord(scale[i], DIATONIC[i].quality);
    const dominantOf = (j) => makeChord(addInterval(scale[j], 'P5'), '7');
    const dominant = dominantOf(i);
    const others = shuffle(targets.filter((j) => j !== i)).slice(0, 2).map(dominantOf);
    return makeQuestion({
      prompt: `In the key of ${n(root)}, what is the secondary dominant leading to ${c(target)} (${DIATONIC[i].roman})?`,
      correct: c(dominant), wrong: [c(makeChord(dominant.root, 'm7')), ...others.map(c)],
      explain: `Build a 7 chord on ${n(dominant.root)}, a perfect 5th above ${n(scale[i])} (the root of ${c(target)}): ${c(dominant)}.`,
      columns: [chordColumn(dominant), chordColumn(target)]
    });
  },
  tritoneSub({ roots }) {
    const dominant = makeChord(parseNote(pick(roots)), '7');
    const sub = makeChord(addInterval(dominant.root, 'd5'), '7');
    if (Math.random() < 0.5) {
      return makeQuestion({
        prompt: `What is the tritone sub for ${c(dominant)}?`, correct: c(sub),
        wrong: ['m3', 'M2', 'P4'].map((x) => c(makeChord(addInterval(dominant.root, x), '7'))),
        explain: `The tritone sub is the 7 chord on ${n(sub.root)}, 6 half steps away from the root ${n(dominant.root)}.`,
        columns: [chordColumn(dominant), chordColumn(sub)]
      });
    }
    const third = chordNotes(dominant)[1];
    return makeQuestion({
      prompt: `The 3rd of ${c(dominant)} is ${n(third)}. What is it in the tritone sub ${c(sub)}?`, correct: '7th', wrong: ['Root', '3rd', '5th'],
      explain: `${n(third)} and ${n(chordNotes(sub)[3])}, the 7th of ${c(sub)}, are the same pitch (enharmonic). The 3rd and 7th trade places.`,
      columns: [guideColumn(dominant), guideColumn(sub)]
    });
  },
  blues({ keys }) {
    const root = keyRoot(keys);
    const bar = Math.floor(Math.random() * 10);
    const roman = BLUES_FORM[bar][0];
    const wrongRomans = shuffle(Object.keys(BLUES_ROMANS).filter((x) => x !== roman)).slice(0, 3);
    const row = BLUES_FORM.slice(Math.floor(bar / 4) * 4, Math.floor(bar / 4) * 4 + 4).flat();
    return makeQuestion({
      prompt: `In a jazz blues in ${n(root)}, what is the chord in bar ${bar + 1}?`, correct: c(bluesChord(root, roman)),
      wrong: wrongRomans.map((x) => c(bluesChord(root, x))),
      explain: `Bar ${bar + 1} is ${roman}. The example shows bars ${Math.floor(bar / 4) * 4 + 1}–${Math.floor(bar / 4) * 4 + 4}.`,
      columns: row.map((x) => chordColumn(bluesChord(root, x)))
    });
  },
  chordScale({ roots }) {
    const chord = randomChord(roots, Object.keys(SCALE_FOR));
    const mode = SCALE_FOR[chord.quality];
    const scale = modeScale(chord.root, mode);
    return makeQuestion({
      prompt: `What is the basic scale for ${c(chord)}?`, correct: MODES[mode].name,
      wrong: Object.values(SCALE_FOR).filter((x) => x !== mode).map((x) => MODES[x].name),
      explain: `${c(chord)} takes ${MODES[mode].name}: ${spell(scale)}`,
      columns: [chordColumn(chord), ...scale.map(single)]
    });
  }
};

// どちらか2択の聴き取り問題をまとめて作る
function earPair({ prompt, options, explainOf }) {
  const [answer, other] = shuffle(Object.keys(options));
  return makeQuestion({
    prompt, correct: answer, wrong: [other], explain: explainOf(options[answer]),
    columns: options[answer].map(chordColumn), ear: true
  });
}

const QUALITY_SET = ['m7', '7', 'maj7', 'm7b5'];

// 空欄の位置のコードを、同じルートのほかの種類や進行中のほかのコードと紛らわせて問う
function fillBlank({ prompt, chords, blankFrom, explain }) {
  const k = blankFrom + Math.floor(Math.random() * (chords.length - blankFrom));
  const answer = chords[k];
  const shown = chords.map((x, i) => (i === k ? '?' : c(x))).join(' → ');
  const wrong = QUALITY_SET.filter((q) => q !== answer.quality).map((q) => c(makeChord(answer.root, q)));
  return makeQuestion({
    prompt: `${prompt}　${shown}`, correct: c(answer), wrong: shuffle(wrong).slice(0, 3),
    explain, columns: chords.map(chordColumn)
  });
}

function subdominantMinorSet(root) {
  return {
    'IVm7': makeChord(addInterval(root, 'P4'), 'm7'),
    '♭VII7': makeChord(addInterval(root, 'm7'), '7'),
    '♭VImaj7': makeChord(addInterval(root, 'm6'), 'maj7'),
    'IVmaj7': makeChord(addInterval(root, 'P4'), 'maj7'),
    'V7': makeChord(addInterval(root, 'P5'), '7')
  };
}

const advancedGenerators = {
  passingDim({ keys }) {
    const root = keyRoot(keys);
    const scale = majorScale(root);
    // I→II、II→III、IV→V、V→VI の間に、半音上げたルートのdim7をはさむ
    const [from, to] = pick([[0, 1], [1, 2], [3, 4], [4, 5]]);
    const fromChord = makeChord(scale[from], DIATONIC[from].quality);
    const toChord = makeChord(scale[to], DIATONIC[to].quality);
    const raised = transpose(scale[from], 0, 1);
    const dim = makeChord(raised, 'dim7');
    return makeQuestion({
      prompt: `In the key of ${n(root)}, which passing diminished chord goes between ${c(fromChord)} and ${c(toChord)}?`, correct: c(dim),
      wrong: [c(makeChord(raised, 'm7')), c(makeChord(raised, '7')), c(makeChord(scale[to], 'dim7'))],
      explain: `dim7 on ${n(raised)}, a half step above ${n(scale[from])}. The bass climbs by half steps: ${n(scale[from])}→${n(raised)}→${n(scale[to])}.`,
      columns: [fromChord, dim, toChord].map(chordColumn)
    });
  },
  dimAsDominant({ roots }) {
    const dominant = makeChord(parseNote(pick(roots)), '7b9');
    const dim = makeChord(addInterval(dominant.root, 'M3'), 'dim7');
    return makeQuestion({
      prompt: `${c(dim)} is which 7(♭9) chord with its root left out?`, correct: c(dominant),
      wrong: ['M2', 'P4', 'P5'].map((x) => c(makeChord(addInterval(dominant.root, x), '7b9'))),
      explain: `The 3rd, 5th, 7th and ♭9th of ${c(dominant)} (${spell(chordNotes(dominant).slice(1))}) form ${c(dim)}.`,
      columns: [chordColumn(dominant), chordColumn(dim)]
    });
  },
  subMinor({ keys }) {
    const root = keyRoot(keys);
    const set = subdominantMinorSet(root);
    const roman = pick(['IVm7', '♭VII7', '♭VImaj7']);
    const wrong = shuffle(Object.keys(set).filter((x) => x !== roman)).slice(0, 3);
    return makeQuestion({
      prompt: `What is ${roman} in the key of ${n(root)}?`, correct: c(set[roman]), wrong: wrong.map((x) => c(set[x])),
      explain: `${roman} is borrowed from the parallel minor key. In the key of ${n(root)} it is ${c(set[roman])}.`,
      columns: [chordColumn(set[roman]), chordColumn(makeChord(root, 'maj7'))]
    });
  },
  backdoorEar({ keys }) {
    const root = keyRoot(keys);
    const set = subdominantMinorSet(root);
    const tonic = makeChord(root, 'maj7');
    return earPair({
      prompt: 'The two chords before Imaj7: II–V or backdoor?',
      options: { 'II–V (IIm7 → V7)': twoFiveOne(root), 'Backdoor (IVm7 → ♭VII7)': [set.IVm7, set['♭VII7'], tonic] },
      explainOf: (chords) => chords.map(c).join(' → ')
    });
  },
  relatedTwo({ roots }) {
    const dominant = makeChord(parseNote(pick(roots)), '7');
    const two = makeChord(addInterval(dominant.root, 'P5'), 'm7');
    const target = addInterval(dominant.root, 'P4');
    return makeQuestion({
      prompt: `What is the related IIm7 that pairs with ${c(dominant)}?`, correct: c(two),
      wrong: [c(makeChord(addInterval(dominant.root, 'M2'), 'm7')), c(makeChord(target, 'm7')), c(makeChord(two.root, 'm7b5'))],
      explain: `${c(two)} is the IIm7 of ${n(target)}, where ${c(dominant)} resolves. Its root is a perfect 5th above ${c(dominant)}.`,
      columns: [chordColumn(two), chordColumn(dominant)]
    });
  },
  chain({ keys }) {
    const root = keyRoot(keys);
    const scale = majorScale(root);
    const chords = [makeChord(scale[2], 'm7'), makeChord(scale[5], '7'), makeChord(scale[1], 'm7'), makeChord(scale[4], '7'), makeChord(root, 'maj7')];
    return fillBlank({
      prompt: `A chain of II–Vs in ${n(root)}. Which chord goes in the ?`, chords, blankFrom: 0,
      explain: `m7 → 7 pairs keep falling by perfect 5ths: ${line(chords)}`
    });
  },
  ninthEar({ roots }) {
    const root = parseNote(pick(roots));
    return earPair({
      prompt: 'Did you hear 7(9) or 7(♭9)?',
      options: { '7(9)': [makeChord(root, '9')], '7(♭9)': [makeChord(root, '7b9')] },
      explainOf: ([chord]) => `${c(chord)} = ${spell(chordNotes(chord))}`
    });
  },
  resolveTension({ keys }) {
    const root = keyRoot(keys);
    const dominant = makeChord(addInterval(root, 'P5'), '7');
    const isMinor = Math.random() < 0.5;
    const tonic = makeChord(root, isMinor ? 'm7' : 'maj7');
    const pair = (codes) => codes.map((x) => n(addInterval(dominant.root, x))).join(', ');
    const natural = pair(['M9', 'M13']);
    const altered = pair(['m9', 'm13']);
    return makeQuestion({
      prompt: `${c(dominant)} → ${c(tonic)}. Which tensions fit ${c(dominant)} naturally?`,
      correct: isMinor ? altered : natural, wrong: [isMinor ? natural : altered],
      explain: isMinor ? `Resolving to minor, use ♭9th and ♭13th (${altered}). They match the notes of the key.` : `Resolving to major, use 9th and 13th (${natural}). They match the notes of the key.`,
      columns: [chordColumn(dominant), chordColumn(tonic)]
    });
  },
  coltrane({ keys }) {
    const root = keyRoot(keys);
    // 長3度ずつ下がる3つのキー。それぞれの前に、そのキーのV7を置く
    const second = addInterval(root, 'm6');
    const third = addInterval(root, 'M3');
    const fiveOf = (key) => makeChord(addInterval(key, 'P5'), '7');
    const chords = [makeChord(root, 'maj7'), fiveOf(second), makeChord(second, 'maj7'), fiveOf(third), makeChord(third, 'maj7')];
    return fillBlank({
      prompt: `Coltrane changes starting on ${n(root)}. Which chord goes in the ?`, chords, blankFrom: 1,
      explain: `Three keys falling by major 3rds, ${n(root)}, ${n(second)}, ${n(third)}, linked with V7 → Imaj7: ${line(chords)}`
    });
  }
};

// 上にのせる三和音が下のコードと重ならないよう、いちばん上の音より高くなるまでオクターブを上げる
function placeAbove(notes, top) {
  const shift = Math.max(0, Math.ceil((diatonicIndex(top) + 1 - diatonicIndex(notes[0])) / 7));
  return notes.map((x) => ({ ...x, octave: x.octave + shift }));
}

// 7のコードの上にのせる三和音（ルートからの音程）と、それで加わる音
const UPPER_TRIADS = [
  { interval: 'M2', added: '9th, ♯11th, 13th' },
  { interval: 'm6', added: '♭13th, root, ♯9th' },
  { interval: 'M6', added: '13th, ♭9th, 3rd' },
  { interval: 'd5', added: '♯11th, 7th, ♭9th' }
];

function upperStructure(roots) {
  const dominant = makeChord(parseNote(pick(roots)), '7');
  const shell = [0, 1, 3].map((i) => chordNotes(dominant)[i]);
  const entries = UPPER_TRIADS.map((x) => ({ ...x, triad: makeChord(addInterval(dominant.root, x.interval), '') }));
  const answer = pick(entries);
  const columns = [{ notes: [...shell, ...placeAbove(chordNotes(answer.triad), shell[2])], chord: dominant }];
  return { dominant, entries, answer, columns };
}

const CLICHE = ['m', 'mMaj7', 'm7', 'm6'];

const developGenerators = {
  susFour({ roots }) {
    const sus = makeChord(parseNote(pick(roots)), '7sus4');
    const dominant = makeChord(sus.root, '7');
    const fourth = addInterval(sus.root, 'P4');
    const third = addInterval(sus.root, 'M3');
    const wrong = distinctWrong(['M3', 'P5', 'm7', 'M2'].map((x) => addInterval(sus.root, x)), fourth, 3);
    return makeQuestion({
      prompt: `In ${c(sus)}, which note takes the place of the 3rd?`, correct: n(fourth), wrong: wrong.map(n),
      explain: `${c(sus)} = ${spell(chordNotes(sus))}. When the 4th, ${n(fourth)}, drops a half step to the 3rd, ${n(third)}, you get ${c(dominant)}.`,
      columns: [chordColumn(sus), chordColumn(dominant)]
    });
  },
  susAsTwo({ roots }) {
    const sus = makeChord(parseNote(pick(roots)), '7sus4');
    const two = makeChord(addInterval(sus.root, 'P5'), 'm7');
    return makeQuestion({
      prompt: `${c(sus)} sounds close to which m7 played over ${n(sus.root)}?`, correct: c(two),
      wrong: ['M2', 'P4', 'M6'].map((x) => c(makeChord(addInterval(sus.root, x), 'm7'))),
      explain: `Play ${c(two)} (IIm7) over ${n(sus.root)}, the V, and you get a sus4 sound, like II and V at once.`,
      columns: [chordColumn(two), chordColumn(sus)]
    });
  },
  raisedFour({ roots }) {
    const mode = pick(['lydian', 'lydianDominant']);
    const chord = makeChord(parseNote(pick(roots)), QUALITY_FOR_MODE[mode]);
    const scale = modeScale(chord.root, mode);
    const wrong = distinctWrong(['P4', 'P5', 'M3', 'M6'].map((x) => addInterval(chord.root, x)), scale[3], 3);
    return makeQuestion({
      prompt: `In ${n(chord.root)} ${MODES[mode].name}, what is the 4th note?`, correct: n(scale[3]), wrong: wrong.map(n),
      explain: `${MODES[mode].name} raises the 4th note a half step: ${spell(scale)}. That note is the ♯11th of ${c(chord)}.`,
      columns: [chordColumn(chord), ...scale.map(single)]
    });
  },
  quartalStack({ roots }) {
    const root = parseNote(pick(roots));
    const stack = (codes) => codes.reduce((notes, code) => [...notes, addInterval(notes.at(-1), code)], [root]);
    const correct = stack(['P4', 'P4', 'P4']);
    const wrong = [['M3', 'm3', 'M3'], ['m3', 'M3', 'm3'], ['P4', 'M3', 'P4']].map(stack);
    return makeQuestion({
      prompt: `Which notes do you get stacking three perfect 4ths from ${n(root)}?`, correct: spell(correct), wrong: wrong.map(spell),
      explain: `${spell(correct)}. Every neighboring pair is a perfect 4th, so the sound floats without a clear key.`,
      columns: [{ notes: correct, chord: null }]
    });
  },
  quartalEar({ roots }) {
    const root = parseNote(pick(roots));
    const fourths = [root, ...[1, 2, 3].map((i) => transpose(root, i * 3, i * 5))];
    const options = { 'Fourths': fourths, 'Thirds (m7)': chordNotes(makeChord(root, 'm7')) };
    const [answer, other] = shuffle(Object.keys(options));
    return makeQuestion({
      prompt: 'Did you hear a stack of fourths or thirds?', correct: answer, wrong: [other],
      explain: `${answer}: ${spell(options[answer])}`,
      columns: [{ notes: options[answer], chord: null }], ear: true
    });
  },
  upperTensions({ roots }) {
    const { dominant, entries, answer, columns } = upperStructure(roots);
    return makeQuestion({
      prompt: `Put a ${c(answer.triad)} triad over ${c(dominant)}. Which notes does it add?`, correct: answer.added,
      wrong: entries.filter((x) => x !== answer).map((x) => x.added),
      explain: `${c(answer.triad)} = ${spell(chordNotes(answer.triad))}. Against ${c(dominant)} these are ${answer.added}.`,
      columns
    });
  },
  upperTriad({ roots }) {
    const { dominant, entries, answer, columns } = upperStructure(roots);
    return makeQuestion({
      prompt: `You want to add ${answer.added} to ${c(dominant)}. Which triad goes on top?`, correct: c(answer.triad),
      wrong: entries.filter((x) => x !== answer).map((x) => c(x.triad)),
      explain: `Putting ${c(answer.triad)} (${spell(chordNotes(answer.triad))}) on top adds ${answer.added}.`,
      columns
    });
  },
  cliche({ roots }) {
    const root = parseNote(pick(roots));
    const chords = CLICHE.map((q) => makeChord(root, q));
    const k = 1 + Math.floor(Math.random() * 3);
    const shown = chords.map((x, i) => (i === k ? '?' : c(x))).join(' → ');
    const moving = [root, ...['M7', 'm7', 'M6'].map((x) => addInterval(root, x))].map((x, i) => (i === 0 ? { ...x, octave: x.octave + 1 } : x));
    return makeQuestion({
      prompt: `Line cliché. Which chord goes in the ?  ${shown}`, correct: c(chords[k]),
      wrong: chords.filter((_, i) => i !== k).map(c),
      explain: `${line(chords)}. The moving voice falls by half steps: ${spell(moving)}.`,
      columns: chords.map(chordColumn)
    });
  }
};

// スケールの特徴をひと言で添えて、覚える手がかりにする
const SCALE_HINT = {
  dorian: 'natural minor with the 6th raised a half step',
  mixolydian: 'the major scale with the 7th lowered a half step',
  lydianDominant: 'Mixolydian with the 4th raised a half step',
  melodicMinor: 'Dorian with the 7th raised a half step',
  altered: 'everything except the root, 3rd and 7th shifted by a half step',
  halfWhole: 'an 8-note pattern alternating half and whole steps',
  wholeTone: 'a 6-note scale made only of whole steps'
};

// 7のコードで使いたいテンションと、それを含むスケール
const DOMINANT_SCALES = {
  mixolydian: ['M9', 'M13'],
  lydianDominant: ['M9', 'A11', 'M13'],
  halfWhole: ['m9', 'A9', 'M13'],
  altered: ['m9', 'A9', 'm13'],
  wholeTone: ['M9', 'A11', 'A5']
};
const tensionLabel = (codes) => codes.map((x) => (x === 'A5' ? '♯5' : INTERVALS[x].name)).join(', ');

// 求めるテンションをすべて含むスケールは正解とも言えるので、不正解の選択肢から外す
function containsAll(root, mode, codes) {
  const pitches = new Set(modeScale(root, mode).map((x) => noteToMidi(x) % 12));
  return codes.every((x) => pitches.has(noteToMidi(addInterval(root, x)) % 12));
}

const applyGenerators = {
  whichScale({ roots, modes, quality }) {
    const mode = pick(modes);
    const chord = makeChord(parseNote(pick(roots)), quality);
    const scale = modeScale(chord.root, mode);
    return makeQuestion({
      prompt: `Over ${c(chord)}: ${spell(scale)}. Which scale is this?`, correct: MODES[mode].name,
      wrong: modes.filter((x) => x !== mode).map((x) => MODES[x].name),
      explain: `${MODES[mode].name} is ${SCALE_HINT[mode]}.`,
      columns: [chordColumn(chord), ...scale.map(single)]
    });
  },
  notInScale({ roots, mode, quality, outside }) {
    const chord = makeChord(parseNote(pick(roots)), quality);
    const scale = modeScale(chord.root, mode);
    const answer = addInterval(chord.root, pick(outside));
    const wrong = distinctWrong(scale.slice(1), answer, 3);
    return makeQuestion({
      prompt: `Which note is NOT in ${n(chord.root)} ${MODES[mode].name}?`, correct: n(answer), wrong: wrong.map(n),
      explain: `${n(chord.root)} ${MODES[mode].name}: ${spell(scale)}. ${n(answer)} is not in it.`,
      columns: [chordColumn(chord), ...scale.map(single)]
    });
  },
  tensionToScale({ roots }) {
    const mode = pick(Object.keys(DOMINANT_SCALES));
    const chord = makeChord(parseNote(pick(roots)), '7');
    const scale = modeScale(chord.root, mode);
    const codes = DOMINANT_SCALES[mode];
    const others = Object.keys(DOMINANT_SCALES).filter((x) => x !== mode && !containsAll(chord.root, x, codes));
    const wrong = shuffle(others).slice(0, 3);
    return makeQuestion({
      prompt: `You want ${tensionLabel(codes)} on ${c(chord)}. Which scale fits?`, correct: MODES[mode].name,
      wrong: wrong.map((x) => MODES[x].name),
      explain: `${MODES[mode].name} (${SCALE_HINT[mode]}): ${spell(scale)}`,
      columns: [chordColumn(chord), ...scale.map(single)]
    });
  }
};

// アボイドノート：コードの音の半音上にぶつかるスケールの音（clashはぶつかる相手のコードの音の番号）
const AVOID = {
  maj7: { mode: 'ionian', avoid: 'P4', clash: 1 },
  7: { mode: 'mixolydian', avoid: 'P4', clash: 1 },
  m7b5: { mode: 'locrian', avoid: 'm2', clash: 0 }
};

// ビバップ・スケールは元のスケールに経過音を1つ足したもの
const BEBOP = {
  bebopDominant: { base: 'mixolydian', added: 'M7', quality: '7' },
  bebopMajor: { base: 'ionian', added: 'A5', quality: 'maj7' }
};

// コードのルートから見て、どこのメジャー・ペンタトニックを弾くとどの響きになるか
const PENTA_OVER = [
  { quality: 'maj7', interval: 'M2', sound: '♯11th' },
  { quality: '7', interval: 'd5', sound: 'altered (♭9th, ♯9th, ♯11th, ♭13th)' }
];

// ベース音の上にのせる三和音（ベースからの音程）と、全体の響き
const SLASH = [
  { interval: 'm7', sound: '9sus4' },
  { interval: 'M2', sound: 'Lydian (♯11th)' },
  { interval: 'm3', sound: 'm7' },
  { interval: 'm2', sound: 'Phrygian (sus4, ♭9th)' }
];

function slashVoicing(roots) {
  const root = parseNote(pick(roots));
  const bass = { ...placeRoot(root), octave: placeRoot(root).octave - 1 };
  const answer = pick(SLASH);
  const triad = makeChord(addInterval(root, answer.interval), '');
  const columns = [{ notes: [bass, ...placeAbove(chordNotes(triad), bass)], chord: null }];
  return { bass, triad, answer, columns, label: `${c(triad)}/${n(bass)}` };
}

// 密集して積んだ4音（転回形も）と、上から2番目を1オクターブ下げたドロップ2
function drop2Voicing(roots, qualities) {
  const chord = randomChord(roots, qualities);
  const tones = chordNotes(chord);
  const k = Math.floor(Math.random() * 4);
  const close = [...tones.slice(k), ...tones.slice(0, k).map((x) => ({ ...x, octave: x.octave + 1 }))];
  const dropped = { ...close[2], octave: close[2].octave - 1 };
  return { chord, close, drop: [dropped, close[0], close[1], close[3]] };
}

const masteryGenerators = {
  avoidNote({ roots, qualities }) {
    const chord = randomChord(roots, qualities);
    const rule = AVOID[chord.quality];
    const scale = modeScale(chord.root, rule.mode);
    const answer = addInterval(chord.root, rule.avoid);
    const clash = chordNotes(chord)[rule.clash];
    return makeQuestion({
      prompt: `On ${c(chord)} (${MODES[rule.mode].name}), which is the avoid note?`, correct: n(answer),
      wrong: distinctWrong([1, 3, 5].map((i) => scale[i]), answer, 2).map(n),
      explain: `${n(answer)} clashes a half step above the chord tone ${n(clash)}. Don't hold it; use it as a passing note.`,
      columns: [chordColumn(chord), ...scale.map(single)]
    });
  },
  passingTone({ roots, modes }) {
    const mode = pick(modes);
    const rule = BEBOP[mode];
    const chord = makeChord(parseNote(pick(roots)), rule.quality);
    const answer = addInterval(chord.root, rule.added);
    const wrong = distinctWrong(['m2', 'm3', 'd5', 'm6', 'M7', 'A5'].map((x) => addInterval(chord.root, x)), answer, 3);
    return makeQuestion({
      prompt: `In ${n(chord.root)} ${MODES[mode].name}, which passing note is added to ${MODES[rule.base].name}?`, correct: n(answer),
      wrong: wrong.map(n),
      explain: `${spell(modeScale(chord.root, mode))}. With 8 notes, descending from the root puts chord tones on the beats.`,
      columns: [chordColumn(chord), ...modeScale(chord.root, mode).map(single)]
    });
  },
  pentaOver({ roots }) {
    const entry = pick(PENTA_OVER);
    const chord = makeChord(parseNote(pick(roots)), entry.quality);
    const answer = addInterval(chord.root, entry.interval);
    const penta = modeScale(answer, 'majorPentatonic');
    return makeQuestion({
      prompt: `You want a ${entry.sound} sound on ${c(chord)}. Which major pentatonic do you play?`, correct: n(answer),
      wrong: [chord.root, ...['P4', 'P5'].map((x) => addInterval(chord.root, x))].map(n),
      explain: `${n(answer)} major pentatonic: ${spell(penta)}. Against ${c(chord)} it gives ${entry.sound}.`,
      columns: [chordColumn(chord), ...penta.map(single)]
    });
  },
  slashSound({ roots }) {
    const { triad, answer, columns, label } = slashVoicing(roots);
    return makeQuestion({
      prompt: `${label} (a ${c(triad)} triad over the bass). What sound is it?`, correct: answer.sound,
      wrong: SLASH.filter((x) => x !== answer).map((x) => x.sound),
      explain: `${spell(columns[0].notes)}. From the bass, it sounds ${answer.sound}.`,
      columns
    });
  },
  slashName({ roots }) {
    const { bass, triad, answer, columns, label } = slashVoicing(roots);
    const others = SLASH.filter((x) => x !== answer).map((x) => `${c(makeChord(addInterval(bass, x.interval), ''))}/${n(bass)}`);
    return makeQuestion({
      prompt: `How do you write a ${answer.sound} sound on ${n(bass)} as a slash chord?`, correct: label, wrong: others,
      explain: `Put ${c(triad)} (${spell(chordNotes(triad))}) over ${n(bass)}.`,
      columns
    });
  },
  drop2Bottom({ roots, qualities }) {
    const { chord, close, drop } = drop2Voicing(roots, qualities);
    return makeQuestion({
      prompt: `${c(chord)} is stacked ${spell(close)} (bottom up). As a drop 2, what is the lowest note?`, correct: n(drop[0]),
      wrong: distinctWrong(close, drop[0], 3).map(n),
      explain: `Drop the second note from the top, ${n(drop[0])}, an octave: ${spell(drop)}.`,
      columns: [{ notes: close, chord }, { notes: drop, chord }]
    });
  },
  drop2Ear({ roots, qualities }) {
    const { chord, close, drop } = drop2Voicing(roots, qualities);
    const options = { 'Close': close, 'Drop 2': drop };
    const [answer, other] = shuffle(Object.keys(options));
    return makeQuestion({
      prompt: 'Did you hear close or drop 2?', correct: answer, wrong: [other],
      explain: `${answer} voicing of ${c(chord)}: ${spell(options[answer])}`,
      columns: [{ notes: options[answer], chord }], ear: true
    });
  }
};

// ソー・ホワット・ヴォイシング：ルートから完全4度を3つ、いちばん上だけ長3度
const SO_WHAT = ['P4', 'P4', 'P4', 'M3'];
const stackFrom = (root, codes) => codes.reduce((notes, code) => [...notes, addInterval(notes.at(-1), code)], [root]);

// ずらした先のドリアンに♯♯や♭♭が出ないよう、2通りの綴り（例：D♭とC♯）から読みやすいほうを選ぶ
function slipRoot(root, up) {
  const spellings = up ? [addInterval(root, 'm2'), addInterval(root, 'A1')] : [transpose(root, -1, -1), transpose(root, 0, -1)];
  return spellings.find((x) => modeScale(x, 'dorian').every(isPlain)) ?? spellings[0];
}

// 書きかえの技ごとに、元の進行と書きかえた進行を[キーからの音程, コードの種類]で持つ（nullはキーの音）
const REHARMS = {
  'Tritone sub': [[['M2', 'm7'], ['P5', '7'], [null, 'maj7']], [['M2', 'm7'], ['m2', '7'], [null, 'maj7']]],
  'Secondary dominant': [[[null, 'maj7'], ['M6', 'm7'], ['M2', 'm7'], ['P5', '7']], [[null, 'maj7'], ['M6', '7'], ['M2', 'm7'], ['P5', '7']]],
  'Passing diminished': [[[null, 'maj7'], [null, 'maj7'], ['M2', 'm7'], ['P5', '7']], [[null, 'maj7'], ['A1', 'dim7'], ['M2', 'm7'], ['P5', '7']]],
  'Backdoor': [[['M2', 'm7'], ['P5', '7'], [null, 'maj7']], [['P4', 'm7'], ['m7', '7'], [null, 'maj7']]]
};
const REHARM_HINT = {
  'Tritone sub': 'V7 was replaced by the 7 chord a diminished 5th away, which shares its 3rd and 7th.',
  'Secondary dominant': 'A chord became the 7 chord leading to the next one, for a stronger pull.',
  'Passing diminished': 'A dim7 was slipped between two chords so the bass climbs by a half step.',
  'Backdoor': 'Instead of IIm7 → V7, it returns to I from IVm7 → ♭VII7.'
};
const fromKey = (key, [interval, quality]) => makeChord(interval ? addInterval(key, interval) : key, quality);

const masterGenerators = {
  soWhatTop({ roots }) {
    const chord = makeChord(parseNote(pick(roots)), 'm7');
    const notes = stackFrom(chord.root, SO_WHAT);
    return makeQuestion({
      prompt: `So What voicing of ${c(chord)}. Which note goes on top of ${spell(notes.slice(0, 4))}?`, correct: n(notes[4]),
      wrong: distinctWrong(['P4', 'm3', 'm2'].map((x) => addInterval(notes[3], x)), notes[4], 3).map(n),
      explain: `Only the top interval is a major 3rd: ${spell(notes)}. The 5th of ${c(chord)} lands on top and the minor sound comes through.`,
      columns: [{ notes, chord }]
    });
  },
  soWhatStack({ roots }) {
    const chord = makeChord(parseNote(pick(roots)), 'm7');
    const notes = stackFrom(chord.root, SO_WHAT);
    const wrong = [['P4', 'P4', 'P4', 'P4'], ['m3', 'M3', 'm3', 'M3'], ['M3', 'P4', 'P4', 'P4']].map((x) => spell(stackFrom(chord.root, x)));
    return makeQuestion({
      prompt: `What is the So What voicing of ${c(chord)}? (bottom up)`, correct: spell(notes), wrong,
      explain: `Three perfect 4ths from ${n(chord.root)}, then a major 3rd: ${spell(notes)}.`,
      columns: [{ notes, chord }]
    });
  },
  sideSlip({ roots }) {
    const chord = makeChord(parseNote(pick(roots)), 'm7');
    const up = Math.random() < 0.5;
    const answer = makeChord(slipRoot(chord.root, up), 'm7');
    const others = [slipRoot(chord.root, !up), addInterval(chord.root, 'M2'), transpose(chord.root, -1, -2)];
    return makeQuestion({
      prompt: `Over ${c(chord)}, you side-slip Dorian a half step ${up ? 'up' : 'down'}. Dorian of which m7?`, correct: c(answer),
      wrong: others.map((x) => c(makeChord(x, 'm7'))),
      explain: `Dorian of ${c(answer)}: ${spell(modeScale(answer.root, 'dorian'))}. Step out on purpose, and the tension releases when you return to ${c(chord)}.`,
      columns: [chordColumn(chord), ...modeScale(answer.root, 'dorian').map(single)]
    });
  },
  slipEar({ roots }) {
    const chord = makeChord(parseNote(pick(roots)), 'm7');
    const options = {
      'Inside': modeScale(chord.root, 'dorian'),
      'Outside (half step up)': modeScale(slipRoot(chord.root, true), 'dorian')
    };
    const [answer, other] = shuffle(Object.keys(options));
    return makeQuestion({
      prompt: `Is the phrase after ${c(chord)} inside or outside?`, correct: answer, wrong: [other],
      explain: `${answer}: ${spell(options[answer])}`,
      columns: [chordColumn(chord), ...options[answer].map(single)], ear: true
    });
  },
  reharmName({ keys }) {
    const name = pick(Object.keys(REHARMS));
    const key = keyRoot(keys);
    const [before, after] = REHARMS[name].map((list) => list.map((x) => fromKey(key, x)));
    return makeQuestion({
      prompt: `${line(before)} was rewritten as ${line(after)}. Which technique was used?`, correct: name,
      wrong: Object.keys(REHARMS).filter((x) => x !== name),
      explain: REHARM_HINT[name],
      columns: after.map(chordColumn)
    });
  }
};

// 1音ずつ、前の音より高く1オクターブ以内になるよう積む（ヴォイシングを下から順に並べるため）
function stackUp(notes) {
  return notes.reduce((result, note) => {
    if (result.length === 0) return [note];
    const previous = noteToMidi(result.at(-1));
    let x = { ...note };
    while (noteToMidi(x) <= previous) x = { ...x, octave: x.octave + 1 };
    while (noteToMidi(x) - previous > 12) x = { ...x, octave: x.octave - 1 };
    return [...result, x];
  }, []);
}

// ルートレス・ヴォイシングの4音。7のコードは5度の代わりに13thを使う
const ROOTLESS = { maj7: ['M3', 'P5', 'M7', 'M9'], m7: ['m3', 'P5', 'm7', 'M9'], 7: ['M3', 'M13', 'm7', 'M9'] };
const rotate = (list, k) => [...list.slice(k), ...list.slice(0, k)];

function rootless(chord, form) {
  const tones = ROOTLESS[chord.quality].map((x) => addInterval(chord.root, x));
  return stackUp(form === 'A' ? tones : rotate(tones, 2));
}

// コードとスケールごとのトライアド・ペア（ルートからの音程。nullはルート）
const TRIAD_PAIRS = [
  { quality: 'm7', scale: 'Dorian', intervals: ['m3', 'P4'] },
  { quality: 'maj7', scale: 'Lydian', intervals: [null, 'M2'] },
  { quality: '7', scale: 'Altered', intervals: ['d5', 'm6'] }
];
const pairTriads = (root, intervals) => intervals.map((x) => makeChord(x ? addInterval(root, x) : root, ''));
const pairLabel = (triads) => triads.map(c).join(' and ');

// 同主短調から借りるコード（キーからの音程とコードの種類）と、もとのダイアトニック・コード
const BORROWED = [
  { roman: '♭IIImaj7', borrowed: ['m3', 'maj7'], diatonic: ['M3', 'm7'] },
  { roman: '♭VImaj7', borrowed: ['m6', 'maj7'], diatonic: ['M6', 'm7'] },
  { roman: '♭VII7', borrowed: ['m7', '7'], diatonic: ['M7', 'm7b5'] },
  { roman: 'IVm7', borrowed: ['P4', 'm7'], diatonic: ['P4', 'maj7'] },
  { roman: 'IIm7♭5', borrowed: ['M2', 'm7b5'], diatonic: ['M2', 'm7'] }
];

// 狙う音を、上はスケールの隣の音、下は半音下の音ではさむ
function enclosure(roots, qualities) {
  const chord = randomChord(roots, qualities);
  const target = fitRange(chordNotes(chord)[pick([1, 2])]);
  const step = modeScale(chord.root, SCALE_FOR[chord.quality]).find((x) => x.letter === (target.letter + 1) % 7);
  const above = transpose(target, 1, (noteToMidi(step) - noteToMidi(target) + 12) % 12);
  // 狙う音に♯がつくと半音下が♯♯になるので、そのときは同じ文字のナチュラルで書く
  const below = [transpose(target, -1, -1), transpose(target, 0, -1)].find(isPlain);
  return { chord, target, above, below, columns: [chordColumn(chord), ...[above, below, target].map(single)] };
}

// メロディの下に残り3つのコードの音をすき間なく並べ、いちばん下にメロディをオクターブ下で重ねる
function blockVoicing(roots, qualities) {
  const chord = randomChord(roots, qualities);
  const tones = chordNotes(chord);
  const k = Math.floor(Math.random() * 4);
  const melody = { ...tones[k], octave: tones[k].octave + 1 };
  const inner = [1, 2, 3].map((i) => tones[(k - i + 4) % 4]).map((x) => {
    let y = { ...x };
    while (noteToMidi(y) >= noteToMidi(melody)) y = { ...y, octave: y.octave - 1 };
    while (noteToMidi(melody) - noteToMidi(y) > 12) y = { ...y, octave: y.octave + 1 };
    return y;
  });
  const double = { ...melody, octave: melody.octave - 1 };
  return { chord, melody, inner, notes: [double, ...[...inner].reverse(), melody] };
}

const secretGenerators = {
  rootlessForm({ roots, qualities }) {
    const chord = randomChord(roots, qualities);
    const form = pick(['A', 'B']);
    const voicing = rootless(chord, form);
    const wrong = [rootless(chord, form === 'A' ? 'B' : 'A'), stackUp(chordNotes(chord)), stackUp(rotate(ROOTLESS[chord.quality].map((x) => addInterval(chord.root, x)), 1))];
    return makeQuestion({
      prompt: `What is the type ${form} rootless voicing of ${c(chord)}? (bottom up)`, correct: spell(voicing), wrong: wrong.map(spell),
      explain: `Stack from the ${form === 'A' ? '3rd' : '7th'}, leave out the root and add the 9th${chord.quality === '7' ? ' (on a 7 chord, the 13th replaces the 5th)' : ''}: ${spell(voicing)}`,
      columns: [{ notes: voicing, chord }]
    });
  },
  rootlessMove({ keys }) {
    const [two, five] = twoFiveOne(keyRoot(keys));
    const a = rootless(two, 'A');
    // キーによってルートのオクターブが違うので、Vの和音をIIの和音と同じ高さにそろえる
    const raw = rootless(five, 'B');
    const shift = Math.round((noteToMidi(a[0]) - noteToMidi(raw[0])) / 12);
    const b = raw.map((x) => ({ ...x, octave: x.octave + shift }));
    const pairs = a.map((x, i) => [x, b[i]]);
    const moving = pairs.find(([x, y]) => noteToMidi(x) !== noteToMidi(y));
    const wrong = pairs.filter((p) => p !== moving).map(([x]) => `${n(x)} → ${n(transpose(x, -1, -2))}`);
    return makeQuestion({
      prompt: `${c(two)} (type A) → ${c(five)} (type B). Only one note moves. Which one?`, correct: `${n(moving[0])} → ${n(moving[1])}`, wrong,
      explain: `${spell(a)} → ${spell(b)}. The 7th of ${c(two)} drops a half step to the 3rd of ${c(five)}; the other three notes stay.`,
      columns: [{ notes: a, chord: two }, { notes: b, chord: five }]
    });
  },
  triadPair({ roots }) {
    const entry = pick(TRIAD_PAIRS);
    const chord = makeChord(parseNote(pick(roots)), entry.quality);
    const triads = pairTriads(chord.root, entry.intervals);
    const others = [...TRIAD_PAIRS.filter((x) => x !== entry).map((x) => x.intervals), ['P5', 'M6']];
    return makeQuestion({
      prompt: `Which triad pair works on ${c(chord)} (${entry.scale})?`, correct: pairLabel(triads),
      wrong: others.map((x) => pairLabel(pairTriads(chord.root, x))),
      explain: `${triads.map((t) => `${c(t)} (${spell(chordNotes(t))})`).join(' and ')}. The six notes of these two non-overlapping triads all belong to ${entry.scale}.`,
      columns: [chordColumn(chord), ...triads.map(chordColumn)]
    });
  },
  triadPairScale({ roots }) {
    const entry = pick(TRIAD_PAIRS);
    const chord = makeChord(parseNote(pick(roots)), entry.quality);
    const triads = pairTriads(chord.root, entry.intervals);
    return makeQuestion({
      prompt: `Over ${c(chord)} you alternate ${pairLabel(triads)}. Which scale does it sound like?`, correct: entry.scale,
      wrong: ['Dorian', 'Lydian', 'Altered', 'Mixolydian'].filter((x) => x !== entry.scale).slice(0, 3),
      explain: `${spell(triads.flatMap(chordNotes))}. Against ${c(chord)}, these are the notes of ${entry.scale}.`,
      columns: [chordColumn(chord), ...triads.map(chordColumn)]
    });
  },
  enclosureTarget({ roots, qualities }) {
    const { chord, target, above, below, columns } = enclosure(roots, qualities);
    return makeQuestion({
      prompt: `On ${c(chord)} you play ${n(above)}, ${n(below)}. Which note is being targeted?`, correct: n(target),
      wrong: distinctWrong([above, below, ...chordNotes(chord)], target, 3).map(n),
      explain: `Surrounding ${n(target)} with ${n(above)} above (a scale note) and ${n(below)} below (a half step under) is an enclosure. The target note sounds stronger.`,
      columns
    });
  },
  enclosureBelow({ roots, qualities }) {
    const { chord, target, above, below, columns } = enclosure(roots, qualities);
    return makeQuestion({
      prompt: `You enclose ${n(target)} on ${c(chord)}. The note above is ${n(above)}. Which note comes from below?`, correct: n(below),
      wrong: distinctWrong([transpose(target, -1, -2), above, target, transpose(target, -2, -3)], below, 3).map(n),
      explain: `Below is ${n(below)}, a half step under. It goes ${n(above)} → ${n(below)} → ${n(target)}.`,
      columns
    });
  },
  borrowedChord({ keys }) {
    const key = keyRoot(keys);
    const entry = pick(BORROWED);
    const answer = fromKey(key, entry.borrowed);
    const candidates = [fromKey(key, entry.diatonic), ...['maj7', '7', 'm7'].map((q) => makeChord(answer.root, q))].map(c);
    const wrong = [...new Set(candidates)].filter((x) => x !== c(answer)).slice(0, 3);
    return makeQuestion({
      prompt: `In ${n(key)} major, what is ${entry.roman} borrowed from the parallel minor (${n(key)} minor)?`, correct: c(answer), wrong,
      explain: `It borrows a diatonic chord from ${n(key)} minor. Where ${c(fromKey(key, entry.diatonic))} would normally be, a brief shadow falls.`,
      columns: [chordColumn(answer)]
    });
  },
  borrowedRoman({ keys }) {
    const key = keyRoot(keys);
    const entry = pick(BORROWED);
    const answer = fromKey(key, entry.borrowed);
    return makeQuestion({
      prompt: `${c(answer)} shows up in a tune in ${n(key)}. Which chord is it, borrowed from the parallel minor?`, correct: entry.roman,
      wrong: shuffle(BORROWED.filter((x) => x !== entry)).slice(0, 3).map((x) => x.roman),
      explain: `${c(answer)} is ${entry.roman} in the key of ${n(key)}, borrowed from ${n(key)} minor.`,
      columns: [chordColumn(fromKey(key, [null, 'maj7'])), chordColumn(answer)]
    });
  },
  blockInner({ roots, qualities }) {
    const { chord, melody, inner, notes } = blockVoicing(roots, qualities);
    return makeQuestion({
      prompt: `Harmonize the melody note ${n(melody)} with a ${c(chord)} block chord. What note sits just below the melody?`, correct: n(inner[0]),
      wrong: distinctWrong([inner[1], inner[2], melody], inner[0], 3).map(n),
      explain: `From the top: ${spell([...notes].reverse())}. Pack chord tones tightly under the melody, and double the melody at the bottom.`,
      columns: [{ notes, chord }]
    });
  },
  blockBottom({ roots, qualities }) {
    const { chord, melody, inner, notes } = blockVoicing(roots, qualities);
    return makeQuestion({
      prompt: `Melody ${n(melody)} with a ${c(chord)} block chord. Which note plays at the bottom?`, correct: n(notes[0]),
      wrong: distinctWrong(inner, melody, 3).map(n),
      explain: `The bottom is the melody note ${n(melody)} an octave down, which thickens the melody: ${spell(notes)}`,
      columns: [{ notes, chord }]
    });
  }
};

// ペダルの音を低く置き、その上にコードの音を積む
const overPedal = (pedal, chord) => ({ notes: stackUp([{ ...pedal, octave: 3 }, ...chordNotes(chord)]), chord });
const diatonicChords = (key) => majorScale(key).map((root, i) => makeChord(root, DIATONIC[i].quality));
const PEDAL_SETS = { tonic: { name: 'tonic', degrees: [0, 1, 0] }, dominant: { name: 'dominant', degrees: [1, 3, 4] } };

// 同じ種類のコードを動かす幅（下がる幅はup: false）
const CONSTANT_MOVES = [
  { code: 'm3', up: false, label: 'a minor 3rd down' },
  { code: 'M3', up: false, label: 'a major 3rd down' },
  { code: 'm2', up: false, label: 'a half step down' },
  { code: 'M2', up: true, label: 'a whole step up' }
];
// 同じ幅で動かし続けると♯や♭がたまっていくので、同じ高さの綴り（文字を1つ前後）から読みやすいものを選ぶ
function moveRoot(root, move, quality) {
  const { letters, semitones } = INTERVALS[move.code];
  const moved = move.up ? transpose(root, letters, semitones) : transpose(root, -letters, -semitones);
  const options = [0, -1, 1].map((k) => transpose(moved, k, 0)).filter((x) => chordNotes(makeChord(x, quality)).every(isPlain));
  return options.sort((a, b) => spellingCost(a) - spellingCost(b))[0] ?? moved;
}

// 3つのルートがどれも読みやすい綴り（C♭やE♯を含まない）になるまで選び直す
function constantChain(roots) {
  for (;;) {
    const move = pick(CONSTANT_MOVES);
    const quality = pick(['maj7', 'm7']);
    const first = parseNote(pick(roots));
    const second = moveRoot(first, move, quality);
    const chain = [first, second, moveRoot(second, move, quality)];
    if (chain.every((x) => spellingCost(x) <= 3)) return { move, quality, chain };
  }
}

// E♯・B♯・F♭・C♭は記譜ごとに見ても読みにくいので、♯♭の数に加えて重く数える
function spellingCost(note) {
  return Object.keys(NOTATIONS).reduce((sum, key) => {
    const x = toWritten(note, key);
    const odd = (x.acc === 1 && (x.letter === 2 || x.letter === 6)) || (x.acc === -1 && (x.letter === 0 || x.letter === 3));
    return sum + Math.abs(x.acc) + (odd ? 3 : 0);
  }, 0);
}

// パターンの数字をコードの音程に。3度と7度はコードの種類で変わる
const DIGITAL_PATTERNS = { '1-2-3-5': ['1', '2', '3', '5'], '1-3-5-7': ['1', '3', '5', '7'], '3-5-7-9': ['3', '5', '7', '9'], '5-3-2-1': ['5', '3', '2', '1'] };
function degreeNote(chord, degree) {
  const third = chord.quality === 'm7' ? 'm3' : 'M3';
  const seventh = chord.quality === 'maj7' ? 'M7' : 'm7';
  const code = { 2: 'M2', 3: third, 5: 'P5', 7: seventh, 9: 'M9' }[degree];
  return code ? addInterval(chord.root, code) : chord.root;
}
function digitalNotes(chord, name) {
  const notes = DIGITAL_PATTERNS[name].map((d) => degreeNote(chord, d));
  return name === '5-3-2-1' ? stackUp([...notes].reverse()).reverse() : stackUp(notes);
}

// キーの主音と5度の真ん中（3度と♭3度の間）を軸に、音を鏡に映す。文字も同じ軸で折り返して綴る
function mirror(key, note) {
  const letters = (((key.letter + 4 - note.letter) % 7) + 7) % 7;
  let semitones = ((((noteToMidi(key) % 12) + 7 - (noteToMidi(note) % 12)) % 12) + 12) % 12;
  let result = transpose(key, letters, semitones);
  while (result.acc > 6) result = transpose(key, letters, (semitones -= 12));
  while (result.acc < -6) result = transpose(key, letters, (semitones += 12));
  return result;
}
// 鏡に映すと音程の並びが逆さになるので、7度を映した音が新しいルートになる
const MIRROR_QUALITY = { 7: 'm7b5', m7: 'm7', maj7: 'maj7' };
const mirrorChord = (key, chord) => makeChord(mirror(key, chordNotes(chord)[3]), MIRROR_QUALITY[chord.quality]);

const masteryPlusGenerators = {
  pedalNote({ keys }) {
    const key = keyRoot(keys);
    const set = pick(Object.values(PEDAL_SETS));
    const pedal = set === PEDAL_SETS.tonic ? key : addInterval(key, 'P5');
    const chords = set.degrees.map((i) => diatonicChords(key)[i]);
    return makeQuestion({
      prompt: `${chords.map(c).join(' → ')}. Which low note keeps sounding (the pedal)?`, correct: n(pedal),
      wrong: distinctWrong(chords.flatMap(chordNotes), pedal, 3).map(n),
      explain: `The lowest note, ${n(pedal)}, stays put while the chords change above it (a ${set.name} pedal).`,
      columns: chords.map((chord) => overPedal(pedal, chord))
    });
  },
  pedalDominant({ keys }) {
    const key = keyRoot(keys);
    const answer = addInterval(key, 'P5');
    return makeQuestion({
      prompt: `In the key of ${n(key)}, which note is used for a dominant pedal?`, correct: n(answer),
      wrong: distinctWrong(['P4', 'M2', 'M6', 'M3'].map((x) => addInterval(key, x)).concat([key]), answer, 3).map(n),
      explain: `The 5th of the key, ${n(answer)}. Holding the root of V7 stretches the tension that waits to resolve.`,
      columns: diatonicChords(key).filter((_, i) => [1, 3, 4].includes(i)).map((chord) => overPedal(answer, chord))
    });
  },
  constantNext({ roots }) {
    const { move, quality, chain: [first, second, third] } = constantChain(roots);
    const answer = makeChord(third, quality);
    const others = [makeChord(third, quality === 'maj7' ? 'm7' : 'maj7'), makeChord(third, '7'), ...CONSTANT_MOVES.filter((x) => x !== move).map((x) => makeChord(moveRoot(second, x, quality), quality)).filter((x) => spellingCost(x.root) <= 3)];
    const wrong = [...new Set(others.map(c))].filter((x) => x !== c(answer)).slice(0, 3);
    return makeQuestion({
      prompt: `${c(makeChord(first, quality))} → ${c(makeChord(second, quality))} → ? Moving the same shape, what comes next?`, correct: c(answer), wrong,
      explain: `The ${QUALITIES[quality].label} shape moves ${move.label} each time. It favors a matching sound over the rules of the key.`,
      columns: [first, second, third].map((r) => chordColumn(makeChord(r, quality)))
    });
  },
  constantWhich({ roots }) {
    const { move, quality, chain } = constantChain(roots);
    const [first] = chain;
    const chords = chain.map((r) => makeChord(r, quality));
    const key = placeRoot(first);
    const line = (list) => list.map(c).join(' → ');
    const wrong = [line(twoFiveOne(key)), line(minorTwoFiveOne(key)), line([0, 5, 1].map((i) => diatonicChords(key)[i]))];
    return makeQuestion({
      prompt: 'Which progression uses constant structure?', correct: line(chords), wrong,
      explain: `In ${line(chords)}, chords of the same quality move ${move.label} each time. The others connect chords within a key.`,
      columns: chords.map(chordColumn)
    });
  },
  digitalSpell({ roots, qualities }) {
    const chord = randomChord(roots, qualities);
    const name = pick(Object.keys(DIGITAL_PATTERNS));
    const notes = digitalNotes(chord, name);
    return makeQuestion({
      prompt: `What do you play for the ${name} pattern on ${c(chord)}?`, correct: spell(notes),
      wrong: Object.keys(DIGITAL_PATTERNS).filter((x) => x !== name).map((x) => spell(digitalNotes(chord, x))),
      explain: `${name} on ${c(chord)}: ${spell(notes)}. The numbers are degrees counted from the chord root.`,
      columns: [chordColumn(chord), ...notes.map(single)]
    });
  },
  digitalName({ roots, qualities }) {
    const chord = randomChord(roots, qualities);
    const name = pick(Object.keys(DIGITAL_PATTERNS));
    const notes = digitalNotes(chord, name);
    return makeQuestion({
      prompt: `Over ${c(chord)}: ${spell(notes)}. Which pattern is it?`, correct: name,
      wrong: Object.keys(DIGITAL_PATTERNS).filter((x) => x !== name),
      explain: `Counted from the root of ${c(chord)}, it is ${name}.`,
      columns: [chordColumn(chord), ...notes.map(single)]
    });
  },
  mirrorNote({ keys }) {
    const key = keyRoot(keys);
    const note = pick(majorScale(key));
    const answer = mirror(key, note);
    return makeQuestion({
      prompt: `Negative harmony in ${n(key)}. What does ${n(note)} mirror to?`, correct: n(answer),
      wrong: distinctWrong([...majorScale(key), ...majorScale(key).map((x) => transpose(x, 0, -1))], answer, 3).map(n),
      explain: `The axis lies exactly between ${n(key)} and ${n(addInterval(key, 'P5'))}. Notes swap like ${n(key)}↔${n(addInterval(key, 'P5'))}, so ${n(note)} mirrors to ${n(answer)}.`,
      columns: [single(fitRange(note)), single(fitRange(answer))]
    });
  },
  mirrorChordName({ keys }) {
    const key = keyRoot(keys);
    const chord = pick([1, 3, 4, 0].map((i) => diatonicChords(key)[i]));
    const answer = mirrorChord(key, chord);
    const candidates = [chord, makeChord(answer.root, '7'), makeChord(answer.root, answer.quality === 'm7' ? 'maj7' : 'm7'), makeChord(answer.root, 'm7b5')];
    const wrong = [...new Set(candidates.map(c))].filter((x) => x !== c(answer)).slice(0, 3);
    return makeQuestion({
      prompt: `In negative harmony in ${n(key)}, what does ${c(chord)} mirror to?`, correct: c(answer), wrong,
      explain: `Mirror ${spell(chordNotes(chord))} note by note to get ${spell(chordNotes(chord).map((x) => mirror(key, x)))}. Reordered from the bottom, that is ${c(answer)}.`,
      columns: [chordColumn(chord), chordColumn(answer)]
    });
  },
  pivotChord({ keys }) {
    const key = keyRoot(keys);
    const other = placeRoot(addInterval(key, 'P5'));
    const a = diatonicChords(key).map(c);
    const b = diatonicChords(other).map(c);
    const shared = a.filter((x) => b.includes(x));
    const answer = pick(diatonicChords(key).filter((x) => b.includes(c(x))));
    return makeQuestion({
      prompt: `Modulating from ${n(key)} to ${n(other)}. Which pivot chord is in both keys?`, correct: c(answer),
      wrong: shuffle([...a, ...b].filter((x) => !shared.includes(x))).slice(0, 3),
      explain: `Chords in both keys: ${shared.join(', ')}. Any of them can bridge one key to the other.`,
      columns: [chordColumn(answer)]
    });
  },
  pivotRoman({ keys }) {
    const key = keyRoot(keys);
    const other = placeRoot(addInterval(key, 'P5'));
    const a = diatonicChords(key);
    const b = diatonicChords(other);
    const i = pick(a.map((x, k) => k).filter((k) => b.some((y) => c(y) === c(a[k]))));
    const j = b.findIndex((y) => c(y) === c(a[i]));
    return makeQuestion({
      prompt: `${c(a[i])} is ${DIATONIC[i].roman} in ${n(key)}. What is it in ${n(other)}?`, correct: DIATONIC[j].roman,
      wrong: shuffle(DIATONIC.filter((_, k) => k !== j && k !== i)).slice(0, 3).map((x) => x.roman),
      explain: `${c(a[i])} is ${DIATONIC[j].roman} in ${n(other)}. Reinterpret the chord's role and you are in the new key.`,
      columns: [chordColumn(a[i])]
    });
  }
};

// 曲の型：[キーからの音程, コードの種類, 役目, 合うスケール]（音程nullはキーの音、スケールnullは出題しない）
const SONG_FORMS = {
  autumn: {
    minor: false,
    bars: [
      ['M2', 'm7', 'IIm7', 'dorian'], ['P5', '7', 'V7', 'mixolydian'], [null, 'maj7', 'Imaj7', 'ionian'], ['P4', 'maj7', 'IVmaj7', 'lydian'],
      ['M7', 'm7b5', 'VIIm7♭5', 'locrian'], ['M3', '7', 'III7', 'phrygianDominant'], ['M6', 'm6', 'VIm6', 'melodicMinor'], ['M6', 'm6', 'VIm6', 'melodicMinor']
    ]
  },
  rhythm: {
    minor: false,
    bars: [
      [null, 'maj7', 'Imaj7', 'ionian'], ['M6', 'm7', 'VIm7', null], ['M2', 'm7', 'IIm7', 'dorian'], ['P5', '7', 'V7', 'mixolydian'],
      ['M3', 'm7', 'IIIm7', null], ['M6', '7', 'VI7', 'phrygianDominant'], ['M2', 'm7', 'IIm7', 'dorian'], ['P5', '7', 'V7', 'mixolydian'],
      ['M3', '7', 'III7', 'phrygianDominant'], ['M6', '7', 'VI7', 'phrygianDominant'], ['M2', '7', 'II7', null], ['P5', '7', 'V7', 'mixolydian']
    ]
  },
  minorBlues: {
    minor: true,
    bars: [
      [null, 'm7', 'Im7', 'dorian'], [null, 'm7', 'Im7', 'dorian'], [null, 'm7', 'Im7', 'dorian'], [null, 'm7', 'Im7', 'dorian'],
      ['P4', 'm7', 'IVm7', 'dorian'], ['P4', 'm7', 'IVm7', 'dorian'], [null, 'm7', 'Im7', 'dorian'], [null, 'm7', 'Im7', 'dorian'],
      ['m6', '7', '♭VI7', 'lydianDominant'], ['P5', '7', 'V7', 'phrygianDominant'], [null, 'm7', 'Im7', 'dorian'], ['P5', '7', 'V7', 'phrygianDominant']
    ]
  }
};
const SCALE_REASON = {
  dorian: 'The default for m7. Its natural 6th gives a brighter minor.',
  mixolydian: 'The default for 7. It fits the dominant inside a major key.',
  ionian: 'It is the scale of the key itself.',
  lydian: 'Using the notes of the key, IVmaj7 gets a ♯11th, which makes it Lydian.',
  locrian: 'Built from the notes of the key only, VIIm7♭5 is Locrian.',
  phrygianDominant: 'This 7 resolves to a minor chord, so Phrygian Dominant, with ♭9th and ♭13th, fits.',
  melodicMinor: 'm6 takes Melodic Minor, with a natural 6th and a major 7th.',
  lydianDominant: '♭VI7 sounds best with Lydian Dominant, which includes the ♯11th.'
};
const SONG_SCALES = Object.keys(SCALE_REASON);
// どちらでも弾けて正解が1つに決まらない組は、選択肢に並べない
const SCALE_RIVAL = { mixolydian: 'lydianDominant', lydianDominant: 'mixolydian' };

function songChart({ form: formKey, keys }) {
  const form = SONG_FORMS[formKey];
  const key = keyRoot(keys);
  const chords = form.bars.map(([at, quality]) => fromKey(key, [at, quality]));
  return { form, key, chords };
}
const keyLabel = (key, form) => `${n(key)}${form.minor ? ' minor' : ' major'}`;
// 印をつけた小節を【 】で囲んだ、1行のコード譜にする
const chartText = (chords, marks) => chords.map((x, i) => (marks.includes(i) ? `[${c(x)}]` : c(x))).join(' | ');
const nextOf = (chords, i) => chords[(i + 1) % chords.length];
// 次のコードのルートが5度下（4度上）なら、強い解決の流れ
const fallsFifth = (a, b) => (((noteToMidi(b.root) - noteToMidi(a.root)) % 12) + 12) % 12 === 5;
// 半音上の音。裏コードのルートは解決先の半音上なので、C♭のような綴りにならないよう2通りから読みやすい方を選ぶ
const halfStepUp = (target) => [addInterval(target, 'm2'), addInterval(target, 'A1')].sort((a, b) => spellingCost(a) - spellingCost(b))[0];

const songGenerators = {
  songRole(params) {
    const { form, key, chords } = songChart(params);
    const i = Math.floor(Math.random() * chords.length);
    const roman = form.bars[i][2];
    const pool = [...new Set([...form.bars.map((x) => x[2]), ...DIATONIC.map((x) => x.roman)])].filter((x) => x !== roman);
    return makeQuestion({
      prompt: `A tune in ${keyLabel(key, form)}: ${chartText(chords, [i])}  What is the role of the [ ] chord?`, correct: roman, wrong: shuffle(pool).slice(0, 3),
      explain: `${c(chords[i])} is ${roman} in ${keyLabel(key, form)}. Read roles from the key, and the same thinking works in any key.`,
      columns: [chordColumn(chords[i])]
    });
  },
  songTritone(params) {
    const { form, key, chords } = songChart(params);
    const i = pick(chords.map((_, k) => k).filter((k) => chords[k].quality === '7' && fallsFifth(chords[k], nextOf(chords, k))));
    const answer = makeChord(halfStepUp(nextOf(chords, i).root), '7');
    const others = [chords[i], makeChord(halfStepUp(chords[i].root), '7'), makeChord(answer.root, 'm7'), makeChord(nextOf(chords, i).root, '7')];
    const wrong = [...new Set(others.map(c))].filter((x) => x !== c(answer)).slice(0, 3);
    return makeQuestion({
      prompt: `A tune in ${keyLabel(key, form)}: ${chartText(chords, [i])}  What is the [ ] chord as a tritone sub?`, correct: c(answer), wrong,
      explain: `${c(chords[i])} and ${c(answer)} share the 3rd and 7th. The bass slides down a half step to ${c(nextOf(chords, i))}.`,
      columns: [chordColumn(chords[i]), chordColumn(answer), chordColumn(nextOf(chords, i))]
    });
  },
  songBackdoor(params) {
    const { form, key, chords } = songChart(params);
    const starts = chords.map((_, k) => k).filter((k) => chords[k].quality === 'm7' && nextOf(chords, k).quality === '7'
      && nextOf(chords, k + 1).quality === 'maj7' && fallsFifth(chords[k], nextOf(chords, k)) && fallsFifth(nextOf(chords, k), nextOf(chords, k + 1)));
    const i = pick(starts);
    const j = (i + 1) % chords.length;
    const target = nextOf(chords, j).root;
    const pair = (a, qa, b, qb) => `${c(makeChord(a, qa))} → ${c(makeChord(b, qb))}`;
    const correct = pair(addInterval(target, 'P4'), 'm7', addInterval(target, 'm7'), '7');
    return makeQuestion({
      prompt: `A tune in ${keyLabel(key, form)}: ${chartText(chords, [i, j])}  Rewrite the two [ ] chords as a backdoor.`, correct,
      wrong: [pair(chords[i].root, 'm7', halfStepUp(target), '7'), pair(addInterval(target, 'P4'), 'maj7', chords[j].root, '7'), pair(addInterval(target, 'M6'), '7', chords[i].root, 'm7')],
      explain: `IVm7 → ♭VII7 into ${c(nextOf(chords, j))}. You come home through the back door, via the shade of subdominant minor.`,
      columns: [chordColumn(makeChord(addInterval(target, 'P4'), 'm7')), chordColumn(makeChord(addInterval(target, 'm7'), '7')), chordColumn(nextOf(chords, j))]
    });
  },
  songScale(params) {
    const { form, key, chords } = songChart(params);
    const i = pick(form.bars.map((_, k) => k).filter((k) => form.bars[k][3]));
    const mode = form.bars[i][3];
    const wrong = shuffle(SONG_SCALES.filter((x) => x !== mode && x !== SCALE_RIVAL[mode])).slice(0, 3).map((x) => MODES[x].name);
    return makeQuestion({
      prompt: `A tune in ${keyLabel(key, form)}: ${chartText(chords, [i])}  Which scale do you play over the [ ] chord?`, correct: MODES[mode].name, wrong,
      explain: `${c(chords[i])} (${form.bars[i][2]}): ${SCALE_REASON[mode]} ${spell(modeScale(chords[i].root, mode))}`,
      columns: [chordColumn(chords[i]), ...modeScale(chords[i].root, mode).map(single)]
    });
  },
  songGuide(params) {
    const { form, key, chords } = songChart(params);
    const i = pick(chords.map((_, k) => k).filter((k) => fallsFifth(chords[k], nextOf(chords, k))));
    const next = nextOf(chords, i);
    const seventh = chordNotes(chords[i])[3];
    const answer = chordNotes(next)[1];
    return makeQuestion({
      prompt: `A tune in ${keyLabel(key, form)}: ${chartText(chords, [i])}  The 7th of the [ ] chord is ${n(seventh)}. Where does it go in the next chord, ${c(next)}?`, correct: n(answer),
      wrong: distinctWrong([...chordNotes(next), seventh, halfStepUp(seventh)], answer, 3).map(n),
      explain: `${n(seventh)} falls a half or whole step to ${n(answer)}, the 3rd of ${c(next)}. Connecting this line makes the changes sound smooth.`,
      columns: [guideColumn(chords[i]), guideColumn(next)]
    });
  }
};

const GENERATORS = {
  ...earGenerators, ...readGenerators, ...stepUpEarGenerators, ...stepUpReadGenerators, ...advancedGenerators, ...developGenerators,
  ...applyGenerators, ...masteryGenerators, ...masterGenerators,
  ...secretGenerators, ...masteryPlusGenerators, ...songGenerators
};

// 単元に複数の出題形式があるときは、偏らないよう順番に混ぜてからシャッフルする
export function buildQuiz(specs, length) {
  const questions = [];
  for (let i = 0; i < length; i += 1) {
    const spec = specs[i % specs.length];
    questions.push(GENERATORS[spec.type](spec.params ?? {}));
  }
  return shuffle(questions);
}
