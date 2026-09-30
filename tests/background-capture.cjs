// Focused, offline capture check using the same library versions as the app.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
const runtime=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium}=require(path.join(runtime,'playwright')),{PNG}=require(path.join(runtime,'pngjs'));
const output=process.env.TEST_OUTPUT||path.join(os.tmpdir(),'jimun-regression');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    if(process.env.DEBUG_CAPTURE)page.on('console',msg=>console.log(msg.text()));
    await page.route('https://**/*',async route=>{
      const u=route.request().url(),file=u.includes('/html-to-image@')?'html-to-image.js':u.includes('/html2canvas@')?'html2canvas.js':null;
      if(file)await route.fulfill({path:path.join(output,file),contentType:'application/javascript'});else await route.abort();
    });
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    await page.waitForSelector('#canvas .editable');
    await page.locator('#canvas .editable').fill('배경 이미지 PNG 검증');
    const data=await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=400;c.height=1200;
      const ctx=c.getContext('2d'),g=ctx.createLinearGradient(0,0,0,1200);
      g.addColorStop(0,'#204080');g.addColorStop(1,'#e08040');ctx.fillStyle=g;ctx.fillRect(0,0,400,1200);
      return c.toDataURL().split(',')[1];
    });
    await page.locator('#bgImageUpload').setInputFiles({name:'portrait.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
    await page.waitForFunction(()=>document.querySelector('#bgImageLayer').naturalWidth===400);
    await page.evaluate(()=>{for(const [id,value] of [['bgY',250],['bgBlur',8]]){const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}});
    await page.locator('#btnSave').click();await page.waitForFunction(()=>!document.querySelector('#btnSave').disabled);
    const images=[];
    for(const engine of ['primary','fallback']){
      if(engine==='fallback')await page.evaluate(debug=>{
        window.htmlToImage={...htmlToImage,toPng:()=>Promise.reject(Error('forced fallback'))};
        if(debug){const original=html2canvas;window.html2canvas=(element,options)=>{
          const onclone=options.onclone;
          options.logging=true;options.onclone=async(doc,node)=>{await onclone?.(doc,node);console.log('clone geometry',JSON.stringify({rect:node.getBoundingClientRect().toJSON(),style:node.getAttribute('style'),x:options.x,y:options.y,scale:options.scale}));};
          return original(element,options);
        };}
      },!!process.env.DEBUG_CAPTURE);
      const next=page.waitForEvent('download');await page.locator('#previewDownload').click();
      const target=path.join(output,`background-${engine}.png`);await (await next).saveAs(target);
      const png=PNG.sync.read(await fs.readFile(target));images.push(png);
      console.log(engine,png.width,png.height,[...png.data.slice(0,4)]);
      assert.ok(png.data[0]<240&&png.data[1]<200&&png.data[2]<200,`${engine}: empty top-left edge`);
    }
    for(const f of [0,.25,.5,.75,.99]){
      const pixels=images.map(p=>{const i=(Math.floor(p.height*f)*p.width+12)*4;return [...p.data.slice(i,i+3)];});
      assert.ok(pixels[0].every((v,i)=>Math.abs(v-pixels[1][i])<=5),'different background alignment');
    }
    console.log('PASS: both engines fill the viewport and retain background alignment');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
