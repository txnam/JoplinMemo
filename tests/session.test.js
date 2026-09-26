require('./register');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EditorSession } = require('../src/editor/EditorSession.ts');
function deferred() { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b}); return {promise,resolve,reject}; }
function fixture() {
 const notes = { a: { id:'a',title:'A',body:'## One\nBody\n\n## Two\nBody',markupLanguage:1 }, b:{id:'b',title:'B',body:'Other',markupLanguage:1} };
 const saved=[], published=[];
 const port={read:async id=>({...notes[id]}),save:async(id,body)=>{saved.push({id,body});notes[id].body=body},render:async doc=>({rendered:{},slides:[],resourcePaths:{image:'joplin-content://image'}}),publish:m=>published.push(m)};
 const session=new EditorSession(port);
 const edit=(op='one')=>({type:'editMemo',noteId:'a',revision:session.current.revision,operationId:op,memoId:session.current.document.memos[0].id,title:'Updated',body:'New body',color:'#ffffff'});
 return {notes,saved,published,port,session,edit};
}
test('save includes resources, stable IDs, and checks revision',async()=>{
 const f=fixture();await f.session.load('a');const command=f.edit();const id=command.memoId;
 const result=await f.session.mutate(command);assert.equal(result.type,'document');assert.equal(result.document.memos[0].id,id);assert.ok(result.resourcePaths.image);assert.equal(f.saved.length,1);
 const stale=await f.session.mutate({...command,operationId:'stale'});assert.equal(stale.code,'conflict');assert.equal(f.saved.length,1);
});
test('duplicate operation is idempotent',async()=>{const f=fixture();await f.session.load('a');const msg=f.edit();await Promise.all([f.session.mutate(msg),f.session.mutate(msg)]);assert.equal(f.saved.length,1)});
test('concurrent different operations against same revision cannot overwrite each other',async()=>{const f=fixture();await f.session.load('a');const msg=f.edit();const results=await Promise.all([f.session.mutate(msg),f.session.mutate({...msg,operationId:'two',title:'Second'})]);assert.equal(results[1].code,'conflict');assert.equal(f.saved.length,1)});
test('external database change is detected before write',async()=>{const f=fixture();await f.session.load('a');f.notes.a.body='External';const result=await f.session.mutate(f.edit());assert.equal(result.code,'conflict');assert.equal(f.saved.length,0)});
test('same-window unsaved body is preserved while comparing stored baseline',async()=>{const f=fixture();await f.session.load('a','## Unsaved\nLocal draft');const result=await f.session.mutate(f.edit());assert.equal(result.type,'document');assert.equal(f.saved.length,1)});
test('out-of-order loads never publish the old note',async()=>{
 const f=fixture(),wait=deferred();const read=f.port.read;f.port.read=id=>id==='a'?wait.promise:read(id);
 const first=f.session.load('a');await f.session.load('b');wait.resolve(f.notes.a);await first;
 assert.equal(f.session.current.document.noteId,'b');assert.deepEqual(f.published.map(m=>m.document?.noteId),['b']);
});
test('late rendering cannot restore an old note',async()=>{
 const f=fixture(),wait=deferred();f.port.render=async doc=>{if(doc.noteId==='a')await wait.promise;return {rendered:{},slides:[],resourcePaths:{}}};
 const first=f.session.load('a');await new Promise(r=>setImmediate(r));await f.session.load('b');wait.resolve();await first;
 assert.equal(f.session.current.document.noteId,'b');
});
test('note switch during save never writes to new note or installs old state',async()=>{
 const f=fixture();await f.session.load('a');const wait=deferred();const save=f.port.save;f.port.save=async(id,body)=>{await wait.promise;await save(id,body)};
 const saving=f.session.mutate(f.edit());await new Promise(r=>setImmediate(r));await f.session.load('b');wait.resolve();await saving;
 assert.equal(f.saved[0].id,'a');assert.equal(f.session.current.document.noteId,'b');assert.equal(f.notes.b.body,'Other');
});
test('save failure leaves state reusable for retry',async()=>{const f=fixture();await f.session.load('a');const save=f.port.save;f.port.save=async()=>{throw new Error('offline')};const msg=f.edit();assert.equal((await f.session.mutate(msg)).code,'save');f.port.save=save;assert.equal((await f.session.mutate(msg)).type,'document')});
test('reorder validates duplicates, missing/unknown IDs and pinned abstract',async()=>{
 const f=fixture();f.notes.a.body='Intro\n\n## One\nBody\n\n## Two\nBody';await f.session.load('a');const ids=f.session.current.document.memos.map(m=>m.id);
 for(const invalid of [[ids[0],ids[0],ids[2]],ids.slice(1),[ids[0],ids[1],'unknown'],[ids[1],ids[0],ids[2]]]){
  const result=await f.session.mutate({type:'reorderMemos',noteId:'a',revision:f.session.current.revision,operationId:JSON.stringify(invalid),memoIds:invalid});assert.equal(result.code,'invalid');
 }assert.equal(f.saved.length,0);
});
test('add retains selected identity and renumbers ordered list from original start',async()=>{
 const f=fixture();f.notes.a.body='7. Seven\n8. Eight';await f.session.load('a');const previous=f.session.current.document.memos.map(m=>m.id);
 const result=await f.session.mutate({type:'addMemo',noteId:'a',revision:f.session.current.revision,operationId:'add',title:'New',body:'',color:'#facc15'});
 assert.equal(result.type,'document');assert.equal(result.document.memos[0].id,result.selectedMemoId);assert.deepEqual(result.document.memos.slice(1).map(m=>m.id),previous);assert.match(f.saved[0].body,/7\. New.*\n8\. Seven\n9\. Eight/);
});

test('editing old view is rejected while a new note is still loading',async()=>{
 const f=fixture();await f.session.load('a');const msg=f.edit(),wait=deferred();const read=f.port.read;f.port.read=id=>id==='b'?wait.promise:read(id);
 const loading=f.session.load('b');assert.equal((await f.session.mutate(msg)).code,'conflict');assert.equal(f.saved.length,0);wait.resolve(f.notes.b);await loading;
});
test('a newer external update during save is kept even if save rendering finishes later',async()=>{
 const f=fixture();await f.session.load('a');const wait=deferred();let saving=false;f.port.render=async()=>{if(saving){saving=false;await wait.promise}return {rendered:{},slides:[],resourcePaths:{}}};
 saving=true;const task=f.session.mutate(f.edit());await new Promise(r=>setImmediate(r));f.notes.a.body='External revision';await f.session.load('a');wait.resolve();await task;
 assert.equal(f.session.current.document.original.markdown,'External revision');
});
test('HTML and Kanban notes are excluded',async()=>{
 const f=fixture();f.notes.a.markupLanguage=2;await f.session.load('a');assert.equal(f.session.current,null);assert.equal(f.published.at(-1).type,'empty');
 f.notes.a.markupLanguage=1;f.notes.a.body='```kanban\nsettings\n```';await f.session.load('a');assert.equal(f.session.current,null);
});
