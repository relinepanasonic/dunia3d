"""Sync between the pipeline and the Supabase dashboard (service-role key, server side only).

  push: out/day-XX/* -> ng_snapshots / ng_buildings / ng_episodes
  pull: ng_inputs (latest IG totals) + approved ng_comments -> series/comments.json

Env: SUPABASE_URL, SUPABASE_SERVICE_KEY. Without them the functions print what they would do.
"""
import json, os, sys, urllib.parse, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import SERIES, read_json, write_json, day_dir, load_env  # noqa: E402


def _req(method, path, body=None, prefer=None):
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        print(f"[supabase] not configured; would {method} {path}")
        return None
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{url}/rest/v1/{path}", data=data, method=method, headers=headers)
    with urllib.request.urlopen(r, timeout=30) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def push(day):
    load_env()
    d = day_dir(day)
    plan, after, ep = read_json(d / "game_plan.json"), read_json(d / "bible.after.json"), read_json(d / "episode.json")
    t, s = after["totals"], plan["state"]
    _req("POST", "ng_snapshots?on_conflict=day", [{
        "day": day, "followers": t["followers"], "likes": t["likes"], "shares": t["shares"], "comments": t["comments"],
        "penduduk": s["penduduk"], "pajak": s["pajak"],  # treasury after spending
        "pengaruh": s["pengaruh"], "inspirasi": s["inspirasi_total"], "inspirasi_ep": s["inspirasi_episode"],
        "tier": plan["tier"]}], prefer="resolution=merge-duplicates")
    if plan["built_now"]:
        _req("PATCH", f"ng_buildings?id=eq.{urllib.parse.quote(plan['built_now']['id'])}",
             {"built_day": day, "built_at": "now()"})
    _req("POST", "ng_episodes?on_conflict=day", [{
        "day": day, "title": ep["title"], "caption": ep["ig_caption"], "status": "draft"}],
        prefer="resolution=merge-duplicates")
    print(f"[supabase] pushed day {day}")


def pull():
    load_env()
    inp = _req("GET", "ng_inputs?select=*&order=created_at.desc&limit=1")
    cms = _req("GET", "ng_comments?select=ig_user,text,likes&status=eq.approved&order=likes.desc&limit=50")
    if not inp:
        print("[supabase] no inputs pulled; series/comments.json unchanged"); return
    i = inp[0]
    write_json(SERIES / "comments.json", {
        "totals": {k: i[k] for k in ("followers", "likes", "shares", "comments")},
        "comments": [{"user": c["ig_user"], "text": c["text"], "likes": c["likes"]} for c in (cms or [])]})
    print("[supabase] series/comments.json updated from dashboard")


if __name__ == "__main__":
    cmd = sys.argv[1]
    push(int(sys.argv[2])) if cmd == "push" else pull()


# ================================================================= full-loop helpers
def configured():
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY"))


def get(path):
    return _req("GET", path) if configured() else []


def upsert(table, rows, conflict):
    if rows:
        _req("POST", f"{table}?on_conflict={conflict}", rows, prefer="resolution=merge-duplicates")


def patch_rows(table, query, body):
    _req("PATCH", f"{table}?{query}", body)


def state_get(key):
    r = get(f"ng_state?key=eq.{urllib.parse.quote(key)}&select=value")
    return r[0]["value"] if r else None


def state_set(key, value):
    upsert("ng_state", [{"key": key, "value": value, "updated_at": "now()"}], "key")
