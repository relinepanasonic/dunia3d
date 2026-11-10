"""Upload adapters: Supabase Storage (public URL), Instagram Reels, YouTube Shorts, TikTok. NOT verified live yet.

Platform audit limits: YouTube (unverified API project) and TikTok (unaudited app) only allow PRIVATE uploads;
TikTok drafts go to the in-app inbox and you tap Publish. Until audits pass, set privacy accordingly (default private).
"""
import json, os, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import http  # noqa: E402

G = "https://graph.facebook.com/v21.0"


# ---------------------------------------------------------------- Supabase Storage
def storage_upload(path, name, bucket="reels"):
    url, key = os.environ["SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SERVICE_KEY"]
    http("POST", f"{url}/storage/v1/object/{bucket}/{name}", {"apikey": key, "Authorization": f"Bearer {key}",
                                                              "Content-Type": "video/mp4", "x-upsert": "true"},
         data=Path(path).read_bytes(), timeout=600)
    return f"{url}/storage/v1/object/public/{bucket}/{name}"


# ---------------------------------------------------------------- Instagram Reels (container -> poll -> publish)
def instagram_publish(video_url, caption, poll_seconds=600):
    uid, tok = os.environ.get("IG_USER_ID"), os.environ.get("IG_ACCESS_TOKEN")
    if not (uid and tok):
        return None
    c = http("POST", f"{G}/{uid}/media", form={"media_type": "REELS", "video_url": video_url, "caption": caption,
                                              "share_to_feed": "true", "access_token": tok})["id"]
    t0 = time.time()
    while time.time() - t0 < poll_seconds:
        st = http("GET", f"{G}/{c}?fields=status_code,status&access_token={tok}")
        if st["status_code"] == "FINISHED":
            break
        if st["status_code"] in ("ERROR", "EXPIRED"):
            raise RuntimeError(f"Instagram container {st}")
        time.sleep(10)
    else:
        raise RuntimeError("Instagram container not ready in time")
    return http("POST", f"{G}/{uid}/media_publish", form={"creation_id": c, "access_token": tok})["id"]


# ---------------------------------------------------------------- YouTube Shorts (resumable upload)
def youtube_publish(path, title, description, privacy="private"):
    from stats.youtube import access_token
    tok = access_token()
    if not tok:
        return None
    size = Path(path).stat().st_size
    meta = {"snippet": {"title": title[:95] + (" #Shorts" if "#shorts" not in title.lower() else ""),
                        "description": description + "\n#Shorts", "categoryId": "24"},
            "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": False}}
    _, hdr = http("POST", "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
                  {"Authorization": f"Bearer {tok}", "X-Upload-Content-Type": "video/mp4",
                   "X-Upload-Content-Length": str(size)}, json_body=meta, raw=True)
    loc = next(v for k, v in hdr.items() if k.lower() == "location")
    res = http("PUT", loc, {"Content-Type": "video/mp4"}, data=Path(path).read_bytes(), timeout=900)
    return res["id"]


# ---------------------------------------------------------------- TikTok (inbox draft by default)
def tiktok_publish(path, caption, mode="inbox"):
    from stats.tiktok import access_token, API
    tok = access_token()
    if not tok:
        return None
    size = Path(path).stat().st_size
    H = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json; charset=UTF-8"}
    src = {"source": "FILE_UPLOAD", "video_size": size, "chunk_size": size, "total_chunk_count": 1}
    if mode == "inbox":
        r = http("POST", f"{API}/post/publish/inbox/video/init/", H, json_body={"source_info": src})["data"]
    else:  # direct post; unaudited apps can only use SELF_ONLY
        r = http("POST", f"{API}/post/publish/video/init/", H, json_body={
            "post_info": {"title": caption[:150], "privacy_level": os.environ.get("TT_PRIVACY", "SELF_ONLY")},
            "source_info": src})["data"]
    http("PUT", r["upload_url"], {"Content-Type": "video/mp4", "Content-Range": f"bytes 0-{size-1}/{size}"},
         data=Path(path).read_bytes(), timeout=900)
    return r["publish_id"]
