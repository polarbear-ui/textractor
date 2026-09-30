// Run: node tests/regression.cjs
// PLAYWRIGHT_MODULE / CHROME_PATH may override the local browser test runtime.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const runtime = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || path.join(runtime, 'playwright'));
const {PNG}=require(path.join(runtime,'pngjs'));
const root = path.resolve(__dirname, '..');
const output = process.env.TEST_OUTPUT || path.join(os.tmpdir(), 'jimun-regression');

(async () => {
  await fs.mkdir(output, {recursive:true});
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'});
  const results=[];
  try {
    const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});
    if(process.env.TEST_OFFLINE==='1')await page.route('https://**/*',async route=>{
      const url=route.request().url();
      const file=url.includes('/html-to-image@')?'html-to-image.js':url.includes('/html2canvas@')?'html2canvas.js':null;
      if(file)await route.fulfill({path:path.join(output,file),contentType:'application/javascript'});
      else await route.abort();
    });
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',d=>d.dismiss());
    // First load the actual local three-file application (no server).
    await page.goto(pathToFileURL(path.join(root,'index.html')).href);
    await page.waitForSelector('#canvas .editable');
    assert.equal(await page.title(),'지문 발췌기 v2');
    results.push('Local file startup');
    console.log('PASS local file startup');

    // A separate harness exposes the actual functions only for range-level assertions.
    let html=await fs.readFile(path.join(root,'index.html'),'utf8');
    let js=await fs.readFile(path.join(root,'app.js'),'utf8');
    js=js.replace('\ninit();','\nwindow.testAPI={editableTextIndex,selectionTextOffsets,textOffsetsRange,readHighlightData,replaceHighlightRange,changeSelectionHighlight,buildCaptureHighlights,createBlock,refreshSlots,relayout,applyGlobalText,get state(){return state},assets,renderBackground,openOutputPreview,closeOutputPreview,getOutput:()=>preparedOutput,setSelection(ed,start,end){savedEditable=ed;savedRange=textOffsetsRange(ed,start,end);restoreSelection();},clearCache:ed=>highlightData.delete(ed)};\ninit();');
    html=html.replace('href="styles.css"',`href="${pathToFileURL(path.join(root,'styles.css')).href}"`).replace('<script src="app.js"></script>',()=>'<script>'+js.replace(/<\/script/gi,'<\\/script')+'</script>');
    const harness=path.join(output,'harness.html');await fs.writeFile(harness,html);
    await page.goto(pathToFileURL(harness).href);
    await page.waitForSelector('#canvas .editable');
    if(process.env.TEST_BACKGROUND_ONLY!=='1'){
    const unit=await page.evaluate(()=>{
      const t=window.testAPI,ed=document.querySelector('#canvas .editable');
      const check=(value,message)=>{if(!value)throw Error(message);};
      ed.innerHTML='ab<b>cd<i>ef</i></b><br><div>gh<span style="color:red">ij</span></div><div>k😀l</div>';
      const text=t.editableTextIndex(ed).text;
      check(text==='abcdef\nghij\nk😀l','plain text with BR, DIV, nested formats, emoji: '+JSON.stringify(text));
      const range=t.textOffsetsRange(ed,3,10),off=t.selectionTextOffsets(ed,range);
      check(off.start===3 && off.end===10,'offset round trip');
      let r=t.replaceHighlightRange([{start:10,end:30,color:'yellow'}],15,20,null);
      check(JSON.stringify(r)===JSON.stringify([{start:10,end:15,color:'yellow'},{start:20,end:30,color:'yellow'}]),'partial removal');
      r=t.replaceHighlightRange([{start:10,end:30,color:'yellow'}],15,25,'blue');
      check(r.length===3 && r[1].color==='blue' && r[2].start===25,'recolor split');
      r=t.replaceHighlightRange(r,15,25,'yellow');check(r.length===1 && r[0].end===30,'adjacent merge');
      ed.innerHTML='0123456789<span style="background-color:#ffe27a">01234567890123456789</span>tail';
      check(t.readHighlightData(ed).ranges[0].start===10,'legacy migration');
      t.setSelection(ed,15,20);t.changeSelectionHighlight(null);
      let data=t.readHighlightData(ed);check(data.ranges.length===2 && data.ranges[0].end===15 && data.ranges[1].start===20,'native removal metadata');
      t.clearCache(ed);data=t.readHighlightData(ed);
      check(data.ranges.length===2 && data.ranges[0].end===15 && data.ranges[1].start===20,'native removal DOM agrees');
      t.setSelection(ed,15,25);t.changeSelectionHighlight('#74a5c2');
      t.clearCache(ed);data=t.readHighlightData(ed);
      check(data.ranges.length===3 && data.ranges[1].start===15 && data.ranges[1].end===25,'native recolor');
      t.setSelection(ed,0,0);document.execCommand('insertText',false,'앞');
      check(t.readHighlightData(ed).ranges[0].start===11,'typing moves ranges');
      document.execCommand('undo');check(t.readHighlightData(ed).ranges[0].start===10,'undo restores ranges');
      return ['offset round trip','range split/merge/recolor','legacy migration','native partial removal/recolor','typing and undo'];
    });
    results.push(...unit);console.log('PASS',unit.join(', '));
    await page.evaluate(()=>{const ed=document.querySelector('#canvas .editable');ed.textContent='0123456789012345678901234567890123456789';testAPI.setSelection(ed,10,30);});
    await page.locator('#btnHiliteApply').click();
    assert.equal(await page.evaluate(()=>testAPI.readHighlightData(document.querySelector('#canvas .editable')).ranges.length),1);
    await page.evaluate(()=>testAPI.setSelection(document.querySelector('#canvas .editable'),15,20));
    await page.locator('#btnHiliteApply').click();
    assert.equal(await page.evaluate(()=>testAPI.readHighlightData(document.querySelector('#canvas .editable')).ranges.length),2);
    await page.locator('#hiliteColor').fill('#74a5c2');
    await page.evaluate(()=>testAPI.setSelection(document.querySelector('#canvas .editable'),15,25));
    await page.locator('#btnHiliteApply').click();
    assert.equal(await page.evaluate(()=>testAPI.readHighlightData(document.querySelector('#canvas .editable')).ranges.length),3);
    results.push('Actual highlight button apply/remove/recolor');

    // Mixed styles and multiline content, plus both bubble directions.
    await page.evaluate(()=>{
      const t=testAPI,ed=document.querySelector('#canvas .editable');
      ed.innerHTML='한 줄의 <span style="background-color:#ffe27a">일부 단어</span> 형광펜입니다.<br><b>굵은 글자와 <span style="background-color:#ffe27a">형광펜이 함께 있는 문장</span></b><br><span style="color:#c62828;background-color:#ffe27a">명시적 개행\n\n'+('여러 줄 자동 줄바꿈과 글자색을 함께 검증하는 긴 문장입니다. ').repeat(9)+'</span><div>문단 경계와 <i><s><span style="background-color:#ffe27a">기울임 취소선</span></s></i> 유지</div>';
      for(const side of ['left','right']){const b=t.createBlock('bubble',side);document.querySelector('#blockList').appendChild(b);b.querySelector('.editable').innerHTML='말풍선 안의 <b><span style="background-color:#ffe27a">'+('일부 강조와 자동 줄바꿈 확인 ').repeat(5)+'</span></b> 끝';}
      t.refreshSlots();t.relayout();
    });
    for(const size of [15,18,24]){
      await page.evaluate(size=>{testAPI.state.fontSize=size;testAPI.applyGlobalText();testAPI.relayout();},size);
      await page.locator('#btnSave').click();
      await page.waitForFunction(()=>!document.querySelector('#btnSave').disabled && !!testAPI.getOutput(),{},{timeout:60000});
      const layout=await page.evaluate(()=>{
        const out=testAPI.getOutput();
        const originals=[...document.querySelectorAll('#canvas .editable')],copies=[...out.querySelectorAll('.editable')];
        return {rectangles:out.querySelectorAll('.capture-highlight-rect').length,spans:out.querySelectorAll('.output-highlight').length,multiline:[...out.querySelectorAll('.output-highlight')].filter(s=>new Set([...s.getClientRects()].filter(r=>r.width>.1).map(r=>Math.round(r.top))).size>1).length,bold:out.querySelectorAll('b').length,breaks:out.querySelectorAll('[data-output-break]').length,textPreserved:copies.every((ed,i)=>ed.textContent===originals[i].textContent),canReflow:copies.every(ed=>getComputedStyle(ed).whiteSpace==='pre-wrap'),manualBreaksPreserved:copies.every((ed,i)=>ed.querySelectorAll('br').length===originals[i].querySelectorAll('br').length)};
      });
      assert.equal(layout.rectangles,0);assert.ok(layout.spans>=7);assert.ok(layout.multiline>0);assert.ok(layout.bold>0);
      assert.equal(layout.breaks,0);assert.ok(layout.textPreserved);assert.ok(layout.canReflow);assert.ok(layout.manualBreaksPreserved);
      const reflow=await page.evaluate(()=>{
        const ed=testAPI.getOutput().querySelector('.editable');
        const highlighted=()=>[...ed.querySelectorAll('.output-highlight')].map(s=>({text:s.textContent,color:s.style.backgroundColor}));
        const lines=()=>[...ed.querySelectorAll('.output-highlight')].reduce((n,s)=>n+s.getClientRects().length,0);
        const before=highlighted(),beforeLines=lines(),width=ed.style.width;
        ed.style.width='230px';const after=highlighted(),afterLines=lines();ed.style.width=width;
        return {same:JSON.stringify(before)===JSON.stringify(after),beforeLines,afterLines};
      });
      assert.ok(reflow.same);assert.ok(reflow.afterLines>reflow.beforeLines);
      await page.screenshot({path:path.join(output,`desktop-${size}.png`),fullPage:true});
      if(size===18){
        // Compare a 1x screenshot of the exact preparedOutput with the actual downloaded PNG.
        await page.evaluate(()=>{testAPI.getOutput().style.transform='none';});
        await page.locator('#outputPreviewWrap > .canvas').screenshot({path:path.join(output,'preview.png')});
        const same=await page.evaluate(()=>{window.previewIdentity=testAPI.getOutput();return !!window.htmlToImage && !!window.html2canvas;});
        assert.ok(same,'capture libraries loaded');
        await page.evaluate(()=>{
          window.captureDiagnostics=[];
          const lib=window.htmlToImage;
          window.htmlToImage={...lib,toPng:async(...args)=>{
            try{const url=await lib.toPng(...args);captureDiagnostics.push('html-to-image success');return url;}
            catch(e){captureDiagnostics.push('html-to-image failed: '+String(e));window.failedCaptureSource=e.target?.src||'';throw e;}
          }};
        });
        const downloadPromise=page.waitForEvent('download',{timeout:60000});
        await page.locator('#previewDownload').click();
        const download=await downloadPromise;await download.saveAs(path.join(output,'output.png'));
        console.log('Capture:',await page.evaluate(()=>captureDiagnostics));
        assert.deepEqual(await page.evaluate(()=>captureDiagnostics),['html-to-image success']);
        const failedSource=await page.evaluate(()=>window.failedCaptureSource||'');
        if(failedSource)await fs.writeFile(path.join(output,'failed-capture-source.txt'),failedSource);
        assert.ok(await page.evaluate(()=>window.previewIdentity===testAPI.getOutput()),'same prepared DOM');
        const fallback=page.waitForEvent('download',{timeout:60000});
        await page.evaluate(()=>{window.savedHtmlToImage=window.htmlToImage;window.htmlToImage={...htmlToImage,toPng:()=>Promise.reject(Error('test fallback'))};});
        await page.locator('#previewDownload').click();await (await fallback).saveAs(path.join(output,'fallback.png'));
        for(const name of ['output.png','fallback.png']){
          const png=PNG.sync.read(await fs.readFile(path.join(output,name)));
          let bands=0,inside=false;
          for(let y=0;y<png.height;y++){
            let yellow=0;
            for(let x=0;x<png.width;x++){
              const i=(y*png.width+x)*4;
              if(png.data[i]>245 && png.data[i+1]>215 && png.data[i+1]<237 && png.data[i+2]>110 && png.data[i+2]<138)yellow++;
            }
            const highlighted=yellow>100;if(highlighted&&!inside)bands++;inside=highlighted;
          }
          assert.ok(bands>=12,`${name}: expected separate line backgrounds, found ${bands}`);
        }
        await page.evaluate(()=>window.htmlToImage=window.savedHtmlToImage);
        if(process.env.TEST_CAPTURE_ONLY==='1')return;
      }
      await page.locator('#previewBack').click();
      console.log('PASS mixed highlights, font size',size);
    }
    results.push('15/18/24px multiline spans; width changes reflow without changing highlighted text or color; no generated BR; PNG and fallback use same prepared DOM');

    // Font changes including the actual upload UI.
    await page.locator('#fontFamily').selectOption('myeongjo');
    await page.locator('#btnSave').click();
    await page.waitForFunction(()=>!document.querySelector('#btnSave').disabled && !!testAPI.getOutput(),{},{timeout:60000});
    await page.screenshot({path:path.join(output,'myeongjo.png'),fullPage:true});
    await page.locator('#previewBack').click();
    const fontFile='C:/Windows/Fonts/malgun.ttf';
    await page.locator('#fontUpload').setInputFiles(fontFile);
    await page.waitForFunction(()=>document.querySelector('#fontFamily').value.startsWith('custom-'));
    await page.locator('#btnSave').click();
    await page.waitForFunction(()=>!document.querySelector('#btnSave').disabled && !!testAPI.getOutput(),{},{timeout:60000});
    assert.ok(await page.evaluate(()=>getComputedStyle(testAPI.getOutput().querySelector('.editable')).fontFamily.includes('UserFont_')));
    await page.screenshot({path:path.join(output,'custom-font.png'),fullPage:true});
    await page.locator('#previewBack').click();results.push('Myeongjo and uploaded font');
    }

    // Landscape PNG over a very tall canvas, plus zoom/translation/blur.
    await page.evaluate(()=>{testAPI.state.fontSize=24;testAPI.applyGlobalText();});
    const background=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1200;c.height=400;const x=c.getContext('2d'),pixels=x.createImageData(1200,400);for(let y=0;y<400;y++)for(let col=0;col<1200;col++){const i=(y*1200+col)*4;pixels.data.set([Math.round(col/1199*255),Math.round(y/399*255),180,255],i);}x.putImageData(pixels,0,0);return c.toDataURL().split(',')[1];});
    await page.evaluate(()=>{document.querySelector('#canvas .editable').appendChild(document.createTextNode(('\n긴 캔버스 테스트').repeat(100)));testAPI.relayout();});
    await page.locator('#bgImageUpload').setInputFiles({name:'landscape.png',mimeType:'image/png',buffer:Buffer.from(background,'base64')});
    await page.waitForFunction(()=>document.querySelector('#bgImageLayer').naturalWidth===1200 && parseFloat(document.querySelector('#bgImageLayer').style.width)>600);
    await page.evaluate(()=>{
      window.bgGeometry=(root=document.querySelector('#canvas'))=>{
        const img=root.querySelector('.canvas-bg-img');
        return {width:parseFloat(img.style.width),height:parseFloat(getComputedStyle(img).height),left:parseFloat(img.style.left),top:parseFloat(img.style.top),viewportWidth:root.clientWidth,viewportHeight:root.clientHeight,src:img.src,filter:img.style.filter};
      };
      window.assertCover=()=>{
        const g=bgGeometry(),b=testAPI.state.bg,zoom=b.zoom/100,cover=Math.max(g.viewportWidth/1200,g.viewportHeight/400);
        if(Math.abs(g.width-1200*cover*zoom)>.1 || Math.abs(g.height-400*cover*zoom)>.1)throw Error('wrong cover size');
        if(g.left>.1||g.top>.1||g.left+g.width<g.viewportWidth-.1||g.top+g.height<g.viewportHeight-.1)throw Error('background gap');
        if(Math.abs(g.width/g.height-3)>.001)throw Error('aspect ratio changed');
        return g;
      };
      window.backgroundSource=bgGeometry().src;
    });
    const bg=await page.evaluate(()=>assertCover());
    assert.ok(bg.viewportHeight>3000);assert.ok(bg.width>600);assert.ok(Math.abs(bg.top)<.1);assert.ok(Math.abs(bg.left-(600-bg.width)/2)<.1);
    for(const x of [-250,0,250]){
      await page.evaluate(x=>{const el=document.querySelector('#bgX');el.value=x;el.dispatchEvent(new Event('input',{bubbles:true}));},x);
      const g=await page.evaluate(()=>assertCover());
      assert.ok(Math.abs(g.left-((600-g.width)/2+x/250*(g.width-600)/2))<.1);
      assert.equal(g.src,bg.src);
    }
    // At 100% cover the landscape image has no vertical overflow.
    await page.evaluate(()=>{testAPI.state.bg.y=250;testAPI.renderBackground();});
    assert.ok(Math.abs((await page.evaluate(()=>assertCover())).top)<.1);
    await page.evaluate(()=>{testAPI.state.bg.x=-125;testAPI.state.bg.y=125;testAPI.state.bg.zoom=160;testAPI.renderBackground();});
    const zoomed=await page.evaluate(()=>assertCover());assert.ok(zoomed.top<0);
    for(const y of [-250,250]){
      const edge=await page.evaluate(y=>{testAPI.state.bg.y=y;testAPI.renderBackground();return assertCover();},y);
      assert.ok(Math.abs(edge.top-(y===250?0:edge.viewportHeight-edge.height))<.1);
    }
    await page.evaluate(()=>{testAPI.state.bg.y=125;testAPI.renderBackground();});
    // Content edits trigger ResizeObserver without resetting zoom/pan.
    await page.evaluate(()=>{const ed=document.querySelector('#canvas .editable');const added=document.createElement('div');added.id='bg-resize-fixture';added.textContent=('추가 내용\n').repeat(12);ed.appendChild(added);});
    await page.waitForFunction(h=>document.querySelector('#canvas').clientHeight>h,zoomed.viewportHeight);
    await page.waitForFunction(()=>Math.abs(parseFloat(document.querySelector('#bgImageLayer').style.width)-document.querySelector('#canvas').clientHeight*3*1.6)<.1);
    await page.evaluate(()=>assertCover());
    assert.deepEqual(await page.evaluate(()=>[testAPI.state.bg.zoom,testAPI.state.bg.x,testAPI.state.bg.y]),[160,-125,125]);
    await page.evaluate(()=>document.querySelector('#bg-resize-fixture').remove());
    await page.waitForFunction(h=>document.querySelector('#canvas').clientHeight===h,zoomed.viewportHeight);
    await page.waitForFunction(()=>Math.abs(parseFloat(document.querySelector('#bgImageLayer').style.width)-document.querySelector('#canvas').clientHeight*3*1.6)<.1);
    const editorGeometry=await page.evaluate(()=>assertCover());
    // Element screenshots extend beyond the live viewport; exclude offscreen fixed drawers.
    await page.locator('#canvas').screenshot({path:path.join(output,'background-editor.png'),style:'.inspector,.selection-toolbar{visibility:hidden!important}'});
    await page.locator('#btnSave').click();
    await page.waitForFunction(()=>!document.querySelector('#btnSave').disabled && !!testAPI.getOutput(),{},{timeout:60000});
    assert.deepEqual(await page.evaluate(()=>bgGeometry(testAPI.getOutput())),editorGeometry);
    const tallDownload=page.waitForEvent('download',{timeout:60000});await page.locator('#previewDownload').click();await (await tallDownload).saveAs(path.join(output,'tall-output.png'));
    await page.locator('#previewBack').click();
    const sourcePng=PNG.sync.read(await fs.readFile(path.join(output,'background-editor.png'))),savedPng=PNG.sync.read(await fs.readFile(path.join(output,'tall-output.png')));
    for(const fraction of [.05,.25,.5,.75,.95]){
      const a=(Math.floor(sourcePng.height*fraction)*sourcePng.width+12)*4;
      const b=(Math.floor(savedPng.height*fraction)*savedPng.width+Math.floor(12*savedPng.width/600))*4;
      for(let channel=0;channel<3;channel++)assert.ok(Math.abs(sourcePng.data[a+channel]-savedPng.data[b+channel])<=5,'editor/PNG background mismatch');
    }
    await page.evaluate(()=>{testAPI.state.bg.zoom=180;testAPI.state.bg.x=50;testAPI.state.bg.y=-30;testAPI.state.bg.blur=8;testAPI.renderBackground();assertCover();});
    assert.equal((await page.evaluate(()=>bgGeometry())).filter,'blur(8px)');
    assert.ok(await page.evaluate(()=>document.querySelector('#bgSolid').style.backgroundImage.includes(backgroundSource)));
    console.log('PASS cover, overflow endpoints, zoom, live content resize, identical editor/preview/PNG background');results.push('Cover with full source preserved, normalized overflow pan, content resize, editor/preview/PNG geometry and pixels');

    // Mobile width and touch context using the real app, with a smaller representative output.
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{const ed=document.querySelector('#canvas .editable');ed.innerHTML='<span style="background-color:#ffe27a">'+('모바일에서도 글자와 형광펜을 함께 출력합니다. ').repeat(12)+'</span>';testAPI.relayout();});
    await page.locator('#mobileSettingsBtn').click();assert.ok(await page.locator('#sidebar').evaluate(el=>el.classList.contains('mobile-open')));
    await page.locator('#closeSidebar').click();
    await page.locator('#mobilePreviewBtn').click();
    await page.waitForFunction(()=>!document.querySelector('#btnSave').disabled && !!testAPI.getOutput(),{},{timeout:60000});
    const mobile=await page.evaluate(()=>{const out=testAPI.getOutput(),r=out.getBoundingClientRect();return {width:r.width,viewport:innerWidth,scale:getComputedStyle(out).transform};});
    assert.ok(mobile.width<=mobile.viewport);assert.notEqual(mobile.scale,'none');
    assert.deepEqual(await page.evaluate(()=>bgGeometry(testAPI.getOutput())),await page.evaluate(()=>assertCover()));
    await page.screenshot({path:path.join(output,'mobile.png')});
    const mobileDownload=page.waitForEvent('download',{timeout:60000});await page.locator('#previewDownload').click();await (await mobileDownload).saveAs(path.join(output,'mobile-output.png'));
    results.push('390px mobile layout, settings, preview, PNG');console.log('PASS mobile preview and PNG');
    await page.locator('#previewBack').click();await page.setViewportSize({width:1280,height:900});
    // Portrait image: vertical exploration at 100%, horizontal exploration after zoom.
    await page.evaluate(()=>{const list=document.querySelector('#blockList');list.replaceChildren(testAPI.createBlock('paragraph'));list.querySelector('.editable').textContent='세로 이미지 확인';testAPI.refreshSlots();testAPI.relayout();});
    const portrait=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=1200;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,0,1200);g.addColorStop(0,'#204080');g.addColorStop(1,'#e08040');x.fillStyle=g;x.fillRect(0,0,400,1200);return c.toDataURL().split(',')[1];});
    await page.locator('#bgImageUpload').setInputFiles({name:'portrait.png',mimeType:'image/png',buffer:Buffer.from(portrait,'base64')});
    await page.waitForFunction(()=>document.querySelector('#bgImageLayer').naturalWidth===400 && parseFloat(document.querySelector('#bgImageLayer').style.width)===600);
    for(const y of [-250,250]){
      const edge=await page.evaluate(y=>{testAPI.state.bg.y=y;testAPI.state.bg.x=250;testAPI.renderBackground();return bgGeometry();},y);
      assert.equal(edge.width,600);assert.ok(Math.abs(edge.height-1800)<.1);assert.equal(edge.left,0);
      assert.ok(Math.abs(edge.top-(y===250?0:edge.viewportHeight-edge.height))<.1);
    }
    const portraitZoom=await page.evaluate(()=>{testAPI.state.bg.zoom=200;testAPI.state.bg.x=-250;testAPI.renderBackground();return bgGeometry();});
    assert.equal(portraitZoom.width,1200);assert.equal(portraitZoom.left,-600);
    await page.evaluate(()=>{testAPI.state.bg.zoom=100;testAPI.state.bg.x=0;testAPI.state.bg.y=250;testAPI.state.bg.blur=8;testAPI.renderBackground();});
    const portraitGeometry=await page.evaluate(()=>bgGeometry());
    await page.locator('#btnSave').click();await page.waitForFunction(()=>!document.querySelector('#btnSave').disabled && !!testAPI.getOutput());
    assert.deepEqual(await page.evaluate(()=>bgGeometry(testAPI.getOutput())),portraitGeometry);
    for(const engine of ['primary','fallback']){
      if(engine==='fallback')await page.evaluate(()=>{window.savedHtmlToImage=window.htmlToImage;window.htmlToImage={...htmlToImage,toPng:()=>Promise.reject(Error('test fallback'))};});
      const download=page.waitForEvent('download',{timeout:60000});await page.locator('#previewDownload').click();
      const dest=path.join(output,`portrait-${engine}.png`);await (await download).saveAs(dest);
      const png=PNG.sync.read(await fs.readFile(dest));
      // An opaque blurred cover background must reach the PNG's very first pixel too.
      assert.ok(png.data[0]<240 && png.data[1]<200 && png.data[2]<200,`${engine} has an empty background edge`);
      if(engine==='fallback')await page.evaluate(()=>window.htmlToImage=window.savedHtmlToImage);
    }
    results.push('Portrait vertical/horizontal overflow; blurred edges filled in both PNG engines');
    assert.deepEqual(errors,[]);
    // The delivered standalone file also starts directly from file://.
    await page.goto(pathToFileURL(path.join(root,'dist','지문-발췌기.html')).href);
    await page.waitForSelector('#canvas .editable');
    assert.equal(await page.title(),'지문 발췌기 v2');results.push('Standalone HTML startup');
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify({results,errors,output,offline:process.env.TEST_OFFLINE==='1'},null,2));
    console.log(JSON.stringify({results,errors,output},null,2));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
