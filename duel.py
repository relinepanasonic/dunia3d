"""Week-1 duel: two short presentation reels (A and B). Likes decide which building is built.

Flow (see daily.py):  day D  -> plan_duel() picks two candidates, make_reels() renders them, publish both with the episode
                      day D+1 -> read_likes() sums each reel's like counter over platforms, game.resolve_duel() picks the winner
"""
import json, os, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from common import config, write_json  # noqa: E402
import game  # noqa: E402

TIME = {"day": 0.0, "dusk": 0.5}


def _shot(i, cam, anim, ex, vo, hl, overlay=None, time=0.0, dur=3.2):
    return {"id": f"s{i:02d}", "min_dur": dur, "camera": cam, "anim": anim, "expression": ex,
            "state": {"time": time, "sign": True, "chair": False, "houses": 1, "campfire": False},
            "voiceover_text": vo, "highlight": hl, "beats": [], "overlay": overlay or {"type": "none"}}


def reel_timeline(day, opt, other, min_likes, cfg=None):
    """Template script (no LLM needed): hook, two pitch shots, 'free if you win', like-to-vote call."""
    cfg = cfg or config()
    side, name = opt["side"], opt["name"]
    p = (opt.get("pitch") or [f"{name} untuk negara kita."]) * 2
    vote = {"type": "follow", "text": f"LIKE = VOTE {side}"}
    shots = [
        _shot(1, "wide_push", "point", "smile", f"Pilihan {side}: {name}!", name.split()[0], vote),
        _shot(2, "showcase_orbit", "idle", "smile", p[0], p[0].split()[0]),
        _shot(3, "showcase_top", "nod", "smile", p[1], p[1].split()[0], time=0.15),
        _shot(4, "medium_push", "point", "smirk", "Menang di like, langsung dibangun gratis.", "gratis",
              {"type": "card", "rows": [{"label": f"PILIHAN {side}", "text": name}, {"label": "LAWANNYA", "text": other["name"]}]}, time=0.3),
        _shot(5, "close_push", "wave", "smile", f"Like reel ini kalau lo pilih {side}. Minimal {min_likes} like!", "Minimal", vote, time=0.5, dur=3.6),
    ]
    return {"series": cfg["series_name"], "theme": cfg.get("theme", "classic"), "day": day, "badge": f"DAY {day} · PILIHAN {side}",
            "voice": cfg["voice"], "rate": cfg["voice_rate"], "styles": [opt.get("style", 0)], "shots": shots}


def make_reels(day, duel, out_dir):
    """Build + render both reels. Returns {'A': video_path, 'B': video_path}."""
    from render_stage import produce
    out = {}
    for opt in duel["options"]:
        other = next(o for o in duel["options"] if o["side"] != opt["side"])
        d = Path(out_dir) / f"duel-{opt['side'].lower()}"
        d.mkdir(parents=True, exist_ok=True)
        tl = reel_timeline(day, opt, other, duel["min_likes"])
        write_json(d / "timeline.json", tl)
        produce(d / "timeline.json", d)
        write_json(d / "post.json", {"title": f"Day {day} Pilihan {opt['side']}: {opt['name']}",
                                     "caption": f"PILIHAN {opt['side']}: {opt['name']}! Like reel ini kalau kamu pilih {opt['side']}. "
                                                f"Yang paling banyak like dan minimal {duel['min_likes']} like akan dibangun di negara kita.",
                                     "hashtags": config()["base_hashtags"], "video": str(d / "video.mp4")})
        post = json.loads((d / "post.json").read_text(encoding="utf-8"))
        opt["caption"] = post["caption"] + "\n\n" + " ".join(post["hashtags"])  # shown on the admin page for manual posting
        out[opt["side"]] = str(d / "video.mp4")
    return out


def read_likes(duel, fixture_likes=None):
    """{'A': n, 'B': n}: each reel's likes summed over the platforms it was posted on."""
    if fixture_likes:
        return fixture_likes
    out = {}
    for s in "AB":
        o = next(x for x in duel["options"] if x["side"] == s)
        out[s], detail = option_likes(o)
        print(f"[duel] reel {s} likes: {out[s]} {detail}")
    return out


def option_likes(o):
    """API likes for platforms the reel was posted to through the API + likes typed on the admin page for the rest."""
    from stats.likes import total_likes
    media = {k: v for k, v in (o.get("media") or {}).items() if v}
    n, detail = total_likes(media)
    api_ok = {p for p, v in detail.items() if isinstance(v, int)}
    for plat, m in (o.get("manual_likes") or {}).items():
        if plat not in api_ok and m:
            n += int(m); detail[plat] = f"{int(m)} (manual)"
    return n, detail


def refresh_likes():
    """Live like counts for open duels (called by the 30-minute workflow so the dashboard shows the race)."""
    from sync import supabase_sync as sb
    for duel in sb.get("ng_duels?status=eq.open&select=*"):
        changed = False
        for o in duel["options"]:
            if o.get("media") or o.get("manual_likes"):
                n, _ = option_likes(o)
                if n != o.get("likes"):
                    o["likes"], changed = n, True
        if changed:
            sb.patch_rows("ng_duels", f"id=eq.{duel['id']}", {"options": duel["options"]})
            print(f"[duel] day {duel['day']} likes: " + ", ".join(f"{o['side']}={o.get('likes', 0)}" for o in duel["options"]))
