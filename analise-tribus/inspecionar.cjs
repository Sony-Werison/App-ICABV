const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const JSZip = require('C:/Users/perei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/jszip');
const root = __dirname;
function pool(b, p) {
  const count=b.readUInt32LE(p+8), flags=b.readUInt32LE(p+16), start=b.readUInt32LE(p+20), hs=b.readUInt16LE(p+2);
  const strings=[];
  for(let i=0;i<count;i++) {
    let q=p+start+b.readUInt32LE(p+hs+i*4);
    if(flags&256) {
      function len(){let n=b[q++]; if(n&128)n=((n&127)<<8)|b[q++];return n;}
      len();let n=len();strings.push(b.subarray(q,q+n).toString('utf8'));
    } else {let n=b.readUInt16LE(q);q+=2;if(n&32768){n=((n&32767)<<16)|b.readUInt16LE(q);q+=2;}strings.push(b.subarray(q,q+n*2).toString('utf16le'));}
  }
  return strings;
}
async function main(){
 const base=await JSZip.loadAsync(fs.readFileSync(path.join(root,'base.apk')));
 const arm=await JSZip.loadAsync(fs.readFileSync(path.join(root,'split_config.arm64_v8a.apk')));
 const manifest=await base.file('AndroidManifest.xml').async('nodebuffer');
 const strings=pool(manifest,8);
 fs.writeFileSync(path.join(root,'manifest-strings.json'),JSON.stringify(strings,null,2));
 const nodes=[];
 for(let p=8;p+8<=manifest.length;){
   const type=manifest.readUInt16LE(p),size=manifest.readUInt32LE(p+4);
   if(size<8||p+size>manifest.length)throw Error('Invalid XML chunk');
   if(type===0x102){const e=p+16,name=strings[manifest.readUInt32LE(e+4)],start=manifest.readUInt16LE(e+8),width=manifest.readUInt16LE(e+10),count=manifest.readUInt16LE(e+12),attrs={};
    for(let i=0;i<count;i++){const a=e+start+i*width,an=strings[manifest.readUInt32LE(a+4)],raw=manifest.readUInt32LE(a+8),dt=manifest[a+15],v=manifest.readUInt32LE(a+16);attrs[an]=raw!==0xffffffff?strings[raw]:dt===3?strings[v]:dt===18?!!v:v;}
    nodes.push({tag:name,attrs});
   } p+=size;
 }
 fs.writeFileSync(path.join(root,'manifest-nodes.json'),JSON.stringify(nodes,null,2));
 const app=await arm.file('lib/arm64-v8a/libapp.so').async('nodebuffer');
 const packages=[...app.toString('latin1').matchAll(/package:[A-Za-z0-9_./-]+\.dart/g)].map(m=>({uri:m[0],offset:m.index}));
 fs.writeFileSync(path.join(root,'dart-packages.json'),JSON.stringify(packages,null,2));
 const featurePackages=packages.filter(p=>/^package:(dashboard|tribus_core)\//.test(p.uri));
 const modules={};
 for(const p of featurePackages){const m=p.uri.match(/\/features\/([^/]+)\//);if(m)(modules[m[1]]??=[]).push(p);}
 fs.writeFileSync(path.join(root,'modulos-dart.json'),JSON.stringify(modules,null,2));
 const ascii=app.toString('latin1').match(/[\x20-\x7e\xa0-\xff]{5,}/g)||[];
 const unique=[...new Set(ascii)];
 fs.writeFileSync(path.join(root,'libapp-strings.txt'),unique.join('\n'));
 const files=Object.keys(base.files).filter(n=>!base.files[n].dir);
 const evidence={sha256:Object.fromEntries(['base.apk','split_config.arm64_v8a.apk','split_config.pt.apk'].map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n))).digest('hex')])),manifest:nodes.filter(n=>['manifest','uses-sdk','uses-permission','application','activity'].includes(n.tag)),assets:files.filter(n=>n.startsWith('assets/flutter_assets/assets/')),stringCount:unique.length};
 fs.writeFileSync(path.join(root,'evidencias.json'),JSON.stringify(evidence,null,2));
 console.log(JSON.stringify({manifest:evidence.manifest,assets:evidence.assets.length,strings:unique.length},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
