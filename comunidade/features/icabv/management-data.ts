import {useQuery} from '@tanstack/react-query';
import {supabase} from './supabase';
export type ManagementSummary={persons:number|null;event_count:number;group_count:number;events:{id:string;title:string;starts_at:string;location:string}[]};
export function useManagementSummary(){
 return useQuery({queryKey:['management-summary'],queryFn:async()=>{
  const result=await supabase!.rpc('management_summary');if(result.error)throw result.error;
  return result.data as ManagementSummary;
 }});
}
