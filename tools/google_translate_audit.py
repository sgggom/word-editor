#!/usr/bin/env python3
"""Collect real Google translations and triage bilingual glossary differences.

Uses Google's public Translate endpoint, not the authenticated Cloud API.
Never edits the runtime glossary. Raw responses, source hashes and stable IDs
are retained. Similarity is a triage signal, never a semantic approval.
"""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
ENDPOINT = 'https://translate.googleapis.com/translate_a/single'
PROVIDER = 'Google Translate public endpoint (client=gtx; not Cloud Translation API)'
MARKER = re.compile(r'[\[［【]\s*(W\d{5}P\d{3})\s*[\]］】]')


def stamp():
    return datetime.now(timezone.utc).isoformat()


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def read_json(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + f'.{os.getpid()}.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    tmp.replace(path)


def atomic_lines(path, rows):
    tmp = path.with_name(path.name + f'.{os.getpid()}.tmp')
    tmp.write_text(''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in rows))
    tmp.replace(path)


def translated_text(response):
    if not isinstance(response, list) or not response or not isinstance(response[0], list):
        raise ValueError('Google returned an unexpected response shape')
    text = ''.join(item[0] for item in response[0] if isinstance(item, list) and item and isinstance(item[0], str))
    if not text.strip():
        raise ValueError('Google returned no translated text')
    return text


def parse_marked(text, expected):
    matches = list(MARKER.finditer(text))
    actual = [match[1] for match in matches]
    # Never pair by line position if a marker disappears, repeats or moves.
    if actual != expected or len(set(actual)) != len(actual):
        raise ValueError(f'Translation marker mismatch: expected {expected}, got {actual}')
    if text[:matches[0].start()].strip():
        raise ValueError('Unexpected text before first translation marker')
    result = {}
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        value = text[match.end():end].strip()
        if not value:
            raise ValueError('Empty translation for ' + match[1])
        result[match[1]] = value
    return result


def pieces(text, limit=2200):
    # Preserve all source characters; long definitions are split, not truncated.
    result = []
    while len(text) > limit:
        cut = max(text.rfind('; ', 0, limit), text.rfind('. ', 0, limit), text.rfind(' ', 0, limit))
        cut = cut + 1 if cut >= limit // 3 else limit
        result.append(text[:cut])
        text = text[cut:]
    if text:
        result.append(text)
    return result


def units_for(rows):
    units = []
    for row in rows:
        parts = pieces(row['en'])
        assert ''.join(parts) == row['en']
        for i, part in enumerate(parts):
            units.append({'id': f"{row['id']}P{i:03d}", 'word': row['word'], 'text': part})
    return units


def batches_for(units, limit=3400):
    batch, length = [], 0
    for unit in units:
        size = len(unit['text']) + len(unit['id']) + 4
        if batch and (length + size > limit or len(batch) >= 40):
            yield batch
            batch, length = [], 0
        batch.append(unit)
        length += size
    if batch:
        yield batch


class ServiceBlocked(RuntimeError):
    pass


class GoogleCollector:
    def __init__(self, audit, folder, interval):
        self.audit, self.folder, self.interval = audit, folder, interval
        self.requests = 0
        self.cached = 0
        self.attempt_log = folder / 'request-log.jsonl'

    def rate_slot(self):
        with (self.audit / 'rate.lock').open('a+') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            blocked = read_json(self.audit / 'SERVICE_BLOCKED.json')
            if blocked:
                raise ServiceBlocked(blocked['reason'])
            rate = read_json(self.audit / 'rate.json', {})
            delay = max(0, rate.get('nextAt', 0) - time.time())
            if delay:
                time.sleep(delay)
            atomic_json(self.audit / 'rate.json', {'nextAt': time.time() + self.interval})

    def request(self, payload):
        request_id = digest('en\0zh-CN\0' + payload)
        raw_path = self.folder / 'raw' / (request_id + '.json')
        old = read_json(raw_path)
        if old and old.get('sourceText') == payload and old.get('httpStatus') == 200:
            self.cached += 1
            return translated_text(old['response']), request_id
        url = ENDPOINT + '?' + urllib.parse.urlencode({'client': 'gtx', 'sl': 'en', 'tl': 'zh-CN', 'dt': 't', 'q': payload})
        for attempt in range(3):
            self.rate_slot()
            started = stamp()
            self.requests += 1
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=25) as response:
                    data = json.load(response)
                    status = response.status
                text = translated_text(data)
                atomic_json(raw_path, {'provider': PROVIDER, 'endpoint': ENDPOINT, 'sourceLanguage': 'en', 'targetLanguage': 'zh-CN', 'requestedAt': started, 'receivedAt': stamp(), 'httpStatus': status, 'sourceText': payload, 'requestId': request_id, 'response': data})
                with self.attempt_log.open('a') as log:
                    log.write(json.dumps({'at': started, 'requestId': request_id, 'status': status, 'characters': len(payload)}) + '\n')
                return text, request_id
            except urllib.error.HTTPError as error:
                with self.attempt_log.open('a') as log:
                    log.write(json.dumps({'at': started, 'requestId': request_id, 'status': error.code, 'error': str(error)}) + '\n')
                if error.code in (403, 429):
                    reason = f'Google returned HTTP {error.code}; all workers stopped without bypassing access or rate restrictions'
                    atomic_json(self.audit / 'SERVICE_BLOCKED.json', {'at': stamp(), 'reason': reason, 'status': error.code, 'retryAfter': error.headers.get('Retry-After')})
                    raise ServiceBlocked(reason) from error
                if error.code not in (408, 500, 502, 503, 504) or attempt == 2:
                    raise
            except (OSError, ValueError) as error:
                with self.attempt_log.open('a') as log:
                    log.write(json.dumps({'at': started, 'requestId': request_id, 'error': str(error), 'attempt': attempt + 1}) + '\n')
                if attempt == 2:
                    raise
            time.sleep(2 ** (attempt + 1))
        raise AssertionError('unreachable')

    def translate_batch(self, batch, translations, failures):
        payload = '\n'.join(f"[{u['id']}] {u['text']}" for u in batch)
        text, request_id = self.request(payload)
        try:
            parsed = parse_marked(text, [u['id'] for u in batch])
        except ValueError:
            # Split uncertain batches. A single unmarked request has exactly
            # one known input, so its output can be bound without guessing IDs.
            if len(batch) == 1:
                text, request_id = self.request(batch[0]['text'])
                parsed = {batch[0]['id']: text.strip()}
            else:
                middle = len(batch) // 2
                self.translate_batch(batch[:middle], translations, failures)
                self.translate_batch(batch[middle:], translations, failures)
                return
        for unit in batch:
            translations[unit['id']] = {'text': parsed[unit['id']], 'requestId': request_id}


def collect(args):
    audit = args.audit_dir.resolve()
    rows = [json.loads(line) for line in (audit / (args.shard + '-input.jsonl')).read_text().splitlines()]
    folder = audit / args.shard
    folder.mkdir(parents=True, exist_ok=True)
    collector = GoogleCollector(audit, folder, args.interval)
    units = units_for(rows)
    batches = list(batches_for(units))
    translations, failures = {}, {}
    grouped = {}
    for unit in units:
        grouped.setdefault(unit['word'], []).append(unit['id'])

    def save(status, message=''):
        results = []
        for row in rows:
            ids = grouped[row['word']]
            complete = all(i in translations for i in ids)
            errors = [failures[i] for i in ids if i in failures]
            results.append({**row, 'provider': PROVIDER, 'sourceSha256': digest(row['en']), 'translationStatus': 'success' if complete else 'error' if errors else 'not_attempted', 'googleZh': '\n'.join(translations[i]['text'] for i in ids) if complete else None, 'requestIds': list(dict.fromkeys(translations[i]['requestId'] for i in ids if i in translations)), 'error': '; '.join(errors) if errors else None})
        atomic_lines(folder / 'translations.jsonl', results)
        counts = Counter(r['translationStatus'] for r in results)
        state = {'shard': args.shard, 'state': status, 'updatedAt': stamp(), 'words': len(rows), 'statuses': dict(counts), 'networkRequestsThisRun': collector.requests, 'cacheHitsThisRun': collector.cached, 'message': message}
        atomic_json(folder / 'progress.json', state)
        print(json.dumps(state, ensure_ascii=False), flush=True)

    for index, batch in enumerate(batches):
        if args.max_batches and index >= args.max_batches:
            save('paused_after_requested_smoke_batches')
            return
        try:
            collector.translate_batch(batch, translations, failures)
        except ServiceBlocked as error:
            save('blocked', str(error))
            raise SystemExit(2)
        except Exception as error:
            for unit in batch:
                if unit['id'] not in translations:
                    failures[unit['id']] = type(error).__name__ + ': ' + str(error)
        if index == 0 or (index + 1) % 10 == 0:
            save('collecting', f'{index + 1}/{len(batches)} batches')
    save('complete' if not failures else 'complete_with_errors')


FORM_NOISE = re.compile(r'第三人称单数|现在分词|过去分词|过去式|简单过去时|比较级|最高级|复数形式|单数形式|异体拼写|替代拼写|另一种拼写|变体|形式|复数|单数|词形|拼写|一种|一个|这个|这些|那些|表示|指的是|是指|的|了|或|和|与|及|等')


def han(text):
    return ''.join(re.findall(r'[\u3400-\u9fff]', FORM_NOISE.sub('', text)))


def source_integrity_signals(text):
    """Suggest manual checks; a boundary or open clause alone proves no error."""
    signals = []
    if len(text) == 220:
        signals.append('exact_220_characters')
    if len(text) > 100 and re.search(r'\b(?:a|an|the|and|or|which|whose)\s*$', text):
        signals.append('dangling_article_or_connector')
    if text.count('(') > text.count(')'):
        signals.append('unclosed_parenthesis')
    return signals


def compare(args):
    folder = args.audit_dir.resolve() / args.shard
    rows = [json.loads(line) for line in (folder / 'translations.jsonl').read_text().splitlines()]
    comparisons, candidates = [], []
    for row in rows:
        record = {k: row[k] for k in ['id', 'word', 'en', 'zh', 'googleZh', 'translationStatus', 'sourceSha256', 'requestIds']}
        record['semanticVerdict'] = 'not_reviewed_by_model'
        if row['translationStatus'] != 'success':
            record.update(signal='translation_missing', priority=3, reasons=[row.get('error') or 'Google translation not completed'])
        else:
            a, b = han(row['zh']), han(row['googleZh'])
            sa, sb = set(a), set(b)
            shared = len(sa & sb)
            overlap = shared / min(len(sa), len(sb)) if sa and sb else 0
            score = 2 * shared / (len(sa) + len(sb)) if sa or sb else 0
            record.update(hanOverlap=round(overlap, 4), hanDice=round(score, 4))
            reasons = []
            if not b:
                signal, priority = 'reference_or_untranslated', 1
                reasons.append('Google output has no Chinese meaning after removing word-form boilerplate')
            elif a == b:
                signal, priority = 'same_chinese_after_normalization', 0
            elif not a or overlap < 0.25:
                signal, priority = 'low_lexical_overlap', 3
                reasons.append('Few shared Chinese meaning characters; possible different senses or synonymous wording')
            elif score < 0.35 and overlap < 0.6:
                signal, priority = 'partial_lexical_overlap', 2
                reasons.append('Chinese lexical overlap is limited; check senses and extra meanings')
            else:
                signal, priority = 'lexical_overlap_only', 0
            # These signals are strictly suggestive. They do not establish that
            # either the glossary or Google is right.
            if re.search(r'第三人称单数', row['zh']) and re.match(r'(?i)(?:n\.\s*)?plural of\b', row['en']) and not re.search(r'(?i)third.person', row['en']):
                reasons.append('Chinese says third-person verb while English only identifies a noun plural')
                signal, priority = 'word_form_conflict', 3
            if re.search(r'人名|姓氏|地名', row['zh']) and not re.search(r'(?i)surname|given name|proper noun|place.name|named|born|city|town|village|river|island|mountain|county|capital|province|district', row['en']):
                reasons.append('Chinese includes a person/place-name gloss without an apparent English counterpart')
                signal, priority = 'possible_name_contamination', max(priority, 2)
            if re.search(r'(?i)abbr\.|缩写|计算机辅助', row['zh']) and not re.search(r'(?i)abbreviat|initialism|acronym|short for|shortened|comput', row['en']):
                reasons.append('Chinese includes an acronym expansion without an apparent English counterpart')
                signal, priority = 'possible_acronym_contamination', max(priority, 2)
            record.update(signal=signal, priority=priority, reasons=reasons)
        comparisons.append(record)
        if record['priority'] >= 2:
            candidates.append(record)
    candidates.sort(key=lambda r: (-r['priority'], r.get('hanDice', 0), r['word']))
    atomic_lines(folder / 'comparisons.jsonl', comparisons)
    atomic_lines(folder / 'candidates.jsonl', candidates)
    integrity = [{**r, 'sourceIntegritySignals': source_integrity_signals(r['en'])} for r in comparisons if source_integrity_signals(r['en'])]
    atomic_lines(folder / 'source-integrity-candidates.jsonl', integrity)
    summary = {'words': len(rows), 'translationStatuses': dict(Counter(r['translationStatus'] for r in rows)), 'signals': dict(Counter(r['signal'] for r in comparisons)), 'candidateWords': len(candidates), 'sourceIntegrityCandidates': len(integrity), 'note': 'String similarity and source-integrity signals are for triage only. No row receives a semantic pass from this script.'}
    atomic_json(folder / 'comparison-summary.json', summary)
    print(json.dumps(summary, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['collect', 'compare'])
    parser.add_argument('--audit-dir', type=Path, required=True)
    parser.add_argument('--shard', required=True, choices=['part01', 'part02', 'part03'])
    parser.add_argument('--interval', type=float, default=1.25, help='shared minimum seconds between Google requests')
    parser.add_argument('--max-batches', type=int, default=0, help='bounded smoke run; zero collects the complete shard')
    args = parser.parse_args()
    if args.interval < 1:
        parser.error('shared request interval must be at least one second')
    (collect if args.command == 'collect' else compare)(args)


if __name__ == '__main__':
    main()
