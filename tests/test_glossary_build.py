import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('glossary_build', ROOT / 'tools/build_glossary.py')
glossary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(glossary)


class GlossarySenseReviewTests(unittest.TestCase):
    def test_review_wins_over_legacy_and_refreshed_caches(self):
        reviews = json.loads((ROOT / 'data/glossary/reviewed/sense-alignment.json').read_text())
        reviews['cus']['baseIpaSourceUrl'] = reviews['cus']['ipaSourceUrl']
        selected = {'datasetHash': 'test', 'libraries': [
            {'id': 'test', 'name': 'test', 'words': ['CUS', 'MAMS']}
        ]}
        legacy = {
            'cus': ['/kʌs/', '导尿标本', 'a metallic element'],
            'mams': ['/mɑmz/', '医学相关学科硕士', 'a Mayan people'],
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            review_path = root / 'data/glossary/reviewed/sense-alignment.json'
            review_path.parent.mkdir(parents=True)
            review_path.write_text(json.dumps({w: reviews[w] for w in legacy}))
            # A later full audit supersedes the earlier targeted review too.
            full_dir = review_path.parent / 'full-audit-2026-10-21'
            full_dir.mkdir()
            reviews['mams'] = copy.deepcopy(reviews['mams'])
            reviews['mams']['en'] = 'Plural of mam: mothers.'
            (full_dir / 'm_r.json').write_text(json.dumps({'mams': reviews['mams']}))
            followup = review_path.parent / 'dictionary-followup-2026-10-21'
            followup.mkdir()
            reviews['mams']['en'] = ('Full restored definition in a test fixture. ' * 8).strip()
            reviews['mams']['zh'] = 'n. 母亲们（mam 的复数）。'
            reviews['mams']['enSourceUrl'] = 'https://example.test/dictionary/mam'
            (followup / 'part01.json').write_text(json.dumps({'mams': reviews['mams']}))
            sources = root / 'sources'
            sources.mkdir()
            # A fresh extraction can contain a complete but unrelated sense,
            # including stale roots and pronunciation provenance.
            (sources / 'english-ipa-corrections.json').write_text(json.dumps({
                'cus': {'en': 'copper', 'enBase': 'Cu', 'enSourceUrl': 'old-source',
                        'ipa': '/kʌs/', 'ipaStatus': 'unverified', 'ipaEngine': 'old predictor',
                        'ipaVoice': 'en-us', 'ipaBase': 'Cu', 'baseIpaSourceUrl': 'old-pronunciation-source'},
                'mams': {'en': 'a Mayan people', 'enBase': 'Mam'},
            }))
            (sources / 'chinese-corrections.json').write_text(json.dumps({
                'cus': {'zh': '导尿标本', 'zhBase': 'CUS'},
                'mams': {'zh': '医学相关学科硕士', 'zhBase': 'MAMS'},
            }))
            with patch.object(glossary, 'ROOT', root), \
                 patch.object(glossary, 'OUTPUT', root / 'data/glossary/default.json'), \
                 patch.object(glossary, 'MANIFEST', root / 'data/glossary/manifest.json'), \
                 patch.object(glossary, 'scope', return_value=(selected, sorted(legacy), [], 0)), \
                 patch.object(glossary, 'legacy_rows', return_value=legacy):
                for source in (None, sources):
                    with self.subTest(source_refresh=source is not None):
                        package, manifest = glossary.build(source)
                        for word in legacy:
                            row, review = package['entries'][word], reviews[word]
                            self.assertEqual(row[:3], [review[f] for f in glossary.FIELDS])
                            self.assertEqual(row[3]['zhSourceUrl'], review['zhSourceUrl'])
                            self.assertEqual(row[3]['enSourceUrl'], review['enSourceUrl'])
                        cus = package['entries']['cus'][3]
                        self.assertNotIn('zhBase', cus)
                        self.assertNotIn('enBase', cus)
                        self.assertNotIn('ipaEngine', cus)
                        self.assertNotIn('ipaVoice', cus)
                        self.assertEqual(cus['ipaStatus'], 'derived')
                        self.assertEqual(cus['ipaBase'], "'cause")
                        self.assertEqual(cus['baseIpaSourceUrl'], reviews['cus']['ipaSourceUrl'])
                        self.assertEqual(package['entries']['mams'][3]['enBase'], 'mam')
                        self.assertEqual(manifest['correctedWords'], 2)
                        self.assertGreater(len(package['entries']['mams'][2]), 220)
                        glossary.OUTPUT.write_bytes(glossary.canonical(package))
                        glossary.MANIFEST.write_text(json.dumps(manifest))
                        # The source cache may disappear; offline rebuilding
                        # must still preserve both senses and their provenance.
                        again, _ = glossary.build()
                        self.assertEqual(package, again)

    def test_incomplete_paired_review_is_rejected(self):
        reviews = json.loads((ROOT / 'data/glossary/reviewed/sense-alignment.json').read_text())
        correction = copy.deepcopy(reviews['cus'])
        del correction['en']
        original_read = glossary.read

        def read(path, default=None):
            if path.name == 'sense-alignment.json':
                return {'cus': correction}
            return original_read(path, default)

        with patch.object(glossary, 'read', side_effect=read), \
             patch.object(glossary, 'scope', return_value=({'datasetHash': 'test', 'libraries': []}, [], [], 0)), \
             patch.object(glossary, 'legacy_rows', return_value={}):
            with self.assertRaisesRegex(ValueError, 'both zh and en: cus'):
                glossary.build()

    def test_unresolved_review_marker_is_added_and_cleared_offline(self):
        legacy = {'cat': ['/kæt/', '猫', 'A cat.'], 'dog': ['/dɒɡ/', '狗', 'A dog.']}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / 'data/glossary/default.json'
            pending = root / 'data/glossary/audits/2026-10-21/pending.json'
            pending.parent.mkdir(parents=True)
            pending.write_text(json.dumps([{'word': 'dog', 'status': 'pending', 'issue': 'pronunciation needs evidence'}]))
            # A previously unresolved word has been cleared by the new review.
            output.write_text(json.dumps({'entries': {'cat': legacy['cat'] + [{'reviewStatus': 'pending'}]}}))
            with patch.object(glossary, 'ROOT', root), \
                 patch.object(glossary, 'OUTPUT', output), \
                 patch.object(glossary, 'scope', return_value=({'datasetHash': 'test', 'libraries': []}, sorted(legacy), [], 0)), \
                 patch.object(glossary, 'legacy_rows', return_value=legacy):
                package, _ = glossary.build()
                self.assertNotIn('reviewStatus', package['entries']['cat'][3])
                self.assertEqual(package['entries']['dog'][3]['reviewStatus'], 'pending')
                output.write_bytes(glossary.canonical(package))
                pending.write_text('[]')
                package, _ = glossary.build()
                self.assertNotIn('reviewStatus', package['entries']['dog'][3])


if __name__ == '__main__':
    unittest.main()
