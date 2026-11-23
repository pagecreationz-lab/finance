'use client';

import * as React from 'react';
import {Calendar} from './calendar';
import {Popover,PopoverContent,PopoverTrigger} from './popover';

// Keep native date values and validation; calculated dates get a calendar preview.
export function DateInput({readOnly,onClick,onKeyDown,...props}:React.ComponentProps<'input'>){
 const [open,setOpen]=React.useState(false);
 const value=typeof props.value==='string'?props.value:'';
 const selected=/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(value+'T12:00:00'):undefined;
 const picker=(input:HTMLInputElement)=>{try{input.showPicker?.()}catch{/* Native keyboard entry remains available. */}};
 if(!readOnly)return <input {...props} type="date" onClick={e=>{onClick?.(e);if(!e.defaultPrevented)picker(e.currentTarget)}} onKeyDown={e=>{onKeyDown?.(e);if(!e.defaultPrevented&&(e.key==='Enter'||(e.altKey&&e.key==='ArrowDown'))){e.preventDefault();picker(e.currentTarget)}}}/>;
 return <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger nativeButton={false} render={<input {...props} type="date" readOnly aria-label={props['aria-label']||'Calculated date'} onClick={onClick} onKeyDown={e=>{onKeyDown?.(e);if(e.key==='Enter'||e.key===' '||(e.altKey&&e.key==='ArrowDown')){e.preventDefault();setOpen(true)}}}/>}/>
  <PopoverContent className="w-auto p-2" align="start">
   <p className="max-w-64 px-2 pb-2 text-sm">{selected?'Automatically calculated from the loan schedule.':'Select the start date and monthly end date to calculate this date.'}</p>
   <Calendar mode="single" selected={selected} defaultMonth={selected} disabled captionLayout="dropdown"/>
  </PopoverContent>
 </Popover>;
}
