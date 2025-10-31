import React, { useEffect, useRef, useState } from 'react';

type Opt = { value:string; label:string }
export default function BlueSelect({ value, onChange, options }:{
  value:string; onChange:(v:string)=>void; options:Opt[]
}){
  const [open,setOpen]=useState(false);
  const btnRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    const onDoc=(e:MouseEvent)=>{ if(!btnRef.current?.parentElement?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc); return ()=>document.removeEventListener('mousedown', onDoc);
  },[]);
  const current = options.find(o=>o.value===value) ?? options[0];
  return (
    <div className="cm-fancy-select">
      <button ref={btnRef} type="button" className="cm-fancy-trigger" onClick={()=>setOpen(v=>!v)}>
        {current?.label}
        <span className="chev">▾</span>
      </button>
      {open && (
        <div className="cm-fancy-menu" role="listbox" aria-activedescendant={current?.value}>
          {options.map(o=>(
            <div key={o.value}
              role="option"
              aria-selected={o.value===value}
              className={`cm-fancy-option ${o.value===value?'is-selected':''}`}
              onClick={()=>{ onChange(o.value); setOpen(false); }}>
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

