"""Like counters of specific posts (the two duel reels). NOT verified against live accounts yet.

media = {'instagram': '<media id>', 'youtube': '<video id>', 'tiktok': '<video id>'} -> total likes over the platforms
that are connected. Missing credentials -> that platform counts 0 (and is reported).
"""
import os
from common import http

G = "https://graph.facebook.com/v21.0"


def instagram_likes(media_id):
    tok = os.environ.get("IG_ACCESS_TOKEN")
    if not tok:
        return None
    return int(http("GET", f"{G}/{media_id}?fields=like_count&access_token={tok}").get("like_count", 0))


def youtube_likes(video_id):
    from stats.youtube import access_token
    tok = access_token()
    if not tok:
        return None
    items = http("GET", f"https://www.googleapis.com/youtube/v3/videos?part=statistics&id={video_id}", {"Authorization": f"Bearer {tok}"}).get("items", [])
    return int(items[0]["statistics"].get("likeCount", 0)) if items else 0


def tiktok_likes(video_id):
    from stats.tiktok import access_token, API
    tok = access_token()
    if not tok:
        return None
    r = http("POST", f"{API}/video/query/?fields=id,like_count", {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
             json_body={"filters": {"video_ids": [video_id]}})
    vids = r.get("data", {}).get("videos", [])
    return int(vids[0].get("like_count", 0)) if vids else 0


FETCH = {"instagram": instagram_likes, "youtube": youtube_likes, "tiktok": tiktok_likes}


def total_likes(media):
    """Sum a reel's likes over platforms. Returns (total, {platform: likes or error string})."""
    total, detail = 0, {}
    for plat, mid in (media or {}).items():
        if not mid or plat not in FETCH:
            continue
        try:
            n = FETCH[plat](mid)
        except RuntimeError as e:
            detail[plat] = f"error: {str(e)[:80]}"; continue
        if n is None:
            detail[plat] = "not connected"; continue
        detail[plat] = n; total += n
    return total, detail
