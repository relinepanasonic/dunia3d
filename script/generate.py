"""Script stage: series bible + comments -> validated episode.json (Gemini free-tier Flash).

Usage: python script/generate.py --day 2 [--offline] [--force]
  --offline  use script/fixtures/day-XX.json instead of calling Gemini (for tests without a key)
Cache: out/day-XX/episode.json. The bible is read from series/bible.json (or the snapshot
out/day-XX/bible.before.json on re-runs) and updated only after a validated episode is produced.
"""
import argparse, json, os, shutil, sys, time, urllib.request, urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import SERIES, ROOT, load_env, read_json, write_json, config, day_dir  # noqa: E402
import game  # noqa: E402
from script.schema import Episode, gemini_schema, CAMERAS, ANIMS, EXPRESSIONS, OVERLAYS  # noqa: E402

API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

SYSTEM = """Kamu penulis naskah Reels animasi 3D low-poly berseri "{series}" dalam Bahasa Indonesia gaul Jakarta (gue/lo).
Karakter: {character}
Format serial: tiap hari bikin sebagian negara dari nol. Penonton yang follow = jadi RAKYAT, komen penonton menentukan episode berikutnya.
Gaya: narasi singkat, punchy, lucu, 1 ide per shot. Jangan menyalin merek/akun lain. Semua orisinal."""

RULES = """ATURAN OUTPUT (JSON saja, sesuai schema):
- {nshots} shot (12-16), total narasi 85-130 kata, durasi video sekitar 60 detik. Tiap voiceover_text 4-9 kata.
- Shot pertama = hook (overlay type "hook", camera "wide_push", sebut ide "bikin negara dari nol" dengan kata-kata sendiri). Ulangi hook gaya serupa tapi variasi.
- Shot terakhir: overlay type "end", big = "DAY {next}", sub = teaser singkat; ajak follow/komen.
- caption_words = voiceover_text dipotong jadi beat 1-4 kata, berurutan, tanpa menambah/mengurangi kata (total kata sama persis).
- highlight_word = satu kata kunci dari voiceover_text shot itu (persis sama ejaannya, tanpa tanda baca).
- duration_sec 3.5-5.0 (perkiraan; durasi sebenarnya mengikuti suara).
- camera pilihan: {cams}. Variasikan; sertakan minimal 1 shot "drone" (overlay "drone") dan close-up wajah.
- character_anim pilihan: {anims}. expression pilihan: {exprs}. "walk" paling cocok dengan kamera drone/wide.
- scene_state: time day|dusk|night, boleh time_to untuk transisi dalam shot. houses 0-8 (bertambah, jangan berkurang dari {houses} kecuali ada alasan cerita), campfire boolean, sign/chair boolean. Ending sebaiknya malam.
- overlay types: {ovs}. Pakai: census (followers, pop), card (rows label+text), comment (user, text - pakai komen asli dari input), idcard (sub, nik, name, status), live (text), follow (text), drone, end.
- GAME: Follower=Penduduk, Like=Pajak (kas), Share=Pengaruh, Komen=Inspirasi. Narasikan FAKTA GAME di bawah apa adanya (angka & hasil bangun/tidak). Tampilkan overlay type "kpi" (followers=penduduk, pajak, pengaruh, inspirasi, goal=nama bangunan target, progress=persen syarat terpenuhi) minimal sekali.
- Jika ada POLLING: narasikan hasil (angka persis dari fakta) dan/atau ajak voting lewat komen ("komen A atau B"); pakai overlay "card" dengan rows label=A/B text=pilihan. Jika ada LAPORAN, bacakan ringkasannya.
- Jika bangunan BERHASIL dibangun: naikkan houses +1 setelah momen pembangunan. Jika belum cukup: houses tetap, buat cliffhanger 'kurang X lagi' dan ajak like/share/komen sesuai kekurangan.
- Gaya visual dunia: FUTURISTIK (kota sci-fi neon, hover, hologram). Sebut elemen futuristik, bukan desa/hutan.
- Jangan ada dua overlay besar yang menumpuk di shot yang sama (satu overlay per shot).
- JANGAN MENGARANG: semua angka, nama bangunan, nama warga, pilihan duel/polling dan kejadian harus berasal dari FAKTA GAME dan INPUT di atas. Jika fakta bilang tidak ada upgrade/pembangunan, jangan bilang ada. Jika sesuatu tidak ada di fakta, jangan disebut.\n- Hormati continuity dari series bible; komen teratas (likes terbanyak) jadi bangunan/aktivitas utama episode ini.
- ig_caption: 1-2 kalimat gaul + ajakan follow; hashtags 5-8 item (diawali #).
- bible_update: keadaan negara SETELAH episode ini (population = followers + 1 kecuali ada alasan, buildings daftar lengkap, running_gags, story_so_far ringkas, next_episode_teaser)."""


def facts_text(p):
    t, s = p['target'], p['state']
    lines = [f"Penduduk={s['penduduk']} (+{p['delta']['followers']} baru), Kas pajak={s['pajak']} (+{p['delta']['likes']} like), "
             f"Pengaruh={s['pengaruh']} (+{p['delta']['shares']} share), Inspirasi episode ini={s['inspirasi_episode']} komen, Tier={p['tier']}"]
    lines.append(f"Skor Negara (gabungan IG+YouTube+TikTok)={p['score']}")
    if p['top_comment']:
        lines.append(f"Komen teratas: @{p['top_comment']['user']}: \"{p['top_comment']['text']}\" ({p['top_comment']['likes']} like)")
    if t:
        lines.append(f"Bangunan target: {t['name']} (butuh pajak {t['pajak']}, inspirasi {t['inspirasi']} komen, penduduk {t['penduduk']}, pengaruh {t['pengaruh']})")
    lines.append('HASIL: BERHASIL dibangun sekarang.' if p['built_now'] else (f"HASIL: BELUM cukup, kurang {p['shortfall']}" if p['target'] else 'HASIL: tidak ada bangunan baru hari ini.'))
    return '\n'.join(lines)


def build_prompt(day, bible, inputs, cfg, retry_note="", facts=""):
    return (
        f"Tulis episode DAY {day}.\n\nSERIES BIBLE (kondisi akhir Day {day-1}):\n{json.dumps(bible, ensure_ascii=False, indent=1)}\n\n"
        f"INPUT PENONTON (angka IG kumulatif & komen):\n{json.dumps(inputs, ensure_ascii=False, indent=1)}\n\nFAKTA GAME (wajib diikuti, dihitung sistem):\n{facts}\n\n"
        + RULES.format(nshots=14, next=day + 1, cams=", ".join(CAMERAS), anims=", ".join(ANIMS),
                       exprs=", ".join(EXPRESSIONS), ovs=", ".join(OVERLAYS), houses=bible["scene"]["houses"])
        + (f"\n\nPERBAIKI MASALAH INI DARI PERCOBAAN SEBELUMNYA:\n{retry_note}" if retry_note else "")
    )


def call_gemini(prompt, cfg):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise SystemExit("GEMINI_API_KEY missing. Put it in .env (see .env.example) or run with --offline.")
    # an env var that is set but empty (GitHub does this for an unset variable) must not count as a model name
    primary = (os.environ.get("GEMINI_MODEL") or "").strip() or "gemini-3.8-flash"
    candidates = [primary] + [m for m in ("gemini-3.8-flash", "gemini-flash-latest") if m != primary]
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM.format(series=cfg["series_name"], character=cfg["character"])}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": gemini_schema(), "temperature": 1.0},
    }
    last = ""
    for model in candidates:
        req = urllib.request.Request(API.format(model=model), data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "x-goog-api-key": key})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=300) as r:
                    data = json.load(r)
                print(f"[gemini] model {model} ok")
                return json.loads(data["candidates"][0]["content"]["parts"][0]["text"])
            except urllib.error.HTTPError as e:   # (HTTPError must be handled before its parent URLError)
                msg = e.read().decode()[:400]
                if e.code in (429, 500, 503) and attempt < 3:
                    time.sleep(5 * 2 ** attempt); continue
                last = f"model {model}: HTTP {e.code} {msg}"
                print(f"[gemini] {last}")
                break  # 404/400 for this model name -> try the next candidate
            except (TimeoutError, urllib.error.URLError, ConnectionError) as e:   # slow/unreachable: retry once, then next model
                last = f"model {model}: {type(e).__name__} {e}"
                print(f"[gemini] {last}")
                if attempt < 1:
                    continue
                break
    raise SystemExit(f"Gemini failed for all models. Last: {last}")


def check_facts(ep, forbidden):
    """Hard guard against invented facts: patterns the system knows are false today (from daily.py) must not appear."""
    import re
    texts = [sh.voiceover_text for sh in ep.shots] + [ep.ig_caption, ep.title, ep.hook]
    for pat in forbidden or []:
        for t in texts:
            if re.search(pat, t, re.I):
                raise ValueError(f"Kalimat \"{t}\" mengandung klaim yang SALAH hari ini (pola '{pat}'). Tulis ulang tanpa klaim itu; ikuti FAKTA GAME persis.")


def merge_bible(old, ep, day, plan, totals, campfire_final):
    u = ep.bible_update
    story = {"day": day, "running_gags": u.running_gags, "story_so_far": u.story_so_far,
             "next_episode_teaser": u.next_episode_teaser}
    new = game.apply(old, totals, plan, story)  # numbers are deterministic, prose comes from the LLM
    new["scene"]["campfire"] = campfire_final
    return new


def run(day, offline=False, force=False, max_tries=3):
    load_env()
    cfg, d = config(), day_dir(day)
    ep_path = d / "episode.json"
    if ep_path.exists() and not force:
        print("script cached:", ep_path); return read_json(ep_path)
    before = d / "bible.before.json"
    if not before.exists():
        bible = read_json(SERIES / "bible.json")
        if bible["day"] != day - 1:
            raise SystemExit(f"series/bible.json is at day {bible['day']}; expected {day-1} to write day {day}. "
                             f"Use --force only after restoring the bible, or generate days in order.")
        shutil.copy(SERIES / "bible.json", before)
    bible = read_json(before)
    inputs = read_json(SERIES / "comments.json")
    write_json(d / "inputs.json", inputs)

    totals = inputs["totals"]
    ctx_path = d / "context.json"
    ctx = read_json(ctx_path) if ctx_path.exists() else {}
    plan = game.plan(bible, totals, inputs["comments"], ctx.get("poll_target") or ctx.get("duel_target"), ctx.get("disable_auto", False))
    write_json(d / "game_plan.json", plan)
    facts = facts_text(plan) + ("\n" + ctx["extra_facts"] if ctx.get("extra_facts") else "")
    print("GAME FACTS:\n" + facts)
    note, ep = "", None
    for attempt in range(1, max_tries + 1):
        if offline:
            raw = read_json(ROOT / "script" / "fixtures" / f"day-{day:02d}.json")
        else:
            raw = call_gemini(build_prompt(day, bible, inputs, cfg, note, facts), cfg)
        try:
            ep = Episode.model_validate(raw)
            check_facts(ep, ctx.get("forbidden"))
            break
        except Exception as e:  # validation error -> feed back to the model
            note = str(e)[:1500]; write_json(d / f"episode.invalid.{attempt}.json", raw)
            print(f"attempt {attempt}: invalid -> {note[:200]}")
            if offline: raise SystemExit("offline fixture failed validation")
    if ep is None:
        raise SystemExit("could not get a valid episode; see out/day-XX/episode.invalid.*.json")

    out = ep.model_dump(exclude_none=True)
    out["day"] = day
    seen, tags = set(), []
    for h in ep.hashtags + cfg["base_hashtags"]:
        if h.lower() not in seen:
            seen.add(h.lower()); tags.append(h)
    out["hashtags"] = tags
    write_json(ep_path, out)
    last = ep.shots[-1].scene_state
    after = merge_bible(bible, ep, day, plan, totals, last.campfire)
    write_json(d / "bible.after.json", after)
    write_json(SERIES / "bible.json", after)  # advance the canonical bible only now
    print(f"script ok: {len(ep.shots)} shots, {sum(len(s.voiceover_text.split()) for s in ep.shots)} words -> {ep_path}")
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", type=int, required=True)
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    run(a.day, a.offline, a.force)
