"""AI captions for the X posts made by colab_publish.ipynb.

1. JoyCaption (a vision model, 4-bit on a Colab T4) describes 3-5 frames
   spread through the video. The description stays in memory: it is never
   posted, never written to the ledger and never sent to gayvideo.fun.
2. A text model writes one English teaser caption for X, plus a few tags
   for the web, from that description, the title, the tags, your
   Vietnamese keywords and the style of your example captions. By default
   an open model runs on the Colab GPU (no key); Anthropic or OpenAI can be
   used instead with a key in Colab Secrets (the description is then sent
   to that provider).
3. Every caption, AI-written or typed by you, goes through the same checks:
   no words from the banned list (Buffer forbids sexually explicit content)
   and at most CAPTION_BUDGET by X's weighted count, since the server adds
   a blank line and the link to the video page.

Everything that does not need a GPU is plain Python and covered by
test_caption_ai.py; the model classes import torch/transformers lazily.
"""

from __future__ import annotations

import gc
import json
import re
import subprocess
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

# --- X length (same rules as lib/social/xText.ts) -----------------------------------

X_MAX_WEIGHT = 280
URL_WEIGHT = 23
# The server posts "caption\n\nhttps://gayvideo.fun/watch/…": the URL weighs 23.
CAPTION_BUDGET = X_MAX_WEIGHT - URL_WEIGHT - 2


def _char_weight(char: str) -> int:
    code = ord(char)
    if (code <= 0x10FF or 0x2000 <= code <= 0x200D or 0x2010 <= code <= 0x201F
            or 0x2032 <= code <= 0x2037):
        return 1
    return 2


def x_weight(text: str) -> int:
    """X's weighted length (twitter-text v3) of plain text without URLs."""
    return sum(_char_weight(char) for char in unicodedata.normalize("NFC", text))


def fit_caption(caption: str, budget: int = CAPTION_BUDGET) -> str:
    """Collapses spaces and trims to `budget` with "…", as the server would."""
    clean = re.sub(r"[ \t]+", " ", unicodedata.normalize("NFC", caption or "")).strip()
    if x_weight(clean) <= budget:
        return clean
    room = budget - x_weight("…")
    out, weight = "", 0
    for char in clean:
        if weight + _char_weight(char) > room:
            break
        out += char
        weight += _char_weight(char)
    # Cut at a word boundary when one is close, so no half word is left.
    if " " in out[-25:]:
        out = out[: out.rfind(" ")]
    return out.rstrip(" ,;:-") + "…"


# --- banned words -------------------------------------------------------------------

# Buffer's terms forbid sexually explicit content: captions must tease, not
# describe. Matching ignores case, accents and separators ("f.u.c.k",
# "s3x"); add your own with BANNED_EXTRA in the notebook.
BANNED_WORDS = (
    "anal", "anus", "bareback", "bdsm", "blowjob", "blow job", "bj", "boner", "bukkake", "butthole",
    "cock", "cocks", "creampie", "cum", "cumming", "cumshot", "deepthroat", "dick", "dicks", "dildo",
    "ejaculate", "ejaculation", "erection", "fap", "fellatio", "fisting", "fuck", "fucked", "fucking",
    "fucks", "gangbang", "handjob", "hardcore", "horny", "jerk off", "jerking", "jizz", "masturbate",
    "masturbating", "milf", "naked", "nude", "nudes", "nudity", "orgasm", "orgy", "penis", "porn",
    "porno", "pornhub", "pussy", "rimjob", "rimming", "semen", "sex", "sexual", "slut",
    "sperm", "suck", "sucking", "testicles", "threesome", "twink", "xxx", "onlyfans", "nsfw",
    # Never acceptable in any caption.
    "teen", "teens", "underage", "minor", "schoolboy", "barely legal", "young boy", "boy", "boys",
    "lolita", "rape", "forced", "drugged", "incest", "stepbro", "stepdad", "stepson",
    # Vietnamese, in case keywords slip into a caption.
    "địt", "đụ", "chịch", "lồn", "cặc", "buồi", "bú cu", "thủ dâm", "khiêu dâm",
)

_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i"})


def _fold(text: str) -> str:
    """Lower case, no accents (except đ→d), leetspeak undone."""
    text = unicodedata.normalize("NFD", (text or "").lower().replace("đ", "d"))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return text.translate(_LEET)


def _tokens(text: str) -> List[str]:
    """Folded words; runs of 3+ single letters are joined ("f.u.c.k" → "fuck")."""
    out: List[str] = []
    run: List[str] = []
    for word in re.findall(r"[a-z]+", _fold(text)) + [""]:
        if len(word) == 1:
            run.append(word)
            continue
        if len(run) >= 3:
            out.append("".join(run))
        else:
            out.extend(run)
        run = []
        if word:
            out.append(word)
    return out


def banned_terms(text: str, extra: Iterable[str] = ()) -> List[str]:
    """The banned words found in text (empty list = clean). Whole words only,
    plus a plural "s", so "Sussex" or "cocktail" are fine."""
    joined = " " + " ".join(_tokens(text)) + " "
    found = []
    for term in list(BANNED_WORDS) + [t for t in extra if t and t.strip()]:
        folded = " ".join(re.findall(r"[a-z]+", _fold(term)))
        if not folded or term in found:
            continue
        if f" {folded} " in joined or (" " not in folded and f" {folded}s " in joined):
            found.append(term)
    return found


# --- captions -----------------------------------------------------------------------

GENERIC_CAPTION = "New video just dropped 🔥"


def ascii_title(value: str) -> str:
    value = unicodedata.normalize("NFD", (value or "").replace("đ", "d").replace("Đ", "D"))
    return "".join(char for char in value if unicodedata.category(char) != "Mn")


def default_caption(template: str, title: str, extra_banned: Iterable[str] = ()) -> str:
    """The template caption ("New video: {title} 🔥"); generic if the title
    has a banned word or the template is broken."""
    try:
        caption = fit_caption((template or "").format(title=ascii_title(title)))
    except (KeyError, IndexError, ValueError):
        caption = ""
    if not caption or banned_terms(caption, extra_banned):
        return GENERIC_CAPTION
    return caption


def clean_tags(tags: Iterable[str], extra_banned: Iterable[str] = (), limit: int = 8) -> List[str]:
    """Deduped (case-insensitive), no '#', short, not banned, at most `limit`."""
    out: List[str] = []
    seen = set()
    for tag in tags or ():
        tag = re.sub(r"\s+", " ", str(tag).replace("#", "")).strip(" ,;.")
        if not tag or len(tag) > 30 or banned_terms(tag, extra_banned):
            continue
        key = tag.casefold()
        if key not in seen:
            seen.add(key)
            out.append(tag)
        if len(out) >= limit:
            break
    return out


def parse_tags(text: str) -> List[str]:
    return [tag.strip() for tag in re.split(r"[;,]", text or "") if tag.strip()]


# --- example captions ----------------------------------------------------------------

def load_examples(path: str, starter: Optional[str] = None, extra_banned: Iterable[str] = ()) -> Tuple[List[str], List[str]]:
    """(examples, warnings) from a text file, one caption per line; lines
    starting with # are comments. A missing file is created from `starter`
    (the repo's assets/caption_examples.txt) so it can be edited on Drive."""
    file = Path(path).expanduser()
    warnings: List[str] = []
    if not file.exists() and starter is not None:
        try:
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(starter, encoding="utf-8")
            warnings.append(f"Đã tạo file mẫu {file} (sửa thoải mái, mỗi dòng 1 caption).")
        except OSError as error:
            warnings.append(f"Không tạo được {file} ({error}); dùng mẫu khởi đầu.")
            text = starter
        else:
            text = file.read_text(encoding="utf-8")
    elif file.exists():
        text = file.read_text(encoding="utf-8")
    else:
        text = ""
    examples = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        hits = banned_terms(line, extra_banned)
        if hits:
            warnings.append(f"Bỏ caption mẫu có từ cấm ({', '.join(hits)}): {line[:60]}")
            continue
        examples.append(line)
    return examples, warnings


# --- prompts ------------------------------------------------------------------------

CAPTION_SCHEMA = {
    "type": "object",
    "properties": {
        "caption": {"type": "string"},
        "tags": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["caption", "tags"],
    "additionalProperties": False,
}


def build_prompts(description: str, title: str, tags: Sequence[str], keywords: str,
                  examples: Sequence[str], budget: int = CAPTION_BUDGET,
                  feedback: str = "") -> Tuple[str, str]:
    """(system, user) for the text model."""
    system = (
        "You write the text of X (Twitter) posts that announce a new video on GayVideo.fun, "
        "an 18+ website for gay men. The post goes out through Buffer, whose rules forbid sexually "
        "explicit content, so every caption is a teaser:\n"
        "- playful, confident, a little flirty at most; build curiosity about the video;\n"
        "- never describe sex acts, nudity or genitals, never use explicit or vulgar words, "
        "never mention age, school, family roles or anything that suggests a minor;\n"
        "- English only (translate the meaning of Vietnamese keywords, do not copy them);\n"
        f"- at most {budget} characters, one or two short sentences, at most 2 emoji and 2 hashtags;\n"
        "- no URL and no \"link in bio\": the link to the video is added after the caption;\n"
        "- match the voice, rhythm and length of the example captions.\n"
        "Also suggest 3 to 6 short, non-explicit English tags for the website "
        "(people, setting, mood or style; no '#').\n"
        'Reply with JSON only: {"caption": "...", "tags": ["...", "..."]}'
    )
    parts = [f"Video title: {title or '(none)'}"]
    if tags:
        parts.append("Existing tags: " + ", ".join(tags))
    if keywords:
        parts.append("My keywords (Vietnamese, for meaning only): " + keywords)
    if description:
        parts.append(
            "What the frames show (private notes, may be explicit; use them only for the people, "
            "setting and mood, never repeat explicit details):\n" + description
        )
    if examples:
        parts.append("Example captions in my style:\n" + "\n".join(f"- {line}" for line in examples[:30]))
    if feedback:
        parts.append("Your previous answer was rejected: " + feedback + " Write a new one.")
    return system, "\n\n".join(parts)


def parse_writer_output(text: str) -> Tuple[str, List[str]]:
    """(caption, tags) from a model reply: JSON, possibly inside code fences
    or after a <think> block. Raises ValueError when there is no caption."""
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    data: Any = None
    for match in re.finditer(r"\{.*\}", text, flags=re.S):
        try:
            data = json.loads(match.group(0))
            break
        except ValueError:
            continue
    if not isinstance(data, dict):
        raise ValueError("model reply is not JSON")
    caption = str(data.get("caption") or "").strip().strip('"').strip()
    tags = data.get("tags") or []
    if isinstance(tags, str):
        tags = parse_tags(tags)
    if not caption:
        raise ValueError("model reply has no caption")
    return caption, [str(tag) for tag in tags if str(tag).strip()]


def check_caption(caption: str, extra_banned: Iterable[str] = (), budget: int = CAPTION_BUDGET) -> Tuple[str, List[str]]:
    """(caption fitted to the budget, problems). Problems name banned words or
    a URL; an over-long caption is trimmed, not refused."""
    problems = []
    hits = banned_terms(caption, extra_banned)
    if hits:
        problems.append("có từ cấm: " + ", ".join(hits))
    if re.search(r"https?://|www\.|\.(com|fun|net)\b", caption or "", flags=re.I):
        problems.append("có link (server tự thêm link bài viết)")
    return fit_caption(caption, budget), problems


@dataclass
class Suggestion:
    caption: str
    tags: List[str] = field(default_factory=list)
    source: str = "mặc định"  # "LINKS", "AI" or "mặc định"
    note: str = ""


def write_caption(generate: Callable[[str, str], str], *, description: str, title: str, tags: Sequence[str],
                  keywords: str, examples: Sequence[str], extra_banned: Iterable[str] = (),
                  attempts: int = 3, budget: int = CAPTION_BUDGET) -> Suggestion:
    """Asks `generate(system, user)` for a caption until one passes the checks.
    Raises RuntimeError after `attempts` rejected or failed replies."""
    extra_banned = list(extra_banned)
    feedback, last = "", ""
    for attempt in range(attempts):
        system, user = build_prompts(description, title, tags, keywords, examples, budget, feedback)
        try:
            caption, suggested = parse_writer_output(generate(system, user))
        except WriterRefused as error:
            raise RuntimeError(f"mô hình từ chối viết ({error})") from None
        except ValueError as error:
            feedback, last = f"{error}. Reply with the JSON object only.", str(error)
            continue
        fitted, problems = check_caption(caption, extra_banned, budget)
        if problems:
            feedback = "; ".join(problems) + ". Keep it a teaser with no explicit words."
            last = "; ".join(problems)
            continue
        if x_weight(caption) > budget:
            feedback = f"it is longer than {budget} characters."
            last = "quá dài"
            if attempt < attempts - 1:
                continue
        return Suggestion(fitted, clean_tags(suggested, extra_banned), "AI")
    raise RuntimeError(f"không có caption đạt yêu cầu sau {attempts} lần ({last})")


# --- review -------------------------------------------------------------------------

@dataclass
class Decision:
    post_x: bool
    caption: str
    tags: List[str]
    problems: List[str]


def review_decision(post_x: bool, caption: str, tags_text: str, extra_banned: Iterable[str] = (),
                    budget: int = CAPTION_BUDGET) -> Decision:
    """What the Đăng cell does with one reviewed row: a caption with problems
    (banned words, a link) or an empty one is not posted to X."""
    tags = clean_tags(parse_tags(tags_text), extra_banned, limit=20)
    caption = (caption or "").strip()
    if not post_x:
        return Decision(False, caption, tags, [])
    if not caption:
        return Decision(False, "", tags, ["caption trống"])
    fitted, problems = check_caption(caption, extra_banned, budget)
    return Decision(not problems, fitted, tags, problems)


def weight_label(caption: str, budget: int = CAPTION_BUDGET) -> str:
    weight = x_weight((caption or "").strip())
    return f"{weight}/{budget}" + (" (sẽ bị cắt bớt)" if weight > budget else "")


# --- frames -------------------------------------------------------------------------

def frame_times(duration: float, count: int) -> List[float]:
    """`count` (3-5) timestamps spread evenly, away from the very start/end."""
    count = max(1, min(5, int(count)))
    if duration <= 0:
        return [0.0]
    return [round(duration * (index + 0.5) / count, 2) for index in range(count)]


def extract_frames(video: Path, folder: Path, duration: float, count: int = 4, width: int = 768) -> List[Path]:
    """JPEG frames at frame_times(); the longer side is at most `width`."""
    folder.mkdir(parents=True, exist_ok=True)
    frames = []
    for index, second in enumerate(frame_times(duration, count)):
        target = folder / f"frame-{index + 1}.jpg"
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{second:.2f}", "-i", str(video),
             "-frames:v", "1", "-vf", f"scale='if(gte(iw,ih),min({width},iw),-2)':'if(gte(iw,ih),-2,min({width},ih))'",
             "-q:v", "3", str(target)],
            capture_output=True, text=True, timeout=300,
        )
        if result.returncode == 0 and target.exists() and target.stat().st_size > 0:
            frames.append(target)
    if not frames:
        raise RuntimeError("ffmpeg không lấy được khung hình nào.")
    return frames


def merge_descriptions(descriptions: Sequence[Tuple[float, str]]) -> str:
    return "\n".join(f"Frame {index + 1} at {int(second) // 60}:{int(second) % 60:02d}: {text.strip()}"
                     for index, (second, text) in enumerate(descriptions) if text and text.strip())


# --- models (GPU, lazy imports) -----------------------------------------------------

JOYCAPTION_MODEL = "fancyfeast/llama-joycaption-beta-one-hf-llava"
LOCAL_TEXT_MODEL = "Qwen/Qwen3-8B"
ANTHROPIC_MODEL = "claude-opus-5-5"
OPENAI_MODEL = "gpt-5-mini"
JOYCAPTION_PROMPT = (
    "Write a descriptive caption for this image in a casual tone, under 90 words. "
    "Describe the people (build, hair, clothing), the setting, the lighting and the mood."
)


class WriterRefused(Exception):
    """The text model or API declined the request."""


def gpu_status() -> Tuple[bool, str]:
    """(has a CUDA GPU, human-readable name or reason)."""
    try:
        import torch
    except ImportError:
        return False, "chưa cài torch"
    if not torch.cuda.is_available():
        return False, "runtime không có GPU (Runtime → Change runtime type → T4 GPU)"
    return True, torch.cuda.get_device_name(0)


def _bnb_4bit() -> Any:
    import torch
    from transformers import BitsAndBytesConfig

    return BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True,
                              bnb_4bit_compute_dtype=torch.float16,
                              # The vision tower and projector stay in fp16: quantizing them hurts captions.
                              llm_int8_skip_modules=["vision_tower", "multi_modal_projector", "lm_head"])


def free_gpu(*objects: Any) -> None:
    for obj in objects:
        del obj
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass


class JoyCaptioner:
    """JoyCaption (LLaVA) in 4-bit NF4 with fp16 compute, which a T4 supports
    (bf16 is not native there). About 6 GB of VRAM."""

    def __init__(self, model_id: str = JOYCAPTION_MODEL):
        import torch
        from transformers import AutoProcessor, LlavaForConditionalGeneration

        self.torch = torch
        self.processor = AutoProcessor.from_pretrained(model_id)
        self.model = LlavaForConditionalGeneration.from_pretrained(
            model_id, quantization_config=_bnb_4bit(), torch_dtype=torch.float16, device_map=0)
        self.model.eval()

    def describe(self, image_path: Path, prompt: str = JOYCAPTION_PROMPT) -> str:
        from PIL import Image

        torch = self.torch
        convo = [{"role": "system", "content": "You are a helpful image captioner."},
                 {"role": "user", "content": prompt}]
        # As in the model card: this exact apply_chat_template + processor pairing.
        text = self.processor.apply_chat_template(convo, tokenize=False, add_generation_prompt=True)
        with Image.open(image_path) as image:
            inputs = self.processor(text=[text], images=[image.convert("RGB")], return_tensors="pt").to("cuda")
        inputs["pixel_values"] = inputs["pixel_values"].to(torch.float16)
        with torch.no_grad():
            ids = self.model.generate(**inputs, max_new_tokens=200, do_sample=True, suppress_tokens=None,
                                      use_cache=True, temperature=0.6, top_k=None, top_p=0.9)[0]
        ids = ids[inputs["input_ids"].shape[1]:]
        return self.processor.tokenizer.decode(ids, skip_special_tokens=True,
                                               clean_up_tokenization_spaces=False).strip()

    def close(self) -> None:
        model, processor = self.model, self.processor
        self.model = self.processor = None
        free_gpu(model, processor)


class LocalWriter:
    """An open instruct model in 4-bit on the Colab GPU (default Qwen3-8B,
    Apache-2.0, no Hugging Face token needed; thinking mode off)."""

    def __init__(self, model_id: str = LOCAL_TEXT_MODEL):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        self.torch = torch
        self.tokenizer = AutoTokenizer.from_pretrained(model_id)
        config = _bnb_4bit()
        config.llm_int8_skip_modules = None
        self.model = AutoModelForCausalLM.from_pretrained(model_id, quantization_config=config,
                                                          torch_dtype=torch.float16, device_map=0)
        self.model.eval()

    def __call__(self, system: str, user: str) -> str:
        torch = self.torch
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        try:
            text = self.tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True,
                                                      enable_thinking=False)
        except TypeError:
            text = self.tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = self.tokenizer([text], return_tensors="pt").to("cuda")
        with torch.no_grad():
            ids = self.model.generate(**inputs, max_new_tokens=300, do_sample=True, temperature=0.8, top_p=0.9)[0]
        return self.tokenizer.decode(ids[inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()

    def close(self) -> None:
        model, tokenizer = self.model, self.tokenizer
        self.model = self.tokenizer = None
        free_gpu(model, tokenizer)


class AnthropicWriter:
    """Claude through the Anthropic SDK (key: Colab secret ANTHROPIC_API_KEY).
    Structured output guarantees JSON; server-side fallbacks retry a
    declined request on another model before reporting a refusal."""

    def __init__(self, api_key: str, model: str = ANTHROPIC_MODEL):
        import anthropic

        self.anthropic = anthropic
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def __call__(self, system: str, user: str) -> str:
        anthropic = self.anthropic
        try:
            response = self.client.beta.messages.create(
                model=self.model,
                max_tokens=8000,
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": CAPTION_SCHEMA}},
                system=system,
                messages=[{"role": "user", "content": user}],
            )
        except anthropic.RateLimitError as error:
            raise RuntimeError(f"Anthropic: quá giới hạn tốc độ ({error.status_code})") from None
        except anthropic.APIStatusError as error:
            raise RuntimeError(f"Anthropic: HTTP {error.status_code}") from None
        except anthropic.APIConnectionError:
            raise RuntimeError("Anthropic: lỗi kết nối") from None
        if response.stop_reason == "refusal":
            category = getattr(getattr(response, "stop_details", None), "category", None)
            raise WriterRefused(f"refusal{f' ({category})' if category else ''}")
        return next((block.text for block in response.content if block.type == "text"), "")

    def close(self) -> None:
        self.client = None


class OpenAIWriter:
    """OpenAI chat completions in JSON mode (key: Colab secret OPENAI_API_KEY)."""

    def __init__(self, api_key: str, model: str = OPENAI_MODEL):
        from openai import OpenAI

        self.client = OpenAI(api_key=api_key)
        self.model = model

    def __call__(self, system: str, user: str) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_object"},
        )
        choice = response.choices[0]
        if getattr(choice, "finish_reason", "") == "content_filter" or getattr(choice.message, "refusal", None):
            raise WriterRefused(str(getattr(choice.message, "refusal", "") or "content_filter"))
        return choice.message.content or ""

    def close(self) -> None:
        self.client = None


def ensure_package(module: str, package: Optional[str] = None) -> None:
    """pip-installs `package` if `module` cannot be imported (Colab)."""
    import importlib
    import sys

    try:
        importlib.import_module(module)
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", package or module], check=True)
        importlib.invalidate_caches()
