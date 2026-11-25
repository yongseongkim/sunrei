import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from evidence_timeline import build_timeline
from video_analysis_plugin import MARKETPLACE, PLUGIN_ENV, PLUGIN_ID, skill_directory


class InstalledPluginTests(unittest.TestCase):
    def setUp(self):
        skill_directory.cache_clear()
        self.addCleanup(skill_directory.cache_clear)

    def test_disabled_plugin_cannot_be_used_from_the_cache(self):
        entry = {"pluginId": PLUGIN_ID, "installed": True, "enabled": False, "version": "1"}
        with patch.dict(os.environ, {PLUGIN_ENV: ""}), patch("video_analysis_plugin.subprocess.run") as cli:
            cli.return_value.stdout = json.dumps({"installed": [entry]})
            with self.assertRaisesRegex(RuntimeError, "disabled"):
                skill_directory()

    def test_uses_registered_version_and_can_resolve_other_host_without_codex(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve() / "plugins/cache" / MARKETPLACE / "video-analysis/1"
            skill = root / "skills/video-analysis"
            (skill / "scripts").mkdir(parents=True)
            (skill / "SKILL.md").touch()
            (skill / "scripts/video_evidence.py").touch()
            (root / "plugin.json").write_text(json.dumps({"name": "video-analysis"}))
            entry = {"pluginId": PLUGIN_ID, "installed": True, "enabled": True, "version": "1"}
            with patch.dict(os.environ, {PLUGIN_ENV: "", "CODEX_HOME": directory}), patch("video_analysis_plugin.subprocess.run") as cli:
                cli.return_value.stdout = json.dumps({"installed": [entry]})
                self.assertEqual(skill_directory(), skill)
            skill_directory.cache_clear()
            with patch.dict(os.environ, {PLUGIN_ENV: str(root)}), patch("video_analysis_plugin.subprocess.run") as cli:
                self.assertEqual(skill_directory(), skill)
                cli.assert_not_called()


class GeneralVideoAnalysisTests(unittest.TestCase):
    def test_vtt_word_timed_asr_and_frame_ocr_preserve_sources_and_unknown_time(self):
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            (run / "captions.vtt").write_text("WEBVTT\n\n00:00.000 --> 00:01.000\nStart\n")
            (run / "asr.json").write_text(json.dumps({"segments": [
                {"start": 0, "end": 1, "text": "Start", "words": []},
                {"text": "undated"},
            ]}))
            (run / "ocr.jsonl").write_text('{"time":0.5,"lines":[{"text":"−1.5%","confidence":0.98}]}\n')
            result = build_timeline(run, "demo")
            self.assertEqual([(e["source"], e["startSeconds"], e["text"]) for e in result["events"]],
                             [("transcript", 0, "Start"), ("ocr", 0.5, "−1.5%")])
            self.assertEqual(result["sources"]["whisper"]["duplicateOf"], "transcript")
            self.assertEqual(result["sources"]["whisper"]["untimedSegmentCount"], 1)
            (run / "ocr.jsonl").write_text('broken\n')
            partial = build_timeline(run, "demo")
            self.assertEqual(partial["sources"]["ocr"]["status"], "error")
            self.assertEqual(len(partial["events"]), 1)

    @unittest.skipUnless(shutil.which("ffmpeg"), "frame inspection requires ffmpeg")
    def test_selected_frames_use_playback_timestamps(self):
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            media = run / "example.mkv"
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=s=32x32:r=10:d=1",
                            "-c:v", "ffv1", str(media)], check=True)
            result = subprocess.run(
                [sys.executable, str(skill_directory() / "scripts/inspect_frames.py"), str(media),
                 "--at", "0", "0.31", "0.32", "1", "--question", "What changes?",
                 "--out", str(run / "visual")], check=True, capture_output=True, text=True,
            )
            manifest = Path(result.stdout.strip())
            frames = json.loads(manifest.read_text())["frames"]
            self.assertEqual([f.get("timeSeconds") for f in frames], [0, 0.4, 0.4, None])
            self.assertEqual(frames[1]["image"], frames[2]["image"])
            self.assertTrue((manifest.parent / frames[1]["image"]).is_file())
            self.assertEqual(frames[-1]["status"], "outside-video-frames")
