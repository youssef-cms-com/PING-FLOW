export function normalizeUser(body:unknown){
 if(!body||typeof body!=='object')throw Error('Invalid user details');
 const b=body as Record<string,unknown>;
 const name=typeof b.name==='string'?b.name.trim().replace(/\s+/g,' '):'';
 const email=typeof b.email==='string'?b.email.trim().toLowerCase():'';
 const goal=Number(b.goal);
 if(name.length<2||name.length>100)throw Error('Enter a name between 2 and 100 characters');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw Error('Enter a valid sign-in email');
 if(!Number.isInteger(goal)||goal<3||goal>100)throw Error('Daily goal must be between 3 and 100');
 const id=b.id==null?null:Number(b.id);
 if(id!==null&&(!Number.isInteger(id)||id<1))throw Error('Invalid buyer profile');
 return {id,name,email,goal,active:b.active===false||b.active===0?0:1};
}
