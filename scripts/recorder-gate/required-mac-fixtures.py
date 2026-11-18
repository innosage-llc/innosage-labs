"""Owning is-clean-my-mac README's native tests; disposable fixtures only."""
import os
from pathlib import Path
import sys
import unittest

if sys.platform != 'darwin' or not os.access('/usr/sbin/lsof', os.X_OK):
    raise SystemExit('Required macOS/lsof fixture coverage unavailable; NOT RUN')
os.environ['IS_CLEAN_RUN_NATIVE_LSOF_FIXTURE'] = '1'
os.environ['IS_CLEAN_RUN_NATIVE_EXECUTION_FIXTURE'] = '1'
suite = unittest.defaultTestLoader.discover(str(Path(sys.argv[1]).resolve()))
result = unittest.TextTestRunner(verbosity=2).run(suite)
if not result.wasSuccessful() or result.skipped or result.testsRun == 0:
    raise SystemExit('Required native fixture coverage failed, empty or skipped')
