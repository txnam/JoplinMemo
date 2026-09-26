require('./register');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const Module=require('node:module');
const MarkdownIt=require('markdown-it');
const {parseMemoDocument}=require('../src/memo/parseMemoDocument.ts');
let theme='light',fail=false,calls=[];
const md=new MarkdownIt();
const api={settings:{globalValues:async()=>[theme]},commands:{execute:async(name,language,source,options,renderOptions)=>{
 calls.push({name,language,source,renderOptions});if(fail)throw new Error('renderer unavailable');
 return {html:md.render(source).replace(/src=":\/([^\"]+)"/g,'src="joplin-content://note-viewer/$1.png"'),cssStrings:[],pluginAssets:[]};
}}};
const original=Module._load;Module._load=function(name,...args){return name==='api'?api:original.call(this,name,...args)};
const {renderDocument,clearRenderCache}=require('../src/editor/renderDocument.ts');Module._load=original;
test('host renderer receives list context, reference definitions, and returns image markup',async()=>{
 clearRenderCache();calls=[];const source='7. **Seven**\n   ![photo][ref]\n8. Eight\n   Body\n\n[ref]: :/01234567890123456789012345678901';
 const doc=parseMemoDocument('a','Note',source);const result=await renderDocument(doc,source);
 assert.match(result.rendered[doc.memos[0].id].full,/<ol start="7">/);assert.match(result.rendered[doc.memos[0].id].full,/joplin-content:\/\/note-viewer/);assert.ok(calls.every(c=>c.name==='renderMarkup'&&c.language===1&&c.renderOptions.noteId==='a'));
});
test('render cache keys include theme and can be invalidated for changed resources',async()=>{
 clearRenderCache();calls=[];const doc=parseMemoDocument('a','Note','## One\nBody');await renderDocument(doc,'## One\nBody');const count=calls.length;
 await renderDocument(doc,'## One\nBody');assert.equal(calls.length,count);theme='dark';await renderDocument(doc,'## One\nBody');assert.ok(calls.length>count);
 const darkCount=calls.length;clearRenderCache();await renderDocument(doc,'## One\nBody');assert.ok(calls.length>darkCount);
});
test('render failure keeps escaped original content and error for retry',async()=>{
 clearRenderCache();fail=true;const doc=parseMemoDocument('a','Note','## Title\n<script>unsafe()</script>');const result=await renderDocument(doc,'## Title\n<script>unsafe()</script>');fail=false;
 const render=result.rendered[doc.memos[0].id];assert.match(render.error,/unavailable/);assert.match(render.full,/&lt;script&gt;/);assert.doesNotMatch(render.full,/<script>/);
});
