// Only updates existing song IDs from a reviewed plan. Never creates songs.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const folder=process.env.ICABV_CHORD_IMPORT_DIR||'work/cifras-lote';
mkdirSync(folder,{recursive:true});
const token=process.env.SUPABASE_ACCESS_TOKEN;
assert.ok(token,'Use the configured Supabase CLI session.');
async function query(sql){
 const response=await fetch('https://api.supabase.com/v1/projects/ynkfmuseiancpnyloraf/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql})});
 if(!response.ok)throw Error(`Database operation failed (${response.status}): ${await response.text()}`);
 return response.json();
}
const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
const mode=process.argv[2]||'snapshot';
if(mode==='snapshot'){
 const rows=await query('select * from public.worship_songs order by title,id');
 assert.ok(rows.length>800);
 writeFileSync(`${folder}/songs-before.json`,JSON.stringify(rows,null,2));
 console.log(`Snapshot: ${rows.length} músicas existentes; conteúdo preservado localmente.`);
}else if(mode==='schema'){
 const migration=readFileSync('backend/supabase/migrations/202610230028_worship_chord_versions.sql','utf8');
 const escaped=migration.replaceAll("'","''");
 await query(`begin; ${migration} insert into supabase_migrations.schema_migrations(version,name,statements) values ('202610230028','worship_chord_versions',array['${escaped}']) on conflict(version) do nothing; notify pgrst,'reload schema'; commit;`);
 console.log('Schema de versões aplicado, com permissões existentes.');
}else if(mode==='apply'||mode==='rehearse'){
 const planHash=createHash('sha256').update(readFileSync(`${folder}/plan.json`)).digest('hex');
 if(mode==='apply')assert.equal(JSON.parse(readFileSync(`${folder}/rehearsal.json`,'utf8')).plan_hash,planHash,'Rehearse this exact plan first.');
 const plan=JSON.parse(readFileSync(`${folder}/plan.json`,'utf8'));
 const before=JSON.parse(readFileSync(`${folder}/songs-before.json`,'utf8'));
 assert.ok(plan.length>0);assert.equal(new Set(plan.map(p=>p.id)).size,plan.length);
 for(const p of plan){assert.ok(before.some(s=>s.id===p.id));assert.ok(p.chord_versions.length);}
 const sql=`begin;
 do $import$ declare expected integer:=${before.length}; changed integer; item jsonb; previous public.worship_songs; begin
 if (select count(*) from public.worship_songs)<>expected then raise exception 'Song count changed since snapshot'; end if;
 for item in select * from jsonb_array_elements(${literal(plan)}) loop
  select * into strict previous from public.worship_songs where id=(item->>'id')::uuid for update;
  if previous.chord_versions=item->'chord_versions' and previous.chords=item->>'chords' and previous.lyrics=item->>'lyrics' and previous.musical_key=item->>'musical_key' then continue; end if;
  if previous.chords is distinct from item->'before'->>'chords' or previous.lyrics is distinct from item->'before'->>'lyrics' or previous.musical_key is distinct from item->'before'->>'musical_key' or previous.chord_versions is distinct from coalesce(item->'before'->'chord_versions','[]'::jsonb) then raise exception 'Concurrent song edit: %',previous.id; end if;
  update public.worship_songs set chord_versions=item->'chord_versions',chords=item->>'chords',lyrics=item->>'lyrics',musical_key=item->>'musical_key' where id=previous.id;
 end loop;
 if (select count(*) from public.worship_songs)<>expected then raise exception 'Unexpected song count'; end if;
 end $import$;
 ${mode==='rehearse'?'rollback':'commit'};`;
 await query(sql);
 const after=await query('select * from public.worship_songs order by title,id');
 assert.equal(after.length,before.length);
 if(mode==='rehearse'){
  for(const previous of before){const song=after.find(s=>s.id===previous.id);for(const field of ['chords','lyrics','musical_key'])assert.equal(song[field],previous[field]);assert.deepEqual(song.chord_versions,previous.chord_versions??[]);}
  writeFileSync(`${folder}/rehearsal.json`,JSON.stringify({passed:true,plan_hash:planHash,songs:plan.length},null,2));
  console.log(`Rehearsal passed: ${plan.length} song updates validated and rolled back. No songs created.`);process.exit(0);
 }
 for(const p of plan){const s=after.find(s=>s.id===p.id);for(const key of ['chord_versions','chords','lyrics','musical_key'])assert.deepEqual(s[key],p[key]);}
 writeFileSync(`${folder}/songs-after.json`,JSON.stringify(after,null,2));
 const report={applied_at:new Date().toISOString(),song_count_before:before.length,song_count_after:after.length,updated:plan.length,versions:plan.reduce((n,p)=>n+p.chord_versions.length,0),verified:true};
 writeFileSync(`${folder}/applied.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}else throw Error('Use snapshot, schema, rehearse or apply.');
