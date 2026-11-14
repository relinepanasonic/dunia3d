"""Manual mode: numbers and comments typed into the admin page, for platforms whose API is not connected yet.

  ng_manual_stats  one row per (day, platform) with the account totals read from the app
  ng_comments      comments copied by hand (status 'approved'); used_day marks the run that already counted them
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sync import supabase_sync as sb  # noqa: E402

KEYS = ("followers", "likes", "shares", "comments", "views")


def platform_totals(day):
    """{platform: totals}: the newest manual row per platform with row.day <= day (totals are cumulative)."""
    if not sb.configured():
        return {}
    try:
        rows = sb.get(f"ng_manual_stats?day=lte.{day}&select=*&order=day.desc,updated_at.desc")
    except Exception as e:  # missing table or network: manual mode simply off
        print(f"[manual] could not read ng_manual_stats (migration 0007 not run?): {str(e)[:100]}")
        return {}
    out = {}
    for r in rows or []:
        if r["platform"] not in out:
            out[r["platform"]] = {k: int(r.get(k) or 0) for k in KEYS}
            print(f"[manual] {r['platform']}: numbers from day {r['day']} " + ", ".join(f"{k}={out[r['platform']][k]}" for k in KEYS))
    return out


def new_comments():
    """Approved hand-entered comments that no run has counted yet."""
    if not sb.configured():
        return []
    try:
        rows = sb.get("ng_comments?status=eq.approved&used_day=is.null&select=id,platform,ig_user,text,likes,created_at&order=created_at&limit=1000")
    except Exception as e:  # missing table or network: manual mode simply off
        print(f"[manual] could not read ng_comments: {str(e)[:100]}")
        return []
    return [{"id": f"manual{r['id']}", "_row": r["id"], "platform": r.get("platform") or "instagram",
             "user": r["ig_user"].lstrip("@").strip(), "text": r["text"], "likes": int(r.get("likes") or 0),
             "ts": r.get("created_at", "")} for r in rows or []]


def mark_used(comments, day):
    ids = [str(c["_row"]) for c in comments if c.get("_row") is not None]
    if ids and sb.configured():
        sb.patch_rows("ng_comments", f"id=in.({','.join(ids)})", {"used_day": day})
