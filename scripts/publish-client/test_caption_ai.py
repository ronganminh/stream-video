"""Tests for caption_ai.py (everything except running the models, which needs a GPU).

    python3 -m unittest discover -s scripts/publish-client -p 'test_*.py'
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import caption_ai as ai  # noqa: E402

HAS_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None
STARTER = (HERE / "assets" / "caption_examples.txt").read_text(encoding="utf-8")


class XWeightTest(unittest.TestCase):
    def test_same_weights_as_the_server(self):
        # The cases from lib/social/xText.test.ts.
        self.assertEqual(ai.x_weight("Trần Đức – “Hi”"), 17)
        self.assertEqual(ai.x_weight("…"), 2)
        self.assertEqual(ai.x_weight("日本"), 4)
        self.assertEqual(ai.x_weight("🔥"), 2)

    def test_budget_leaves_room_for_the_link(self):
        self.assertEqual(ai.CAPTION_BUDGET, 280 - 23 - 2)

    def test_fit_caption_trims_at_a_word_with_an_ellipsis(self):
        long = "Some mornings are better than others " * 12
        fitted = ai.fit_caption(long)
        self.assertLessEqual(ai.x_weight(fitted), ai.CAPTION_BUDGET)
        self.assertTrue(fitted.endswith("…"))
        self.assertTrue(long.startswith(fitted[:-1]))
        self.assertNotEqual(fitted[-2], " ")
        self.assertEqual(ai.fit_caption("  Short   and sweet  "), "Short and sweet")
        # Double-weight characters (emoji, Vietnamese) are counted as X does.
        self.assertLessEqual(ai.x_weight(ai.fit_caption("🔥" * 200)), ai.CAPTION_BUDGET)


class BannedTest(unittest.TestCase):
    def test_explicit_words_are_found(self):
        for text, term in [("He is nude on the beach", "nude"), ("XXX night", "xxx"), ("F.U.C.K yes", "fuck"),
                           ("c0ck", "cock"), ("Cocks out", "cock"), ("THE BOYS ARE BACK", "boy"),
                           ("trai đẹp thủ dâm", "thủ dâm"), ("Watch the porn", "porn")]:
            self.assertIn(term, ai.banned_terms(text), text)

    def test_innocent_words_pass(self):
        for text in ["Late night in Sussex with a cocktail", "Sexy vibes only 🔥", "Boyfriend goals",
                     "Analysis of a perfect morning", "Sucker for sunsets? Same.", "Essex boyband energy"]:
            self.assertEqual(ai.banned_terms(text), [], text)

    def test_extra_words(self):
        self.assertEqual(ai.banned_terms("Shower thoughts", extra=["shower"]), ["shower"])
        self.assertEqual(ai.banned_terms("Shower thoughts", extra=["", " "]), [])

    def test_starter_examples_are_clean(self):
        examples, warnings = ai.load_examples(str(HERE / "assets" / "caption_examples.txt"))
        self.assertGreaterEqual(len(examples), 10)
        self.assertEqual(warnings, [])
        for line in examples:
            self.assertLessEqual(ai.x_weight(line), ai.CAPTION_BUDGET)


class CaptionHelpersTest(unittest.TestCase):
    def test_default_caption(self):
        self.assertEqual(ai.default_caption("New video: {title} 🔥", "Trần Đức – Gym"), "New video: Tran Duc – Gym 🔥")
        # A title with a banned word, or a broken template, gives the generic caption.
        self.assertEqual(ai.default_caption("New video: {title}", "Nude beach"), ai.GENERIC_CAPTION)
        self.assertEqual(ai.default_caption("New video: {name}", "Gym"), ai.GENERIC_CAPTION)
        self.assertEqual(ai.default_caption("", "Gym"), ai.GENERIC_CAPTION)

    def test_clean_tags(self):
        self.assertEqual(ai.clean_tags(["#Gym", "gym", " Beach ", "porn", "x" * 40, "Muscle"]),
                         ["Gym", "Beach", "Muscle"])
        self.assertEqual(len(ai.clean_tags([f"t{i}" for i in range(20)])), 8)

    def test_examples_file_is_created_from_the_starter(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "gayvideo" / "caption_examples.txt"
            examples, warnings = ai.load_examples(str(path), STARTER)
            self.assertTrue(path.exists())
            self.assertGreaterEqual(len(examples), 10)
            self.assertIn("Đã tạo file mẫu", warnings[0])
            path.write_text("# comment\nMy own style 🔥\nTotally nude\n\n", encoding="utf-8")
            examples, warnings = ai.load_examples(str(path), STARTER)
            self.assertEqual(examples, ["My own style 🔥"])
            self.assertIn("từ cấm", warnings[0])


class PromptTest(unittest.TestCase):
    def test_prompt_has_the_inputs_and_the_rules(self):
        system, user = ai.build_prompts("Frame 1: two men on a beach", "Bevis – Summer", ["Couple"],
                                        "trai đẹp, biển", ["Example one 🔥"])
        self.assertIn("teaser", system)
        self.assertIn(f"at most {ai.CAPTION_BUDGET} characters", system)
        self.assertIn("JSON", system)
        for part in ("Bevis – Summer", "Couple", "trai đẹp, biển", "two men on a beach", "- Example one 🔥"):
            self.assertIn(part, user)
        _, retry = ai.build_prompts("", "T", [], "", [], feedback="có từ cấm: nude.")
        self.assertIn("rejected: có từ cấm: nude.", retry)
        self.assertNotIn("What the frames show", retry)

    def test_parse_writer_output(self):
        reply = '<think>hmm</think>\n```json\n{"caption": "Some chemistry 🔥", "tags": ["Couple", "Beach"]}\n```'
        self.assertEqual(ai.parse_writer_output(reply), ("Some chemistry 🔥", ["Couple", "Beach"]))
        self.assertEqual(ai.parse_writer_output('Sure! {"caption": "Hi", "tags": "a, b"}'), ("Hi", ["a", "b"]))
        for bad in ("no json here", '{"caption": "", "tags": []}', "{broken"):
            with self.assertRaises(ValueError):
                ai.parse_writer_output(bad)


class WriteCaptionTest(unittest.TestCase):
    def run_writer(self, replies, **kwargs):
        calls = []

        def generate(system, user):
            calls.append(user)
            reply = replies.pop(0)
            if isinstance(reply, Exception):
                raise reply
            return reply

        args = dict(description="private notes", title="T", tags=["Gym"], keywords="", examples=["Ex"])
        args.update(kwargs)
        return ai.write_caption(generate, **args), calls

    def test_explicit_reply_is_retried_with_feedback(self):
        suggestion, calls = self.run_writer([
            '{"caption": "Hot nude guys", "tags": ["Gym"]}',
            '{"caption": "Gym crush, finally on camera 😏", "tags": ["Gym", "porn", "Muscle"]}',
        ])
        self.assertEqual(suggestion.caption, "Gym crush, finally on camera 😏")
        self.assertEqual(suggestion.tags, ["Gym", "Muscle"])
        self.assertEqual(suggestion.source, "AI")
        self.assertIn("có từ cấm: nude", calls[1])

    def test_links_and_bad_json_are_retried(self):
        suggestion, calls = self.run_writer([
            "not json",
            '{"caption": "Watch at gayvideo.fun", "tags": []}',
            '{"caption": "Worth the wait 🔥", "tags": []}',
        ])
        self.assertEqual(suggestion.caption, "Worth the wait 🔥")
        self.assertEqual(len(calls), 3)

    def test_gives_up_after_three_bad_replies(self):
        with self.assertRaises(RuntimeError) as caught:
            self.run_writer(['{"caption": "xxx", "tags": []}'] * 3)
        self.assertIn("3 lần", str(caught.exception))

    def test_refusal_stops_at_once(self):
        with self.assertRaises(RuntimeError) as caught:
            self.run_writer([ai.WriterRefused("refusal"), '{"caption": "ok", "tags": []}'])
        self.assertIn("từ chối", str(caught.exception))

    def test_long_caption_is_trimmed_on_the_last_try(self):
        long = "Some mornings are better than others " * 12
        suggestion, calls = self.run_writer(['{"caption": "%s", "tags": []}' % long] * 3)
        self.assertLessEqual(ai.x_weight(suggestion.caption), ai.CAPTION_BUDGET)
        self.assertEqual(len(calls), 3)


class ReviewTest(unittest.TestCase):
    def test_decisions(self):
        ok = ai.review_decision(True, "  Worth the wait 🔥 ", "Gym, #Beach, gym")
        self.assertEqual((ok.post_x, ok.caption, ok.tags, ok.problems), (True, "Worth the wait 🔥", ["Gym", "Beach"], []))
        unchecked = ai.review_decision(False, "Hot nude guys", "Gym")
        self.assertFalse(unchecked.post_x)
        self.assertEqual(unchecked.problems, [])  # not posting, so nothing to warn about
        banned = ai.review_decision(True, "Hot nude guys", "")
        self.assertFalse(banned.post_x)
        self.assertIn("có từ cấm: nude", banned.problems)
        link = ai.review_decision(True, "See https://gayvideo.fun/watch/x", "")
        self.assertFalse(link.post_x)
        empty = ai.review_decision(True, "   ", "")
        self.assertEqual((empty.post_x, empty.problems), (False, ["caption trống"]))
        extra = ai.review_decision(True, "Shower thoughts", "", extra_banned=["shower"])
        self.assertFalse(extra.post_x)
        long = ai.review_decision(True, "word " * 100, "")
        self.assertTrue(long.post_x)
        self.assertLessEqual(ai.x_weight(long.caption), ai.CAPTION_BUDGET)
        self.assertIn("sẽ bị cắt bớt", ai.weight_label("word " * 100))


class FramesTest(unittest.TestCase):
    def test_frame_times_are_spread_evenly(self):
        self.assertEqual(ai.frame_times(100, 4), [12.5, 37.5, 62.5, 87.5])
        self.assertEqual(len(ai.frame_times(100, 9)), 5)
        self.assertEqual(len(ai.frame_times(100, 1)), 1)
        self.assertEqual(ai.frame_times(0, 4), [0.0])

    @unittest.skipUnless(HAS_FFMPEG, "needs ffmpeg")
    def test_extract_frames(self):
        with tempfile.TemporaryDirectory() as tmp:
            video = Path(tmp) / "v.mp4"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=1920x1080:rate=10:duration=8",
                            "-pix_fmt", "yuv420p", str(video)], check=True)
            frames = ai.extract_frames(video, Path(tmp) / "frames", 8.0, 4)
            self.assertEqual(len(frames), 4)
            from PIL import Image
            with Image.open(frames[0]) as image:
                self.assertEqual(image.size, (768, 432))
            with self.assertRaises(RuntimeError):
                ai.extract_frames(Path(tmp) / "missing.mp4", Path(tmp) / "f2", 8.0, 3)

    def test_merge_descriptions(self):
        merged = ai.merge_descriptions([(12.5, "A man in a gym. "), (75, ""), (130, "Sunset.")])
        self.assertEqual(merged, "Frame 1 at 0:12: A man in a gym.\nFrame 3 at 2:10: Sunset.")


class ProvidersTest(unittest.TestCase):
    def test_gpu_status_without_torch(self):
        with mock.patch.dict(sys.modules, {"torch": None}):
            ok, reason = ai.gpu_status()
        self.assertFalse(ok)
        self.assertIn("torch", reason)

    def test_gpu_status_without_cuda(self):
        fake = types.SimpleNamespace(cuda=types.SimpleNamespace(is_available=lambda: False))
        with mock.patch.dict(sys.modules, {"torch": fake}):
            ok, reason = ai.gpu_status()
        self.assertFalse(ok)
        self.assertIn("T4 GPU", reason)

    def fake_anthropic(self, response):
        sent = {}

        class Error(Exception):
            status_code = 0

        class Messages:
            def create(self, **kwargs):
                sent.update(kwargs)
                return response

        class Client:
            def __init__(self, api_key):
                sent["api_key"] = api_key
                self.beta = types.SimpleNamespace(messages=Messages())

        module = types.SimpleNamespace(Anthropic=Client, RateLimitError=Error, APIStatusError=Error,
                                       APIConnectionError=Error)
        return module, sent

    def test_anthropic_request_and_reply(self):
        text = types.SimpleNamespace(type="text", text='{"caption": "Hi 🔥", "tags": []}')
        response = types.SimpleNamespace(stop_reason="end_turn", content=[text])
        module, sent = self.fake_anthropic(response)
        with mock.patch.dict(sys.modules, {"anthropic": module}):
            writer = ai.AnthropicWriter("sk-test")
            self.assertEqual(writer("SYS", "USER"), '{"caption": "Hi 🔥", "tags": []}')
        self.assertEqual(sent["model"], "claude-opus-5-5")
        self.assertEqual(sent["system"], "SYS")
        self.assertEqual(sent["messages"], [{"role": "user", "content": "USER"}])
        self.assertEqual(sent["output_config"]["format"]["schema"], ai.CAPTION_SCHEMA)
        self.assertEqual(sent["fallbacks"], "default")
        self.assertIn("server-side-fallback-2026-07-01", sent["betas"])

    def test_anthropic_refusal(self):
        response = types.SimpleNamespace(stop_reason="refusal", content=[],
                                         stop_details=types.SimpleNamespace(category=None))
        module, _ = self.fake_anthropic(response)
        with mock.patch.dict(sys.modules, {"anthropic": module}):
            with self.assertRaises(ai.WriterRefused):
                ai.AnthropicWriter("sk-test")("S", "U")


class NotebookTest(unittest.TestCase):
    def test_flow_and_privacy_in_the_cells(self):
        import build_notebook as nb
        # Prepare → review → publish, in that order.
        cells = [nb.PREPARE, nb.REVIEW, nb.RUN]
        self.assertTrue(all(cells))
        self.assertIn("raise SystemExit(\"Hãy duyệt caption ở ô 6 trước khi đăng.\")", nb.RUN)
        # LINKS captions win over AI captions.
        self.assertIn("if not job.x_caption:  # caption trong LINKS luôn được ưu tiên", nb.PREPARE)
        # The frame description never goes to the ledger, the server or the results table.
        for cell in (nb.REVIEW, nb.RUN):
            self.assertNotIn("descriptions", cell)
        self.assertIn("descriptions.clear()", nb.PREPARE)
        self.assertIn("AI_CAPTION = True", nb.CONFIG)
        self.assertIn('AI_TEXT_ENGINE = "local"', nb.CONFIG)


if __name__ == "__main__":
    unittest.main()
