"""Connected synthetic collector -> plan -> inline/full artifact delivery."""
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from test_audit import load, SCRIPTS

runner=load('connected_runner',SCRIPTS/'audit-all.py')


class DeliveryTests(unittest.TestCase):
    def test_real_fixture_collectors_and_renderer_publish_numbered_inline_types(self):
        actual_run=subprocess.run
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary).resolve()
            home=root/'synthetic-scope';home.mkdir()
            (home/'PRIVATE-video.mov').write_bytes(b'x'*16384)
            (home/'PRIVATE-db.sqlite').write_bytes(b'x'*8192)
            codex=root/'codex';(codex/'worktrees/slot/repo').mkdir(parents=True)
            (codex/'worktrees/slot/repo/.git').write_text('synthetic')
            (codex/'.codex-global-state.json').write_text('{"different_schema":null}')
            output=root/'published';output.mkdir()
            def collect(command,**kwargs):
                script=Path(command[2]).name
                if script=='audit-file-types.py':
                    return actual_run(command+['--root',str(home)],**kwargs)
                if script=='audit-codex-worktrees.py':
                    return actual_run(command,env=dict(os.environ,CODEX_HOME=str(codex)),**kwargs)
                source=command[command.index('--source')+1]
                data=dict(source='mole-'+source,completeness='PARTIAL',categories=[])
                if source=='clean':
                    data.update(candidate_estimate_bytes=7000000,categories=[dict(category='developer_caches',observed_candidate_estimate_bytes=6000000)])
                if source=='purge':
                    data.update(completeness='FAILED',reason='command_failed',command_stage='audit',command_exit_code=7,diagnostic_categories=['permission_denied'])
                return subprocess.CompletedProcess(command,0,stdout=json.dumps(data).encode())
            stdout=io.StringIO()
            with patch.object(runner,'run_worker',side_effect=collect),patch.object(runner.tempfile,'mkdtemp',return_value=str(output)),patch('sys.argv',['audit-all.py','--include-file-types']),contextlib.redirect_stdout(stdout):
                runner.main()
            result=json.loads(stdout.getvalue())
            text=result['summary_markdown']
            self.assertIn('文件类型：视频',text)
            self.assertIn('文件类型：数据库',text)
            self.assertIn('16,384',text)
            self.assertIn('8,192',text)
            self.assertIn('worktree 1',text)
            self.assertIn('退出码：7',text)
            self.assertIn('均没有已验证的精确清理操作',text)
            self.assertNotIn('PRIVATE',stdout.getvalue())
            self.assertNotIn('sources',result) # avoid duplicated evidence burying the answer
            self.assertTrue(Path(result['report_path']).is_file())
            plan=json.loads(Path(result['plan_path']).read_text())
            self.assertEqual([r['row_id'] for r in plan['rows']],list(range(1,len(plan['rows'])+1)))
            self.assertTrue(all(not r['actionable'] and r['operation'] is None for r in plan['rows']))
