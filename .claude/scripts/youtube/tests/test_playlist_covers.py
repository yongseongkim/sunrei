import contextlib
import copy
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import create_sunrei
import fetch_info
import playlist_covers
import youtube_data
import youtube_playlists


PLAYLIST = {"id": "PLtest", "sunreiId": "SRtest"}
METADATA = {"id": "PLtest", "thumbnailUrl": "https://i.ytimg.com/playlist-cover.jpg"}


class FakeApi:
    def __init__(self, images=None, link="https://www.youtube.com/playlist?list=PLtest", source_type="YOUTUBE"):
        self.calls = []
        self.sunrei = {"id": "SRtest", "link": link, "source": {"type": source_type}, "images": images or [], "spots": [{"id": "keep-me"}]}

    def list_playlists(self):
        return [PLAYLIST]

    def request(self, method, path, body=None):
        self.calls.append((method, path, body))
        if method == "PUT":
            self.sunrei.update(body)
        return copy.deepcopy(self.sunrei)


class PlaylistCoverTests(unittest.TestCase):
    def test_metadata_only_uses_the_playlists_cover_without_loading_playlist_items(self):
        response = {"items": [{"snippet": {"title": "Playlist", "thumbnails": {
            "default": {"url": "https://i.ytimg.com/small.jpg"},
            "maxres": {"url": METADATA["thumbnailUrl"]},
        }}}]}
        with patch.object(youtube_data, "youtube_get", return_value=response) as get:
            metadata = youtube_data.fetch_playlist_metadata("test-key", "PLtest")
        self.assertEqual(metadata["thumbnailUrl"], METADATA["thumbnailUrl"])
        self.assertEqual(get.call_count, 1)
        self.assertEqual(get.call_args.args[1], "playlists")

    def test_full_playlist_collection_keeps_the_playlist_cover_separate_from_video_covers(self):
        responses = [
            {"items": [{"snippet": {"title": "Playlist", "channelTitle": "Channel", "thumbnails": {"high": {"url": METADATA["thumbnailUrl"]}}}}]},
            {"items": [{"snippet": {"title": "Video", "resourceId": {"videoId": "abcdefghijk"}, "thumbnails": {"high": {"url": "https://i.ytimg.com/other-video.jpg"}}}}]},
        ]
        with patch.object(youtube_data, "youtube_get", side_effect=responses):
            metadata = youtube_data.fetch_playlist("test-key", "PLtest")
        self.assertEqual(metadata["thumbnailUrl"], METADATA["thumbnailUrl"])
        self.assertEqual(metadata["videos"][0]["videoId"], "abcdefghijk")

    def test_workspace_playlist_metadata_includes_its_own_cover(self):
        responses = [
            {"items": [{"snippet": {"title": "Playlist", "channelId": "UCtest", "thumbnails": {"high": {"url": METADATA["thumbnailUrl"]}}}}]},
            {"items": []},
        ]
        with patch.object(fetch_info, "get", side_effect=responses), patch.object(fetch_info, "channel_obj", return_value={"thumbnailUrl": "https://i.ytimg.com/channel.jpg"}), contextlib.redirect_stdout(io.StringIO()):
            _, info = fetch_info.fetch_playlist("test-key", "PLtest", "all")
        self.assertEqual(info["thumbnailUrl"], METADATA["thumbnailUrl"])
        self.assertNotEqual(info["thumbnailUrl"], info["channel"]["thumbnailUrl"])

    def test_missing_cover_update_sends_only_images_and_is_idempotent(self):
        api = FakeApi()
        result = playlist_covers.ensure_playlist_cover(api, PLAYLIST, METADATA, commit=True)
        self.assertEqual(result["status"], "updated")
        self.assertEqual(api.calls[-1], ("PUT", "/admin/sunreis/SRtest", {"images": [{"images": [{"url": METADATA["thumbnailUrl"]}]}]}))
        self.assertEqual(api.sunrei["spots"], [{"id": "keep-me"}])
        result = playlist_covers.ensure_playlist_cover(api, PLAYLIST, METADATA, commit=True)
        self.assertEqual(result["status"], "kept_existing")
        self.assertEqual(sum(method == "PUT" for method, _, _ in api.calls), 1)

    def test_existing_custom_cover_is_preserved(self):
        existing = [{"images": [{"url": "https://example.com/custom.jpg"}]}]
        api = FakeApi(images=existing)
        self.assertEqual(playlist_covers.ensure_playlist_cover(api, PLAYLIST, METADATA, commit=True)["status"], "kept_existing")
        self.assertEqual(api.sunrei["images"], existing)
        self.assertEqual([call[0] for call in api.calls], ["GET"])

    def test_available_thumbnail_urls_and_dimensions_are_kept_together(self):
        metadata = {**METADATA, "thumbnails": {
            "default": {"url": "https://i.ytimg.com/default.jpg", "width": 120, "height": 90},
            "medium": {"url": "https://i.ytimg.com/medium.jpg", "width": 320, "height": 180},
            "maxres": {"url": METADATA["thumbnailUrl"], "width": 1280, "height": 720},
        }}
        [group] = playlist_covers.thumbnail_images(metadata)
        self.assertEqual([image["width"] for image in group["images"]], [1280, 320, 120])
        self.assertEqual(group["images"][1], metadata["thumbnails"]["medium"])
        self.assertEqual(len(group["images"]), 3)

    def test_a_saved_matching_cover_gains_sizes_once_without_changing_the_image(self):
        metadata = {**METADATA, "thumbnails": {
            "medium": {"url": "https://i.ytimg.com/medium.jpg", "width": 320, "height": 180},
            "maxres": {"url": METADATA["thumbnailUrl"], "width": 1280, "height": 720},
        }}
        api = FakeApi(images=[{"images": [{"url": METADATA["thumbnailUrl"]}]}])
        result = playlist_covers.ensure_playlist_cover(api, PLAYLIST, metadata, commit=True)
        self.assertEqual(result["status"], "updated")
        self.assertEqual(api.sunrei["images"][0]["images"][0]["url"], METADATA["thumbnailUrl"])
        self.assertEqual(api.sunrei["images"][0]["images"][1]["width"], 320)
        self.assertEqual(playlist_covers.ensure_playlist_cover(api, PLAYLIST, metadata, commit=True)["status"], "kept_existing")
        self.assertEqual(sum(method == "PUT" for method, _, _ in api.calls), 1)
        custom = FakeApi(images=[{"images": [{"url": "https://example.com/custom.jpg"}]}])
        self.assertEqual(playlist_covers.ensure_playlist_cover(custom, PLAYLIST, metadata, commit=True)["status"], "kept_existing")

    def test_variant_metadata_with_no_width_keeps_the_url_without_inventing_dimensions(self):
        [group] = playlist_covers.thumbnail_images({"thumbnails": {"medium": {"url": "https://i.ytimg.com/custom?rs=signed"}}})
        self.assertEqual(group["images"], [{"url": "https://i.ytimg.com/custom?rs=signed"}])

    def test_unlinked_missing_and_mismatched_playlists_are_not_written(self):
        for link, source_type in [("https://www.youtube.com/playlist?list=PLother", "YOUTUBE"), ("https://www.youtube.com/@channel", "YOUTUBE"), ("https://www.youtube.com/playlist?list=PLtest", "INSTAGRAM"), ("https://youtube.com.evil.test/playlist?list=PLtest", "YOUTUBE")]:
            api = FakeApi(link=link, source_type=source_type)
            self.assertEqual(playlist_covers.ensure_playlist_cover(api, PLAYLIST, METADATA, commit=True)["status"], "link_mismatch")
            self.assertEqual([call[0] for call in api.calls], ["GET"])
        api = FakeApi()
        self.assertEqual(playlist_covers.ensure_playlist_cover(api, {"id": "PLtest"}, METADATA, commit=True)["status"], "unlinked")
        self.assertEqual(playlist_covers.ensure_playlist_cover(api, PLAYLIST, {"id": "PLtest"}, commit=True)["status"], "no_thumbnail")
        self.assertEqual(api.calls, [])
        with self.assertRaises(ValueError):
            playlist_covers.ensure_playlist_cover(api, PLAYLIST, {"id": "PLother"}, commit=True)

    def test_dry_run_cli_only_reports_the_missing_cover(self):
        api = FakeApi()
        output = io.StringIO()
        with patch.object(sys, "argv", ["playlist_covers.py", "--playlist", "PLtest"]), patch.object(playlist_covers, "load_google_api_key", return_value="test-key"), patch.object(playlist_covers, "CollectionApi", return_value=api), patch.object(playlist_covers, "fetch_playlist_metadata", return_value=METADATA), contextlib.redirect_stdout(output):
            playlist_covers.main()
        self.assertEqual(json.loads(output.getvalue())["status"], "would_update")
        self.assertNotIn("test-key", output.getvalue())
        self.assertEqual([call[0] for call in api.calls], ["GET"])

    def test_registration_fills_the_linked_sunrei_cover(self):
        class RegistrationApi(FakeApi):
            def get_playlist(self, _):
                return None

            def upsert_playlist(self, _, body):
                return body

            def sync_playlist_videos(self, *args, **kwargs):
                return {"pendingVideos": []}

        api = RegistrationApi()
        remote = {**METADATA, "title": "Playlist", "videos": []}
        with patch.object(youtube_playlists, "fetch_playlist", return_value=remote), patch.object(youtube_playlists, "fetch_video_details", return_value={}), contextlib.redirect_stdout(io.StringIO()):
            youtube_playlists.register(api, "test-key", "PLtest", "SRtest", "all", True)
        self.assertEqual(api.sunrei["images"], [{"images": [{"url": METADATA["thumbnailUrl"]}]}])

    def test_create_sunrei_uses_the_fetched_playlist_or_video_cover(self):
        for content_type in ("playlist", "video"):
            with self.subTest(content_type=content_type), tempfile.TemporaryDirectory() as temp:
                workspace = Path(temp)
                (workspace / "video_info.json").write_text(json.dumps({**METADATA, "type": content_type, "title": "Title"}))
                (workspace / "locations.json").write_text('{"videos":[]}')
                with patch.object(sys, "argv", ["create_sunrei.py", "workspace", "--commit", "--summary", "Reviewed"]), patch.object(create_sunrei, "workspace", return_value=workspace), patch.object(create_sunrei, "admin_token", return_value="test-token"), patch.object(create_sunrei, "resolve_source", return_value=("SRCtest", "reuse")), patch.object(create_sunrei, "admin_api", return_value=(201, {"id": "SRtest", "spots": []})) as request, contextlib.redirect_stdout(io.StringIO()):
                    create_sunrei.main()
                self.assertEqual(request.call_args.args[3]["images"], [{"images": [{"url": METADATA["thumbnailUrl"]}]}])

    def test_unavailable_thumbnail_does_not_create_an_empty_image_record(self):
        for thumbnail in (None, "", "  ", "not a URL", "javascript:alert(1)", "http://["):
            self.assertEqual(playlist_covers.thumbnail_images({"thumbnailUrl": thumbnail}), [])


if __name__ == "__main__":
    unittest.main()
