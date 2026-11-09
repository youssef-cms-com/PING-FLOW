import {createWriteStream,createReadStream} from 'node:fs';
import {mkdir,unlink} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {join} from 'node:path';
import {database,dataDir} from './database';
export function uploadPath(key:string){if(!/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(key))throw Error('Invalid file reference');return join(dataDir(),'uploads',key)}
export const storage={async put(key:string,stream:ReadableStream,options:any){const path=uploadPath(key);await mkdir(join(path,'..'),{recursive:true});try{await pipeline(Readable.fromWeb(stream as any),createWriteStream(path,{flags:'wx'}));const m=options.customMetadata;database().prepare('INSERT INTO uploads VALUES(?,?,?,?,?,?)').run(key,Number(m.buyerId),m.name,m.kind,options.httpMetadata.contentType,0)}catch(e){await unlink(path).catch(()=>{});throw e}},async remove(key:string){await unlink(uploadPath(key)).catch(()=>{});database().prepare('DELETE FROM uploads WHERE key=?').run(key)}};
