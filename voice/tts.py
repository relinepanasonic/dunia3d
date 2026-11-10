"""Voice stage: timeline.json -> per-shot TTS, word timings, merged voice.wav, voice.json.

Provider is swappable: implement `synth(text, voice, rate) -> (audio_bytes, words)` and
register it in PROVIDERS. words = [{"w": str, "start": sec, "end": sec}].
Usage: python voice/tts.py timelines/m2-test.json out/m2
"""
import asyncio, json, subprocess, sys
from pathlib import Path

PAD = 0.35  # silence after each shot's speech


async def synth_edge(text, voice, rate):
    import edge_tts
    comm = edge_tts.Communicate(text, voice, rate=rate, boundary="WordBoundary")
    audio, words = bytearray(), []
    async for ev in comm.stream():
        if ev["type"] == "audio":
            audio += ev["data"]
        elif ev["type"] == "WordBoundary":
            s = ev["offset"] / 1e7
            words.append({"w": ev["text"], "start": s, "end": s + ev["duration"] / 1e7})
    return bytes(audio), words


PROVIDERS = {"edge": synth_edge}  # add "gemini": ..., "gcloud": ... here


def ffprobe_dur(p):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                   "-of", "csv=p=0", str(p)], text=True)
    return float(out.strip())


def run(timeline_path, out_dir, provider="edge", force=False):
    tl = json.loads(Path(timeline_path).read_text(encoding="utf-8"))
    out = Path(out_dir); vdir = out / "voice"; vdir.mkdir(parents=True, exist_ok=True)
    meta_path = out / "voice.json"
    # cache: reuse when text unchanged
    cache = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    shots, t0, wavs = [], 0.0, []
    for i, sh in enumerate(tl["shots"]):
        mp3, wav = vdir / f"{sh['id']}.mp3", vdir / f"{sh['id']}.wav"
        key = [sh["voiceover_text"], tl["voice"], tl.get("rate", "+0%"), provider]
        c = next((x for x in cache.get("shots", []) if x["id"] == sh["id"]), None)
        if c and c["key"] == key and mp3.exists() and not force:
            words, speech = c["words_rel"], c["speech"]
        else:
            audio, words = asyncio.run(PROVIDERS[provider](sh["voiceover_text"], tl["voice"], tl.get("rate", "+0%")))
            mp3.write_bytes(audio); speech = ffprobe_dur(mp3)
        dur = max(sh.get("min_dur", 2.0), speech + PAD)
        subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", str(mp3), "-af", "apad", "-t", f"{dur:.3f}",
                               "-ar", "44100", "-ac", "1", str(wav)])
        wavs.append(wav)
        shots.append({"id": sh["id"], "key": key, "start": t0, "dur": dur, "speech": speech, "words_rel": words,
                      "words": [{"w": w["w"], "start": t0 + w["start"], "end": t0 + w["end"]} for w in words]})
        t0 += dur
    lst = out / "voice_concat.txt"
    lst.write_text("".join(f"file '{w.resolve().as_posix()}'\n" for w in wavs))
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst),
                           "-c", "copy", str(out / "voice.wav")])
    meta_path.write_text(json.dumps({"total": t0, "shots": shots}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"voice ok: {t0:.2f}s, {len(shots)} shots -> {out/'voice.wav'}")


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "edge")
