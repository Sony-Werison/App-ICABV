-- Imported deleted-user labels are not identity evidence, even when equal.
create or replace function private.identity_name(value text) returns text language sql immutable set search_path='' as $$
 select case when lower(trim(value)) like 'aluno de cadastro removido%' or lower(trim(value)) like 'integrante de cadastro removido%' then ''
 else regexp_replace(translate(lower(trim(value)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[^a-z0-9]','','g') end
$$;
