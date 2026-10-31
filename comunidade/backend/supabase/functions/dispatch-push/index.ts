import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

type PendingPush={person_id:string;endpoint:string;p256dh:string;auth_secret:string;notification_key:string;version:string;title:string;body:string;tab:string;section:string|null};
const env=(name:string)=>Deno.env.get(name)??"";
const supabase=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
function sameSecret(left:string,right:string){let difference=left.length^right.length;for(let index=0;index<Math.max(left.length,right.length);index++)difference|=(left.charCodeAt(index%Math.max(left.length,1))||0)^(right.charCodeAt(index%Math.max(right.length,1))||0);return difference===0;}

Deno.serve(async request=>{
  if(request.method!=="POST")return new Response("Method not allowed",{status:405});
  const [secretResult]=await Promise.all([supabase.rpc("push_dispatch_secret")]);
  const expected=String(secretResult.data??"");
  if(secretResult.error||!expected||!sameSecret(request.headers.get("x-icabv-push-token")??"",expected))return new Response("Unauthorized",{status:401});
  const publicKey=env("VAPID_PUBLIC_KEY"),privateKey=env("VAPID_PRIVATE_KEY"),subject=env("VAPID_SUBJECT");
  if(!publicKey||!privateKey||!subject)return Response.json({error:"push_not_configured"},{status:503});
  webpush.setVapidDetails(subject,publicKey,privateKey);
  const {data:pending,error}=await supabase.rpc("pending_push_notifications",{batch_limit:200});
  if(error)return Response.json({error:"push_queue_unavailable"},{status:503});
  let delivered=0,removed=0,failed=0;
  for(const row of (pending??[]) as PendingPush[]){
    const payload=JSON.stringify({key:row.notification_key,title:row.title,body:row.body,tab:row.tab,section:row.section,url:`/app?tab=${encodeURIComponent(row.tab)}${row.section?`&section=${encodeURIComponent(row.section)}`:""}`});
    try{
      await webpush.sendNotification({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth_secret}},payload,{TTL:60*60*24,urgency:"normal"});
      const recorded=await supabase.rpc("record_push_delivery",{target_person:row.person_id,push_endpoint:row.endpoint,notification_key:row.notification_key,notification_version:row.version});
      if(recorded.error)failed++;else delivered++;
    }catch(error){
      const status=Number((error as {statusCode?:number})?.statusCode??0);
      if(status===404||status===410){const removedResult=await supabase.rpc("remove_dead_push_subscription",{target_person:row.person_id,push_endpoint:row.endpoint});if(removedResult.error)failed++;else removed++;}
      else failed++;
    }
  }
  return Response.json({delivered,removed,failed});
});
