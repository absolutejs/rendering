const {chromium}=require('playwright');
(async()=>{
const build=await Bun.build({entrypoints:['artifacts/thin-foliage/scene.ts'],target:'browser'});if(!build.success)throw Error(build.logs.join('\n'));
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-rasterization']});
const timer=setTimeout(()=>browser.close(),45000),errors=[];
try{
const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.setContent('<html></html>');await page.addScriptTag({type:'module',content:await build.outputs[0].text()});await page.waitForFunction(()=>globalThis.foliageResult);
const data=await page.evaluate(()=>globalThis.foliageResult);
if(errors.length)throw Error(errors.join('\n'));
const rgb=(mode,lighting)=>data.rows.find(r=>r.mode===mode&&r.lighting===lighting).rgb;
for(const lighting of ['front','back','dark','blocked']){
if(JSON.stringify(rgb('zero',lighting))!==JSON.stringify(rgb('standard',lighting)))throw Error('Zero transmission changed standard shading');
if(JSON.stringify(rgb('clone',lighting))!==JSON.stringify(rgb('leaf',lighting)))throw Error('Clone lost foliage shading');
}
for(const lighting of ['dark','blocked']) if(rgb('leaf',lighting).some(v=>v>1))throw Error('Unlit foliage glows');
if(rgb('leaf','back').reduce((a,b)=>a+b,0)<=rgb('standard','back').reduce((a,b)=>a+b,0))throw Error('Missing backlighting');
await Bun.write('docs/thin-foliage/browser.json',JSON.stringify({...data,errors},null,2));console.log(data);
}finally{clearTimeout(timer);await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
