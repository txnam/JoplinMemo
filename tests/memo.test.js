const assert = require('assert');
const fs = require('fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
	const source = fs.readFileSync(filename, 'utf8');
	const output = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2017,
			esModuleInterop: true,
		},
	}).outputText;
	module._compile(output, filename);
};

const { parseMemoDocument } = require('../src/memo/parseMemoDocument.ts');
const { serializeMemoDocument } = require('../src/memo/serializeMemoDocument.ts');

function parse(markdown) {
	return parseMemoDocument('note-id', 'Note title', markdown);
}

{
	const document = parse('## First [[yellow]]\nBody A\n\n## Second\nBody B');
	assert.strictEqual(document.rule.type, 'heading');
	assert.strictEqual(document.rule.level, 2);
	assert.strictEqual(document.memos.length, 2);
	assert.strictEqual(document.memos[0].color, '#facc15');
	assert.strictEqual(serializeMemoDocument(document), '## First [[#facc15]]\nBody A\n\n## Second\nBody B');
}

{
	const document = parse('Overview line\nMore context\n\n## First\nBody A\n\n## Second\nBody B');
	assert.strictEqual(document.rule.type, 'abstract-heading');
	assert.strictEqual(document.memos.length, 3);
	assert.strictEqual(document.memos[0].source, 'abstract');
	assert.strictEqual(document.memos[0].title, 'Overview line');
	assert.strictEqual(document.memos[1].title, 'First');
	assert.strictEqual(serializeMemoDocument(document), 'Overview line\nMore context\n\n## First\nBody A\n\n## Second\nBody B');
}

{
	const document = parse('Abstract\n\n* * *\n\n## First\nBody A\n\n* * *\n\n## Second\nBody B');
	assert.strictEqual(document.rule.type, 'separator-section');
	assert.strictEqual(document.rule.marker, '* * *');
	assert.strictEqual(document.memos.length, 3);
	assert.strictEqual(document.memos[1].title, 'First');
	assert.strictEqual(serializeMemoDocument(document), 'Abstract\n\n* * *\n\n## First\nBody A\n\n* * *\n\n## Second\nBody B');
}

{
	const document = parse('Intro\n\n---\n\n### Deep section\nBody');
	assert.strictEqual(document.rule.type, 'separator-section');
	assert.strictEqual(document.memos[1].headingLevel, 3);
	assert.strictEqual(serializeMemoDocument(document), 'Intro\n\n---\n\n### Deep section\nBody');
}

{
	const document = parse('- First\n  Body A\n- Second\n  Body B');
	assert.strictEqual(document.rule.type, 'unordered-list');
	assert.strictEqual(document.memos.length, 2);
	assert.strictEqual(serializeMemoDocument(document), '- First\n  Body A\n- Second\n  Body B');
}

{
	const document = parse('2/ First\nBody A\n\n1/ Second\nBody B');
	assert.strictEqual(document.rule.type, 'reverse-number-slash');
	assert.strictEqual(document.memos.length, 2);
	assert.strictEqual(serializeMemoDocument(document), '2/ First\n   Body A\n\n1/ Second\n   Body B');
}

{
	const document = parse('First block\nBody A\n\nSecond block\nBody B');
	assert.strictEqual(document.rule.type, 'block');
	assert.strictEqual(document.memos.length, 2);
	assert.strictEqual(serializeMemoDocument(document), 'First block\nBody A\n\nSecond block\nBody B');
}

console.log('memo tests passed');
