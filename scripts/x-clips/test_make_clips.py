"""Tests for make_clips.py (the GitHub Actions X clip maker).

    python3 -m unittest discover -s scripts/x-clips -p 'test_*.py'
"""

from __future__ import annotations

import io
import json
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


class FakeResponse:
    def __init__(self, status=200, payload=None, content=b"", headers=None):
        self.status_code, self._payload, self.content = status, payload, content
        self.headers = headers or {}
        self.ok = status < 400
        self.text = json.dumps(payload) if payload is not None else ""

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


class FakeSession:
    def __init__(self, answers):
        self.answers, self.calls = list(answers), []

    def get(self, url, params=None, headers=None, **kwargs):
        self.calls.append({"url": url, "params": params or {}, "headers": headers or {}})
        answer = self.answers.pop(0)
        return answer(url, params or {}, headers or {}) if callable(answer) else answer


def drive_error(status, reason):
    return FakeResponse(status, {"error": {"code": status, "errors": [{"reason": reason}]}})


class EarnVidsTest(unittest.TestCase):
    def test_parse_direct_link(self):
        self.assertEqual(mc.parse_direct_link({"status": 200, "result": {"hls_direct": "https://h/x/master.m3u8",
                                                                          "player_img": "https://h/i.jpg"}}),
                         ("https://h/x/master.m3u8", "hls"))
        versions = {"status": 200, "result": {"versions": [{"name": "n", "url": "https://h/n.mp4"},
                                                           {"name": "o", "url": "https://h/o.mp4"}]}}
        self.assertEqual(mc.parse_direct_link(versions), ("https://h/o.mp4", "file"))
        with self.assertRaises(mc.SourceError) as caught:
            mc.parse_direct_link({"status": 403, "msg": "Premium account required https://earnvids.com/premium"})
        self.assertIn("status 403: Premium account required", str(caught.exception))
        self.assertNotIn("https://", str(caught.exception))
        with self.assertRaises(mc.SourceError) as caught:
            mc.parse_direct_link({"status": 200, "result": {"file_length": 10, "player_img": "https://h/i.jpg"}})
        self.assertIn("result: file_length, player_img", str(caught.exception))

    def test_open_sends_the_runner_ip_and_tries_without_quality(self):
        session = FakeSession([FakeResponse(200, {"status": 400, "msg": "Quality not found"}),
                               FakeResponse(200, {"status": 200, "result": {"hls_direct": "https://h/m.m3u8"}})])
        with mock.patch.object(mc, "public_ip", return_value="203.0.113.7"), \
                mock.patch.dict(os.environ, {"HOST_EARNVIDS_API_KEY": "k"}):
            opened = mc.earnvids_open("ev111", session)
        self.assertEqual((opened.url, opened.kind), ("https://h/m.m3u8", "hls"))
        self.assertIsNone(opened.download)  # HLS is read in place
        self.assertEqual(session.calls[0]["params"], {"key": "k", "file_code": "ev111", "q": "o", "hls": "0",
                                                      "ip": "203.0.113.7"})
        self.assertEqual(session.calls[1]["params"], {"key": "k", "file_code": "ev111", "ip": "203.0.113.7"})


class DriveTest(unittest.TestCase):
    def test_public_file_link(self):
        opened = mc.Drive("").open(f"https://drive.google.com/file/d/{FILE_ID}/view?resourcekey=0-AbC")
        self.assertEqual(opened.url, f"https://drive.usercontent.google.com/download?id={FILE_ID}"
                                     "&export=download&confirm=t&resourcekey=0-AbC")
        self.assertIsNotNone(opened.download)

    def test_folder_needs_service_account(self):
        with self.assertRaises(mc.SourceError) as caught:
            mc.Drive("").open(f"https://drive.google.com/drive/folders/{FOLDER_ID}")
        self.assertIn("GDRIVE_SERVICE_ACCOUNT_JSON", str(caught.exception))

    def drive(self, answers):
        drive = mc.Drive('{"type": "service_account"}', session=FakeSession(answers))
        drive.token = lambda: "ya29.TOKEN"
        return drive

    def test_api_with_resource_key_and_first_byte_check(self):
        meta = FakeResponse(200, {"id": FILE_ID, "resourceKey": "0-KEY", "capabilities": {"canDownload": True}})
        drive = self.drive([meta, FakeResponse(206, content=b"x")])
        opened = drive.open(f"https://drive.google.com/file/d/{FILE_ID}/view")
        self.assertTrue(opened.url.startswith(f"https://www.googleapis.com/drive/v3/files/{FILE_ID}?alt=media"))
        self.assertEqual(opened.headers, {"Authorization": "Bearer ya29.TOKEN",
                                          "X-Goog-Drive-Resource-Keys": f"{FILE_ID}/0-KEY"})
        self.assertEqual(drive.session.calls[1]["headers"]["Range"], "bytes=0-0")

    def test_api_refusal_gives_googles_reason_and_falls_back_to_the_public_link(self):
        drive = self.drive([FakeResponse(200, {"id": FILE_ID}), drive_error(403, "downloadQuotaExceeded")])
        opened = drive.open(f"https://drive.google.com/file/d/{FILE_ID}/view")
        self.assertEqual(opened.kind, "download-only")
        self.assertIn("HTTP 403 (downloadQuotaExceeded)", opened.api_error)
        self.assertTrue(opened.url.startswith("https://drive.usercontent.google.com/"))

    def test_folder_with_service_account(self):
        listing = FakeResponse(200, {"files": [{"id": "small", "mimeType": "video/mp4", "size": "10"},
                                               {"id": FILE_ID, "mimeType": "video/mp4", "size": "999"},
                                               {"id": "pic", "mimeType": "image/jpeg", "size": "5000"}]})
        drive = self.drive([listing, FakeResponse(200, {"id": FILE_ID}), FakeResponse(206, content=b"x")])
        opened = drive.open(f"https://drive.google.com/drive/folders/{FOLDER_ID}")
        self.assertIn(f"/files/{FILE_ID}?alt=media", opened.url)

    def test_no_permission_at_all(self):
        drive = self.drive([drive_error(404, "notFound")])
        with self.assertRaises(mc.SourceError) as caught:
            drive.open(f"https://drive.google.com/drive/folders/{FOLDER_ID}")
        self.assertIn("HTTP 404 (notFound)", str(caught.exception))


class DownloadTest(unittest.TestCase):
    def test_refuses_files_bigger_than_the_free_disk(self):
        class Streamed(FakeResponse):
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def iter_content(self, chunk_size):
                yield b"abc"

        with tempfile.TemporaryDirectory() as tmp:
            big = Streamed(200, headers={"content-length": str(50 * 1024**3)})
            with self.assertRaises(mc.SourceError):
                mc.download_to("https://h/x", {}, Path(tmp) / "f", 60, FakeSession([big]),
                               free_bytes=lambda path: 10 * 1024**3)
            small = Streamed(200, headers={"content-length": "3"})
            path = mc.download_to("https://h/x", {}, Path(tmp) / "f", 60, FakeSession([small]),
                                  free_bytes=lambda path: 10 * 1024**3)
            self.assertEqual(path.read_bytes(), b"abc")


class SlugTest(unittest.TestCase):
    def test_find_rows_by_title_slug(self):
        root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root, True)
        (root / "videos.csv").write_text("post_id,title,drive_links\np9,Đức & Tùng Dương (41),\n", encoding="utf-8")
        (root / "migration-log.csv").write_text("post_id,dood_file_code\np9,dd9\n", encoding="utf-8")
        index = mc.MigrationIndex.load(root)
        self.assertEqual(mc.slugify("Đức & Tùng Dương (41)"), "duc-tung-duong-41")
        self.assertEqual([row["post_id"] for row in mc.find_rows_by_slug(index, "duc-tung-duong-41-2")], ["p9"])


class FfmpegArgsTest(unittest.TestCase):
    def test_seek_before_input_and_options(self):
        args = mc.ffmpeg_args("https://h/v.mp4", {"X": "y"}, 30, 120, Path("o.mp4"), False)
        self.assertLess(args.index("-headers"), args.index("-i"))
        self.assertEqual(args[args.index("-headers") + 1], "X: y\r\n")
        self.assertLess(args.index("-ss"), args.index("-i"))
        self.assertEqual(args[args.index("-ss") + 1], "30")
        self.assertEqual(args[args.index("-t") + 1], "120")
        self.assertIn("-reconnect", args)
        self.assertEqual(args.count("-i"), 1)
        local = mc.ffmpeg_args("/tmp/v.mp4", {"X": "y"}, 0, 140, Path("o.mp4"), True)
        self.assertNotIn("-ss", local)
        self.assertNotIn("-headers", local)
        self.assertEqual(local.count("-i"), 2)
        self.assertIn("overlay", local[local.index("-filter_complex") + 1])

    def test_expected_length(self):
        self.assertEqual(mc.expected_seconds(post(start=30, seconds=120, durationSeconds=1731)), 120)
        self.assertEqual(mc.expected_seconds(post(start=0, seconds=120, durationSeconds=91)), 91)
        self.assertIsNone(mc.expected_seconds(post(durationSeconds=None)))
        self.assertEqual(mc.expected_seconds(post(durationSeconds=None, start=0), source_seconds=60), 60)


@unittest.skipUnless(HAS_FFMPEG, "needs ffmpeg")
class CutTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.video = self.tmp / "v.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=12",
                        "-f", "lavfi", "-i", "sine=duration=12", "-shortest", "-pix_fmt", "yuv420p", str(self.video)],
                       check=True)

    def source(self, watermark, kind="local", download=None):
        return mc.Source("drive" if watermark else "earnvids", "Test", watermark,
                         lambda: mc.Opened(str(self.video), {}, kind, download))

    def test_clip_and_full_modes(self):
        out = self.tmp / "clip.mp4"
        seconds, method = mc.cut(self.source(True), post(start=4, seconds=5, durationSeconds=12), out, log=lambda *_: None)
        self.assertAlmostEqual(seconds, 5, delta=0.3)
        self.assertEqual(method, "direct")
        out.unlink()
        # "full" ignores the start and keeps up to `seconds` (cut to the limit).
        seconds, _ = mc.cut(self.source(False), post(mode="full", start=8, seconds=10, durationSeconds=12), out,
                            log=lambda *_: None)
        self.assertAlmostEqual(seconds, 10, delta=0.3)

    def test_a_cut_off_clip_is_refused_and_the_whole_file_is_used(self):
        # The source claims 120 s but holds 12 s: like a read that stopped early.
        downloads = []

        def download(target, timeout):
            downloads.append(timeout)
            shutil.copy(self.video, target)
            return target

        out = self.tmp / "clip.mp4"
        with self.assertRaises(mc.SourceError) as caught:
            mc.cut(self.source(False, kind="file", download=download),
                   post(start=0, seconds=120, durationSeconds=1731), out, log=lambda *_: None)
        self.assertIn("clip bị ngắn 12/120", str(caught.exception))
        self.assertEqual(len(downloads), 1)  # the whole file was tried too

    def test_a_slow_direct_read_falls_back_to_the_download(self):
        calls = []

        def slow_then_ok(command, **kwargs):
            calls.append(command)
            if len(calls) == 1:
                raise subprocess.TimeoutExpired(command, kwargs["timeout"])
            return subprocess.run(command, **kwargs)

        def download(target, timeout):
            shutil.copy(self.video, target)
            return target

        with mock.patch.object(mc, "DIRECT_TIMEOUT", 5):
            seconds, method = mc.cut(self.source(False, kind="file", download=download),
                                     post(start=0, seconds=4, durationSeconds=12), self.tmp / "clip.mp4",
                                     run=slow_then_ok, log=lambda *_: None)
        self.assertEqual(method, "download")
        self.assertAlmostEqual(seconds, 4, delta=0.3)
        self.assertEqual(len(calls), 2)
        self.assertFalse((self.tmp / "clip.source").exists())  # the download is removed

    def test_ffmpeg_errors_carry_no_link(self):
        bad = mc.Source("earnvids", "EarnVids", False,
                        lambda: mc.Opened(str(self.tmp / f"https:__x.example_{FILE_ID}.mp4"), {}, "local"))
        with self.assertRaises(mc.SourceError) as caught:
            mc.cut(bad, post(), self.tmp / "o.mp4", log=lambda *_: None)
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
        def cutter(source, p, output, deadline=None, log=None):
            if source.name in fail_on:
                raise RuntimeError(f"HTTP 403 for https://secret.example/{FILE_ID}")
            output.write_bytes(b"x" * 1024)
            return float(p["seconds"]), "direct"
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
