// Synthetic browser-only smoke; no real audio, customer data, or model calls.
// Chromium's HTTP error-ignore is isolated to this TEST context. The product
// itself verifies the private CA using the OS/browser trust store.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env',import.meta.url),'utf8').split(/\r?\n/)
    .filter(s=>s.trim() && !s.startsWith('#') && s.includes('='))
    .map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)])
);
const workspaceKey=env.WORKSPACE_TOKEN;
if (!workspaceKey || workspaceKey.length<32) throw Error('no test workspace key');
const host=env.BIND_IP || '127.0.0.1';
const scheme=env.TLS_CERT_PATH && env.TLS_KEY_PATH ? 'https' : 'http';
const base=process.env.AI_CMO_TEST_BASE_URL || (scheme+'://'+host+':8433');
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({
  executablePath:chrome,headless:true,
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'],
});
const context=await browser.newContext({
  ignoreHTTPSErrors:true,permissions:['microphone'],viewport:{width:1260,height:900},
});
let errors=[];
const page=await context.newPage();
page.on('pageerror',err=>{errors.push(err.name)});
try{
  await page.goto(base,{waitUntil:'networkidle',timeout:30000});
  await page.getByText('Capture. Learn. Grow.').waitFor({timeout:10000});
  const input=page.locator('input');
  if(await input.count()<2) throw Error('required workspace setup inputs missing');
  await input.nth(0).fill(base);
  await input.nth(1).fill(workspaceKey);
  await page.getByText('连接工作区').click();
  await page.getByText('synthetic_sample1').waitFor({timeout:14000});
  await page.getByText('02 · Intake').click();
  await page.getByText('Intake 知识候选').waitFor({timeout:5000});
  await page.getByText('03 · AI CMO').click();
  await page.getByText('Run Social Growth Loop').waitFor({timeout:5000});
  await page.getByText('01 · Capture').click();
  // Check browser fake mic (does not substitute for real Android).
  await page.getByText('● 开始录音').click();
  await page.waitForTimeout(1600);
  await page.getByText('■ 停止并保存').click();
  await page.getByText('上传并执行 Recipe').waitFor({timeout:10000});
  const posted=page.waitForResponse(r=>r.url().endsWith('/api/recordings') &&
    r.request().method()==='POST',{timeout:18000});
  await page.getByText('上传并执行 Recipe').click();
  const ack=await posted;
  if(ack.status()!==200) throw Error('Browser audio upload HTTP '+ack.status());
  const saved=await ack.json();
  if(!saved.id || saved.status!=='CAPTURED') throw Error('No durable recording receipt');
  await page.getByText(saved.id).waitFor({timeout:7000});
  mkdirSync(new URL('../.data/qa/',import.meta.url),{recursive:true});
  await page.screenshot({path:new URL('../.data/qa/web-browser-smoke.png',import.meta.url).pathname});
  console.log('WEB_TEST_PASS',JSON.stringify({
    app_render:true,authenticated_data:true,client_navigation:true,
    fake_browser_microphone_recorded:true,
    authenticated_browser_upload:true,
    server_recording_id_present:!!saved.id,
    page_errors:errors
  }));
  if(errors.length)process.exitCode=2;
}catch(e){
  console.log('WEB_TEST_BLOCKED',e?.message?.slice(0,300));
  process.exitCode=1;
}finally{
  await context.close();
  await browser.close();
}
