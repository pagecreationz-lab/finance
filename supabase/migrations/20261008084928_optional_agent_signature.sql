-- Preserve the installed function's assignment checks, locks, audit and role grants.
begin;
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.rmv_record_collection(jsonb,text,text,jsonb)'::regprocedure) into definition;
 definition=replace(definition,$guard$if p_role='agent' and (sig is null or jsonb_typeof(sig)<>'array' or jsonb_array_length(sig)=0) then raise exception 'Customer signature required'; end if;$guard$,'-- Customer signatures are optional; existing signed receipts remain immutable.');
 if position('Customer signature required' in definition)>0 then raise exception 'Unexpected collection function version; review signature validation before deploying'; end if;
 execute definition;
end;
$migration$;
commit;
notify pgrst,'reload schema';
