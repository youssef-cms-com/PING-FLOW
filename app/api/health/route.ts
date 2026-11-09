import {database,dataDir} from '../../../lib/database';import {access,constants} from 'node:fs/promises';
export async function GET(){try{database().prepare('SELECT 1').get();await access(dataDir(),constants.W_OK);return Response.json({status:'ok',app:'ping-flow'})}catch{return Response.json({status:'unavailable'},{status:503})}}
