// Same time zone, thresholds and unknown/error handling as communication-state.js.
export function communicationFilterSql(){
 const location="o.data->'location'",raw=`trim(coalesce(${location}->>'updated_at',''))`;
 const normalized=`case when ${raw} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}' and ${raw} !~ '(Z|[+-][0-9]{2}:?[0-9]{2})$' then ${raw}||'-03:00' else ${raw} end`;
 const at=`case when pg_input_is_valid(${normalized},'timestamp with time zone') then (${normalized})::timestamptz end`;
 const ignition=`case when coalesce(${location}->>'ignition','') ~* '^(1|true|on|ligad[oa])$' then 'on' when coalesce(${location}->>'ignition','') ~* '^(0|false|off|desligad[oa])$' then 'off' else 'unknown' end`;
 return `case when coalesce(${location}->>'ok','')<>'true' or coalesce(${location}->>'query_error','') not in ('','false','0') or ${at} is null or ${at}>statement_timestamp()+interval '5 minutes' then 'unknown' when ${ignition}='on' and ${at}<statement_timestamp()-interval '15 minutes' or ${ignition}='off' and ${at}<statement_timestamp()-interval '2 hours' then 'stale' else ${ignition} end`;
}
