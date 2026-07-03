/* ═══════════════════════════════════════════
   recite.js — Records WAV directly in browser
   No ffmpeg needed on server at all.
═══════════════════════════════════════════ */

const state = {
  surah        : 1,
  ayah         : 1,
  language     : 'ar-SA',
  arabicText   : '',
  audioUrl     : '',
  recording    : false,
  audioContext : null,
  processor    : null,
  stream       : null,
  audioBlob    : null,
  recordedChunks: [],
  result       : null,
  audioPlaying : false,
  urduVisible  : true
};

// ── DOM refs ──────────────────────────────
const surahSelect      = document.getElementById('surahSelect');
const ayahInput        = document.getElementById('ayahInput');
const langSelect       = document.getElementById('langSelect');
const loadBtn          = document.getElementById('loadBtn');
const verseLoader      = document.getElementById('verseLoader');
const verseContent     = document.getElementById('verseContent');
const verseRef         = document.getElementById('verseRef');
const arabicTextEl     = document.getElementById('arabicText');
const urduTextEl       = document.getElementById('urduText');
const urduToggleBtn    = document.getElementById('urduToggleBtn');
const highlightedWords = document.getElementById('highlightedWords');
const playAudio        = document.getElementById('playAudio');
const recitationAudio  = document.getElementById('recitationAudio');
const micBtn           = document.getElementById('micBtn');
const recordStatus     = document.getElementById('recordStatus');
const playbackBtn      = document.getElementById('playbackBtn');
const checkBtn         = document.getElementById('checkBtn');
const feedbackPanel    = document.getElementById('feedbackPanel');
const ringFill         = document.getElementById('ringFill');
const accuracyNum      = document.getElementById('accuracyNum');
const feedbackMsg      = document.getElementById('feedbackMsg');
const mistakesList     = document.getElementById('mistakesList');
const retryBtn         = document.getElementById('retryBtn');
const nextAyahBtn      = document.getElementById('nextAyahBtn');
const saveSessionBtn   = document.getElementById('saveSessionBtn');
const waveformCanvas   = document.getElementById('waveform');
const wCtx             = waveformCanvas.getContext('2d');

// ── WAV Encoding Helpers ───────────────────
function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view   = new DataView(buffer);
  function writeStr(offset, str) {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i));
  }
  writeStr(0,  'RIFF');
  view.setUint32(4,  36 + samples.length * 2, true);
  writeStr(8,  'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1,  true);           // PCM
  view.setUint16(22, 1,  true);           // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2,  true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function downsampleBuffer(buffer, inputRate, outputRate) {
  if (inputRate === outputRate) return buffer;
  const ratio    = inputRate / outputRate;
  const newLen   = Math.round(buffer.length / ratio);
  const result   = new Float32Array(newLen);
  let offsetR = 0, offsetB = 0;
  while (offsetR < result.length) {
    const nextOffsetB = Math.round((offsetR + 1) * ratio);
    let accum = 0, count = 0;
    for (let i = offsetB; i < nextOffsetB && i < buffer.length; i++) {
      accum += buffer[i]; count++;
    }
    result[offsetR] = accum / count;
    offsetR++;
    offsetB = nextOffsetB;
  }
  return result;
}

// ── Load Ayah ─────────────────────────────
loadBtn.addEventListener('click', loadAyah);

async function loadAyah() {
  state.surah    = parseInt(surahSelect.value);
  state.ayah     = parseInt(ayahInput.value);
  state.language = langSelect.value;

  recitationAudio.pause();
  recitationAudio.currentTime = 0;
  state.audioPlaying = false;
  playAudio.innerHTML = '<i class="fas fa-volume-high"></i> Listen';

  verseLoader.style.display   = 'block';
  verseContent.style.display  = 'none';
  feedbackPanel.style.display = 'none';
  verseLoader.innerHTML = '<div class="loader-ring"></div><p>Loading ayah...</p>';

  try {
    const url  = `/api/verse?surah=${state.surah}&ayah=${state.ayah}`;
    const res  = await fetch(url);
    const data = await res.json();

    if (!data.arabic) {
      verseLoader.innerHTML = `<p style="color:var(--danger)">⚠️ ${data.error || 'Could not load ayah.'}</p>`;
      return;
    }

    state.arabicText = data.arabic;
    state.audioUrl   = data.audio || '';

    const surahName = surahSelect.options[surahSelect.selectedIndex].text;
    verseRef.textContent     = `${surahName} • ${state.surah}:${state.ayah}`;
    arabicTextEl.textContent = data.arabic;
    urduTextEl.textContent   = data.urdu || 'Translation not available';
    highlightedWords.innerHTML = '';

    verseLoader.style.display  = 'none';
    verseContent.style.display = 'block';

    clearPreviousResults();
    resetRecording();
  } catch (err) {
    verseLoader.innerHTML = `<p style="color:var(--danger)">⚠️ ${err.message}</p>`;
  }
}

// ── Listen Button ─────────────────────────
playAudio.addEventListener('click', () => {
  if (!state.audioUrl) return;
  if (state.audioPlaying) {
    recitationAudio.pause();
    state.audioPlaying = false;
    playAudio.innerHTML = '<i class="fas fa-volume-high"></i> Listen';
  } else {
    recitationAudio.src = state.audioUrl;
    recitationAudio.play();
    state.audioPlaying = true;
    playAudio.innerHTML = '<i class="fas fa-pause"></i> Pause';
  }
});
recitationAudio.addEventListener('ended', () => {
  state.audioPlaying = false;
  playAudio.innerHTML = '<i class="fas fa-volume-high"></i> Listen';
});

// ── Urdu Toggle ───────────────────────────
if (urduToggleBtn) {
  urduToggleBtn.addEventListener('click', () => {
    state.urduVisible = !state.urduVisible;
    urduTextEl.style.display = state.urduVisible ? 'block' : 'none';
    urduToggleBtn.innerHTML  = state.urduVisible
      ? '<i class="fas fa-eye-slash"></i> Hide Urdu'
      : '<i class="fas fa-eye"></i> Show Urdu';
  });
}

// ── Recording — Web Audio API → PCM WAV ───
micBtn.addEventListener('click', toggleRecording);

async function toggleRecording() {
  if (state.recording) stopRecording();
  else startRecording();
}

async function startRecording() {
  clearPreviousResults();
  feedbackPanel.style.display = 'none';
  state.result       = null;
  state.audioBlob    = null;
  state.recordedChunks = [];

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const SAMPLE_RATE = 16000;

    state.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    const source       = state.audioContext.createMediaStreamSource(state.stream);

    // ScriptProcessor records raw PCM float32 frames
    state.processor = state.audioContext.createScriptProcessor(4096, 1, 1);
    state.processor.onaudioprocess = e => {
      const data = e.inputBuffer.getChannelData(0);
      state.recordedChunks.push(new Float32Array(data));
    };

    source.connect(state.processor);
    state.processor.connect(state.audioContext.destination);

    state.recording = true;
    micBtn.classList.add('recording');
    micBtn.innerHTML = '<div class="mic-ripple"></div><i class="fas fa-stop"></i>';
    recordStatus.textContent = '🔴 Recording... Press stop when done.';
    recordStatus.style.color = 'var(--danger)';
    playbackBtn.disabled = true;
    checkBtn.disabled    = true;

    startWaveform(state.stream);
  } catch (err) {
    recordStatus.textContent = '⚠️ Microphone access denied.';
    recordStatus.style.color = 'var(--danger)';
  }
}

function stopRecording() {
  if (!state.recording) return;
  state.recording = false;

  // Disconnect audio processor
  if (state.processor)     { state.processor.disconnect();     state.processor = null; }
  if (state.audioContext)  { state.audioContext.close();       state.audioContext = null; }
  if (state.stream)        { state.stream.getTracks().forEach(t => t.stop()); state.stream = null; }

  stopWaveform();

  // Merge all PCM chunks into one Float32Array
  const totalLen = state.recordedChunks.reduce((a, b) => a + b.length, 0);
  const merged   = new Float32Array(totalLen);
  let offset = 0;
  for (const chunk of state.recordedChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  // Encode directly as 16kHz mono WAV — no ffmpeg needed!
  state.audioBlob = encodeWAV(merged, 16000);
  console.log(`WAV blob size: ${state.audioBlob.size} bytes`);

  micBtn.classList.remove('recording');
  micBtn.innerHTML = '<i class="fas fa-microphone"></i>';

  if (state.audioBlob.size > 2000) {
    playbackBtn.disabled = false;
    checkBtn.disabled    = false;
    recordStatus.textContent = '✅ Recording saved. Press "Check Recitation".';
    recordStatus.style.color = 'var(--success)';
  } else {
    state.audioBlob = null;
    recordStatus.textContent = '⚠️ No audio detected. Try again.';
    recordStatus.style.color = 'var(--danger)';
    setTimeout(() => { recordStatus.textContent = 'Press the button and recite the ayah clearly'; recordStatus.style.color = ''; }, 3000);
  }
}

// ── Waveform ──────────────────────────────
let analyser, animFrameId, dataArray;

function startWaveform(stream) {
  const ctx2  = new (window.AudioContext || window.webkitAudioContext)();
  const src   = ctx2.createMediaStreamSource(stream);
  analyser    = ctx2.createAnalyser();
  analyser.fftSize = 256;
  src.connect(analyser);
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  drawWave();
}
function drawWave() {
  animFrameId = requestAnimationFrame(drawWave);
  analyser.getByteFrequencyData(dataArray);
  wCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
  const bw = (waveformCanvas.width / dataArray.length) * 2.5;
  let x = 0;
  dataArray.forEach(v => {
    const h = (v / 255) * waveformCanvas.height;
    wCtx.fillStyle = `rgba(212,168,67,${0.4 + (v/255)*0.6})`;
    wCtx.fillRect(x, waveformCanvas.height - h, bw, h);
    x += bw + 1;
  });
}
function stopWaveform() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  wCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
}

// ── Playback ──────────────────────────────
playbackBtn.addEventListener('click', () => {
  if (!state.audioBlob) return;
  const url   = URL.createObjectURL(state.audioBlob);
  const audio = new Audio(url);
  playbackBtn.innerHTML = '<i class="fas fa-pause"></i> Playing...';
  playbackBtn.disabled  = true;
  audio.play();
  audio.onended = () => {
    playbackBtn.innerHTML = '<i class="fas fa-play"></i> Playback';
    playbackBtn.disabled  = false;
    URL.revokeObjectURL(url);
  };
});

// ── Check Recitation ──────────────────────
checkBtn.addEventListener('click', async () => {
  if (!state.arabicText) return;
  if (!state.audioBlob || state.audioBlob.size < 2000) {
    recordStatus.textContent = '⚠️ No recording found. Please record first.';
    recordStatus.style.color = 'var(--danger)';
    setTimeout(() => { recordStatus.textContent = 'Press the button and recite the ayah clearly'; recordStatus.style.color = ''; }, 3000);
    return;
  }

  clearPreviousResults();
  checkBtn.disabled  = true;
  checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';

  const formData = new FormData();
  // Send as .wav — it IS a real WAV file now
  formData.append('audio',     state.audioBlob, 'recitation.wav');
  formData.append('reference', state.arabicText);
  formData.append('language',  state.language);

  try {
    const res    = await fetch('/api/check_audio', { method: 'POST', body: formData });
    const result = await res.json();

    if (!result.spoken_text || result.spoken_text.trim() === '') {
      showNoSpeechError();
    } else {
      state.result = result;
      showFeedback(result);
    }
  } catch (err) {
    showNoSpeechError();
  }

  checkBtn.disabled  = false;
  checkBtn.innerHTML = '<i class="fas fa-check"></i> Check Recitation';
});

// ── No Speech Error ────────────────────────
function showNoSpeechError() {
  feedbackPanel.style.display = 'block';
  setTimeout(() => feedbackPanel.scrollIntoView({ behavior:'smooth', block:'start' }), 100);
  ringFill.style.strokeDashoffset = 314;
  ringFill.style.stroke = '#f87171';
  accuracyNum.textContent = '0';
  feedbackMsg.textContent = '🎙️ No speech detected. Speak clearly and try again.';
  feedbackMsg.style.color = 'var(--danger)';
  mistakesList.innerHTML = `<div style="text-align:center;padding:1rem;color:var(--text-muted)">
    <i class="fas fa-microphone-slash" style="font-size:2rem;display:block;margin-bottom:.5rem;color:var(--danger)"></i>
    Nothing was heard. Make sure your mic is working and speak clearly in Arabic.
  </div>`;
  highlightedWords.innerHTML = '';
}

// ── Clear Previous Results ─────────────────
function clearPreviousResults() {
  ringFill.style.strokeDashoffset = 314;
  ringFill.style.stroke = 'var(--gold)';
  accuracyNum.textContent = '0';
  feedbackMsg.textContent = '';
  feedbackMsg.style.color = '';
  mistakesList.innerHTML  = '';
  highlightedWords.innerHTML = '';
  const sp = document.getElementById('spokenTextDisplay');
  if (sp) sp.textContent = '';
}

// ── Show Feedback ─────────────────────────
function showFeedback(result) {
  feedbackPanel.style.display = 'block';
  feedbackMsg.style.color = '';
  setTimeout(() => feedbackPanel.scrollIntoView({ behavior:'smooth', block:'start' }), 100);

  const offset = 314 - (314 * (result.accuracy / 100));
  setTimeout(() => {
    ringFill.style.strokeDashoffset = offset;
    ringFill.style.stroke = result.accuracy >= 90 ? '#4ade80' : result.accuracy >= 70 ? '#d4a843' : '#f87171';
  }, 150);

  let cur = 0;
  accuracyNum.textContent = '0';
  const timer = setInterval(() => {
    cur += 2;
    if (cur >= result.accuracy) { cur = result.accuracy; clearInterval(timer); }
    accuracyNum.textContent = Math.floor(cur);
  }, 18);

  feedbackMsg.textContent = result.feedback || '';
  const sp = document.getElementById('spokenTextDisplay');
  if (sp && result.spoken_text) sp.textContent = `You said: "${result.spoken_text}"`;

  mistakesList.innerHTML = '';
  if (result.mistakes && result.mistakes.length > 0) {
    result.mistakes.forEach(m => {
      const row = document.createElement('div');
      row.className = 'mistake-row';
      row.innerHTML = `<span class="mistake-pos">#${m.position}</span>
        <span class="mistake-wrong">${m.spoken}</span>
        <span class="mistake-arrow">→</span>
        <span class="mistake-correct">${m.correct}</span>`;
      mistakesList.appendChild(row);
    });
  } else {
    mistakesList.innerHTML = '<p style="color:var(--success);text-align:center;padding:1rem">✅ No mistakes! Excellent! 🌟</p>';
  }
  highlightWords(result);
}

// ── Highlight Words ────────────────────────
function highlightWords(result) {
  if (!state.arabicText) return;
  highlightedWords.innerHTML = '';
  if (result.word_results && result.word_results.length > 0) {
    result.word_results.forEach(wr => {
      const span = document.createElement('span');
      span.className   = 'word-token ' + wr.status;
      span.textContent = wr.word;
      highlightedWords.appendChild(span);
    });
  } else {
    const words    = state.arabicText.split(' ');
    const wrongSet = new Set((result.mistakes || []).map(m => m.position - 1));
    words.forEach((w, i) => {
      const span = document.createElement('span');
      span.className   = 'word-token ' + (wrongSet.has(i) ? 'wrong' : 'correct');
      span.textContent = w;
      highlightedWords.appendChild(span);
    });
  }
}

// ── Controls ──────────────────────────────
retryBtn.addEventListener('click', () => {
  feedbackPanel.style.display = 'none';
  clearPreviousResults();
  resetRecording();
});

nextAyahBtn.addEventListener('click', () => {
  state.ayah++;
  ayahInput.value = state.ayah;
  loadAyah();
});

saveSessionBtn.addEventListener('click', async () => {
  if (!state.result) return;
  const orig = saveSessionBtn.innerHTML;
  saveSessionBtn.disabled = true;
  saveSessionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  try {
    const res  = await fetch('/api/save_session', {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        surah   : state.surah,
        ayah    : state.ayah,
        accuracy: state.result.accuracy,
        mistakes: state.result.mistakes || []
      })
    });
    const data = await res.json();
    if (data.success) {
      saveSessionBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
      setTimeout(() => { saveSessionBtn.innerHTML = orig; saveSessionBtn.disabled = false; }, 2500);
    }
  } catch (e) {
    saveSessionBtn.innerHTML = orig;
    saveSessionBtn.disabled = false;
  }
});

function resetRecording() {
  state.recording     = false;
  state.audioBlob     = null;
  state.recordedChunks = [];
  micBtn.classList.remove('recording');
  micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
  recordStatus.textContent = 'Press the button and recite the ayah clearly';
  recordStatus.style.color = '';
  playbackBtn.disabled = true;
  checkBtn.disabled    = true;
  stopWaveform();
}

window.addEventListener('DOMContentLoaded', loadAyah);