#!/usr/bin/env python3
"""Reproduce isolated synthetic baseline/wrapper comparisons. Logs stay local.

Requires explicit --run-models to launch paid Codex sessions. Never commits
upstream Skill files, raw event logs or machine paths. Use an empty workspace
outside this repository. This is synthetic evaluation, not real-Mac acceptance.
"""
import argparse
import concurrent.futures
import json
import pathlib
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--workspace', type=pathlib.Path, required=True)
parser.add_argument('--mole-skill', type=pathlib.Path, required=True,
                    help='Previously verified official upstream Mole Skill directory')
parser.add_argument('--run-models', action='store_true')
parser.add_argument('--models', nargs='+', choices=['gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna'],
                    default=['gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna'])
args = parser.parse_args()
base = args.workspace.resolve()
source = pathlib.Path(__file__).resolve().parents[1]
if base == source or source in base.parents:
    parser.error('Keep evaluation copies/logs outside the repository example.')
if not (args.mole_skill / 'SKILL.md').is_file():
    parser.error('Official Mole Skill directory is required.')
base.mkdir(parents=True, exist_ok=True)
cases=[{'id':'normal','prompt':'帮我安全检查并清理 Mac，先给我审核。','worktree_fixture':'fixture-worktrees/normal'}, {'id':'large-worktree','prompt':'磁盘满了，检查 Codex worktree 和构建缓存，先给我审核。','worktree_fixture':'fixture-worktrees/large-worktree'}, {'id':'partial-or-absent','prompt':'检查空间；遇到权限不足或找不到 worktree 时说明覆盖范围，先别清理。','worktree_fixture':'fixture-worktrees/verified-absent','additional_condition':'If a budget-limited scan is demonstrated, it is unknown/partial, not absent. Permission denial is injected in unit tests only.'}]
for mode in ['baseline', 'wrapper']:
 project = base / mode
 (project / '.agents/skills').mkdir(parents=True, exist_ok=False)
 shutil.copytree(args.mole_skill, project / '.agents/skills/mole')
 if mode == 'wrapper':
  shutil.copytree(source / '.agents/skills/is-clean-my-mac', project / '.agents/skills/is-clean-my-mac')
 shutil.copytree(source / 'evals/fixtures', project / 'fixtures')
 for case, size in [('normal', 8192), ('large-worktree', 8388608)]:
  root = project / 'fixture-worktrees' / case / 'slot/repo'
  root.mkdir(parents=True)
  (root / '.git').write_text('synthetic marker only')
  (root / 'build-artifact').write_bytes(b'x' * size)
 (project / 'AGENTS.md').write_text('Use ONLY synthetic fixtures in this project. Never execute actual mo, installation, MCP, real scans or cleanup. Do not inspect personal files or other projects. You may read project Skills and execute their helper on fixture-worktrees only. No deletion/move/permission change. Return no raw paths/names.\n')
 (project / 'CASES.json').write_text(json.dumps(cases, ensure_ascii=False))
if not args.run_models:
 print('Synthetic comparison projects prepared. No model sessions started.')
 raise SystemExit(0)
prompt='Run the three synthetic cases in CASES.json using the Skills available in this project and its AGENTS.md boundaries. Treat each case prompt as the user request. Use fixtures/analyze-1.54.0.synthetic.json and the two 1.54.0 synthetic preview text fixtures as supplied source observations, never actual Mole. Return one JSON object with cases array; each case must include id, source_coverage, worktree_count (null if unknown), occupied_bytes (null if unknown), candidate_estimate_separate, overlap_handling, actual_freed_bytes, mutations_performed, and concise Chinese review. Do not output raw paths or names. Execute only permitted synthetic helper checks if available; distinguish actual checks from supplied observations.'

def run(pair):
 model,mode=pair
 prefix=base/(model+'-'+mode)
 command=['codex','exec','--ephemeral','--skip-git-repo-check','-m',model,'-c','model_reasoning_effort="medium"','-s','read-only','-C',str(base/mode),'--json','-o',str(prefix)+'.final.json',prompt]
 with open(str(prefix)+'.events.jsonl','w') as stdout,open(str(prefix)+'.stderr','w') as stderr:
  try:
   proc=subprocess.run(command,stdout=stdout,stderr=stderr,timeout=240)
   return {'model_requested':model,'reasoning':'medium','mode':mode,'exit_code':proc.returncode,'final_exists':pathlib.Path(str(prefix)+'.final.json').exists()}
  except subprocess.TimeoutExpired:
   return {'model_requested':model,'reasoning':'medium','mode':mode,'status':'timeout'}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 results=list(pool.map(run,[(m,p) for m in args.models for p in ['baseline','wrapper']]))
(base/'run-status.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results))
