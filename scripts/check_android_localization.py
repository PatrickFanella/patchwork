"""Check maintained Android catalogs and their reviewed source/translation fingerprints."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "apps/android/app/src/main"
REVIEW = ROOT / "docs/localization/android-review.json"
ANDROID = "{http://schemas.android.com/apk/res/android}"
FORMAT = re.compile(r"%(?:([1-9][0-9]*)\$)?([sd])")
PLURALS = {"zero", "one", "two", "few", "many", "other"}


def catalog(path):
    entries = {}
    for element in ET.parse(path).getroot():
        name = element.attrib["name"]
        if name in entries or element.tag not in {"string", "plurals"}:
            raise ValueError(f"Duplicate or unsupported resource: {path}/{name}")
        entries[name] = element
    return entries


def variants(element):
    if element.tag == "string":
        return {"value": "".join(element.itertext())}
    result = {}
    for item in element:
        quantity = item.attrib["quantity"]
        if quantity in result or quantity not in PLURALS:
            raise ValueError("Duplicate or invalid plural quantity")
        result[quantity] = "".join(item.itertext())
    if not {"one", "other"} <= result.keys():
        raise ValueError("Missing required one/other plural cases")
    return result


def arguments(value):
    specifiers = FORMAT.findall(value.replace("%%", ""))
    if any(not position for position, _ in specifiers):
        raise ValueError("Use explicit positional format arguments")
    remainder = FORMAT.sub("", value.replace("%%", ""))
    if "%" in remainder or "{{" in remainder or "}}" in remainder:
        raise ValueError("Unsupported native format syntax")
    result = {}
    for position, kind in specifiers:
        if position in result and result[position] != kind:
            raise ValueError("Conflicting format argument types")
        result[position] = kind
    return result


def fingerprint(element):
    content = {"type": element.tag, "values": variants(element)}
    return hashlib.sha256(json.dumps(content, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def inspect(app=APP):
    base = catalog(app / "res/values/strings.xml")
    required = {key: value for key, value in base.items() if value.get("translatable") != "false"}
    locales = [item.attrib[ANDROID + "name"] for item in ET.parse(app / "res/xml/locales_config.xml").getroot()]
    if not locales or locales[0] != "en" or len(set(locales)) != len(locales):
        raise ValueError("Register unique locales with English default first")
    records = {}
    for locale in locales:
        if not re.fullmatch(r"[a-z]{2,3}(?:-[A-Za-z0-9]+)*", locale):
            raise ValueError(f"Invalid locale: {locale}")
        qualifier = "values" if locale == "en" else (
            "values-" + locale if "-" not in locale else "values-b+" + locale.replace("-", "+"))
        target = catalog(app / f"res/{qualifier}/strings.xml")
        if locale != "en" and target.keys() != required.keys():
            raise ValueError(f"Missing, stale or non-translatable keys: {locale}")
        records[locale] = {}
        for key, source in required.items():
            translated = target[key]
            if translated.tag != source.tag or translated.get("translatable") == "false":
                raise ValueError(f"Resource type or translation flag mismatch: {locale}/{key}")
            source_variants, translated_variants = variants(source), variants(translated)
            if translated.tag == "plurals" and locale.split("-")[0] == "es" and "many" not in translated_variants:
                raise ValueError(f"Missing Spanish many plural case: {key}")
            expected = arguments(source_variants.get("other", source_variants.get("value")))
            if any(arguments(value) != expected for value in [*source_variants.values(), *translated_variants.values()]):
                raise ValueError(f"Format argument mismatch: {locale}/{key}")
            if source.tag == "plurals" and expected.get("1") != "d":
                raise ValueError(f"Plural quantity must be the first integer argument: {key}")
            records[locale][key] = {"source": fingerprint(source), "translation": fingerprint(translated)}
    # Icons are decorative and share the visible navigation label. Visible literal copy must use resources.
    for path in (app / "java").rglob("*.kt"):
        if re.search(r'\bText\s*\(\s*"|contentDescription\s*=\s*"', path.read_text()):
            raise ValueError(f"Hard-coded visible/accessibility copy: {path}")
    return records


def validate(app=APP, review=REVIEW):
    records = inspect(app)
    approved = json.loads(review.read_text())
    if approved["resources"] != records:
        raise ValueError("Native copy changed or needs translation review; inspect resources and refresh android-review.json")
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--record-reviewed", action="store_true", help="record current copy after reviewing its native context")
    args = parser.parse_args()
    if args.record_reviewed:
        previous = json.loads(REVIEW.read_text()) if REVIEW.exists() else {}
        previous["resources"] = inspect()
        REVIEW.write_text(json.dumps(previous, indent=2, ensure_ascii=False) + "\n")
    else:
        validate()
    print("Android native localization resources checked")


if __name__ == "__main__":
    main()
