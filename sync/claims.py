"""Link web-app accounts to Instagram/YouTube handles: a citizen comments their code (NG-XXXXXX) on a reel."""
import re, urllib.parse
from sync import supabase_sync as sb

CODE = re.compile(r"NG-[A-Z0-9]{6}")
ADD = ("comments", "comment_likes", "mentions", "votes", "dividend")


def find_claims(comments):
    """[(account_row, comment)] for unverified accounts whose code appears in a comment (first use wins)."""
    accts = {a["claim_code"]: a for a in sb.get("ng_accounts?select=user_id,claim_code,citizen_id&verified=eq.false")}
    out = []
    for c in comments:
        for code in CODE.findall(c["text"].upper()):
            if code in accts:
                out.append((accts.pop(code), c))
    return out


def apply_claim(acct, comment, bonus=50):
    """Move the account's pod (level, spent, activity) onto the claimed platform handle and mark it verified."""
    platform, handle = comment.get("platform", "instagram"), comment["user"]
    web = sb.get(f"ng_citizens?id=eq.{acct['citizen_id']}&select=id,handle,level,spent")[0]
    sb.upsert("ng_citizens", [{"platform": platform, "handle": handle}], "platform,handle")
    q = urllib.parse.quote(handle)
    ig = sb.get(f"ng_citizens?platform=eq.{platform}&handle=eq.{q}&select=id,level,spent,owner")[0]
    if ig.get("owner") and ig["owner"] != acct["user_id"]:
        print(f"[claim] @{handle} already belongs to another account; ignored"); return False
    # carry the per-day activity (coins/dividends) over so the web pod is not recreated by the next recompute
    wq = urllib.parse.quote(web["handle"])
    mine = {r["day"]: r for r in sb.get(f"ng_activity?platform=eq.{platform}&handle=eq.{q}&select=*")}
    for r in sb.get(f"ng_activity?platform=eq.web&handle=eq.{wq}&select=*"):
        tgt = mine.get(r["day"])
        row = {k: v for k, v in r.items() if k != "id"}
        row.update(platform=platform, handle=handle)
        if tgt:
            for k in ADD:
                row[k] = tgt.get(k, 0) + r.get(k, 0)
        sb.upsert("ng_activity", [row], "day,platform,handle")
    sb._req("DELETE", f"ng_activity?platform=eq.web&handle=eq.{wq}")
    sb.patch_rows("ng_citizens", f"id=eq.{web['id']}", {"owner": None})  # frees the unique owner slot
    sb.patch_rows("ng_citizens", f"id=eq.{ig['id']}", {"owner": acct["user_id"], "level": max(ig["level"], web["level"]),
                                                       "spent": ig["spent"] + web["spent"]})
    sb.patch_rows("ng_accounts", f"user_id=eq.{acct['user_id']}", {"citizen_id": ig["id"], "verified": True,
                                                                   "claimed_platform": platform, "claimed_handle": handle})
    sb._req("DELETE", f"ng_citizens?id=eq.{web['id']}")
    sb.upsert("ng_wallet_tx", [{"user_id": acct["user_id"], "amount": bonus, "reason": "claim", "ref": f"{platform}:{handle}"}], "user_id,reason,ref")
    print(f"[claim] account {acct['user_id'][:8]} linked to {platform}:@{handle} (+{bonus} koin)")
    return True
