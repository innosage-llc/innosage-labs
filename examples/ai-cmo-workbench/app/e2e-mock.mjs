// Synthetic browser-mic Mock E2E. No external model or Qwen calls.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const env=Object.fromEntries(
  readFileSync(new URL('../.env',import.meta.url),'utf8').split(/\r?\n/)
    .filter(x=>x && !x.startsWith('#') && x.includes('='))
    .map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)])
);
const lanDemo=env.WORKSPACE_AUTH_MODE==='lan_demo';
const token=env.WORKSPACE_TOKEN || '';
if(!lanDemo && token.length<32) throw new Error('Token-mode workspace secret missing');
const base=process.env.AI_CMO_TEST_BASE_URL || 'https://'+(env.BIND_IP||'127.0.0.1')+':8433';
const browser=await chromium.launch({
  headless:true,
  executablePath:process.env.SMOKE_CHROME_PATH ||
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'],
});
const context=await browser.newContext({
  ignoreHTTPSErrors:true,acceptDownloads:true,permissions:['microphone'],
  viewport:{width:1200,height:900},
});
const page=await context.newPage();
const pageErrors=[];
page.on('pageerror',err=>pageErrors.push(err.name));
async function api(route,method='GET',data){
  const res=await page.request.fetch(base+route,{
    method,headers:lanDemo?{}:{'X-Workspace-Key':token},
    ...(data?{data}:{})
  });
  return {status:res.status(),body:await res.json()};
}
async function awaitJob(id){
  for(let i=0;i<120;i++){
    const r=await api('/api/jobs/'+id);
    if(['COMPLETED','BLOCKED'].includes(r.body.status))return r.body;
    await page.waitForTimeout(150);
  }
  throw new Error('job never completed');
}
try{
  const health=await page.request.get(base+'/health');
  if(health.status()!==200)throw new Error('unhealthy private service');
  if((await health.json()).auth_mode!==(lanDemo?'lan_demo':'token'))
    throw new Error('Server auth mode does not match fixture test configuration');
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:20000});
  await page.getByText('Capture. Learn. Grow.').waitFor();
  const inputs=page.locator('input');
  await inputs.nth(0).fill(base);
  await page.getByRole('button',{name:'连接工作区'}).click();
  if(!lanDemo){
    await page.getByPlaceholder('32+ chars secret').fill(token);
    await page.getByRole('button',{name:'连接工作区'}).click();
  }else if(await page.getByPlaceholder('32+ chars secret').count()){
    throw new Error('LAN Demo must not display a workspace-token field');
  }
  await page.getByText('MOCK 演示模式',{exact:false}).waitFor({timeout:12000});
  const mode=await api('/api/status');
  if(mode.body.execution_mode!=='mock'||mode.body.transcription_mode!=='mock')
    throw new Error('not in mock mode');

  await page.getByRole('button',{name:'● 开始录音'}).click();
  await page.waitForTimeout(1600);
  await page.getByRole('button',{name:'■ 停止并保存'}).click();
  await page.getByRole('button',{name:'上传并执行 Recipe'}).waitFor();

  const uploaded=page.waitForResponse(r=>r.url().endsWith('/api/recordings')&&
    r.request().method()==='POST',{timeout:20000});
  await page.getByRole('button',{name:'上传并执行 Recipe'}).click();
  const response=await uploaded;
  if(response.status()!==200)throw new Error('audio upload '+response.status());
  const recording=await response.json();
  if(!recording.id)throw new Error('missing recording ID');
  let intake;
  for(let i=0;i<120;i++){
    const r=await api('/api/intakes');
    intake=r.body.find(x=>x.source_id===recording.id);
    if(intake)break;
    await page.waitForTimeout(180);
  }
  if(!intake)throw new Error('mock intake not generated');
  if(intake.execution_mode!=='mock'||intake.model_usage?.requests!==0)
    throw new Error('mock intake falsely claims a model call');
  const transcript=await api('/api/recordings/'+recording.id+'/transcript');
  if(!transcript.body.text.includes('与用户录音内容无关'))
    throw new Error('mock transcript incorrectly labeled');
  await page.getByText('02 · Intake').click();
  await page.getByText('Intake 知识候选').waitFor();
  await page.getByText(intake.summary,{exact:false}).first().waitFor();

  await page.getByText('03 · AI CMO').click();
  const cmoPost=page.waitForResponse(r=>r.url().endsWith('/api/cmo/run')&&
    r.request().method()==='POST',{timeout:20000});
  await page.getByRole('button',{name:'Run Mock Growth Loop'}).click();
  const cmoResponse=await cmoPost;
  if(cmoResponse.status()!==200)throw new Error('CMO '+cmoResponse.status());
  const job=await awaitJob((await cmoResponse.json()).id);
  if(job.status!=='COMPLETED')throw new Error('CMO blocked');
  const decisions=(await api('/api/decisions')).body;
  const d=decisions.find(x=>x.id===job.decision_id);
  if(!d||d.status!=='MOCK_ONLY'||!d.source_intake_ids.includes(intake.id))
    throw new Error('mock decision missing intake evidence');
  const packages=(await api('/api/packages')).body;
  const pack=packages.find(x=>x.decision_id===d.id);
  if(!pack||pack.status!=='MOCK_REVIEW_ONLY')
    throw new Error('mock package not review-only');
  await page.getByRole('button',{name:'打开审核'}).first().click();
  await page.getByRole('button',{name:'下载／分享 PNG 图片'}).waitFor();
  const download=page.waitForEvent('download',{timeout:20000});
  await page.getByRole('button',{name:'下载／分享 PNG 图片'}).click();
  const artifact=await download;
  const qa=new URL('../.data/qa/',import.meta.url);
  mkdirSync(qa,{recursive:true});
  const pngpath=path.join(qa.pathname,'mock-cover.png');
  await artifact.saveAs(pngpath);
  const png=readFileSync(pngpath);
  if(!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
    throw new Error('export is not a valid PNG');
  const approval=await api('/api/packages/'+pack.id+'/approve','POST',
    {verified_sources:true,expected_version:pack.version});
  const receipt=await api('/api/packages/'+pack.id+'/receipt','POST',
    {url:'https://www.xiaohongshu.com/explore/demo'});
  if(approval.status!==409||receipt.status!==409)
    throw new Error('mock package publication not blocked');
  await page.screenshot({path:path.join(qa.pathname,'mock-e2e.png'),fullPage:true});
  if(pageErrors.length)throw new Error('Browser JS error: '+pageErrors.join(','));
  console.log('MOCK_E2E_PASS',JSON.stringify({
    flow:'synthetic mic/upload -> mock transcription -> mock Intake -> mock CMO -> PNG',
    intake_considered:true,model_api_requests:0,public_commit_blocked:true,
    png_bytes:png.length,js_errors:0,
  }));
}catch(err){
  console.error('MOCK_E2E_FAIL',String(err?.message||err).slice(0,440));
  process.exitCode=1;
}finally{
  await context.close();
  await browser.close();
}
