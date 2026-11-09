import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes} from 'node:crypto';import {createServer} from 'node:net';
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
const base='http://localhost:'+port,dir=await mkdtemp(join(tmpdir(),'ping-flow-test-')),token=randomBytes(32).toString('hex');let child,logs='';
async function start(){child=spawn(process.execPath,['.next/standalone/server.js'],{env:{...process.env,NODE_ENV:'production',PORT:String(port),HOSTNAME:'0.0.0.0',DATA_DIR:dir,APP_URL:base,SETUP_TOKEN:token},stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);for(let n=0;n<200;n++){try{const r=await fetch(base+'/api/health');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Test server did not start: '+logs)}
async function stop(){if(!child||child.exitCode!==null)return;const c=child;await new Promise(r=>{c.once('exit',r);c.kill('SIGTERM')})}
async function request(path,body,cookie,origin=base){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json',Origin:origin}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {r,data,cookie:r.headers.get('set-cookie')?.split(';')[0]}}
const password='Integration password 123!';
async function login(email,pw=password){return request('/api/auth/login',{email,password:pw})}
try{await start();
 let result=await request('/api/state');assert(result.data.error);assert.equal((await fetch(base+'/dashboard',{redirect:'manual'})).status,307);
 result=await request('/api/auth/setup',{token:'wrong',email:'leader@example.test',name:'Test Leader',password});assert(result.data.error);
 result=await request('/api/auth/setup',{token,email:'leader@example.test',name:'Test Leader',password});assert(result.r.ok,JSON.stringify(result.data));let leader=result.cookie;assert.match(result.r.headers.get('set-cookie'),/HttpOnly/i);assert.match(result.r.headers.get('set-cookie'),/Secure/i);assert.match(result.r.headers.get('set-cookie'),/SameSite=lax/i);
 result=await request('/api/auth/setup',{token,email:'other@example.test',name:'Other Leader',password});assert(result.data.error);
 result=await request('/api/state',undefined,leader);assert(result.data.isLeader);assert.equal(result.data.team.length,11);
 const buyer1={id:1,name:'Marouan Hakiki',email:'buyer1@example.test',goal:3,active:true,password},buyer2={id:2,name:'Anouar Benigmim',email:'buyer2@example.test',goal:3,active:true,password};
 for(const b of [buyer1,buyer2]){result=await request('/api/users',b,leader);assert(result.r.ok,JSON.stringify(result.data))}
 result=await request('/api/users',{...buyer2,email:buyer1.email},leader);assert(result.data.error);
 result=await login(buyer1.email);assert.equal(result.data.next,'/change-password');let first=result.cookie;
 result=await request('/api/state',undefined,first);assert(result.data.error);
 const newPassword='Personal test password 456!';result=await request('/api/auth/password',{current:password,password:newPassword},first);assert(result.r.ok,JSON.stringify(result.data));const one=result.cookie;
 result=await request('/api/state',undefined,first);assert(result.data.error,'old session must be revoked after password change');
 result=await request('/api/state',undefined,one);assert.equal(result.data.team.length,1);assert.equal(result.data.buyerId,1);assert.equal(result.data.isLeader,false);
 result=await request('/api/users',{...buyer2},one);assert.equal(result.r.status,403);
 result=await request('/api/users',{...buyer2},leader,'https://untrusted.example');assert(result.data.error);
 const video=Buffer.from('test-upload-video-bytes');const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1ZsAAAAASUVORK5CYII=','base64');
 function form(both=false,missing=false){const f=new FormData();f.set('buyerId','2');f.set('productId','1');f.set('url','https://example.test/product');f.set('platform',both?'Both':'Meta');f.set('creative',new File([video],'creative.mp4',{type:'video/mp4'}));f.set('meta',new File([png],'meta.png',{type:'image/png'}));if(both&&!missing)f.set('tiktok',new File([png],'tiktok.png',{type:'image/png'}));return f}
 let response=await fetch(base+'/api/launch',{method:'POST',headers:{Cookie:one,Origin:base},body:form(true,true)});assert.equal(response.status,400);
 response=await fetch(base+'/api/launch',{method:'POST',headers:{Cookie:one,Origin:base},body:form(true)});assert(response.ok,await response.text());
 result=await request('/api/state',undefined,one);assert.equal(result.data.launches.length,1);const launch=result.data.launches[0];assert.equal(launch.buyer_id,1,'buyer cannot submit under another profile');assert.equal(launch.platform,'Both');const files=JSON.parse(launch.files);assert.equal(files.length,3);
 response=await fetch(base+'/api/launch',{method:'POST',headers:{Cookie:one,Origin:base},body:form()});assert.equal(response.status,400,'duplicate product must be blocked');
 const url='/api/files/file?key='+encodeURIComponent(files[0].key);response=await fetch(base+url,{headers:{Cookie:one}});assert.deepEqual(Buffer.from(await response.arrayBuffer()),video);
 response=await fetch(base+url,{headers:{Cookie:one,Range:'bytes=0-3'}});assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,4);
 result=await login(buyer2.email);result=await request('/api/auth/password',{current:password,password:newPassword},result.cookie);const two=result.cookie;
 response=await fetch(base+url,{headers:{Cookie:two}});assert.equal(response.status,404,'other buyers must not access private uploads');
 result=await request('/api/state',undefined,two);assert.equal(result.data.launches.length,0);
 await stop();await start();result=await login(buyer1.email,newPassword);assert(result.r.ok);const resumed=result.cookie;result=await request('/api/state',undefined,resumed);assert.equal(result.data.launches.length,1,'launches survive restart');response=await fetch(base+url,{headers:{Cookie:resumed}});assert.deepEqual(Buffer.from(await response.arrayBuffer()),video,'uploads survive restart');

 // Corrections preserve identity/date/count, keep untouched evidence, and enforce ownership.
 const snapshot=x=>JSON.stringify([x.url,x.platform,x.notes||'',x.files]);
 let current=(await request('/api/state',undefined,resumed)).data.launches[0];
 const makeEdit=(record=current)=>{const f=new FormData();f.set('url','https://example.test/corrected');f.set('platform',record.platform);f.set('notes','Corrected link');f.set('version',snapshot(record));f.set('buyerId','2');f.set('productId','2');f.set('day','2099-01-01');return f};
 const patch=async(f,cookie=resumed,origin=base)=>fetch(base+'/api/launch?id='+launch.id,{method:'PATCH',headers:{Cookie:cookie,Origin:origin},body:f});
 response=await patch(makeEdit(),two);assert.equal(response.status,404,'a buyer cannot edit another buyer launch');
 response=await patch(makeEdit(),resumed,'https://untrusted.example');assert.equal(response.status,400);
 const stale=makeEdit();response=await patch(makeEdit());assert(response.ok,await response.text());
 current=(await request('/api/state',undefined,resumed)).data.launches[0];
 assert.equal(current.id,launch.id);assert.equal(current.buyer_id,launch.buyer_id);assert.equal(current.product_id,launch.product_id);assert.equal(current.day,launch.day);assert.equal(current.created,launch.created);assert.equal(current.url,'https://example.test/corrected');assert.equal(current.files,launch.files,'link-only correction keeps all uploaded files');
 assert.equal((await request('/api/state',undefined,resumed)).data.launches.length,1,'editing never counts as another daily launch');
 response=await patch(stale);assert.equal(response.status,409,'stale editor must not overwrite a newer correction');
 let f=makeEdit();f.set('url','javascript:alert(1)');response=await patch(f);assert.equal(response.status,400);
 f=makeEdit();f.append('remove',files[0].key);response=await patch(f);assert.equal(response.status,400,'at least one creative must remain');
 assert.equal((await request('/api/state',undefined,resumed)).data.launches[0].files,current.files,'failed validation leaves evidence intact');
 const replacement=Buffer.from('corrected-video-content');f=makeEdit();f.set('creative',new File([replacement],'corrected.mp4',{type:'video/mp4'}));response=await patch(f);assert(response.ok,await response.text());
 current=(await request('/api/state',undefined,resumed)).data.launches[0];let editedFiles=JSON.parse(current.files);assert.equal(editedFiles.length,3);assert.equal(editedFiles.filter(x=>x.kind==='creative').length,1);assert(editedFiles.some(x=>x.name==='corrected.mp4'));assert(editedFiles.some(x=>x.key===files[1].key),'untouched screenshots are retained');
 response=await fetch(base+url,{headers:{Cookie:resumed}});assert.equal(response.status,404,'replaced video is removed');
 const newVideo=editedFiles.find(x=>x.kind==='creative');response=await fetch(base+'/api/files/file?key='+encodeURIComponent(newVideo.key),{headers:{Cookie:resumed}});assert.deepEqual(Buffer.from(await response.arrayBuffer()),replacement);
 f=makeEdit();f.set('platform','Meta');response=await patch(f);assert(response.ok,await response.text());current=(await request('/api/state',undefined,resumed)).data.launches[0];assert.equal(JSON.parse(current.files).length,2,'deselected-platform proof is removed');
 f=makeEdit();f.set('platform','Both');response=await patch(f);assert.equal(response.status,400,'adding a platform requires its screenshot');
 f=makeEdit();f.set('platform','Both');f.set('tiktok',new File([png],'corrected-tiktok.png',{type:'image/png'}));response=await patch(f);assert(response.ok,await response.text());current=(await request('/api/state',undefined,resumed)).data.launches[0];
 f=makeEdit();f.set('notes','Leader reviewed correction');response=await patch(f,leader);assert(response.ok,await response.text());
 current=(await request('/api/state',undefined,resumed)).data.launches[0];assert.equal(current.notes,'Leader reviewed correction');assert.equal(current.created,launch.created);assert.equal(current.day,launch.day);
 result=await login('leader@example.test');leader=result.cookie;result=await request('/api/users',{...buyer1,password:'Reset test password 789!'},leader);assert(result.r.ok);result=await request('/api/state',undefined,resumed);assert(result.data.error,'password reset revokes sessions');
 result=await login(buyer1.email,'Reset test password 789!');assert.equal(result.data.next,'/change-password');
 result=await request('/api/users',{...buyer2,password:'',active:false},leader);assert(result.r.ok);result=await request('/api/state',undefined,two);assert(result.data.error,'paused buyer is denied');
 result=await request('/api/team',{id:2,email:buyer2.email,goal:3,active:true},leader);assert(result.r.ok);result=await login(buyer2.email,newPassword);assert(result.r.ok,'team page reactivation must restore login');
 result=await request('/api/auth/logout',{},leader);assert(result.r.ok);result=await request('/api/state',undefined,leader);assert(result.data.error);
 console.log('PASS: leader setup; direct login; required password change; buyer creation; duplicate email protection; role isolation; CSRF checks; launch evidence validation; duplicate products; file authorization and ranges; restart persistence; password reset; paused access; logout; launch corrections; unchanged daily counts; evidence replacement; stale-edit protection.');
}catch(e){console.error(logs.slice(-6000));throw e}finally{await stop();await rm(dir,{recursive:true,force:true})}
