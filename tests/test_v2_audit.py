import copy
import importlib.util
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('audit', ROOT / 'verify/verify_levels.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class V2AuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lex = {x['word']: x for x in json.loads((ROOT / 'src/lex.json').read_text())}
        cls.trie = {}
        for word, entry in cls.lex.items():
            if entry['role'] not in ('candidate', 'extra') or len(word) > 8:
                continue
            node = cls.trie
            for letter in word:
                node = node.setdefault(letter, {})
            node['$'] = word
        cls.levels = json.loads((ROOT / 'tests/fixtures/v2_levels.json').read_text())

    def test_generated_fixtures_pass_independent_checks(self):
        for level in self.levels:
            self.assertEqual(audit.audit(level, self.lex, self.trie), [])

    def test_count_corruption_is_rejected(self):
        level = copy.deepcopy(self.levels[0])
        level['n'] = '0' + level['n'][1:]
        self.assertIn('counts differ from target path use', audit.audit(level, self.lex, self.trie))

    def test_omitted_extra_is_rejected(self):
        level = copy.deepcopy(self.levels[0])
        self.assertTrue(level['e'])
        level['e'] = ''
        self.assertTrue(any(e.startswith('extras mismatch: missing=') for e in audit.audit(level, self.lex, self.trie)))

    def test_only_extra_and_absent_cannot_be_targets(self):
        self.assertEqual(self.lex['AAHED']['role'], 'extra')
        for word in ['AAHED', 'ZZZ']:
            level = copy.deepcopy(self.levels[0])
            level['t'] += ' ' + word
            self.assertIn('not a v2 target candidate: ' + word, audit.audit(level, self.lex, self.trie))

    def test_distinct_tile_sets_are_rejected(self):
        level = {'g': 'CAT,CAT', 't': 'CAT', 'n': '111111', 'e': ''}
        self.assertIn('different tile sets for target: CAT', audit.audit(level, self.lex, self.trie))

    def test_self_contained_assets_and_html_copies_match(self):
        text = (ROOT / 'index.html').read_text()
        self.assertEqual(text, (ROOT / 'wordpages-level-desk.html').read_text())
        for source in ['src/gen.js', 'src/validation.js', 'src/v2_adapter.js', 'src/batch_ui.js', 'src/library.js', 'src/library_runtime.js', 'src/library_ui.js', 'src/library_overlap.js', 'src/library_range_ui.js', 'src/proportional_venn.js']:
            self.assertIn((ROOT / source).read_text().strip(), text)
        for tag, source in [('lex', 'src/lex.json'), ('policy', 'src/policy.json'), ('gameVocab', 'data/game_vocab/catalog.json')]:
            match = re.search(r'<script id="'+tag+r'"[^>]*>(.*?)</script>', text, re.S)
            self.assertEqual(json.loads(match[1]), json.loads((ROOT / source).read_text()))
        self.assertIn((ROOT / 'src/profiles.json').read_text().strip(), text)


if __name__ == '__main__':
    unittest.main()
