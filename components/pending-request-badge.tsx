'use client';
import {useEffect,useState} from 'react';
export function PendingRequestBadge({kind}:{kind:'loans'|'customers'|'both'}){
 const [count,setCount]=useState<number|null>(null);
 useEffect(()=>{let disposed=false,running=false;
  const load=async()=>{if(running)return;running=true;try{
   let total=0;
   for(const type of kind==='both'?['loan','customer']:[kind==='loans'?'loan':'customer']){
    for(let page=0;;page++){
     const r=await fetch(`/api/${type}-requests?page=${page}`,{cache:'no-store'});
     if(r.status===403)break;
     if(!r.ok)throw new Error('Pending counts unavailable');
     const d=await r.json();total+=d.requests.filter((r:{status:string})=>r.status==='pending').length;
     if(!d.hasMore)break;
    }
   }
   if(!disposed)setCount(total);
  }catch{if(!disposed)setCount(null)}finally{running=false}};
  void load();const timer=setInterval(load,30000);window.addEventListener('focus',load);window.addEventListener('fundflow-data',load);
  return()=>{disposed=true;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('fundflow-data',load)};
 },[kind]);
 if(count===0)return null;
 return <span title="Pending approval requests (combined customer and loan submissions count once)" aria-label={count===null?'Pending count unavailable':`${count} pending approvals`} className="ml-auto rounded-full bg-[#d9ff54] px-2 py-0.5 text-[10px] font-bold text-[#16372b]">{count===null?'…':count} pending</span>;
}
