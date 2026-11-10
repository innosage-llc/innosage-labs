export type Status = 'todo' | 'doing' | 'done';
export type Project = { id: string; title: string; description: string };
export type Task = { id: string; title: string; status: Status; projectId: string | null; tagIds: string[] };
export type Note = { id: string; title: string; body: string; projectId: string | null; tagIds: string[] };
export type Tag = { id: string; title: string };
export type Workspace = { version: 1; theme: 'light' | 'dark'; projects: Project[]; tasks: Task[]; notes: Note[]; tags: Tag[] };
export const emptyWorkspace = (): Workspace => ({version:1,theme:'light',projects:[],tasks:[],notes:[],tags:[]});
export function newId(): string { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`; }
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string';
export function parseWorkspace(raw: string): Workspace {
  const data: unknown = JSON.parse(raw);
  if (!object(data) || data.version !== 1 || (data.theme !== 'light' && data.theme !== 'dark')) throw new Error('Unsupported workspace version or theme. Stored data was not replaced.');
  for (const key of ['projects','tasks','notes','tags']) if (!Array.isArray(data[key])) throw new Error('Invalid workspace collections. Stored data was not replaced.');
  const ids = new Set<string>();
  for (const item of [...data.projects as unknown[],...data.tasks as unknown[],...data.notes as unknown[],...data.tags as unknown[]]) {
    if (!object(item) || !text(item.id) || !item.id || !text(item.title) || !item.title.trim() || ids.has(item.id)) throw new Error('Invalid or duplicate workspace item.');
    ids.add(item.id);
  }
  const projects = data.projects as Record<string,unknown>[];
  const tags = data.tags as Record<string,unknown>[];
  if (projects.some(p=>!text(p.description))) throw new Error('Invalid project description.');
  for (const item of [...data.tasks as Record<string,unknown>[],...data.notes as Record<string,unknown>[]]) {
    if (item.projectId !== null && !projects.some(p=>p.id===item.projectId)) throw new Error('Unknown project reference.');
    if (!Array.isArray(item.tagIds) || item.tagIds.some(id=>!tags.some(t=>t.id===id)) || new Set(item.tagIds).size!==item.tagIds.length) throw new Error('Invalid tag references.');
  }
  if ((data.tasks as Record<string,unknown>[]).some(t=>(!text(t.status) || !['todo','doing','done'].includes(t.status)))) throw new Error('Invalid task status.');
  if ((data.notes as Record<string,unknown>[]).some(n=>!text(n.body))) throw new Error('Invalid note body.');
  return data as unknown as Workspace;
}
export function removeProject(state: Workspace, id: string): Workspace {
  return {...state,projects:state.projects.filter(p=>p.id!==id),tasks:state.tasks.map(t=>t.projectId===id?{...t,projectId:null}:t),notes:state.notes.map(n=>n.projectId===id?{...n,projectId:null}:n)};
}
export function removeTag(state: Workspace,id:string):Workspace {
  return {...state,tags:state.tags.filter(t=>t.id!==id),tasks:state.tasks.map(t=>({...t,tagIds:t.tagIds.filter(x=>x!==id)})),notes:state.notes.map(n=>({...n,tagIds:n.tagIds.filter(x=>x!==id)}))};
}
export function demoWorkspace():Workspace {
  return {version:1,theme:'light',projects:[{id:'demo-project',title:'Launch notebook',description:'Synthetic local workspace example'}],tasks:[{id:'demo-task',title:'Draft launch checklist',status:'todo',projectId:'demo-project',tagIds:['demo-tag']},{id:'demo-inbox',title:'Sort design ideas',status:'doing',projectId:null,tagIds:[]}],notes:[{id:'demo-note',title:'Launch notes',body:'A small, local-first workspace. This is synthetic demo content.',projectId:'demo-project',tagIds:['demo-tag']}],tags:[{id:'demo-tag',title:'Focus'}]};
}
