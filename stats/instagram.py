"""Instagram Graph API reader (Business/Creator account). NOT verified against a live account yet.

Env: IG_USER_ID, IG_ACCESS_TOKEN. Returns cumulative totals + commenters + mentions.
Limits (Meta): per-person likes/shares are not exposed; comments (with username, like_count) are;
accounts that tag you are exposed via /tags. Story mentions need a webhook (not handled here).
"""
import os
from common import http

G = "https://graph.facebook.com/v21.0"


def fetch(max_media=25):
    uid, tok = os.environ.get("IG_USER_ID"), os.environ.get("IG_ACCESS_TOKEN")
    if not (uid and tok):
        return None
    me = http("GET", f"{G}/{uid}?fields=followers_count&access_token={tok}")
    media = http("GET", f"{G}/{uid}/media?fields=id,like_count,comments_count,timestamp&limit={max_media}&access_token={tok}")["data"]
    tot = {"followers": me.get("followers_count", 0), "likes": 0, "shares": 0, "comments": 0, "views": 0}
    comments = []
    for m in media:
        tot["likes"] += m.get("like_count", 0); tot["comments"] += m.get("comments_count", 0)
        try:
            ins = http("GET", f"{G}/{m['id']}/insights?metric=shares,views&access_token={tok}")["data"]
            for i in ins:
                v = i["values"][0]["value"]
                tot["shares" if i["name"] == "shares" else "views"] += v
        except RuntimeError:
            pass  # some media types lack insights
        try:
            cs = http("GET", f"{G}/{m['id']}/comments?fields=id,text,username,like_count,timestamp&limit=100&access_token={tok}")["data"]
            comments += [{"platform": "instagram", "id": c["id"], "user": c.get("username", ""), "text": c.get("text", ""),
                          "likes": c.get("like_count", 0), "ts": c.get("timestamp", "")} for c in cs]
        except RuntimeError:
            pass
    mentions = []
    try:
        tags = http("GET", f"{G}/{uid}/tags?fields=username,timestamp&limit=100&access_token={tok}")["data"]
        mentions = [{"platform": "instagram", "handle": t["username"]} for t in tags if t.get("username")]
    except RuntimeError:
        pass
    return {"totals": tot, "comments": comments, "mentions": mentions}
