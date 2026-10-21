import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import google_translate_audit as collector
import report_google_translate_audit as report


class GoogleAuditEvidenceTests(unittest.TestCase):
    def test_markers_prevent_silent_cross_word_assignment(self):
        ids = ['W00001P000', 'W00002P000']
        good = '[W00001P000] 猫\n[W00002P000] 狗'
        self.assertEqual(collector.parse_marked(good, ids), dict(zip(ids, ['猫', '狗'])))
        for bad in [
            '[W00001P000] 猫',
            '[W00001P000] 猫 [W00001P000] 狗',
            '[W00002P000] 狗 [W00001P000] 猫',
            '[W00001P000] [W00002P000] 狗',
        ]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                collector.parse_marked(bad, ids)

    def test_long_definition_is_split_without_losing_characters(self):
        source = ('A long description; with multiple clauses.\n' * 170) + 'tail'
        chunks = collector.pieces(source)
        self.assertGreater(len(chunks), 1)
        self.assertEqual(''.join(chunks), source)
        self.assertLessEqual(max(map(len, chunks)), 2200)

    def test_report_rejects_translation_not_found_in_google_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            shard = base / 'part01'
            raw = shard / 'raw'
            raw.mkdir(parents=True)
            source = {'id': 'W00001', 'word': 'cat', 'en': 'A cat.', 'zh': '猫'}
            payload = '[W00001P000] A cat.'
            rid = collector.digest('en\0zh-CN\0' + payload)
            # Synthetic fixture: never placed in the real audit evidence tree.
            (raw / (rid + '.json')).write_text(json.dumps({'httpStatus': 200, 'requestId': rid, 'sourceText': payload, 'response': [[["[W00001P000] 一只猫。", payload, None, None]], None, 'en']}))
            (base / 'manifest.json').write_text(json.dumps({'scope': 'unit-test fixture', 'sourceSha256': 'test', 'words': 1, 'shards': [{'id': 'part01', 'words': 1}]}))
            (base / 'part01-input.jsonl').write_text(json.dumps(source) + '\n')
            translated = {**source, 'sourceSha256': collector.digest(source['en']), 'translationStatus': 'success', 'googleZh': '一只猫。', 'requestIds': [rid]}
            (shard / 'translations.jsonl').write_text(json.dumps(translated) + '\n')
            (shard / 'comparisons.jsonl').write_text(json.dumps({'word': 'cat', 'priority': 0, 'signal': 'lexical_overlap_only', 'translationStatus': 'success'}) + '\n')
            argv = ['report', '--audit-dir', str(base)]
            with patch.object(sys, 'argv', argv), contextlib.redirect_stdout(io.StringIO()):
                report.main()
            translated['googleZh'] = 'invented replacement'
            (shard / 'translations.jsonl').write_text(json.dumps(translated) + '\n')
            with patch.object(sys, 'argv', argv), self.assertRaisesRegex(AssertionError, 'differs from raw Google'):
                report.main()
            wrong_source = '[W00001P000] A dog.'
            wrong_id = collector.digest('en\0zh-CN\0' + wrong_source)
            (raw / (wrong_id + '.json')).write_text(json.dumps({'httpStatus': 200, 'requestId': wrong_id, 'sourceText': wrong_source, 'response': [[["[W00001P000] 一只猫。", wrong_source, None, None]], None, 'en']}))
            translated.update(googleZh='一只猫。', requestIds=[wrong_id])
            (shard / 'translations.jsonl').write_text(json.dumps(translated) + '\n')
            with patch.object(sys, 'argv', argv), self.assertRaisesRegex(AssertionError, 'source content assigned to wrong marker'):
                report.main()


if __name__ == '__main__':
    unittest.main()
