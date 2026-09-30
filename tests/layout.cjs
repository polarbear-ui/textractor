const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const {chromium}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=process.env.TEST_OUTPUT;
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'});try{
const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('https://**/*',r=>{const u=r.request().url(),f=u.includes('/html-to-image@')?'html-to-image.js':u.includes('/html2canvas@')?'html2canvas.js':null;return f?r.fulfill({path:path.join(out,f),contentType:'application/javascript'}):r.abort();});
let js=fs.readFileSync(path.join(root,'app.js'),'utf8').replace('\ninit();','\nwindow.layoutAPI={state,createBlock,refreshSlots,applyGlobalText,relayout,prepareOutputClone,selectBlock};\ninit();');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('href="styles.css"',`href="${pathToFileURL(path.join(root,'styles.css')).href}"`).replace('<script src="app.js"></script>',()=>'<script>'+js.replace(/<\/script/gi,'<\\/script')+'</script>');fs.writeFileSync(path.join(out,'layout-harness.html'),html);
await page.goto(pathToFileURL(path.join(out,'layout-harness.html')).href);await page.waitForSelector('#canvas .editable');
for(const width of [1280,390]){await page.setViewportSize({width,height:900});for(const types of [['paragraph'],['paragraph','paragraph','paragraph'],['paragraph','bubble','paragraph'],['html','bubble','bubble']])for(const size of [15,18,24])for(const lh of [1.3,1.6,2]){
const result=await page.evaluate(({types,size,lh})=>{const t=layoutAPI,list=document.querySelector('#blockList'),canvas=document.querySelector('#canvas');list.replaceChildren();t.state.fontSize=size;t.state.lineHeight=lh;t.state.bg.padY=44;
for(const type of types){const b=t.createBlock(type,'left');list.append(b);const ed=b.querySelector('.editable');if(ed)ed.textContent='문단 내용 테스트';else b.querySelector('.html-preview').textContent='HTML 내용';}t.refreshSlots();t.applyGlobalText();t.relayout();
const blocks=[...list.querySelectorAll(':scope > .content-block')],gap=parseFloat(getComputedStyle(list).rowGap);
const geometry=()=>({height:canvas.offsetHeight,scroll:canvas.scrollHeight,blocks:blocks.map(b=>[b.offsetTop,b.offsetHeight,b.offsetWidth]),lines:blocks.map(b=>b.querySelector('.editable')?.getClientRects().length)});
const before=geometry();canvas.querySelectorAll('.insert-slot,.block-tools,.style-chip').forEach(e=>e.style.display='none');const hidden=geometry();canvas.querySelectorAll('.insert-slot,.block-tools,.style-chip').forEach(e=>e.style.removeProperty('display'));
const clone=t.prepareOutputClone();clone.style.position='absolute';clone.style.left='0';document.body.append(clone);const cloned=[...clone.querySelectorAll('.content-block')];const output={height:clone.offsetHeight,blocks:cloned.map(b=>[b.offsetTop,b.offsetHeight,b.offsetWidth]),minHeight:clone.style.minHeight,slots:clone.querySelectorAll('.insert-slot').length};clone.remove();
const gaps=blocks.slice(1).map((b,i)=>b.offsetTop-blocks[i].offsetTop-blocks[i].offsetHeight);return {before,hidden,output,gap,gaps,top:blocks[0].offsetTop,bottom:list.clientHeight-blocks.at(-1).offsetTop-blocks.at(-1).offsetHeight};},{types,size,lh});
assert.deepEqual(result.before,result.hidden);assert.equal(result.output.height,result.before.height);assert.deepEqual(result.output.blocks,result.before.blocks);assert.equal(result.output.minHeight,'');assert.equal(result.output.slots,types.length+1);assert.ok(Math.abs(result.gap-size*lh)<.02);for(const g of result.gaps)assert.ok(Math.abs(g-size*lh)<=1);assert.equal(result.top,44);assert.ok(Math.abs(result.bottom-44)<=1);
}console.log('PASS layout and hidden-controls invariance at width',width);}
// Actual overlay insertion at the first, middle and last boundaries.
await page.evaluate(()=>{const t=layoutAPI,l=document.querySelector('#blockList');l.replaceChildren(t.createBlock('paragraph'));l.querySelector('.editable').textContent='original';t.refreshSlots();t.relayout();});
for(const index of [0,1,3]){const slots=page.locator('#canvas .insert-slot');await slots.nth(index).locator('.slot-plus').click();await slots.nth(index).locator('[data-add="paragraph"]').click();}
assert.equal(await page.locator('#canvas .content-block').count(),4);
await page.evaluate(()=>layoutAPI.selectBlock(document.querySelector('#canvas .content-block')));
const toolbar=page.locator('#mobileBlockTools');await toolbar.waitFor({state:'visible'});const rect=await toolbar.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=390);for(const b of await toolbar.locator('button').all()){const r=await b.boundingBox();assert.ok(r.width>=44&&r.height>=44);}
await page.screenshot({path:path.join(out,'layout-mobile.png'),fullPage:true});
await toolbar.getByRole('button',{name:'아래로',exact:true}).click();await toolbar.getByRole('button',{name:'삭제',exact:true}).click();assert.equal(await page.locator('#canvas .content-block').count(),3);
await page.setViewportSize({width:1280,height:900});
const editor=await page.evaluate(()=>{const t=layoutAPI,l=document.querySelector('#blockList');l.replaceChildren();t.state.fontSize=18;t.state.lineHeight=1.6;for(const color of ['#ff0000','#00ff00','#0000ff']){const b=t.createBlock('paragraph');b.style.background=color;b.querySelector('.editable').textContent='PNG gap test';l.append(b);}t.refreshSlots();t.applyGlobalText();t.relayout();return {height:document.querySelector('#canvas').offsetHeight,blocks:[...l.querySelectorAll('.content-block')].map(b=>({top:b.offsetTop,height:b.offsetHeight}))};});
await page.locator('#btnSave').click();await page.waitForFunction(()=>!document.querySelector('#btnSave').disabled);
assert.equal(await page.locator('#outputPreviewWrap > .canvas').evaluate(e=>e.offsetHeight),editor.height);
const {PNG}=require(process.env.USERPROFILE+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs');
for(const engine of ['primary','fallback']){
if(engine==='fallback')await page.evaluate(()=>window.htmlToImage={...htmlToImage,toPng:()=>Promise.reject(Error('forced fallback'))});
const download=page.waitForEvent('download');await page.locator('#previewDownload').click();const dest=path.join(out,'layout-'+engine+'.png');await (await download).saveAs(dest);const png=PNG.sync.read(fs.readFileSync(dest)),ratio=png.width/600;
for(let n=0;n<3;n++){const ys=[];for(let y=0;y<png.height;y++){const i=(y*png.width+Math.round(44*ratio))*4;const rgb=[...png.data.slice(i,i+3)];if(rgb[n]>240&&rgb.filter((_,j)=>j!==n).every(v=>v<15))ys.push(y);}assert.ok(ys.length);assert.ok(Math.abs(ys[0]/ratio-editor.blocks[n].top)<1);assert.ok(Math.abs((ys.at(-1)+1)/ratio-editor.blocks[n].top-editor.blocks[n].height)<1.1,JSON.stringify({engine,n,first:ys[0]/ratio,last:(ys.at(-1)+1)/ratio,block:editor.blocks[n]}));}
}
console.log('PASS preview height and PNG block/gap positions in both engines');
assert.deepEqual(errors,[]);console.log('PASS overlay insertions, mobile toolbar bounds/touch targets, move/delete; no page errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
