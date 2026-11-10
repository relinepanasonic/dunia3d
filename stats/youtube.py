"""YouTube Data/Analytics API reader. NOT verified against a live channel yet.

Env: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN (OAuth, scopes: youtube.readonly, yt-analytics.readonly, youtube.upload).
Shares come from the Analytics API (the Data API has no share count).
"""
import datetime as dt, os
from common import http


def access_token():
    cid, sec, rt = (os.environ.get(k) for k in ("YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN"))
    if not (cid and sec and rt):
        return None
    return http("POST", "https://oauth2.googleapis.com/token", form={
        "client_id": cid, "client_secret": sec, "refresh_token": rt, "grant_type": "refresh_token"})["access_token"]


def fetch(max_videos=25):
    tok = access_token()
    if not tok:
        return None
    H = {"Authorization": f"Bearer {tok}"}
    ch = http("GET", "https://www.googleapis.com/youtube/v3/channels?part=statistics,contentDetails&mine=true", H)["items"][0]
    st = ch["statistics"]
    tot = {"followers": int(st.get("subscriberCount", 0)), "likes": 0, "shares": 0, "comments": 0, "views": int(st.get("viewCount", 0))}
    uploads = ch["contentDetails"]["relatedPlaylists"]["uploads"]
    ids = [i["contentDetails"]["videoId"] for i in http(
        "GET", f"https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId={uploads}&maxResults={max_videos}", H)["items"]]
    comments = []
    if ids:
        vids = http("GET", f"https://www.googleapis.com/youtube/v3/videos?part=statistics&id={','.join(ids)}", H)["items"]
        for v in vids:
            tot["likes"] += int(v["statistics"].get("likeCount", 0)); tot["comments"] += int(v["statistics"].get("commentCount", 0))
        for vid in ids:
            try:
                th = http("GET", f"https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId={vid}&maxResults=100&order=time", H)["items"]
                for t in th:
                    s = t["snippet"]["topLevelComment"]["snippet"]
                    comments.append({"platform": "youtube", "id": t["id"], "user": s["authorDisplayName"].lstrip("@"),
                                     "text": s["textOriginal"], "likes": int(s.get("likeCount", 0)), "ts": s["publishedAt"]})
            except RuntimeError:
                pass  # comments disabled on a video
    try:
        today = dt.date.today().isoformat()
        rep = http("GET", "https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==MINE&metrics=shares"
                          f"&startDate=2020-01-01&endDate={today}", H)
        tot["shares"] = int(rep["rows"][0][0]) if rep.get("rows") else 0
    except RuntimeError:
        pass
    return {"totals": tot, "comments": comments, "mentions": []}
