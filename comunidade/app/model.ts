import { z } from 'zod';
const short=z.string().trim().min(1,'Preencha os campos obrigatórios.').max(180);
const note=z.string().trim().max(3000).default('');
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Data inválida.').refine(v=>{const d=new Date(v+'T12:00:00Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;},'Data inválida.');
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/,'Horário inválido.');
const publicLink=z.union([z.literal(''),z.string().trim().url('Informe um link válido.').max(1500).refine(v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}},'Use um link HTTPS sem credenciais.')]);
export const schemas={
 content:z.object({title:short,type:z.enum(['Devocional','Pregação','Estudo','Culto ao vivo']),body:z.string().trim().min(1,'Escreva uma descrição ou reflexão.').max(12000),reference:z.string().trim().max(180),speaker:z.string().trim().max(180),url:publicLink,date,status:z.enum(['Publicado','Rascunho'])}).strict(),
 cell:z.object({title:short,leader:short,weekday:z.enum(['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado']),time,location:short,description:z.string().trim().max(3000),contactUrl:publicLink,status:z.enum(['Publicado','Rascunho'])}).strict(),
 prayer:z.object({title:short,body:z.string().trim().min(1).max(3000),date,status:z.enum(['Aberto','Em oração','Concluído']),authorId:z.string().max(180).default(''),authorName:z.string().max(180).default('')}).strict(),
 notice:z.object({title:short,body:z.string().trim().min(1).max(3000),date,status:z.enum(['Publicado','Rascunho'])}).strict(),
 member:z.object({name:short,email:z.union([z.string().trim().email('E-mail inválido.').max(180),z.literal('')]),phone:z.string().trim().max(30),status:z.enum(['Membro','Visitante','Inativo']),ministry:z.string().trim().max(100),birthday:z.union([date,z.literal('')]),notes:note}).strict(),
 transaction:z.object({description:short,direction:z.enum(['Entrada','Saída']),amount:z.number().int().min(1,'Informe um valor maior que zero.').max(99999999999),category:short,date,status:z.enum(['Realizado','Pendente']),notes:note}).strict(),
 event:z.object({title:short,date,time,location:short,capacity:z.number().int().min(0).max(1000000),status:z.enum(['Planejado','Confirmado','Cancelado']),notes:note}).strict(),
 schedule:z.object({ministry:short,duty:short,memberId:short,eventId:z.string().max(180),date,time,status:z.enum(['Pendente','Confirmado','Indisponível']),notes:note}).strict(),
};
export type Kind=keyof typeof schemas;
export type Item={id:string;kind:Kind;version:number;createdAt:string;updatedAt:string;data:Record<string,string|number>};
export const kinds=Object.keys(schemas) as Kind[];
export function parseMoney(value:string):number{
 const clean=value.trim();if(!/^\d{1,9}(?:[,.]\d{1,2})?$/.test(clean))throw new Error('Use um valor como 150,00, sem separador de milhares.');
 const [whole,decimal='']=clean.replace(',','.').split('.');const cents=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 if(cents<=0)throw new Error('Informe um valor maior que zero.');return cents;
}
