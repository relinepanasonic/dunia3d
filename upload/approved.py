"""Post every episode approved on the dashboard that is not published yet (video comes from Supabase Storage)."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from common import load_env, write_json, day_dir, http  # noqa: E402
from sync import supabase_sync as sb  # noqa: E402
from upload import publish  # noqa: E402

load_env()
if not sb.configured():
    raise SystemExit("Supabase not configured")
for ep in sb.get("ng_episodes?status=eq.approved&select=day,title,caption,video_url&order=day"):
    d = day_dir(ep["day"])
    if not ep.get("video_url"):
        print(f"day {ep['day']}: no video_url yet, skipping"); continue
    body, _ = http("GET", ep["video_url"], raw=True, timeout=600)
    (d / "video.mp4").write_bytes(body)
    if not (d / "post.json").exists():
        write_json(d / "post.json", {"caption": ep["caption"] or "", "hashtags": ["#negarague"], "title": ep["title"] or f"Day {ep['day']}"})
    publish.run(ep["day"])
