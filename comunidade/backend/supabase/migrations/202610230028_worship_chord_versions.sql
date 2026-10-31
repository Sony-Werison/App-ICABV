-- Versions belong to an existing song and inherit its read/manage policies.
create or replace function private.valid_worship_chord_versions(versions jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare v jsonb; ids text[]:='{}';
begin
 if jsonb_typeof(versions)<>'array' or jsonb_array_length(versions)>50 or length(versions::text)>4000000 then return false; end if;
 for v in select * from jsonb_array_elements(versions) loop
  if jsonb_typeof(v)<>'object' or coalesce(v->>'id','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or v->>'id'=any(ids) or jsonb_typeof(v->'name') is distinct from 'string' or length(trim(v->>'name')) not between 1 and 100
   or jsonb_typeof(v->'musical_key') is distinct from 'string' or length(v->>'musical_key') not between 1 and 20
   or jsonb_typeof(v->'chords') is distinct from 'string' or length(v->>'chords')>60000
   or jsonb_typeof(v->'lyrics') is distinct from 'string' or length(v->>'lyrics')>60000
   or (trim(v->>'chords')='' and trim(v->>'lyrics')='') then return false; end if;
  ids:=array_append(ids,v->>'id');
 end loop;
 return true;
end $$;
revoke all on function private.valid_worship_chord_versions(jsonb) from public,anon;
grant execute on function private.valid_worship_chord_versions(jsonb) to authenticated;
alter table public.worship_songs add column if not exists chord_versions jsonb not null default '[]'
 check(private.valid_worship_chord_versions(chord_versions));
comment on column public.worship_songs.chord_versions is 'Named, editable arrangements of this song. Legacy chords remain the primary arrangement for older clients.';
