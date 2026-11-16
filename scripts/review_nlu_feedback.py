#!/usr/bin/env python3
"""Review unmatched / clarify utterances logged by the NLU engine.

Usage:
  python scripts/review_nlu_feedback.py              # last 50
  python scripts/review_nlu_feedback.py --limit 200
  python scripts/review_nlu_feedback.py --summary
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

# allow running from repo root
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from server.commands import feedback  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, default=50)
    ap.add_argument("--summary", action="store_true")
    args = ap.parse_args()

    if args.summary:
        print(json.dumps(feedback.summarize(args.limit), indent=2))
        return

    rows = feedback.read_recent(args.limit)
    if not rows:
        print("No feedback rows yet.")
        return
    for r in rows:
        print(f"[{r.get('iso','?')}] {r.get('outcome'):8}  {r.get('utterance')!r}")
        if r.get("detail"):
            print(f"           detail={r['detail']}")


if __name__ == "__main__":
    main()
