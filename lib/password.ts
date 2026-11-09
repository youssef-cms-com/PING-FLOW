import {scrypt as derive,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
const parameters={N:32768,r:8,p:3,maxmem:64*1024*1024};
export function validatePassword(value:unknown):asserts value is string{if(typeof value!=='string'||value.length<12||value.length>128)throw Error('Use a password between 12 and 128 characters')}
function key(password:string,salt:string){return new Promise<Buffer>((resolve,reject)=>derive(password,salt,64,parameters,(error,result)=>error?reject(error):resolve(result)))}
export async function hashPassword(password:string){validatePassword(password);const salt=randomBytes(16).toString('hex');return `scrypt$${salt}$${(await key(password,salt)).toString('hex')}`}
export async function verifyPassword(password:string,encoded:string){const [scheme,salt,hash]=encoded.split('$');if(scheme!=='scrypt'||!salt||!hash)return false;const actual=await key(password,salt);const expected=Buffer.from(hash,'hex');return expected.length===actual.length&&timingSafeEqual(actual,expected)}
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const secret=()=>randomBytes(32).toString('base64url');
