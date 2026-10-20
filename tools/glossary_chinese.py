#!/usr/bin/env python3
"""Reuse licensed Chinese definitions without guessing English stems.

Inputs live outside the repository; the output is an additions map consumed by
the main glossary build. Existing definitions are never regenerated here.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from pathlib import Path


def key(word: str) -> str:
    return unicodedata.normalize("NFC", word).lower().strip()


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\\n", "; ").replace("\\r", " ")).strip()


def read_ecdict(path: Path) -> dict:
    rows = {}
    with path.open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            word = key(row["word"])
            # A genuine lower-case lemma wins over a same-spelling name.
            if word not in rows or row["word"] == word:
                rows[word] = row
    return rows


def has_chinese(value: str) -> bool:
    return bool(re.search(r"[\u3400-\u9fff]", value or ""))


def collect(scope: dict, existing: dict, rows: dict) -> tuple[dict, list]:
    additions = {}
    words = {key(item["word"]) for item in scope["words"]}
    missing = {word for word in words if not has_chinese(existing.get(word, ["", ""])[1])}
    for word in sorted(missing):
        translation = clean(rows.get(word, {}).get("translation", ""))
        if has_chinese(translation):
            additions[word] = {"zh": translation, "zhSource": "ECDICT"}

    # Explicit ECDICT exchange records, not suffix-based stemming.
    labels = {"s": "复数", "p": "过去式", "d": "过去分词", "i": "现在分词",
              "3": "第三人称单数", "r": "比较级", "t": "最高级"}
    forms = {}
    for base, row in rows.items():
        translation = clean(row.get("translation", ""))
        if not has_chinese(translation):
            continue
        for item in row.get("exchange", "").split("/"):
            if ":" not in item:
                continue
            code, value = item.split(":", 1)
            if code not in labels:
                continue
            for form in value.split(","):
                form = key(form)
                if form in missing and form not in additions and form != base:
                    forms.setdefault(form, {}).setdefault(base, set()).add(code)
    for word, bases in sorted(forms.items()):
        if len(bases) != 1:
            continue
        base, codes = next(iter(bases.items()))
        form_label = "、".join(labels[code] for code in labels if code in codes)
        additions[word] = {"zh": f"{base} 的{form_label}：{clean(rows[base]['translation'])}",
                           "zhSource": "ECDICT exchange + translation", "base": base}

    return additions, sorted(missing - additions.keys())


def wiktionary_fill(words: list, existing: dict, rows: dict, additions: dict,
                    entries: dict, corrections: dict) -> list:
    """Follow only dictionary-declared form/alternative relations."""
    cache = {}
    # Wiktionary often lists an inflection on its lemma without a separate
    # inflected-word page. These are still explicit, sourced relations.
    needed = set(words)
    for base, records in list(entries.items()):
        for record in records[:]:
            for form in record.get("forms", []):
                word = key(form.get("form", ""))
                tags = form.get("tags", [])
                if word not in needed or word == base or "canonical" in tags:
                    continue
                entries.setdefault(word, []).append({
                    "word": word, "pos": record.get("pos"),
                    "senses": [{"form_of": [{"word": base}], "tags": tags,
                                "glosses": ["documented inflection of " + base]}],
                    "sourceWord": record.get("word", base),
                })

    def lookup(word: str, trail: tuple = ()):
        word = key(word)
        if word in trail or len(trail) > 5:
            return None
        if word in corrections:
            return corrections[word]
        if word in additions:
            return additions[word]
        if word in cache:
            return cache[word]
        old = existing.get(word, ["", ""])[1]
        if has_chinese(old):
            return {"zh": old, "zhSource": "existing dictionary"}
        translation = clean(rows.get(word, {}).get("translation", ""))
        if has_chinese(translation):
            return {"zh": translation, "zhSource": "ECDICT"}
        result = None
        # Ordinary lower-case entries take precedence over names/initialisms.
        records = sorted(entries.get(word, []), key=lambda row: row.get("word", "") != word)
        for record in records:
            refs = []
            for sense in record.get("senses", []):
                relation = "form_of" if sense.get("form_of") else "alt_of"
                for reference in sense.get(relation, []):
                    base = key(reference["word"])
                    meaning = lookup(base, (*trail, word))
                    if not meaning or not has_chinese(meaning["zh"]):
                        continue
                    tags = set(sense.get("tags", []))
                    if relation == "alt_of":
                        label = "异体拼写"
                    elif "plural" in tags:
                        label = "复数"
                    elif "comparative" in tags:
                        label = "比较级"
                    elif "superlative" in tags:
                        label = "最高级"
                    elif "participle" in tags and "past" in tags:
                        gloss = " ".join(sense.get("glosses", []))
                        label = "过去式和过去分词" if "past and past participle" in gloss else "过去分词"
                    elif "past" in tags:
                        label = "过去式"
                    elif "participle" in tags and "present" in tags:
                        label = "现在分词"
                    elif "third-person" in tags and "singular" in tags:
                        label = "第三人称单数"
                    else:
                        label = "词形"
                    refs.append((base, label, meaning["zh"]))
            if refs:
                unique = list(dict.fromkeys(refs))[:3]
                result = {"zh": "；".join(f"{base} 的{label}：{meaning}" for base, label, meaning in unique),
                          "zhSource": "Wiktionary form + reused Chinese definition",
                          "base": unique[0][0], "sourceUrl": "https://en.wiktionary.org/wiki/" + record.get("sourceWord", record.get("word", word))}
                break
            chinese = list(dict.fromkeys(clean(t["word"]) for t in record.get("translations", [])
                                        if t.get("code") in {"zh", "cmn"} and has_chinese(t.get("word", ""))))
            if chinese:
                result = {"zh": "；".join(chinese[:8]), "zhSource": "Wiktionary Chinese translations",
                          "sourceUrl": "https://en.wiktionary.org/wiki/" + record.get("word", word)}
                break
        cache[word] = result
        return result

    for word in words:
        result = lookup(word)
        if result:
            additions[word] = result
    return [word for word in words if word not in additions]


def verified_form_links(scope: dict, entries: dict, rows: dict) -> dict:
    wanted = {key(item["word"]) for item in scope["words"]}
    links = {}

    def add(word: str, base: str, tags: list, relation: str, source: str, url: str):
        word, base = key(word), key(base)
        if word not in wanted or word == base:
            return
        link = {"base": base, "tags": sorted(set(tags)), "relation": relation,
                "source": source, "sourceUrl": url}
        if link not in links.setdefault(word, []):
            links[word].append(link)

    for base, records in entries.items():
        for record in records:
            url = "https://en.wiktionary.org/wiki/" + record.get("word", base)
            for form in record.get("forms", []):
                if "canonical" not in form.get("tags", []):
                    add(form.get("form", ""), base, form.get("tags", []), "form_of", "Wiktionary forms", url)
            for sense in record.get("senses", []):
                for relation in ("form_of", "alt_of"):
                    for reference in sense.get(relation, []):
                        add(base, reference["word"], sense.get("tags", []), relation, "Wiktionary sense", url)
    for base, row in rows.items():
        for part in row.get("exchange", "").split("/"):
            if ":" not in part:
                continue
            code, forms = part.split(":", 1)
            labels = {"s": ["plural"], "p": ["past"], "d": ["past", "participle"],
                      "i": ["present", "participle"], "3": ["third-person", "singular"],
                      "r": ["comparative"], "t": ["superlative"]}
            if code in labels:
                for word in forms.split(","):
                    add(word, base, labels[code], "form_of", "ECDICT exchange", "https://github.com/skywind3000/ECDICT")
    return {word: links[word] for word in sorted(links)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path, default=Path("/tmp/word-glossary-sources"))
    parser.add_argument("--dict", type=Path, default=Path(__file__).resolve().parents[1] / "dict")
    args = parser.parse_args()
    scope = json.loads((args.sources / "scope.json").read_text())
    existing = {}
    for path in sorted(args.dict.glob("[a-z].json")):
        existing.update(json.loads(path.read_text()))
    rows = read_ecdict(args.sources / "ecdict.csv")
    corrections_file = args.sources / "chinese-corrections.json"
    corrections = json.loads(corrections_file.read_text()) if corrections_file.exists() else {}
    additions, missing = collect(scope, existing, rows)
    reviewed = {}
    for reviewed_file in sorted(args.sources.glob("chinese-reviewed*.json")):
        reviewed.update(json.loads(reviewed_file.read_text()))
    bilingual_review_file = args.sources / "english-reviewed.json"
    if bilingual_review_file.exists():
        reviewed.update({word: entry for word, entry in json.loads(bilingual_review_file.read_text()).items()
                         if has_chinese(entry.get("zh", ""))})
    for word in missing[:]:
        if word in reviewed:
            additions[word] = reviewed[word]
            missing.remove(word)
    entries_file = args.sources / "wiktionary-entries.json"
    if entries_file.exists():
        entries = json.loads(entries_file.read_text())
        (args.sources / "verified-form-links.json").write_text(json.dumps(
            verified_form_links(scope, entries, rows), ensure_ascii=False, indent=2) + "\n")
        missing = wiktionary_fill(missing, existing, rows, additions, entries, corrections)
    # A reviewed lexical correction must also replace any provisional addition,
    # including its old form base; otherwise stale abbreviation/name metadata
    # can survive even when the displayed definition has been corrected.
    for word in additions.keys() & corrections.keys():
        if has_chinese(corrections[word].get("zh", "")):
            additions[word] = dict(corrections[word])
    (args.sources / "chinese-additions.json").write_text(json.dumps(additions, ensure_ascii=False, indent=2) + "\n")
    (args.sources / "missing-chinese.json").write_text(json.dumps(missing, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"additions": len(additions), "missing": len(missing)}))


if __name__ == "__main__":
    main()
