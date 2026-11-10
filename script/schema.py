"""Episode schema: pydantic models (validation) + Gemini responseSchema (generation)."""
from typing import List, Optional, Literal
from pydantic import BaseModel, Field, field_validator, model_validator

CAMERAS = ["wide_push", "medium_push", "medium_pull", "close_push", "drone", "orbit"]
ANIMS = ["idle", "nod", "point", "walk", "wave", "shrug", "sleep"]
EXPRESSIONS = ["smile", "smirk", "annoyed", "sleep"]
TIMES = ["day", "dusk", "night"]
OVERLAYS = ["none", "hook", "card", "census", "comment", "idcard", "live", "follow", "drone", "end", "kpi"]


class Row(BaseModel):
    label: str
    text: str


class Overlay(BaseModel):
    type: Literal[tuple(OVERLAYS)] = "none"  # type: ignore[valid-type]
    big: Optional[str] = None
    sub: Optional[str] = None
    text: Optional[str] = None
    user: Optional[str] = None
    name: Optional[str] = None
    nik: Optional[str] = None
    status: Optional[str] = None
    followers: Optional[int] = None
    pop: Optional[int] = None
    rows: Optional[List[Row]] = None
    pajak: Optional[int] = None
    pengaruh: Optional[int] = None
    inspirasi: Optional[int] = None
    goal: Optional[str] = None
    progress: Optional[int] = None


class SceneState(BaseModel):
    time: Literal[tuple(TIMES)] = "day"  # type: ignore[valid-type]
    time_to: Optional[Literal[tuple(TIMES)]] = None  # type: ignore[valid-type]
    sign: bool = True
    chair: bool = True
    houses: int = Field(0, ge=0, le=16)
    campfire: bool = False


class Shot(BaseModel):
    camera: Literal[tuple(CAMERAS)]  # type: ignore[valid-type]
    character_anim: Literal[tuple(ANIMS)]  # type: ignore[valid-type]
    expression: Literal[tuple(EXPRESSIONS)]  # type: ignore[valid-type]
    scene_state: SceneState
    duration_sec: float = Field(4.0, ge=2.5, le=8.0)
    voiceover_text: str
    caption_words: List[str]
    highlight_word: str
    overlay: Optional[Overlay] = None

    @field_validator("voiceover_text")
    @classmethod
    def _vo(cls, v):
        if not (2 <= len(v.split()) <= 16):
            raise ValueError("voiceover_text must be 2-16 words")
        return v

    @field_validator("caption_words")
    @classmethod
    def _cw(cls, v):
        if not v or any(not (1 <= len(b.split()) <= 4) for b in v):
            raise ValueError("each caption beat must be 1-4 words")
        return v

    @model_validator(mode="after")
    def _beats_match(self):
        if sum(len(b.split()) for b in self.caption_words) != len(self.voiceover_text.split()):
            raise ValueError("caption_words must cover exactly the words of voiceover_text, in order")
        return self


class BibleUpdate(BaseModel):
    population: int
    followers: int
    buildings: List[str]
    running_gags: List[str]
    story_so_far: str
    next_episode_teaser: str


class Episode(BaseModel):
    title: str
    hook: str
    shots: List[Shot] = Field(min_length=10, max_length=20)
    ig_caption: str
    hashtags: List[str]
    bible_update: BibleUpdate

    @model_validator(mode="after")
    def _length(self):
        words = sum(len(s.voiceover_text.split()) for s in self.shots)
        if not (70 <= words <= 170):
            raise ValueError(f"total narration is {words} words; need 70-170 (about 55-95 seconds)")
        return self


def _s(**kw):
    return {"type": "string", **kw}


def gemini_schema():
    """Hand-written OpenAPI subset (Gemini rejects $ref / oneOf)."""
    overlay = {"type": "object", "nullable": True, "properties": {
        "type": _s(enum=OVERLAYS), "big": _s(nullable=True), "sub": _s(nullable=True), "text": _s(nullable=True),
        "user": _s(nullable=True), "name": _s(nullable=True), "nik": _s(nullable=True), "status": _s(nullable=True),
        "followers": {"type": "integer", "nullable": True}, "pop": {"type": "integer", "nullable": True},
        "pajak": {"type": "integer", "nullable": True}, "pengaruh": {"type": "integer", "nullable": True},
        "inspirasi": {"type": "integer", "nullable": True}, "goal": _s(nullable=True),
        "progress": {"type": "integer", "nullable": True},
        "rows": {"type": "array", "nullable": True, "items": {"type": "object", "properties": {
            "label": _s(), "text": _s()}, "required": ["label", "text"]}},
    }, "required": ["type"]}
    state = {"type": "object", "properties": {
        "time": _s(enum=TIMES), "time_to": _s(enum=TIMES, nullable=True),
        "sign": {"type": "boolean"}, "chair": {"type": "boolean"},
        "houses": {"type": "integer"}, "campfire": {"type": "boolean"}},
        "required": ["time", "sign", "chair", "houses", "campfire"]}
    shot = {"type": "object", "properties": {
        "camera": _s(enum=CAMERAS), "character_anim": _s(enum=ANIMS), "expression": _s(enum=EXPRESSIONS),
        "scene_state": state, "duration_sec": {"type": "number"}, "voiceover_text": _s(),
        "caption_words": {"type": "array", "items": _s()}, "highlight_word": _s(), "overlay": overlay},
        "required": ["camera", "character_anim", "expression", "scene_state", "duration_sec",
                     "voiceover_text", "caption_words", "highlight_word"]}
    bible = {"type": "object", "properties": {
        "population": {"type": "integer"}, "followers": {"type": "integer"},
        "buildings": {"type": "array", "items": _s()}, "running_gags": {"type": "array", "items": _s()},
        "story_so_far": _s(), "next_episode_teaser": _s()},
        "required": ["population", "followers", "buildings", "running_gags", "story_so_far", "next_episode_teaser"]}
    return {"type": "object", "properties": {
        "title": _s(), "hook": _s(), "shots": {"type": "array", "items": shot},
        "ig_caption": _s(), "hashtags": {"type": "array", "items": _s()}, "bible_update": bible},
        "required": ["title", "hook", "shots", "ig_caption", "hashtags", "bible_update"]}
