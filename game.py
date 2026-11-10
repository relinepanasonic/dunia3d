"""Gamification engine (deterministic; the LLM only narrates the facts it produces).

Combined across Instagram + YouTube + TikTok:
  Follower = Penduduk, Like = Pajak (treasury), Share = Pengaruh, Comment = Inspirasi.
Individuals (citizens) only get what the platforms expose: comments, likes on their comments, mentions, poll votes.
"""
import re
from common import SERIES, read_json


def rules():
    return read_json(SERIES / "game.json")


def catalog(bible, g=None):
    g = g or rules()
    return g["buildings"] + list(bible.get("custom_buildings", []))


def tier_for(penduduk, g=None):
    g = g or rules()
    cur = g["tiers"][0]
    for t in g["tiers"]:
        if penduduk >= t["min_penduduk"]:
            cur = t
    return cur


def score(state, g=None):
    w = (g or rules())["score_weights"]
    return round(state["penduduk"] * w["penduduk"] + state["pajak"] * w["pajak"]
                 + state["pengaruh"] * w["pengaruh"] + state["inspirasi_total"] * w["inspirasi"])


# ---------------------------------------------------------------- platforms
def combine(per_platform, g=None):
    """per_platform = {name: {followers, likes, shares, comments, views}} -> one weighted total."""
    g = g or rules()
    out = {"followers": 0, "likes": 0, "shares": 0, "comments": 0, "views": 0}
    for name, t in per_platform.items():
        w = g["platforms"].get(name, {}).get("weight", 1.0)
        for k in out:
            out[k] += round(t.get(k, 0) * w)
    return out


# ---------------------------------------------------------------- polls
def _tokens(text):
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def vote_for(comment_text, options):
    """Index of the option this comment votes for, or None (no match / ambiguous)."""
    toks, low, hit = _tokens(comment_text), comment_text.lower(), set()
    for o in options:
        kws = [k.lower() for k in (o.get("keywords") or [])] + [str(o["idx"] + 1), chr(97 + o["idx"])]
        if any(k in toks for k in kws if len(k) <= 2) or any(k in low for k in kws if len(k) > 2) \
                or o["label"].lower() in low:
            hit.add(o["idx"])
    return hit.pop() if len(hit) == 1 else None


def tally(poll, options, comments, existing=None):
    """Count one vote per (platform, handle), earliest comment wins. Returns (votes, counts, winner_idx|None)."""
    seen = {(v["platform"], v["handle"]): v for v in (existing or [])}
    for c in sorted(comments, key=lambda c: c.get("ts", "")):
        key = (c.get("platform", "instagram"), c["user"])
        if key in seen:
            continue
        idx = vote_for(c["text"], options)
        if idx is not None:
            seen[key] = {"platform": key[0], "handle": key[1], "option_idx": idx, "source_id": str(c.get("id", ""))}
    votes = list(seen.values())
    counts = {o["idx"]: sum(1 for v in votes if v["option_idx"] == o["idx"]) for o in options}
    total = sum(counts.values())
    winner = None
    if total >= poll.get("quorum", 3):
        best = max(counts.values())
        winner = min(i for i, n in counts.items() if n == best)  # tie -> lower index
    return votes, counts, winner


def poll_building(poll, option, bible):
    n = len(bible.get("custom_buildings", []))
    return {"id": f"poll{poll['id']}_{option['idx']}", "name": option.get("building_name") or option["label"],
            "pajak": option.get("pajak", 100), "inspirasi": option.get("inspirasi", 0),
            "penduduk": option.get("penduduk", 0), "pengaruh": option.get("pengaruh", 0),
            "slot": 8 + n, "style": option.get("style", 0), "poll_id": poll["id"]}


# ---------------------------------------------------------------- citizens
def activity_rows(day, comments, mentions, votes, dividends=None):
    """Per-person activity for one day. comments: [{platform,user,likes}], mentions: [{platform,handle}]."""
    rows = {}
    def row(p, h):
        return rows.setdefault((p, h), {"day": day, "platform": p, "handle": h, "comments": 0,
                                        "comment_likes": 0, "mentions": 0, "votes": 0, "dividend": 0})
    for c in comments:
        r = row(c.get("platform", "instagram"), c["user"]); r["comments"] += 1; r["comment_likes"] += c.get("likes", 0)
    for m in mentions:
        row(m.get("platform", "instagram"), m["handle"])["mentions"] += 1
    for v in votes:
        row(v["platform"], v["handle"])["votes"] += 1
    for (p, h), amount in (dividends or {}).items():
        row(p, h)["dividend"] = amount
    return list(rows.values())


def citizen_scores(all_activity, g=None):
    c = (g or rules())["citizen"]
    people = {}
    for a in all_activity:
        p = people.setdefault((a["platform"], a["handle"]), {
            "platform": a["platform"], "handle": a["handle"], "comments": 0, "comment_likes": 0, "mentions": 0,
            "votes": 0, "dividend": 0, "first_day": a["day"], "last_day": a["day"]})
        for k in ("comments", "comment_likes", "mentions", "votes"):
            p[k] += a[k]
        p["dividend"] += a.get("dividend", 0)
        p["first_day"], p["last_day"] = min(p["first_day"], a["day"]), max(p["last_day"], a["day"])
    for p in people.values():
        p["coins"] = (p["comments"] * c["coin_per_comment"] + p["comment_likes"] * c["coin_per_comment_like"]
                      + p["votes"] * c["coin_per_vote"] + p["dividend"])
        del p["dividend"]  # already folded into coins (the per-day amounts live in ng_activity)
        p["pengaruh"] = p["mentions"] * c["pengaruh_per_mention"] + p["comment_likes"] // c["comment_likes_per_pengaruh"]
    return sorted(people.values(), key=lambda p: -p["pengaruh"])


# ---------------------------------------------------------------- economy: dividends + house upgrades
def dividend_pool(delta_likes, delta_shares, g=None):
    d = (g or rules())["economy"]["dividend"]
    return delta_likes * d["per_like"] + delta_shares * d["per_share"]


def dividends(pool, levels, g=None):
    """Split the pool over every citizen; weight = 1 + bonus*(level-1). levels: {(platform, handle): level}."""
    d = (g or rules())["economy"]["dividend"]
    if not levels:
        return {}
    w = {k: 1 + d["level_bonus"] * (lvl - 1) for k, lvl in levels.items()}
    tot = sum(w.values())
    return {k: int(pool * v / tot) for k, v in w.items()}


def upgrade(coins, spent, level, g=None):
    """Spend coins on the next house levels while affordable. Returns (level, spent)."""
    houses = (g or rules())["houses"]
    while level < len(houses) and coins - spent >= houses[level]["cost"]:
        spent += houses[level]["cost"]
        level += 1
    return level, spent


# ---------------------------------------------------------------- episode plan
def _match_building(comment, cat):
    text = comment["text"].lower()
    kw = {"kedai_nutrisi": ["warung", "kedai", "makan", "kafe", "cafe", "resto"],
          "menara_energi": ["energi", "listrik", "menara", "power", "tenaga"],
          "stasiun_maglev": ["kereta", "maglev", "stasiun", "transport", "mrt"],
          "klinik_hologram": ["rumah sakit", "klinik", "dokter", "kesehatan"],
          "kampus_ai": ["kampus", "sekolah", "universitas", "kuliah"],
          "kedutaan": ["kedutaan", "diplomat", "embassy"],
          "stadion_hover": ["stadion", "bola", "olahraga", "arena"],
          "pelabuhan_orbit": ["pelabuhan", "roket", "bandara", "orbit", "luar angkasa"]}
    for b in cat:
        if any(k in text for k in kw.get(b["id"], [])):
            return b
    return None


def plan(bible, totals, comments, poll_target=None):
    """This episode's facts. `totals` = combined cumulative numbers {followers, likes, shares, comments}."""
    g = rules()
    cat = catalog(bible, g)
    prev = bible.get("totals", {"followers": 0, "likes": 0, "shares": 0, "comments": 0})
    delta = {k: max(0, totals.get(k, 0) - prev.get(k, 0)) for k in ("followers", "likes", "shares", "comments")}
    k = g["kpis"]
    state = {
        "penduduk": totals.get("followers", 0) * k["penduduk"]["per"] + 1,  # +1 = the president
        "pajak": bible.get("pajak", 0) + delta["likes"] * k["pajak"]["per"],
        "pengaruh": bible.get("pengaruh", 0) + delta["shares"] * k["pengaruh"]["per"],
        "inspirasi_episode": delta["comments"] * k["inspirasi"]["per"],
        "inspirasi_total": bible.get("inspirasi", 0) + delta["comments"] * k["inspirasi"]["per"],
    }
    built = set(bible.get("buildings_built", []))
    ranked = sorted(comments, key=lambda c: -c.get("likes", 0))
    target, top_comment, source = None, None, "komen"
    pending = poll_target or bible.get("pending_target")
    if pending and pending["id"] not in built:
        target, source = pending, "poll"
    else:
        for c in ranked:
            b = _match_building(c, [b for b in cat if b["id"] not in built])
            if b:
                target, top_comment = b, c; break
        if target is None:
            left = [b for b in cat if b["id"] not in built]
            target = left[0] if left else None
    result = {"delta": delta, "state": state, "tier": tier_for(state["penduduk"], g)["name"], "top_comment": top_comment,
              "target": target, "target_source": source, "built_now": None, "shortfall": {}}
    if target:
        need = {"pajak": target["pajak"] - state["pajak"], "inspirasi": target["inspirasi"] - state["inspirasi_episode"],
                "penduduk": target["penduduk"] - state["penduduk"], "pengaruh": target["pengaruh"] - state["pengaruh"]}
        short = {a: v for a, v in need.items() if v > 0}
        result["shortfall"] = short
        if not short:
            result["built_now"] = target
            state["pajak"] -= target["pajak"]
    result["score"] = score(state, g)
    return result


def apply(bible, totals, p, story):
    """New bible after the episode (numbers are deterministic; `story` carries LLM prose)."""
    s, g = p["state"], rules()
    custom = list(bible.get("custom_buildings", []))
    tgt = p["target"]
    if tgt and tgt.get("poll_id") is not None and tgt["id"] not in {c["id"] for c in custom}:
        custom.append(tgt)
    bb = dict(bible, custom_buildings=custom)
    cat = {b["id"]: b for b in catalog(bb, g)}
    built = list(bible.get("buildings_built", []))
    if p["built_now"]:
        built.append(p["built_now"]["id"])
    pending = None if p["built_now"] else (tgt if p["target_source"] == "poll" else bible.get("pending_target"))
    new = dict(bible)
    new.update({"totals": {k: totals.get(k, 0) for k in ("followers", "likes", "shares", "comments")},
                "population": s["penduduk"], "followers": totals.get("followers", 0), "pajak": s["pajak"],
                "pengaruh": s["pengaruh"], "inspirasi": s["inspirasi_total"], "tier": p["tier"], "score": p["score"],
                "buildings_built": built, "buildings": [cat[i]["name"] for i in built],
                "custom_buildings": custom, "pending_target": pending})
    new["scene"] = dict(bible.get("scene", {}), houses=len(built), styles=[cat[i].get("style", 0) for i in built])
    new.update(story)
    return new


# ---------------------------------------------------------------- reports
def poll_report(poll, options, counts, winner, building=None):
    total = sum(counts.values())
    lines = [f"LAPORAN POLLING: {poll['title']}", poll["question"], ""]
    for o in options:
        n = counts.get(o["idx"], 0)
        pct = round(100 * n / total) if total else 0
        mark = " <- PEMENANG" if winner == o["idx"] else ""
        lines.append(f"- {o['label']}: {n} suara ({pct}%){mark}")
    lines.append("")
    if winner is None:
        lines.append(f"Kuorum {poll.get('quorum', 3)} suara belum tercapai ({total} suara). Polling tidak menghasilkan "
                     f"{'nama baru' if poll.get('kind') == 'name' else 'bangunan'}.")
    elif poll.get("kind") == "name":
        opt = next(o for o in options if o["idx"] == winner)
        lines.append(f"Hasil: '{opt['label']}' menang dari {total} suara. Mulai sekarang nama negara ini: {opt['label']}.")
    else:
        opt = next(o for o in options if o["idx"] == winner)
        lines.append(f"Hasil: {opt['label']} menang dari {total} suara. Bangunan: {building['name']} "
                     f"(biaya pajak {building['pajak']}).")
    return "\n".join(lines)


def daily_report(day, p, polls_closed, top_citizens, economy=None):
    s, d = p["state"], p["delta"]
    lines = [f"LAPORAN NEGARA HARI KE-{day}", f"Tier: {p['tier']}  |  Skor Negara: {p['score']}", "",
             f"Penduduk {s['penduduk']} (+{d['followers']}), Kas pajak {s['pajak']} (+{d['likes']} like), "
             f"Pengaruh {s['pengaruh']} (+{d['shares']} share), Inspirasi hari ini {s['inspirasi_episode']} komen."]
    if p["built_now"]:
        lines.append(f"Dibangun: {p['built_now']['name']}.")
    elif p["target"]:
        lines.append(f"Target: {p['target']['name']} - belum cukup, kurang {p['shortfall']}.")
    for r in polls_closed:
        lines += ["", r]
    if economy:
        lines += ["", economy]
    if top_citizens:
        lines += ["", "Warga berpengaruh: " + ", ".join(f"@{c['handle']} ({c['pengaruh']})" for c in top_citizens[:3])]
    return "\n".join(lines)
