#!/usr/bin/env python3
"""Independent audit of v2-generated levels (engine JSON, game arrays, or books/daily).
Checks every orthogonal path without JS path caps, fixed tile sets, counts,
coverage, v2 permissions, and completeness of all accepted extra words.
The v2 generator does not generate curtains; curtain levels need a separate audit.
"""
import argparse
import json
from pathlib import Path
import sys


def paths(word, grid, near):
    result = []
    def walk(i, k, visited, path):
        if i in visited or grid[i] != word[k]:
            return
        path = path + (i,)
        if k + 1 == len(word):
            result.append(path)
            return
        for j in near[i]:
            walk(j, k + 1, visited | {i}, path)
    if word:
        for i in range(len(grid)):
            walk(i, 0, set(), ())
    return result


def normalize(data):
    if isinstance(data, list):
        return data
    if 'books' in data or 'daily' in data:
        return [l for b in data.get('books', []) for l in b.get('levels', [])] + data.get('daily', [])
    if 'levels' in data:
        return data['levels']
    return [data]


def audit(level, lex, trie):
    errors = []
    if 'g' in level:
        rows = level['g'].split(',')
        width, height = len(rows[0]), len(rows)
        if any(len(r) != width for r in rows):
            return ['inconsistent row lengths']
        grid = list(''.join(rows))
        targets = level.get('t', '').split()
        extras = level.get('e', '').split()
        counts = [int(c, 36) for c in level.get('n', '')]
    else:
        width, height = level['width'], level['height']
        grid, targets = level['grid'], level['targets']
        extras, counts = level.get('extras', []), level.get('counts', [])
    if not width or len(grid) != width * height or len(counts) != len(grid):
        return ['invalid dimensions or count length']
    if any(level.get('curtains', [])):
        errors.append('curtains require a separate audit; v2 generates no curtains')
    if not targets or len(set(targets)) != len(targets):
        errors.append('empty or duplicate targets')
    near = []
    for i in range(len(grid)):
        row, col = divmod(i, width)
        near.append([j for valid, j in [(col > 0, i-1), (col+1 < width, i+1), (row > 0, i-width), (row+1 < height, i+width)] if valid])
    needed = [0] * len(grid)
    for word in targets:
        entry = lex.get(word, {})
        if entry.get('role') != 'candidate' or not 3 <= len(word) <= 8:
            errors.append('not a v2 target candidate: ' + word)
        choices = paths(word, grid, near)
        if not choices:
            errors.append('unreachable target: ' + word)
            continue
        if len({frozenset(p) for p in choices}) != 1:
            errors.append('different tile sets for target: ' + word)
        for i in choices[0]:
            needed[i] += 1
    if 0 in needed:
        errors.append('uncovered tiles')
    if needed != counts:
        errors.append('counts differ from target path use')
    if any(c < 1 or c > 20 for c in counts):
        errors.append('counts outside supported editor range 1..20')
    found = set()
    def scan(i, node, visited):
        if i in visited or grid[i] not in node:
            return
        node = node[grid[i]]
        if '$' in node:
            found.add(node['$'])
        for j in near[i]:
            scan(j, node, visited | {i})
    for i in range(len(grid)):
        scan(i, trie, set())
    expected = found - set(targets)
    if len(set(extras)) != len(extras):
        errors.append('duplicate extras')
    if set(extras) != expected:
        errors.append('extras mismatch: missing=' + ' '.join(sorted(expected-set(extras))) + '; unexpected=' + ' '.join(sorted(set(extras)-expected)))
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('levels')
    parser.add_argument('--lex', default=str(Path(__file__).resolve().parents[1] / 'src/lex.json'))
    parser.add_argument('--report')
    args = parser.parse_args()
    lex = {x['word']: x for x in json.loads(Path(args.lex).read_text())}
    trie = {}
    for word, x in lex.items():
        if x['role'] not in ('candidate', 'extra') or not 2 <= len(word) <= 8:
            continue
        node = trie
        for c in word:
            node = node.setdefault(c, {})
        node['$'] = word
    levels = normalize(json.loads(Path(args.levels).read_text()))
    results = []
    for i, level in enumerate(levels):
        try:
            errors = audit(level, lex, trie)
        except (KeyError, ValueError, TypeError, IndexError) as e:
            errors = ['invalid level: ' + str(e)]
        results.append({'index': i+1, 'errors': errors})
    summary = {'levels': len(levels), 'failed': sum(bool(x['errors']) for x in results), 'targets': sum(len(x.get('targets', x.get('t', '').split())) for x in levels)}
    report = {'summary': summary, 'levels': results}
    if args.report:
        Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(summary))
    for x in results:
        if x['errors']:
            print('FAIL', x['index'], '; '.join(x['errors']))
    return 1 if not levels or summary['failed'] else 0


if __name__ == '__main__':
    sys.exit(main())
