import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View
} from 'react-native';
import {
  AudioModule, createAudioPlayer, RecordingPresets, setAudioModeAsync,
  useAudioRecorder, useAudioRecorderState
} from 'expo-audio';
import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';

type Recording = {
  id: string; created: string; recipe: string; status: string; bytes: number; llm_consent?: boolean;
};
type Intake = {
  id: string; recipe: string; summary: string; status: string;
  visibility: string; analysis: Record<string, unknown>;
  approved_public_claims?: string[];
};
type Decision = {
  id: string; created: string; status: string;
  decision: { outcome: string; next_action: string; rationale: string; falsifier: string;
    considered: Array<{intake_id:string; disposition:string; reason:string}>; };
};
type Package = {
  id: string; version: number; title: string; caption: string; tags: string[];
  status: string; approved_version?: number;
};
type Job = { id: string; kind:string; status: string; error?: string; decision_id?: string; intake_id?: string; };

const COLORS = {
  bg:'#f7f8fa', ink:'#1f2937', quiet:'#64748b', line:'#dbe2ea',
  primary:'#db5a21', surface:'#ffffff', pale:'#fff5ec', success:'#177245',
};

function getMessage(error:unknown) {
  return error instanceof Error ? error.message : String(error);
}
async function savedGet(key:string) {
  if (Platform.OS === 'web') return window.sessionStorage.getItem(key);
  return await SecureStore.getItemAsync(key);
}
async function savedSet(key:string, value:string) {
  if (Platform.OS === 'web') return window.sessionStorage.setItem(key, value);
  return await SecureStore.setItemAsync(key, value);
}
function Action({label,onPress,quiet=false,disabled=false}:{
  label:string;onPress:()=>void;quiet?:boolean;disabled?:boolean
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={({pressed})=>[
      styles.button,quiet?styles.buttonQuiet:styles.buttonHot,
      (disabled||pressed)&&{opacity:0.55}
    ]}><Text style={[styles.buttonText,quiet&&{color:COLORS.ink}]}>{label}</Text></Pressable>
  );
}
function Panel({children,title,sub}: {children:React.ReactNode;title:string;sub?:string}) {
  return <View style={styles.panel}>
    <Text style={styles.panelTitle}>{title}</Text>
    {sub?<Text style={styles.muted}>{sub}</Text>:null}
    {children}
  </View>;
}
function Tag({text}: {text:string}) {
  return <Text style={styles.tag}>{text}</Text>;
}

export default function App() {
  const recorder = useAudioRecorder({...RecordingPresets.HIGH_QUALITY,directory:'document'});
  const recorderState = useAudioRecorderState(recorder);
  const [server,setServer] = useState(
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location.origin
      : ''
  );
  const [token,setToken] = useState('');
  const [authorized,setAuthorized] = useState(false);
  const [tab,setTab] = useState<'capture'|'knowledge'|'cmo'>('capture');
  const [recipe,setRecipe] = useState('cmo_business_intake');
  const [recordingUri,setRecordingUri] = useState<string|null>(null);
  const [clientId,setClientId] = useState<string|null>(null);
  const [recordings,setRecordings] = useState<Recording[]>([]);
  const [intakes,setIntakes] = useState<Intake[]>([]);
  const [decisions,setDecisions] = useState<Decision[]>([]);
  const [packages,setPackages] = useState<Package[]>([]);
  const [job,setJob] = useState<Job|null>(null);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('请连接 Mac Studio 的私有工作区。');
  const [selected,setSelected] = useState<Package|null>(null);
  const [editTitle,setEditTitle] = useState('');
  const [editCaption,setEditCaption] = useState('');
  const [receipt,setReceipt] = useState('');
  const [allowOpenAI,setAllowOpenAI] = useState(false);
  const [claimsForApproval,setClaimsForApproval] = useState<Record<string,string>>({});
  const [coverUri,setCoverUri] = useState('');

  const base = server.trim().replace(/\/+$/,'');
  const request = async (path:string,options?:RequestInit): Promise<any> => {
    if (!token.trim()) throw new Error('请输入工作区密钥');
    if(Platform.OS !== 'web' && (!base.startsWith('https://') || base.includes('127.0.0.1'))) {
      throw new Error('Android 请填写 Mac Studio 的局域网 HTTPS 地址，而不是手机 localhost');
    }
    const response = await fetch(base+path,{
      ...options,
      headers:{'X-Workspace-Key':token.trim(),...(options?.headers||{})},
    });
    let data:any;
    try { data = await response.json(); }
    catch { throw new Error('服务没有返回有效 JSON（HTTP '+response.status+'）'); }
    if(!response.ok) throw new Error('HTTP '+response.status+': '+JSON.stringify(data.detail||data));
    return data;
  };
  const refresh = async () => {
    if (!token.trim()) return;
    try {
      const [r,i,d,p] = await Promise.all([
        request('/api/recordings'),request('/api/intakes'),
        request('/api/decisions'),request('/api/packages')
      ]);
      setRecordings(r);setIntakes(i);setDecisions(d);setPackages(p);
      setAuthorized(true);
    } catch(e) {setNotice('刷新失败：'+getMessage(e));}
  };
  useEffect(()=>{
    let mounted=true;
    (async()=>{
      const [a,b,c,d] = await Promise.all([
        savedGet('server'),savedGet('token'),savedGet('pending_uri'),savedGet('pending_id')
      ]);
      if(!mounted) return;
      if(a) setServer(a); if(b) setToken(b);
      if(c) setRecordingUri(c);if(d) setClientId(d);
      const permission=await savedGet('allow_openai_analysis');
      if(mounted && permission==='yes') setAllowOpenAI(true);
    })().catch(()=>{});
    return ()=>{mounted=false};
  },[]);
  useEffect(()=>{
    if(!token.trim()) return;
    refresh().catch(()=>{});
  },[authorized,token,server]);
  useEffect(()=>{
    if (!job || !['QUEUED','RUNNING'].includes(job.status)) return;
    const interval=setInterval(async()=>{
      try{
        const next=await request('/api/jobs/'+encodeURIComponent(job.id));
        setJob(next);
        if(['COMPLETED','BLOCKED'].includes(next.status)) {
          setNotice(next.status==='COMPLETED'?'任务完成，可刷新查看结果。':
            ('任务暂停：'+(next.error||'需要检查后台服务')));
          await refresh();
        }
      }catch(e){setNotice('任务状态不可用：'+getMessage(e));}
    },3000);
    return ()=>clearInterval(interval);
  },[job?.id,job?.status,server,token]);
  const connect = async() => {
    try{
      setBusy(true);
      await request('/api/status');
      await Promise.all([savedSet('server',base),savedSet('token',token)]);
      setAuthorized(true);setNotice('已连接 InnoSage 内部工作区');
      await refresh();
    }catch(e){setNotice('连接失败：'+getMessage(e))}
    finally{setBusy(false)}
  };
  const begin = async() => {
    try{
      const p = await AudioModule.requestRecordingPermissionsAsync();
      if(!p.granted) throw new Error('麦克风权限未授权');
      await setAudioModeAsync({playsInSilentMode:true,allowsRecording:true});
      await recorder.prepareToRecordAsync(); recorder.record();
      setNotice('正在录音，停止后将保存到本机应用文档目录。');
    }catch(e){setNotice('录音失败：'+getMessage(e))}
  };
  const end = async() => {
    try{
      await recorder.stop();
      if(!recorder.uri) throw new Error('录音文件不可用');
      const id='a'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,11);
      let uri=recorder.uri;
      if(Platform.OS!=='web') {
        // Recordings may initially live in an evictable cache directory.
        // Move before acknowledging local save or allowing a network upload.
        const extension=uri.split('?')[0].split('.').pop()?.toLowerCase() || 'm4a';
        const file=new File(uri);
        await file.move(new File(Paths.document, id+'.'+extension));
        uri=file.uri;
      }
      setRecordingUri(uri); setClientId(id);
      await savedSet('pending_uri',uri);
      await savedSet('pending_id',id);
      setNotice('已安全保存到手机。请选择 Recipe 后上传。');
    }catch(e){setNotice('停止录音失败：'+getMessage(e))}
  };
  const listenLocal = () => {
    if(!recordingUri) return;
    try {const player=createAudioPlayer(recordingUri);player.play();}
    catch(e){setNotice('播放失败：'+getMessage(e))}
  };
  const listenRemote = async(id:string) => {
    if(Platform.OS!=='web'){
      setNotice('手机端优先播放本机保留的录音；Mac Web 支持远端回放。');
      return;
    }
    try {
      const resp=await fetch(base+'/api/recordings/'+encodeURIComponent(id)+'/audio',{
        headers:{'X-Workspace-Key':token.trim()}
      });
      if(!resp.ok) throw new Error('HTTP '+resp.status);
      const url=URL.createObjectURL(await resp.blob());
      const audio=new Audio(url);
      audio.onended=()=>URL.revokeObjectURL(url);
      await audio.play();
    }catch(e){setNotice('远端播放失败：'+getMessage(e))}
  };
  const upload = async() => {
    if(!recordingUri||!clientId) return;
    try {
      setBusy(true);setNotice('上传中，未确认前原件保留在手机。');
      const form=new FormData();
      form.append('client_id',clientId);
      form.append('recipe',recipe);
      form.append('consent','true');
      form.append('llm_consent',allowOpenAI?'true':'false');
      if(Platform.OS==='web'){
        const blob=await (await fetch(recordingUri)).blob();
        form.append('audio',blob,'recording-'+clientId+'.webm');
      }else{
        const suffix=recordingUri.split('?')[0].split('.').pop()?.toLowerCase() || 'm4a';
        form.append('audio', {uri:recordingUri,name:'recording-'+clientId+'.'+suffix,
          type:suffix==='mp3'?'audio/mpeg':suffix==='wav'?'audio/wav':'audio/mp4'} as any);
      }
      const result=await request('/api/recordings',{method:'POST',body:form});
      setNotice('已上传：'+result.id+'，正在启动本地 Qwen + Recipe...');
      const j=await request('/api/recordings/'+result.id+'/process',{method:'POST'});
      setJob(j);
      await refresh();
    }catch(e){
      setNotice('上传或处理失败（录音仍在本机，可重试）：'+getMessage(e));
    }finally{setBusy(false)}
  };
  const processExisting = async(id:string) =>{
    try{
      setBusy(true);
      const existing=recordings.find(r=>r.id===id);
      if(allowOpenAI && existing && !existing.llm_consent){
        await request('/api/recordings/'+encodeURIComponent(id)+'/consent',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({allow_openai_analysis:true})
        });
      }
      const j=await request('/api/recordings/'+encodeURIComponent(id)+'/process',{method:'POST'});
      setJob(j);setNotice('正在处理：'+id);
    }catch(e){setNotice('处理未启动：'+getMessage(e))}
    finally{setBusy(false)}
  };
  const runCMO=async()=>{
    try {
      setBusy(true);
      const j=await request('/api/cmo/run',{method:'POST'});
      setJob(j);setNotice('CMO 正在考虑最新的 Intake...');
    }catch(e){setNotice('CMO 未启动：'+getMessage(e))}
    finally{setBusy(false)}
  };
  const approveIntake=async(id:string)=>{
    const verifiedClaims=(claimsForApproval[id]||'').split('\n')
      .map(x=>x.trim()).filter(Boolean);
    if(!verifiedClaims.length) {
      setNotice('请先逐行填写已经通过独立核验、允许公开引用的事实。不能直接把会议摘要全部批准。');
      return;
    }
    try{
      await request('/api/intakes/'+encodeURIComponent(id)+'/approve',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({reviewed_source:true,public_claims:verifiedClaims})
      });
      setNotice('只批准已逐条核验的公开事实；未审核的会议摘要仍是内部候选材料。');
      await refresh();
    }catch(e){setNotice('批准失败：'+getMessage(e))}
  };
  const choosePackage=async(p:Package)=>{
    setSelected(p);setEditTitle(p.title);setEditCaption(p.caption);setCoverUri('');
    if(Platform.OS==='web'){
      try{
        const r=await fetch(base+'/api/packages/'+p.id+'/cover',{
          headers:{'X-Workspace-Key':token.trim()}
        });
        if(r.ok) setCoverUri(URL.createObjectURL(await r.blob()));
      }catch{ /* cover remains downloadable via authenticated API */ }
    }else setCoverUri(base+'/api/packages/'+p.id+'/cover');
  };
  const copyPackageText=async()=>{
    if(!selected) return;
    const text=[selected.title,selected.caption,
      selected.tags.map(tag=>tag.startsWith('#')?tag:'#'+tag).join(' ')].filter(Boolean).join('\n\n');
    try{
      const copied=await Clipboard.setStringAsync(text);
      if(!copied) throw new Error('Clipboard not available');
      setNotice('标题、正文和标签已复制，可粘贴到小红书官方发布界面。');
    }catch(e){setNotice('复制失败：'+getMessage(e))}
  };
  const exportCover=async()=>{
    if(!selected)return;
    try{
      const url=base+'/api/packages/'+encodeURIComponent(selected.id)+'/cover';
      if(Platform.OS==='web'){
        const resp=await fetch(url,{headers:{'X-Workspace-Key':token.trim()}});
        if(!resp.ok)throw new Error('Media HTTP '+resp.status);
        const blob=await resp.blob();
        const objectUrl=URL.createObjectURL(blob);
        const anchor=document.createElement('a');
        anchor.href=objectUrl;anchor.download=selected.id+'.png';
        document.body.appendChild(anchor);anchor.click();anchor.remove();
        setTimeout(()=>URL.revokeObjectURL(objectUrl),2000);
        setNotice('已启动 PNG 下载，请使用浏览器下载记录确认实际保存。');
      }else{
        const file=await File.downloadFileAsync(url,new File(Paths.cache,selected.id+'.png'),{
          headers:{'X-Workspace-Key':token.trim()}
        });
        if(!await Sharing.isAvailableAsync()){
          setNotice('手机系统分享不可用；图片已经下载在应用缓存，未确认导出。');
          return;
        }
        await Sharing.shareAsync(file.uri,{mimeType:'image/png'});
        setNotice('已打开系统图片分享面板；最终发布仍需本人在小红书确认。');
      }
    }catch(e){setNotice('图片导出／分享失败：'+getMessage(e))}
  };
  const editPackage=async()=>{
    if(!selected)return;
    try{
      const p=await request('/api/packages/'+selected.id+'/edit',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({title:editTitle,caption:editCaption})
      });
      await choosePackage(p);
      await refresh();
      setNotice('已保存新版本，并加载新图片；旧审批失效。');
    }catch(e){setNotice('编辑失败：'+getMessage(e))}
  };
  const approvePackage=async()=>{
    if(!selected)return;
    try {
      const p=await request('/api/packages/'+selected.id+'/approve',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({verified_sources:true,expected_version:selected.version})
      });
      setSelected(p);await refresh();
      setNotice('已确认当前版本，最终小红书发表仍需本人操作。');
    }catch(e){setNotice('批准失败：'+getMessage(e))}
  };
  const reportPublished=async()=>{
    if(!selected)return;
    try{
      await request('/api/packages/'+selected.id+'/receipt',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({url:receipt})
      });
      setNotice('已登记本人报告的链接；平台验证状态仍为 UNVERIFIED。');
    }catch(e){setNotice('记录失败：'+getMessage(e))}
  };
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.brand}><View style={styles.mark}/><Text style={styles.brandText}>InnoSage <Text style={{color:COLORS.primary}}>AI CMO</Text></Text>
          <Tag text="PRIVATE LAN · DEMO"/></View>
        <Text style={styles.hero}>Capture. Learn. Grow.</Text>
        <Text style={styles.muted}>真实业务资料，成为下一轮社媒决策的依据。</Text>
        <Panel title="工作区连接" sub="同一个 Mac Studio 后端；密钥不会打包进 APK。">
          <Text style={styles.label}>服务地址（Mac 可以 localhost；手机请填 https://Mac的局域网地址:8433）</Text>
          <TextInput style={styles.input} value={server} onChangeText={setServer}
            autoCapitalize="none" autoCorrect={false} placeholder="https://192.168.x.x:8433"/>
          <Text style={styles.label}>工作区密钥</Text>
          <TextInput style={styles.input} value={token} onChangeText={setToken}
            autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="32+ chars secret"/>
          <View style={styles.actions}><Action label={authorized?'重新连接':'连接工作区'} onPress={connect} disabled={busy}/><Action label="刷新" quiet onPress={()=>void refresh()}/></View>
        </Panel>
        <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text>
          {job?<Text style={styles.muted}>当前任务 {job.kind} · {job.status}</Text>:null}
        </View>
        <View style={styles.nav}>
          {([['capture','01 · Capture'],['knowledge','02 · Intake'],['cmo','03 · AI CMO']] as const).map(([id,label])=>
            <Pressable key={id} onPress={()=>setTab(id)} style={[styles.navButton,tab===id&&styles.navActive]}>
              <Text style={[styles.navText,tab===id&&{color:COLORS.ink}]}>{label}</Text>
            </Pressable>
          )}
        </View>
        {tab==='capture'&&<>
          <Panel title="从手机带来真实业务知识" sub="录音只在停止后上传；上传前保留本机原件。">
            <View style={styles.actions}>
              {!recorderState.isRecording?
                <Action label="● 开始录音" onPress={begin} disabled={busy}/>:
                <Action label="■ 停止并保存" onPress={end}/>}
              {recordingUri?<Action label="▷ 播放本地录音" quiet onPress={listenLocal}/>:null}
            </View>
            {recorderState.isRecording?
              <Text style={styles.label}>正在录制 {Math.round(recorderState.durationMillis/1000)} 秒</Text>:null}
            <Text style={styles.label}>选择分析 Recipe</Text>
            {([['meeting_summary','会议整理：摘要／待确认事项'],
               ['cmo_business_intake','CMO 经营洞察：客户问题／内容机会']] as const).map(([key,label])=>
              <Pressable key={key} onPress={()=>setRecipe(key)} style={[styles.recipe,recipe===key&&styles.recipeActive]}>
                <Text style={styles.body}>{recipe===key?'◉':'○'} {label}</Text>
              </Pressable>
            )}
            <Pressable onPress={()=>{const next=!allowOpenAI;setAllowOpenAI(next);
                void savedSet('allow_openai_analysis',next?'yes':'no')}} style={styles.recipe}>
              <Text style={styles.body}>{allowOpenAI?'☑':'☐'} 我允许所选转录文本发送到 OpenAI API 做分析</Text>
              <Text style={styles.small}>原始音频在 Mac Studio 使用本地 Qwen；分析文本会外发到模型服务。仅内部授权资料。</Text>
            </Pressable>
            {recordingUri?<Action label={busy?'处理中...':'上传并执行 Recipe'} onPress={upload} disabled={busy}/>:null}
          </Panel>
          <Panel title="已接收的录音" sub="来自 Mac Studio 持久化存储，重新启动容器后仍可查看。">
            {recordings.length===0?<Text style={styles.muted}>暂无已上传的录音</Text>:recordings.map(r=>
              <View key={r.id} style={styles.item}>
                <View style={styles.itemHead}><Text style={styles.itemTitle}>{r.id}</Text><Tag text={r.status}/></View>
                <Text style={styles.muted}>{r.recipe} · {Math.round(r.bytes/1024)} KB</Text>
                <Action quiet label="▷ Web 回放" onPress={()=>void listenRemote(r.id)}/>
                {r.status!=='ANALYZED_CANDIDATE'?<Action quiet label="执行／重试 Intake" onPress={()=>processExisting(r.id)} disabled={busy}/>:null}
              </View>
            )}
          </Panel>
        </>}
        {tab==='knowledge'&&<>
          <Panel title="Intake 知识候选" sub="已整理 ≠ 已批准事实；候选内容不会自动变成公开声明。">
            {intakes.length===0?<Text style={styles.muted}>没有可用的 Intake。先录音或上传。</Text>:intakes.map(i=>
              <View key={i.id} style={styles.item}>
                <View style={styles.itemHead}><Text style={styles.itemTitle}>{i.recipe}</Text><Tag text={i.status}/></View>
                <Text style={styles.body}>{i.summary}</Text>
                <Text style={styles.muted}>来源：{i.id} · {i.visibility}</Text>
                <Text style={styles.small}>{JSON.stringify(i.analysis).slice(0,1500)}</Text>
                {i.visibility!=='public_approved'?<>
                  <Text style={styles.label}>人工核验后的可公开事实（每行一条，禁止包含私人资料）</Text>
                  <TextInput value={claimsForApproval[i.id]||''} multiline
                    style={[styles.input,{minHeight:68}]}
                    onChangeText={value=>setClaimsForApproval(old=>({...old,[i.id]:value}))}
                    placeholder="例如：InnoSage 的 Draft 是一个 local-first Markdown 编辑器" />
                  <Action quiet label="仅批准上面逐条核验的事实" onPress={()=>approveIntake(i.id)}/>
                </>:<>
                  <Text style={styles.label}>已批准公开事实</Text>
                  {(i.approved_public_claims||[]).map((claim,index)=>
                    <Text key={index} style={styles.body}>• {claim}</Text>)}
                </>}
              </View>
            )}
          </Panel>
        </>}
        {tab==='cmo'&&<>
          <Panel title="让 CMO 选择下一步" sub="每次 Run 自动读取新增 Intake；没有可靠证据时应选择 SKIP。">
            <Action label={busy?'处理中...':'Run Social Growth Loop'} onPress={runCMO} disabled={busy}/>
          </Panel>
          <Panel title="决策与理由">
            {decisions.length===0?<Text style={styles.muted}>尚无 CMO 决策</Text>:decisions.map(d=>
              <View key={d.id} style={styles.item}>
                <View style={styles.itemHead}><Text style={styles.itemTitle}>{d.decision.outcome}</Text><Tag text={d.status}/></View>
                <Text style={styles.body}>{d.decision.next_action}</Text>
                <Text style={styles.muted}>{d.decision.rationale}</Text>
                <Text style={styles.small}>反证条件：{d.decision.falsifier}</Text>
                {d.decision.considered.map(s=><Text style={styles.small} key={s.intake_id}>{s.intake_id} · {s.disposition} · {s.reason}</Text>)}
              </View>
            )}
          </Panel>
          <Panel title="小红书内容审核" sub="生成草稿不等于发布；任何编辑都会使旧审批失效。">
            {packages.length===0?<Text style={styles.muted}>CMO 尚未生成完整内容包。</Text>:packages.map(p=>
              <View key={p.id} style={styles.item}>
                <View style={styles.itemHead}><Text style={styles.itemTitle}>{p.title}</Text><Tag text={'v'+p.version+' · '+p.status}/></View>
                <Text style={styles.muted} numberOfLines={3}>{p.caption}</Text>
                <Action quiet label="打开审核" onPress={()=>choosePackage(p)}/>
              </View>
            )}
          </Panel>
          {selected&&<Panel title={'审核：'+selected.id}>
            <Text style={styles.muted}>1080 × 1440 PNG · 原创排版 · 需要人工确认事实来源</Text>
            {coverUri?<Image source={{uri:coverUri,headers:Platform.OS==='web'?undefined:{'X-Workspace-Key':token}}}
               resizeMode="contain" style={styles.cover}/>:null}
            <TextInput style={styles.input} value={editTitle} onChangeText={setEditTitle} multiline/>
            <TextInput style={[styles.input,{minHeight:130}]} value={editCaption} onChangeText={setEditCaption} multiline/>
            <View style={styles.actions}>
              <Action label="复制标题／正文／标签" quiet onPress={copyPackageText}/>
              <Action label="下载／分享 PNG 图片" quiet onPress={exportCover}/>
              <Action label="保存修改" quiet onPress={editPackage}/>
              <Action label="已核验事实，批准当前版本" onPress={approvePackage}/>
            </View>
            <Text style={styles.label}>本人完成小红书发布后，回填实际链接（未做平台核验）</Text>
            <TextInput style={styles.input} value={receipt} onChangeText={setReceipt}
              placeholder="https://www.xiaohongshu.com/explore/..." autoCapitalize="none"/>
            <Action quiet label="登记发布链接（UNVERIFIED）" onPress={reportPublished}/>
          </Panel>}
        </>}
        {busy?<ActivityIndicator size="large" color={COLORS.primary}/>:null}
        <Text style={styles.footer}>Internal client-zero experiment · No automatic posting · iOS future TODO</Text>
      </ScrollView>
    </View>
  );
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:COLORS.bg},
  container:{width:'100%',maxWidth:1040,alignSelf:'center',padding:20,paddingTop:35,paddingBottom:80, gap:16},
  brand:{flexDirection:'row',alignItems:'center',gap:10,flexWrap:'wrap'},
  mark:{width:15,height:15,borderRadius:4,backgroundColor:COLORS.primary},
  brandText:{fontSize:23,fontWeight:'800',color:COLORS.ink},
  hero:{fontSize:34,fontWeight:'800',letterSpacing:-1,color:COLORS.ink,marginTop:10},
  muted:{fontSize:13,lineHeight:20,color:COLORS.quiet},
  label:{fontSize:12,fontWeight:'600',color:COLORS.quiet,marginTop:14,marginBottom:6},
  small:{color:COLORS.quiet,fontSize:12,lineHeight:19,marginTop:7},
  panel:{backgroundColor:COLORS.surface,borderWidth:1,borderColor:COLORS.line,borderRadius:18,padding:20,gap:8},
  panelTitle:{fontSize:19,fontWeight:'700',color:COLORS.ink},
  body:{fontSize:14,lineHeight:22,color:COLORS.ink},
  input:{borderWidth:1,borderColor:COLORS.line,borderRadius:10,paddingHorizontal:13,paddingVertical:12,color:COLORS.ink,fontSize:14,backgroundColor:'#fff'},
  button:{borderRadius:11,paddingHorizontal:17,paddingVertical:12,alignSelf:'flex-start',marginTop:6},
  buttonHot:{backgroundColor:COLORS.primary},
  buttonQuiet:{backgroundColor:'#eef1f5',borderWidth:1,borderColor:COLORS.line},
  buttonText:{color:'#fff',fontWeight:'700',fontSize:13},
  actions:{flexDirection:'row',gap:10,alignItems:'center',flexWrap:'wrap'},
  notice:{borderWidth:1,borderColor:'#f1d1b7',backgroundColor:COLORS.pale,padding:14,borderRadius:10},
  noticeText:{fontSize:13,color:'#854b1f',lineHeight:20},
  nav:{flexDirection:'row',borderBottomWidth:1,borderBottomColor:COLORS.line,flexWrap:'wrap'},
  navButton:{padding:13,paddingHorizontal:16},
  navActive:{borderBottomColor:COLORS.primary,borderBottomWidth:3},
  navText:{fontSize:14,fontWeight:'600',color:COLORS.quiet},
  tag:{fontSize:10,color:COLORS.primary,paddingHorizontal:9,paddingVertical:6,
    backgroundColor:COLORS.pale,borderRadius:20,overflow:'hidden'},
  recipe:{padding:14,borderColor:COLORS.line,borderWidth:1,borderRadius:10},
  recipeActive:{borderColor:COLORS.primary,backgroundColor:COLORS.pale},
  item:{paddingVertical:15,borderTopWidth:1,borderTopColor:'#e9edf1',gap:9},
  itemHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:6},
  itemTitle:{fontSize:16,fontWeight:'700',color:COLORS.ink,flexShrink:1},
  cover:{width:'100%',aspectRatio:0.75,backgroundColor:'#f4f4f5',borderRadius:10},
  footer:{fontSize:11,color:COLORS.quiet,textAlign:'center',marginTop:25},
});
