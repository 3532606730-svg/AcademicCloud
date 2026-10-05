import importlib.util, unittest
from pathlib import Path
from unittest.mock import patch

path=Path(__file__).resolve().parents[1]/'scripts/member_paddle_offline.py'
spec=importlib.util.spec_from_file_location('member_paddle_offline',path)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class OfflineVersionTests(unittest.TestCase):
    def test_exact_installed_versions(self):
        module.verify_versions(lambda name:{'paddleocr':'3.7.0','paddlepaddle-gpu':'3.3.1'}[name])
    def test_wrong_versions_fail_closed(self):
        for versions in ({'paddleocr':'3.6.0','paddlepaddle-gpu':'3.3.1'},{'paddleocr':'3.7.0','paddlepaddle-gpu':'3.2.0'}):
            with self.assertRaises(RuntimeError):module.verify_versions(lambda name:versions[name])
    def test_missing_seccomp_has_no_permissive_fallback(self):
        with patch.object(module.ctypes,'CDLL',side_effect=OSError('private trace')):
            with self.assertRaises(OSError):module.network_guard()

if __name__=='__main__':unittest.main()
