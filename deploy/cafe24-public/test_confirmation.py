import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('cafe24-release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ConfirmationTests(unittest.TestCase):
    def setUp(self):
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.commit = 'a' * 40
        self.revision = release.digest(b'renderer\0shell')
        self.path = Path(scratch.name).resolve() / (self.revision + '-' + self.commit)
        self.path.mkdir()
        for name, data in [('renderer.mjs', 'renderer'), ('shell.html', 'shell'), ('revision', self.revision)]:
            (self.path / name).write_text(data)
        self.proc = MagicMock()
        self.proc.name = '81'
        self.proc.__truediv__.return_value = self.path
        self.current = self.mock('active_release', self.path)
        self.process = self.mock('live_process', self.proc)
        self.shell = self.mock('check_live_shell', None)
        self.routes = self.mock('public_pages', [{'path': '/'}, {'path': '/music'}])

    def mock(self, name, value):
        patcher = patch.object(release, name, return_value=value)
        self.addCleanup(patcher.stop)
        return patcher.start()

    def confirm(self):
        return release.confirm_release(self.commit, self.revision)

    def test_records_the_process_and_both_public_checks(self):
        self.assertEqual(self.confirm(), {'commit': self.commit, 'revision': self.revision, 'pid': 81,
                         'current': str(self.path), 'processDirectory': str(self.path), 'routes': self.routes.return_value})
        self.shell.assert_called_once_with(release.digest(b'shell'))
        self.routes.assert_called_once_with(self.revision)

    def test_old_process_cannot_pass_with_new_public_headers(self):
        self.current.return_value = self.path.parent
        with self.assertRaisesRegex(RuntimeError, 'PID 81'):
            self.confirm()
        self.routes.assert_not_called()

    def test_matching_renderer_in_an_older_commit_is_rejected(self):
        self.commit = 'b' * 40
        with self.assertRaisesRegex(RuntimeError, 'Expected Cafe24'):
            self.confirm()

    def test_replaced_installed_shell_is_rejected(self):
        (self.path / 'shell.html').write_text('different')
        with self.assertRaisesRegex(RuntimeError, 'installed renderer and HTML'):
            self.confirm()

    def test_process_restart_during_checks_is_rejected(self):
        another = MagicMock()
        another.name = '82'
        another.__truediv__.return_value = self.path
        self.process.side_effect = [self.proc, another]
        with self.assertRaisesRegex(RuntimeError, 'changed during confirmation'):
            self.confirm()

    def test_activation_and_same_release_retry_keep_existing_routes_and_report_the_pid(self):
        prior = self.path.parent / 'previous'
        manifest = {'commit': self.commit, 'revision': self.revision, 'hashes': {'shell.html': 'digest'},
                    'previousRelease': str(prior)}
        switch = self.mock('replace_current', None)
        restart = self.mock('restart', None)
        self.mock('check_release', None)
        self.mock('check_running', None)
        for previous in [prior, self.path]:
            routes, observed = release.activate(self.path, manifest, previous)
            self.assertEqual(routes, self.routes.return_value)
            self.assertEqual(observed['pid'], 81)
        switch.assert_called_once_with(self.path)
        restart.assert_called_once_with()


if __name__ == '__main__':
    unittest.main()
