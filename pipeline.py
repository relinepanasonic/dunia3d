"""One command: series bible -> final MP4.

  python pipeline.py episode --day 2 [--offline] [--force] [--stage script|timeline|voice|render]
Stages are cached in out/day-XX/ and skipped when their output exists (use --force to redo from --stage on).
"""
import argparse, json, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import ROOT, config, day_dir, read_json, load_env  # noqa: E402

STAGES = ["script", "timeline", "voice", "render"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["episode"])
    ap.add_argument("--day", type=int, required=True)
    ap.add_argument("--offline", action="store_true", help="use script/fixtures instead of Gemini")
    ap.add_argument("--force", action="store_true", help="redo --stage (default: all stages)")
    ap.add_argument("--stage", choices=STAGES, default="script", help="with --force: first stage to redo")
    ap.add_argument("--until", choices=STAGES, default="render", help="stop after this stage")
    ap.add_argument("--from-supabase", action="store_true", help="pull IG totals + approved comments from the dashboard first")
    ap.add_argument("--sync", action="store_true", help="push stats/episode to the dashboard after the script stage")
    a = ap.parse_args()
    load_env()
    d = day_dir(a.day)
    redo = {s: a.force and STAGES.index(s) >= STAGES.index(a.stage) for s in STAGES}
    cfg = config()

    from script import generate, to_timeline
    from voice import tts

    from sync import supabase_sync
    if a.from_supabase:
        supabase_sync.pull()
    ep = generate.run(a.day, a.offline, redo["script"])
    if a.sync:
        supabase_sync.push(a.day)
    if a.until == "script":
        return
    tl_path = d / "timeline.json"
    if redo["timeline"] or not tl_path.exists() or tl_path.stat().st_mtime < (d / "episode.json").stat().st_mtime:
        to_timeline.run(d / "episode.json", tl_path)
    if a.until == "timeline":
        return
    tts.run(tl_path, d, cfg["voice_provider"], force=redo["voice"])
    total = read_json(d / "voice.json")["total"]
    lo, hi = cfg["target_seconds"]
    if not lo <= total <= hi:
        print(f"WARNING: duration {total:.1f}s outside target {lo}-{hi}s")
    if a.until == "voice":
        return
    cmd = ["node", str(ROOT / "render" / "render.mjs"), str(tl_path), str(d)] + (["--force"] if redo["render"] else [])
    subprocess.check_call(cmd, cwd=ROOT)
    (d / "post.json").write_text(json.dumps({"caption": ep["ig_caption"], "hashtags": ep["hashtags"],
                                              "title": ep["title"], "video": str(d / "video.mp4")},
                                             ensure_ascii=False, indent=2), encoding="utf-8")
    print("DONE ->", d / "video.mp4")


if __name__ == "__main__":
    main()
