"""Write a data bundle + manifest.json (shared by build_bundle.py and make_mock.py).

manifest.json pins the bundle kind ("real" | "mock") and the SHA-256 of every
file's exact bytes. The web app refuses to start if the kind does not match its
build mode or any hash differs, so a real build can never silently load (or mix
in) mock files.
"""
import hashlib
import json
from datetime import datetime, timezone

BUNDLE_FILES = ["features.json", "targets.json", "sites.geojson", "scores.json"]
CONTRACT = "eaf-bundle/2"


FEATURE_EXPORT_KEYS = ["id", "label", "kind", "unit", "earthMin", "earthMax", "invert", "related", "description", "source"]


def export_features(features):
    """features.json content: config.FEATURES minus pipeline-only keys (e.g. `raw`)."""
    return [{k: f[k] for k in FEATURE_EXPORT_KEYS if k in f} for f in features]


def dumps(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False) + "\n"


def write_bundle(out_dir, kind, files, root_for_log=None):
    """files: {"features.json": obj, ...}. Writes each file and manifest.json."""
    assert kind in ("real", "mock"), kind
    assert sorted(files) == sorted(BUNDLE_FILES), sorted(files)
    out_dir.mkdir(parents=True, exist_ok=True)
    hashes = {}
    for name in BUNDLE_FILES:
        data = dumps(files[name]).encode("utf-8")
        (out_dir / name).write_bytes(data)
        hashes[name] = hashlib.sha256(data).hexdigest()
    manifest = {
        "contract": CONTRACT,
        "kind": kind,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "files": hashes,
    }
    (out_dir / "manifest.json").write_bytes(dumps(manifest).encode("utf-8"))
    shown = out_dir.relative_to(root_for_log).as_posix() if root_for_log else str(out_dir)
    print(f"wrote {kind} bundle -> {shown} ({', '.join(BUNDLE_FILES)}, manifest.json)")
    return manifest
