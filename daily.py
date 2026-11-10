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
import duel as duel_mod  # noqa: E402
from stats.collect import collect  # noqa: E402
from sync import supabase_sync as sb  # noqa: E402


def safe_get(path):
    """Read from Supabase; a missing table (migration not run yet) must not stop the daily job."""
    if not sb.configured():
        return []
    try:
        return sb.get(path)
    except RuntimeError as e:
        print(f"[loop] WARNING: could not read {path.split('?')[0]}: {str(e)[:100]}")
        return []


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
    brand = sb.state_get("brand") if sb.configured() else None
    if brand and brand.get("name"):  # the country name chosen by citizens (or set by an admin)
        write_json(SERIES / "brand.json", brand)
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
    poll_target, poll_reports, announce, new_votes, closed_ids, new_name = None, [], [], [], [], None
    for poll in open_polls:
        options = opts.get(poll["id"], [])
        if poll.get("closes_day") is not None and poll["closes_day"] <= day:
            existing = sb.get(f"ng_votes?poll_id=eq.{poll['id']}&select=platform,handle,option_idx,source_id")
            votes, counts, winner = game.tally(poll, options, comments, existing)
            is_name = poll.get("kind") == "name"
            building = game.poll_building(poll, options[winner], bible) if (winner is not None and not is_name) else None
            if is_name and winner is not None and new_name is None:
                new_name = options[winner]["label"].strip()
            poll_reports.append(game.poll_report(poll, options, counts, winner, building))
            for v in votes:
                v["poll_id"] = poll["id"]
            new_votes += votes
            if building and poll_target is None:
                poll_target = building
            closed_ids.append((poll, options, counts, winner, votes))
        else:
            letters = "  ".join(f"{chr(65+o['idx'])}) {o['label']}" for o in options)
            announce.append(f"{'POLLING NAMA NEGARA' if poll.get('kind') == 'name' else 'POLLING TERBUKA'}: {poll['title']} - {poll['question']} Opsi: {letters}. "
                            f"Penonton voting dengan komen huruf/nama pilihan. Ditutup hari ke-{poll.get('closes_day')}.")

    if new_name and not dry:
        write_json(SERIES / "brand.json", {"name": new_name, "since_day": day})
        if sb.configured():
            sb.state_set("brand", {"name": new_name, "since_day": day})
        print(f"[loop] country name is now: {new_name}")
    elif new_name:
        write_json(SERIES / "brand.json", {"name": new_name, "since_day": day})
    if new_name:
        announce.append(f"NAMA NEGARA BARU: {new_name}. Mulai sekarang negara ini bernama {new_name}; sebut nama baru ini dengan jelas di video.")

    # ---- 3b. week-1 duel: yesterday's two reels -> winner by likes -> today's build (free; likes were the price)
    g = game.rules()
    fx = read_json(fixture) if fixture else {}
    duel_target, duel_closed = None, None
    prev_duel = fx.get("duel_prev") or (safe_get(f"ng_duels?day=eq.{day-1}&status=eq.open&select=*") or [None])[0]
    if prev_duel:
        res = game.resolve_duel(prev_duel, duel_mod.read_likes(prev_duel, fx.get("duel_likes")))
        if res["built"]:
            duel_target = game.duel_building(prev_duel, res["winner"])
        poll_reports.append(game.duel_report(prev_duel, res))
        duel_closed = (prev_duel, res)
        print(f"[duel] {res['reason']} (winner {res['winner']})")

    # ---- 4. citizens: coins and influence (only what platforms expose)
    if sb.configured() and not dry:  # citizens who comment their NG-code link their web account to that handle
        from sync import claims
        for acct, cm in claims.find_claims(comments):
            claims.apply_claim(acct, cm)
    prev_tot = bible.get("totals", {})
    pool = game.dividend_pool(max(0, totals["likes"] - prev_tot.get("likes", 0)), max(0, totals["shares"] - prev_tot.get("shares", 0)))
    existing = {(c["platform"], c["handle"]): c for c in sb.get("ng_citizens?select=platform,handle,level,spent,owner")} if sb.configured() else {}
    keys = set(existing) | {(c.get("platform", "instagram"), c["user"]) for c in comments} \
        | {(m.get("platform", "instagram"), m["handle"]) for m in mentions} | {(v["platform"], v["handle"]) for v in new_votes}
    divs = game.dividends(pool, {k: existing.get(k, {}).get("level", 1) for k in keys})
    act = game.activity_rows(day, comments, mentions, new_votes, divs)
    if not dry:
        sb.upsert("ng_activity", act, "day,platform,handle")
    all_act = sb.get("ng_activity?select=*&limit=100000") if sb.configured() else act
    citizens = game.citizen_scores(all_act)
    upgrades = []
    for c in citizens:  # free pod for everyone; upgrade automatically when affordable (until citizens can spend in the web app)
        ex = existing.get((c["platform"], c["handle"]), {})
        if ex.get("owner"):  # account owners upgrade themselves in the web app
            c["level"], c["spent"] = ex.get("level", 1), ex.get("spent", 0)
            continue
        lvl, spent = game.upgrade(c["coins"], ex.get("spent", 0), ex.get("level", 1))
        if lvl > ex.get("level", 1):
            upgrades.append(f"@{c['handle']} -> level {lvl}")
        c["level"], c["spent"] = lvl, spent
    new_pods = sorted(k[1] for k in keys if k not in existing)
    economy = (f"EKONOMI: dividen pajak hari ini {int(pool)} koin dibagi ke {len(keys)} warga; "
               f"{len(new_pods)} rumah pod gratis baru; upgrade rumah: {', '.join(upgrades) if upgrades else 'belum ada'}.")

    # ---- 5/6. script, voice, render (pipeline stages)
    extra = []
    if poll_reports:
        extra.append("HASIL POLLING (hitungan sistem, wajib akurat):\n" + "\n\n".join(poll_reports))
    extra += announce
    extra.append(economy + " (Setiap warga dapat rumah pod gratis; like+share menjadi dividen untuk semua warga; rumah bisa di-upgrade dengan koin.)")
    if citizens:
        extra.append("WARGA TERPENGARUH: " + ", ".join(f"@{c['handle']} (pengaruh {c['pengaruh']}, koin {c['coins']})" for c in citizens[:3]))
    if duel_closed:
        pd, rs = duel_closed
        wn = next(o for o in pd["options"] if o["side"] == rs["winner"])["name"]
        extra.append(f"HASIL DUEL (hitungan sistem): {rs['likes']['A']} like untuk A, {rs['likes']['B']} like untuk B, minimal {pd['min_likes']}. "
                     + (f"{wn} menang dan dibangun GRATIS." if rs["built"] else f"{wn} unggul tapi belum capai minimal, pembangunan ditunda."))
    if game.duel_enabled(day, g):
        extra.append("MINGGU DUEL: bangunan hanya dibangun lewat duel dua reel presentasi (A vs B); like terbanyak menang jika capai minimal. "
                     "Ajak penonton like reel presentasi hari ini untuk memilih. Pajak tidak dipakai minggu ini.")
    write_json(d / "context.json", {"poll_target": poll_target, "duel_target": duel_target,
                                    "disable_auto": game.duel_enabled(day, g), "extra_facts": "\n".join(extra)})
    cmd = [sys.executable, "-I", str(ROOT / "pipeline.py"), "episode", "--day", str(day), "--until", until]
    if offline:
        cmd.append("--offline")
    subprocess.check_call(cmd, cwd=ROOT)

    # ---- 7. dashboard data
    plan, after, ep = read_json(d / "game_plan.json"), read_json(d / "bible.after.json"), read_json(d / "episode.json")
    report = game.daily_report(day, plan, poll_reports, citizens, economy)
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

    # ---- 7b. today's duel: two presentation reels (only in duel week, only when we really render)
    if game.duel_enabled(day, g) and until == "render":
        planned = (safe_get(f"ng_duels?day=eq.{day}&select=*") or [None])[0]
        cands = game.pick_candidates(after, 2, g)
        if planned and planned.get("status") in ("planned", "open"):
            duel = dict(planned)
            duel["options"] = [dict(game.duel_option({"id": o.get("building_id", f"custom{i}"), "name": o["name"], "style": o.get("style", 0),
                                                       "pitch": o.get("pitch") or None}, o["side"], bool(o.get("custom"))), **{k: o[k] for k in o if k in ("video_url", "media")}) for i, o in enumerate(planned["options"])]
        elif len(cands) == 2:
            duel = {"day": day, "min_likes": game.duel_min_likes(totals["followers"], g), "followers_at_start": totals["followers"],
                    "options": [game.duel_option(cands[0], "A"), game.duel_option(cands[1], "B")]}
        else:
            duel = None
            print("[duel] fewer than two unbuilt buildings left; no duel today")
        if duel:
            print(f"[duel] reels for day {day}: {duel['options'][0]['name']} vs {duel['options'][1]['name']} (minimum {duel['min_likes']} like)")
            vids = duel_mod.make_reels(day, duel, d)
            if sb.configured() and not dry:
                from upload import platforms as P
                for o in duel["options"]:
                    o["video_url"] = P.storage_upload(vids[o["side"]], f"day-{day:02d}-duel-{o['side'].lower()}-draft.mp4")
                sb.upsert("ng_duels", [{"day": day, "status": "open", "min_likes": duel["min_likes"],
                                        "followers_at_start": duel.get("followers_at_start", totals["followers"]), "options": duel["options"]}], "day")
            write_json(d / "duel.json", duel)
        if duel_closed and sb.configured() and not dry:
            pd, rs = duel_closed
            sb.patch_rows("ng_duels", f"id=eq.{pd['id']}", {"status": "resolved", "winner": rs["winner"], "result": rs})

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
