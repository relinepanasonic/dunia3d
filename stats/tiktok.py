"""TikTok Display API reader. NOT verified against a live account yet.

Env: TT_CLIENT_KEY, TT_CLIENT_SECRET, TT_REFRESH_TOKEN (scopes: user.info.stats, video.list, video.upload).
TikTok exposes aggregate counts only: no comment text/usernames (those need the Research API), so TikTok adds to the
country totals but not to the citizen leaderboard.
"""
import os
from common import http

API = "https://open.tiktokapis.com/v2"


def access_token():
    k, s, rt = (os.environ.get(x) for x in ("TT_CLIENT_KEY", "TT_CLIENT_SECRET", "TT_REFRESH_TOKEN"))
    if not (k and s and rt):
        return None
    return http("POST", f"{API}/oauth/token/", form={"client_key": k, "client_secret": s, "grant_type": "refresh_token",
                                                    "refresh_token": rt})["access_token"]


def fetch(max_videos=20):
    tok = access_token()
    if not tok:
        return None
    H = {"Authorization": f"Bearer {tok}"}
    u = http("GET", f"{API}/user/info/?fields=follower_count,likes_count", H)["data"]["user"]
    tot = {"followers": u.get("follower_count", 0), "likes": 0, "shares": 0, "comments": 0, "views": 0}
    vids = http("POST", f"{API}/video/list/?fields=id,like_count,comment_count,share_count,view_count", H,
                json_body={"max_count": max_videos})["data"].get("videos", [])
    for v in vids:
        tot["likes"] += v.get("like_count", 0); tot["comments"] += v.get("comment_count", 0)
        tot["shares"] += v.get("share_count", 0); tot["views"] += v.get("view_count", 0)
    return {"totals": tot, "comments": [], "mentions": []}
