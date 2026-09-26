const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
 const source = fs.readFileSync(filename, 'utf8');
 const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText;
 module._compile(output, filename);
};
