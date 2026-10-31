import {NextResponse} from 'next/server';
const retired=()=>NextResponse.json({error:'Este endpoint foi substituído pelo Supabase.'},{status:410,headers:{'Cache-Control':'no-store'}});
export const GET=retired;
export const POST=retired;
export const PATCH=retired;
export const DELETE=retired;
