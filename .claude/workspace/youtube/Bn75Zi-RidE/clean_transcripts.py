#!/usr/bin/env python3
"""
General-purpose OCR transcript cleaner for Korean OCR output from extract_onscreen_text.py.

Applies heuristic-based cleaning:
1. Noise segment detection (low Korean ratio, symbol-heavy, short fragments)
2. Dedup (time-proximity + content overlap)
3. Strip non-Korean noise from mixed segments (leading/trailing/embedded English)
4. OCR typo fixes (common EasyOCR Korean confusions)
5. Rebuild fullText
"""

import json
import re
import sys
from pathlib import Path


# ── Korean character utilities ───────────────────────────────────────────────


def is_korean(ch: str) -> bool:
    cp = ord(ch)
    return 0xAC00 <= cp <= 0xD7A3 or 0x1100 <= cp <= 0x11FF or 0x3130 <= cp <= 0x318F


def korean_chars(text: str) -> str:
    return "".join(ch for ch in text if is_korean(ch))


def korean_ratio(text: str) -> float:
    non_ws = re.sub(r"\s", "", text)
    if not non_ws:
        return 0.0
    return len(korean_chars(non_ws)) / len(non_ws)


def non_ws_len(text: str) -> int:
    return len(re.sub(r"\s", "", text))


# ── Step 1: Noise segment detection ─────────────────────────────────────────


def is_noise_segment(text: str) -> bool:
    """Detect noise segments using general heuristics."""
    stripped = text.strip()
    if not stripped:
        return True

    kr = korean_chars(stripped)
    kr_len = len(kr)
    nws = non_ws_len(stripped)

    # No Korean at all → noise
    if kr_len == 0:
        return True

    # Very few Korean chars (< 3) → likely OCR artifact
    if kr_len < 3:
        return True

    # Short text with low Korean ratio
    if nws < 10 and kr_len < 4:
        return True

    # Symbol/punctuation heavy with little Korean
    punct_count = sum(1 for ch in stripped if ch in "#*~<>{}[]()_|\\@&^%$!=+")
    if nws > 0 and punct_count / nws > 0.3 and kr_len < 5:
        return True

    return False


def is_substring_of_nearby(seg_text: str, segments: list, idx: int, time_window: float = 5.0) -> bool:
    """Check if segment's Korean content is a strict substring of a nearby longer segment."""
    seg_kr = korean_chars(seg_text)
    if not seg_kr or len(seg_kr) > 12:
        return False

    seg_start = segments[idx]["start"]
    for j, other in enumerate(segments):
        if j == idx:
            continue
        if abs(other["start"] - seg_start) > time_window:
            continue
        other_kr = korean_chars(other["text"])
        if len(other_kr) > len(seg_kr) and seg_kr in other_kr:
            return True
    return False


# ── Step 2: Deduplication ────────────────────────────────────────────────────


def _overlap_ratio(a: str, b: str) -> float:
    """Character-level overlap ratio between two Korean-only strings."""
    if not a or not b:
        return 0.0
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    # Substring check first
    if shorter in longer:
        return 1.0
    match_count = sum(1 for c in shorter if c in longer)
    return match_count / len(shorter)


def dedup_segments(segments: list, time_window: float = 5.0, overlap_threshold: float = 0.6) -> list:
    """Remove near-duplicate segments within a time window, keeping the longest/cleanest."""
    if not segments:
        return segments

    result = []
    i = 0
    while i < len(segments):
        group = [segments[i]]
        base_kr = korean_chars(segments[i]["text"])
        j = i + 1

        while j < len(segments):
            time_gap = segments[j]["start"] - group[-1]["start"]
            total_gap = segments[j]["start"] - segments[i]["start"]
            if time_gap > time_window or total_gap > time_window * 2:
                break

            cand_kr = korean_chars(segments[j]["text"])
            # Need minimum Korean content to compare
            if len(base_kr) >= 4 and len(cand_kr) >= 4:
                overlap = _overlap_ratio(base_kr, cand_kr)
                if overlap > overlap_threshold:
                    group.append(segments[j])
                    j += 1
                    continue
            break

        # Keep the best from the group: most Korean content, then highest Korean ratio
        best = max(group, key=lambda s: (len(korean_chars(s["text"])), korean_ratio(s["text"])))
        result.append(best)
        i = j if j > i + 1 else i + 1

    return result


# ── Step 3: Strip non-Korean noise from mixed segments ──────────────────────


def strip_leading_noise(text: str) -> str:
    """Strip leading non-Korean tokens before meaningful Korean content.
    Preserves short alphabetic prefixes directly attached to Korean (e.g. JR에비스, F&B사업)."""
    # Find first Korean character
    m = re.search(r"[가-힣ㄱ-ㅎㅏ-ㅣ]", text)
    if not m or m.start() == 0:
        return text

    leading = text[:m.start()]

    # Preserve short alphabetic prefixes directly attached (no space before Korean)
    # e.g. "JR에비스역", "F&B사업", "J-디자인"
    # But NOT "10 서울", "ISN 이것", "34 34 UH 우선"
    leading_trimmed = leading.rstrip()
    if (leading_trimmed
            and len(leading_trimmed) <= 4
            and not leading.endswith(" ")
            and re.search(r"[a-zA-Z]", leading_trimmed)):
        return text

    # Split into tokens and remove leading non-Korean tokens
    tokens = text.split()
    result_tokens = []
    found_kr = False
    for token in tokens:
        if found_kr:
            result_tokens.append(token)
        elif korean_chars(token):
            found_kr = True
            result_tokens.append(token)
        # Skip non-Korean leading tokens

    return " ".join(result_tokens) if result_tokens else text


def strip_trailing_noise(text: str) -> str:
    """Strip trailing non-Korean tokens (English words, random chars) after last Korean."""
    # Find last Korean character
    last_kr = -1
    for i in range(len(text) - 1, -1, -1):
        if is_korean(text[i]):
            last_kr = i
            break

    if last_kr == -1 or last_kr >= len(text) - 1:
        return text

    trailing = text[last_kr + 1:]

    # If trailing is only punctuation/whitespace, keep it
    if re.fullmatch(r'[\s.:;,?!_\-~()\[\]{}"\' ]*', trailing):
        return text

    # Strip if trailing has English words (2+ alpha chars) or number patterns (digits with dashes)
    has_english = bool(re.search(r"[a-zA-Z]{2,}", trailing))
    has_number_pattern = bool(re.search(r"\d{2,}[-~]\d", trailing))
    if has_english or has_number_pattern:
        punct_match = re.match(r'^[.:;,?!_\-~\s]*', trailing)
        keep = punct_match.group() if punct_match else ""
        return text[:last_kr + 1] + keep

    return text


def remove_embedded_english(text: str) -> str:
    """Remove long English runs (>20 chars with 3+ English words) embedded in Korean text."""
    # Match runs of primarily non-Korean text between Korean contexts
    def _maybe_remove(match):
        run = match.group(1)
        words = run.strip().split()
        english_words = [w for w in words if re.match(r'^[a-zA-Z]', w)]
        if len(english_words) >= 3 and len(run.strip()) > 20:
            return " "
        return match.group(0)

    # Pattern: Korean char, then space + non-Korean run, then space + Korean char
    result = re.sub(
        r'(?<=[가-힣])\s+([^가-힣ㄱ-ㅎㅏ-ㅣ]{20,}?)(?=\s*[가-힣ㄱ-ㅎㅏ-ㅣ])',
        _maybe_remove,
        text,
    )

    # Handle English at the start followed by Korean
    def _maybe_remove_start(match):
        run = match.group(0)
        words = run.strip().split()
        english_words = [w for w in words if re.match(r'^[a-zA-Z]', w)]
        if len(english_words) >= 3 and len(run.strip()) > 20:
            return ""
        return run

    result = re.sub(
        r'^[^가-힣ㄱ-ㅎㅏ-ㅣ]{20,}(?=\s*[가-힣ㄱ-ㅎㅏ-ㅣ])',
        _maybe_remove_start,
        result,
    )

    return re.sub(r"  +", " ", result).strip()


def clean_stray_symbols(text: str) -> str:
    """Remove stray brackets, braces, and symbol clusters that don't belong."""
    # Remove isolated stray symbols: }, {, [, ] not part of meaningful pairs
    # e.g. "이야기가} 많은" → "이야기가 많은"
    # e.g. "[매우유명한" → "매우유명한"
    # e.g. "(1928-2024)7}" → "(1928-2024)"
    result = text

    # Remove stray } or { adjacent to Korean text
    result = re.sub(r"(?<=[가-힣])\s*[}]", "", result)
    result = re.sub(r"[{]\s*(?=[가-힣])", "", result)

    # Remove stray [ at start of a word before Korean
    result = re.sub(r"\[(?=[가-힣])", "", result)

    # Remove stray ] at end of word after Korean
    result = re.sub(r"(?<=[가-힣])\]", "", result)

    # Remove orphan symbols/digits stuck after closing parens: )7} → )
    result = re.sub(r"\)[^가-힣\s]{1,3}(?=\s|$)", ")", result)

    # Remove )}(?) style garbage clusters
    result = re.sub(r"[)}\]]{1,3}\s*\(\?\)\s*", " ", result)

    return re.sub(r"  +", " ", result).strip()


def clean_segment_text(text: str) -> str:
    """Apply all text-level stripping to a segment."""
    result = text.strip()
    result = strip_leading_noise(result)
    result = strip_trailing_noise(result)
    result = remove_embedded_english(result)
    result = clean_stray_symbols(result)
    # Clean leftover artifacts
    result = re.sub(r"^\s*['\"](?=\S)", "", result)  # leading stray quote
    result = re.sub(r"  +", " ", result).strip()
    return result


# ── Step 4: OCR typo fixes (common EasyOCR Korean confusions) ────────────────


def fix_ocr_typos(text: str) -> str:
    """Fix common EasyOCR Korean character confusions using general patterns."""

    # --- Specific compound fixes first (order matters) ---
    compound_fixes = {
        "있없다": "있었다",
        "있없조": "있었조",
        "있있다": "있었다",
        "모습이있다": "모습이었다",
    }
    for old, new in compound_fixes.items():
        text = text.replace(old, new)

    # --- Particle confusions: 올→을, 틀→를, 름→를, 릎→를, 울→을 ---
    # These occur after a Korean char, before space/punctuation/end
    particle_end = r"(?=[\s.,;:?!_\-~)\]}\"\']|$)"

    text = re.sub(r"(?<=[가-힣])올" + particle_end, "을", text)
    text = re.sub(r"(?<=[가-힣])틀" + particle_end, "를", text)
    text = re.sub(r"(?<=[가-힣])름" + particle_end, "를", text)
    text = re.sub(r"(?<=[가-힣])릎" + particle_end, "를", text)
    text = re.sub(r"(?<=[가-힣])울" + particle_end, "을", text)

    # --- 긋 → 것 (after Korean or space, before space/punct/end) ---
    text = re.sub(r"(?<=[가-힣\s])긋" + particle_end, "것", text)

    # --- Past tense endings: ~없 → ~었 (common OCR confusion) ---
    # Covers 없다, 없기, 없으나, 없다고, 없다는, 없지만, 없런, 없원
    text = re.sub(r"(?<=[가-힣])없다" + particle_end, "었다", text)
    text = re.sub(r"(?<=[가-힣])없다고", "었다고", text)
    text = re.sub(r"(?<=[가-힣])없다는", "었다는", text)
    text = re.sub(r"(?<=[가-힣])없기", "었기", text)
    text = re.sub(r"(?<=[가-힣])없지만", "었지만", text)
    text = re.sub(r"(?<=[가-힣])없으나", "었으나", text)
    text = re.sub(r"(?<=[가-힣])없런", "었던", text)
    text = re.sub(r"(?<=[가-힣])없원", "었던", text)

    # --- Verb ending: 하눈 → 하는 ---
    text = re.sub(r"하눈(?=[\s.,;:?!]|$)", "하는", text)

    return text


# ── Step 5: Main pipeline ───────────────────────────────────────────────────


def clean_transcripts(data: dict) -> dict:
    result = json.loads(json.dumps(data))  # deep copy

    for video in result["videos"]:
        segments = video["segments"]
        original_count = len(segments)

        # Step 1a: Remove noise segments
        segments = [s for s in segments if not is_noise_segment(s["text"])]
        print(f"  After noise removal: {len(segments)}")

        # Step 1b: Remove short fragments that are substrings of nearby segments
        keep = []
        for i, seg in enumerate(segments):
            kr_len = len(korean_chars(seg["text"]))
            if kr_len < 10 and is_substring_of_nearby(seg["text"], segments, i):
                continue
            keep.append(seg)
        segments = keep
        print(f"  After substring removal: {len(segments)}")

        # Step 2: Dedup by time proximity + content overlap
        segments = dedup_segments(segments)
        print(f"  After dedup: {len(segments)}")

        # Step 3: Clean individual segment text (strip leading/trailing/embedded noise)
        cleaned = []
        for seg in segments:
            seg["text"] = clean_segment_text(seg["text"])
            if seg["text"] and not is_noise_segment(seg["text"]):
                cleaned.append(seg)
        segments = cleaned
        print(f"  After text cleaning: {len(segments)}")

        # Step 4: OCR typo fixes
        for seg in segments:
            seg["text"] = fix_ocr_typos(seg["text"])

        # Step 5: Rebuild fullText
        video["segments"] = segments
        video["fullText"] = " ".join(s["text"] for s in segments)

        print(f"  Video {video['videoId']}: {original_count} → {len(segments)} segments")

    return result


def main():
    script_dir = Path(__file__).parent
    raw_path = script_dir / "transcripts_raw.json"
    transcripts_path = script_dir / "transcripts.json"

    if raw_path.exists():
        input_path = raw_path
        print(f"Reading from raw backup: {raw_path.name}")
    elif transcripts_path.exists():
        input_path = transcripts_path
        print(f"Reading from: {transcripts_path.name}")
    else:
        print("Error: No transcripts file found.")
        sys.exit(1)

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    cleaned = clean_transcripts(data)

    with open(transcripts_path, "w", encoding="utf-8") as f:
        json.dump(cleaned, f, ensure_ascii=False, indent=2)
    print(f"\nWrote cleaned transcripts to: {transcripts_path.name}")

    # Verification
    for video in cleaned["videos"]:
        full = video["fullText"]
        print(f"\n── Verification ({video['videoId']}) ──")
        for noise in ["raYV BuD JXer", "ODAKYL", "#A", "WC *7WC", "eyecity"]:
            status = "GONE" if noise not in full else "STILL PRESENT"
            print(f"  '{noise}': {status}")

        print(f"\n── All {len(video['segments'])} segments ──")
        for i, s in enumerate(video["segments"]):
            print(f"  {i:3d} [{s['start']:7.1f}s] {s['text'][:100]}")


if __name__ == "__main__":
    main()
