const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const key='jimun-extractor-v2:settings';
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'});try{const page=await browser.newPage();await page.route('https://**/*',r=>r.abort());
const ready=()=>page.waitForSelector('#canvas .editable');
const read=()=>page.evaluate(key=>({bg:JSON.parse(localStorage.getItem(key)).bg,value:+document.querySelector('#brightness').value,label:+document.querySelector('#brightnessVal').textContent,overlay:document.querySelector('#canvasOverlay').style.background}),key);
const mode=async m=>{await page.locator('[data-bgmode="'+m+'"]').evaluate(e=>e.click());};
const brightness=async v=>page.locator('#brightness').evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},v);
for(const file of ['index.html','dist/지문-발췌기.html']){await page.goto(pathToFileURL(path.resolve(__dirname,'..',file)).href);await ready();await page.evaluate(key=>localStorage.removeItem(key),key);await page.reload();await ready();
await mode('image');await brightness(-20);await mode('solid');assert.equal((await read()).value,0);await brightness(10);await mode('gradient');assert.equal((await read()).value,0);await brightness(-5);
for(let reload=0;reload<2;reload++){for(const [m,v] of [['image',-20],['solid',10],['gradient',-5]]){await mode(m);const r=await read();assert.equal(r.value,v);assert.equal(r.label,v);assert.deepEqual(r.bg.brightnessByMode,{solid:10,gradient:-5,image:-20});assert.ok(r.overlay.includes(v===10?'0.1':v===-5?'0.05':'0.2'));}await page.reload();await ready();}
await page.evaluate(()=>{for(const [id,v] of [['bgX',75],['bgY',-60],['bgZoom',160],['bgBlur',8]]){const e=document.getElementById(id);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));}});
for(const preset of ['presetWhite','presetDark']){await mode('image');await page.locator('#'+preset).evaluate(e=>e.click());const r=await read();assert.equal(r.bg.mode,'solid');assert.equal(r.value,0);assert.deepEqual(r.bg.brightnessByMode,{solid:0,gradient:-5,image:-20});assert.deepEqual([r.bg.x,r.bg.y,r.bg.zoom,r.bg.blur],[75,-60,160,8]);await mode('image');assert.equal((await read()).value,-20);}
for(const oldMode of ['solid','gradient','image']){await page.evaluate(({key,oldMode})=>localStorage.setItem(key,JSON.stringify({bg:{mode:oldMode,brightness:-27,x:31,zoom:170}})),{key,oldMode});await page.reload();await ready();const r=await read();assert.deepEqual(r.bg.brightnessByMode,{solid:0,gradient:0,image:0,[oldMode]:-27});assert.equal(r.bg.brightness,undefined);assert.equal(r.value,-27);assert.equal(r.bg.x,31);assert.equal(r.bg.zoom,170);}
await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({bg:{mode:'image',brightness:60,brightnessByMode:{image:-20}}})),key);await page.reload();await ready();assert.deepEqual((await read()).bg.brightnessByMode,{solid:0,gradient:0,image:-20});
console.log('PASS',file,'mode switching, UI/render/storage, reload, presets, preserved image controls, legacy migration and partial map');}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
