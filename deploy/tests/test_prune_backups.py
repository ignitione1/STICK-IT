import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('prune_backups', Path(__file__).parents[1] / 'scripts' / 'prune-backups.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RetentionTest(unittest.TestCase):
    def test_only_old_completed_bundles_are_removed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for day in range(1, 11):
                bundle = root / f'202611{day:02}T200000Z-{day}'
                bundle.mkdir()
                for name in module.FILES:
                    (bundle / name).write_text('test')
            incomplete = root / '20261111T200000Z-11'
            incomplete.mkdir()
            (incomplete / 'database.dump.part').write_text('partial')
            other = root / 'do-not-delete'
            other.mkdir()
            module.prune(root, 7)
            for day in range(1, 11):
                self.assertEqual((root / f'202611{day:02}T200000Z-{day}').exists(), day > 3)
            self.assertTrue(incomplete.exists())
            self.assertTrue(other.exists())
            with self.assertRaises(ValueError):
                module.prune(root, 0)


if __name__ == '__main__':
    unittest.main()
