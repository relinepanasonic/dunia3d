"""Collect yesterday's numbers from every connected platform and combine them into one country input.

Each platform module returns None when its credentials are missing (skipped, with a notice).
`fixture` (a JSON path) replaces live calls entirely, for offline tests.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import read_json  # noqa: E402
import game  # noqa: E402
from stats import instagram, youtube, tiktok  # noqa: E402


def collect(fixture=None):
    if fixture:
        raw = read_json(fixture)["platforms"]
    else:
        raw = {}
        for name, mod in (("instagram", instagram), ("youtube", youtube), ("tiktok", tiktok)):
            try:
                r = mod.fetch()
            except RuntimeError as e:
                print(f"[stats] {name} FAILED: {e}"); r = None
            if r is None:
                print(f"[stats] {name}: not connected, skipped")
            else:
                raw[name] = r
    per_platform = {n: r["totals"] for n, r in raw.items()}
    combined = game.combine(per_platform) if per_platform else None
    comments = [c for r in raw.values() for c in r.get("comments", [])]
    mentions = [m for r in raw.values() for m in r.get("mentions", [])]
    return {"per_platform": per_platform, "combined": combined, "comments": comments, "mentions": mentions}
