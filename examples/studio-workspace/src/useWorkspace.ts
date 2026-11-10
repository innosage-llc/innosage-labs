import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyWorkspace, parseWorkspace, type Workspace } from './model';
const KEY = 'innosage.studio-workspace.v1';
export function useWorkspace() {
  const [state,setState] = useState<Workspace>(emptyWorkspace);
  const [ready,setReady] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const current = useRef(state);
  const locked = useRef(false);
  const active = useRef(true);
  const loaded = useRef(false);
  const failed = useRef<((s:Workspace)=>Workspace)|null>(null);
  const load = useCallback(async()=>{
    if (locked.current) return;
    locked.current=true; setBusy(true); setError(null);
    try {
      const raw=await AsyncStorage.getItem(KEY);
      const next=raw===null?emptyWorkspace():parseWorkspace(raw);
      if(active.current){current.current=next;loaded.current=true;setState(next);setReady(true);}
    } catch(e) {if(active.current){loaded.current=false;setReady(false);setError(e instanceof Error?e.message:'Could not load local workspace. Stored data was not replaced.');}}
    finally {locked.current=false;if(active.current)setBusy(false);}
  },[]);
  useEffect(()=>{active.current=true;void load();return()=>{active.current=false;};},[load]);
  const commit = useCallback(async(change:(s:Workspace)=>Workspace):Promise<boolean>=>{
    if(locked.current || !loaded.current) return false;
    locked.current=true;setBusy(true);setError(null);
    try {
      const next=change(current.current);
      const encoded=JSON.stringify(next);
      parseWorkspace(encoded);
      await AsyncStorage.setItem(KEY,encoded);
      current.current=next;failed.current=null;
      if(active.current)setState(next);
      return true;
    } catch(e) {
      failed.current=change;
      if(active.current)setError(e instanceof Error?e.message:'Save failed. Your previous saved workspace is intact.');
      return false;
    } finally {locked.current=false;if(active.current)setBusy(false);}
  },[]);
  const retry = useCallback(async()=>{
    if(!loaded.current){await load();return false;}
    return failed.current ? commit(failed.current) : false;
  },[commit,load]);
  return {state,ready,busy,error,commit,retry};
}
