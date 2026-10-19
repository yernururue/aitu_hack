#!/usr/bin/env python3
"""Offline consistency check for planning artifacts; this is not an MVP/eval runner."""

import argparse
import json
import math
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit


REQUIRED = (
    "AGENTS.md", "README.md", ".gitignore", ".env.example", "Makefile", "tracker.yaml",
    "docs/product-spec.md", "docs/implementation-plan.md", "docs/data-contract.md",
    "docs/harness.md", "docs/research.md", "docs/progress.md", "docs/handoff.md",
    "evals/cases.json", "evals/fixtures/places.json",
)
CATEGORIES = {"cafe", "restaurant", "park", "museum", "bowling", "entertainment", "other"}
FACTS = {"quiet", "outlets", "wifi", "childFriendly", "indoor"}
KINDS = {"retrieval", "generation", "integration", "ui", "data"}
STATUSES = {"ok", "degraded", "no_results", "needs_clarification", "rejected_import"}


def check(root: Path) -> list[str]:
    errors = []

    def require(condition, message):
        if not condition:
            errors.append(message)

    for name in REQUIRED:
        require((root / name).is_file(), f"Missing file: {name}")
    if errors:
        return errors

    for name in REQUIRED:
        if not name.endswith(".md"):
            continue
        text = (root / name).read_text(encoding="utf-8")
        for target in re.findall(r"(?<!!)\[[^\]]+\]\(([^)]+)\)", text):
            target = target.strip("<>")
            parsed = urlsplit(target)
            if parsed.scheme or not parsed.path:
                continue
            path = root / name
            require((path.parent / unquote(parsed.path)).exists(),
                    f"Broken local link in {name}: {target}")

    try:
        catalog = json.loads((root / "evals/fixtures/places.json").read_text())
        suite = json.loads((root / "evals/cases.json").read_text())
    except (ValueError, OSError) as exc:
        return errors + [f"Invalid JSON: {exc}"]
    if not isinstance(catalog, dict) or not isinstance(suite, dict):
        return errors + ["Catalog and suite must be JSON objects"]
    require(catalog.get("synthetic") is True and suite.get("synthetic") is True,
            "Harness fixtures and cases must be explicitly synthetic")
    require(catalog.get("schemaVersion") == suite.get("schemaVersion") == "1.0",
            "Expected schemaVersion 1.0")
    places = catalog.get("places", [])
    cases = suite.get("cases", [])
    if not isinstance(places, list) or not isinstance(cases, list):
        return errors + ["places and cases must be arrays"]
    require(len(places) >= 5, "Expected at least five synthetic places")
    require(len(cases) >= 12, "Expected at least twelve acceptance cases")

    ids = set()
    for place in places:
        if not isinstance(place, dict):
            errors.append("Each place must be an object")
            continue
        pid = place.get("id")
        if not isinstance(pid, str) or not pid.startswith("fixture:"):
            errors.append("Synthetic place needs a fixture: ID")
            continue
        require(pid not in ids, f"Duplicate place ID: {pid}")
        ids.add(pid)
        require(bool(place.get("name")), f"Missing name: {pid}")
        require(place.get("category") in CATEGORIES, f"Unknown category: {pid}")
        location = place.get("location", {})
        for coord, limit in (("lat", 90), ("lon", 180)):
            value = location.get(coord)
            require(type(value) in (int, float) and math.isfinite(value)
                    and -limit <= value <= limit, f"Invalid {coord}: {pid}")
        sources = place.get("sources", [])
        require(bool(sources), f"Missing sources: {pid}")
        source_ids = {source.get("id") for source in sources}
        require(len(source_ids) == len(sources) and None not in source_ids,
                f"Duplicate/missing source IDs: {pid}")
        for source in sources:
            require(source.get("kind") == "synthetic", f"Real source in fixture: {pid}")
            require(urlsplit(source.get("url", "")).hostname == "example.com",
                    f"Fixture source must use example.com: {pid}")
        evidence_objects = [place.get("description", {})]
        for key in ("rating", "price", "hours"):
            if place.get(key) is not None:
                evidence_objects.append(place[key])
        facts = place.get("facts", [])
        require(len({fact.get("key") for fact in facts}) == len(facts),
                f"Duplicate fact keys: {pid}")
        for fact in facts:
            require(fact.get("key") in FACTS and type(fact.get("value")) is bool,
                    f"Invalid fact: {pid}")
            require(fact.get("confidence") in {"confirmed", "reported"},
                    f"Invalid fact confidence: {pid}")
        evidence_objects += facts + place.get("reviews", [])
        evidence_objects += place.get("links", {}).get("social", [])
        for item in evidence_objects:
            refs = item.get("sourceIds", [])
            require(bool(refs) and set(refs) <= source_ids, f"Unresolved evidence: {pid}")
        rating = place.get("rating")
        if rating is not None:
            require(0 <= rating["value"] <= 5 and type(rating["count"]) is int
                    and rating["count"] >= 0, f"Invalid rating: {pid}")
        price = place.get("price")
        if price is not None:
            require(0 <= price["min"] <= price["max"] and price["currency"] == "KZT"
                    and price.get("basis") == "per_person_visit",
                    f"Invalid price: {pid}")
        hours = place.get("hours")
        if hours is not None:
            require(hours.get("timezone") == "Asia/Almaty", f"Wrong timezone: {pid}")
            for interval in hours.get("weekly", []):
                require(type(interval.get("weekday")) is int and 0 <= interval["weekday"] <= 6,
                        f"Invalid weekday: {pid}")
                for time_key in ("opens", "closes"):
                    require(bool(re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", interval.get(time_key, ""))),
                            f"Invalid time: {pid}")
                require(type(interval.get("overnight")) is bool, f"Invalid overnight flag: {pid}")

    case_ids = set()
    covered = set()
    for case in cases:
        cid = case.get("id")
        require(isinstance(cid, str) and bool(cid) and cid not in case_ids,
                f"Missing/duplicate case ID: {cid}")
        case_ids.add(cid)
        require(case.get("kind") in KINDS, f"Unknown case kind: {cid}")
        require(case.get("priority") in {"P0", "P1"}, f"Missing priority: {cid}")
        covered.add(case.get("kind"))
        expected = case.get("expected", {})
        statuses = expected.get("status", [])
        require(bool(statuses) and set(statuses) <= STATUSES, f"Invalid expected status: {cid}")
        require(bool(expected.get("assertions")), f"Missing assertions: {cid}")
        included = set(expected.get("mustIncludeAny", []))
        excluded = set(expected.get("mustExclude", []))
        require(included | excluded <= ids, f"Unknown expected POI ID: {cid}")
        require(not included & excluded, f"Conflicting expected POI IDs: {cid}")
    require(KINDS <= covered, "Missing coverage of one or more acceptance layers")

    env_lines = (root / ".env.example").read_text().splitlines()
    env = dict(line.split("=", 1) for line in env_lines if line and not line.startswith("#"))
    require(env.get("OPENROUTER_API_KEY") == "", "Example API key must be empty")
    require(env.get("LIVE_EVAL_ENABLED") == "false", "Live eval must default to disabled")
    require(env.get("APP_TIMEZONE") == "Asia/Almaty", "Unexpected app timezone")
    ignore = (root / ".gitignore").read_text().splitlines()
    require(".env.*" in ignore and "!.env.example" in ignore, "Missing env ignore rules")

    progress = (root / "docs/progress.md").read_text()
    require("Stage: harness-only" in progress or "Stage: implementation" in progress,
            "Progress must declare the actual stage")
    if "Stage: harness-only" in progress:
        for path in ("package.json", "src/app", "app/page.tsx"):
            require(not (root / path).exists(), f"Product scaffold contradicts harness-only: {path}")
    return errors


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        failures = check(args.root.resolve())
    except (KeyError, TypeError, ValueError, AttributeError, OSError) as exc:
        failures = [f"Malformed harness artifact: {type(exc).__name__}: {exc}"]
    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        sys.exit(1)
    print("PASS: harness documents, synthetic fixture and acceptance-case references are consistent.")
    print("NOT RUN: application build/tests, real-data retrieval or paid model evaluation.")
