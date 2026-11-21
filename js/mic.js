// マイクで吹いた音の高さを聞き取る。仕組みはハミング採譜(hum-to-score)のYIN法と同じ。

const FRAME_SIZE = 2048;
const MIN_FREQ = 100;
const MAX_FREQ = 1400;
// YIN法のしきい値。小さいほど厳しく、息の音を音程と誤認しにくい。
const YIN_THRESHOLD = 0.15;
// これより小さい音は周りの雑音とみなす。iPhoneの内蔵マイクで楽器を吹いたときに十分越える大きさ。
const SILENCE_LEVEL = 0.01;

let stream = null;
let ctx = null;
let frameId = 0;
// 許可を待つ間に止められたら、後から開いたマイクをすぐ閉じるための通し番号
let session = 0;

function rms(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

function refineLag(values, tau) {
  if (tau <= 0 || tau >= values.length - 1) return tau;
  const a = values[tau - 1];
  const b = values[tau];
  const c = values[tau + 1];
  const denom = a - 2 * b + c;
  return denom === 0 ? tau : tau + (a - c) / (2 * denom);
}

// 波形を少しずつずらして自分自身と比べ、一番よく重なるずれ幅＝周期を探す
export function detectPitchYin(frame, sampleRate) {
  const half = frame.length / 2;
  const tauMin = Math.floor(sampleRate / MAX_FREQ);
  const tauMax = Math.min(half - 1, Math.ceil(sampleRate / MIN_FREQ));
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const d = frame[i] - frame[i + tau];
      sum += d * d;
    }
    running += sum;
    cmnd[tau] = running === 0 ? 1 : sum * tau / running;
  }
  for (let tau = Math.max(2, tauMin); tau <= tauMax; tau++) {
    if (cmnd[tau] >= YIN_THRESHOLD) continue;
    while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
    return sampleRate / refineLag(cmnd, tau);
  }
  return null;
}

// onPitch には実音のMIDI番号（小数つき）か、音が聞こえないときは null を渡す
export async function startListening(onPitch) {
  stopListening();
  const mine = session;
  // iPhoneは「再生だけ」の扱いのままだとマイクを開けないので、録音もする扱いに切り替える
  if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';
  // 声向けの雑音消しや音量の自動調整は楽器の音を削ってしまうので切る
  const opened = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  if (mine !== session) {
    opened.getTracks().forEach((track) => track.stop());
    return;
  }
  stream = opened;
  ctx = new AudioContext();
  // 許可を待つ間にタップの扱いが切れて止まったまま作られることがあるので、動かしておく
  ctx.resume();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FRAME_SIZE;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const frame = new Float32Array(FRAME_SIZE);
  const rate = ctx.sampleRate;
  const tick = () => {
    analyser.getFloatTimeDomainData(frame);
    const freq = rms(frame) < SILENCE_LEVEL ? null : detectPitchYin(frame, rate);
    onPitch(freq ? 69 + 12 * Math.log2(freq / 440) : null);
    // onPitch の中で止められたときは次のコマを予約しない
    if (mine === session) frameId = requestAnimationFrame(tick);
  };
  tick();
}

export function stopListening() {
  session += 1;
  cancelAnimationFrame(frameId);
  if (stream) stream.getTracks().forEach((track) => track.stop());
  if (ctx) ctx.close();
  stream = null;
  ctx = null;
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
}
