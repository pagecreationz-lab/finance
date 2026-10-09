'use client';
import {useEffect,useState} from 'react';
export function AssignedCountBadge({kind}:{kind:'loans'|'customers'}){
 const [count,setCount]=useState<number|null>(null);
 useEffect(()=>{let disposed=false,running=false;
  const load=async()=>{if(running)return;running=true;try{
   const response=await fetch('/api/data',{cache:'no-store'});
   if(!response.ok)throw new Error('Count unavailable');
   const data=await response.json();
   if(!Array.isArray(data[kind]))throw new Error('Count unavailable');
   if(!disposed)setCount(data[kind].length);
  }catch{if(!disposed)setCount(null)}finally{running=false}};
  void load();const timer=setInterval(load,30000);window.addEventListener('focus',load);window.addEventListener('fundflow-data',load);
  return()=>{disposed=true;clearInterval(timer);window.removeEventListener('focus',load);window.removeEventListener('fundflow-data',load)};
 },[kind]);
 if(count===null)return null;
 return <span aria-label={`${count} assigned ${kind}`} title={`${count} assigned ${kind}`} className="ml-auto shrink-0 rounded-full bg-[#d9ff54] px-2 py-0.5 text-[10px] font-bold text-[#16372b]">{count}</span>;
}
