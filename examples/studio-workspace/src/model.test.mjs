import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWorkspace, demoWorkspace, parseWorkspace, removeProject, removeTag} from './model.ts';
test('empty and synthetic roundtrip preserve entities',()=>{for(const s of [emptyWorkspace(),demoWorkspace()])assert.deepEqual(parseWorkspace(JSON.stringify(s)),s);});
test('invalid version never becomes empty workspace',()=>assert.throws(()=>parseWorkspace('{"version":2}')));
test('project deletion retains content and moves related work to inbox',()=>{const s=removeProject(demoWorkspace(),'demo-project');assert.equal(s.projects.length,0);assert.equal(s.tasks.length,2);assert.equal(s.tasks[0].projectId,null);assert.equal(s.notes[0].projectId,null);parseWorkspace(JSON.stringify(s));});
test('tag deletion removes references',()=>{const s=removeTag(demoWorkspace(),'demo-tag');assert.equal(s.tags.length,0);assert.deepEqual(s.tasks[0].tagIds,[]);parseWorkspace(JSON.stringify(s));});
test('bad relation and duplicate IDs are rejected',()=>{const s=demoWorkspace();s.tasks[0].projectId='missing';assert.throws(()=>parseWorkspace(JSON.stringify(s)));s.tasks[0].projectId=null;s.tasks[0].id=s.notes[0].id;assert.throws(()=>parseWorkspace(JSON.stringify(s)));});

test('coercible non-string status and theme are rejected',()=>{const s=demoWorkspace();s.theme=['light'];assert.throws(()=>parseWorkspace(JSON.stringify(s)));s.theme='light';s.tasks[0].status=['todo'];assert.throws(()=>parseWorkspace(JSON.stringify(s)));});
