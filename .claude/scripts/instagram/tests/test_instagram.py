import json
import sys
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from download_reels import classify, reel_urls
from extract_locations import evidence_inputs, post_input as prompt_post_input
from extraction_runs import candidate_input, evidence_items, ocr_text, run_request, status_after_run, whisper_text
from graph_api import iso_timestamp, post_input, shortcode_of
from import_workspace import geocoding_of
from instagram_accounts import set_profile_picture
from place_search import branch_mismatch, from_result

EVIDENCE = {
    "shortcode": "DdfnSrZT9zZ",
    "whisperModel": "small",
    "ocrInterval": 1.0,
    "audio": {"language": "ko", "segments": [
        {"start": 0.0, "end": 3.2, "text": "우리는 요리 잘하는 중국집 찾으면 꼭 같이 가보거든"},
        {"start": 3.2, "end": 4.8, "text": "필동전자방이라고"},
    ]},
    "onscreen": {"frames": 46, "segments": [
        {"text": "전자방이라고", "start": 4.0, "end": 4.0, "frames": 1, "confidence": 0.8},
        {"text": "IW", "start": 36.0, "end": 36.0, "frames": 1, "confidence": 0.65},
        {"text": "ESY", "start": 1.0, "end": 44.0, "frames": 30, "confidence": 0.95},
    ]},
}

GOOGLE = {
    "id": "ChIJ89ymVQCjfDURC6LpgKTVCVY",
    "displayName": {"text": "전자방 필동점"},
    "formattedAddress": "대한민국 서울특별시 중구 퇴계로44길 21 1층",
    "location": {"latitude": 37.5609614, "longitude": 126.9969766},
}


class GraphApiTest(unittest.TestCase):
    def test_shortcode_of_reel_post_and_profile_paths(self):
        self.assertEqual(shortcode_of("https://www.instagram.com/reel/DdfnSrZT9zZ/"), "DdfnSrZT9zZ")
        self.assertEqual(shortcode_of("https://www.instagram.com/choiza11/p/DdJX9W3zLp3/?img_index=1"), "DdJX9W3zLp3")
        self.assertIsNone(shortcode_of("https://www.instagram.com/choiza11/"))

    def test_iso_timestamp_adds_utc_designator(self):
        self.assertEqual(iso_timestamp("2026-09-20T03:26:19+0000"), "2026-09-20T03:26:19Z")
        self.assertEqual(iso_timestamp("2026-09-20T12:26:19+0900"), "2026-09-20T03:26:19Z")

    def test_post_input_maps_business_discovery_media(self):
        media = {"id": "18100489196380034", "permalink": "https://www.instagram.com/reel/DdfnSrZT9zZ/",
                 "timestamp": "2026-09-20T03:26:19+0000", "media_type": "VIDEO", "media_product_type": "REELS",
                 "caption": "메뉴에도 없는 볶음밥", "like_count": 10, "comments_count": 2}
        self.assertEqual(post_input(media), {
            "id": "18100489196380034", "permalink": "https://www.instagram.com/reel/DdfnSrZT9zZ/", "mediaType": "VIDEO",
            "productType": "REELS", "caption": "메뉴에도 없는 볶음밥", "postedAt": "2026-09-20T03:26:19Z",
            "likeCount": 10, "commentsCount": 2,
        })


class PlaceSearchTest(unittest.TestCase):
    def test_branch_mismatch_flags_a_missing_district(self):
        self.assertEqual(branch_mismatch("서울 종로구 서순라길", "대한민국 서울특별시 용산구 이태원로 1"), ["종로구"])

    def test_branch_mismatch_ignores_dong_station_markets_and_abroad(self):
        self.assertIsNone(branch_mismatch("서울 중구 필동", GOOGLE["formattedAddress"]))
        self.assertIsNone(branch_mismatch("서울 광진구 건대입구", "대한민국 서울특별시 광진구 아차산로 1"))
        self.assertIsNone(branch_mismatch("광장시장", "대한민국 서울특별시 종로구 창경궁로 88"))
        self.assertIsNone(branch_mismatch("도쿄 긴자", "일본 〒104-0061 Tokyo, Chuo City"))
        self.assertIsNone(branch_mismatch("", GOOGLE["formattedAddress"]))

    def test_from_result_matches_name_and_district(self):
        result = from_result({"name": "전자방 필동점", "aliases": ["필동전자방"], "area": "서울 중구 필동"}, GOOGLE)
        self.assertEqual(result["geocodeStatus"], "MATCHED")
        self.assertEqual(result["place"]["googleMapsId"], GOOGLE["id"])

    def test_from_result_flags_another_name_or_district(self):
        other = dict(GOOGLE, displayName={"text": "진더미엔"})
        self.assertEqual(from_result({"name": "필동 중식당", "area": "서울 중구 필동"}, other)["geocodeStatus"], "NAME_MISMATCH")
        wrong_branch = from_result({"name": "전자방 필동점", "area": "서울 종로구"}, GOOGLE)
        self.assertEqual(wrong_branch["geocodeStatus"], "NAME_MISMATCH")
        self.assertIn("종로구", wrong_branch["geocodeWarning"])


class ExtractionInputTest(unittest.TestCase):
    def test_evidence_inputs_keep_speech_and_drop_ocr_noise(self):
        speech, onscreen = evidence_inputs(EVIDENCE)
        self.assertEqual(speech[1], {"t": 3.2, "text": "필동전자방이라고"})
        self.assertEqual([item["text"] for item in onscreen], ["전자방이라고", "ESY"])
        self.assertEqual(evidence_inputs(None), (None, None))

    def test_prompt_post_input_maps_location_tag(self):
        item = prompt_post_input("1", "https://www.instagram.com/reel/X/", "2026-09-20T03:26:19Z", "VIDEO", "REELS", None,
                                 {"name": "필동", "lat": 37.55, "lng": 126.99}, EVIDENCE)
        self.assertEqual(item["locationTag"], {"name": "필동", "latitude": 37.55, "longitude": 126.99})
        self.assertEqual(item["caption"], "")
        self.assertEqual(len(item["speech"]), 2)


class ExtractionRunTest(unittest.TestCase):
    def test_texts_from_evidence(self):
        whisper = whisper_text(EVIDENCE)
        self.assertEqual(whisper["kind"], "WHISPER")
        self.assertEqual(whisper["params"], {"model": "small"})
        self.assertIn("필동전자방이라고", whisper["full_text"])
        ocr = ocr_text(EVIDENCE)
        self.assertEqual(ocr["segments"][0], {"start": 4.0, "end": 4.0, "text": "전자방이라고", "confidence": 0.8})
        self.assertIsNone(whisper_text({"audio": {"error": "no audio track"}}))

    def test_evidence_items_find_segment_starts(self):
        items = evidence_items([
            {"source": "speech", "quote": "필동전자방이라고"},
            {"source": "onscreen", "quote": "전자방이라고"},
            {"source": "caption", "quote": "성수 본점"},
            {"source": "speech", "quote": "없는 말"},
        ], EVIDENCE)
        self.assertEqual([item["startSeconds"] for item in items], [3.2, 4.0, 0.0, 0.0])

    def test_candidate_and_run_request(self):
        place = {"name": "전자방 필동점", "nameFound": True, "aliases": ["필동전자방"], "category": "중식당", "area": "서울 중구 필동",
                 "evidence": [{"source": "speech", "quote": "필동전자방이라고"}], "description": "볶음밥",
                 "reason": "음성과 화면", "confidence": "high", "needsVerification": False}
        geocoding = from_result(place, GOOGLE)
        candidate = candidate_input(place, geocoding, EVIDENCE)
        self.assertEqual(candidate["confidence"], "HIGH")
        self.assertEqual(candidate["geocodeStatus"], "MATCHED")
        self.assertEqual(candidate["evidence"][0]["startSeconds"], 3.2)
        item = {"postId": "1", "promotion": "NONE", "promotionEvidence": "", "places": [place], "agent": "codex"}
        request = run_request(item, {"batchId": "b1", "promptSha256": "abc"}, [candidate], ["IT1"])
        self.assertEqual(request["batchId"], "b1")
        self.assertIsNone(request["promotionEvidence"])
        self.assertEqual(json.loads(request["rawOutput"])["postId"], "1")

    def test_status_after_run(self):
        self.assertEqual(status_after_run({"places": [{"reviewStatus": "PENDING"}]}), "REVIEW_PENDING")
        self.assertEqual(status_after_run({"places": [{"reviewStatus": "APPROVED"}]}), "COMPLETED")
        self.assertEqual(status_after_run({"places": []}), "COMPLETED")


class ImportWorkspaceTest(unittest.TestCase):
    PLACE = {"name": "전자방", "address": GOOGLE["formattedAddress"], "latitude": 37.56, "longitude": 126.99,
             "googleMapsId": "gm", "googleMapsUri": "https://maps.google.com/?cid=1"}

    def test_geocoding_of_prototype_statuses(self):
        self.assertEqual(geocoding_of({"status": "ok", "area": "서울 중구 필동", "place": self.PLACE})["geocodeStatus"], "MATCHED")
        self.assertEqual(geocoding_of({"status": "ok", "area": "서울 종로구", "place": self.PLACE})["geocodeStatus"], "NAME_MISMATCH")
        self.assertEqual(geocoding_of({"status": "name_mismatch", "place": self.PLACE, "geocodeWarning": "w"})["geocodeWarning"], "w")
        self.assertEqual(geocoding_of({"status": "geocode_failed"})["geocodeStatus"], "NOT_FOUND")
        self.assertEqual(geocoding_of({"status": "unnamed", "nameFound": False}), {"geocodeStatus": "NOT_SEARCHED"})
        self.assertNotIn("googleMapsUri", geocoding_of({"status": "ok", "area": "", "place": self.PLACE})["place"])


class DownloadReelsTest(unittest.TestCase):
    def test_classify_errors(self):
        self.assertEqual(classify("[Instagram] X: This content isn't available to everyone"), "login_required")
        self.assertEqual(classify("[Instagram] Dx429abcdef: Instagram sent an empty media response"), "throttled")
        self.assertEqual(classify("[Instagram] Dx429abcdef: ffmpeg not found"), "failed")
        self.assertEqual(classify("Unable to download webpage: HTTP Error 404: Not Found"), "unavailable")

    def test_reel_urls_accepts_urls_and_codes(self):
        self.assertEqual(reel_urls(["https://www.instagram.com/reel/DdfnSrZT9zZ/", "DT6hhkuicso"]), {
            "DdfnSrZT9zZ": "https://www.instagram.com/reel/DdfnSrZT9zZ/",
            "DT6hhkuicso": "https://www.instagram.com/reel/DT6hhkuicso/",
        })


class ProfilePictureTest(unittest.TestCase):
    IMAGE = {"images": [{"url": "https://sunrei-images.s3.ap-northeast-2.amazonaws.com/images/p.jpg", "width": 320, "height": 320}]}

    class FakeApi:
        def __init__(self, image):
            self.calls, self.image = [], image

        def request(self, method, path, body=None):
            self.calls.append((method, path, body))
            return self.image if path == "/admin/images/upload-url" else {}

    def test_copies_the_picture_when_the_source_has_no_poster(self):
        api = self.FakeApi(self.IMAGE)
        self.assertTrue(set_profile_picture(api, {"id": "SRC1"}, "https://scontent.cdninstagram.com/p.jpg"))
        self.assertEqual(api.calls, [
            ("POST", "/admin/images/upload-url", {"url": "https://scontent.cdninstagram.com/p.jpg"}),
            ("PUT", "/admin/sources/SRC1", {"posterImage": self.IMAGE}),
        ])

    def test_keeps_an_existing_poster_unless_replacing(self):
        api = self.FakeApi(self.IMAGE)
        source = {"id": "SRC1", "posterImage": self.IMAGE}
        self.assertFalse(set_profile_picture(api, source, "https://scontent.cdninstagram.com/p.jpg"))
        self.assertEqual(api.calls, [])
        self.assertTrue(set_profile_picture(api, source, "https://scontent.cdninstagram.com/p.jpg", replace=True))
        self.assertFalse(set_profile_picture(self.FakeApi(self.IMAGE), {"id": "SRC1"}, None))


if __name__ == "__main__":
    unittest.main()
