import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('fixture_cleanup', Path(__file__).with_name('reset-staging-test-blocks.py'))
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)


class FixturePairTests(unittest.TestCase):
    def setUp(self):
        self.accounts = {
            role: {'did': f'did:plc:{letter * 24}', 'purpose': 'Patchwork deployment browser tests', 'review_by': '2026-12-23'}
            for role, letter in [('helper', 'a'), ('requester', 'b')]
        }

    def test_accepts_only_distinct_approved_current_fixtures(self):
        self.assertEqual(cleanup.fixture_pair(self.accounts, '2026-11-05'),
                         (self.accounts['helper']['did'], self.accounts['requester']['did']))

    def test_refuses_non_fixture_expired_and_invalid_identities(self):
        for role in ('helper', 'requester'):
            for field, value in [('purpose', 'human account'), ('review_by', '2026-11-04'), ('did', "did:plc:invalid' OR TRUE")]:
                with self.subTest(role=role, field=field):
                    accounts = copy.deepcopy(self.accounts)
                    accounts[role][field] = value
                    with self.assertRaises(ValueError):
                        cleanup.fixture_pair(accounts, '2026-11-05')

    def test_refuses_shared_identity(self):
        self.accounts['requester']['did'] = self.accounts['helper']['did']
        with self.assertRaises(ValueError):
            cleanup.fixture_pair(self.accounts, '2026-11-05')


if __name__ == '__main__':
    unittest.main()
