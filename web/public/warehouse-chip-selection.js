import {copyCandidate} from './warehouse-chip-copy.js';
// Missing from a filtered page is not evidence that a selected record was deleted.
export function retainChipSelection(cache,selected,visible,allowed=true){
 if(!allowed){selected.clear();cache.clear();return [];}
 for(const row of visible){const previous=cache.get(row.id);if(!copyCandidate(row)||(selected.has(row.id)&&previous&&previous.serial!==row.serial))selected.delete(row.id);cache.set(row.id,row);}
 const visibleIds=new Set(visible.map(r=>r.id));for(const id of cache.keys())if(!selected.has(id)&&!visibleIds.has(id))cache.delete(id);
 return [...cache.values()];
}
