import {redirect} from 'next/navigation';import {account} from '../../lib/auth';import Dashboard from './Dashboard';
export const dynamic='force-dynamic';
export default async function Page(){const user=await account();if(!user)redirect('/');if(user.require_change)redirect('/change-password');return <Dashboard/>}
