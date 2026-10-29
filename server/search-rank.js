import {searchPlan,SEARCH_SEPARATORS} from '../shared/search.js';

// Normalize in SQLite with exactly the same separators as shared/search.js.
// GLOB Hangul syllable ranges are equivalent to an initial index without a DB migration.
const normalizedSQL=value=>`lower(${SEARCH_SEPARATORS.reduce((sql,c)=>`replace(${sql},'${c}','')`,`COALESCE(${value},'')`)})`;
export function searchRank(q,fields,extra=''){
 const normalized=normalizedSQL('f.value'),plan=JSON.stringify(searchPlan(q));
 const input=key=>`json_extract(s.plan,'$.${key}')`;
 const initialsMatch=`NOT EXISTS(SELECT 1 FROM json_each(s.plan,'$.initialRanges') initial WHERE substr(${normalized},initial.key+1,1) NOT GLOB initial.value)`;
 const sql=`(SELECT COALESCE(min(CASE
 WHEN f.value=${input('raw')} THEN 0
 WHEN ${normalized}=${input('normalized')} THEN 1
 WHEN EXISTS(SELECT 1 FROM json_each(s.plan,'$.aliases') alias WHERE alias.value=${normalized}) THEN 2
 WHEN ${input('initial')}!='' AND length(${normalized})=length(${input('normalized')}) AND ${initialsMatch} THEN 3
 WHEN ${input('initial')}='' AND instr(${normalized},${input('normalized')})>0 THEN 4
 WHEN ${input('initialPrefix')}!='' AND length(${normalized})>=length(${input('normalized')}) AND ${initialsMatch} THEN 5
 WHEN EXISTS(SELECT 1 FROM json_each(s.plan,'$.fuzzy') fuzzy WHERE ${normalized} GLOB fuzzy.value) THEN 6
 ELSE 99 END),99) FROM (SELECT value FROM json_each(json_array(${fields.join(',')})) ${extra}) f CROSS JOIN (SELECT ? plan) s)`;
 return {sql,plan};
}
