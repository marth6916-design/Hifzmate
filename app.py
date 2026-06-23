from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
import os
import tempfile

app = Flask(__name__)
app.secret_key = 'hifzmate_secret_key'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///hifzmate.db'
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
    status = 200 if data.get('success') else 503
    return jsonify(data), status

# ── API: Check Audio ─────────────────────────
@app.route('/api/check_audio', methods=['POST'])
def api_check_audio():
    from speech import convert_to_wav, transcribe_audio
    from nlp import compare_text

    reference = request.form.get('reference', '')
    language  = request.form.get('language', 'ar-SA')
    audio_file = request.files.get('audio')

    if not audio_file:
        return jsonify({'error': 'No audio provided'}), 400

    # Save uploaded audio to a temp file with the correct extension.
    original_tmp = tempfile.NamedTemporaryFile(suffix='.webm', delete=False)
    audio_file.save(original_tmp.name)
    original_tmp.close()

    wav_tmp = None
    try:
        try:
            wav_tmp = convert_to_wav(original_tmp.name)
        except Exception as e:
            print(f"Audio conversion failed: {e}")
            return jsonify({'error': 'Could not convert audio file to WAV. Please try again.'}), 400

        spoken_result = transcribe_audio(wav_tmp, language)
        if not spoken_result.get('success'):
            return jsonify({
                'success'      : False,
                'error'        : spoken_result.get('error', 'Audio transcription failed.'),
                'spoken_text'  : spoken_result.get('text', ''),
                'accuracy'     : 0,
                'mistakes'     : [],
                'mistake_count': 0,
                'feedback'     : 'Unable to transcribe audio. Please speak clearly and try again.',
                'word_results' : []
            }), 400

        spoken = spoken_result.get('text', '')
        result = compare_text(spoken, reference)
        result['spoken_text'] = spoken
    finally:
        if os.path.exists(original_tmp.name):
            os.unlink(original_tmp.name)
        if wav_tmp and os.path.exists(wav_tmp):
            os.unlink(wav_tmp)

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

# ── Run ──────────────────────────────────────
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        print("✅ Database ready.")
    app.run(debug=True)
