"""
nlp.py — Text comparison & feedback engine for HifzMate
Handles Arabic diacritics (tashkeel) stripping for flexible matching
"""

import re
import unicodedata
from fuzzywuzzy import fuzz, process


# ─────────────────────────────────────────────
# Arabic diacritics (tashkeel) — strip for comparison
# ─────────────────────────────────────────────
ARABIC_DIACRITICS = re.compile(r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]')

def strip_diacritics(text: str) -> str:
    """Remove Arabic diacritics (tashkeel) for flexible comparison."""
    return ARABIC_DIACRITICS.sub('', text).strip()

def normalize_arabic(text: str) -> str:
    """Normalize Arabic text: remove diacritics, normalize alef variants, remove tatweel."""
    text = strip_diacritics(text)
    # Normalize alef variants → plain alef
    text = re.sub(r'[إأآا]', 'ا', text)
    # Remove tatweel (kashida)
    text = re.sub(r'ـ', '', text)
    # Normalize yaa variants
    text = re.sub(r'[يى]', 'ي', text)
    # Normalize haa variants
    text = re.sub(r'[ةه]', 'ه', text)
    return text.strip()


# ─────────────────────────────────────────────
# Main comparison function
# ─────────────────────────────────────────────
def compare_text(spoken: str, reference: str) -> dict:
    """
    Compare spoken text against the reference Quranic text.

    Args:
        spoken    : transcribed speech text
        reference : correct Quranic ayah text

    Returns:
        dict with accuracy, mistakes, feedback, word_results
    """
    if not spoken:
        return {
            'accuracy'     : 0,
            'mistakes'     : [],
            'mistake_count': 0,
            'feedback'     : 'No speech detected. Please try again.',
            'spoken_text'  : spoken,
            'word_results' : []
        }

    # Normalize both for comparison
    spoken_norm    = normalize_arabic(spoken)
    reference_norm = normalize_arabic(reference)

    spoken_words    = spoken_norm.split()
    reference_words = reference_norm.split()

    # Original words (with diacritics) for display
    reference_original = reference.split()

    mistakes     = []
    word_results = []   # per-word: correct / wrong / missing

    # Word-by-word comparison
    for i, ref_word in enumerate(reference_words):
        if i < len(spoken_words):
            sp_word = spoken_words[i]
            # Use fuzzy match per word (threshold 80)
            similarity = fuzz.ratio(sp_word, ref_word)
            is_correct = similarity >= 80

            orig_ref = reference_original[i] if i < len(reference_original) else ref_word

            if is_correct:
                word_results.append({'word': orig_ref, 'status': 'correct', 'position': i + 1})
            else:
                word_results.append({'word': orig_ref, 'status': 'wrong',   'position': i + 1})
                mistakes.append({
                    'position': i + 1,
                    'correct' : orig_ref,
                    'spoken'  : reference_original[i] if i < len(reference_original) else sp_word,
                    'similarity': similarity
                })
        else:
            # Missing word
            orig_ref = reference_original[i] if i < len(reference_original) else ref_word
            word_results.append({'word': orig_ref, 'status': 'missing', 'position': i + 1})
            mistakes.append({
                'position'  : i + 1,
                'correct'   : orig_ref,
                'spoken'    : '(missing)',
                'similarity': 0
            })

    # Overall accuracy: fuzzy ratio on full normalized strings
    overall_accuracy = fuzz.ratio(spoken_norm, reference_norm)

    # Bonus: if no word mistakes, override with high score
    if not mistakes:
        overall_accuracy = max(overall_accuracy, 95)

    return {
        'accuracy'     : overall_accuracy,
        'mistakes'     : mistakes,
        'mistake_count': len(mistakes),
        'feedback'     : get_feedback(overall_accuracy, len(mistakes)),
        'spoken_text'  : spoken,
        'word_results' : word_results
    }


# ─────────────────────────────────────────────
# Feedback messages
# ─────────────────────────────────────────────
def get_feedback(accuracy: float, mistake_count: int) -> str:
    if accuracy >= 95 and mistake_count == 0:
        return "Perfect recitation! Mashallah 🌟"
    elif accuracy >= 90:
        return "Excellent! Almost perfect. Keep it up! ✨"
    elif accuracy >= 80:
        return "Very good! Just a few words to polish. 👍"
    elif accuracy >= 70:
        return "Good effort! Review the highlighted mistakes. 📖"
    elif accuracy >= 55:
        return "Keep practicing. Focus on the wrong words. 💪"
    else:
        return "Needs more revision. Listen to the correct recitation first. 🎧"


# ─────────────────────────────────────────────
# CLI test
# ─────────────────────────────────────────────
if __name__ == '__main__':
    ref    = "بِسْمِ اللهِ الرَّحْمٰنِ الرَّحِيْمِ"
    spoken = "بسم الله الرحمن"
    result = compare_text(spoken, ref)
    print(f"Accuracy : {result['accuracy']}%")
    print(f"Mistakes : {result['mistake_count']}")
    print(f"Feedback : {result['feedback']}")
    for m in result['mistakes']:
        print(f"  #{m['position']} spoken='{m['spoken']}' → correct='{m['correct']}'")
