"""Shared helpers: paths, .env loading, series config."""
import json, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SERIES = ROOT / "series"
OUT = ROOT / "out"


def load_env(path=ROOT / ".env"):
    """Tiny .env loader (no dependency). Real environment variables win."""
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def read_json(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def write_json(p, obj):
    Path(p).parent.mkdir(parents=True, exist_ok=True)
    Path(p).write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def config():
    return read_json(SERIES / "config.json")


def day_dir(day):
    d = OUT / f"day-{int(day):02d}"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ---------------------------------------------------------------- tiny HTTP helper (no dependencies)
import urllib.error, urllib.parse, urllib.request  # noqa: E402


def http(method, url, headers=None, json_body=None, form=None, data=None, timeout=60, raw=False):
    """Returns parsed JSON (or bytes with raw=True). Raises RuntimeError with the API's error text."""
    h = dict(headers or {})
    if json_body is not None:
        data = json.dumps(json_body).encode(); h.setdefault("Content-Type", "application/json")
    elif form is not None:
        data = urllib.parse.urlencode(form).encode(); h.setdefault("Content-Type", "application/x-www-form-urlencoded")
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read()
            if raw:
                return body, dict(r.headers)
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {url.split('?')[0]} -> HTTP {e.code}: {e.read().decode(errors='replace')[:400]}")
