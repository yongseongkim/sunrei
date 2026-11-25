# Collect Sunrei renewal tracks

Captions:

```bash
uv run --with youtube-transcript-api python .claude/scripts/youtube/extract_transcript.py "{VIDEO_ID}"
```

Save the unmodified result as `captions.json`. Check that the track belongs to
this video: an uploaded track can be another video's subtitles. When the
captions contradict the title, description, and on-screen text, mark them
unusable and rely on Whisper and OCR.

Whisper:

```bash
uv run --python 3.11 --with yt-dlp --with openai-whisper \
  python .claude/scripts/youtube/whisper_transcribe.py \
  "https://www.youtube.com/watch?v={VIDEO_ID}" base
```

Save the unmodified result as `audio_transcript.json`. Whisper runs locally,
and the script deletes the downloaded audio afterwards. The script prints
yt-dlp progress before its JSON, so a caller parses the trailing JSON object,
not the whole output.

OCR:

```bash
uv run --python 3.11 --with easyocr --with opencv-python-headless --with yt-dlp \
  python .claude/scripts/youtube/extract_onscreen_text.py \
  "https://www.youtube.com/watch?v={VIDEO_ID}" --lang ko,en --interval 1.0
```

Save the unmodified result as `onscreen_text.json`. Always run OCR, even when
captions and Whisper look complete: creators often name the place only in
burned-in subtitles, and scenes with music instead of speech carry names,
addresses, and prices on screen only. Choose `--lang` by the language of the
burned-in subtitles, not the country in the video. EasyOCR cannot load Korean
and Japanese together, so run a second pass with `ja,en` when a sign or menu
matters. Use `--interval 0.5` for rapidly changing text.

This helper crops the bottom 30% of each frame. Signs elsewhere need a
targeted full-frame inspection or separate OCR pass; changing `--lang` alone
does not read the omitted area.

Keep regular transcript review text-only. For unresolved visual clues or a
mismatch with today's premises, read
[visual and historical review](../../youtube-extract-locations/references/visual-and-historical-review.md)
for local frame selection, selective image verification, and dated web evidence.

Preserve a source's structured error in its file and continue with the other
sources. Stop only when every source is empty or unavailable.
