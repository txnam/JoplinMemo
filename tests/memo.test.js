require('./register');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseMemoDocument: parse, reconcileMemoIds } = require('../src/memo/parseMemoDocument.ts');
const { serializeMemoDocument: serialize } = require('../src/memo/serializeMemoDocument.ts');
const { parseSlides } = require('../src/memo/slides.ts');
const p = text => parse('note', 'Note title', text);
const fixtures = [
 '', '  \r\n\t', '## Single\nBody', '- Single\n  Body', '> Quote\n> More', 'Title [[project]]\nBody',
 '```js\nconst x = 1;\n```\n\n## A\nBody\n\n## B\nBody',
 '````md\n```\n## Not a heading\n```\n````\n\nTail',
 '## First [[yellow]]\nBody A\n\n## Second\nBody B',
 'Overview\nMore context\n\n## First\nBody A\n\n## Second\nBody B',
 'Abstract\n\n* * *\n\n## First\nBody A\n\n---\n\n### Second\nBody B\n',
 '\r\n## A  \r\nBody A  \r\n\r\n## B\r\nBody B\r\n',
 '* First\n  Body A\n* Second\n  Body B',
 '- First\n  Intro\n  * * *\n  Detail\n- Second\n  Body B',
 '2/ First\nBody A\n\n1/ Second\nBody B',
 '7) Seven\n   Body\n\n8) Eight\n   - nested\n     content',
 '9. Nine\n   Body\n10. Ten\n    Body',
 'Title\n===\n\nParagraph',
 '| a | b |\n|---|---|\n| c | d |',
 '![a][ref]\n\nCaption\n\n[ref]: :/01234567890123456789012345678901',
 'First block\nBody A\n\nSecond block\nBody B',
];
for (const [i, input] of fixtures.entries()) test(`round-trip preserves source ${i}`, () => assert.equal(serialize(p(input)), input));

test('recognises a single heading and single list item', () => {
 assert.equal(p('## Only\nBody').rule.type, 'heading');
 assert.equal(p('- Only\n  Body').rule.type, 'unordered-list');
});
test('unknown colour-like text is content; known colour stays in its original spelling', () => {
 assert.equal(p('Title [[project]]').memos[0].title, 'Title [[project]]');
 assert.equal(p('Title [[constructor]]').memos[0].title, 'Title [[constructor]]');
 const doc = p('Title [[yellow]]\nBody'); assert.equal(doc.memos[0].color, '#facc15');
 doc.memos[0].body = 'Changed'; assert.equal(serialize(doc), 'Title [[yellow]]\nChanged');
});
test('editing another memo leaves raw code, gaps and source untouched', () => {
 const text = '## A\r\n````md\r\n```\r\n## fake\r\n````\r\n\r\n## B\r\nOriginal\r\n';
 const doc = p(text); assert.equal(doc.memos.length, 2);
 doc.memos[1].body = 'Updated'; assert.equal(serialize(doc), text.replace('Original', 'Updated'));
});
test('colour-only edit preserves indentation, trailing spaces and body', () => {
 const input = '* First\n  Code  \n\n* Second\n  Body\n'; const doc = p(input);
 doc.memos[0].color = '#facc15'; assert.equal(serialize(doc), input.replace('* First', '* First [[#facc15]]'));
});
test('whole-note fallback edits raw Markdown, never loses leading fenced code', () => {
 const doc = p('```js\nfoo()\n```\n\n## A\n\n## B');
 assert.equal(doc.memos.length, 1); assert.equal(doc.memos[0].original.whole, true);
 doc.memos[0].body += '\nExtra'; assert.ok(serialize(doc).startsWith('```js\nfoo()'));
});
test('abstract remains abstract when order is malformed', () => {
 const doc = p('Intro\n\n## A\nBody A\n\n## B\nBody B');
 doc.memos = [doc.memos[1], doc.memos[0], doc.memos[2]];
 assert.equal(serialize(doc), 'Intro\n\n## A\nBody A\n\n## B\nBody B');
});
test('numbered list keeps numbers on edit and renumbers from initial number on reorder', () => {
 const doc = p('7) Seven\n   Body\n\n9) Nine\n   Body');
 assert.equal(doc.rule.start, 7); doc.memos[1].body = 'Changed';
 assert.equal(serialize(doc), '7) Seven\n   Body\n\n9) Nine\n   Changed');
 doc.memos.reverse(); assert.equal(serialize(doc), '7) Nine\n   Changed\n\n8) Seven\n   Body');
});
test('number width transitions preserve body nesting', () => {
 const doc = p('9. Nine\n   - child\n10. Ten\n    - child'); doc.memos.reverse();
 assert.equal(serialize(doc), '9. Ten\n   - child\n10. Nine\n    - child');
});
test('reverse slash reorder is descending', () => {
 const doc = p('2/ A\n   Detail\n\n1/ B\n   Detail'); doc.memos.reverse();
 assert.equal(serialize(doc), '2/ B\n   Detail\n\n1/ A\n   Detail');
});
test('mixed separators remain in their boundary slots', () => {
 const doc = p('A\n\n* * *\n\nB\n\n---\n\nC\n'); doc.memos.reverse();
 assert.equal(serialize(doc), 'C\n\n* * *\n\nB\n\n---\n\nA\n');
});
test('stable identity across unchanged external refresh and reorder', () => {
 const old = p('## A\nBody\n\n## B\nBody'); const newer = p('## B\nBody\n\n## A\nBody');
 reconcileMemoIds(newer, old); assert.equal(newer.memos[1].id, old.memos[0].id);
});
test('album captions follow images, heading optional, alt fallback, references resolved', () => {
 const slides = parseSlides('# Album\n\n![one](https://example.com/1.png)\n\n**Caption**\n\n---\n\n![two][ref]\n\n[ref]: https://example.com/2.png');
 assert.equal(slides.length, 2); assert.equal(slides[0].caption, '**Caption**'); assert.equal(slides[1].caption, 'two'); assert.match(slides[1].imageMarkdown, /2\.png/);
});
test('consecutive images each get a slide and caption attaches only to last', () => {
 const slides = parseSlides('![a](https://a)\n![b](https://b)\n\nLast caption');
 assert.equal(slides.length, 2); assert.equal(slides[0].caption, 'a'); assert.equal(slides[1].caption, 'Last caption');
});
for (const text of ['Intro\n\n![a](https://a)', 'Text ![a](https://a) inline', '```\n![a](https://a)\n```', '# Heading\n\nProse\n\n![a](https://a)']) test(`mixed note is not an album: ${text.slice(0,20)}`, () => assert.equal(parseSlides(text).length, 0));

test('adding to a one-block note with a trailing newline creates a real block boundary', () => {
 const doc = p('Existing\n');
 doc.memos.unshift({id:'new',title:'New',body:'',color:'#ffffff',source:'block'});
 assert.equal(serialize(doc), 'New\n\nExisting\n');
 assert.equal(p(serialize(doc)).memos.length, 2);
});
test('adding a section never reuses a trailing separator as an interior boundary', () => {
 const doc = p('A\n\n---\n\nB\n');
 doc.memos.unshift({id:'new',title:'New',body:'',color:'#ffffff',source:'separator-section'});
 assert.equal(p(serialize(doc)).memos.length,3);
});
test('large notes preserve every block through parse and reorder', () => {
 const input=Array.from({length:1000},(_,i)=>`## Item ${i}\nBody ${i}`).join('\n\n');const doc=p(input);
 assert.equal(doc.memos.length,1000);assert.equal(serialize(doc),input);
 doc.memos.reverse();const again=p(serialize(doc));assert.equal(again.memos.length,1000);assert.equal(again.memos[0].title,'Item 999');assert.equal(again.memos[999].body,'Body 0');
});

test('an image on its own line may have a caption immediately below, without a blank line', () => {
 const slides=parseSlides('![one](https://example.com/one.png)\nFirst **caption**\n![two](https://example.com/two.png)\nSecond caption');
 assert.equal(slides.length,2);assert.equal(slides[0].caption,'First **caption**');assert.equal(slides[1].caption,'Second caption');
});

for (const ending of ['\n','\n\n','\r\n\r\n','\n\n<br>','\n\n<p><br></p>','\n\n&nbsp;']) test(`image-only notes split per image and ignore empty tail ${JSON.stringify(ending)}`, () => {
 const source='![One](https://example.com/one.png)\n![Two](https://example.com/two.png)'+ending;
 const doc=p(source);assert.equal(doc.memos.length,2);assert.ok(doc.memos.every(m=>m.source==='image' && m.body.trim()));assert.equal(serialize(doc),source);
 doc.memos.reverse();const saved=serialize(doc);assert.ok(saved.indexOf('two.png')<saved.indexOf('one.png'));assert.equal(p(saved).memos.length,2);
});
test('same-line images, nested URL parentheses and reference images retain exact raw source',()=>{
 const source='  ![One](https://example.com/a(b).png)  ![Two][ref]\r\n\r\n[ref]: https://example.com/two.png\r\n';const doc=p(source);
 assert.equal(doc.memos.length,2);assert.equal(serialize(doc),source);doc.memos.reverse();const saved=serialize(doc);assert.ok(saved.includes('[ref]: https://example.com/two.png'));assert.equal(p(saved).memos.length,2);
});
test('HTML images and empty paragraphs produce only image memos and slides',()=>{
 const source='<p><img src=":/a" width="300" /></p>\n<p><img src=":/b" /></p>\n<p><br></p>\n';const doc=p(source);
 assert.equal(doc.memos.length,2);assert.equal(serialize(doc),source);assert.equal(parseSlides(source).length,2);doc.memos.reverse();assert.equal(p(serialize(doc)).memos.length,2);
});
test('photo edit preserves other photos and blank source tail',()=>{
 const source='![](https://example.com/a)\n![](https://example.com/b)\n\n';const doc=p(source);doc.memos[0].body='![](https://example.com/new)';assert.equal(serialize(doc),source.replace('/a)','/new)'));
});
test('image-like text in a code fence is never split into photo memos',()=>{
 const doc=p('```md\n![](https://a)\n![](https://b)\n```\n');assert.equal(doc.memos.length,1);assert.notEqual(doc.memos[0].source,'image');
});
