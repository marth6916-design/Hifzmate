from app import db
from datetime import datetime

class User(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    name       = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    sessions   = db.relationship('Session', backref='user', lazy=True)

class Session(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    surah      = db.Column(db.Integer)
    ayah       = db.Column(db.Integer)
    accuracy   = db.Column(db.Float)
    timestamp  = db.Column(db.DateTime, default=datetime.utcnow)
    mistakes   = db.relationship('Mistake', backref='session', lazy=True)

class Mistake(db.Model):
    id         = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('session.id'), nullable=False)
    wrong_word = db.Column(db.String(100))
    correct    = db.Column(db.String(100))