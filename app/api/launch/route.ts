import {storage} from '../../../lib/storage';
import {sameOrigin} from '../../../lib/auth';
import {context,day,fail} from '../../../lib/server';
import catalog from '../../../lib/catalog.json';
export async function POST(r:Request){try{sameOrigin(r);const {db,isLeader,buyer}=await context();if(Number(r.headers.get('content-length')||0)>90*1024*1024)throw Error('Maximum 90 MB per launch');const f=await r.formData();const buyerId=isLeader?Number(f.get('buyerId')):buyer.id;const member=await db.prepare('SELECT id FROM members WHERE id=? AND active=1').bind(buyerId).first();if(!member)throw Error('Select an active media buyer');const productId=Number(f.get('productId'));if(!catalog.some(p=>p.id===productId))throw Error('Select a catalogue product');const url=String(f.get('url')||'');const u=new URL(url);if(!['https:','http:'].includes(u.protocol))throw Error('Enter a valid landing page URL');const platform=String(f.get('platform'));if(!['Meta','TikTok','Both'].includes(platform))throw Error('Select a platform');const existing=await db.prepare('SELECT id FROM launches WHERE buyer_id=? AND product_id=?').bind(buyerId,productId).first();if(existing)throw Error('This buyer has already launched this product. Select a new product.');
 const groups=['creative',...(platform==='Meta'?['meta']:platform==='TikTok'?['tiktok']:['meta','tiktok'])];const input: {kind:string,file:File}[]=[];for(const kind of groups){const files=f.getAll(kind).filter(x=>x instanceof File&&x.size>0) as File[];if(!files.length)throw Error(kind==='creative'?'Upload at least one creative video':'Upload the '+kind+' launch screenshot');for(const file of files){if(file.size>50*1024*1024)throw Error('Each file must be 50 MB or smaller');if(!(kind==='creative'?file.type.startsWith('video/'):['image/png','image/jpeg','image/webp'].includes(file.type)))throw Error('Use video files for creatives and PNG, JPG or WebP for screenshots');input.push({kind,file});}}
 if(input.length>12)throw Error('Maximum 12 files per launch');const id=crypto.randomUUID();const files=[];try{for(const {kind,file} of input){const key=id+'/'+crypto.randomUUID();await storage.put(key,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{buyerId:String(buyerId),name:file.name,kind}});files.push({key,name:file.name,kind,type:file.type});}}catch(e){for(const file of files)await storage.remove(file.key);throw e}
 try{await db.prepare('INSERT INTO launches(id,buyer_id,product_id,day,created,url,platform,notes,files) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,buyerId,productId,day(),new Date().toISOString(),url,platform,String(f.get('notes')||'').slice(0,2000),JSON.stringify(files)).run()}catch(e){for(const file of files)await storage.remove(file.key);throw e}return Response.json({ok:true});}catch(e){return fail(e)}}

// Edit the existing record; never insert another launch or change its attribution/date.
export async function PATCH(r:Request){
 const added:{key:string,name:string,kind:string,type:string}[]=[];
 let committed=false;
 try{
  sameOrigin(r);
  const {db,isLeader,buyer}=await context();
  const id=new URL(r.url).searchParams.get('id');
  if(!id)return Response.json({error:'Missing launch reference'},{status:400});
  const original=await db.prepare('SELECT * FROM launches WHERE id=?').bind(id).first<any>();
  if(!original||(!isLeader&&original.buyer_id!==buyer.id))return Response.json({error:'Launch not found'},{status:404});
  if(Number(r.headers.get('content-length')||0)>90*1024*1024)throw Error('Maximum 90 MB per launch');
  const f=await r.formData();
  const version=(l:any)=>JSON.stringify([l.url,l.platform,l.notes||'',l.files]);
  const expected=String(f.get('version')||'');
  if(expected!==version(original))return Response.json({error:'This launch changed since you opened it. Close the editor, refresh, and try again.'},{status:409});
  const url=String(f.get('url')||'').trim();let parsed:URL;
  try{parsed=new URL(url)}catch{throw Error('Enter a valid landing page URL')}
  if(!['http:','https:'].includes(parsed.protocol))throw Error('Enter a valid landing page URL');
  const platform=String(f.get('platform')||'');
  if(!['Meta','TikTok','Both'].includes(platform))throw Error('Select a platform');
  const groups=platform==='Both'?['creative','meta','tiktok']:['creative',platform.toLowerCase()];
  const input:{kind:string,file:File}[]=[];
  for(const kind of groups){for(const file of f.getAll(kind).filter(x=>x instanceof File&&x.size>0) as File[]){
   if(file.size>50*1024*1024)throw Error('Each file must be 50 MB or smaller');
   if(!(kind==='creative'?file.type.startsWith('video/'):['image/png','image/jpeg','image/webp'].includes(file.type)))throw Error('Use video files for creatives and PNG, JPG or WebP for screenshots');
   input.push({kind,file});
  }}
  const old:{key:string,name:string,kind:string,type:string}[]=JSON.parse(original.files);
  const remove=new Set(f.getAll('remove').map(String));
  const replaced=new Set(input.map(x=>x.kind));
  const kept=old.filter(file=>groups.includes(file.kind)&&!remove.has(file.key)&&!replaced.has(file.kind));
  if(kept.length+input.length>12)throw Error('Maximum 12 files per launch');
  for(const kind of groups){if(!kept.some(file=>file.kind===kind)&&!input.some(file=>file.kind===kind))throw Error(kind==='creative'?'Keep or upload at least one creative video':'Keep or upload the '+kind+' launch screenshot')}
  for(const {kind,file} of input){const key=id+'/'+crypto.randomUUID();await storage.put(key,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{buyerId:String(original.buyer_id),name:file.name,kind}});added.push({key,name:file.name,kind,type:file.type})}
  const next=[...kept,...added];
  // Conditional update also protects against another correction during file upload.
  const result=await db.prepare('UPDATE launches SET url=?,platform=?,notes=?,files=? WHERE id=? AND url=? AND platform=? AND notes IS ? AND files=?').bind(url,platform,String(f.get('notes')||'').slice(0,2000),JSON.stringify(next),id,original.url,original.platform,original.notes,original.files).run();
  if(Number(result.changes)!==1)throw Error('This launch changed while saving. Close the editor, refresh, and try again.');
  committed=true;
  for(const file of old.filter(file=>!kept.some(x=>x.key===file.key))){await storage.remove(file.key).catch(()=>{})}
  return Response.json({ok:true});
 }catch(e){if(!committed)for(const file of added)await storage.remove(file.key).catch(()=>{});return fail(e)}
}
