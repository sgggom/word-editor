import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('word_audit', ROOT / 'tools/audit_word_selection.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class WordSelectionAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lex, cls.summary = audit.build()
        cls.words = {e['word']: e for e in cls.lex}

    def test_zen_overlap_and_duplicate_versions_do_not_inflate_evidence(self):
        row = [1, 'TAC', 'id', ['CAT'], ['CAT'], ['ACT'], [], 0]
        first = audit.normalize_record('zen-t1', 1, row)
        duplicate = audit.normalize_record('zen-ios', 1, row)
        swapped = audit.normalize_record('zen-t3', 1,
                                         [1, 'CAT', 'id2', ['ACT'], [], ['CAT'], [], 0])
        counts = audit.collect([first, duplicate, swapped], deduplicate=True)
        self.assertEqual(first['extras'], {'ACT'})
        self.assertEqual(first['overlaps'], {'CAT'})
        self.assertEqual((counts['CAT']['targets'], counts['CAT']['extras'], counts['CAT']['contexts']), (1, 1, 2))
        self.assertEqual(len(counts['CAT']['sequences']), 3)

    def test_three_letter_reversal_does_not_apply_to_longer_words(self):
        for forward, reverse, expected in [('PAT', 'TAP', 'reverse'), ('LIVE', 'EVIL', 'unexplained')]:
            candidates = {forward, reverse}
            record = dict(board=forward, targets={forward}, extras={reverse})
            result = audit.explain_omissions(record, candidates, audit.trie_for(candidates))
            self.assertEqual(result[expected], {reverse})
            self.assertEqual(result['unreachable'], set())

    def test_length_exclusion_requires_whole_record_to_be_four_plus(self):
        candidates = {'CAB', 'BIN', 'CABIN'}
        trie = audit.trie_for(candidates)
        record = dict(board='CABIN', targets={'CABIN'}, extras=set())
        self.assertEqual(audit.explain_omissions(record, candidates, trie)['length'], {'CAB', 'BIN'})
        record['extras'] = {'CAB'}
        self.assertEqual(audit.explain_omissions(record, candidates, trie)['length'], set())

    def test_all_words_have_evidence_and_counts_match_independent_findings(self):
        self.assertEqual(len(self.lex), 9455)
        self.assertEqual(self.summary['categories'], {
            'stable_target': 4002, 'conditional_target': 50,
            'stable_extra': 1948, 'insufficient': 3455})
        self.assertEqual(self.summary['reverseExtraOccurrences'], 946)
        self.assertEqual(self.summary['minimumLengthExcludedOccurrences'], 538)
        self.assertEqual(self.summary['minimumLengthExcludedLevels'], 87)
        self.assertEqual(self.summary['unexplainedOmissions'], 0)
        self.assertEqual(self.summary['unreachableTargets'], 0)
        for entry in self.lex:
            result = entry['selectionAudit']
            self.assertIn(result['category'], audit.CATEGORIES)
            self.assertIn(result['recommendation'], ('candidate', 'extra', 'pending', 'blocked'))
            if result['category'] == 'conditional_target':
                self.assertEqual(result['reversePair'], entry['word'][::-1])
                self.assertEqual(result['reverseExtraCount'], result['wt']['extras'])

    def test_recommendations_do_not_rewrite_current_permissions(self):
        actor = self.words['ACTOR']
        self.assertEqual(actor['role'], 'pending')
        self.assertEqual(actor['selectionAudit']['recommendation'], 'candidate')
        devine = self.words['DEVINE']
        self.assertEqual(devine['role'], 'candidate')
        self.assertEqual(devine['selectionAudit']['recommendation'], 'pending')
        for w in ('GOOS', 'HOTS'):
            self.assertEqual(self.words[w]['selectionAudit']['recommendationReason'], 'source_morphology_guard')

    def test_missing_gloss_and_abbreviation_hint_are_not_blanket_rejections(self):
        for w in ('CAFE', 'ENTREE', 'INTRO', 'SITCOM'):
            result = self.words[w]['selectionAudit']
            self.assertTrue(result['review']['lexicalConfirmed'])
            self.assertEqual(result['recommendation'], 'candidate')
        self.assertIn('abbreviation_hint', self.words['SITCOM']['selectionAudit']['flags'])
        self.assertEqual(self.words['DOS']['selectionAudit']['category'], 'insufficient')
        self.assertEqual(self.words['ARE']['selectionAudit']['category'], 'stable_extra')
        self.assertEqual(self.words['ARE']['selectionAudit']['review']['kind'], 'extra_not_unfamiliar')

    def test_rebuild_matches_committed_artifacts(self):
        self.assertEqual(self.lex, json.loads((ROOT / 'src/lex.json').read_text()))
        self.assertEqual(self.summary, json.loads((ROOT / 'data/word_audit_summary.json').read_text()))


if __name__ == '__main__':
    unittest.main()
