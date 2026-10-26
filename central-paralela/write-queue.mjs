// Bounded per-document queue. No automatic retry after an operation starts.
export class WriteQueue {
 constructor({limit=12,timeout=20000}={}){this.limit=limit;this.timeout=timeout;this.queues=new Map();}
 async run(key,fn){
  let queue=this.queues.get(key);if(!queue){queue=[];this.queues.set(key,queue);}
  if(queue.length>=this.limit)throw Object.assign(Error('Fila ocupada. Tente novamente.'),{status:429});
  const ticket={};queue.push(ticket);
  if(queue.length>1)await new Promise((resolve,reject)=>{ticket.start=()=>{clearTimeout(ticket.timer);resolve();};ticket.timer=setTimeout(()=>{queue.splice(queue.indexOf(ticket),1);reject(Object.assign(Error('Tempo de espera excedido; operação não iniciada.'),{status:429}));},this.timeout);});
  try{return await fn();}finally{queue.shift();if(queue.length)queue[0].start();else this.queues.delete(key);}
 }
}
