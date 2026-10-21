#!/usr/bin/env python3
"""Build one deduplicated bilingual dictionary for the eight shipped libraries.

Existing dict shards and a previous build are reused. Optional additions produced
by glossary_english.py / glossary_chinese.py fill only missing fields. Reviewed
corrections are explicit; source dictionaries stay outside the repository.
"""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'data/glossary/default.json'
MANIFEST = ROOT / 'data/glossary/manifest.json'
FIELDS = ('ipa', 'zh', 'en')


def read(path, default=None):
    return json.loads(path.read_text()) if path.exists() else ({} if default is None else default)


def key(word):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', word).strip()).lower()


def scope():
    script = """const L=require('./src/library'),d=require('./data/game_vocab/catalog.json');
    const libraries=L.tieredRecipes(d).map(r=>({id:r.id,name:r.name,words:L.compile(d,r).words,
      rawWords:L.compile(d,{...r,targetPool:{...r.targetPool,excludeTwoLetter:false},extraPool:{...r.extraPool,excludeTwoLetter:false}}).words}));
    process.stdout.write(JSON.stringify({datasetHash:d.datasetHash,libraries}));"""
    result = json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT, text=True))
    raw = [key(w) for lib in result['libraries'] for w in lib['rawWords']]
    words = sorted({key(w) for lib in result['libraries'] for w in lib['words'] if len(key(w)) >= 3})
    short = sorted({w for w in raw if len(w) < 3})
    return result, words, short, len(raw) - len(set(raw))


def canonical(value):
    return (json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n').encode()


def legacy_rows():
    rows = {}
    for path in sorted((ROOT / 'dict').glob('[a-z].json')):
        for word, row in read(path).items():
            rows[key(word)] = row
    return rows


def merge_correction(target, correction):
    """Keep meaning and pronunciation provenance independent when merging fixes."""
    for field in FIELDS:
        if not correction.get(field):
            continue
        target[field] = correction[field]
        target[field + 'Source'] = correction.get(field + 'Source', 'reviewed-correction')
        for suffix, generic in (('Base', 'base'), ('SourceUrl', 'sourceUrl')):
            target.pop(field + suffix, None)
            value = correction.get(field + suffix) or correction.get(generic)
            if value:
                target[field + suffix] = value
        if field == 'ipa':
            target['ipaStatus'] = correction.get('ipaStatus', 'sourced')
            for detail in ('ipaEngine', 'ipaVoice', 'relationSource', 'baseIpaSource', 'baseIpaSourceUrl'):
                target.pop(detail, None)
                if correction.get(detail):
                    target[detail] = correction[detail]
    for detail in ('note', 'usageNote'):
        if correction.get(detail):
            target[detail] = correction[detail]
    return target


def build(sources=None):
    selected, words, excluded, duplicates = scope()
    legacy = legacy_rows()
    # A source refresh always starts with the original, reusable shards. This
    # prevents an intermediate generated value from shadowing a later correction.
    previous = {} if sources else read(OUTPUT).get('entries', {})
    entries = {}
    for word in words:
        row = list((previous.get(word) or legacy.get(word) or ['', '', ''])[:3])
        row += [''] * (3 - len(row))
        meta = dict(previous.get(word, [None] * 4)[3] or {}) if len(previous.get(word, [])) > 3 else {}
        for i, field in enumerate(FIELDS):
            if row[i] and not meta.get(field + 'Source'):
                meta[field + 'Source'] = 'legacy-dict'
        if row[0] and not meta.get('ipaStatus'):
            meta['ipaStatus'] = 'sourced'
        entries[word] = row + [meta]

    if sources:
        for filename in ('english-ipa-additions.json', 'chinese-additions.json', 'english-reviewed.json'):
            for word, addition in read(sources / filename).items():
                word = key(word)
                if word not in entries:
                    continue
                row = entries[word]
                for i, field in enumerate(FIELDS):
                    missing = not row[i] or (field == 'zh' and not re.search(r'[\u3400-\u9fff]', row[i]))
                    if addition.get(field) and missing:
                        row[i] = addition[field].strip()
                        row[3][field + 'Source'] = addition.get(field + 'Source', filename)
                        source_url = addition.get(field + 'SourceUrl') or addition.get('sourceUrl')
                        if source_url:
                            row[3][field + 'SourceUrl'] = source_url
                        if addition.get(field + 'Base') or addition.get('base'):
                            row[3][field + 'Base'] = addition.get(field + 'Base') or addition['base']
                        if field == 'ipa':
                            row[3]['ipaStatus'] = addition.get('ipaStatus', 'sourced')
                            for detail in ('ipaEngine', 'ipaVoice', 'relationSource', 'baseIpaSource', 'baseIpaSourceUrl'):
                                if addition.get(detail):
                                    row[3][detail] = addition[detail]
                for field in ('note',):
                    if addition.get(field):
                        row[3][field] = addition[field]
        corrections = {w: merge_correction({}, c) for w, c in read(ROOT / 'data/glossary/corrections.json').items()}
        for filename in ('english-ipa-corrections.json', 'chinese-corrections.json'):
            for word, correction in read(sources / filename).items():
                merge_correction(corrections.setdefault(key(word), {}), correction)
        # Human-reviewed sense alignment is applied after generic extraction.
        # The UI translation file contains nine explicit English corrections;
        # other entries in it are ordinary additions, not replacements.
        for filename in ('chinese-reviewed-ui.json', 'capital-reviewed-ui.json'):
            for word, correction in read(sources / filename).items():
                if correction.get('en'):
                    merge_correction(corrections.setdefault(key(word), {}), correction)
        for word, correction in read(ROOT / 'data/glossary/reviewed/parent-corrections.json').items():
            merge_correction(corrections.setdefault(key(word), {}), correction)
        if corrections:
            (ROOT / 'data/glossary').mkdir(parents=True, exist_ok=True)
            (ROOT / 'data/glossary/corrections.json').write_text(json.dumps(corrections, ensure_ascii=False, indent=2) + '\n')
    else:
        corrections = read(ROOT / 'data/glossary/corrections.json')
    # Paired sense reviews must win over both legacy rows and refreshed source
    # caches. Apply them in offline builds too, without requiring /tmp inputs.
    review_dir = ROOT / 'data/glossary/reviewed'
    review_paths = [review_dir / 'sense-alignment.json']
    dated_reviews = list(review_dir.glob('full-audit-*/*.json'))
    dated_reviews += list(review_dir.glob('dictionary-followup-*/*.json'))
    # Later evidence wins; within a date, dictionary follow-ups supersede the
    # initial audit. A future full audit can still supersede an older follow-up.
    def review_order(path):
        date = re.search(r'\d{4}-\d{2}-\d{2}', path.parent.name)
        return (date.group() if date else '', path.parent.name.startswith('dictionary-followup-'), path.name)
    review_paths += sorted(dated_reviews, key=review_order)
    for path in review_paths:
        for word, correction in read(path).items():
            if not correction.get('zh') or not correction.get('en'):
                raise ValueError('Sense review requires both zh and en: ' + word)
            merge_correction(corrections.setdefault(key(word), {}), correction)
    for word, correction in corrections.items():
        if word not in entries:
            continue
        row = entries[word]
        for i, field in enumerate(FIELDS):
            if correction.get(field):
                row[i] = correction[field].strip()
                row[3][field + 'Source'] = correction.get(field + 'Source', 'reviewed-correction')
                row[3].pop(field + 'Base', None)
                row[3].pop(field + 'SourceUrl', None)
                if correction.get(field + 'Base') or correction.get('base'):
                    row[3][field + 'Base'] = correction.get(field + 'Base') or correction['base']
                source_url = correction.get(field + 'SourceUrl') or correction.get('sourceUrl')
                if source_url:
                    row[3][field + 'SourceUrl'] = source_url
                if field == 'ipa':
                    row[3]['ipaStatus'] = correction.get('ipaStatus', 'sourced')
                    for detail in ('ipaEngine', 'ipaVoice', 'relationSource', 'baseIpaSource', 'baseIpaSourceUrl'):
                        row[3].pop(detail, None)
                        if correction.get(detail):
                            row[3][detail] = correction[detail]
        # Correction reasons stay in the audit file; only lexical usage notes
        # belong in the word definition shown to the user.
        if correction.get('usageNote'):
            row[3]['note'] = correction['usageNote']

    # A reviewed but unresolved entry must remain visibly distinct from a
    # confirmed correction, even when the legacy dictionary supplied its IPA.
    audit_paths = sorted((ROOT / 'data/glossary/audits').glob('*/pending.json'))
    pending = {key(item['word']) for item in read(audit_paths[-1], [])} if audit_paths else set()
    for word, row in entries.items():
        row[3].pop('reviewStatus', None)
        if word in pending:
            row[3]['reviewStatus'] = 'pending'
    missing = {field: [w for w, row in entries.items() if not row[i].strip() or (field == 'zh' and not re.search(r'[\u3400-\u9fff]', row[i]))] for i, field in enumerate(FIELDS)}
    for row in entries.values():
        row[3] = dict(sorted(row[3].items()))
    licenses = {p.stem: p.read_text() for p in sorted((ROOT / 'data/glossary/licenses').glob('*.txt'))}
    package = {'schemaVersion': 1, 'datasetHash': selected['datasetHash'], 'minimumLength': 3,
               'licenses': licenses, 'entries': entries}
    libraries = [{'id': lib['id'], 'name': lib['name'], 'words': sum(len(w) >= 3 for w in lib['words'])} for lib in selected['libraries']]
    manifest = {'schemaVersion': 1, 'datasetHash': selected['datasetHash'], 'minimumLength': 3,
                'uniqueWords': len(words), 'excludedShortWords': [w.upper() for w in excluded],
                'duplicateOccurrencesBeforeLengthFilter': duplicates, 'libraries': libraries,
                'legacyWordsReused': sum(w in legacy for w in words),
                'newWords': sum(w not in legacy for w in words),
                'correctedWords': len(set(corrections) & set(words)),
                'pronunciations': dict(sorted(Counter(row[3].get('ipaStatus', 'missing') for row in entries.values()).items())),
                'sources': {field: dict(sorted(Counter(row[3].get(field + 'Source', 'missing') for row in entries.values()).items())) for field in FIELDS},
                'missing': missing, 'sha256': hashlib.sha256(canonical(package)).hexdigest()}
    old_hashes = read(MANIFEST).get('sourceFiles', {})
    if sources:
        for filename in ('ecdict.csv', 'ipa-en_US.txt', 'english-wordnet-2025-plus.xml.gz', 'kaikki-English.jsonl.gz', 'kaikki-Scots.jsonl.gz'):
            path = sources / filename
            if path.exists():
                with path.open('rb') as stream:
                    old_hashes[filename] = hashlib.file_digest(stream, 'sha256').hexdigest()
    manifest['sourceFiles'] = dict(sorted(old_hashes.items()))
    return package, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, help='cached source/additions directory; no network requests')
    parser.add_argument('--scope-output', type=Path, help='write the deduplicated work list for source helpers and exit')
    parser.add_argument('--check', action='store_true', help='verify current generated dictionary without writing')
    parser.add_argument('--allow-incomplete', action='store_true', help='write an intermediate build with reported gaps')
    args = parser.parse_args()
    if args.scope_output:
        selected, words, short, _ = scope()
        args.scope_output.parent.mkdir(parents=True, exist_ok=True)
        args.scope_output.write_text(json.dumps({'datasetHash': selected['datasetHash'], 'minimumLength': 3,
            'words': [{'word': word.upper()} for word in words], 'excludedShortWords': [word.upper() for word in short]}, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({'words': len(words), 'excluded': len(short)}))
        return
    package, manifest = build(args.sources)
    gaps = {field: len(words) for field, words in manifest['missing'].items()}
    if any(gaps.values()) and not args.allow_incomplete:
        raise SystemExit('Incomplete dictionary: ' + json.dumps(gaps))
    if args.check:
        if read(OUTPUT) != package or read(MANIFEST) != manifest:
            raise SystemExit('Dictionary or manifest is stale; run tools/build_glossary.py')
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_bytes(canonical(package))
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'words': len(package['entries']), 'missing': gaps, 'ipa': manifest['pronunciations'], 'sha256': manifest['sha256']}))


if __name__ == '__main__':
    main()
