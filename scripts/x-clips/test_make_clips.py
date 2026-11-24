"""Tests for make_clips.py (the GitHub Actions X clip maker).

    python3 -m unittest discover -s scripts/x-clips -p 'test_*.py'
"""

from __future__ import annotations

import io
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import make_clips as mc  # noqa: E402

HAS_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None
FILE_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345"
FOLDER_ID = "1ZyXwVuTsRqPoNmLkJiHgFeDcBa98765"


def write_migration(root: Path) -> None:
    (root / "videos.csv").write_text(
        "post_id,title,drive_links,tags\n"
        f'p1,One,"https://drive.google.com/file/d/{FILE_ID}/view?usp=sharing; https://drive.google.com/drive/folders/{FOLDER_ID}",a\n'
        "p2,Two,,b\n",
        encoding="utf-8",
    )
    (root / "migration-log.csv").write_text(
        "post_id,earnvids_file_code,dood_file_code,voe_file_code\n"
        "p1,ev111,dd111,vo111\n"
        "p2,,dd222,\n",
        encoding="utf-8",
    )


def post(**overrides):
    value = {
        "postId": "post1", "videoId": "v1", "slug": "one", "title": "One", "mode": "clip",
        "start": 30, "seconds": 120, "durationSeconds": 600, "attempts": 0,
        "mirrors": [{"host": "dood", "fileCode": "dd111", "primary": True},
                    {"host": "voe", "fileCode": "vo111", "primary": False}],
    }
    value.update(overrides)
    return value


class CleanTest(unittest.TestCase):
    def test_no_links_tokens_or_ids(self):
        text = (f"failed https://drive.usercontent.google.com/download?id={FILE_ID}&confirm=t "
                "token ya29.a0AfB_byC123456789 key gv_abcdefghijklmnop id " + FILE_ID)
        cleaned = mc.clean(text)
        for secret in ("https://", FILE_ID, "ya29.a0", "gv_abcdef"):
            self.assertNotIn(secret, cleaned)
        self.assertIn("[link]", cleaned)

    def test_mask_only_in_actions(self):
        out = io.StringIO()
        with redirect_stdout(out), mock.patch.dict(os.environ, {"GITHUB_ACTIONS": "true"}):
            mc.mask("https://secret.example/x")
            mc.mask("https://secret.example/x")  # once is enough
        self.assertEqual(out.getvalue(), "::add-mask::https://secret.example/x\n")
        out = io.StringIO()
        with redirect_stdout(out), mock.patch.dict(os.environ, {"GITHUB_ACTIONS": ""}):
            mc.mask("https://other.example/y")
        self.assertEqual(out.getvalue(), "")


class MigrationTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root, True)
        write_migration(self.root)
        self.index = mc.MigrationIndex.load(self.root)

    def test_matches_by_host_file_code_primary_first(self):
        self.assertEqual(self.index.find(post()["mirrors"])["post_id"], "p1")
        self.assertEqual(self.index.find([{"host": "voe", "fileCode": "vo111"}])["post_id"], "p1")
        self.assertIsNone(self.index.find([{"host": "dood", "fileCode": "nope"}]))
        links = self.index.drive_links(self.index.find(post()["mirrors"]))
        self.assertEqual(len(links), 2)
        self.assertTrue(links[0].endswith("/view?usp=sharing"))

    def test_missing_data_is_empty(self):
        empty = mc.MigrationIndex.load(self.root / "missing")
        self.assertIsNone(empty.find(post()["mirrors"]))

    def test_sources_hosts_first_then_drive(self):
        with mock.patch.dict(os.environ, {"HOST_EARNVIDS_API_KEY": "k"}):
            sources, skipped = mc.plan_sources(post(), self.index, mc.Drive(""))
        # Dood (primary) and VOE have no direct link; EarnVids comes from the log.
        self.assertEqual([s.name for s in sources], ["earnvids", "drive", "drive"])
        self.assertEqual([s.watermark for s in sources], [False, True, True])
        self.assertIn("DoodStream: API không có link tải trực tiếp", skipped)
        self.assertIn("VOE: API không có link tải trực tiếp", skipped)

    def test_no_earnvids_key_or_drive_link(self):
        with mock.patch.dict(os.environ, {"HOST_EARNVIDS_API_KEY": ""}):
            sources, skipped = mc.plan_sources(
                post(mirrors=[{"host": "dood", "fileCode": "dd222", "primary": True}]), self.index, mc.Drive(""))
        self.assertEqual(sources, [])
        self.assertIn("Google Drive: videos.csv không có link cho video này", skipped)
        sources, skipped = mc.plan_sources(
            post(mirrors=[{"host": "dood", "fileCode": "zzz", "primary": True}]), self.index, mc.Drive(""))
        self.assertIn("Google Drive: không tìm thấy video trong migration-log.csv", skipped)


class DriveTest(unittest.TestCase):
    def test_public_file_link(self):
        url, extra = mc.Drive("").resolve(f"https://drive.google.com/file/d/{FILE_ID}/view")
        self.assertEqual(url, f"https://drive.usercontent.google.com/download?id={FILE_ID}&export=download&confirm=t")
        self.assertEqual(extra, [])

    def test_folder_needs_service_account(self):
        with self.assertRaises(RuntimeError) as caught:
            mc.Drive("").resolve(f"https://drive.google.com/drive/folders/{FOLDER_ID}")
        self.assertIn("GDRIVE_SERVICE_ACCOUNT_JSON", str(caught.exception))

    def test_service_account_uses_the_api_with_a_header(self):
        drive = mc.Drive('{"type": "service_account"}')
        with mock.patch.object(drive, "token", return_value="ya29.TOKEN"), \
                mock.patch.object(drive, "folder_video", return_value=FILE_ID):
            url, extra = drive.resolve(f"https://drive.google.com/drive/folders/{FOLDER_ID}")
        self.assertTrue(url.startswith(f"https://www.googleapis.com/drive/v3/files/{FILE_ID}?alt=media"))
        self.assertEqual(extra, ["-headers", "Authorization: Bearer ya29.TOKEN\r\n"])


class FfmpegArgsTest(unittest.TestCase):
    def test_seek_before_input_and_options(self):
        args = mc.ffmpeg_args("https://h/v.mp4", ["-headers", "X: y\r\n"], 30, 120, Path("o.mp4"), False)
        self.assertLess(args.index("-headers"), args.index("-i"))
        self.assertLess(args.index("-ss"), args.index("-i"))
        self.assertEqual(args[args.index("-ss") + 1], "30")
        self.assertEqual(args[args.index("-t") + 1], "120")
        self.assertIn("-reconnect", args)
        self.assertEqual(args.count("-i"), 1)
        marked = mc.ffmpeg_args("https://h/v.mp4", [], 0, 140, Path("o.mp4"), True)
        self.assertNotIn("-ss", marked)
        self.assertEqual(marked.count("-i"), 2)
        self.assertIn("overlay", marked[marked.index("-filter_complex") + 1])


@unittest.skipUnless(HAS_FFMPEG, "needs ffmpeg")
class CutTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.video = self.tmp / "v.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=12",
                        "-f", "lavfi", "-i", "sine=duration=12", "-shortest", "-pix_fmt", "yuv420p", str(self.video)],
                       check=True)

    def source(self, watermark):
        return mc.Source("drive" if watermark else "earnvids", "Test", watermark, lambda: (str(self.video), []))

    def test_clip_and_full_modes(self):
        out = self.tmp / "clip.mp4"
        self.assertAlmostEqual(mc.cut(self.source(True), post(start=4, seconds=5), out), 5, delta=0.3)
        out.unlink()
        # "full" ignores the start and keeps up to `seconds` (cut to the limit).
        self.assertAlmostEqual(mc.cut(self.source(False), post(mode="full", start=8, seconds=10), out), 10, delta=0.3)

    def test_ffmpeg_errors_carry_no_link(self):
        bad = mc.Source("earnvids", "EarnVids", False,
                        lambda: (str(self.tmp / f"https:__x.example_{FILE_ID}.mp4"), []))
        with self.assertRaises(RuntimeError) as caught:
            mc.cut(bad, post(), self.tmp / "o.mp4")
        self.assertNotIn(FILE_ID, str(caught.exception))


class FakeClient:
    def __init__(self, attach_error=None):
        self.calls = []
        self.attach_error = attach_error

    def upload_clip(self, path):
        self.calls.append(("upload", Path(path).exists()))
        return {"clipId": "c" * 22}

    def _request(self, method, path, body=None):
        self.calls.append((method, path, body))
        if path.endswith("/clip") and self.attach_error:
            raise self.attach_error
        return {}


class ProcessTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root, True)
        write_migration(self.root)
        self.index = mc.MigrationIndex.load(self.root)

    def fake_cut(self, fail_on=()):
        def cutter(source, p, output):
            if source.name in fail_on:
                raise RuntimeError(f"HTTP 403 for https://secret.example/{FILE_ID}")
            output.write_bytes(b"x" * 1024)
            return float(p["seconds"])
        return cutter

    def test_first_working_source_is_used_and_files_removed(self):
        client = FakeClient()
        with mock.patch.dict(os.environ, {"HOST_EARNVIDS_API_KEY": "k"}):
            summary = mc.process(client, [post()], self.index, mc.Drive(""), self.root,
                                 cutter=self.fake_cut(fail_on={"earnvids"}), log=lambda *_: None)
        self.assertEqual(summary, {"made": 1, "failed": 0})
        attach = [call for call in client.calls if call[0] == "POST"][0]
        self.assertEqual(attach[1], "/api/v1/social/post1/clip")
        self.assertEqual(attach[2]["source"], "drive")
        self.assertEqual(list(self.root.glob("*.mp4")), [])

    def test_failure_is_reported_without_links(self):
        client = FakeClient()
        logs = []
        with mock.patch.dict(os.environ, {"HOST_EARNVIDS_API_KEY": "k"}):
            summary = mc.process(client, [post()], self.index, mc.Drive(""), self.root,
                                 cutter=self.fake_cut(fail_on={"earnvids", "drive"}), log=logs.append)
        self.assertEqual(summary, {"made": 0, "failed": 1})
        method, path, body = client.calls[-1]
        self.assertEqual(path, "/api/v1/social/post1/failure")
        self.assertFalse(body["final"])
        for text in [body["reason"], *logs]:
            self.assertNotIn("https://", text)
            self.assertNotIn(FILE_ID, text)

    def test_no_source_is_final(self):
        client = FakeClient()
        with mock.patch.dict(os.environ, {"HOST_EARNVIDS_API_KEY": ""}):
            mc.process(client, [post(mirrors=[{"host": "dood", "fileCode": "zzz", "primary": True}])],
                       self.index, mc.Drive(""), self.root, cutter=self.fake_cut(), log=lambda *_: None)
        self.assertTrue(client.calls[-1][2]["final"])

    def test_cancelled_post_is_skipped(self):
        error = RuntimeError("409 not_preparing")
        error.status = 409
        client = FakeClient(attach_error=error)
        with mock.patch.dict(os.environ, {"HOST_EARNVIDS_API_KEY": "k"}):
            summary = mc.process(client, [post()], self.index, mc.Drive(""), self.root,
                                 cutter=self.fake_cut(), log=lambda *_: None)
        self.assertEqual(summary, {"made": 0, "failed": 0})
        self.assertFalse(any(call[1].endswith("/failure") for call in client.calls if call[0] == "POST"))


if __name__ == "__main__":
    unittest.main()
