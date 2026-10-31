import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url,"NEXT_PUBLIC_SUPABASE_URL is required.");
assert.ok(serviceKey,"Set SUPABASE_SERVICE_ROLE_KEY in the private local environment before running this script.");
const supabase=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
const ready=await supabase.rpc("identity_provisioning_ready");
assert.ok(!ready.error&&ready.data===true,"Apply migration 202610300038_existing_person_accounts.sql first.");
const people=[];
for(let offset=0;;offset+=500){
  const {data,error}=await supabase.from("persons").select("id,full_name,auth_user_id").is("auth_user_id",null).order("id").range(offset,offset+499);
  assert.ok(!error,error?.message);
  people.push(...data);
  if(data.length<500)break;
}
const words=["Caju","Lago","Manga","Ponte","Nuvem","Trigo","Festa","Piano","Limao","Barco","Vento","Mimo","Folha","Dado","Bolo","Livro","Praia","Gato","Vila","Mesa"];
const password=()=>`${words[randomInt(words.length)]}-${words[randomInt(words.length)]}-${String(randomInt(10,100))}`;
const slug=value=>String(value||"pessoa").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"pessoa";
const quote=value=>`"${String(value??"").replaceAll('"','""')}"`;
const users=[];
const localData=process.env.LOCALAPPDATA||path.join(homedir(),"AppData","Local");
const folder=path.join(localData,"ICABV","first-access");
mkdirSync(folder,{recursive:true});
const stamp=new Date().toISOString().replaceAll(":","-").replace(".","-");
const destination=path.join(folder,`credenciais-${stamp}.csv`);
const writeCsv=()=>writeFileSync(destination,["Nome,ID da pessoa,E-mail fictício,Senha temporária",...users.map(user=>[user.name,user.person_id,user.email,user.temporary_password].map(quote).join(","))].join("\r\n"),{encoding:"utf8",flag:"w",mode:0o600});
for(const person of people){
  const email=`${slug(person.full_name)}.${person.id.slice(0,8)}@icabv.invalid`;
  const temporaryPassword=password();
  const created=await supabase.auth.admin.createUser({email,password:temporaryPassword,email_confirm:true,user_metadata:{full_name:person.full_name},app_metadata:{provisioning_person_id:person.id,must_change_password:true}});
  assert.ok(!created.error,`Could not provision person ${person.id}: ${created.error?.message}`);
  const user=created.data.user;
  assert.ok(user?.id,`Auth did not return a user ID for person ${person.id}.`);
  users.push({name:person.full_name,person_id:person.id,email,temporary_password:temporaryPassword});
  writeCsv();
  const {data:linked,error:linkError}=await supabase.from("persons").select("auth_user_id").eq("id",person.id).single();
  assert.ok(!linkError&&linked.auth_user_id===user.id,`Person link did not complete for ${person.id}.`);
  const finalized=await supabase.auth.admin.updateUserById(user.id,{app_metadata:{must_change_password:true}});
  assert.ok(!finalized.error,`Could not finalize account ${person.id}: ${finalized.error?.message}`);
}
console.log(JSON.stringify({created:users.length,csv:destination,preservedLinkedAccounts:true}));
