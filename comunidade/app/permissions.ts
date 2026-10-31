import type {Kind,Item} from './model';
export const roles=['admin','secretary','treasurer','leader','member'] as const;
export type Role=typeof roles[number];
export type Access={userId:string;churchOwner:string;email:string;name:string;role:Role;ministry:string;memberId:string|null;active:boolean;version:number};
export const roleNames:Record<Role,string>={admin:'Administrador',secretary:'Secretaria',treasurer:'Tesouraria',leader:'Líder de ministério',member:'Membro'};
export const normalize=(value:unknown)=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase('pt-BR');
export function canWrite(a:Access,kind:Kind,data?:Record<string,unknown>){
 if(!a.active)return false;if(a.role==='admin')return true;
 if(a.role==='secretary')return ['member','event','notice','content','cell','prayer'].includes(kind);
 if(a.role==='treasurer')return kind==='transaction';
 return a.role==='leader'&&kind==='schedule'&&(!data||normalize(data.ministry)===normalize(a.ministry));
}
export function canRead(a:Access,item:Item){
 if(!a.active)return false;const d=item.data;
 if(a.role==='admin')return true;
 if(item.kind==='content'||item.kind==='cell')return a.role==='secretary'||d.status==='Publicado';
 if(item.kind==='prayer')return a.role==='secretary'||d.authorId===a.userId;
 if(item.kind==='notice')return a.role==='secretary'||d.status==='Publicado';
 if(item.kind==='event')return true;
 if(item.kind==='transaction')return a.role==='treasurer';
 if(item.kind==='member')return a.role==='secretary'||item.id===a.memberId||(a.role==='leader'&&normalize(d.ministry)===normalize(a.ministry));
 if(item.kind==='schedule')return a.role==='secretary'||d.memberId===a.memberId||(a.role==='leader'&&normalize(d.ministry)===normalize(a.ministry));
 return false;
}
export function project(a:Access,item:Item):Item {
 if(a.role==='admin'||a.role==='secretary'||item.kind==='transaction'||item.kind==='notice')return item;
 if(item.kind==='member')return {...item,data:{name:item.data.name,ministry:item.data.ministry,status:item.data.status}};
 const data={...item.data};delete data.notes;return {...item,data};
}
export function managementKinds(a:Access):Kind[]{return a.role==='admin'?['member','transaction','schedule','event','notice','content','cell','prayer']:a.role==='secretary'?['member','schedule','event','notice','content','cell','prayer']:a.role==='treasurer'?['transaction','event','notice']:a.role==='leader'?['member','schedule','event','notice']:[];}
