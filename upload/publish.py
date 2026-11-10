"""Publish a rendered episode to Instagram + YouTube + TikTok, gated by dashboard approval and a daily cap.

  python upload/publish.py --day 3 [--dry-run] [--force]
Used by daily.py right after rendering and by the 'publish-approved' workflow (episodes approved later on the dashboard).
"""
import argparse, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from common import load_env, read_json, config, day_dir  # noqa: E402
from sync import supabase_sync as sb  # noqa: E402
from upload import platforms as P  # noqa: E402


def run(day, dry_run=False, force=False):
    load_env()
    cfg, d = config(), day_dir(day)
    video, post = d / "video.mp4", read_json(d / "post.json")
    caption = post["caption"] + "\n\n" + " ".join(post["hashtags"])
    ep = (sb.get(f"ng_episodes?day=eq.{day}&select=status,platforms") or [{}])[0] if sb.configured() else {}
    done = ep.get("platforms") or {}

    if cfg.get("require_approval", True) and not force and ep.get("status") not in ("approved", "published"):
        print(f"[upload] day {day} waits for approval on the dashboard (status={ep.get('status', 'unknown')}); nothing posted")
        return False
    posted_today = sum(1 for e in (sb.get("ng_episodes?status=eq.published&select=day") if sb.configured() else []) if e["day"] != day)
    if posted_today and cfg.get("daily_post_cap", 1) <= 0 and not force:
        print("[upload] daily post cap reached"); return False
    if not video.exists():
        raise SystemExit(f"{video} missing; render first")

    plan = {"instagram": lambda u: P.instagram_publish(u, caption),
            "youtube": lambda u: P.youtube_publish(str(video), post["title"], caption, cfg.get("youtube_privacy", "private")),
            "tiktok": lambda u: P.tiktok_publish(str(video), caption, cfg.get("tiktok_mode", "inbox"))}
    if dry_run:
        for name in cfg.get("platforms", plan):
            print(f"[upload][dry-run] would post day {day} to {name}: {video.stat().st_size/1e6:.1f} MB, caption {len(caption)} chars")
        return True

    url = P.storage_upload(video, f"day-{day:02d}.mp4")
    print("[upload] public URL:", url)
    for name in cfg.get("platforms", list(plan)):
        if name in done and done[name].get("id"):
            print(f"[upload] {name}: already posted ({done[name]['id']})"); continue
        try:
            pid = plan[name](url)
        except Exception as e:  # one platform failing must not block the others
            print(f"[upload] {name} FAILED: {e}"); done[name] = {"error": str(e)[:300]}; continue
        if pid is None:
            print(f"[upload] {name}: credentials missing, skipped"); continue
        done[name] = {"id": pid, "status": "posted"}
        print(f"[upload] {name}: posted {pid}")
    ok = any(v.get("id") for v in done.values())
    sb.patch_rows("ng_episodes", f"day=eq.{day}", {"platforms": done, "video_url": url, **({"status": "published"} if ok else {})})
    return ok


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", type=int, required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="ignore the approval gate")
    a = ap.parse_args()
    run(a.day, a.dry_run, a.force)
