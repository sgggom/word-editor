#!/usr/bin/env python3
"""Import the calibrated vocabulary, without executing or modifying the source HTML."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
ROLES = ('target', 'extra', 'onlyExtra', 'bonus')


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    html = args.source.read_text()
    match = re.search(r'\bconst\s+DATA\s*=\s*', html)
    if not match:
        raise ValueError('Missing calibrated DATA')
    data, _ = json.JSONDecoder().raw_decode(html[match.end():])
    games, outputs, words = [], {}, set()
    for game in data['games']:
        configs = []
        for config in game['configs']:
            combined = set()
            for role in ROLES:
                values = config['words'][role]
                references = config['wordLevels'][role]
                assert len(values) == len(references)
                assert len(set(values)) == len(values)
                for refs in references:
                    assert refs and refs == sorted(set(refs))
                    assert 0 <= refs[0] <= refs[-1] < len(config['levelCatalog'])
                combined.update(values)
            assert combined == set(config['words']['all'])
            words.update(combined)
            configs.append({k: v for k, v in config.items()
                            if k not in ('levelCatalog', 'wordLevels', 'completions', 'words')} |
                           {'words': {r: config['words'][r] for r in ROLES}})
        path = 'data/game_vocab/' + game['id'] + '.json.gz'
        outputs[ROOT / path] = gzip.compress(encoded(game), mtime=0)
        games.append({k: v for k, v in game.items() if k != 'configs'} |
                     {'configs': configs, 'provenance': path})
    assert len(games) == 7 and sum(len(g['configs']) for g in games) == 25
    assert len(words) == 32268
    payload = {'schemaVersion': 1, 'sourceDate': data['calibratedAt'],
               'methodology': data['methodology'], 'games': games}
    payload['datasetHash'] = hashlib.sha256(encoded(payload)).hexdigest()
    payload['wordCount'] = len(words)
    outputs[ROOT / 'data/game_vocab/catalog.json'] = encoded(payload) + b'\n'
    outputs[ROOT / 'data/game_vocab/manifest.json'] = encoded({
        'schemaVersion': 1, 'datasetHash': payload['datasetHash'],
        'sourceName': args.source.name,
        'sourceSha256': hashlib.sha256(args.source.read_bytes()).hexdigest(),
        'games': 7, 'configs': 25, 'words': len(words),
        'files': {str(p.relative_to(ROOT)): hashlib.sha256(b).hexdigest() for p, b in outputs.items()}
    }) + b'\n'
    for path, content in outputs.items():
        if args.check:
            assert path.read_bytes() == content, str(path)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
    print(json.dumps({'games': 7, 'configs': 25, 'words': len(words),
                      'datasetHash': payload['datasetHash'], 'checked': args.check}))


if __name__ == '__main__':
    main()
