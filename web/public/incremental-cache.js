export function mergeIncremental(previous,incoming){
 if(!incoming.delta)return incoming;
 if(!previous?.cursor)throw Error('Cache sem marcador; recarregue os dados.');
 if(BigInt(incoming.cursor)<BigInt(previous.cursor))return previous;
 if(incoming.unchanged)return {...previous,cursor:incoming.cursor};
 const merge=(rows,updates,removed)=>{const map=new Map((rows||[]).map(r=>[r.id,r]));for(const id of removed||[])map.delete(id);for(const row of updates||[])map.set(row.id,row);return [...map.values()];};
 return {...previous,cursor:incoming.cursor,rows:merge(previous.rows,incoming.rows,incoming.removed),movements:merge(previous.movements,incoming.movements,incoming.removedMovements)};
}
