"""Voice + render for one timeline (used for the presentation reels; pipeline.py does the same for episodes)."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def produce(timeline_path, out_dir, force=False):
    from common import config
    from voice import tts
    tts.run(timeline_path, out_dir, config()["voice_provider"], force=force)
    subprocess.check_call(["node", str(ROOT / "render" / "render.mjs"), str(timeline_path), str(out_dir)] + (["--force"] if force else []), cwd=ROOT)
