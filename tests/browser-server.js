// Local manual QA host. This simulates the Joplin bridge; it is not an integration test of Joplin.
require('./register');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const MarkdownIt = require('markdown-it');
const { EditorSession } = require('../src/editor/EditorSession.ts');
const { parseSlides } = require('../src/memo/slides.ts');
const md = new MarkdownIt({ html: true });
const port = Number(process.env.MEMO_QA_PORT || 4177);
const origin = `http://127.0.0.1:${port}`;
const notes = {
 photos: {id:'photos',title:'Photos only',markupLanguage:1,body:'![One]('+origin+'/image/1.svg)\n![Two]('+origin+'/image/2.svg)\n![Three]('+origin+'/image/3.svg)\n\n<br>'},
 full: {id:'full',title:'Release reading checklist',markupLanguage:1,body:'7. **Read formatted notes** [[blue]]\n   This is *emphasis*, ~~deleted text~~ and a [link](https://joplinapp.org).\n\n   - Nested item\n   - Second item\n\n8. Image and table [[mint]]\n   ![Landscape]('+origin+'/image/1.svg)\n\n   | Item | Status |\n   | --- | --- |\n   | Markdown | Ready |\n   | Image | Ready |\n\n9. Code sample [[yellow]]\n   ```js\n   const stable = true;\n   ```'},
 compact: {id:'compact',title:'Compact long memos',markupLanguage:1,body:'- **Long memo** '+ 'The complete text remains readable on a small screen. '.repeat(20)+'\n- Short memo [[mint]]\n- Another memo [[yellow]]'},
 album: {id:'album',title:'Image album',markupLanguage:1,body:'# Weekend album\n\n![Mountains]('+origin+'/image/1.svg)\n\n**Morning** in the mountains.\n\n![Sea]('+origin+'/image/2.svg)\n\n*A quiet afternoon*.\n\n![Night]('+origin+'/image/3.svg)'},
};
const sessions = new Map();
async function snapshot(name) {
 if (!sessions.has(name)) {
  sessions.set(name,new EditorSession({read:async()=>({...notes[name]}),save:async(id,body)=>{notes[id].body=body},publish:()=>{},render:async(doc,source)=>{
   const rendered={};
   for(const memo of doc.memos) {
    const raw=memo.original?.whole?memo.body:(memo.original?.prefix||'')+memo.title+(memo.body?'\n'+memo.body.split('\n').map(l=>(memo.original?.bodyIndent||'')+l).join('\n'):'');
    rendered[memo.id]={title:md.render(memo.title),body:md.render(memo.body),full:md.render(raw)};
   }
   return {rendered,slides:parseSlides(source).map(s=>({...s,imageHtml:md.render(s.imageMarkdown),captionHtml:md.render(s.caption)})),resourcePaths:{}};
  }}));
  await sessions.get(name).load(name);
 }
 return sessions.get(name);
}
const server=http.createServer(async(req,res)=>{
 try {
  const url=new URL(req.url,origin);
  if(url.pathname==='/api') {
   const name=url.searchParams.get('note')||'full';if(!notes[name]){res.writeHead(404).end();return}
   let body='';for await(const chunk of req)body+=chunk;const message=JSON.parse(body);const session=await snapshot(name);
   let result=session.current;
   if(['addMemo','editMemo','reorderMemos'].includes(message.type))result=await session.mutate(message);
   else if(['reload','retryRender'].includes(message.type)){await session.load(name);result=session.current}
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
  }
  if(url.pathname.startsWith('/image/')) {
   const number=Number(url.pathname.split('/').pop().split('.')[0]);const colors=['#326b8c','#10a6a0','#3f315f'];
   res.setHeader('Content-Type','image/svg+xml');res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="${colors[number-1]||colors[0]}"/><circle cx="1200" cy="230" r="100" fill="#f8d780"/><path d="M0 950L450 230L900 950L1180 490L1600 950Z" fill="#b7d1d2"/><text x="80" y="140" font-family="sans-serif" font-size="70" fill="white">Image ${number}</text></svg>`);return;
  }
  if(url.pathname==='/app.js'||url.pathname==='/styles.css') {
   const file=url.pathname==='/app.js'?'dist/webview/app.js':'src/webview/styles.css';res.setHeader('Content-Type',url.pathname.endsWith('.js')?'application/javascript':'text/css');res.end(fs.readFileSync(path.resolve(file)));return;
  }
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>JoplinMemo QA</title><link rel="stylesheet" href="/styles.css"></head><body><div id="app"></div><script>var exports={};const note=new URLSearchParams(location.search).get('note')||'full';window.webviewApi={onMessage(fn){window.receive=fn},postMessage(message){return fetch('/api?note='+note,{method:'POST',body:JSON.stringify(message)}).then(r=>r.json())}};</script><script src="/app.js"></script></body></html>`);
 }catch(e){res.writeHead(500).end(String(e));}
});
server.listen(port,'127.0.0.1',()=>console.log(`QA host: ${origin} (notes: full, compact, album)`));
