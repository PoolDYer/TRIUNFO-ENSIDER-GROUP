"use client";
import {useEffect,useId,useRef,useState} from "react";
import {CalendarDays} from "lucide-react";

const months=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export default function MonthPicker({date,onChange}:{date:string;onChange:(date:string)=>void}) {
  const [open,setOpen]=useState(false);
  const container=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const yearSelect=useRef<HTMLSelectElement>(null);
  const panelId=useId();
  const year=Number(date.slice(0,4)),month=Number(date.slice(5,7));
  const currentYear=Number(new Intl.DateTimeFormat("en",{timeZone:"America/Lima",year:"numeric"}).format(new Date()));
  const firstYear=Math.min(currentYear-100,year),lastYear=Math.max(currentYear+100,year);
  useEffect(()=>{
    if(!open)return;
    yearSelect.current?.focus();
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!container.current?.contains(event.target))setOpen(false);};
    document.addEventListener("pointerdown",outside);
    return()=>document.removeEventListener("pointerdown",outside);
  },[open]);
  function choose(selectedMonth:number){
    onChange(`${String(year).padStart(4,"0")}-${String(selectedMonth).padStart(2,"0")}-01`);
    setOpen(false);trigger.current?.focus();
  }
  return <div className="month-picker" ref={container} onKeyDown={e=>{if(e.key==="Escape"){setOpen(false);trigger.current?.focus();}}}>
    <button type="button" id="business-date" className="month-picker-trigger" ref={trigger} aria-expanded={open} aria-controls={panelId} onClick={()=>setOpen(!open)}>
      {months[month-1]} de {year}<CalendarDays size={18}/>
    </button>
    {open&&<section className="month-picker-panel" id={panelId} aria-label="Seleccionar mes y año">
      <label htmlFor={`${panelId}-year`}>Año</label>
      <select id={`${panelId}-year`} ref={yearSelect} value={year} onChange={e=>onChange(`${e.target.value.padStart(4,"0")}-${String(month).padStart(2,"0")}-01`)}>
        {Array.from({length:lastYear-firstYear+1},(_,i)=>firstYear+i).map(y=><option key={y} value={y}>{y}</option>)}
      </select>
      <div className="month-picker-grid" aria-label="Meses">
        {months.map((name,index)=><button type="button" key={name} aria-pressed={index+1===month} className={index+1===month?"selected":""} onClick={()=>choose(index+1)}>{name}</button>)}
      </div>
    </section>}
  </div>;
}
