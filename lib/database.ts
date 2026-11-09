import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
let instance:DatabaseSync|undefined;
export function dataDir(){if(process.env.RAILWAY_ENVIRONMENT_ID&&!process.env.RAILWAY_VOLUME_MOUNT_PATH)throw Error('Attach a Railway volume at /data before starting ping-flow');return resolve(process.env.DATA_DIR||'data')}
export function database(){
 if(instance)return instance;const dir=dataDir();mkdirSync(dir,{recursive:true});
 const db=new DatabaseSync(resolve(dir,'ping-flow.sqlite'));db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS members(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT,goal INTEGER NOT NULL DEFAULT 3,active INTEGER NOT NULL DEFAULT 1);
 CREATE UNIQUE INDEX IF NOT EXISTS member_email_unique ON members(lower(email)) WHERE email IS NOT NULL;
 CREATE TABLE IF NOT EXISTS launches(id TEXT PRIMARY KEY,buyer_id INTEGER NOT NULL REFERENCES members(id),product_id INTEGER NOT NULL,day TEXT NOT NULL,created TEXT NOT NULL,url TEXT NOT NULL,platform TEXT NOT NULL,notes TEXT,files TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS buyer_product_unique ON launches(buyer_id,product_id);
 CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('leader','buyer')),buyer_id INTEGER UNIQUE REFERENCES members(id),active INTEGER NOT NULL DEFAULT 1,require_change INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS uploads(key TEXT PRIMARY KEY,buyer_id INTEGER NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL,type TEXT NOT NULL,size INTEGER NOT NULL);
 `);instance=db;return db;
}
export function transaction<T>(f:()=>T):T{const db=database();db.exec('BEGIN IMMEDIATE');try{const result=f();db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}
// Small adapter preserves the existing launch APIs while replacing D1 with local SQLite.
class Statement{private values:any[]=[];constructor(private sql:string){}bind(...v:any[]){this.values=v;return this}async first<T=any>():Promise<T|null>{return (database().prepare(this.sql).get(...this.values) as T)||null}async all(){return {results:database().prepare(this.sql).all(...this.values)}}async run(){return database().prepare(this.sql).run(...this.values)}}
export const db={prepare:(sql:string)=>new Statement(sql),batch:async(statements:Statement[])=>{database().exec('BEGIN IMMEDIATE');try{const result=[];for(const s of statements)result.push(await s.run());database().exec('COMMIT');return result}catch(e){database().exec('ROLLBACK');throw e}}};
