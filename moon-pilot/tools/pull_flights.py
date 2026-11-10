"""Copy shared player flights from the database into the repo for AI training.

    set SUPABASE_SECRET_KEY=<secret key from the Supabase dashboard: Settings > API keys>
    python moon-pilot/tools/pull_flights.py

Writes rocket-lander/data/flights/<date>.jsonl (one flight per line) and remembers the last id it
fetched, so each run only downloads new flights. The secret key is read from the environment and
must never be committed or put in the game.
"""
import json
import os
import pathlib
import sys
import urllib.request

API = "https://mjzmndrphrjgwozifvrk.supabase.co/rest/v1/flights"
OUT = pathlib.Path(__file__).resolve().parents[2] / "rocket-lander" / "data" / "flights"
KEY = os.environ.get("SUPABASE_SECRET_KEY")
if not KEY:
    sys.exit("Set SUPABASE_SECRET_KEY first (see the top of this file).")

OUT.mkdir(parents=True, exist_ok=True)
marker = OUT / ".last_id"
last, total = int(marker.read_text()) if marker.exists() else 0, 0
while True:
    req = urllib.request.Request(f"{API}?id=gt.{last}&order=id.asc&limit=200", headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        flights = json.load(r)
    if not flights:
        break
    for f in flights:
        f.pop("player_id", None)                       # training does not need to know who flew it
        with open(OUT / f"{f['created_at'][:10]}.jsonl", "a", encoding="utf-8") as fh:
            fh.write(json.dumps(f, separators=(",", ":")) + "\n")
    last, total = flights[-1]["id"], total + len(flights)
    marker.write_text(str(last))
print(f"{total} new flights saved to {OUT}")
