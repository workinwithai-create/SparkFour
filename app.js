const CDN = "https://cdn.jsdelivr.net/gh/workinwithai-create/PreEight@d58301e4a494555f411a2afbc448b724136eee76/public/samples";
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const BARS = 4;
const STEPS_PER_BAR = 16;
const TOTAL_STEPS = BARS * STEPS_PER_BAR;

const recipes = [
  { id: "hat-spark", name: "Hat spark", blurb: "Open hats and 16th patterns that spark the pocket." },
  { id: "ghost-fill", name: "Ghost fill", blurb: "Snare ghosts and short bass fills for motion." },
  { id: "piano-stab", name: "Piano stabs", blurb: "Short piano chord stabs on the offbeats." },
  { id: "bass-run", name: "Bass runs", blurb: "Upright walks and anticipations." },
  { id: "mixed", name: "Mixed spark", blurb: "Hats + ghosts + stabs together for life." }
];

const state = {
  bpm: 96,
  key: "A minor",
  chords: "Am F C G",
  recipe: recipes[0],
  playing: false,
  step: 0,
  bars: BARS
};

let ctx, bus, master, compressor, buffers = {}, rawBuffers = {};
let nextStepTime = 0;
let timerId = null;
let activeSources = [];
let playheadRaf = null;
let samplesReady = false;

function saveState() {
  localStorage.setItem("sparkfour", JSON.stringify({ bpm: state.bpm, key: state.key, chords: state.chords, recipe: state.recipe.id }));
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem("sparkfour") || "{}");
    if (s.bpm) state.bpm = s.bpm;
    if (s.key) state.key = s.key;
    if (s.chords) state.chords = s.chords;
    if (s.recipe) state.recipe = recipes.find(r => r.id === s.recipe) || recipes[0];
  } catch (e) {}
}

async function loadSamples() {
  const files = [
    ["kick", `${CDN}/drums/kick.mp3`],
    ["snare", `${CDN}/drums/snare.mp3`],
    ["hat", `${CDN}/drums/hihat.mp3`],
    ["openhat", `${CDN}/drums/openhat.mp3`],
    ["pC3", `${CDN}/piano/C3.mp3`],
    ["pC4", `${CDN}/piano/C4.mp3`],
    ["bE1", `${CDN}/bass/E1.mp3`],
    ["bA1", `${CDN}/bass/A1.mp3`],
    ["gE2", `${CDN}/guitar/E2.mp3`]
  ];
  const missing = [];
  for (let i = 0; i < files.length; i++) {
    const [k, url] = files[i];
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      const ab = await r.arrayBuffer();
      rawBuffers[k] = ab;
      if (ctx) buffers[k] = await ctx.decodeAudioData(ab.slice(0));
    } catch (e) {
      missing.push(k);
    }
    document.getElementById("status").textContent = `Seating chairs ${i + 1}/${files.length}${missing.length ? " — missing: " + missing.join(",") : ""}`;
  }
  if (missing.length) {
    document.getElementById("status").textContent = "Missing instruments: " + missing.join(", ") + ". Cannot play.";
    samplesReady = false;
    return false;
  }
  document.getElementById("status").textContent = "Chairs seated · live FluidR3 + kit · DAW-ready";
  samplesReady = true;
  return true;
}

function initAudio() {
  if (ctx) return;
  ctx = new AudioContext({ sampleRate: 48000 });
  bus = ctx.createGain();
  bus.gain.value = 0.32;
  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 6;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;
  bus.connect(compressor);
  compressor.connect(ctx.destination);
  for (const k in rawBuffers) {
    if (!buffers[k]) {
      ctx.decodeAudioData(rawBuffers[k].slice(0)).then(b => buffers[k] = b);
    }
  }
}

function trackSource(src) {
  activeSources.push(src);
  src.onended = () => { activeSources = activeSources.filter(s => s !== src); };
}

function playBuf(name, when, rate = 1, gain = 0.35, duration) {
  const b = buffers[name];
  if (!b || !ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.008);
  const dur = duration || 0.28;
  g.gain.setValueAtTime(gain, when + Math.max(0, dur - 0.012));
  g.gain.linearRampToValueAtTime(0, when + dur);
  src.connect(g);
  g.connect(bus);
  src.start(when);
  src.stop(when + dur + 0.01);
  trackSource(src);
}

// Clamp to ±4 semitones. Pro rule: never stretch beyond this.
function safeRate(midi, base) {
  let semis = midi - base;
  semis = Math.max(-4, Math.min(4, semis));
  return Math.pow(2, semis / 12);
}

function parseChords(str) {
  return str.split(/\s+/).filter(Boolean).slice(0, 4);
}

function rootMidi(symbol) {
  const map = { C: 60, "C#": 61, Db: 61, D: 62, "D#": 63, Eb: 63, E: 64, F: 65, "F#": 66, Gb: 66, G: 67, "G#": 68, Ab: 68, A: 69, "A#": 70, Bb: 70, B: 71 };
  const m = symbol.match(/^([A-G][#b]?)/);
  return map[m ? m[1] : "A"] || 69;
}

function scheduleStep(step, when) {
  const bar = Math.floor(step / STEPS_PER_BAR);
  const s = step % STEPS_PER_BAR;
  const chords = parseChords(state.chords);
  const symbol = chords[bar % chords.length] || "Am";
  const rec = state.recipe.id;
  const stepDur = 60 / state.bpm / 4;
  const root = rootMidi(symbol);
  const bassMidi = root - 24;
  const pianoMidi = root;

  if (s % 2 === 0) playBuf("hat", when, 1, 0.06);
  if (s === 0 || s === 8) playBuf("kick", when, 1, 0.55);
  if (s === 4 || s === 12) playBuf("snare", when, 1, 0.36);

  if (rec === "hat-spark" && (s === 2 || s === 6 || s === 10 || s === 14)) playBuf("openhat", when, 1, 0.18, 0.22);
  if (rec === "ghost-fill" && (s === 2 || s === 6 || s === 10 || s === 14)) playBuf("snare", when, 1, 0.09);
  if (rec === "ghost-fill" && s === 14) playBuf("bA1", when, safeRate(bassMidi + 2, 33), 0.32, stepDur * 1.2);
  if (rec === "piano-stab" && (s === 2 || s === 6 || s === 10 || s === 14)) {
    playBuf("pC4", when, safeRate(pianoMidi, 60), 0.2, 0.1);
  }
  if (rec === "bass-run" && s === 12) playBuf("bA1", when, safeRate(bassMidi + 3, 33), 0.35, stepDur * 2);
  if (rec === "mixed" && (s === 2 || s === 6 || s === 10 || s === 14)) {
    playBuf("openhat", when, 1, 0.12, 0.18);
    playBuf("snare", when, 1, 0.07);
  }

  if (s === 0) playBuf("bA1", when, safeRate(bassMidi, 33), 0.36, stepDur * 3);
  if (s === 0) playBuf("gE2", when, safeRate(pianoMidi - 12, 45), 0.16, stepDur * 6);
}

function scheduler() {
  while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(state.step, nextStepTime);
    const stepDur = 60 / state.bpm / 4;
    nextStepTime += stepDur;
    state.step = (state.step + 1) % TOTAL_STEPS;
  }
}

function start() {
  if (!ctx) initAudio();
  if (ctx.state === "suspended") ctx.resume();
  stop();
  state.playing = true;
  state.step = 0;
  nextStepTime = ctx.currentTime + 0.1;
  timerId = setInterval(scheduler, LOOKAHEAD_MS);
  requestAnimationFrame(updatePlayhead);
}

function stop() {
  state.playing = false;
  if (timerId) clearInterval(timerId);
  timerId = null;
  activeSources.forEach(s => { try { s.stop(); } catch (e) {} });
  activeSources = [];
  if (playheadRaf) cancelAnimationFrame(playheadRaf);
  paintBars();
}

function updatePlayhead() {
  if (!state.playing) return;
  paintBars();
  playheadRaf = requestAnimationFrame(updatePlayhead);
}

function paintBars() {
  const el = document.getElementById("bars");
  el.innerHTML = "";
  const chords = parseChords(state.chords);
  for (let i = 0; i < BARS; i++) {
    const d = document.createElement("div");
    d.className = "bar" + (state.playing && Math.floor(state.step / STEPS_PER_BAR) === i ? " active" : "");
    d.innerHTML = `<div class="n">${i + 1}</div><div class="c">${chords[i % chords.length] || "—"}</div>`;
    el.appendChild(d);
  }
}

function paintRecipes() {
  const el = document.getElementById("recipes");
  el.innerHTML = "";
  recipes.forEach(r => {
    const b = document.createElement("button");
    b.className = "card" + (state.recipe.id === r.id ? " on" : "");
    b.innerHTML = `<b>${r.name}</b><span>${r.blurb}</span>`;
    b.onclick = () => { state.recipe = r; saveState(); render(); };
    el.appendChild(b);
  });
}

function punch() {
  return `SparkFour punch list — DAW ready
${state.bpm} BPM · ${state.key} · ${state.recipe.name}

Drop the WAV on bar 1 of any DAW. It locks. Loop is seamless. MIDI has tempo.
The problem: static loops have no spark. Session players write hat patterns, ghosts, and stabs so the pocket finishes.
The move: ${state.recipe.blurb}

Chords: ${state.chords}

Live chairs only. Distinct from AccentFour, DriveFour, PulseFour, LockFour.
Free.`;
}

function render() {
  paintRecipes();
  paintBars();
  document.getElementById("punch").textContent = punch();
  document.getElementById("bpm").value = state.bpm;
  document.getElementById("key").value = state.key;
  document.getElementById("chords").value = state.chords;
}

function encodeWav24(audioBuffer) {
  const numChannels = 2;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const bytesPerSample = 3;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + length * blockAlign);
  const view = new DataView(buffer);
  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  writeString(0, "RIFF");
  view.setUint32(4, 36 + length * blockAlign, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true);
  writeString(36, "data");
  view.setUint32(40, length * blockAlign, true);
  let offset = 44;
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.getChannelData(1);
  for (let i = 0; i < length; i++) {
    for (const ch of [ch0, ch1]) {
      let s = Math.max(-1, Math.min(1, ch[i]));
      const int = Math.round(s * 0x7FFFFF);
      view.setUint8(offset++, (int >> 16) & 0xFF);
      view.setUint8(offset++, (int >> 8) & 0xFF);
      view.setUint8(offset++, int & 0xFF);
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function exportWav(withTail = false) {
  if (!samplesReady || !rawBuffers.kick) {
    alert("Samples not ready");
    return;
  }
  const sampleRate = 48000;
  const bars = BARS;
  const bpm = state.bpm;
  const lengthSamples = Math.round(bars * 4 * 60 / bpm * sampleRate);
  const tailSamples = Math.round(sampleRate * 1.5);
  const offline = new OfflineAudioContext(2, lengthSamples + tailSamples, sampleRate);
  const offBus = offline.createGain();
  offBus.gain.value = 0.32;
  const offComp = offline.createDynamicsCompressor();
  offComp.threshold.value = -12;
  offComp.ratio.value = 8;
  offBus.connect(offComp);
  offComp.connect(offline.destination);

  const offBuffers = {};
  for (const k of Object.keys(rawBuffers)) {
    offBuffers[k] = await offline.decodeAudioData(rawBuffers[k].slice(0));
  }

  function playOff(name, when, rate = 1, gain = 0.35, duration) {
    const b = offBuffers[name];
    if (!b) return;
    const src = offline.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    const g = offline.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.008);
    const dur = duration || 0.28;
    g.gain.setValueAtTime(gain, when + Math.max(0, dur - 0.012));
    g.gain.linearRampToValueAtTime(0, when + dur);
    src.connect(g);
    g.connect(offBus);
    src.start(when);
    src.stop(when + dur + 0.01);
  }

  let t = 0;
  const stepDur = 60 / bpm / 4;
  for (let step = 0; step < TOTAL_STEPS; step++) {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const s = step % STEPS_PER_BAR;
    const chords = parseChords(state.chords);
    const symbol = chords[bar % chords.length] || "Am";
    const rec = state.recipe.id;
    const root = rootMidi(symbol);
    const bassMidi = root - 24;
    const pianoMidi = root;

    if (s % 2 === 0) playOff("hat", t, 1, 0.06);
    if (s === 0 || s === 8) playOff("kick", t, 1, 0.55);
    if (s === 4 || s === 12) playOff("snare", t, 1, 0.36);
    if (rec === "hat-spark" && (s === 2 || s === 6 || s === 10 || s === 14)) playOff("openhat", t, 1, 0.18, 0.22);
    if (rec === "ghost-fill" && (s === 2 || s === 6 || s === 10 || s === 14)) playOff("snare", t, 1, 0.09);
    if (rec === "ghost-fill" && s === 14) playOff("bA1", t, safeRate(bassMidi + 2, 33), 0.32, stepDur * 1.2);
    if (rec === "piano-stab" && (s === 2 || s === 6 || s === 10 || s === 14)) {
      playOff("pC4", t, safeRate(pianoMidi, 60), 0.2, 0.1);
    }
    if (rec === "bass-run" && s === 12) playOff("bA1", t, safeRate(bassMidi + 3, 33), 0.35, stepDur * 2);
    if (rec === "mixed" && (s === 2 || s === 6 || s === 10 || s === 14)) {
      playOff("openhat", t, 1, 0.12, 0.18);
      playOff("snare", t, 1, 0.07);
    }
    if (s === 0) playOff("bA1", t, safeRate(bassMidi, 33), 0.36, stepDur * 3);
    if (s === 0) playOff("gE2", t, safeRate(pianoMidi - 12, 45), 0.16, stepDur * 6);
    t += stepDur;
  }

  const rendered = await offline.startRendering();
  let finalLength = lengthSamples;
  let main = rendered.getChannelData(0).subarray(0, lengthSamples);
  let main1 = rendered.getChannelData(1).subarray(0, lengthSamples);
  if (!withTail) {
    const tail0 = rendered.getChannelData(0).subarray(lengthSamples);
    const tail1 = rendered.getChannelData(1).subarray(lengthSamples);
    for (let i = 0; i < Math.min(tail0.length, lengthSamples); i++) {
      main[i] += tail0[i] * 0.85;
      main1[i] += tail1[i] * 0.85;
    }
  } else {
    finalLength = lengthSamples + tailSamples;
    main = rendered.getChannelData(0);
    main1 = rendered.getChannelData(1);
  }
  let peak = 0;
  for (let i = 0; i < finalLength; i++) {
    peak = Math.max(peak, Math.abs(main[i]), Math.abs(main1[i]));
  }
  const target = Math.pow(10, -1 / 20);
  if (peak > 0) {
    const scale = target / peak;
    for (let i = 0; i < finalLength; i++) {
      main[i] *= scale;
      main1[i] *= scale;
    }
  }
  const finalBuf = offline.createBuffer(2, finalLength, sampleRate);
  finalBuf.copyToChannel(main.subarray(0, finalLength), 0);
  finalBuf.copyToChannel(main1.subarray(0, finalLength), 1);
  const blob = encodeWav24(finalBuf);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const suffix = withTail ? "-withtail" : "";
  a.download = `SparkFour-${state.recipe.id}-${bpm}bpm-${state.key.replace(/\s+/g, "")}${suffix}.wav`;
  a.click();
}

function exportMidi() {
  const bpm = state.bpm;
  const ticksPerBeat = 480;
  const stepTicks = ticksPerBeat / 4;
  const tracks = [[], [], [], []];
  function addNote(track, note, startTick, durTicks, vel = 80) {
    tracks[track].push({ tick: startTick, type: "on", note, vel });
    tracks[track].push({ tick: startTick + durTicks, type: "off", note, vel: 0 });
  }
  let tick = 0;
  for (let step = 0; step < TOTAL_STEPS; step++) {
    const bar = Math.floor(step / STEPS_PER_BAR);
    const s = step % STEPS_PER_BAR;
    const chords = parseChords(state.chords);
    const symbol = chords[bar % chords.length] || "Am";
    const root = rootMidi(symbol);
    const bassMidi = root - 24;
    const pianoMidi = root;
    const rec = state.recipe.id;
    if (s % 2 === 0) addNote(2, 42, tick, stepTicks * 0.5, 40);
    if (s === 0 || s === 8) addNote(0, 36, tick, stepTicks, 100);
    if (s === 4 || s === 12) addNote(0, 38, tick, stepTicks, 90);
    if (rec === "hat-spark" && (s === 2 || s === 6 || s === 10 || s === 14)) addNote(2, 46, tick, stepTicks * 0.6, 60);
    if (rec === "ghost-fill" && (s === 2 || s === 6 || s === 10 || s === 14)) addNote(0, 38, tick, stepTicks * 0.3, 30);
    if (s === 0) addNote(1, bassMidi, tick, stepTicks * 3, 85);
    if (s === 0) addNote(3, pianoMidi, tick, stepTicks * 6, 65);
    tick += stepTicks;
  }
  const header = [0x4D, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x01, 0x00, 0x05, 0x01, 0xE0];
  const blobParts = [new Uint8Array(header)];
  const usPerQuarter = Math.round(60000000 / bpm);
  const tempoBytes = [0x00, 0xFF, 0x51, 0x03, (usPerQuarter >> 16) & 0xFF, (usPerQuarter >> 8) & 0xFF, usPerQuarter & 0xFF, 0x00, 0xFF, 0x2F, 0x00];
  const tempoLen = tempoBytes.length;
  const tempoHeader = [0x4D, 0x54, 0x72, 0x6B, (tempoLen >> 24) & 0xFF, (tempoLen >> 16) & 0xFF, (tempoLen >> 8) & 0xFF, tempoLen & 0xFF];
  blobParts.push(new Uint8Array(tempoHeader.concat(tempoBytes)));
  for (let tr = 0; tr < 4; tr++) {
    const events = tracks[tr].sort((a, b) => a.tick - b.tick);
    let bytes = [];
    let prev = 0;
    for (const e of events) {
      let delta = e.tick - prev;
      prev = e.tick;
      const dbytes = [];
      do {
        dbytes.unshift(delta & 0x7F);
        delta >>= 7;
      } while (delta);
      for (let i = 0; i < dbytes.length - 1; i++) dbytes[i] |= 0x80;
      bytes.push(...dbytes);
      if (e.type === "on") {
        bytes.push(0x90, e.note, e.vel);
      } else {
        bytes.push(0x80, e.note, 0);
      }
    }
    bytes.push(0x00, 0xFF, 0x2F, 0x00);
    const len = bytes.length;
    const trackHeader = [0x4D, 0x54, 0x72, 0x6B, (len >> 24) & 0xFF, (len >> 16) & 0xFF, (len >> 8) & 0xFF, len & 0xFF];
    blobParts.push(new Uint8Array(trackHeader.concat(bytes)));
  }
  const blob = new Blob(blobParts, { type: "audio/midi" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `SparkFour-${state.recipe.id}-${bpm}bpm-${state.key.replace(/\s+/g, "")}.mid`;
  a.click();
}

document.getElementById("play").onclick = async () => {
  initAudio();
  if (ctx.state === "suspended") await ctx.resume();
  if (!samplesReady) {
    const ok = await loadSamples();
    if (!ok) return;
  }
  start();
};
document.getElementById("stop").onclick = stop;
document.getElementById("exportWav").onclick = () => exportWav(false);
document.getElementById("exportMid").onclick = exportMidi;
document.getElementById("copy").onclick = () => navigator.clipboard.writeText(punch());

const dock = document.querySelector(".dock");
const tailBtn = document.createElement("button");
tailBtn.className = "ghost";
tailBtn.id = "exportTail";
tailBtn.textContent = "Export with tail";
tailBtn.onclick = () => exportWav(true);
dock.insertBefore(tailBtn, document.getElementById("copy"));

document.getElementById("bpm").onchange = (e) => { state.bpm = Math.max(60, Math.min(180, +e.target.value)); saveState(); };
document.getElementById("key").onchange = (e) => { state.key = e.target.value; saveState(); };
document.getElementById("chords").onchange = (e) => { state.chords = e.target.value; saveState(); render(); };

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stop();
});

loadState();
render();
document.getElementById("status").textContent = "Tap Play to start audio · DAW-ready exports";
