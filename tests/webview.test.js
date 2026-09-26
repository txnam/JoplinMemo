require('./register');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript');
const {JSDOM}=require('jsdom');
const MarkdownIt=require('markdown-it');
const {parseMemoDocument}=require('../src/memo/parseMemoDocument.ts');
const md=new MarkdownIt();
const tick=()=>new Promise(r=>setImmediate(r));
function documentMessage(source='## **One**\nBody\n\n## Two\nBody',revision=1,noteId='a'){
 const document=parseMemoDocument(noteId,'Note',source),rendered={};
 for(const memo of document.memos)rendered[memo.id]={title:md.render(memo.title),body:md.render(memo.body),full:md.render(memo.original.raw)};
 return {type:'document',document,rendered,slides:[],resourcePaths:{},revision};
}
function harness(initial=documentMessage(),post=async()=>({type:'mutationError',code:'save',message:'Save failed',operationId:'x'})){
 const dom=new JSDOM('<!doctype html><div id="app"></div>',{url:'https://plugin.invalid/',runScripts:'outside-only',pretendToBeVisual:true});
 const {window:w}=dom;w.matchMedia=()=>({matches:false});w.HTMLElement.prototype.scrollIntoView=()=>{};
 const context=dom.getInternalVMContext(),cache=new Map(),messages=[];let receive;
 w.webviewApi={onMessage:fn=>{receive=fn},postMessage:async message=>{messages.push(message);return message.type==='ready'?initial:post(message)}};
 function load(filename){filename=path.resolve(filename);if(cache.has(filename))return cache.get(filename).exports;
  const module={exports:{}};cache.set(filename,module);
  const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017,esModuleInterop:true}}).outputText;
  const req=name=>name==='dompurify'?require('dompurify')(w):name.startsWith('.')?load(path.resolve(path.dirname(filename),name+'.ts')):require(name);
  vm.runInContext(`(function(require,module,exports){${source}\n})`,context)(req,module,module.exports);return module.exports;
 }
 load(path.resolve('src/webview/app.ts'));
 const click=selector=>{const e=w.document.querySelector(selector);assert.ok(e,`missing ${selector}`);e.click()};
 const input=(name,value)=>{const e=w.document.querySelector(`[name="${name}"]`);assert.ok(e);e.value=value;e.dispatchEvent(new w.Event('input',{bubbles:true}))};
 return {w,dom,load,messages,click,input,receive:m=>receive(m),close:()=>w.close()};
}
test('draft survives colour changes, card selection, and failed saves',async()=>{
 const h=harness();await tick();h.click('[data-action="add"]');h.input('title','Typed title');h.input('body','Typed body');h.click('[data-action="color"]');
 assert.equal(h.w.document.querySelector('[name="title"]').value,'Typed title');assert.equal(h.w.document.querySelector('[name="body"]').value,'Typed body');
 h.click('.memo-select');assert.equal(h.w.document.querySelector('[name="body"]').value,'Typed body');
 h.w.document.querySelector('form').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(h.w.document.querySelector('[name="body"]').value,'Typed body');assert.match(h.w.document.querySelector('.status').textContent,/Save failed/);h.close();
});
test('compact opens complete formatted content with Edit beside Close and restores focus',async()=>{
 const title='**Long memo** '+ 'Long content '.repeat(60);const h=harness(documentMessage(title));await tick();h.click('.memo-select');
 const reader=h.w.document.querySelector('.reader');assert.ok(reader);assert.match(reader.textContent,/Long content/);assert.ok(reader.querySelector('strong'));assert.equal(reader.querySelector('[data-action="close-reader"]').nextElementSibling.dataset.action,'edit');
 h.click('[data-action="close-reader"]');assert.equal(h.w.document.activeElement.className,'memo-select');h.close();
});
test('title, detail and reader preserve Markdown formatting and numbered start',async()=>{
 const h=harness(documentMessage('7. **Seven**\n   Body\n8. Eight\n   Body'));await tick();assert.ok(h.w.document.querySelector('.memo-title strong'));assert.equal(h.w.document.querySelector('.memo-detail ol').start,7);
 assert.equal(h.w.document.querySelector('.detail-toolbar'),null);h.w.document.querySelector('.memo-detail').dispatchEvent(new h.w.MouseEvent('dblclick',{bubbles:true}));assert.ok(h.w.document.querySelector('form'));h.close();
});
test('external update marks draft conflicted, explicit reload keeps it',async()=>{
 const initial=documentMessage();let latest={...initial,revision:3};const h=harness(initial,async()=>latest);await tick();h.w.document.querySelector('.memo-select').dispatchEvent(new h.w.MouseEvent('dblclick',{bubbles:true}));h.input('body','Unsaved draft');
 h.receive({...initial,revision:2});assert.ok(h.w.document.querySelector('.conflict'));assert.equal(h.w.document.querySelector('[name="body"]').value,'Unsaved draft');
 h.click('[data-action="reload"]');await tick();assert.equal(h.w.document.querySelector('[name="body"]').value,'Unsaved draft');assert.equal(h.w.document.querySelector('button[type="submit"]').disabled,false);h.close();
});
test('late save response cannot replace the newly selected note',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);const first=documentMessage();const h=harness(first,()=>pending);await tick();h.w.document.querySelector('.memo-select').dispatchEvent(new h.w.MouseEvent('dblclick',{bubbles:true}));h.input('body','Saved');h.w.document.querySelector('form').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));
 h.receive(documentMessage('Other note',2,'b'));resolve({...first,revision:3,operationId:'late'});await tick();assert.match(h.w.document.querySelector('.memo-title').textContent,/Other note/);h.close();
});
test('reorder failure leaves confirmed order and number of memos unchanged',async()=>{
 const h=harness();await tick();const before=Array.from(h.w.document.querySelectorAll('.memo-title'),n=>n.textContent);const cards=h.w.document.querySelectorAll('.memo-card');cards[0].dispatchEvent(new h.w.Event('dragstart',{bubbles:true}));cards[1].dispatchEvent(new h.w.MouseEvent('drop',{bubbles:true,clientY:1}));await tick();assert.deepEqual(Array.from(h.w.document.querySelectorAll('.memo-title'),n=>n.textContent),before);h.close();
});
test('sanitizer removes executable HTML while preserving tables, list numbers, checkboxes and resource URLs',async()=>{
 const h=harness();await tick();const {safeHtml}=h.load(path.resolve('src/webview/sanitize.ts'));
 const clean=safeHtml('<script>alert(1)</script><img src="joplin-content://note-viewer/a.png" onerror="bad()"><a href="javascript:bad()">bad</a><ol start="7"><li value="9">x</li></ol><input type="checkbox" checked><input type="text"><table><tr><td colspan="2">x</td></tr></table>');
 assert.doesNotMatch(clean,/onerror|javascript:|<script|type="text"/);assert.match(clean,/joplin-content:/);assert.match(clean,/start="7"/);assert.match(clean,/disabled/);assert.match(clean,/colspan="2"/);h.close();
});
test('image viewer zoom, swipe, slideshow timer, pause on visibility and error',async()=>{
 const h=harness();await tick();const {ImageViewer}=h.load(path.resolve('src/webview/ImageViewer.ts'));
 const timers=new Map();let id=0;h.w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id};h.w.clearTimeout=id=>timers.delete(id);
 const images=[1,2,3].map(i=>({src:`https://example.com/${i}.png`,alt:`${i}`,caption:`<strong>Caption ${i}</strong>`}));
 const viewer=new ImageViewer(images,true,()=>{},async()=>images);viewer.open();
 function loaded(){const stage=h.w.document.querySelector('.image-stage'),img=h.w.document.querySelector('.viewer-image');Object.defineProperties(stage,{clientWidth:{value:400,configurable:true},clientHeight:{value:300,configurable:true}});Object.defineProperties(img,{naturalWidth:{value:800},naturalHeight:{value:600}});img.dispatchEvent(new h.w.Event('load'));return img;}
 let img=loaded();h.click('[data-viewer="play"]');assert.equal(Array.from(timers.values())[0].ms,5000);const timer=Array.from(timers.values())[0];timers.clear();timer.fn();assert.equal(h.w.document.querySelector('.slide-count').textContent,'2 / 3');
 img=loaded();h.click('[data-viewer="in"]');assert.match(img.style.transform,/scale\(1.5\)/);assert.equal(h.w.document.querySelector('[data-viewer="play"]').textContent,'Play');assert.equal(timers.size,0);
 h.click('[data-viewer="play"]');Object.defineProperty(h.w.document,'hidden',{value:true,configurable:true});h.w.document.dispatchEvent(new h.w.Event('visibilitychange'));assert.equal(timers.size,0);
 img.dispatchEvent(new h.w.Event('error'));assert.ok(h.w.document.querySelector('[data-viewer="retry"]'));assert.equal(h.w.document.querySelector('[data-viewer="play"]').disabled,true);
 viewer.close();assert.equal(h.w.document.querySelector('.image-viewer'),null);h.close();
});
test('slideshow eligibility controls Slide button, and opening does not autoplay',async()=>{
 const initial=documentMessage('![x](https://example.com/a.png)');initial.slides=[{id:'s1',imageHtml:'<img src="https://example.com/a.png">',captionHtml:'<em>caption</em>',alt:'x'}];
 const h=harness(initial);await tick();h.click('[data-action="slides"]');assert.ok(h.w.document.querySelector('.image-viewer'));assert.equal(h.w.document.querySelector('[data-viewer="play"]').textContent,'Play');h.close();
});

test('swipe changes slides only at fit; pinch clamps zoom and stops playback',async()=>{
 const h=harness();await tick();const {ImageViewer}=h.load(path.resolve('src/webview/ImageViewer.ts'));const viewer=new ImageViewer([1,2].map(i=>({src:`https://example.com/${i}.png`,alt:String(i),caption:''})),true,()=>{},async()=>[]);viewer.open();
 const load=()=>{const stage=h.w.document.querySelector('.image-stage'),img=h.w.document.querySelector('.viewer-image');Object.defineProperties(stage,{clientWidth:{value:400},clientHeight:{value:300}});Object.defineProperties(img,{naturalWidth:{value:800},naturalHeight:{value:600}});img.dispatchEvent(new h.w.Event('load'));return {stage,img}};
 let {stage,img}=load();
 function pointer(kind,id,x,y){const event=new h.w.MouseEvent(kind,{bubbles:true,clientX:x,clientY:y,cancelable:true});Object.defineProperty(event,'pointerId',{value:id});stage.dispatchEvent(event)}
 pointer('pointerdown',1,300,100);pointer('pointerup',1,150,100);assert.equal(h.w.document.querySelector('.slide-count').textContent,'2 / 2');
 ({stage,img}=load());pointer('pointerdown',1,100,100);pointer('pointerdown',2,110,100);pointer('pointermove',2,400,100);assert.match(img.style.transform,/scale\(8\)/);
 pointer('pointerup',2,400,100);pointer('pointerup',1,100,100);pointer('pointerdown',1,100,100);pointer('pointerup',1,300,100);assert.equal(h.w.document.querySelector('.slide-count').textContent,'2 / 2');viewer.close();h.close();
});
test('slideshow stops at last image by default, loops only when enabled, preloads one image',async()=>{
 const h=harness();await tick();const {ImageViewer}=h.load(path.resolve('src/webview/ImageViewer.ts'));const timers=new Map();let id=0;h.w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id};h.w.clearTimeout=id=>timers.delete(id);
 const viewer=new ImageViewer([1,2].map(i=>({src:`https://example.com/${i}.png`,alt:String(i),caption:''})),true,()=>{},async()=>[]);viewer.open();
 const load=()=>{const img=h.w.document.querySelector('.viewer-image');Object.defineProperties(img,{naturalWidth:{value:800},naturalHeight:{value:600}});img.dispatchEvent(new h.w.Event('load'))};
 const fire=()=>{const [key,timer]=timers.entries().next().value;timers.delete(key);timer.fn()};
 load();h.click('[data-viewer="play"]');fire();load();fire();assert.equal(h.w.document.querySelector('[data-viewer="play"]').textContent,'Play');assert.equal(timers.size,0);
 h.click('[data-viewer="loop"]');h.click('[data-viewer="play"]');fire();assert.equal(h.w.document.querySelector('.slide-count').textContent,'1 / 2');assert.equal(h.w.document.querySelectorAll('.viewer-image').length,1);viewer.close();h.close();
});
test('saving keeps image display data and selected identity',async()=>{
 const initial=documentMessage('## Photo\n![alt](https://example.com/image.png)');let reply;const h=harness(initial,async m=>({...initial,revision:2,operationId:m.operationId,selectedMemoId:m.memoId}));await tick();
 h.w.document.querySelector('.memo-select').dispatchEvent(new h.w.MouseEvent('dblclick',{bubbles:true}));h.input('body','![alt](https://example.com/image.png)');h.w.document.querySelector('form').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.ok(h.w.document.querySelector('.memo-thumbnail'));assert.ok(h.w.document.querySelector('.memo-detail img'));assert.equal(h.w.document.querySelector('form'),null);h.close();
});

test('image refresh cannot silently advance an edited draft over external content changes',async()=>{
 const initial=documentMessage();const updated=documentMessage('## Externally changed\nNew content',2);const h=harness(initial,async()=>updated);await tick();h.w.document.querySelector('.memo-select').dispatchEvent(new h.w.MouseEvent('dblclick',{bubbles:true}));h.input('body','Unsaved work');
 h.click('[data-action="retry-render"]');await tick();assert.ok(h.w.document.querySelector('.conflict'));assert.equal(h.w.document.querySelector('[name="body"]').value,'Unsaved work');assert.equal(h.w.document.querySelector('button[type="submit"]').disabled,true);h.close();
});

test('memo and detail toolbars are absent; double-click on detail edits selected memo',async()=>{
 const h=harness();await tick();assert.equal(h.w.document.querySelector('.card-actions,.detail-toolbar,[data-action="up"],[data-action="down"],[data-action="edit"],[data-action="read"]'),null);
 const cards=h.w.document.querySelectorAll('.memo-select');cards[1].click();h.w.document.querySelector('.memo-detail').dispatchEvent(new h.w.MouseEvent('dblclick',{bubbles:true}));assert.equal(h.w.document.querySelector('[name="title"]').value,'Two');h.close();
});
test('double-clicking a compact memo opens edit without the single-click reader stealing the gesture',async()=>{
 const h=harness(documentMessage('Compact memo'));await tick();const card=h.w.document.querySelector('.memo-select');
 card.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true,detail:1}));card.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true,detail:2}));card.dispatchEvent(new h.w.MouseEvent('dblclick',{bubbles:true,detail:2}));
 assert.ok(h.w.document.querySelector('form'));assert.equal(h.w.document.querySelector('.reader'),null);await new Promise(r=>setTimeout(r,280));assert.equal(h.w.document.querySelector('.reader'),null);h.close();
});
test('each photo has its own draggable card and double-click edits its Markdown',async()=>{
 const h=harness(documentMessage('![One](https://example.com/one.png)\n![Two](https://example.com/two.png)\n\n<br>'));await tick();assert.equal(h.w.document.querySelectorAll('.memo-card').length,2);
 assert.ok(Array.from(h.w.document.querySelectorAll('.memo-card')).every(card=>card.draggable));
 assert.equal(h.w.document.querySelector('.memo-card .memo-title'),null);assert.equal(h.w.document.querySelector('.memo-thumbnail').alt,'One');
 const img=h.w.document.querySelector('.memo-thumbnail');img.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true,detail:1}));img.dispatchEvent(new h.w.MouseEvent('dblclick',{bubbles:true,detail:2}));assert.ok(h.w.document.querySelector('textarea').value.includes('one.png'));h.close();
});

test('compact toolbar edits the keyboard-focused memo and reader Edit edits the opened memo',async()=>{
 const h=harness(documentMessage('- First\n- **Second**'));await tick();
 assert.equal(h.w.document.querySelector('[data-action="add"]').nextElementSibling.dataset.action,'edit-selected');
 h.w.document.querySelectorAll('.memo-select')[1].focus();h.click('[data-action="edit-selected"]');
 assert.equal(h.w.document.querySelector('[name="title"]').value,'**Second**');assert.equal(h.w.document.querySelector('[data-action="edit-selected"]').disabled,true);
 h.click('[data-action="cancel"]');h.click('.memo-select');h.click('.reader [data-action="edit"]');
 assert.equal(h.w.document.querySelector('.reader'),null);assert.equal(h.w.document.querySelector('[name="title"]').value,'First');h.close();
});

test('selected compact memo has a formatted tooltip while selected full memo uses detail',async()=>{
 for(const [source,hasTip] of [['- **Long compact memo**',true],['## Selected\nBody',false]]){
  const h=harness(documentMessage(source));await tick();const card=h.w.document.querySelector('.memo-card.is-selected');
  card.dispatchEvent(new h.w.MouseEvent('mouseover',{bubbles:true}));await new Promise(r=>setTimeout(r,210));
  assert.equal(!!h.w.document.querySelector('.memo-tip'),hasTip);if(hasTip)assert.ok(h.w.document.querySelector('.memo-tip strong'));h.close();
 }
});

test('image stage click closes but zoom controls, pan, pinch and swipe do not',async()=>{
 const h=harness();await tick();const {ImageViewer}=h.load(path.resolve('src/webview/ImageViewer.ts'));let closed=0;
 const images=[1,2].map(i=>({src:`https://example.com/${i}.png`,alt:String(i),caption:''}));
 const viewer=new ImageViewer(images,true,()=>closed++,async()=>images);viewer.open();
 function load(){const stage=h.w.document.querySelector('.image-stage'),img=stage.querySelector('img');Object.defineProperties(stage,{clientWidth:{value:400},clientHeight:{value:300}});Object.defineProperties(img,{naturalWidth:{value:800},naturalHeight:{value:600}});img.dispatchEvent(new h.w.Event('load'));}
 function pointer(kind,id,x,y){const event=new h.w.MouseEvent(kind,{bubbles:true,clientX:x,clientY:y,cancelable:true});Object.defineProperty(event,'pointerId',{value:id});h.w.document.querySelector('.image-stage').dispatchEvent(event);}
 load();pointer('pointerdown',1,300,100);pointer('pointerup',1,100,100);h.click('.image-stage');assert.equal(closed,0);assert.equal(h.w.document.querySelector('.slide-count').textContent,'2 / 2');
 load();h.click('[data-viewer="in"]');assert.equal(closed,0);
 pointer('pointerdown',1,100,100);pointer('pointermove',1,140,100);pointer('pointerup',1,140,100);h.click('.image-stage');assert.equal(closed,0);
 pointer('pointerdown',1,100,100);pointer('pointerdown',2,120,100);pointer('pointermove',2,200,100);pointer('pointerup',2,200,100);pointer('pointerup',1,100,100);h.click('.image-stage');assert.equal(closed,0);
 pointer('pointerdown',1,100,100);pointer('pointerup',1,100,100);h.click('.viewer-image');assert.equal(closed,1);assert.equal(h.w.document.querySelector('.image-viewer'),null);assert.equal(h.w.document.querySelector('#app').hasAttribute('inert'),false);h.close();
});
