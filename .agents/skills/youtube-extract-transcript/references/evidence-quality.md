# Evidence Quality: Symptoms and Actions

Each case below has already hidden a place or pinned one wrongly. The response
always has the same shape: keep the raw file, mark what is wrong, and lean on
the other sources.

## Wrong caption track

Symptom: the captions describe a different meal or city than the title,
description, and on-screen text. One 비밀이야 video about a Busan restaurant
carried Korean and English captions for a Beijing dinner.

Action: mark the caption track unusable for this video and use Whisper and
OCR. Do not splice the captions into the transcript.

## Place named only on screen

Symptom: the speech track never says where the creator is, or a scene plays
music over burned-in subtitles.

Action: OCR is the only source for the name, address, and prices. A context
refill that skipped OCR missed four restaurants in one playlist and left a
ramen shop pinned to the wrong place.

## Foreign proper noun garbled in speech

Symptom: captions and Whisper render a Japanese, Italian, or French name as
Korean syllables, and the two recognizers disagree.

Action: read the name in the language of the video's region and look for the
on-screen spelling. In one Osaka video the speech track garbled a ramen shop's
name, and only the Korean subtitle `우골왕` led to 人情麺家 牛骨王. Treat the
rebuilt name as a hypothesis until the description, OCR, or a Maps link
confirms it.

## OCR language mismatch

Symptom: OCR returns mostly noise, or only Japanese signs, for a Korean
channel's Japan video.

Action: choose `--lang` by the language of the burned-in subtitles. A Korean
channel's Tokyo video needs `ko,en`; `ja,en` reads only the signs. Run a second
pass with `ja,en` when a sign or menu matters.

## Captions and Whisper agree exactly

Symptom: the two speech tracks have identical segments.

Action: the second track is a duplicate, not independent confirmation. The
timeline marks it `duplicate`; do not count it twice when weighing a name.

## OCR text leaking into dialogue

Symptom: a transcript correction inserts `WOW`, a price, a sign, or a label
into a spoken sentence.

Action: reject the correction unless the evidence shows the words were spoken.
OCR stays a separate visual annotation.

## Uncertain spelling with no confirming source

Symptom: a proposed correction rests on plausibility alone.

Action: leave the passage flagged in `transcript_review.json`. Do not resolve
it by guessing.

## Timing

OCR at a one-second interval takes roughly a quarter of the video's length on
an Apple Silicon Mac; a 30-minute video took about seven minutes. The 60-90
second caption pace fetched 269 playlist videos in a row without a block.
These are single observations, not guarantees.
