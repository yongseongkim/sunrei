"""Build admin API payloads from extraction output (stdlib only).

Shared by the collector (renew_accounts.py) and the workspace import, so both
store texts, extraction runs, and candidates the same way.
"""

import json

CONFIDENCE = {"high": "HIGH", "medium": "MEDIUM", "low": "LOW"}


def api_location_tag(location):
    """Convert a tag read from the post page ({pk, name, lat, lng}) to the API's InstagramLocationTagDTO, or None."""
    if not location:
        return None
    return {"pk": location.get("pk"), "name": location["name"], "latitude": location.get("lat"), "longitude": location.get("lng")}


def whisper_text(evidence):
    """Return create_text kwargs for a reel's Whisper transcript, or None when it has no speech."""
    audio = (evidence or {}).get("audio") or {}
    segments = [{"start": s["start"], "end": s.get("end"), "text": s["text"]} for s in audio.get("segments", [])]
    if not segments:
        return None
    return {
        "kind": "WHISPER",
        "language": audio.get("language") or "ko",
        "segments": segments,
        "full_text": " ".join(s["text"] for s in segments),
        "params": {"model": evidence.get("whisperModel")},
    }


def ocr_text(evidence):
    """Return create_text kwargs for a reel's on-screen text, or None when OCR found nothing."""
    onscreen = (evidence or {}).get("onscreen") or {}
    segments = [{"start": s["start"], "end": s.get("end"), "text": s["text"], "confidence": s.get("confidence")}
                for s in onscreen.get("segments", [])]
    if not segments:
        return None
    return {
        "kind": "OCR",
        "segments": segments,
        "params": {"interval": evidence.get("ocrInterval"), "frames": onscreen.get("frames"), "fullFrame": True},
    }


def evidence_items(quotes, evidence):
    """Map the agent's {source, quote} evidence to the API's {source, quote, startSeconds}.

    Speech and OCR quotes get the start of the first segment that contains them; caption and
    location-tag quotes, and quotes that match no segment, get 0.
    """
    segments = {
        "speech": ((evidence or {}).get("audio") or {}).get("segments", []),
        "onscreen": ((evidence or {}).get("onscreen") or {}).get("segments", []),
    }
    items = []
    for quote in quotes or []:
        text = quote["quote"]
        start = next((s["start"] for s in segments.get(quote["source"], []) if text in s["text"] or s["text"] in text), 0.0)
        items.append({"source": quote["source"], "quote": text, "startSeconds": float(start)})
    return items


def candidate_input(place, geocoding, evidence=None):
    """Build an InstagramExtractedPlaceInput from an extracted place and place_search.geocode() fields."""
    body = {
        "name": place["name"],
        "nameFound": place.get("nameFound", True),
        "aliases": place.get("aliases") or [],
        "category": place.get("category") or None,
        "area": place.get("area") or None,
        "description": place.get("description") or None,
        "evidence": evidence_items(place.get("evidence"), evidence),
        "confidence": CONFIDENCE.get(place.get("confidence")),
        "needsVerification": place.get("needsVerification"),
        "reason": place.get("reason") or None,
        "geocodeStatus": geocoding.get("geocodeStatus"),
        "place": geocoding.get("place"),
        "geocodeWarning": geocoding.get("geocodeWarning"),
    }
    return {key: value for key, value in body.items() if value is not None}


def run_request(item, batch, candidates, input_text_ids):
    """Build a CreateInstagramExtractionRunRequest for one post's extraction item."""
    return {
        "batchId": batch.get("batchId"),
        "agent": item.get("agent") or batch.get("agent") or "unknown",
        "promptSha256": batch.get("promptSha256"),
        "inputTextIds": input_text_ids,
        "status": "SUCCEEDED",
        "promotion": item.get("promotion"),
        "promotionEvidence": item.get("promotionEvidence") or None,
        "rawOutput": json.dumps(item, ensure_ascii=False),
        "startedAt": batch.get("startedAt"),
        "finishedAt": batch.get("finishedAt"),
        "places": candidates,
    }


def status_after_run(run):
    """REVIEW_PENDING when the stored run left a candidate to review, otherwise COMPLETED."""
    return "REVIEW_PENDING" if any(place["reviewStatus"] == "PENDING" for place in run.get("places", [])) else "COMPLETED"
