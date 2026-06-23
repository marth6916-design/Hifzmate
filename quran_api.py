"""
quran_api.py — Fetch Quranic verses from api.alquran.cloud
Falls back to local data if API is unreachable.
"""

import json
import os
import requests

BASE_URL = "https://api.alquran.cloud/v1"
_cache   = {}
_failed_cache = {}

# ── Local fallback data (most common surahs) ──
BUILT_IN_LOCAL_VERSES = {
    "1:1": {
        "arabic": "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
        "urdu"  : "اللہ کے نام سے جو بڑا مہربان نہایت رحم والا ہے",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3"
    },
    "1:2": {
        "arabic": "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
        "urdu"  : "سب تعریف اللہ کے لیے ہے جو سارے جہانوں کا پالنے والا ہے",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/2.mp3"
    },
    "1:3": {
        "arabic": "الرَّحْمَٰنِ الرَّحِيمِ",
        "urdu"  : "جو بہت مہربان نہایت رحم والا ہے",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/3.mp3"
    },
    "1:4": {
        "arabic": "مَالِكِ يَوْمِ الدِّينِ",
        "urdu"  : "روزِ جزا کا مالک ہے",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/4.mp3"
    },
    "1:5": {
        "arabic": "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
        "urdu"  : "ہم تیری ہی عبادت کرتے ہیں اور تجھ سے ہی مدد مانگتے ہیں",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/5.mp3"
    },
    "1:6": {
        "arabic": "اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ",
        "urdu"  : "ہمیں سیدھی راہ دکھا",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/6.mp3"
    },
    "1:7": {
        "arabic": "صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ",
        "urdu"  : "ان لوگوں کی راہ جن پر تو نے انعام کیا، ان کی نہیں جن پر غضب ہوا اور نہ گمراہوں کی",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/7.mp3"
    },
    "112:1": {
        "arabic": "قُلْ هُوَ اللَّهُ أَحَدٌ",
        "urdu"  : "کہو وہ اللہ ایک ہے",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/6222.mp3"
    },
    "112:2": {
        "arabic": "اللَّهُ الصَّمَدُ",
        "urdu"  : "اللہ بے نیاز ہے",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/6223.mp3"
    },
    "112:3": {
        "arabic": "لَمْ يَلِدْ وَلَمْ يُولَدْ",
        "urdu"  : "نہ اس سے کوئی پیدا ہوا نہ وہ پیدا ہوا",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/6224.mp3"
    },
    "112:4": {
        "arabic": "وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ",
        "urdu"  : "اور کوئی اس کا ہمسر نہیں",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/6225.mp3"
    },
    "113:1": {
        "arabic": "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ",
        "urdu"  : "کہو میں صبح کے رب کی پناہ مانگتا ہوں",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/6226.mp3"
    },
    "114:1": {
        "arabic": "قُلْ أَعُوذُ بِرَبِّ النَّاسِ",
        "urdu"  : "کہو میں لوگوں کے رب کی پناہ مانگتا ہوں",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/6231.mp3"
    },
    "114:2": {
        "arabic": "مَلِكِ النَّاسِ",
        "urdu"  : "لوگوں کے بادشاہ کی",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/6232.mp3"
    },
    "114:3": {
        "arabic": "إِلَٰهِ النَّاسِ",
        "urdu"  : "لوگوں کے معبود کی",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/6233.mp3"
    },
    "114:4": {
        "arabic": "مِن شَرِّ الْوَسْوَاسِ الْخَنَّاسِ",
        "urdu"  : "وسوسہ ڈالنے والے پیچھے ہٹنے والے کے شر سے",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/6234.mp3"
    },
    "114:5": {
        "arabic": "الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ",
        "urdu"  : "جو لوگوں کے سینوں میں وسوسہ ڈالتا ہے",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/6235.mp3"
    },
    "114:6": {
        "arabic": "مِنَ الْجِنَّةِ وَالنَّاسِ",
        "urdu"  : "جنوں میں سے ہو یا انسانوں میں سے",
        "audio" : "https://cdn.islamic.network/quran/audio/128/ar.alafasy/6236.mp3"
    }
}


def _load_local_verses():
    config_path = os.path.join(os.path.dirname(__file__), 'local_verses.json')
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    print('Loaded local_verses.json with', len(data), 'entries')
                    return data
        except Exception as e:
            print(f'Could not load local_verses.json: {e} — using built-in fallback')

    return BUILT_IN_LOCAL_VERSES

LOCAL_VERSES = _load_local_verses()

SURAH_NAMES = {
    1:'Al-Fatiha', 2:'Al-Baqarah', 3:'Ali Imran', 4:'An-Nisa',
    5:'Al-Maidah', 6:'Al-Anam', 7:'Al-Araf', 8:'Al-Anfal',
    9:'At-Tawbah', 10:'Yunus', 36:'Ya-Sin', 67:'Al-Mulk',
    112:'Al-Ikhlas', 113:'Al-Falaq', 114:'An-Nas'
}


def get_verse(surah: int, ayah: int) -> dict:
    surah = int(surah)
    ayah  = int(ayah)
    key   = f"{surah}:{ayah}"

    # Return cached result
    if key in _cache:
        print(f"Cache hit: {key}")
        return _cache[key]

    # Return cached offline failure result if we already know this verse is unavailable
    if key in _failed_cache:
        print(f"Cached API failure: {key}")
        return _failed_cache[key]

    # Try live API first
    try:
        print(f"Fetching from API: surah={surah} ayah={ayah}")

        arabic_res = requests.get(
            f"{BASE_URL}/ayah/{surah}:{ayah}",
            timeout=6
        ).json()

        print(f"API response code: {arabic_res.get('code')}")

        if arabic_res.get('code') == 200:
            arabic_data = arabic_res['data']
            arabic_text = arabic_data['text']
            global_num  = arabic_data['number']

            # Urdu translation
            try:
                urdu_res  = requests.get(
                    f"{BASE_URL}/ayah/{surah}:{ayah}/ur.jalandhry",
                    timeout=6
                ).json()
                urdu_text = urdu_res['data']['text'] if urdu_res.get('code') == 200 else ''
            except Exception:
                urdu_text = LOCAL_VERSES.get(key, {}).get('urdu', '')

            audio_url = f"https://cdn.islamic.network/quran/audio/128/ar.alafasy/{global_num}.mp3"

            result = {
                'surah'     : surah,
                'ayah'      : ayah,
                'arabic'    : arabic_text,
                'urdu'      : urdu_text,
                'audio'     : audio_url,
                'surah_name': SURAH_NAMES.get(surah, f'Surah {surah}'),
                'success'   : True,
                'source'    : 'api'
            }
            _cache[key] = result
            return result

    except requests.exceptions.RequestException as e:
        print(f"API failed: {e} — using local fallback")
    except Exception as e:
        print(f"Unexpected error while fetching verse: {e}")

    # Fallback to local data
    if key in LOCAL_VERSES:
        local = LOCAL_VERSES[key]
        result = {
            'surah'     : surah,
            'ayah'      : ayah,
            'arabic'    : local['arabic'],
            'urdu'      : local['urdu'],
            'audio'     : local['audio'],
            'surah_name': SURAH_NAMES.get(surah, f'Surah {surah}'),
            'success'   : True,
            'source'    : 'local'
        }
        _cache[key] = result
        print(f"Loaded from local fallback: {key}")
        return result

    # Nothing found
    result = {
        'surah'  : surah,
        'ayah'   : ayah,
        'arabic' : '',
        'urdu'   : '',
        'audio'  : '',
        'success': False,
        'source' : 'api_error',
        'error'  : f'Ayah {surah}:{ayah} not found or the Quran API is unreachable. Try Surah 1 or 112-114.'
    }
    _failed_cache[key] = result
    return result


if __name__ == '__main__':
    v = get_verse(1, 1)
    print("Arabic:", v['arabic'])
    print("Urdu  :", v['urdu'])
    print("Source:", v.get('source'))
