import { env } from 'cloudflare:workers';
import {eq} from 'drizzle-orm';
import {getDb} from '../db';
import {access} from '../db/schema';
import {getChatGPTUser,type ChatGPTUser} from './chatgpt-auth';
import type {Access} from './permissions';
export async function accessFor(user:ChatGPTUser):Promise<Access|null>{
 const db=getDb();
 if(env.CHURCH_OWNER_EMAIL&&user.email.trim().toLowerCase()===env.CHURCH_OWNER_EMAIL.trim().toLowerCase()){
  await db.insert(access).values({userId:user.userId,churchOwner:user.userId,email:user.email.toLowerCase(),name:user.displayName,role:'admin',createdAt:new Date().toISOString()}).onConflictDoNothing();
 }
 const row=(await db.select().from(access).where(eq(access.userId,user.userId)))[0];
 return row&&row.active?row as Access:null;
}
export class AccessError extends Error{constructor(message:string,public status:number){super(message);}}
export async function apiAccess(request:Request,write=false){
 const origin=request.headers.get('origin');
 if(write&&(!origin||origin!==new URL(request.url).origin))throw new AccessError('Origem não permitida.',403);
 const user=await getChatGPTUser();if(!user)throw new AccessError('Entre na sua conta para continuar.',401);
 const a=await accessFor(user);if(!a)throw new AccessError('Seu acesso ainda não foi liberado ou foi suspenso.',403);
 return a;
}
