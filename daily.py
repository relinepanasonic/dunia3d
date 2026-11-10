"""The daily loop (run at 00:01 Asia/Jakarta): yesterday's data -> today's episode -> dashboard -> upload.

  python daily.py [--day N] [--fixture stats/fixtures/day-03.json] [--offline] [--until script|render] [--no-upload] [--dry-run]

 1. restore the bible from Supabase (ng_state)            6. voice + render (pipeline.py)
 2. collect IG + YouTube + TikTok numbers -> one total      7. reports, snapshot, buildings, citizens -> dashboard
 3. tally polls that close today (votes come from comments) 8. upload to IG / YouTube / TikTok (gated by approval)
 4. update citizens' coins & influence
 5. write the script with Gemini (facts are computed here)
"""
import argparse, datetime as dt, json, subprocess, sys
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from common import SERIES, load_env, read_json, write_json, config, day_dir  # noqa: E402
import game  # noqa: E402
from stats.collect import collect  # noqa: E402
from sync import supabase_sync as sb  # noqa: E402


def today_day(cfg):
    start = dt.date.fromisoformat(cfg["start_date"])
    return (dt.datetime.now(ZoneInfo("Asia/Jakarta")).date() - start).days + 1


def restore_bible(day):
    """bible after day-1: from Supabase when connected, else the local file (must be at day-1)."""
    remote = sb.state_get(f"bible_after_{day-1}") if sb.configured() else None
    if remote:
        write_json(SERIES / "bible.json", remote)
        print(f"[loop] bible restored from Supabase (day {remote['day']})")
    b = read_json(SERIES / "bible.json")
    if b["day"] != day - 1:
        raise SystemExit(f"bible is at day {b['day']}, need {day-1}. Run earlier days first or pass --day.")
    return b


def run(day=None, fixture=None, offline=False, until="render", upload=True, dry=False):
    load_env()
    cfg = config()
    day = day or today_day(cfg)
    d = day_dir(day)
    print(f"[loop] === DAY {day} ===")
    bible = restore_bible(day)

    # ---- 2. numbers from every platform, combined
    data = collect(fixture)
    if data["combined"] is None:
        print("[loop] no platform connected -> using numbers entered on the dashboard (ng_inputs)")
        sb.pull()
        comments_in = read_json(SERIES / "comments.json")
        totals, comments, mentions, per_platform = comments_in["totals"], comments_in["comments"], [], {}
    else:
        totals, comments, mentions, per_platform = data["combined"], data["comments"], data["mentions"], data["per_platform"]
    top = sorted(comments, key=lambda c: -c.get("likes", 0))[:50]
    write_json(SERIES / "comments.json", {"totals": {k: totals[k] for k in ("followers", "likes", "shares", "comments")}, "comments": top})

    # ---- 3. polls that close today
    open_polls = sb.get("ng_polls?status=eq.open&select=*") if sb.configured() else []
    opts = {}
    if open_polls:
        ids = ",".join(str(p["id"]) for p in open_polls)
        for o in sb.get(f"ng_poll_options?poll_id=in.({ids})&select=*&order=idx"):
            opts.setdefault(o["poll_id"], []).append(o)
    poll_target, poll_reports, announce, new_votes, closed_ids = None, [], [], [], []
    for poll in open_polls:
        options = opts.get(poll["id"], [])
        if poll.get("closes_day") is not None and poll["closes_day"] <= day:
            existing = sb.get(f"ng_votes?poll_id=eq.{poll['id']}&select=platform,handle,option_idx,source_id")
            votes, counts, winner = game.tally(poll, options, comments, existing)
            building = game.poll_building(poll, options[winner], bible) if winner is not None else None
            poll_reports.append(game.poll_report(poll, options, counts, winner, building))
            for v in votes:
                v["poll_id"] = poll["id"]
            new_votes += votes
            if building and poll_target is None:
                poll_target = building
            closed_ids.append((poll, options, counts, winner, votes))
        else:
            letters = "  ".join(f"{chr(65+o['idx'])}) {o['label']}" for o in options)
            announce.append(f"POLLING TERBUKA: {poll['title']} - {poll['question']} Opsi: {letters}. "
                            f"Penonton voting dengan komen huruf/nama pilihan. Ditutup hari ke-{poll.get('closes_day')}.")

    # ---- 4. citizens: coins and influence (only what platforms expose)
    act = game.activity_rows(day, comments, mentions, new_votes)
    sb.upsert("ng_activity", act, "day,platform,handle")
    all_act = sb.get("ng_activity?select=*&limit=100000") if sb.configured() else act
    citizens = game.citizen_scores(all_act)

    # ---- 5/6. script, voice, render (pipeline stages)
    extra = []
    if poll_reports:
        extra.append("HASIL POLLING (hitungan sistem, wajib akurat):\n" + "\n\n".join(poll_reports))
    extra += announce
    if citizens:
        extra.append("WARGA TERPENGARUH: " + ", ".join(f"@{c['handle']} (pengaruh {c['pengaruh']}, koin {c['coins']})" for c in citizens[:3]))
    write_json(d / "context.json", {"poll_target": poll_target, "extra_facts": "\n".join(extra)})
    cmd = [sys.executable, "-I", str(ROOT / "pipeline.py"), "episode", "--day", str(day), "--until", until]
    if offline:
        cmd.append("--offline")
    subprocess.check_call(cmd, cwd=ROOT)

    # ---- 7. dashboard data
    plan, after, ep = read_json(d / "game_plan.json"), read_json(d / "bible.after.json"), read_json(d / "episode.json")
    report = game.daily_report(day, plan, poll_reports, citizens)
    write_json(d / "report.json", {"daily": report, "polls": poll_reports})
    if sb.configured() and not dry:
        s, t = plan["state"], after["totals"]
        sb.upsert("ng_snapshots", [{"day": day, "followers": t["followers"], "likes": t["likes"], "shares": t["shares"],
                                    "comments": t["comments"], "penduduk": s["penduduk"], "pajak": s["pajak"],
                                    "pengaruh": s["pengaruh"], "inspirasi": s["inspirasi_total"],
                                    "inspirasi_ep": s["inspirasi_episode"], "tier": plan["tier"], "score": plan["score"]}], "day")
        sb.upsert("ng_platform_stats", [{"day": day, "platform": n, **{k: v.get(k, 0) for k in ("followers", "likes", "shares", "comments", "views")}}
                                        for n, v in per_platform.items()], "day,platform")
        sb.upsert("ng_citizens", citizens, "platform,handle")
        cat = {b["id"]: b for b in game.catalog(after)}
        for b in after.get("custom_buildings", []):
            row = {"id": b["id"], "name": b["name"], "pajak": b["pajak"], "inspirasi": b["inspirasi"], "penduduk": b["penduduk"],
                   "pengaruh": b["pengaruh"], "slot": b["slot"], "style": b.get("style", 0), "custom": True, "poll_id": b.get("poll_id")}
            sb.upsert("ng_buildings", [row], "id")
        if plan["built_now"]:
            sb.patch_rows("ng_buildings", f"id=eq.{plan['built_now']['id']}", {"built_day": day, "built_at": "now()"})
        for poll, options, counts, winner, votes in closed_ids:
            sb.upsert("ng_votes", [{k: v[k] for k in ("poll_id", "platform", "handle", "option_idx", "source_id")} for v in votes], "poll_id,platform,handle")
            for o in options:
                sb.patch_rows("ng_poll_options", f"id=eq.{o['id']}", {"votes": counts.get(o["idx"], 0)})
            sb.patch_rows("ng_polls", f"id=eq.{poll['id']}", {"status": "closed", "winner_idx": winner,
                                                               "result": {"counts": counts, "total": sum(counts.values())}})
        sb.upsert("ng_reports", [{"day": day, "kind": "daily", "title": f"Laporan Negara Hari ke-{day}", "body": report,
                                  "data": {"plan": {k: plan[k] for k in ("delta", "state", "tier", "score")}}}], "day,kind")
        if poll_reports:
            sb.upsert("ng_reports", [{"day": day, "kind": "poll", "title": f"Hasil Polling (Day {day})",
                                      "body": "\n\n".join(poll_reports), "data": None}], "day,kind")
        sb.upsert("ng_episodes", [{"day": day, "title": ep["title"], "caption": ep["ig_caption"], "status": "draft"}], "day")
        sb.state_set(f"bible_after_{day}", after)
        if until == "render" and (d / "video.mp4").exists():
            from upload import platforms as P
            vurl = P.storage_upload(d / "video.mp4", f"day-{day:02d}-draft.mp4")
            sb.patch_rows("ng_episodes", f"day=eq.{day}", {"video_url": vurl})
        print("[loop] dashboard updated")
    else:
        print("[loop] Supabase not configured or --dry-run: dashboard not updated")

    # ---- 8. upload (approval-gated)
    if upload and until == "render":
        from upload import publish
        publish.run(day, dry_run=dry)
    print(report)
    return plan


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", type=int)
    ap.add_argument("--fixture")
    ap.add_argument("--offline", action="store_true", help="use script/fixtures instead of Gemini")
    ap.add_argument("--until", default="render", choices=["script", "timeline", "voice", "render"])
    ap.add_argument("--no-upload", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="no dashboard writes, no uploads")
    a = ap.parse_args()
    run(a.day, a.fixture, a.offline, a.until, not a.no_upload, a.dry_run)
