
(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const canvas = $('#canvas'), blockList = $('#blockList'), workspace = $('#workspace'), canvasWrap = $('#canvasWrap');
const bgSolid = $('#bgSolid'), bgImageLayer = $('#bgImageLayer'), overlay = $('#canvasOverlay');
const STORAGE_KEY = 'jimun-extractor-v2:settings';
const DB_NAME = 'jimun-extractor-v2-assets', DB_STORE = 'assets';
let scale = 1, blockSeq = 1, activeBubbleId = null, activeHtmlId = null, savedRange = null, savedEditable = null;
let bubbleEditSide = 'right';
const bubbleOverrides = new Map();
const customFonts = [];

const DEFAULTS = {
  fontFamily:'pretendard', fontSize:18, lineHeight:1.6, textColor:'#222222', foreColor:'#74a5c2', hiliteColor:'#ffe27a', foreHist:[], hiliteHist:[],
  bg:{mode:'solid',color:'#ffffff',gradStart:'#a8c5d6',gradEnd:'#dbe6ec',gradDir:'180',x:0,y:0,zoom:100,blur:0,brightness:0,padX:42,padY:44,round:false},
  bubble:{
    left:{bg:'#2b2d33',opacity:92,text:'#ffffff',fontSize:null,shadow:48,showProfile:true,profileZoom:100,profileX:0,profileY:0},
    right:{bg:'#7d9cb5',opacity:94,text:'#ffffff',fontSize:null,shadow:48,showProfile:true,profileZoom:100,profileX:0,profileY:0}
  }
};
let state = deepClone(DEFAULTS);
let assets = {bgImage:null, leftProfile:null, rightProfile:null};

function deepClone(v){ return JSON.parse(JSON.stringify(v)); }
function clamp(n,a,b){ return Math.max(a,Math.min(b,n)); }
function hexToRgba(hex,a){ hex=String(hex||'#000').replace('#',''); if(hex.length===3) hex=hex.split('').map(c=>c+c).join(''); const n=parseInt(hex,16)||0; return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }
function readAsDataURL(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }

function openDB(){ return new Promise((res,rej)=>{ const q=indexedDB.open(DB_NAME,1); q.onupgradeneeded=()=>{ if(!q.result.objectStoreNames.contains(DB_STORE)) q.result.createObjectStore(DB_STORE); }; q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); }); }
async function idbGet(key){ try{ const db=await openDB(); return await new Promise((res,rej)=>{ const tx=db.transaction(DB_STORE,'readonly'); const rq=tx.objectStore(DB_STORE).get(key); rq.onsuccess=()=>res(rq.result??null); rq.onerror=()=>rej(rq.error); }); }catch(e){ return null; } }
async function idbSet(key,val){ try{ const db=await openDB(); await new Promise((res,rej)=>{ const tx=db.transaction(DB_STORE,'readwrite'); tx.objectStore(DB_STORE).put(val,key); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }catch(e){} }
async function idbClear(){ try{ const db=await openDB(); await new Promise((res,rej)=>{ const tx=db.transaction(DB_STORE,'readwrite'); tx.objectStore(DB_STORE).clear(); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }catch(e){} }

function loadSettings(){ try{ const raw=localStorage.getItem(STORAGE_KEY); if(raw){ const saved=JSON.parse(raw); state={...deepClone(DEFAULTS),...saved,bg:{...deepClone(DEFAULTS.bg),...(saved.bg||{})},bubble:{left:{...deepClone(DEFAULTS.bubble.left),...((saved.bubble||{}).left||{})},right:{...deepClone(DEFAULTS.bubble.right),...((saved.bubble||{}).right||{})}}}; } }catch(e){} }
function saveSettings(){ try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }catch(e){} }

function fontCSSValue(key){ if(key==='myeongjo') return "'Nanum Myeongjo',serif"; if(key==='pretendard') return "'Pretendard','Pretendard Variable',sans-serif"; const f=customFonts.find(x=>x.id===key); return f ? `'${f.family}',sans-serif` : "'Pretendard','Pretendard Variable',sans-serif"; }
function installCustomFonts(list){
  customFonts.length=0; const style=$('#customFontStyles'); style.textContent='';
  (list||[]).forEach((f,i)=>{ if(!f||!f.data) return; const id=f.id||('custom-'+i); const family='UserFont_'+id.replace(/[^a-zA-Z0-9_-]/g,'_'); customFonts.push({id,name:f.name||'사용자 폰트',family,data:f.data}); style.textContent += `@font-face{font-family:"${family}";src:url("${f.data}");font-display:swap;}\n`; });
  refreshFontOptions();
}
function refreshFontOptions(){ const sel=$('#fontFamily'); const base=[['pretendard','프리텐다드 (고딕)'],['myeongjo','나눔명조 (명조)']]; sel.innerHTML=''; base.concat(customFonts.map(f=>[f.id,'내 폰트 · '+f.name])).forEach(([v,t])=>{ const o=document.createElement('option'); o.value=v;o.textContent=t;sel.appendChild(o); }); if([...sel.options].some(o=>o.value===state.fontFamily)) sel.value=state.fontFamily; else { state.fontFamily='pretendard'; sel.value='pretendard'; }
}

function shadowVisual(v){ const n=clamp(+v||0,0,100); if(!n) return {css:'none'}; const a1=(.045+n*.00075).toFixed(3),a2=(.028+n*.00052).toFixed(3); const y1=(1.5+n*.018).toFixed(1),b1=(2.5+n*.025).toFixed(1),y2=(4+n*.035).toFixed(1),b2=(8+n*.055).toFixed(1); return {css:`0 ${y1}px ${b1}px rgba(0,0,0,${a1}), 0 ${y2}px ${b2}px rgba(0,0,0,${a2})`}; }
function fitProfileImage(img){
  if(!img || !img.naturalWidth || !img.naturalHeight) return;
  const size=48, ratio=img.naturalWidth/img.naturalHeight;
  if(ratio>=1){ img.style.height=size+'px'; img.style.width=(size*ratio)+'px'; }
  else { img.style.width=size+'px'; img.style.height=(size/ratio)+'px'; }
}
function setProfileSource(img,src){
  if(!src){ img.removeAttribute('src'); img.dataset.profileSrc=''; img.style.width=''; img.style.height=''; return; }
  if(img.dataset.profileSrc!==src){ img.dataset.profileSrc=src; img.onload=()=>fitProfileImage(img); img.src=src; }
  if(img.complete && img.naturalWidth) fitProfileImage(img);
}
function effectiveBubble(block){ const side=block.dataset.side; const base={...state.bubble[side],profile:assets[side+'Profile']}; const ov=bubbleOverrides.get(block.dataset.id); if(!ov || ov.useDefault!==false) return base; return {...base,...ov}; }
function bubbleShadowParams(v){
  const n=clamp(+v||0,0,100);
  if(!n) return {blur:0,dy:0,op:0};
  return {
    blur: 1.6 + n*0.032,
    dy:   1.0 + n*0.020,
    op:   0.055 + n*0.00115
  };
}

/* iMessage 계열의 "둥근 본체 + 아래쪽으로 말려 나오는 꼬리"를 한 개의 SVG path로 만든다.
   삼각형을 덧붙이는 방식이 아니라, 꼬리까지 하나의 연속 곡선이다. */
function bubblePath(side,w,h,ox){
  const x0=ox, x1=ox+w;
  const r=Math.min(22,Math.max(15,Math.min(w,h)*0.34));

  if(side==='left'){
    return [
      `M ${x0+r} 0`,
      `H ${x1-r}`,
      `Q ${x1} 0 ${x1} ${r}`,
      `V ${h-r}`,
      `Q ${x1} ${h} ${x1-r} ${h}`,
      `H ${x0+31}`,
      /* 바깥쪽으로 살짝 빠졌다가 안쪽으로 말려 들어오는 iMessage형 꼬리 */
      `C ${x0+22} ${h} ${x0+14} ${h+1} ${x0-8} ${h+10}`,
      `C ${x0+2} ${h+10} ${x0+15} ${h+6} ${x0+22} ${h-3}`,
      `C ${x0+12} ${h-2} ${x0+4} ${h-6} ${x0} ${h-13}`,
      `V ${r}`,
      `Q ${x0} 0 ${x0+r} 0`,
      'Z'
    ].join(' ');
  }

  return [
    `M ${x0+r} 0`,
    `H ${x1-r}`,
    `Q ${x1} 0 ${x1} ${r}`,
    `V ${h-13}`,
    `C ${x1-4} ${h-6} ${x1-12} ${h-2} ${x1-22} ${h-3}`,
    `C ${x1-15} ${h+6} ${x1-2} ${h+10} ${x1+8} ${h+10}`,
    `C ${x1-14} ${h+1} ${x1-22} ${h} ${x1-31} ${h}`,
    `H ${x0+r}`,
    `Q ${x0} ${h} ${x0} ${h-r}`,
    `V ${r}`,
    `Q ${x0} 0 ${x0+r} 0`,
    'Z'
  ].join(' ');
}

function renderBubbleArtwork(block){
  if(!block || !block.classList.contains('bubble-block')) return;
  const shell=block.querySelector('.bubble-shell');
  const svg=block.querySelector('.bubble-art');
  if(!shell || !svg) return;

  const side=block.dataset.side;
  const cfg=effectiveBubble(block);
  const w=Math.max(60,Math.round(shell.offsetWidth));
  const h=Math.max(36,Math.round(shell.offsetHeight));

  // 좌우 12px은 꼬리와 그림자용 안전 여백. 본체 크기 자체는 정확히 shell과 동일하다.
  const gutter=12;
  const svgW=w+gutter*2;
  const svgH=h+18;
  svg.setAttribute('viewBox',`0 0 ${svgW} ${svgH}`);
  svg.setAttribute('width',svgW);
  svg.setAttribute('height',svgH);
  svg.style.width=svgW+'px';
  svg.style.height=svgH+'px';
  svg.style.left=(-gutter)+'px';
  svg.style.top='0px';

  const main=svg.querySelector('.bubble-main');
  const filter=svg.querySelector('.bubble-filter');
  const blur=svg.querySelector('.bubble-blur');
  const offset=svg.querySelector('.bubble-offset');
  const flood=svg.querySelector('.bubble-flood');

  const path=bubblePath(side,w,h,gutter);
  main.setAttribute('d',path);
  main.setAttribute('fill',hexToRgba(cfg.bg,cfg.opacity/100));

  const sh=bubbleShadowParams(cfg.shadow);
  const filterId='shadow-'+block.dataset.id;
  filter.setAttribute('id',filterId);
  filter.setAttribute('x','0');
  filter.setAttribute('y','-14');
  filter.setAttribute('width',String(svgW));
  filter.setAttribute('height',String(svgH+28));
  blur.setAttribute('stdDeviation',String(sh.blur));
  offset.setAttribute('dx','0');
  offset.setAttribute('dy',String(sh.dy));
  flood.setAttribute('flood-opacity',String(sh.op));

  if(sh.op>0) main.setAttribute('filter',`url(#${filterId})`);
  else main.removeAttribute('filter');
}

function applyBubbleStyle(block){
  if(!block || !block.classList.contains('bubble-block')) return;
  const cfg=effectiveBubble(block), shell=block.querySelector('.bubble-shell'), stack=block.querySelector('.bubble-stack'), text=block.querySelector('.editable'), frame=block.querySelector('.profile-frame'), img=frame.querySelector('img');
  const bubbleColor=hexToRgba(cfg.bg,cfg.opacity/100); shell.style.setProperty('--bubble-bg',bubbleColor); if(stack) stack.style.setProperty('--bubble-bg',bubbleColor); shell.style.background=bubbleColor;
  text.style.color=cfg.text; text.style.fontFamily=fontCSSValue(state.fontFamily); text.style.fontSize=(cfg.fontSize==null||cfg.fontSize==='')?state.fontSize+'px':clamp(+cfg.fontSize,8,48)+'px'; text.style.lineHeight=state.lineHeight; text.style.textAlign='left';
  const sh=shadowVisual(cfg.shadow); shell.style.boxShadow=sh.css;
  frame.classList.toggle('hidden',!cfg.showProfile); const src=cfg.profile||null; setProfileSource(img,src); frame.classList.toggle('has-img',!!src);
  img.style.transform=`translate(-50%,-50%) translate(${cfg.profileX||0}px,${cfg.profileY||0}px) scale(${(cfg.profileZoom||100)/100})`;
}
function applyParagraphStyle(block){
  if(!block || !block.classList.contains('paragraph-block')) return;
  const el=block.querySelector('.editable');
  if(!el)return;
  el.style.fontFamily=fontCSSValue(state.fontFamily);
  el.style.fontSize=state.fontSize+'px';
  el.style.lineHeight=state.lineHeight;
  el.style.color=state.textColor;
}
function applyGlobalText(){
  $$('.paragraph-block').forEach(applyParagraphStyle);
  $$('.bubble-block').forEach(applyBubbleStyle);
}
function renderBackground(){
  const b=state.bg; bgSolid.style.display='block'; bgImageLayer.style.display='none'; bgSolid.style.background='#fff';
  if(b.mode==='solid') bgSolid.style.background=b.color;
  else if(b.mode==='gradient') bgSolid.style.background=`linear-gradient(${b.gradDir}deg,${b.gradStart},${b.gradEnd})`;
  else if(b.mode==='image' && assets.bgImage){
    bgSolid.style.background='#fff'; bgImageLayer.src=assets.bgImage; bgImageLayer.style.display='block';
    const edge = 1 + Math.min(0.09,(+b.blur||0)*0.0035); const z=(+b.zoom||100)/100*edge;
    bgImageLayer.style.transform=`translate(${b.x}px,${b.y}px) scale(${z})`;
    bgImageLayer.style.filter=`blur(${b.blur}px)`;
  }
  const v=+b.brightness||0; overlay.style.background=v<0?`rgba(0,0,0,${Math.min(.8,-v/100)})`:v>0?`rgba(255,255,255,${Math.min(.8,v/100)})`:'transparent';
  blockList.style.padding=`${b.padY}px ${b.padX}px`;
  blockList.style.setProperty('--mobile-pad-x',b.padX+'px');
  canvas.style.borderRadius=b.round?'14px':'0';
  relayout();
}

function scopeOneSelector(sel,scope){
  sel=String(sel||'').trim();
  if(!sel) return scope;

  // 문서 전체를 가리키는 selector는 HTML 블록 루트 자체로 바꾼다.
  if(/^:root\b/.test(sel)) return sel.replace(/^:root\b/,scope);
  if(/^html\b/.test(sel)){
    sel=sel.replace(/^html\b/,'').trim();
    if(/^body\b/.test(sel)) sel=sel.replace(/^body\b/,'').trim();
    return sel ? scope+' '+sel : scope;
  }
  if(/^body\b/.test(sel)){
    const rest=sel.replace(/^body\b/,'');
    // body.foo / body:hover 같은 경우 블록 루트 자체의 상태/클래스로 취급
    if(/^[.#:[\]]/.test(rest)) return scope+rest;
    return rest.trim() ? scope+' '+rest.trim() : scope;
  }
  return scope+' '+sel;
}

function scopedCssFromText(css,scope){
  css=String(css||'')
    .replace(/@import[\s\S]*?;/gi,'')
    .replace(/expression\s*\([^)]*\)/gi,'')
    .replace(/url\s*\(\s*(['"]?)\s*javascript:[\s\S]*?\)/gi,'url()');

  // 별도 문서에서 CSSOM으로 파싱하므로 원래 앱에는 순간적으로도 적용되지 않는다.
  const doc=document.implementation.createHTMLDocument('');
  const st=doc.createElement('style');
  st.textContent=css;
  doc.head.appendChild(st);

  function rulesToText(rules){
    let out='';
    for(const rule of Array.from(rules||[])){
      // CSSStyleRule
      if(rule.type===1){
        const selectors=rule.selectorText.split(',').map(s=>scopeOneSelector(s,scope)).join(',');
        out+=selectors+'{'+rule.style.cssText+'}';
        continue;
      }
      // @media / @supports / @container 안쪽 selector도 재귀적으로 scope
      if(rule.cssRules && (rule.type===4 || rule.type===12 || rule.constructor?.name==='CSSContainerRule')){
        const head=rule.cssText.slice(0,rule.cssText.indexOf('{')).trim();
        out+=head+'{'+rulesToText(rule.cssRules)+'}';
        continue;
      }
      // @font-face는 selector가 없어도 다른 DOM을 직접 변경하지 않으므로 허용.
      if(rule.type===5){
        out+=rule.cssText;
        continue;
      }
      // keyframes는 애니메이션 이름 충돌 가능성이 있어 현재 버전에서는 제외.
    }
    return out;
  }

  try{return rulesToText(st.sheet?.cssRules||[]);}
  catch(e){return '';}
}

function sanitizeHtmlBlockSource(raw,scopeId){
  const tpl=document.createElement('template');
  tpl.innerHTML=String(raw||'');

  // style은 별도로 꺼내 selector를 scope한 후 다시 넣는다.
  const cssParts=[];
  tpl.content.querySelectorAll('style').forEach(s=>{cssParts.push(s.textContent||'');s.remove();});

  // 실행 코드/별도 문서/사이트 전역 리소스는 제거.
  tpl.content.querySelectorAll('script,iframe,object,embed,base,meta,link[rel="stylesheet"]').forEach(el=>el.remove());

  tpl.content.querySelectorAll('*').forEach(el=>{
    for(const a of Array.from(el.attributes)){
      const name=a.name.toLowerCase();
      const val=String(a.value||'').trim();
      if(/^on/.test(name) || name==='srcdoc'){
        el.removeAttribute(a.name);
        continue;
      }
      if((name==='href'||name==='src'||name==='xlink:href') && /^javascript:/i.test(val)){
        el.removeAttribute(a.name);
        continue;
      }
    }
    // viewport 전체를 덮는 fixed/sticky는 블록 밖으로 나가기 쉬우므로 block 내부 positioning으로 낮춘다.
    if(el.style){
      if(el.style.position==='fixed') el.style.position='absolute';
      if(el.style.position==='sticky') el.style.position='relative';
    }
  });

  const root=document.createElement('div');
  root.className='html-scope-root';
  root.dataset.htmlScope=scopeId;
  root.appendChild(tpl.content);

  const selector='[data-html-scope="'+scopeId+'"]';
  const scopedCss=cssParts.map(c=>scopedCssFromText(c,selector)).filter(Boolean).join('\n');
  if(scopedCss){
    const style=document.createElement('style');
    style.textContent=scopedCss;
    root.prepend(style);
  }
  return root;
}

function renderHtmlBlock(block,source){
  if(!block || !block.classList.contains('html-block')) return;
  block._htmlSource=String(source??'');
  const preview=block.querySelector('.html-preview');
  preview.innerHTML='';
  if(!block._htmlSource.trim()){
    preview.classList.add('is-empty');
    preview.textContent='사이드바에서 HTML 코드를 입력하세요';
  }else{
    preview.classList.remove('is-empty');
    try{
      preview.appendChild(sanitizeHtmlBlockSource(block._htmlSource,block.dataset.id));
    }catch(err){
      preview.classList.add('is-empty');
      preview.textContent='HTML 렌더링 오류: '+err.message;
    }
  }
  requestAnimationFrame(relayout);
}

function showHtmlEditor(block){
  const sec=$('#sec-html'), input=$('#htmlCodeInput'), status=$('#htmlStatus');
  if(!block || !block.classList.contains('html-block')){
    activeHtmlId=null;
    sec.style.display='none';
    return;
  }
  activeHtmlId=block.dataset.id;
  sec.style.display='';
  sec.classList.add('open');
  input.value=block._htmlSource||'';
  status.textContent='선택한 HTML 블록 · 코드를 입력하면 자동으로 미리보기에 반영됩니다.';
}

let htmlPreviewTimer=null;
$('#htmlCodeInput').addEventListener('input',e=>{
  const block=$(`.html-block[data-id="${activeHtmlId}"]`);
  if(!block)return;
  clearTimeout(htmlPreviewTimer);
  const value=e.target.value;
  htmlPreviewTimer=setTimeout(()=>{
    renderHtmlBlock(block,value);
    $('#htmlStatus').textContent='미리보기 반영됨';
  },220);
});

function createBlock(type,side){
  const id='b'+(blockSeq++), block=document.createElement('div'); block.className='content-block'; block.dataset.id=id;
  const tools=`<div class="block-tools" contenteditable="false"><button class="block-tool move-up" title="위로">↑</button><button class="block-tool move-down" title="아래로">↓</button><button class="block-tool delete" title="삭제">✕</button></div>`;
  if(type==='paragraph'){
    block.classList.add('paragraph-block'); block.dataset.type='paragraph';
    block.innerHTML=`${tools}<div class="block-inner"><div class="editable" contenteditable="true" data-placeholder="문단을 입력하거나 붙여넣으세요"></div></div>`;
  }else if(type==='html'){
    block.classList.add('html-block'); block.dataset.type='html';
    block.innerHTML=`${tools}<div class="block-inner"><div class="html-preview is-empty">사이드바에서 HTML 코드를 입력하세요</div></div>`;
    block._htmlSource='';
  }else{
    block.classList.add('bubble-block'); block.dataset.type='bubble'; block.dataset.side=side;
    block.innerHTML=`${tools}<div class="block-inner"><div class="bubble-row"><div class="profile-frame"><img alt=""><span class="profile-placeholder">◉</span></div><div class="bubble-stack"><div class="bubble-shell"><svg class="bubble-art" aria-hidden="true" viewBox="0 0 10 10" preserveAspectRatio="none"><defs><filter class="bubble-filter" filterUnits="userSpaceOnUse"><feGaussianBlur class="bubble-blur" in="SourceAlpha" stdDeviation="3" result="blur"/><feOffset class="bubble-offset" in="blur" dx="0" dy="3" result="offsetBlur"/><feFlood class="bubble-flood" flood-color="#000" flood-opacity="0.14" result="shadowColor"/><feComposite in="shadowColor" in2="offsetBlur" operator="in" result="shadow"/><feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path class="bubble-main" d="M0 0"></path></svg><div class="editable" contenteditable="true" data-placeholder="말풍선을 입력하세요"></div></div><button class="style-chip" type="button" contenteditable="false">개별 스타일</button></div></div></div>`;
    bubbleOverrides.set(id,{useDefault:true});
  }
  attachBlockEvents(block); if(type==='paragraph') applyParagraphStyle(block); else if(type==='bubble') applyBubbleStyle(block); return block;
}
function attachBlockEvents(block){
  const stop=e=>{e.preventDefault();e.stopPropagation();};
  block.querySelectorAll('.block-tool,.style-chip').forEach(b=>b.addEventListener('pointerdown',stop));
  block.querySelector('.move-up').addEventListener('click',e=>{e.stopPropagation();moveBlock(block,-1)});
  block.querySelector('.move-down').addEventListener('click',e=>{e.stopPropagation();moveBlock(block,1)});
  block.querySelector('.delete').addEventListener('click',e=>{
    e.stopPropagation();
    if($$('.content-block').length===1){
      if(block.classList.contains('html-block')){ renderHtmlBlock(block,''); showHtmlEditor(block); }
      else { const ed=block.querySelector('.editable'); if(ed)ed.innerHTML=''; }
      return;
    }
    if(block._bubbleRO) try{block._bubbleRO.disconnect()}catch(err){}
    bubbleOverrides.delete(block.dataset.id);
    if(activeHtmlId===block.dataset.id) showHtmlEditor(null);
    block.remove(); refreshSlots(); relayout();
  });
  if(block.classList.contains('bubble-block')){
    block.querySelector('.style-chip').addEventListener('click',e=>{e.stopPropagation();openBubbleInspector(block)});
  }
  if(block.classList.contains('html-block')){
    block.querySelector('.html-preview').addEventListener('click',e=>{
      e.stopPropagation(); selectBlock(block); showHtmlEditor(block);
      if(window.innerWidth<=860) openSidebar();
    });
  }
  block.addEventListener('pointerdown',()=>selectBlock(block));
}
function selectBlock(block){
  $$('.content-block.selected').forEach(b=>b.classList.remove('selected'));
  block.classList.add('selected');
  if(block.classList.contains('html-block')) showHtmlEditor(block);
  else showHtmlEditor(null);
}
function contentBlocks(){ return $$('.content-block'); }
function moveBlock(block,dir){ const arr=contentBlocks(), i=arr.indexOf(block), j=i+dir; if(j<0||j>=arr.length)return; if(dir<0) blockList.insertBefore(block,arr[j]); else blockList.insertBefore(arr[j],block); refreshSlots(); selectBlock(block); relayout(); }
function refreshSlots(){
  $$('.insert-slot').forEach(x=>x.remove());
  const blocks=contentBlocks();
  const mk=()=>{ const s=document.createElement('div');s.className='insert-slot';s.innerHTML='<button class="slot-plus" type="button" title="요소 추가">＋</button><div class="slot-menu"><button type="button" data-add="paragraph" title="문단" aria-label="문단"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 10h13M4 14h16M4 18h11"/></svg></button><button type="button" data-add="left" title="왼쪽 말풍선" aria-label="왼쪽 말풍선"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 3 1.4-3.7A2 2 0 0 1 3 14.4V7a2 2 0 0 1 2-2Z"/></svg></button><button type="button" data-add="right" title="오른쪽 말풍선" aria-label="오른쪽 말풍선"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M19 5H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10l5 3-1.4-3.7A2 2 0 0 0 21 14.4V7a2 2 0 0 0-2-2Z"/></svg></button><button type="button" data-add="html" title="HTML 블록" aria-label="HTML 블록" style="font:700 12px ui-monospace,monospace">&lt;/&gt;</button></div>';return s; };
  blockList.insertBefore(mk(),blocks[0]||null);
  contentBlocks().forEach(b=>b.after(mk()));
}
blockList.addEventListener('click',e=>{
  const slot=e.target.closest('.insert-slot'); if(!slot)return;
  const add=e.target.closest('[data-add]');
  if(add){
    e.preventDefault();e.stopPropagation();
    const kind=add.dataset.add;
    const b=kind==='paragraph'?createBlock('paragraph'):kind==='html'?createBlock('html'):createBlock('bubble',kind);
    blockList.insertBefore(b,slot); refreshSlots(); selectBlock(b);
    if(kind==='html'){
      showHtmlEditor(b);
      if(window.innerWidth<=860) openSidebar();
      setTimeout(()=>$('#htmlCodeInput').focus(),0);
    }else{
      const ed=b.querySelector('.editable'); if(ed)setTimeout(()=>ed.focus(),0);
    }
    relayout(); return;
  }
  if(e.target.closest('.slot-plus')){ e.preventDefault(); e.stopPropagation(); $$('.insert-slot.open').forEach(x=>{if(x!==slot)x.classList.remove('open')}); slot.classList.toggle('open'); }
});

function sanitizeHTML(html){
  const box=document.createElement('div'); box.innerHTML=html; box.querySelectorAll('script,style,link,meta,iframe,object,embed,svg,img,video,audio,table,input,button').forEach(el=>el.remove());
  box.querySelectorAll('*').forEach(el=>{ const tag=el.tagName; const keep=['B','STRONG','I','EM','S','STRIKE','DEL','SPAN','BR','P','DIV','U']; let c='',bg=''; try{c=el.style.color||'';bg=el.style.backgroundColor||'';}catch(e){}; [...el.attributes].forEach(a=>el.removeAttribute(a.name)); if(c)el.style.color=c;if(bg)el.style.backgroundColor=bg; if(!keep.includes(tag)){ const p=el.parentNode; while(el.firstChild)p.insertBefore(el.firstChild,el);p.removeChild(el);} }); return box.innerHTML;
}
canvas.addEventListener('paste',e=>{ const ed=e.target.closest('.editable'); if(!ed)return; const cb=e.clipboardData; if(!cb)return; e.preventDefault(); const h=cb.getData('text/html'); if(h) document.execCommand('insertHTML',false,sanitizeHTML(h)); else document.execCommand('insertText',false,cb.getData('text/plain')||''); });

function relayout(){ const mobile=window.innerWidth<=860; const avail=mobile?window.innerWidth-28:workspace.clientWidth-64; scale=Math.min(1,Math.max(.35,avail/600)); canvas.style.transform=`scale(${scale})`; canvasWrap.style.width=(600*scale)+'px'; canvasWrap.style.height=(canvas.offsetHeight*scale)+'px'; }
window.addEventListener('resize',relayout); if(window.ResizeObserver) new ResizeObserver(relayout).observe(canvas);

function bindRange(id,key,obj=state,fmt=v=>v){ const el=$('#'+id), out=$('#'+id+'Val'); const sync=()=>{ obj[key]=+el.value; if(out) out.textContent=fmt(el.value); saveSettings(); renderBackground(); applyGlobalText(); }; el.addEventListener('input',sync); }
function renderControls(){
  refreshFontOptions(); $('#fontFamily').value=state.fontFamily; $('#fontSize').value=state.fontSize; $('#fontSizeVal').textContent=state.fontSize+'px'; $('#lineHeight').value=state.lineHeight; $('#lineHeightVal').textContent=Number(state.lineHeight).toFixed(2); $('#foreColor').value=state.foreColor||'#74a5c2'; $('#hiliteColor').value=state.hiliteColor||'#ffe27a'; renderColorHistories();
  const b=state.bg; $('#bgColor').value=b.color; $('#gradStart').value=b.gradStart; $('#gradEnd').value=b.gradEnd; $('#gradDir').value=b.gradDir; $('#bgX').value=b.x;$('#bgXVal').textContent=b.x;$('#bgY').value=b.y;$('#bgYVal').textContent=b.y;$('#bgZoom').value=b.zoom;$('#bgZoomVal').textContent=b.zoom+'%';$('#bgBlur').value=b.blur;$('#bgBlurVal').textContent=b.blur;$('#brightness').value=b.brightness;$('#brightnessVal').textContent=b.brightness;$('#padX').value=b.padX;$('#padXVal').textContent=b.padX+'px';$('#padY').value=b.padY;$('#padYVal').textContent=b.padY+'px';$('#roundCorners').checked=!!b.round;
  setBgModeUI(b.mode); loadBubbleSideControls(bubbleEditSide);
}
function setBgModeUI(mode){ state.bg.mode=mode; $$('#bgModeSeg [data-bgmode]').forEach(b=>b.classList.toggle('active',b.dataset.bgmode===mode)); $('#bgSolidPanel').style.display=mode==='solid'?'':'none';$('#bgGradientPanel').style.display=mode==='gradient'?'':'none';$('#bgImagePanel').style.display=mode==='image'?'':'none'; renderBackground(); saveSettings(); }

$$('.collapse .head[data-toggle]').forEach(h=>h.addEventListener('click',()=>h.parentElement.classList.toggle('open')));
$('#fontFamily').addEventListener('change',e=>{state.fontFamily=e.target.value;saveSettings();applyGlobalText()});
$('#fontSize').addEventListener('input',e=>{state.fontSize=+e.target.value;$('#fontSizeVal').textContent=e.target.value+'px';saveSettings();applyGlobalText();relayout()});
$('#lineHeight').addEventListener('input',e=>{state.lineHeight=+e.target.value;$('#lineHeightVal').textContent=Number(e.target.value).toFixed(2);saveSettings();applyGlobalText();relayout()});
function currentParagraphEditable(){
  if(savedEditable && document.body.contains(savedEditable) && savedEditable.closest('.paragraph-block')) return savedEditable;
  const selected=$('.paragraph-block.selected .editable'); if(selected) return selected;
  const active=document.activeElement?.closest?.('.paragraph-block .editable'); return active||null;
}
function setParagraphAlign(align){ const ed=currentParagraphEditable(); if(!ed)return; ed.style.textAlign=align; $$('#paragraphAlign [data-align]').forEach(b=>b.classList.toggle('active',b.dataset.align===align)); }
$$('#paragraphAlign [data-align]').forEach(b=>{ b.addEventListener('pointerdown',e=>e.preventDefault()); b.addEventListener('click',()=>setParagraphAlign(b.dataset.align)); });
function pushHistory(key,color){ color=String(color||'').toLowerCase(); if(!/^#[0-9a-f]{6}$/i.test(color))return; const arr=state[key]||(state[key]=[]); const i=arr.indexOf(color); if(i>=0)arr.splice(i,1);arr.unshift(color);if(arr.length>8)arr.length=8;saveSettings();renderColorHistories(); }
function renderSwatches(arr,host,picker,applyOnClick){ host.innerHTML=''; (arr||[]).forEach(c=>{const b=document.createElement('button');b.type='button';b.className='swatch';b.style.setProperty('--swatch',c);b.title=c;b.addEventListener('pointerdown',e=>e.preventDefault());b.addEventListener('click',()=>{picker.value=c;if(applyOnClick)applyOnClick(c);});host.appendChild(b)}); if((arr||[]).length){const clear=document.createElement('button');clear.type='button';clear.className='swatch-clear';clear.textContent='비우기';clear.addEventListener('click',()=>{arr.length=0;saveSettings();renderColorHistories()});host.appendChild(clear);} }
function applyForeColor(c){ if(!savedRange)return; execFmt('foreColor',c); state.foreColor=c;pushHistory('foreHist',c); }
function renderColorHistories(){ const fp=$('#foreColor'),hp=$('#hiliteColor'); renderSwatches(state.foreHist,$('#foreHist'),fp,applyForeColor); renderSwatches(state.hiliteHist,$('#hiliteHist'),hp,c=>{state.hiliteColor=c;saveSettings();}); }
$('#foreColor').addEventListener('input',e=>{state.foreColor=e.target.value;saveSettings()}); $('#hiliteColor').addEventListener('input',e=>{state.hiliteColor=e.target.value;saveSettings()});
$('#btnFore').addEventListener('pointerdown',e=>e.preventDefault()); $('#btnFore').addEventListener('click',()=>applyForeColor($('#foreColor').value));
function applyHiliteColor(c){ if(!savedRange)return; execFmt('hiliteColor',c); state.hiliteColor=c; pushHistory('hiliteHist',c); }

function isTransparentColor(v){
  const s=String(v||'').replace(/\s+/g,'').toLowerCase();
  return !s || s==='transparent' || s==='rgba(0,0,0,0)' || s==='hsla(0,0%,0%,0)';
}
function selectedTextNodes(range){
  if(!range)return[];
  const root=range.commonAncestorContainer.nodeType===3?range.commonAncestorContainer.parentNode:range.commonAncestorContainer;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
    if(!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
    try{return range.intersectsNode(node)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}catch(e){return NodeFilter.FILTER_REJECT;}
  }});
  const out=[];let n;while((n=walker.nextNode()))out.push(n);
  if(root.nodeType===3 && root.nodeValue.trim())out.push(root);
  return out;
}
function selectionHasHighlight(){
  if(!savedRange)return false;
  const nodes=selectedTextNodes(savedRange);
  if(!nodes.length){
    try{return !isTransparentColor(document.queryCommandValue('hiliteColor'));}catch(e){return false;}
  }
  return nodes.every(n=>{
    let el=n.parentElement;
    while(el && el!==savedEditable){
      const inline=el.style?.backgroundColor;
      if(inline && !isTransparentColor(inline)) return true;
      el=el.parentElement;
    }
    const own=n.parentElement?getComputedStyle(n.parentElement).backgroundColor:'';
    return !isTransparentColor(own);
  });
}
function clearSelectionHighlight(){
  if(!restoreSelection())return;
  try{document.execCommand('styleWithCSS',false,true)}catch(e){}
  // Chromium 계열은 hiliteColor transparent가 가장 잘 먹고, 일부 브라우저는 backColor가 더 안정적이다.
  try{document.execCommand('hiliteColor',false,'transparent')}catch(e){}
  try{document.execCommand('backColor',false,'transparent')}catch(e){}
  const s=window.getSelection();if(s&&s.rangeCount)savedRange=s.getRangeAt(0).cloneRange();
  updateFmtStates();
}
function toggleSelectionHighlight(){
  if(!savedRange || !restoreSelection())return;
  if(selectionHasHighlight()) clearSelectionHighlight();
  else applyHiliteColor($('#hiliteColor').value);
}
$('#btnHiliteApply').addEventListener('pointerdown',e=>e.preventDefault());
$('#btnHiliteApply').addEventListener('click',toggleSelectionHighlight);
$('#fontUpload').addEventListener('change',async e=>{ const f=e.target.files&&e.target.files[0]; if(!f)return; const data=await readAsDataURL(f); const id='custom-'+Date.now(); const stored=await idbGet('customFonts')||[]; stored.push({id,name:f.name,data}); await idbSet('customFonts',stored); installCustomFonts(stored); state.fontFamily=id; $('#fontFamily').value=id; saveSettings(); applyGlobalText(); e.target.value=''; });

$('#bgModeSeg').addEventListener('click',e=>{const b=e.target.closest('[data-bgmode]');if(b)setBgModeUI(b.dataset.bgmode)});
$('#bgColor').addEventListener('input',e=>{state.bg.color=e.target.value;saveSettings();renderBackground()});
$('#gradStart').addEventListener('input',e=>{state.bg.gradStart=e.target.value;saveSettings();renderBackground()});
$('#gradEnd').addEventListener('input',e=>{state.bg.gradEnd=e.target.value;saveSettings();renderBackground()});
$('#gradDir').addEventListener('change',e=>{state.bg.gradDir=e.target.value;saveSettings();renderBackground()});
[['bgX','x',v=>v],['bgY','y',v=>v],['bgZoom','zoom',v=>v+'%'],['bgBlur','blur',v=>v],['brightness','brightness',v=>v],['padX','padX',v=>v+'px'],['padY','padY',v=>v+'px']].forEach(([id,key,fmt])=>{const el=$('#'+id),out=$('#'+id+'Val');el.addEventListener('input',()=>{state.bg[key]=+el.value;out.textContent=fmt(el.value);saveSettings();renderBackground()})});
$('#roundCorners').addEventListener('change',e=>{state.bg.round=e.target.checked;saveSettings();renderBackground()});
$('#bgImageUpload').addEventListener('change',async e=>{const f=e.target.files&&e.target.files[0];if(!f)return;assets.bgImage=await readAsDataURL(f);await idbSet('bgImage',assets.bgImage);state.bg.mode='image';saveSettings();setBgModeUI('image');e.target.value=''});
$('#presetWhite').addEventListener('click',()=>{state.bg.mode='solid';state.bg.color='#ffffff';state.textColor='#222222';saveSettings();renderControls();applyGlobalText()});
$('#presetDark').addEventListener('click',()=>{state.bg.mode='solid';state.bg.color='#1e1f26';state.textColor='#ffffff';saveSettings();renderControls();applyGlobalText()});

function loadBubbleSideControls(side){ bubbleEditSide=side; const c=state.bubble[side]; $('#bubbleSideTitle').textContent=(side==='left'?'왼쪽':'오른쪽')+' 말풍선 기본값'; $$('#bubbleSideSeg [data-bside]').forEach(b=>b.classList.toggle('active',b.dataset.bside===side)); $('#bubbleBg').value=c.bg;$('#bubbleOpacity').value=c.opacity;$('#bubbleOpacityVal').textContent=c.opacity+'%';$('#bubbleText').value=c.text;$('#bubbleFontSize').value=c.fontSize==null?'':c.fontSize;$('#bubbleShadow').value=c.shadow;$('#bubbleShadowVal').textContent=c.shadow;$('#profileShow').checked=!!c.showProfile;$('#profileZoom').value=c.profileZoom;$('#profileZoomVal').textContent=c.profileZoom+'%';$('#profileX').value=c.profileX;$('#profileXVal').textContent=c.profileX;$('#profileY').value=c.profileY;$('#profileYVal').textContent=c.profileY; }
$('#bubbleSideSeg').addEventListener('click',e=>{const b=e.target.closest('[data-bside]');if(b)loadBubbleSideControls(b.dataset.bside)});
function updateBubbleDefault(key,val){ state.bubble[bubbleEditSide][key]=val; saveSettings(); $$('.bubble-block').forEach(applyBubbleStyle); }
$('#bubbleBg').addEventListener('input',e=>updateBubbleDefault('bg',e.target.value));$('#bubbleOpacity').addEventListener('input',e=>{updateBubbleDefault('opacity',+e.target.value);$('#bubbleOpacityVal').textContent=e.target.value+'%'});$('#bubbleText').addEventListener('input',e=>updateBubbleDefault('text',e.target.value));$('#bubbleFontSize').addEventListener('input',e=>updateBubbleDefault('fontSize',e.target.value===''?null:clamp(+e.target.value,8,48)));$('#bubbleShadow').addEventListener('input',e=>{updateBubbleDefault('shadow',+e.target.value);$('#bubbleShadowVal').textContent=e.target.value});$('#profileShow').addEventListener('change',e=>updateBubbleDefault('showProfile',e.target.checked));$('#profileZoom').addEventListener('input',e=>{updateBubbleDefault('profileZoom',+e.target.value);$('#profileZoomVal').textContent=e.target.value+'%'});$('#profileX').addEventListener('input',e=>{updateBubbleDefault('profileX',+e.target.value);$('#profileXVal').textContent=e.target.value});$('#profileY').addEventListener('input',e=>{updateBubbleDefault('profileY',+e.target.value);$('#profileYVal').textContent=e.target.value});
$('#profileUpload').addEventListener('change',async e=>{const f=e.target.files&&e.target.files[0];if(!f)return;const data=await readAsDataURL(f);assets[bubbleEditSide+'Profile']=data;await idbSet(bubbleEditSide+'Profile',data);$$('.bubble-block').forEach(applyBubbleStyle);e.target.value=''});

const backdrop=$('#sheetBackdrop'), inspector=$('#bubbleInspector'), insFields=$('#insFields');
function syncSheetLock(){ const open=inspector.classList.contains('show')||$('#sidebar').classList.contains('mobile-open'); document.body.classList.toggle('sheet-lock',open&&window.innerWidth<=860); }
function showBackdrop(){backdrop.classList.add('show');syncSheetLock()}function hideBackdropIfFree(){if(!inspector.classList.contains('show')&&!$('#sidebar').classList.contains('mobile-open'))backdrop.classList.remove('show');syncSheetLock()}
function openBubbleInspector(block){ activeBubbleId=block.dataset.id; selectBlock(block); const side=block.dataset.side, base={...state.bubble[side],profile:assets[side+'Profile']}; const ov=bubbleOverrides.get(activeBubbleId)||{useDefault:true}; $('#insUseDefault').checked=ov.useDefault!==false; const c=ov.useDefault!==false?base:{...base,...ov}; $('#insBg').value=c.bg;$('#insOpacity').value=c.opacity;$('#insOpacityVal').textContent=c.opacity+'%';$('#insText').value=c.text;$('#insFontSize').value=c.fontSize==null?'':c.fontSize;$('#insShadow').value=c.shadow;$('#insShadowVal').textContent=c.shadow;$('#insProfileShow').checked=!!c.showProfile;$('#insProfileZoom').value=c.profileZoom;$('#insProfileZoomVal').textContent=c.profileZoom+'%';$('#insProfileX').value=c.profileX;$('#insProfileXVal').textContent=c.profileX;$('#insProfileY').value=c.profileY;$('#insProfileYVal').textContent=c.profileY; insFields.classList.toggle('disabled',ov.useDefault!==false); inspector.classList.add('show');showBackdrop();hideSelectionToolbar(); }
function closeInspector(){inspector.classList.remove('show');hideBackdropIfFree()}
$('#closeInspector').addEventListener('click',closeInspector);backdrop.addEventListener('click',()=>{closeInspector();closeSidebar()});
$('#insUseDefault').addEventListener('change',e=>{const b=$(`.bubble-block[data-id="${activeBubbleId}"]`);if(!b)return; const side=b.dataset.side; if(e.target.checked){bubbleOverrides.set(activeBubbleId,{useDefault:true});}else{const base={...state.bubble[side],profile:assets[side+'Profile']};bubbleOverrides.set(activeBubbleId,{...base,useDefault:false});} openBubbleInspector(b);applyBubbleStyle(b)});
function updateOverride(key,val){const b=$(`.bubble-block[data-id="${activeBubbleId}"]`);if(!b)return;let o=bubbleOverrides.get(activeBubbleId);if(!o||o.useDefault!==false){const side=b.dataset.side;o={...state.bubble[side],profile:assets[side+'Profile'],useDefault:false};bubbleOverrides.set(activeBubbleId,o);$('#insUseDefault').checked=false;insFields.classList.remove('disabled');}o[key]=val;applyBubbleStyle(b)}
$('#insBg').addEventListener('input',e=>updateOverride('bg',e.target.value));$('#insOpacity').addEventListener('input',e=>{updateOverride('opacity',+e.target.value);$('#insOpacityVal').textContent=e.target.value+'%'});$('#insText').addEventListener('input',e=>updateOverride('text',e.target.value));$('#insFontSize').addEventListener('input',e=>updateOverride('fontSize',e.target.value===''?null:clamp(+e.target.value,8,48)));$('#insShadow').addEventListener('input',e=>{updateOverride('shadow',+e.target.value);$('#insShadowVal').textContent=e.target.value});$('#insProfileShow').addEventListener('change',e=>updateOverride('showProfile',e.target.checked));$('#insProfileZoom').addEventListener('input',e=>{updateOverride('profileZoom',+e.target.value);$('#insProfileZoomVal').textContent=e.target.value+'%'});$('#insProfileX').addEventListener('input',e=>{updateOverride('profileX',+e.target.value);$('#insProfileXVal').textContent=e.target.value});$('#insProfileY').addEventListener('input',e=>{updateOverride('profileY',+e.target.value);$('#insProfileYVal').textContent=e.target.value});$('#insProfileUpload').addEventListener('change',async e=>{const f=e.target.files&&e.target.files[0];if(!f)return;updateOverride('profile',await readAsDataURL(f));e.target.value=''});

const fmtBar=$('#selectionToolbar');
function selectionInsideEditable(){const s=window.getSelection();if(!s||!s.rangeCount||s.isCollapsed)return null;const r=s.getRangeAt(0);let n=r.commonAncestorContainer;n=n.nodeType===3?n.parentElement:n;const ed=n&&n.closest?n.closest('.editable'):null;return ed&&canvas.contains(ed)?{s,r,ed}:null;}
function showSelectionToolbar(){const x=selectionInsideEditable();if(!x){hideSelectionToolbar();return;}savedRange=x.r.cloneRange();savedEditable=x.ed;fmtBar.classList.add('show');fmtBar.setAttribute('aria-hidden','false');updateFmtStates();}
function hideSelectionToolbar(){fmtBar.classList.remove('show');fmtBar.setAttribute('aria-hidden','true')}
let selTimer=null;document.addEventListener('selectionchange',()=>{clearTimeout(selTimer);selTimer=setTimeout(showSelectionToolbar,20)});
function restoreSelection(){if(!savedRange||!savedEditable||!document.body.contains(savedEditable))return false;savedEditable.focus();const s=window.getSelection();s.removeAllRanges();s.addRange(savedRange);return true;}
function execFmt(cmd,val){if(!restoreSelection())return;try{document.execCommand('styleWithCSS',false,true)}catch(e){} document.execCommand(cmd,false,val??null);const s=window.getSelection();if(s&&s.rangeCount)savedRange=s.getRangeAt(0).cloneRange();updateFmtStates();}
['fmtBold','fmtItalic','fmtStrike','fmtHilite'].forEach(id=>$('#'+id).addEventListener('pointerdown',e=>e.preventDefault()));
$('#fmtBold').addEventListener('click',()=>execFmt('bold'));$('#fmtItalic').addEventListener('click',()=>execFmt('italic'));$('#fmtStrike').addEventListener('click',()=>execFmt('strikeThrough'));
$('#fmtHilite').addEventListener('click',toggleSelectionHighlight);
function updateFmtStates(){try{$('#fmtBold').classList.toggle('active',document.queryCommandState('bold'));$('#fmtItalic').classList.toggle('active',document.queryCommandState('italic'));$('#fmtStrike').classList.toggle('active',document.queryCommandState('strikeThrough'));$('#fmtHilite').classList.toggle('active',selectionHasHighlight());}catch(e){}}

function openSidebar(){if(window.innerWidth>860)return;$('#sidebar').classList.add('mobile-open');showBackdrop();hideSelectionToolbar()}function closeSidebar(){$('#sidebar').classList.remove('mobile-open');hideBackdropIfFree()}$('#mobileSettingsBtn').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openSidebar()});$('#closeSidebar').addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeSidebar()});

function buildCaptureHighlights(root){
  const records=[], layers=[];
  root.querySelectorAll('.editable *').forEach(el=>{
    const bg=el.style && el.style.backgroundColor;
    if(!bg || bg==='transparent' || bg==='rgba(0, 0, 0, 0)') return;
    const host=el.closest('.bubble-shell') || el.closest('.block-inner');
    if(!host || !root.contains(host)) return;

    let layer=host.querySelector(':scope > .capture-highlight-layer');
    if(!layer){
      layer=document.createElement('div');
      layer.className='capture-highlight-layer';
      host.prepend(layer);
      layers.push(layer);
    }

    // 최종 출력 DOM이 실제로 배치된 뒤의 줄별 사각형 좌표를 사용한다.
    const range=document.createRange();
    range.selectNodeContents(el);
    const hr=host.getBoundingClientRect();
    Array.from(range.getClientRects()).forEach(r=>{
      if(r.width<=.5 || r.height<=.5) return;
      const d=document.createElement('div');
      d.className='capture-highlight-rect';
      d.style.left=(r.left-hr.left)+'px';
      d.style.top=(r.top-hr.top)+'px';
      d.style.width=r.width+'px';
      d.style.height=r.height+'px';
      d.style.backgroundColor=bg;
      layer.appendChild(d);
    });

    records.push([el,bg]);
    el.style.backgroundColor='transparent';
  });
  return ()=>{
    records.forEach(([el,bg])=>{ if(document.body.contains(el)) el.style.backgroundColor=bg; });
    layers.forEach(x=>x.remove());
  };
}

function buildCaptureBubbleShadows(root){
  const created=[];
  Array.from(root.querySelectorAll('.bubble-block')).forEach(block=>{
    const shell=block.querySelector('.bubble-shell');
    const stack=block.querySelector('.bubble-stack');
    if(!shell || !stack)return;

    const cfg=effectiveBubble(block);
    const strength=clamp(+cfg.shadow||0,0,100);
    if(strength<=0)return;

    // html-to-image가 box-shadow blur를 누락하는 환경을 위한 출력 전용 shadow.
    const layer=document.createElement('div');
    layer.className='capture-bubble-shadow-layer';

    const isLeft=block.dataset.side==='left';
    const radius=isLeft ? '24px 24px 24px 0' : '24px 24px 0 24px';
    const w=shell.offsetWidth, h=shell.offsetHeight;
    const steps=[
      {y:1,spread:0,a:.030},
      {y:2,spread:.5,a:.026},
      {y:3,spread:1,a:.021},
      {y:4,spread:1.5,a:.016},
      {y:5,spread:2,a:.011},
      {y:6,spread:2.6,a:.007}
    ];
    const factor=strength/60;

    steps.forEach(s=>{
      const d=document.createElement('div');
      d.className='capture-bubble-shadow-piece';
      const sp=s.spread;
      d.style.left=(-sp)+'px';
      d.style.top=(s.y-sp)+'px';
      d.style.width=(w+sp*2)+'px';
      d.style.height=(h+sp*2)+'px';
      d.style.borderRadius=radius;
      d.style.background='rgba(0,0,0,'+Math.min(.18,s.a*factor).toFixed(4)+')';
      layer.appendChild(d);
    });

    stack.insertBefore(layer,stack.firstChild);
    created.push(layer);
  });
  return ()=>created.forEach(el=>el.remove());
}

function normalizeOutputPng(dataUrl,w,h,fill){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      try{
        const c=document.createElement('canvas');
        c.width=w;c.height=h;
        const ctx=c.getContext('2d');
        ctx.fillStyle=fill||'#fff';
        ctx.fillRect(0,0,w,h);
        ctx.drawImage(img,0,0,w,h);
        resolve(c.toDataURL('image/png'));
      }catch(e){reject(e)}
    };
    img.onerror=reject;img.src=dataUrl;
  });
}

let preparedOutput=null;

function stripIds(node){
  node.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
}

function prepareOutputClone(){
  const clone=canvas.cloneNode(true);
  stripIds(clone);
  clone.classList.remove('capturing');
  clone.style.transform='none';
  clone.style.width='600px';
  clone.style.boxShadow='none';

  clone.querySelectorAll('.insert-slot,.block-tools,.style-chip').forEach(el=>el.remove());
  clone.querySelectorAll('[contenteditable]').forEach(el=>{
    el.removeAttribute('contenteditable');
    el.setAttribute('aria-readonly','true');
  });
  clone.querySelectorAll('.content-block.selected').forEach(el=>el.classList.remove('selected'));

  // 현재 화면에서 실제 적용 중인 폰트/크기/행간을 출력 복제본에도 확정값으로 심는다.
  const srcEditables=Array.from(canvas.querySelectorAll('.editable'));
  const dstEditables=Array.from(clone.querySelectorAll('.editable'));
  srcEditables.forEach((src,i)=>{
    const dst=dstEditables[i];
    if(!dst)return;
    const cs=getComputedStyle(src);
    dst.style.fontFamily=cs.fontFamily;
    dst.style.fontSize=cs.fontSize;
    dst.style.lineHeight=cs.lineHeight;
    dst.style.letterSpacing=cs.letterSpacing;
    dst.style.fontWeight=cs.fontWeight;
    dst.style.fontStyle=cs.fontStyle;
    dst.style.textAlign=cs.textAlign;
  });

  // 말풍선 본체 크기도 현재 편집 화면과 최대한 동일하게 시작시킨다.
  const srcShells=Array.from(canvas.querySelectorAll('.bubble-shell'));
  const dstShells=Array.from(clone.querySelectorAll('.bubble-shell'));
  srcShells.forEach((src,i)=>{
    const dst=dstShells[i];
    if(!dst)return;
    const cs=getComputedStyle(src);
    dst.style.paddingTop=cs.paddingTop;
    dst.style.paddingRight=cs.paddingRight;
    dst.style.paddingBottom=cs.paddingBottom;
    dst.style.paddingLeft=cs.paddingLeft;
  });

  return clone;
}

function fitOutputPreview(){
  if(!preparedOutput)return;
  const wrap=$('#outputPreviewWrap');
  const stage=$('#outputPreviewStage');
  const avail=Math.max(280,stage.clientWidth-20);
  const s=Math.min(1,avail/600);
  preparedOutput.style.transformOrigin='top left';
  preparedOutput.style.transform=`scale(${s})`;
  wrap.style.width=(600*s)+'px';
  wrap.style.height=(preparedOutput.offsetHeight*s)+'px';
}

async function openOutputPreview(){
  hideSelectionToolbar();closeInspector();closeSidebar();
  const sel=window.getSelection();if(sel)sel.removeAllRanges();
  if(document.activeElement?.blur)document.activeElement.blur();
  $$('.content-block.selected').forEach(b=>b.classList.remove('selected'));

  const overlay=$('#outputPreview'),wrap=$('#outputPreviewWrap'),btn=$('#btnSave'),toast=$('#captureToast');
  btn.disabled=true;toast.textContent='출력 미리보기 준비 중…';toast.classList.add('show');

  try{
    await document.fonts.ready;
    const profileImgs=$$('.profile-frame img[src]');
    await Promise.all(profileImgs.map(img=>img.decode?img.decode().catch(()=>{}):Promise.resolve()));
    profileImgs.forEach(fitProfileImage);
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

    if(preparedOutput)preparedOutput.remove();
    preparedOutput=prepareOutputClone();
    wrap.innerHTML='';
    wrap.appendChild(preparedOutput);

    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden','false');
    document.body.classList.add('output-preview-lock');

    // DOM을 실제 화면에 올린 뒤 브라우저가 최종 줄바꿈/높이를 계산하게 한다.
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

    // 형광펜은 이 최종 레이아웃 좌표에서 다시 만든다.
    preparedOutput._cleanupHighlights=buildCaptureHighlights(preparedOutput);
    preparedOutput._cleanupShadows=buildCaptureBubbleShadows(preparedOutput);

    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    fitOutputPreview();
  }catch(err){
    alert('출력 미리보기 준비 중 문제가 발생했어요.\n'+err);
    closeOutputPreview();
  }finally{
    btn.disabled=false;toast.classList.remove('show');toast.textContent='이미지 저장 중…';
  }
}

function closeOutputPreview(){
  const overlay=$('#outputPreview');
  overlay.classList.remove('show');
  overlay.setAttribute('aria-hidden','true');
  document.body.classList.remove('output-preview-lock');
  if(preparedOutput){
    try{preparedOutput._cleanupHighlights?.()}catch(e){}
    try{preparedOutput._cleanupShadows?.()}catch(e){}
    preparedOutput.remove();
    preparedOutput=null;
  }
  $('#outputPreviewWrap').innerHTML='';
}

async function downloadPreparedOutput(){
  if(!preparedOutput)return;
  const btn=$('#previewDownload'),toast=$('#captureToast');
  btn.disabled=true;toast.textContent='PNG 저장 중…';toast.classList.add('show');

  // 화면에서는 축소되어 있을 수 있으므로 캡처 순간만 600px 원본 스케일로.
  const prevTransform=preparedOutput.style.transform;
  preparedOutput.style.transform='none';
  preparedOutput.classList.add('capturing');

  try{
    await document.fonts.ready;
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

    const w=600,h=Math.ceil(preparedOutput.scrollHeight);
    const maxPixels=20_000_000;
    let ratio=Math.min(3,Math.sqrt(maxPixels/(w*h)));
    ratio=Math.max(1.5,ratio);
    const captureBg=state.bg.mode==='solid'?state.bg.color:'#ffffff';

    let dataUrl;
    try{
      let fontEmbedCSS='';
      try{fontEmbedCSS=await window.htmlToImage.getFontEmbedCSS(preparedOutput)}catch(e){}
      dataUrl=await window.htmlToImage.toPng(preparedOutput,{
        width:w,height:h,pixelRatio:ratio,cacheBust:true,
        backgroundColor:captureBg,skipAutoScale:true,fontEmbedCSS,
        style:{
          transform:'none',margin:'0',width:w+'px',height:h+'px',
          boxShadow:'none',backgroundColor:captureBg
        }
      });
    }catch(err){
      const hc=await window.html2canvas(preparedOutput,{
        scale:Math.min(2.5,ratio),backgroundColor:captureBg,
        useCORS:true,logging:false,width:w,height:h,scrollX:0,scrollY:0
      });
      dataUrl=hc.toDataURL('image/png');
    }

    dataUrl=await normalizeOutputPng(
      dataUrl,
      Math.max(1,Math.round(w*ratio)),
      Math.max(1,Math.round(h*ratio)),
      captureBg
    );

    const a=document.createElement('a');
    a.href=dataUrl;
    a.download='지문_발췌_v2_'+Date.now()+'.png';
    document.body.appendChild(a);a.click();a.remove();
  }catch(err){
    alert('이미지 저장 중 문제가 발생했어요.\n'+err);
  }finally{
    preparedOutput.classList.remove('capturing');
    preparedOutput.style.transform=prevTransform;
    btn.disabled=false;toast.classList.remove('show');toast.textContent='이미지 저장 중…';
    fitOutputPreview();
  }
}

$('#btnSave').addEventListener('click',openOutputPreview);
$('#mobilePreviewBtn').addEventListener('click',openOutputPreview);
$('#previewBack').addEventListener('click',closeOutputPreview);
$('#previewDownload').addEventListener('click',downloadPreparedOutput);
window.addEventListener('resize',()=>{if(preparedOutput)fitOutputPreview();});

function resetCanvasContent(){
  if(!confirm('캔버스의 작성 내용만 모두 지울까요?\n글꼴·글자크기·색상 히스토리·배경·말풍선 기본설정은 유지됩니다.'))return;
  closeInspector();hideSelectionToolbar();bubbleOverrides.clear();activeHtmlId=null;
  $('#sec-html').style.display='none';$('#htmlCodeInput').value='';
  blockList.innerHTML='';blockList.appendChild(createBlock('paragraph'));
  refreshSlots();renderBackground();applyGlobalText();relayout();
}
$('#btnReset').addEventListener('click',resetCanvasContent);
$('#mobileResetBtn').addEventListener('click',resetCanvasContent);

async function init(){
  loadSettings(); const storedFonts=await idbGet('customFonts')||[];installCustomFonts(storedFonts);assets.bgImage=await idbGet('bgImage');assets.leftProfile=await idbGet('leftProfile');assets.rightProfile=await idbGet('rightProfile');
  renderControls();renderBackground();blockList.appendChild(createBlock('paragraph'));refreshSlots();applyGlobalText();relayout();
  try{await document.fonts.ready}catch(e){} relayout();
}
init();
})();
