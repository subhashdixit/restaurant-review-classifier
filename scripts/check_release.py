"""Verify dataset identity and model/manifest consistency without retraining."""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def check() -> None:
    """Reject a changed source or artifact paired with stale evaluation."""
    report = json.loads((ROOT / "site/metrics.json").read_text())
    source = ROOT / report["source_path"]
    for path, expected in [
        (source, report["source_sha256"]),
        (ROOT / "site/model.json", report["artifact_sha256"]),
    ]:
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError("Release source or model hash mismatch.")
    if report["split"]["test"] != report["test"]["rows"]:
        raise ValueError("Evaluation split is inconsistent.")
    print("Source, model and evaluation identity checks passed")


if __name__ == "__main__":
    check()
