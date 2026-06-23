/* ═══════════════════════════════════════════
   recite.js — Full Recitation Page Logic
═══════════════════════════════════════════ */

// ── State ─────────────────────────────────
const state = {
  surah        : 1,
  ayah         : 1,
  language     : 'ar-SA',
  arabicText   : '',
  audioUrl     : '',
  recording    : false,
  mediaRecorder: null,
  audioChunks  : [],
  audioBlob    : null,
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

// ── Load Ayah ─────────────────────────────
loadBtn.addEventListener('click', loadAyah);

async function loadAyah() {
  state.surah    = parseInt(surahSelect.value);
  state.ayah     = parseInt(ayahInput.value);
  state.language = langSelect.value;

  // Stop any playing audio
  recitationAudio.pause();
  recitationAudio.currentTime = 0;
  state.audioPlaying = false;
  playAudio.innerHTML = '<i class="fas fa-volume-high"></i> Listen';

  // Show loader, hide content
  verseLoader.style.display   = 'block';
  verseContent.style.display  = 'none';
  feedbackPanel.style.display = 'none';

  // FIX: restore loader HTML in case it was replaced by an error before
  verseLoader.innerHTML = '<div class="loader-ring"></div><p>Loading ayah...</p>';

  try {
    const url = `/api/verse?surah=${state.surah}&ayah=${state.ayah}`;
    console.log('Fetching:', url);

    const res  = await fetch(url);
    const data = await res.json();

    console.log('API response:', data);

    if (!res.ok || !data.success) {
      const msg = data.error || 'Could not load ayah. Try Surah 1 Ayah 1.';
      verseLoader.innerHTML = `<p style="color:var(--danger)">⚠️ ${msg}</p>`;
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
    console.error('loadAyah error:', err);
    verseLoader.innerHTML = `<p style="color:var(--danger)">⚠️ Error: ${err.message}. Make sure Flask is running at http://127.0.0.1:5000</p>`;
  }
}

// ── Listen: Play / Pause Toggle ───────────
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

recitationAudio.addEventListener('error', () => {
  state.audioPlaying = false;
  playAudio.innerHTML = '<i class="fas fa-volume-high"></i> Listen';
});

// ── Urdu Toggle ───────────────────────────
if (urduToggleBtn) {
  urduToggleBtn.addEventListener('click', () => {
    state.urduVisible    = !state.urduVisible;
    urduTextEl.style.display = state.urduVisible ? 'block' : 'none';
    urduToggleBtn.innerHTML  = state.urduVisible
      ? '<i class="fas fa-eye-slash"></i> Hide Urdu'
      : '<i class="fas fa-eye"></i> Show Urdu';
  });
}

// ── Recording ─────────────────────────────
micBtn.addEventListener('click', toggleRecording);

async function toggleRecording() {
  if (state.recording) {
    stopRecording();
  } else {
    startRecording();
  }
}

async function startRecording() {
  // Clear previous results when user starts a fresh recording
  clearPreviousResults();
  feedbackPanel.style.display = 'none';
  state.result = null;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.audioChunks   = [];
    state.audioBlob     = null;   // reset blob so old recording can't be reused
    state.mediaRecorder = new MediaRecorder(stream);

    state.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) state.audioChunks.push(e.data);
    };

    state.mediaRecorder.onstop = () => {
      state.audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });

      // Only enable check if we actually have audio content
      if (state.audioBlob.size > 2000) {
        playbackBtn.disabled = false;
        checkBtn.disabled    = false;
        recordStatus.textContent = '✅ Recording saved. Press "Check Recitation".';
        recordStatus.style.color = 'var(--success)';
      } else {
        // Blob too small = silence / nothing recorded
        state.audioBlob  = null;
        playbackBtn.disabled = true;
        checkBtn.disabled    = true;
        recordStatus.textContent = '⚠️ No audio detected. Please try again.';
        recordStatus.style.color = 'var(--danger)';
        setTimeout(() => {
          recordStatus.textContent = 'Press the button and recite the ayah clearly';
          recordStatus.style.color = '';
        }, 3000);
      }

      stream.getTracks().forEach(t => t.stop());
      stopWaveform();
    };

    state.mediaRecorder.start(100);
    state.recording = true;
    micBtn.classList.add('recording');
    micBtn.innerHTML = '<div class="mic-ripple"></div><i class="fas fa-stop"></i>';
    recordStatus.textContent = '🔴 Recording... Press stop when done.';
    recordStatus.style.color = 'var(--danger)';
    playbackBtn.disabled = true;
    checkBtn.disabled    = true;
    startWaveform(stream);
  } catch (err) {
    recordStatus.textContent = '⚠️ Microphone access denied. Please allow microphone access.';
    recordStatus.style.color = 'var(--danger)';
  }
}

function stopRecording() {
  if (state.mediaRecorder && state.recording) {
    state.mediaRecorder.stop();
    state.recording = false;
    micBtn.classList.remove('recording');
    micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
  }
}

// ── Waveform Visualizer ────────────────────
let analyser, animFrameId, dataArray;

function startWaveform(stream) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source   = audioCtx.createMediaStreamSource(stream);
  analyser        = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  dataArray = new Uint8Array(analyser.frequencyBinCount);
  drawWaveframe();
}

function drawWaveframe() {
  animFrameId = requestAnimationFrame(drawWaveframe);
  analyser.getByteFrequencyData(dataArray);
  wCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
  const barW = (waveformCanvas.width / dataArray.length) * 2.5;
  let x = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const h     = (dataArray[i] / 255) * waveformCanvas.height;
    const alpha = 0.4 + (dataArray[i] / 255) * 0.6;
    wCtx.fillStyle = `rgba(212,168,67,${alpha})`;
    wCtx.fillRect(x, waveformCanvas.height - h, barW, h);
    x += barW + 1;
  }
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

  // Validate blob exists and has real audio content
  if (!state.audioBlob || state.audioBlob.size < 2000) {
    recordStatus.textContent = '⚠️ No recitation found. Please record yourself first.';
    recordStatus.style.color = 'var(--danger)';
    setTimeout(() => {
      recordStatus.textContent = 'Press the button and recite the ayah clearly';
      recordStatus.style.color = '';
    }, 3000);
    return;
  }

  // Clear previous results before showing new ones
  clearPreviousResults();

  checkBtn.disabled   = true;
  checkBtn.innerHTML  = '<i class="fas fa-spinner fa-spin"></i> Checking...';

  const formData = new FormData();
  formData.append('audio',     state.audioBlob, 'recitation.webm');
  formData.append('reference', state.arabicText);
  formData.append('language',  state.language);

  try {
    const res    = await fetch('/api/check_audio', { method: 'POST', body: formData });
    const result = await res.json();

    // If backend returned empty spoken text = nothing was heard
    if (!result.spoken_text || result.spoken_text.trim() === '') {
      showNoSpeechError();
      checkBtn.disabled  = false;
      checkBtn.innerHTML = '<i class="fas fa-check"></i> Check Recitation';
      return;
    }

    state.result = result;
    showFeedback(result);

  } catch (err) {
    showNoSpeechError();
  }

  checkBtn.disabled  = false;
  checkBtn.innerHTML = '<i class="fas fa-check"></i> Check Recitation';
});

// ── No Speech Detected Error ───────────────
function showNoSpeechError() {
  feedbackPanel.style.display = 'block';
  setTimeout(() => feedbackPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

  // Reset ring to 0
  ringFill.style.strokeDashoffset = 314;
  ringFill.style.stroke = '#f87171';
  accuracyNum.textContent = '0';
  feedbackMsg.textContent = '🎙️ No speech detected. Please speak clearly and try again.';
  feedbackMsg.style.color = 'var(--danger)';

  const spokenEl = document.getElementById('spokenTextDisplay');
  if (spokenEl) spokenEl.textContent = '';

  mistakesList.innerHTML = `
    <div style="text-align:center;padding:1rem;color:var(--text-muted)">
      <i class="fas fa-microphone-slash" style="font-size:2rem;margin-bottom:.5rem;display:block;color:var(--danger)"></i>
      Nothing was heard. Make sure your microphone is working and speak clearly in Arabic.
    </div>`;

  highlightedWords.innerHTML = '';
}

// ── Clear Previous Results ─────────────────
function clearPreviousResults() {
  // Reset accuracy ring
  ringFill.style.strokeDashoffset = 314;
  ringFill.style.stroke = 'var(--gold)';
  accuracyNum.textContent = '0';

  // Clear text results
  feedbackMsg.textContent = '';
  feedbackMsg.style.color = '';
  mistakesList.innerHTML  = '';
  highlightedWords.innerHTML = '';

  const spokenEl = document.getElementById('spokenTextDisplay');
  if (spokenEl) spokenEl.textContent = '';
}

// ── Show Feedback ─────────────────────────
function showFeedback(result) {
  feedbackPanel.style.display = 'block';
  feedbackMsg.style.color = '';
  setTimeout(() => feedbackPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

  // Accuracy ring animation
  const circumference = 314;
  const offset = circumference - (circumference * (result.accuracy / 100));
  setTimeout(() => {
    ringFill.style.strokeDashoffset = offset;
    ringFill.style.stroke =
      result.accuracy >= 90 ? '#4ade80' :
      result.accuracy >= 70 ? '#d4a843' : '#f87171';
  }, 150);

  // Accuracy counter
  let cur = 0;
  accuracyNum.textContent = '0';
  const timer = setInterval(() => {
    cur += 2;
    if (cur >= result.accuracy) { cur = result.accuracy; clearInterval(timer); }
    accuracyNum.textContent = Math.floor(cur);
  }, 18);

  feedbackMsg.textContent = result.feedback || '';

  // Show what was spoken
  const spokenEl = document.getElementById('spokenTextDisplay');
  if (spokenEl && result.spoken_text) {
    spokenEl.textContent = `You said: "${result.spoken_text}"`;
  }

  // Mistakes list
  mistakesList.innerHTML = '';
  if (result.mistakes && result.mistakes.length > 0) {
    result.mistakes.forEach(m => {
      const row = document.createElement('div');
      row.className = 'mistake-row';
      row.innerHTML = `
        <span class="mistake-pos">#${m.position}</span>
        <span class="mistake-wrong">${m.spoken}</span>
        <span class="mistake-arrow">→</span>
        <span class="mistake-correct">${m.correct}</span>
      `;
      mistakesList.appendChild(row);
    });
  } else {
    mistakesList.innerHTML = '<p style="color:var(--success);text-align:center;padding:1rem">✅ No mistakes! Excellent recitation! 🌟</p>';
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
      span.title = wr.status === 'wrong'   ? '❌ Incorrect' :
                   wr.status === 'missing' ? '⚠️ Missing'   : '✅ Correct';
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

// ── Retry Button ──────────────────────────
retryBtn.addEventListener('click', () => {
  feedbackPanel.style.display = 'none';
  clearPreviousResults();
  resetRecording();
});

// ── Next Ayah ─────────────────────────────
nextAyahBtn.addEventListener('click', () => {
  state.ayah++;
  ayahInput.value = state.ayah;
  loadAyah();
});

// ── Save Session ──────────────────────────
saveSessionBtn.addEventListener('click', async () => {
  if (!state.result) return;
  const orig = saveSessionBtn.innerHTML;
  saveSessionBtn.disabled = true;
  saveSessionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  try {
    const res = await fetch('/api/save_session', {
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
    } else {
      throw new Error('Save failed');
    }
  } catch (e) {
    saveSessionBtn.innerHTML = '<i class="fas fa-xmark"></i> Error';
    setTimeout(() => { saveSessionBtn.innerHTML = orig; saveSessionBtn.disabled = false; }, 2000);
  }
});

// ── Reset Recording State ─────────────────
function resetRecording() {
  state.recording   = false;
  state.audioBlob   = null;
  state.audioChunks = [];
  micBtn.classList.remove('recording');
  micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
  recordStatus.textContent = 'Press the button and recite the ayah clearly';
  recordStatus.style.color = '';
  playbackBtn.disabled = true;
  checkBtn.disabled    = true;
  stopWaveform();
}

// ── Auto-load on page load ─────────────────
window.addEventListener('DOMContentLoaded', loadAyah);
