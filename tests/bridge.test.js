require('./register');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const Module=require('node:module');
const MarkdownIt=require('markdown-it');
const md=new MarkdownIt();
let notes,selected,onUpdate,onMessage,published,readCount;
const api={
 data:{get:async route=>{readCount++;return {...notes[route[1]]}}},
 settings:{globalValues:async()=>['light']},
 commands:{register:async()=>{},execute:async(name,_language,source)=>name==='renderMarkup'?{html:md.render(source)}:undefined},
 workspace:{selectedNote:async()=>({...notes[selected]}),onSyncComplete:async()=>{},onResourceChange:async()=>{}},
 views:{editors:{register:async(_id,callbacks)=>callbacks.onSetup('view'),setHtml:async()=>{},addScript:async()=>{},onUpdate:async(_h,cb)=>{onUpdate=cb},onMessage:async(_h,cb)=>{onMessage=cb},postMessage:(_h,m)=>published.push(m),saveNote:async(_h,{noteId,body})=>{notes[noteId].body=body},isVisible:async()=>true}},
};
const original=Module._load;Module._load=function(name,...args){return name==='api'?api:original.call(this,name,...args)};
const {registerMemoEditor}=require('../src/editor/registerMemoEditor.ts');Module._load=original;
async function setup(){notes={a:{id:'a',title:'A',body:'## One\nBody',markup_language:1},b:{id:'b',title:'B',body:'Other note',markup_language:1}};selected='a';published=[];readCount=0;await registerMemoEditor();return onMessage({type:'ready'})}
test('ready refreshes selected note even when host omitted updates while editor was hidden',async()=>{
 await setup();selected='b';const message=await onMessage({type:'ready'});assert.equal(message.document.noteId,'b');assert.equal(message.document.original.markdown,'Other note');
});
test('reload updates bridge source so a later resource retry cannot restore stale text',async()=>{
 await setup();notes.a.body='Latest external body';await onMessage({type:'reload'});const result=await onMessage({type:'retryRender'});assert.equal(result.document.original.markdown,'Latest external body');
});
test('save responses have complete rendering and confirmation reads persisted note',async()=>{
 const ready=await setup(),count=readCount;const result=await onMessage({type:'editMemo',noteId:'a',revision:ready.revision,operationId:'save',memoId:ready.document.memos[0].id,title:'Changed',body:'Body',color:'#ffffff'});
 assert.equal(result.type,'document');assert.ok(result.rendered[result.document.memos[0].id]);assert.ok(readCount>=count+2);assert.equal(notes.a.body,'## Changed\nBody');
});
test('onUpdate uses event body, including local unsaved changes',async()=>{
 await setup();await onUpdate({noteId:'a',newBody:'Unsaved body from editor'});assert.equal(published.at(-1).document.original.markdown,'Unsaved body from editor');
});
