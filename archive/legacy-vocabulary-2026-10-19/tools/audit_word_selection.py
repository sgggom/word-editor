#!/usr/bin/env python3
"""Rebuild word-selection evidence from the bundled competitor records.

This audits observed usage, not human familiarity. It never changes role, grade,
lemma, or other source fields. Run with --check to verify generated artifacts.
Only the Python standard library is needed.
"""
import argparse
from collections import Counter, defaultdict
import gzip
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
WT_MAIN = ('wt-list0', 'wt-list5')
ZEN = ('zen-t1', 'zen-t3', 'zen-t1time', 'zen-ios', 'zen-android')
CATEGORIES = ('stable_target', 'conditional_target', 'stable_extra', 'insufficient')


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def word(value):
    value = str(value).upper()
    if not re.fullmatch('[A-Z]+', value):
        raise ValueError(f'Unexpected competitor word: {value!r}')
    return value


def normalize_record(sequence, number, row):
    if sequence.startswith('wt-'):
        targets = {word(x[0]) for x in row[4]}
        extras = {word(x[0]) for x in row[5]}
        board = row[3]
    else:
        targets = {word(x) for x in row[3]}
        extras = {word(x) for part in row[4:7] for x in part}
        board = ''.join(sorted(row[1]))
    return dict(sequence=sequence, number=number, board=board,
                targets=targets, extras=extras - targets,
                overlaps=targets & extras)


def context_key(record):
    return (record['board'], tuple(sorted(record['targets'])),
            tuple(sorted(record['extras'])))


def collect(records, deduplicate=False):
    """Count a word at most once per role/context; target wins source overlaps."""
    result = defaultdict(lambda: dict(targets=0, extras=0, contexts=set(),
                                      sequences=set(), examples={}))
    seen = set()
    for record in records:
        key = context_key(record)
        duplicate = deduplicate and key in seen
        seen.add(key)
        for role in ('targets', 'extras'):
            for w in sorted(record[role]):
                entry = result[w]
                entry['sequences'].add(record['sequence'])
                entry['examples'].setdefault(role, [record['sequence'], record['number']])
                entry['contexts'].add(key)
                if not duplicate:
                    entry[role] += 1
    return {w: dict(targets=e['targets'], extras=e['extras'],
                    contexts=len(e['contexts']), sequences=sorted(e['sequences']),
                    examples=e['examples']) for w, e in result.items()}


def category(entry):
    if not entry:
        return 'insufficient'
    if entry['targets'] and entry['extras']:
        return 'conditional_target'
    if entry['targets']:
        return 'stable_target'
    return 'stable_extra' if entry['extras'] else 'insufficient'


def confidence(entry):
    # An ordinal evidence-strength policy, not a calibrated probability.
    if not entry:
        return 'none'
    if entry['contexts'] >= 5 and len(entry['sequences']) >= 2:
        return 'high'
    return 'medium' if entry['contexts'] >= 2 else 'low'


def trie_for(words):
    tree = {}
    for w in sorted(words):
        node = tree
        for letter in w:
            node = node.setdefault(letter, {})
        node['$'] = w
    return tree


def reachable(board, trie):
    rows = board.split(',')
    width = len(rows[0])
    if not width or any(len(r) != width for r in rows):
        raise ValueError('Invalid rectangular board')
    grid = ''.join(rows)
    count = len(grid)
    neighbors = []
    for i in range(count):
        neighbors.append([j for j in (
            i - 1 if i % width else -1,
            i + 1 if i % width < width - 1 else -1,
            i - width if i >= width else -1,
            i + width if i + width < count else -1) if j >= 0])
    found = set()

    def walk(i, node, used):
        child = node.get(grid[i])
        if child is None:
            return
        if '$' in child:
            found.add(child['$'])
        used |= 1 << i
        for j in neighbors[i]:
            if not used & (1 << j):
                walk(j, child, used)

    for i in range(count):
        walk(i, trie, 0)
    return found


def explain_omissions(record, candidates, trie):
    """Retrospective explanations; length floor is observed, not official config."""
    found = reachable(record['board'], trie)
    omitted = found - record['targets']
    reverse = {w for w in omitted if len(w) == 3 and w[::-1] != w
               and w[::-1] in record['targets']}
    four_plus_only = (all(len(w) >= 4 for w in record['targets']) and
                      all(len(w) >= 4 for w in record['extras']))
    length = {w for w in omitted - reverse if len(w) == 3 and four_plus_only}
    return dict(reverse=reverse, length=length,
                unexplained=omitted - reverse - length,
                unreachable=(record['targets'] & candidates) - found)


def dictionary_flags(entry, gloss):
    flags = []
    if entry.get('lemma'):
        flags.append('source_lemma')
    if not 3 <= len(entry['word']) <= 8:
        flags.append('length_outside_generator')
    if gloss is None:
        flags.append('missing_gloss')
        return flags
    zh, en = gloss[1], gloss[2]
    # These are hints, not lexical verdicts. The dictionary contains homonyms
    # and some noisy abbreviation glosses for ordinary words such as CARS.
    if re.search(r'(^|[；;。]\s*)abbr\.|^缩写|^abbr\b', zh, re.I):
        flags.append('abbreviation_hint')
    if re.search(r'\[人名\]|\[地名\]|人名|姓氏', zh):
        flags.append('name_hint')
    if re.search(r'过去式|过去分词|第三人称|的复数', zh) or en.startswith('(form of '):
        flags.append('inflection_hint')
    return flags


def recommendation(entry, audit, review):
    if entry['role'] == 'blocked':
        return 'blocked', 'existing_block'
    if review.get('decision') == 'hold':
        return 'pending', 'language_boundary'
    if entry.get('lemma'):
        return 'pending', 'source_morphology_guard'
    if not 3 <= len(entry['word']) <= 8:
        return 'pending', 'generator_length_guard'
    if audit['category'] in ('stable_target', 'conditional_target'):
        if 'missing_gloss' in audit['flags'] and not review.get('lexicalConfirmed'):
            return 'pending', 'missing_lexical_evidence'
        return 'candidate', 'wt_target_evidence'
    if audit['category'] == 'stable_extra':
        return 'extra', 'wt_extra_evidence'
    return 'pending', 'insufficient_wt_evidence'


def build(root=ROOT):
    raw_lex = read_json(root / 'src/lex.json')
    lex = [{k: v for k, v in e.items() if k != 'selectionAudit'} for e in raw_lex]
    if len({e['word'] for e in lex}) != len(lex):
        raise ValueError('Duplicate lexicon words')
    review_doc = read_json(root / 'data/word_audit_reviews.json')
    reviews = review_doc['words']
    unknown_reviews = set(reviews) - {e['word'] for e in lex}
    if unknown_reviews:
        raise ValueError(f'Unknown reviewed words: {sorted(unknown_reviews)}')
    glosses = {}
    dictionary_paths = sorted((root / 'dict').glob('*.json'))
    for path in dictionary_paths:
        glosses.update(read_json(path))
    sequences = {}
    source_paths = []
    for name in (*WT_MAIN, *ZEN, 'wt-daily'):
        path = root / 'data/competitor' / (name + '.json.gz')
        source_paths.append(path)
        rows = json.loads(gzip.decompress(path.read_bytes()))
        sequences[name] = [normalize_record(name, i, row) for i, row in enumerate(rows, 1)]
    wt_records = [r for name in WT_MAIN for r in sequences[name]]
    zen_records = [r for name in ZEN for r in sequences[name]]
    wt = collect(wt_records)
    zen = collect(zen_records, deduplicate=True)
    daily = collect(sequences['wt-daily'])
    candidates = {w for w, e in wt.items() if e['targets']}
    trie = trie_for(candidates)
    reasons = defaultdict(Counter)
    omissions = []
    reverse_extra = Counter()
    for record in wt_records:
        found = explain_omissions(record, candidates, trie)
        for kind, words in found.items():
            for w in words:
                reasons[w][kind] += 1
        for w in record['extras']:
            if len(w) == 3 and w[::-1] in record['targets'] and w in candidates:
                reverse_extra[w] += 1
        if found['length'] or found['unexplained'] or found['unreachable']:
            omissions.append(dict(sequence=record['sequence'], level=record['number'],
                                  lengthExcluded=sorted(found['length']),
                                  unexplained=sorted(found['unexplained']),
                                  unreachable=sorted(found['unreachable'])))
    class_counts = Counter()
    recommendations = Counter()
    transitions = Counter()
    flag_counts = Counter()
    for entry in lex:
        w = entry['word']
        a, b, d = wt.get(w), zen.get(w), daily.get(w)
        audit = dict(version=review_doc['version'], category=category(a),
                     confidence=confidence(a), wt=a, zen=b, daily=d,
                     flags=dictionary_flags(entry, glosses.get(w.lower())))
        if (a and b and ((a['targets'] and b['extras'] and not b['targets']) or
                         (b['targets'] and a['extras'] and not a['targets']))):
            audit['flags'].append('cross_game_role')
        if audit['category'] == 'conditional_target':
            if reverse_extra[w] == a['extras'] and len(w) == 3:
                audit['reversePair'] = w[::-1]
                audit['reverseExtraCount'] = reverse_extra[w]
            else:
                audit['flags'].append('unexplained_role_switch')
        if reasons[w]['length']:
            audit['lengthExcludedCount'] = reasons[w]['length']
        if reasons[w]['unexplained']:
            audit['flags'].append('unexplained_omission')
        review = reviews.get(w, {})
        if review:
            audit['review'] = review
        audit['recommendation'], audit['recommendationReason'] = recommendation(entry, audit, review)
        entry['selectionAudit'] = audit
        class_counts[audit['category']] += 1
        recommendations[audit['recommendation']] += 1
        transitions[entry['role'] + ' → ' + audit['recommendation']] += 1
        flag_counts.update(audit['flags'])
    hashes = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in source_paths + dictionary_paths + [root / 'data/word_audit_reviews.json']}
    a, b = sequences['zen-t1'], sequences['zen-t3']
    summary = dict(
        version=review_doc['version'], date=review_doc['date'],
        targetAudience='普通英语母语成年玩家',
        basis='Word Tiles 主线出题证据；Zen 去重后的关卡配置和每日关分别作为旁证。',
        limitations=[
            '分类描述已收录样本中的角色稳定性，不是母语人群熟悉度测量。',
            '可信度仅由不同关卡上下文的数量和主线覆盖决定，不是概率。',
            '同一盘面但不同答案配置保留为不同上下文；相同配置跨版本只计一次。',
            '最低词长与倒读规则是回溯解释，不是已取得的官方生成算法。',
            '建议权限与现行 role 分列；本次脚本不自动改变生成权限或原有基础标签。',
            '词典提示并非专名、缩写或词形的自动判决；专项复核见 reviews。'],
        lexiconWords=len(lex), categories=dict(class_counts),
        confidence=dict(Counter(e['selectionAudit']['confidence'] for e in lex)),
        recommendations=dict(recommendations), roleComparison=dict(transitions),
        flags=dict(flag_counts), individuallyReviewed=len(reviews),
        sources={name: len(rows) for name, rows in sequences.items()},
        wtUniqueContexts=len({context_key(r) for r in wt_records}),
        zenUniqueContexts=len({context_key(r) for r in zen_records}),
        zenTargetExtraOverlaps=sum(len(r['overlaps']) for r in zen_records),
        wtObservedWords=len(wt), wtTargetWords=len(candidates),
        reversePairWords=sorted(w for w in candidates if category(wt[w]) == 'conditional_target'),
        reverseExtraOccurrences=sum(reverse_extra.values()),
        minimumLengthExcludedOccurrences=sum(x['length'] for x in reasons.values()),
        minimumLengthExcludedLevels=sum(bool(x['lengthExcluded']) for x in omissions),
        unexplainedOmissions=sum(x['unexplained'] for x in reasons.values()),
        unreachableTargets=sum(x['unreachable'] for x in reasons.values()),
        omissionExamples=omissions,
        zenMatchedBags=dict(
            total=len(a), sameBags=sum(x['board'] == y['board'] for x, y in zip(a, b)),
            sameVocabulary=sum(x['targets'] | x['extras'] == y['targets'] | y['extras'] for x, y in zip(a, b)),
            t1Targets=sum(len(x['targets']) for x in a), t3Targets=sum(len(x['targets']) for x in b),
            movedToExtra=sum(len(x['targets'] & y['extras']) for x, y in zip(a, b)),
            movedToTarget=sum(len(y['targets'] & x['extras']) for x, y in zip(a, b))),
        inputSha256=hashes,
        sourceLexiconSha256=hashlib.sha256(json.dumps(
            [{k: v for k, v in e.items() if k != 'selectionAudit'} for e in lex],
            ensure_ascii=False, sort_keys=True).encode()).hexdigest())
    return lex, summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='verify without writing')
    args = parser.parse_args()
    lex, summary = build()
    outputs = {ROOT / 'src/lex.json': lex, ROOT / 'data/word_audit_summary.json': summary}
    if args.check:
        stale = [str(p.relative_to(ROOT)) for p, value in outputs.items()
                 if not p.exists() or read_json(p) != value]
        if stale:
            raise SystemExit('Stale word audit: ' + ', '.join(stale))
    else:
        for path, value in outputs.items():
            compact = path.name == 'lex.json'
            path.write_text(json.dumps(value, ensure_ascii=False,
                                       indent=None if compact else 2,
                                       separators=(',', ':') if compact else None) + '\n', encoding='utf-8')
    print(json.dumps({k: summary[k] for k in ('lexiconWords', 'categories', 'recommendations',
                                             'individuallyReviewed', 'unexplainedOmissions')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
