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
    if ok:
        run_duel(day, dry_run)
    return ok


def run_duel(day, dry_run=False):
    """Publish both duel presentation reels (same approval as the episode) and remember their media ids for like counting."""
    cfg = load_cfg()
    rows = sb.get(f"ng_duels?day=eq.{day}&select=*") if sb.configured() else []
    if not rows or rows[0]["status"] != "open":
        return False
    duel, d = rows[0], day_dir(day)
    for o in duel["options"]:
        if o.get("media"):
            continue  # already posted
        side = o["side"].lower()
        vid = d / f"duel-{side}" / "video.mp4"
        if not vid.exists():
            print(f"[duel] {vid} missing; skipping reel {o['side']}"); continue
        post = read_json(d / f"duel-{side}" / "post.json")
        caption = post["caption"] + "\n\n" + " ".join(post["hashtags"])
        if dry_run:
            print(f"[duel][dry-run] would post reel {o['side']}: {o['name']}"); continue
        url = P.storage_upload(vid, f"day-{day:02d}-duel-{side}.mp4")
        o["video_url"], media = url, {}
        for name in cfg.get("platforms", ["instagram", "youtube", "tiktok"]):
            try:
                pid = {"instagram": lambda: P.instagram_publish(url, caption),
                       "youtube": lambda: P.youtube_publish(str(vid), post["title"], caption, cfg.get("youtube_privacy", "private")),
                       "tiktok": lambda: P.tiktok_publish(str(vid), caption, cfg.get("tiktok_mode", "inbox"))}[name]()
            except Exception as e:
                print(f"[duel] reel {o['side']} on {name} FAILED: {e}"); continue
            if pid:
                media[name] = pid; print(f"[duel] reel {o['side']} -> {name} {pid}")
        o["media"] = media
    if not dry_run:
        sb.patch_rows("ng_duels", f"id=eq.{duel['id']}", {"options": duel["options"]})
    return True


def load_cfg():
    return config()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", type=int, required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true", help="ignore the approval gate")
    a = ap.parse_args()
    run(a.day, a.dry_run, a.force)
