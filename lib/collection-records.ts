export type Signature = number[][][];
export function validSignature(value:unknown):value is Signature {
  if(!Array.isArray(value)||!value.length||value.length>80)return false;
  let count=0,distance=0;
  for(const stroke of value){
    if(!Array.isArray(stroke)||!stroke.length)return false;
    for(let i=0;i<stroke.length;i++){
      const p=stroke[i];if(!Array.isArray(p)||p.length!==2||!p.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))return false;
      if(++count>5000)return false;
      if(i)distance+=Math.hypot(p[0]-stroke[i-1][0],p[1]-stroke[i-1][1]);
    }
  }
  return count>=5&&distance>=0.05;
}
export function validDate(value:unknown):value is string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T00:00:00Z');return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function collectionLedger(receipts:{amount:number;collected_at:number}[],frequency:string,month:string){
  const year=Number(month.slice(0,4)),m=Number(month.slice(5,7));
  const days=new Date(Date.UTC(year,m,0)).getUTCDate();
  const count=frequency==='yearly'?12:frequency==='weekly'?Math.ceil(days/7):days;
  const rows=Array.from({length:count},(_,i)=>({label:frequency==='yearly'?new Date(Date.UTC(year,i,1)).toLocaleString('en',{month:'long',timeZone:'UTC'}):frequency==='weekly'?`Week ${i+1} · ${i*7+1}–${Math.min((i+1)*7,days)}`:`${month}-${String(i+1).padStart(2,'0')}`,amount:0,count:0}));
  for(const receipt of receipts){
    const d=new Date(Number(receipt.collected_at)*1000);if(Number.isNaN(d.getTime()))continue;
    const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
    if(frequency==='yearly'?Number(date.slice(0,4))!==year:date.slice(0,7)!==month)continue;
    const day=Number(date.slice(8,10)),index=frequency==='yearly'?Number(date.slice(5,7))-1:frequency==='weekly'?Math.floor((day-1)/7):day-1;
    rows[index].amount+=Number(receipt.amount);rows[index].count++;
  }
  return rows;
}
