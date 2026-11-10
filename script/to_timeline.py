"""Episode JSON -> render timeline JSON (consumed by voice/tts.py and render/render.mjs)."""
from common import config, read_json, write_json

TIME = {"day": 0.0, "dusk": 0.5, "night": 1.0}


def convert(episode, cfg=None, styles=None, lo=0):
    cfg = cfg or config()
    styles = styles or []
    shots = []
    for i, s in enumerate(episode["shots"], 1):
        st = s["scene_state"]
        state = {"time": TIME[st["time"]], "sign": st["sign"], "chair": st["chair"],
                 "houses": max(lo, min(st["houses"], len(styles))) if styles else st["houses"], "campfire": st["campfire"]}
        if st.get("time_to"):
            state["time_to"] = TIME[st["time_to"]]
        ov = s.get("overlay") or {"type": "none"}
        shots.append({"id": f"s{i:02d}", "min_dur": s["duration_sec"], "camera": s["camera"],
                      "anim": s["character_anim"], "expression": s["expression"], "state": state,
                      "voiceover_text": s["voiceover_text"], "highlight": s["highlight_word"],
                      "beats": [len(b.split()) for b in s["caption_words"]], "overlay": ov})
    return {"series": cfg["series_name"], "theme": cfg.get("theme", "classic"), "day": episode["day"], "voice": cfg["voice"],
            "rate": cfg["voice_rate"], "styles": styles, "shots": shots}


def run(episode_path, out_path):
    from pathlib import Path
    ba = Path(episode_path).parent / "bible.after.json"
    styles = read_json(ba).get("scene", {}).get("styles") if ba.exists() else None
    bb = Path(episode_path).parent / "bible.before.json"
    lo = len(read_json(bb).get("buildings_built", [])) if bb.exists() else 0
    tl = convert(read_json(episode_path), styles=styles, lo=lo)
    write_json(out_path, tl)
    print("timeline ok:", out_path)
    return tl
