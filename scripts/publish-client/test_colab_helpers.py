"""Tests for colab_helpers.py, using sample share pages in testdata/.

When Google changes the Google Photos share page, save a fresh copy of a
public album page into testdata/ (strip personal data), make these tests
fail on it, then fix photos_media_urls()/photos_items().

    python3 -m unittest discover -s scripts/publish-client -p 'test_*.py'
"""

from __future__ import annotations

import io
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import colab_helpers as ch  # noqa: E402

DATA = HERE / "testdata"
ALBUM = (DATA / "photos_album.html").read_text(encoding="utf-8")
SINGLE = (DATA / "photos_single.html").read_text(encoding="utf-8")
CHANGED = (DATA / "photos_changed.html").read_text(encoding="utf-8")
V1 = "https://lh3.googleusercontent.com/pw/AP1GczVIDEO1aaaaaaaaaaaaaaaaaaaaaaaaaaaa"
P2 = "https://lh3.googleusercontent.com/pw/AP1GczPHOTO2bbbbbbbbbbbbbbbbbbbbbbbbbbbb"
V3 = "https://lh3.googleusercontent.com/pw/AP1GczVIDEO3cccccccccccccccccccccccccccc"
COVER = "https://lh3.googleusercontent.com/pw/AP1GczOg_COVERcoverCOVERcoverCOVERcover123"
HAS_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def make_media(directory: Path) -> dict:
    """A real 2 s MP4 and a JPEG still (what a blocked download looks like)."""
    mp4, jpg = directory / "v.mp4", directory / "still.jpg"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=10:duration=2",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", str(mp4)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x90",
                    "-frames:v", "1", str(jpg)], check=True)
    return {"mp4": mp4.read_bytes(), "jpg": jpg.read_bytes()}


class FakeResponse:
    def __init__(self, status=200, url="", text="", content=b"", content_type="text/html"):
        self.status_code, self.url, self.text, self._content = status, url, text, content
        self.headers = {"content-type": content_type}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def iter_content(self, chunk_size=1):
        stream = io.BytesIO(self._content)
        while chunk := stream.read(chunk_size):
            yield chunk


class FakeSession:
    """Answers like Google: the short link redirects to the share page, and
    base=dv answers video/* for videos, image/* for photos."""

    def __init__(self, page, final_url="https://photos.google.com/share/AF1QipALBUM?key=abc",
                 videos=(V1, V3), media=b"", media_type="video/mp4", failures=0, status=200):
        self.page, self.final_url, self.videos = page, final_url, set(videos)
        self.media, self.media_type, self.failures, self.status = media, media_type, failures, status
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append(url)
        if self.failures:
            self.failures -= 1
            return FakeResponse(status=503, url=url)
        if url.startswith("https://photos.app.goo.gl/"):
            return FakeResponse(status=self.status, url=self.final_url, text=self.page)
        base = url[:-3]
        if url.endswith("=dv") and base in self.videos:
            return FakeResponse(url=url, content=self.media, content_type=self.media_type)
        return FakeResponse(url=url, content=b"\xff\xd8", content_type="image/jpeg")


class PhotosPageTest(unittest.TestCase):
    def test_extracts_each_media_base_once_in_page_order(self):
        urls = ch.photos_media_urls(ALBUM)
        # Cover (og:image), then the three items; size suffixes, escaped
        # slashes (\\/), \\u003d and duplicates folded; avatars (/a/) left out.
        self.assertEqual(urls, [COVER, V1, P2, V3])
        self.assertTrue(all("/a/" not in url for url in urls))

    def test_album_title_and_generic_titles(self):
        self.assertEqual(ch.photos_album_title(ALBUM), "Bevis & Pinky – Album")
        self.assertEqual(ch.photos_album_title(SINGLE), "")

    def test_link_kinds(self):
        self.assertEqual(ch.link_kind("https://photos.app.goo.gl/AbC123"), "photos")
        self.assertEqual(ch.link_kind("https://photos.google.com/share/AF1Q?key=x"), "photos")
        self.assertEqual(ch.link_kind("https://drive.google.com/file/d/1abcDEF123/view"), "drive")
        self.assertEqual(ch.link_kind("https://example.com/v.mp4"), "unknown")


@unittest.skipUnless(HAS_FFMPEG, "needs ffmpeg")
class PhotosItemsTest(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.media = make_media(self.dir)
        self.sleep = mock.patch.object(ch.time, "sleep").start()
        self.addCleanup(mock.patch.stopall)
        self.addCleanup(shutil.rmtree, self.dir, True)

    def test_album_yields_only_the_videos_and_downloads_originals(self):
        session = FakeSession(ALBUM, media=self.media["mp4"])
        title, items = ch.photos_items("https://photos.app.goo.gl/AbC123", session)
        self.assertEqual(title, "Bevis & Pinky – Album")
        self.assertEqual([item.label for item in items], ["1/2", "2/2"])
        self.assertEqual(len({item.key for item in items}), 2)
        target = items[0].download(self.dir / "out.mp4")
        self.assertEqual(target.read_bytes(), self.media["mp4"])
        self.assertIn(V1 + "=dv", session.calls)

    def test_item_keys_are_stable_across_fetches(self):
        first = ch.photos_items("https://photos.app.goo.gl/a", FakeSession(ALBUM))[1]
        second = ch.photos_items("https://photos.app.goo.gl/b", FakeSession(ALBUM))[1]
        self.assertEqual([i.key for i in first], [i.key for i in second])

    def test_single_video_link(self):
        single = "https://lh3.googleusercontent.com/pw/AP1GczSINGLEdddddddddddddddddddddddddddd"
        session = FakeSession(SINGLE, final_url="https://photos.google.com/share/AF1Q/photo/AF1Qx?key=k",
                              videos=(single,), media=self.media["mp4"])
        _, items = ch.photos_items("https://photos.app.goo.gl/one", session)
        self.assertEqual(len(items), 1)

    def test_a_still_image_served_as_video_is_rejected_by_ffprobe(self):
        session = FakeSession(ALBUM, media=self.media["jpg"])
        _, items = ch.photos_items("https://photos.app.goo.gl/AbC123", session)
        with self.assertRaisesRegex(ch.SourceError, "ảnh xem trước"):
            items[0].download(self.dir / "out.mp4")

    def test_retries_temporary_failures(self):
        session = FakeSession(ALBUM, media=self.media["mp4"], failures=2)
        _, items = ch.photos_items("https://photos.app.goo.gl/AbC123", session)
        self.assertEqual(len(items), 2)
        self.assertEqual(self.sleep.call_count, 2)

    def test_gives_up_with_a_clear_message_after_retries(self):
        session = FakeSession(ALBUM, failures=10)
        with self.assertRaisesRegex(ch.SourceError, "thất bại sau 3 lần thử.*Google Drive"):
            ch.photos_items("https://photos.app.goo.gl/AbC123", session)


class PhotosErrorsTest(unittest.TestCase):
    def setUp(self):
        mock.patch.object(ch.time, "sleep").start()
        self.addCleanup(mock.patch.stopall)

    def test_login_wall(self):
        session = FakeSession("<html>Sign in</html>", final_url="https://accounts.google.com/ServiceLogin?continue=x")
        with self.assertRaisesRegex(ch.SourceError, "đăng nhập"):
            ch.photos_items("https://photos.app.goo.gl/private", session)

    def test_changed_page_layout(self):
        with self.assertRaisesRegex(ch.SourceError, "đổi giao diện"):
            ch.photos_items("https://photos.app.goo.gl/new", FakeSession(CHANGED))

    def test_album_with_only_photos(self):
        with self.assertRaisesRegex(ch.SourceError, "không có video nào"):
            ch.photos_items("https://photos.app.goo.gl/pics", FakeSession(ALBUM, videos=()))

    def test_link_that_is_not_a_share_page(self):
        session = FakeSession(ALBUM, final_url="https://www.google.com/")
        with self.assertRaisesRegex(ch.SourceError, "không dẫn tới trang chia sẻ"):
            ch.photos_items("https://photos.app.goo.gl/x", session)

    def test_deleted_link(self):
        with self.assertRaisesRegex(ch.SourceError, "404"):
            ch.photos_items("https://photos.app.goo.gl/gone", FakeSession(ALBUM, status=404))


class InputTest(unittest.TestCase):
    def test_lines(self):
        jobs = ch.parse_lines("""
            # comment
            https://photos.app.goo.gl/A | Trần Đức | Bevis, Couple; Gym | couple | New video | 30
            https://photos.app.goo.gl/B
        """)
        self.assertEqual(len(jobs), 2)
        self.assertEqual(jobs[0].tags, ["Bevis", "Couple", "Gym"])
        self.assertEqual((jobs[0].category, jobs[0].x_caption, jobs[0].clip_start), ("couple", "New video", 30.0))
        self.assertEqual((jobs[1].title, jobs[1].tags, jobs[1].clip_start), ("", [], None))

    def test_csv(self):
        path = Path(tempfile.mkdtemp()) / "jobs.csv"
        path.write_text("link,title,tags,category,x_caption,clip_start\nhttps://photos.app.goo.gl/A,T,a;b,,,\n,,,,,\n",
                        encoding="utf-8")
        jobs = ch.parse_csv(str(path))
        self.assertEqual([(j.link, j.tags) for j in jobs], [("https://photos.app.goo.gl/A", ["a", "b"])])

    def test_ascii_caption(self):
        self.assertEqual(ch.ascii_text("Bevis Trần Đức Vương"), "Bevis Tran Duc Vuong")


class SecretsTest(unittest.TestCase):
    def test_redact_hides_registered_secrets_and_key_params(self):
        ch.register_secret("SECRET-HOST-KEY-123")
        message = ch.redact("POST https://x/upload?key=abcd&x=1 failed with SECRET-HOST-KEY-123")
        self.assertNotIn("SECRET-HOST-KEY-123", message)
        self.assertNotIn("abcd", message)

    def test_curl_never_gets_the_key_on_its_command_line(self):
        key = "DOODKEY-0123456789"
        uploader = ch.HostUploader("dood", key)
        seen = {}

        def fake_run(args, step):
            seen["args"] = args
            seen["config"] = Path(args[-1]).read_text()
            seen["mode"] = os.stat(args[-1]).st_mode & 0o777
            return 0, '{"result":[{"filecode":"abc123"}]}', ""

        with mock.patch.object(uploader, "_get", return_value={"result": "https://up.example/upload/01"}), \
                mock.patch.object(ch, "_run_curl", side_effect=fake_run):
            code = uploader.upload(Path(__file__), "Title")
        self.assertEqual(code, "abc123")
        self.assertNotIn(key, " ".join(seen["args"]))
        self.assertIn(key, seen["config"])
        self.assertEqual(seen["mode"], 0o600)
        self.assertFalse(Path(seen["args"][-1]).exists())  # config removed

    def test_upload_errors_are_redacted(self):
        key = "VOEKEY-ABCDEFGHIJ"
        uploader = ch.HostUploader("voe", key)
        failed = (22, "", f"403 for https://up/?key={key}")
        with mock.patch.object(uploader, "_get", return_value={"result": "https://up.example/u"}), \
                mock.patch.object(ch, "_run_curl", return_value=failed):
            with self.assertRaises(RuntimeError) as caught:
                uploader.upload(Path(__file__), "T")
        self.assertNotIn(key, str(caught.exception))


class LedgerTest(unittest.TestCase):
    def test_persists_and_finds_done_items(self):
        path = str(Path(tempfile.mkdtemp()) / "sub" / "log.csv")
        ledger = ch.Ledger(path)
        ledger.add(link="L", item_key="photos:1", sha256="h1", status="done")
        ledger.add(link="L", item_key="photos:2", sha256="h2", status="error", error="x")
        again = ch.Ledger(path)
        self.assertEqual(again.done_keys(), {"photos:1"})
        self.assertEqual(again.done_hashes(), {"h1"})


class LogoSession:
    """Answers the logo URL with the given (status, body) pairs in turn."""

    def __init__(self, *answers):
        self.answers, self.calls = list(answers), 0

    def get(self, url, **kwargs):
        self.calls += 1
        status, body = self.answers.pop(0)
        response = FakeResponse(status=status, url=url)
        response.content = body
        return response


LOGO_SVG = (HERE / "assets" / "logo-mark.svg").read_bytes()
HTML_404 = b"<!DOCTYPE html><html><head><title>404</title></head><body>Not found</body></html>"


@unittest.skipUnless(shutil.which("rsvg-convert"), "needs rsvg-convert")
class LogoTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def load(self, *answers):
        session = LogoSession(*answers)
        return ch.load_logo(ch.LOGO_URL, self.tmp, session=session, base_delay=0), session

    def test_logo_in_the_repo_renders(self):
        path, _ = self.load((200, LOGO_SVG))
        self.assertEqual(path.name, "gv-logo.svg")
        self.assertGreater((self.tmp / "gv-logo-check.png").stat().st_size, 0)

    def test_default_url_points_at_the_repo_file(self):
        self.assertTrue(ch.LOGO_URL.endswith("/main/scripts/publish-client/assets/logo-mark.svg"))
        import build_notebook
        self.assertIn(f'LOGO_URL = "{ch.LOGO_URL}"', build_notebook.CONFIG)
        # Same mark as the site's logo.
        self.assertEqual(LOGO_SVG, (HERE.parent.parent / "public" / "brand" / "logo-mark.svg").read_bytes())

    def test_html_404_page_is_refused_before_any_video(self):
        with self.assertRaises(ch.LogoError) as caught:
            self.load((404, HTML_404))
        self.assertIn("HTTP 404", str(caught.exception))
        # Some servers answer 200 with an HTML page: also refused, clearly.
        with self.assertRaises(ch.LogoError) as caught:
            self.load((200, HTML_404))
        self.assertIn("trang HTML", str(caught.exception))

    def test_xml_that_is_not_svg_is_refused(self):
        with self.assertRaises(ch.LogoError):
            self.load((200, b"<?xml version='1.0'?><html xmlns='http://www.w3.org/1999/xhtml'/>"))

    def test_svg_that_rsvg_cannot_render_is_refused(self):
        with self.assertRaises(ch.LogoError) as caught:
            self.load((200, b"<svg xmlns='http://www.w3.org/2000/svg' width='0' height='0'/>"))
        self.assertIn("không render được", str(caught.exception))

    def test_png_logo_works(self):
        from PIL import Image
        buffer = io.BytesIO()
        Image.new("RGBA", (300, 300), (255, 0, 0, 255)).save(buffer, "PNG")
        path, _ = self.load((200, buffer.getvalue()))
        self.assertEqual(path.suffix, ".png")
        with self.assertRaises(ch.LogoError):
            self.load((200, ch.PNG_MAGIC + b"broken"))

    def test_server_errors_are_retried(self):
        path, session = self.load((503, b""), (200, LOGO_SVG))
        self.assertEqual(session.calls, 2)
        with self.assertRaises(ch.LogoError) as caught:
            self.load((503, b""), (503, b""), (503, b""))
        self.assertIn("3 lần", str(caught.exception))

    def test_local_file_path(self):
        path = ch.load_logo(str(HERE / "assets" / "logo-mark.svg"), self.tmp)
        self.assertEqual(path.name, "gv-logo.svg")
        with self.assertRaises(ch.LogoError):
            ch.load_logo(str(self.tmp / "missing.svg"), self.tmp)


class InputExampleTest(unittest.TestCase):
    def test_example_line_in_the_notebook_posts_nothing(self):
        import build_notebook
        cell = build_notebook.INPUT
        links = cell[cell.index('LINKS = """') + 11:cell.index('"""', cell.index('LINKS = """') + 11)]
        self.assertIn("photos.app.goo.gl/XXXXXXXX", links)
        self.assertEqual(ch.parse_lines(links), [])
        self.assertIn('X_CAPTION_TEMPLATE = "New video: {title} 🔥"', build_notebook.CONFIG)


class FakeClock:
    def __init__(self):
        self.now = 100.0

    def __call__(self):
        return self.now


class ProgressTest(unittest.TestCase):
    def test_bytes_step_shows_percent_mb_speed_and_time_left_on_one_line(self):
        out, clock = io.StringIO(), FakeClock()
        with ch.Step("Tải từ Google Photos", out=out, clock=clock) as step:
            step.total = 100 * 1_048_576
            for _ in range(50):  # 50 MB in 10 s
                clock.now += 0.2
                step.update(1_048_576)
            line = step.line()
        self.assertEqual(line, "Tải từ Google Photos ·  50% · 50.0/100.0 MB · 5.0 MB/s · còn 0:10")
        text = out.getvalue()
        self.assertEqual(text.count("\n"), 1)  # progress rewrites one line, then one summary line
        self.assertGreater(text.count("\r"), 5)
        self.assertLess(text.count("\r"), 30)  # throttled to every 0.5 s
        self.assertTrue(text.endswith("\n"))
        self.assertTrue(text.rstrip().endswith("\r  ✓ Tải từ Google Photos · 10.0 s · 50.0 MB · 5.0 MB/s"), text[-80:])

    def test_seconds_step_shows_media_time_and_speed(self):
        out, clock = io.StringIO(), FakeClock()
        with ch.Step("Watermark", unit="s", total=200, out=out, clock=clock) as step:
            clock.now += 25
            step.set(50)
            self.assertEqual(step.line(), "Watermark ·  25% · 0:50/3:20 · 2.0x · còn 1:15")

    def test_failed_step_is_marked_and_the_error_propagates(self):
        out = io.StringIO()
        with self.assertRaises(ValueError):
            with ch.Step("Upload lên dood", out=out):
                raise ValueError("boom")
        self.assertIn("✗ Upload lên dood", out.getvalue())

    def test_shorter_lines_clear_the_previous_one(self):
        out, clock = io.StringIO(), FakeClock()
        with ch.Step("X", out=out, clock=clock) as step:
            step.total = 10 * 1_048_576
            clock.now += 1
            step.set(1_048_576)
        last = out.getvalue().rsplit("\r", 1)[1]
        self.assertTrue(last.startswith("  ✓ X"))
        self.assertGreaterEqual(len(last.rstrip("\n")), len("  X ·  10% · 1.0/10.0 MB · 1.0 MB/s · còn 0:09"))

    def test_batch_line(self):
        out = io.StringIO()
        ch.batch_line(2, 3, "Tiêu đề", out=out)
        self.assertEqual(out.getvalue(), "▶ video 2/3 · Tiêu đề\n")

    def test_photos_download_reports_content_length(self):
        media = b"x" * (3 * 1024 * 1024 + 5)

        class Session(FakeSession):
            def get(self, url, **kwargs):
                response = FakeResponse(url=url, content=media, content_type="video/mp4")
                response.headers["content-length"] = str(len(media))
                return response

        steps = []
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(ch, "verify_video", return_value={}):
            download = ch._download_photos_video(V1, Session(ALBUM))
            with ch.Step("Tải", out=io.StringIO()) as step:
                download(Path(tmp) / "v.mp4", step=step)
                steps.append((step.total, step.done))
        self.assertEqual(steps, [(len(media), len(media))])


class CurlMeterTest(unittest.TestCase):
    def test_meter_lines(self):
        self.assertEqual(ch.parse_curl_meter(" 45  100M    0     0   45 45.2M      0  5120k  0:00:20  0:00:09  0:00:11 5200k"),
                         (45.2 * 1_048_576, 5120 * 1024))
        self.assertEqual(ch.parse_curl_meter("100  2048  100    35  100  2013     12    700  0:00:02  0:00:02 --:--:--   712"),
                         (2013, 700))
        for header in ("  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current",
                       "                                 Dload  Upload   Total   Spent    Left  Speed",
                       "curl: (22) The requested URL returned error: 403", ""):
            self.assertIsNone(ch.parse_curl_meter(header))

    def test_real_curl_upload_reports_progress_and_keeps_the_key_off_argv(self):
        import http.server
        import threading

        received = {}

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                body = self.rfile.read(int(self.headers["Content-Length"]))
                received["query"], received["bytes"] = self.path, len(body)
                payload = b'{"result":[{"filecode":"code42"}]}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *args):
                pass

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.shutdown)
        key = "VOEKEY-REAL-CURL-123"
        uploader = ch.HostUploader("voe", key)
        real, argv = ch._run_curl, []

        def spy(args, step):
            argv.extend(args)
            return real(args, step)

        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / "v.mp4"
            video.write_bytes(os.urandom(2 * 1024 * 1024))
            out = io.StringIO()
            env = {"NO_PROXY": "127.0.0.1,localhost", "no_proxy": "127.0.0.1,localhost"}
            with mock.patch.dict(os.environ, env), \
                    mock.patch.object(uploader, "_get", return_value={"result": f"http://127.0.0.1:{server.server_port}/up"}), \
                    mock.patch.object(ch, "_run_curl", side_effect=spy):
                with ch.Step("Upload lên voe", out=out) as step:
                    code = uploader.upload(video, "T", step=step)
        self.assertEqual(code, "code42")
        self.assertEqual(received["query"], f"/up?key={key}")
        self.assertGreater(received["bytes"], 2 * 1024 * 1024)
        self.assertEqual(step.total, 2 * 1024 * 1024)
        self.assertGreaterEqual(step.done, 2 * 1024 * 1024)  # multipart adds a few headers
        self.assertNotIn(key, " ".join(argv))
        self.assertNotIn(key, out.getvalue())
        self.assertIn("✓ Upload lên voe", out.getvalue())


@unittest.skipUnless(HAS_FFMPEG, "needs ffmpeg")
class FfmpegProgressTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.source = self.tmp / "source.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=25:duration=6",
                        "-f", "lavfi", "-i", "sine=duration=6", "-shortest", "-pix_fmt", "yuv420p", str(self.source)],
                       check=True)

    def test_watermark_moves_to_100_percent(self):
        seen = []
        out = io.StringIO()
        with ch.Step("Watermark", out=out, interval=0) as step:
            original = step.set
            step.set = lambda value: (seen.append(value), original(value))[1]
            ch.watermark(self.source, self.tmp / "up.mp4", HERE / "assets" / "logo-mark.svg", 640, 6.0, step)
        self.assertEqual(step.unit, "s")
        self.assertEqual(step.total, 6.0)
        self.assertEqual(seen[-1], 6.0)
        self.assertTrue(all(0 <= value <= 6.0 for value in seen))
        self.assertIn("%", out.getvalue())
        self.assertTrue((self.tmp / "up.mp4").stat().st_size > 0)

    def test_x_clip_progress_uses_clip_length(self):
        with ch.Step("Cắt clip X", out=io.StringIO()) as step:
            clip = ch.cut_x_clip(self.source, self.tmp / "clip.mp4", 6.0, start=2, seconds=3,
                                 label="gayvideo.fun", step=step)
        self.assertEqual(step.total, 3.0)
        self.assertEqual(step.done, 3.0)
        self.assertAlmostEqual(ch.probe(clip)["duration"], 3.0, delta=0.2)
        with ch.Step("Cắt clip X", out=io.StringIO()) as step:
            ch.cut_x_clip(self.source, self.tmp / "clip2.mp4", 6.0, start=4, seconds=120, step=step)
        self.assertEqual(step.total, 2.0)

    def test_ffmpeg_failure_raises(self):
        with self.assertRaises(RuntimeError):
            ch.run_ffmpeg(["ffmpeg", "-y", "-i", str(self.tmp / "missing.mp4"), str(self.tmp / "o.mp4")], 1.0)


class ClipUploadProgressTest(unittest.TestCase):
    def test_reader_reports_cumulative_bytes(self):
        import gayvideo_publish as gp
        seen = []
        reader = gp._ProgressReader(io.BytesIO(b"a" * 20_000), seen.append)
        while reader.read(8192):
            pass
        self.assertEqual(seen, [8192, 16384, 20000, 20000])


class ClipLabelTest(unittest.TestCase):
    def test_label_is_escaped_for_both_ffmpeg_levels(self):
        import gayvideo_publish as gp
        self.assertEqual(gp._filter_value("a:b,c'd[e];f\\g"), r"a\\:b\,c\\\'d\[e\]\;f\\\\g")
        self.assertIn("text=gayvideo.fun:", gp.label_filter(" gayvideo.fun "))

    @unittest.skipUnless(HAS_FFMPEG, "needs ffmpeg")
    def test_clip_with_awkward_label_still_encodes(self):
        import gayvideo_publish as gp
        with tempfile.TemporaryDirectory() as tmp:
            source = os.path.join(tmp, "source.mp4")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                            "testsrc=size=640x360:rate=10:duration=2", "-pix_fmt", "yuv420p", source], check=True)
            clip = gp.cut_clip(source, os.path.join(tmp, "clip.mp4"), seconds=1,
                               label="50% off: a,b \\ it's [x]; Trần Đức")
            self.assertGreater(os.path.getsize(clip), 0)
            plain = gp.cut_clip(source, os.path.join(tmp, "plain.mp4"), seconds=1, label="")
            self.assertGreater(os.path.getsize(plain), 0)


class NotebookTest(unittest.TestCase):
    def test_notebook_is_built_from_the_current_sources(self):
        result = subprocess.run([sys.executable, str(HERE / "build_notebook.py"), "--check"],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
