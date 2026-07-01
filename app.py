from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import os, shutil, subprocess, tempfile

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'hifzmate_secret_key')

# Use absolute path so DB works correctly on any host (Render, local, etc.)
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'hifzmate.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# ── Models ──────────────────────────────────
class User(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    name       = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    sessions   = db.relationship('Session', backref='user', lazy=True)

class Session(db.Model):
    id        = db.Column(db.Integer, primary_key=True)
    user_id   = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    surah     = db.Column(db.Integer)
    ayah      = db.Column(db.Integer)
    accuracy  = db.Column(db.Float)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    mistakes  = db.relationship('Mistake', backref='session', lazy=True)

class Mistake(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('session.id'), nullable=False)
    wrong_word = db.Column(db.String(200))
    correct    = db.Column(db.String(200))
    position   = db.Column(db.Integer)

# ── Page Routes ──────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/recite')
def recite():
    return render_template('recite.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/progress')
def progress():
    return render_template('progress.html')

# ── API: Get Verse ───────────────────────────
@app.route('/api/verse')
def api_verse():
    from quran_api import get_verse
    surah = request.args.get('surah', 1)
    ayah  = request.args.get('ayah', 1)
    data  = get_verse(surah, ayah)
    return jsonify(data)

def _find_ffmpeg():
    """Find ffmpeg binary — checks PATH first, then common Nix store paths."""
    found = shutil.which('ffmpeg')
    if found:
        return found
    nix_bin_dirs = [
        '/nix/var/nix/profiles/default/bin',
        '/run/current-system/sw/bin',
        '/usr/local/bin',
        '/usr/bin',
    ]
    for d in nix_bin_dirs:
        candidate = os.path.join(d, 'ffmpeg')
        if os.path.isfile(candidate):
            return candidate
    try:
        result = subprocess.run(
            ['find', '/nix/store', '-name', 'ffmpeg', '-type', 'f'],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.strip().splitlines():
            if line.endswith('/ffmpeg'):
                return line.strip()
    except Exception:
        pass
    return None


def _find_ffprobe():
    """Find ffprobe binary."""
    found = shutil.which('ffprobe')
    if found:
        return found
    nix_bin_dirs = [
        '/nix/var/nix/profiles/default/bin',
        '/run/current-system/sw/bin',
        '/usr/local/bin',
        '/usr/bin',
    ]
    for d in nix_bin_dirs:
        candidate = os.path.join(d, 'ffprobe')
        if os.path.isfile(candidate):
            return candidate
    try:
        result = subprocess.run(
            ['find', '/nix/store', '-name', 'ffprobe', '-type', 'f'],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.strip().splitlines():
            if line.endswith('/ffprobe'):
                return line.strip()
    except Exception:
        pass
    return None


def _convert_audio_to_wav(input_path, output_path):
    """Convert any browser audio (webm/ogg) to 16kHz mono WAV."""
    ffmpeg_path  = _find_ffmpeg()
    ffprobe_path = _find_ffprobe()
    print(f"ffmpeg  path: {ffmpeg_path}")
    print(f"ffprobe path: {ffprobe_path}")

    # Try pydub with explicit binary paths
    try:
        from pydub import AudioSegment
        if ffmpeg_path:
            AudioSegment.converter = ffmpeg_path
        if ffprobe_path:
            AudioSegment.ffprobe   = ffprobe_path
        audio_seg = AudioSegment.from_file(input_path)
        audio_seg = audio_seg.set_frame_rate(16000).set_channels(1)
        audio_seg.export(output_path, format='wav')
        print("Audio converted via pydub")
        return
    except Exception as pydub_err:
        print(f"pydub failed: {pydub_err} — trying raw ffmpeg subprocess")

    # Fallback: call ffmpeg directly as subprocess
    if ffmpeg_path:
        cmd = [ffmpeg_path, '-y', '-i', input_path, '-ar', '16000', '-ac', '1', output_path]
        completed = subprocess.run(cmd, capture_output=True, text=True)
        print(f"ffmpeg stdout: {completed.stdout}")
        print(f"ffmpeg stderr: {completed.stderr}")
        if completed.returncode == 0:
            print("Audio converted via ffmpeg subprocess")
            return
        raise RuntimeError(f"ffmpeg failed: {completed.stderr.strip()}")

    raise RuntimeError('ffmpeg not found — audio conversion impossible')


# ── API: Check Audio ─────────────────────────
@app.route('/api/check_audio', methods=['POST'])
def api_check_audio():
    from speech import transcribe_audio
    from nlp import compare_text

    reference  = request.form.get('reference', '')
    language   = request.form.get('language', 'ar-SA')
    audio_file = request.files.get('audio')

    if not audio_file:
        return jsonify({'error': 'No audio provided'}), 400

    # Browser sends webm/ogg — save it as-is first
    raw_tmp = tempfile.NamedTemporaryFile(suffix='.webm', delete=False)
    audio_file.save(raw_tmp.name)
    raw_tmp.close()

    wav_path = raw_tmp.name + '.wav'

    try:
        # Convert webm/ogg -> wav (16kHz mono) so SpeechRecognition can read it
        try:
            _convert_audio_to_wav(raw_tmp.name, wav_path)
        except Exception as conv_err:
            print(f"❌ AUDIO CONVERSION FAILED: {conv_err}")
            print("   → Check that ffmpeg is installed and in your system PATH.")
            print("   → Run 'ffmpeg -version' in terminal to verify.")
            return jsonify({
                'accuracy': 0, 'mistakes': [], 'mistake_count': 0,
                'spoken_text': '', 'word_results': [],
                'feedback': 'Could not process audio. Please try again.',
                'error': f'Audio conversion failed: {conv_err}'
            })

        # transcribe_audio() returns a dict: {text, success, error}
        speech_result = transcribe_audio(wav_path, language)
        spoken_text   = speech_result.get('text', '')

        result = compare_text(spoken_text, reference)
        result['spoken_text'] = spoken_text

        if not speech_result.get('success'):
            result['speech_error'] = speech_result.get('error')

    finally:
        if os.path.exists(raw_tmp.name):
            os.unlink(raw_tmp.name)
        if os.path.exists(wav_path):
            os.unlink(wav_path)

    return jsonify(result)

# ── API: Check Text (direct) ─────────────────
@app.route('/api/check', methods=['POST'])
def api_check():
    from nlp import compare_text
    data      = request.json
    spoken    = data.get('spoken', '')
    reference = data.get('reference', '')
    result    = compare_text(spoken, reference)
    return jsonify(result)

# ── API: Save Session ─────────────────────────
@app.route('/api/save_session', methods=['POST'])
def api_save_session():
    data = request.json
    session = Session(
        surah    = data.get('surah'),
        ayah     = data.get('ayah'),
        accuracy = data.get('accuracy'),
    )
    db.session.add(session)
    db.session.flush()

    for m in data.get('mistakes', []):
        mistake = Mistake(
            session_id = session.id,
            wrong_word = m.get('spoken'),
            correct    = m.get('correct'),
            position   = m.get('position')
        )
        db.session.add(mistake)

    db.session.commit()
    return jsonify({'success': True, 'session_id': session.id})

# ── API: All Sessions (for Progress page) ────
@app.route('/api/all_sessions')
def api_all_sessions():
    sessions = Session.query.order_by(Session.timestamp.desc()).all()
    result   = []
    for s in sessions:
        result.append({
            'id'       : s.id,
            'surah'    : s.surah,
            'ayah'     : s.ayah,
            'accuracy' : round(s.accuracy, 1),
            'mistakes' : len(s.mistakes),
            'timestamp': s.timestamp.isoformat()
        })
    return jsonify(result)

# ── API: Dashboard Stats ──────────────────────
@app.route('/api/stats')
def api_stats():
    sessions = Session.query.order_by(Session.timestamp.desc()).all()

    total_sessions = len(sessions)
    avg_accuracy   = round(sum(s.accuracy for s in sessions) / total_sessions, 1) if sessions else 0
    total_ayahs    = total_sessions

    # Streak calculation
    streak = 0
    today  = datetime.utcnow().date()
    for i in range(30):
        day = today - timedelta(days=i)
        if any(s.timestamp.date() == day for s in sessions):
            streak += 1
        elif i > 0:
            break

    # Last 12 sessions for chart
    last12   = sessions[:12][::-1]
    acc_series = [round(s.accuracy, 1) for s in last12]
    labels     = [s.timestamp.strftime('%b %d') for s in last12]

    # Surah distribution
    surah_map = {
        1:'Al-Fatiha', 2:'Al-Baqarah', 3:'Ali Imran',
        112:'Al-Ikhlas', 113:'Al-Falaq', 114:'An-Nas'
    }
    surah_dist = {}
    for s in sessions:
        name = surah_map.get(s.surah, f'Surah {s.surah}')
        surah_dist[name] = surah_dist.get(name, 0) + 1

    # Recent 5 sessions
    recent = []
    for s in sessions[:5]:
        name = surah_map.get(s.surah, f'Surah {s.surah}')
        status = 'good' if s.accuracy >= 85 else 'avg' if s.accuracy >= 65 else 'poor'
        recent.append({
            'date'    : s.timestamp.strftime('%Y-%m-%d'),
            'surah'   : name,
            'ayah'    : s.ayah,
            'accuracy': round(s.accuracy, 1),
            'mistakes': len(s.mistakes),
            'status'  : status
        })

    # Revision suggestions: ayahs with < 80% accuracy
    revisions = []
    seen = set()
    for s in sessions:
        key = (s.surah, s.ayah)
        if key not in seen and s.accuracy < 80:
            seen.add(key)
            name  = surah_map.get(s.surah, f'Surah {s.surah}')
            label = 'low' if s.accuracy < 65 else 'mid'
            revisions.append({
                'surah'   : name,
                'ayah'    : s.ayah,
                'accuracy': round(s.accuracy, 1),
                'label'   : label
            })

    return jsonify({
        'total_sessions' : total_sessions,
        'avg_accuracy'   : avg_accuracy,
        'streak'         : streak,
        'total_ayahs'    : total_ayahs,
        'accuracy_series': acc_series,
        'labels'         : labels,
        'surah_dist'     : surah_dist,
        'sessions'       : recent,
        'revisions'      : revisions[:5]
    })

# ── Create DB tables on startup (works for both local + gunicorn) ──
with app.app_context():
    db.create_all()
    print("✅ Database ready.")

# ── Run (local development only) ─────────────
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)