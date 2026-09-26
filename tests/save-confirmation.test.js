require('./register');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {confirmSavedBody}=require('../src/editor/saveConfirmation.ts');
test('host save is not reported successful until persistence catches up',async()=>{
 let reads=0,waits=0;await confirmSavedBody(async()=>++reads<4?'old':'new','new','old',async()=>{waits++});assert.equal(reads,4);assert.equal(waits,3);
});
test('host save timeout preserves failure instead of claiming success',async()=>{
 let reads=0;await assert.rejects(confirmSavedBody(async()=>{reads++;return 'old'},'new','old',async()=>{}),/not confirmed/);assert.equal(reads,21);
});
test('concurrent external content is detected while confirming persistence',async()=>{
 await assert.rejects(confirmSavedBody(async()=>'external','new','old',async()=>{}),/changed while Joplin was saving/);
});
