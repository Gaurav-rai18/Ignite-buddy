"""Generate pre-signed JWT tokens for Apache JMeter load and concurrency testing.

Usage:
    python tools/generate_jmeter_tokens.py [--count 100] [--out jmeter_users.csv]

This outputs a CSV file with columns: user_id, name, batch, token
which can be imported directly into a JMeter CSV Data Set Config.
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

# Add project root and src to sys.path so server modules can be imported
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
for p in (str(ROOT), str(SRC)):
    if p not in sys.path:
        sys.path.insert(0, p)

from server import config
from server.auth.impl import issue_jwt


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate JMeter test tokens for Ignite Buddy")
    parser.add_argument("--count", type=int, default=100, help="Number of test users to generate (default: 100)")
    parser.add_argument("--out", type=str, default="jmeter_users.csv", help="Output CSV filepath")
    parser.add_argument("--secret", type=str, default="", help="Override ASSISTANT_JWT_SECRET")
    args = parser.parse_args()

    if args.secret:
        config.JWT_SECRET = args.secret
    elif not config.JWT_SECRET:
        # If secret not set in environment or config, set a test secret
        config.JWT_SECRET = "jmeter-performance-test-secret-key-32chars!!"
        print("[!] ASSISTANT_JWT_SECRET not found in environment; using fallback testing secret.")
        print(f"    Ensure your server is running with ASSISTANT_JWT_SECRET={config.JWT_SECRET}")

    out_path = Path(args.out)
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["user_id", "name", "batch", "token"])
        for i in range(1, args.count + 1):
            uid = f"trainee_{i:04d}"
            name = f"Trainee {i:04d}"
            batch = f"B50-A{((i - 1) % 4) + 1}"
            token = issue_jwt(user_id=uid, name=name, batch=batch)
            writer.writerow([uid, name, batch, token])

    print(f"[OK] Successfully generated {args.count} test tokens in: {out_path.resolve()}")
    print("     Import this CSV file into your JMeter Thread Group -> CSV Data Set Config.")


if __name__ == "__main__":
    main()
