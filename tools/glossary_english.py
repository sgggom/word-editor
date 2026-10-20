#!/usr/bin/env python3
"""Fill missing English/IPA fields from cached, attributed public dictionaries.

No network calls and no changes to the existing dictionary shards.  The output
contains only new fields; regular inflection pronunciations are explicitly
marked derived and require a dictionary-attested relationship.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import json
import re
import shutil
import subprocess
import unicodedata
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def key(word):
    return unicodedata.normalize("NFC", word).strip().lower()


def load_json(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def clean(text):
    return re.sub(r"\s+", " ", str(text).replace("\\n", "; ")).strip(" ;")


def load_ecdict(path):
    entries = {}
    with path.open(newline="") as source:
        for row in csv.DictReader(source):
            word = key(row["word"])
            # Prefer the ordinary lower-case entry over a colliding proper name.
            if word not in entries or row["word"] == word:
                entries[word] = row
    return entries


def exchange(row):
    return dict(x.split(":", 1) for x in row.get("exchange", "").split("/") if ":" in x)


def extract_wiktionary(source, destination, wanted):
    """Retain lexical evidence, pronunciations and Chinese translations only."""
    out = defaultdict(list)
    with gzip.open(source, "rt") as stream:
        for line in stream:
            item = json.loads(line)
            word = key(item.get("word", ""))
            if word not in wanted or item.get("lang_code") != "en":
                continue
            value = {name: item[name] for name in ("word", "pos", "sounds", "forms") if name in item}
            value["senses"] = [{name: sense[name] for name in
                ("glosses", "raw_glosses", "tags", "form_of", "alt_of") if name in sense}
                for sense in item.get("senses", [])]
            value["translations"] = [t for t in item.get("translations", [])
                if t.get("code") in ("zh", "cmn")]
            out[word].append(value)
    dump(destination, dict(out))
    return out


def wik_entries(entries, word):
    rows = entries.get(word, [])
    exact = [row for row in rows if row.get("word") == word]
    return exact or rows


def wik_definition(entries, word):
    senses = []
    for row in wik_entries(entries, word):
        for sense in row.get("senses", []):
            for gloss in sense.get("glosses", [])[:1]:
                text = clean(gloss)
                if text and text not in senses:
                    senses.append(text)
    return "; ".join(senses[:3])


def ipa_text(text):
    text = clean(text)
    if not text:
        return ""
    if not text.startswith(("/", "[")):
        # ECDICT may give comma-separated variants without delimiters. Keep
        # these separate, otherwise an inflection suffix attaches to only the
        # last alternative while the first appears to be the uninflected word.
        text = ", ".join("/" + part.strip(" /") + "/" for part in re.split(r"[,;]", text) if part.strip())
    return text.replace("ә", "ə").replace(":", "ː").replace("'", "ˈ")


def wik_ipa(entries, word):
    choices = []
    for row in wik_entries(entries, word):
        for sound in row.get("sounds", []):
            ipa = sound.get("ipa", "")
            tags = sound.get("tags", [])
            if not ipa:
                continue
            priority = 0 if "US" in tags or "General-American" in tags else 1 if not tags else 2
            if any(t in tags for t in ("obsolete", "archaic", "nonstandard")):
                priority += 3
            if ipa.startswith("["):
                priority += 2
            choices.append((priority, ipa))
    if not choices:
        return ""
    choices.sort(key=lambda x: x[0])
    best = choices[0][0]
    return ", ".join(dict.fromkeys(ipa for priority, ipa in choices if priority == best))


def spelling_variants(entries, word):
    """Only explicit same-language alternative spellings, never contractions."""
    for row in wik_entries(entries, word):
        for sense in row.get("senses", []):
            tags = sense.get("tags", [])
            if any(t in tags for t in ("pronunciation-spelling", "dialectal", "Scotland", "archaic", "obsolete")):
                continue
            if not any(g.startswith("Alternative spelling of ") for g in sense.get("glosses", [])):
                continue
            for alternate in sense.get("alt_of", []):
                yield key(alternate["word"])


LETTER_IPA = dict(zip("abcdefghijklmnopqrstuvwxyz", ["eɪ", "biː", "siː", "diː", "iː", "ɛf",
    "dʒiː", "eɪtʃ", "aɪ", "dʒeɪ", "keɪ", "ɛl", "ɛm", "ɛn", "oʊ", "piː", "kjuː", "ɑɹ",
    "ɛs", "tiː", "juː", "viː", "dʌbəljuː", "ɛks", "waɪ", "ziː"]))


def initialism_ipa(entries, word):
    senses = [s for row in wik_entries(entries, word) for s in row.get("senses", [])]
    if re.fullmatch(r"[a-z]+", word) and senses and all("initialism" in s.get("tags", []) for s in senses):
        return "/" + " ".join(LETTER_IPA[c] for c in word) + "/"
    return ""


def predict_espeak(words, path, executable):
    version = subprocess.check_output([executable, "--version"], text=True).strip().splitlines()[0]
    version = re.sub(r"\s+Data at:.*$", "", version)
    cache = load_json(path, {})
    if cache.get("engine") != version or cache.get("voice") != "en-us":
        cache = {"engine": version, "voice": "en-us", "words": {}}

    def predict(word):
        raw = subprocess.check_output([executable, "-q", "--ipa", "-v", "en-us", word], text=True)
        value = clean(raw)
        return word, ("/" + value + "/") if value else ""

    missing = sorted(set(words) - cache["words"].keys())
    with ThreadPoolExecutor(max_workers=6) as workers:
        cache["words"].update(workers.map(predict, missing))
    dump(path, cache)
    return cache


def relations(ecdict, wiktionary):
    out = defaultdict(list)
    for word, row in ecdict.items():
        forms = exchange(row)
        if forms.get("0"):
            for kind in forms.get("1", ""):
                out[word].append((key(forms["0"]), kind, "ecdict-inflection"))
        for kind in ("s", "3", "d", "p", "i", "r", "t"):
            for form in forms.get(kind, "").split("/"):
                if form:
                    out[key(form)].append((word, kind, "ecdict-inflection"))
    tag_map = {"plural": "s", "third-person": "3", "past": "d", "present-participle": "i",
        "comparative": "r", "superlative": "t"}
    for word in wiktionary:
        for row in wik_entries(wiktionary, word):
            for sense in row.get("senses", []):
                tags = sense.get("tags", [])
                kinds = [kind for tag, kind in tag_map.items() if tag in tags]
                if "participle" in tags and "present" in tags:
                    kinds.append("i")
                for form in sense.get("form_of", []):
                    base = key(form["word"])
                    for kind in kinds:
                        out[word].append((base, kind, "wiktionary-inflection"))
            # Some words list their inflections only on the headword page.
            # Preserve spelling/case here so ordinary forms never inherit a
            # capitalized surname's paradigm.
            if row.get("word") == word:
                for form in row.get("forms", []):
                    spelling = form.get("form", "")
                    if spelling != key(spelling):
                        continue
                    kinds = [kind for tag, kind in tag_map.items() if tag in form.get("tags", [])]
                    if "participle" in form.get("tags", []) and "present" in form.get("tags", []):
                        kinds.append("i")
                    for kind in kinds:
                        out[spelling].append((word, kind, "wiktionary-inflection"))
    return out


def regular_inflection(base, word, kind, ipa):
    """Conservative regular suffix allomorphs, never a spelling-only guess."""
    values = re.findall(r"/([^/]+)/", ipa)
    if not values:
        return ""
    allowed = False
    if kind in ("s", "3"):
        allowed = word in {base + "s", base + "es"} or (base.endswith("y") and word == base[:-1] + "ies")
    elif kind in ("d", "p"):
        allowed = word in {base + "d", base + "ed", base + base[-1:] + "ed"} or (base.endswith("y") and word == base[:-1] + "ied")
    elif kind == "i":
        allowed = word in {base + "ing", base + base[-1:] + "ing"} or (base.endswith("e") and word == base[:-1] + "ing")
    elif kind == "r":
        allowed = word in {base + "r", base + "er", base + base[-1:] + "er"} or (base.endswith("y") and word == base[:-1] + "ier")
    elif kind == "t":
        allowed = word in {base + "st", base + "est", base + base[-1:] + "est"} or (base.endswith("y") and word == base[:-1] + "iest")
    if not allowed:
        return ""
    result = []
    for value in values:
        if value.endswith(("ː", ".", "ˈ", "ˌ")):
            ending = value.rstrip("ː.ˈˌ")
        else:
            ending = value
        if not ending:
            continue
        final = ending[-1]
        if kind in ("s", "3"):
            suffix = "ɪz" if final in "szʃʒ" else "s" if final in "ptkfθ" else "z"
        elif kind in ("d", "p"):
            suffix = "ɪd" if final in "td" else "t" if final in "pkfθsʃ" else "d"
        else:
            suffix = {"i": "ɪŋ", "r": "əɹ", "t": "ɪst"}[kind]
        result.append("/" + value + suffix + "/")
    return ", ".join(dict.fromkeys(result))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path("/tmp/word-glossary-sources"))
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--extract-wiktionary", action="store_true")
    parser.add_argument("--predict-missing", action="store_true",
        help="Use eSpeak NG only for remaining gaps and label every result unverified.")
    args = parser.parse_args()
    cache = args.cache
    scope = load_json(cache / "scope.json")
    words = {key(row["word"]) for row in scope["words"]}
    existing = {key(word): row for path in (args.root / "dict").glob("*.json")
        for word, row in load_json(path).items()}
    ec = load_ecdict(cache / "ecdict.csv")
    oewn = load_json(cache / "oewn-all-definitions.json", {})
    ipa = {}
    for line in (cache / "ipa-en_US.txt").read_text().splitlines():
        if "\t" in line:
            word, value = line.split("\t", 1)
            ipa[key(word)] = value
    wik_path = cache / "wiktionary-entries.json"
    if args.extract_wiktionary:
        wanted = set(words)
        for word in words:
            wanted.update(word[:-i] for i in range(1, min(5, len(word))))
            wanted.update((word[:-1] + "e", word[:-2] + "e", word[:-3] + "y"))
            wanted.update(key(x) for x in exchange(ec.get(word, {})).get("0", "").split("/") if x)
        extract_wiktionary(cache / "kaikki-English.jsonl.gz", wik_path, wanted)
    wik = load_json(wik_path, {})
    scots = load_json(cache / "wiktionary-scots-entries.json", {})
    reviewed_english = load_json(cache / "english-reviewed.json", {})
    reviewed_ipa = load_json(cache / "ipa-reviewed.json", {})
    rels = relations(ec, wik)
    scots_rels = relations({}, scots)
    for word, entries in scots_rels.items():
        rels[word].extend((base, kind, "wiktionary-scots-inflection") for base, kind, _ in entries)

    def direct_ipa(word):
        # A Scottish ordinary word must not inherit a same-spelled surname's
        # English pronunciation (e.g. haen versus Haen).
        scots_ordinary = any(r.get("word") == word for r in scots.get(word, [])) or bool(scots_rels.get(word))
        english_ordinary = any(r.get("word") == word for r in wik.get(word, []))
        if scots_ordinary and not english_ordinary:
            value = wik_ipa(scots, word)
            return (value, "wiktionary-scots") if value else ("", "")
        if ipa.get(word):
            return ipa[word], "ipa-dict-en-US"
        value = wik_ipa(wik, word)
        if value:
            return value, "wiktionary"
        if ec.get(word, {}).get("phonetic"):
            return ipa_text(ec[word]["phonetic"]), "ecdict"
        if existing.get(word, [""])[0]:
            return existing[word][0], "existing"
        value = wik_ipa(scots, word)
        if value:
            return value, "wiktionary-scots"
        return "", ""

    pronunciation_cache = {}

    def pronunciation(word, seen=()):
        if word in reviewed_ipa:
            return reviewed_ipa[word].copy()
        if word in pronunciation_cache:
            return pronunciation_cache[word].copy()
        if word in seen or len(seen) > 4:
            return {}
        value, source = direct_ipa(word)
        if value:
            result = {"ipa": value, "ipaSource": source, "ipaStatus": "sourced"}
            pronunciation_cache[word] = result
            return result.copy()
        value = initialism_ipa(wik, word)
        if any(r.get("word") == word for r in scots.get(word, [])) or scots_rels.get(word):
            value = ""
        if value:
            return {"ipa": value, "ipaSource": "wiktionary-initialism", "ipaStatus": "derived"}
        for base in spelling_variants(wik, word):
            parent = pronunciation(base, seen + (word,))
            if parent.get("ipa"):
                return {"ipa": parent["ipa"], "ipaSource": "wiktionary-spelling", "ipaStatus": "derived",
                    "base": base, "baseIpaSource": parent["ipaSource"]}
        for base, kind, relation_source in rels.get(word, []):
            if (any(r.get("word") == word for r in scots.get(word, [])) or scots_rels.get(word)) and not any(
                r.get("word") == word for r in wik.get(word, [])) and relation_source != "wiktionary-scots-inflection":
                continue
            parent = pronunciation(base, seen + (word,))
            value = regular_inflection(base, word, kind, parent.get("ipa", ""))
            if value:
                result = {"ipa": value, "ipaSource": relation_source, "ipaStatus": "derived",
                    "base": base, "relationSource": relation_source, "baseIpaSource": parent["ipaSource"]}
                pronunciation_cache[word] = result
                return result.copy()
        return {}

    out, unresolved_en, unresolved_ipa = {}, [], []
    for word in sorted(words):
        previous = existing.get(word, ["", "", ""])
        row = {}
        if not previous[2]:
            definition = clean(ec.get(word, {}).get("definition", ""))
            source = "ecdict"
            if not definition:
                definition, source = "; ".join(oewn.get(word, [])[:3]), "oewn-2025-plus"
            if not definition:
                if not any(r.get("word") == word for r in wik.get(word, [])) and any(
                    r.get("word") == word for r in scots.get(word, [])):
                    definition, source = "(Scots) " + wik_definition(scots, word), "wiktionary-scots"
                else:
                    ordinary = any(r.get("word") == word for r in wik.get(word, []))
                    if not ordinary:
                        for base, kind, relation_source in rels.get(word, []):
                            if not relation_source.startswith("wiktionary") or base == word:
                                continue
                            base_entries = scots if relation_source == "wiktionary-scots-inflection" else wik
                            if not any(r.get("word") == base for r in base_entries.get(base, [])):
                                continue
                            label = {"s": "plural", "3": "third-person singular", "d": "past form",
                                "p": "past form", "i": "present participle", "r": "comparative", "t": "superlative"}[kind]
                            meaning = wik_definition(base_entries, base)
                            definition = label + " of " + base + (": " + meaning if meaning else "")
                            source = relation_source
                            row["enBase"] = base
                            break
                    if not definition:
                        definition, source = wik_definition(wik, word), "wiktionary"
            if not definition and reviewed_english.get(word, {}).get("en"):
                reviewed = reviewed_english[word]
                definition, source = reviewed["en"], reviewed["enSource"]
                if reviewed.get("sourceUrl"):
                    row["enSourceUrl"] = reviewed["sourceUrl"]
            if definition:
                row.update(en=definition, enSource=source)
            else:
                unresolved_en.append(word)
        if not previous[0]:
            pronunciation_row = pronunciation(word)
            if pronunciation_row:
                row.update(pronunciation_row)
            else:
                unresolved_ipa.append(word)
        if row:
            out[word] = row
    missing_before_prediction = unresolved_ipa.copy()
    predicted = load_json(cache / "espeak-predictions.json", {})
    if args.predict_missing:
        executable = shutil.which("espeak-ng")
        if not executable:
            raise SystemExit("--predict-missing requires espeak-ng on PATH")
        predicted = predict_espeak(unresolved_ipa, cache / "espeak-predictions.json", executable)
    for word in unresolved_ipa:
        if predicted.get("words", {}).get(word):
            out.setdefault(word, {}).update(ipa=predicted["words"][word], ipaStatus="unverified",
                ipaSource="espeak-ng (predicted)", ipaEngine=predicted["engine"], ipaVoice=predicted["voice"])
    unresolved_ipa = [w for w in unresolved_ipa if not out.get(w, {}).get("ipa")]
    dump(cache / "english-ipa-additions.json", out)
    dump(cache / "unresolved-en.json", unresolved_en)
    dump(cache / "unresolved-ipa.json", unresolved_ipa)
    report = {"scope": len(words), "addedEnglish": sum("en" in r for r in out.values()),
        "addedIpa": sum("ipa" in r for r in out.values()),
        "derivedIpa": sum(r.get("ipaStatus") == "derived" for r in out.values()),
        "predictedIpa": sum(r.get("ipaStatus") == "unverified" for r in out.values()),
        "unresolvedEnglish": len(unresolved_en), "unresolvedIpa": len(unresolved_ipa),
        "ipaGapsBeforePrediction": len(missing_before_prediction), "predictionEngine": predicted.get("engine")}
    dump(cache / "english-ipa-report.json", report)
    print(json.dumps(report))


if __name__ == "__main__":
    main()
