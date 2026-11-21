import { noteToMidi } from './theory.js';

let ctx = null;
let master = null;
let loopTimer = null;

// iPhoneでは利用者のタップの中でしか音を鳴らし始められないので、タップのたびに呼ぶ
export function unlockAudio() {
  // マナーモードでも鳴るよう、再生用の音声として扱ってもらう
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
  if (!ctx) ctx = new AudioContext();
  if (ctx.state !== 'running') ctx.resume();
}

function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

// 続けて押したときに前の音と混ざらないよう、再生ごとに出口を作り直して前の出口は消音する
function newMaster() {
  if (master) {
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    const old = master;
    setTimeout(() => old.disconnect(), 300);
  }
  master = ctx.createGain();
  master.connect(ctx.destination);
}

// 倍音を少し足して、純音より音の高さを聞き分けやすくする
function playMidi(midi, delay, duration, volume = 0.22) {
  const start = ctx.currentTime + delay;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  gain.connect(master);
  for (const [ratio, type] of [[1, 'triangle'], [2, 'sine']]) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = midiToHz(midi) * ratio;
    const partGain = ctx.createGain();
    partGain.gain.value = ratio === 1 ? 1 : 0.25;
    osc.connect(partGain).connect(gain);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }
}

// コード名つきの列はベースにルートを足して和音で鳴らし、音だけの列は1音ずつ→同時に鳴らす
function playColumn({ notes, chord }, at) {
  const midis = notes.map(noteToMidi);
  if (chord) {
    playMidi(noteToMidi(chord.root) - 12, at, 1.6, 0.2);
    midis.forEach((midi) => playMidi(midi, at, 1.6, 0.13));
    return 1.4;
  }
  if (midis.length === 1) {
    playMidi(midis[0], at, 0.8);
    return 0.6;
  }
  midis.forEach((midi, i) => playMidi(midi, at + i * 0.4, 0.7));
  const blockAt = at + midis.length * 0.4 + 0.1;
  midis.forEach((midi) => playMidi(midi, blockAt, 1.4, 0.16));
  return blockAt - at + 1.4;
}

export function stopLine() {
  clearTimeout(loopTimer);
  loopTimer = null;
  if (ctx) newMaster();
}

// 1音ずつ一定の速さで鳴らす。繰り返すときは1回分が終わる少し前に次の回を予約し、つなぎ目で間が空かないようにする
export function playLine(notes, secondsPerNote, loop, onEnd) {
  if (!ctx) return;
  stopLine();
  const midis = notes.map(noteToMidi);
  let at = ctx.currentTime + 0.05;
  const schedule = () => {
    midis.forEach((midi, i) => playMidi(midi, at - ctx.currentTime + i * secondsPerNote, secondsPerNote * 1.5));
    at += midis.length * secondsPerNote;
    const untilEnd = (at - ctx.currentTime) * 1000;
    loopTimer = loop ? setTimeout(schedule, Math.max(0, untilEnd - 300)) : setTimeout(onEnd, untilEnd);
  };
  schedule();
}

export function playColumns(columns) {
  if (!ctx) return;
  newMaster();
  let at = 0.05;
  for (const column of columns) at += playColumn(column, at);
}
