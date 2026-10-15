import { useRef, useState } from 'react';
import { Check, FloppyDisk, Play, X } from '@phosphor-icons/react';
import type { useRetargetTransfer } from '../hooks/useRetargetTransfer';
import type { ConventionV1 } from '../workers/retargetAnalysisTypes';
import { PanelAction } from './WorkspaceTasks';

const conventions:Array<[ConventionV1,string]>=[['auto','Detect names'],['mixamo','Mixamo'],['ue4','UE4 mannequin'],['unity','Unity humanoid'],['rigify','Rigify deform']];
export default function RetargetTransferControls({transfer,sourcePicker,profileControls,profileError=''}:{
  transfer:ReturnType<typeof useRetargetTransfer>;sourcePicker:React.ReactNode;profileControls:React.ReactNode;profileError?:string;
}) {
  const {state}=transfer;
  const busy=['preparing','analysis','bake'].includes(state.phase);
  const [filter,setFilter]=useState('');
  const [mappingOpen,setMappingOpen]=useState(false);
  const [mappingPage,setMappingPage]=useState(0);
  const filteredBones=state.sourceBones.filter(name=>name.toLowerCase().includes(filter.toLowerCase()));
  const page=Math.min(mappingPage,Math.max(0,Math.ceil(filteredBones.length/12)-1));
  const details=useRef<HTMLDetailsElement>(null);
  const primary=useRef<HTMLButtonElement>(null);
  const focusSource=()=>requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('[data-testid="animation-retarget-clips"] button')?.focus());
  const discard=()=>{transfer.discard();focusSource();};
  const mapped=state.analysis?.mapping.decisions.length??0;
  const openMappingDetails=()=>{
    if(!details.current)return;details.current.open=true;
    requestAnimationFrame(()=>details.current?.querySelector<HTMLElement>('select,input')?.focus());
  };
  return <div className="retarget-transfer" data-testid="retarget-transfer" data-phase={state.phase}>
    {!!profileError && !mappingOpen && <p role="alert">{profileError} Open Mapping details to correct or clear the profile.</p>}
    {state.phase==='idle' && sourcePicker}
    {state.phase!=='idle' && <>
      <p className="transfer-source" title={state.source}>{state.source}</p>
      {busy ? <div className="transfer-progress" role="status">
        <span>{state.phase==='preparing'?'Reading clips…':state.phase==='analysis'?'Reviewing rigs…':'Preparing preview…'}</span>
        <progress aria-label="Transfer progress" max={state.progress?.total??1} value={state.progress?.completed??0}/>
        <PanelAction icon={X} label="Cancel transfer" onClick={()=>{transfer.cancel();focusSource();}} data-testid="retarget-cancel">Cancel</PanelAction>
      </div> : <>
        {state.phase==='preview' && <p role="status">{state.clipCount} clip{state.clipCount===1?'':'s'} · {mapped} mapped bones · Preview
          {(state.reportNotes.length || state.analysis?.diagnostics.some(item=>item.level!=='info'))?' · Review notes':''}</p>}
        {state.phase==='review' && <p role="status">{state.analysis?.status==='blocked'?'Mapping needs attention.':'Ready to review.'}</p>}
        {transfer.preview && transfer.preview.clips.length>1 && <label>Preview clip
          <select value={transfer.preview.activeClip??0} onChange={event=>transfer.selectPreviewClip(Number(event.target.value))}>
            {transfer.preview.clips.map((clip,index)=><option key={index} value={index}>{clip.name}</option>)}
          </select>
        </label>}
        {state.error && <p role="alert">{state.error}</p>}
        <div className="transfer-actions">
          {state.phase==='preview'
            ?<PanelAction icon={Check} label="Apply transfer" buttonRef={primary} onClick={transfer.apply} data-testid="retarget-apply">Apply</PanelAction>
            :<PanelAction icon={Play} label={state.analysis?.status==='blocked'?'Review mapping':'Review transfer'} buttonRef={primary} disabled={!state.sourceBones.length} onClick={state.analysis?.status==='blocked'?openMappingDetails:transfer.review} data-testid="retarget-review">Review</PanelAction>}
          <PanelAction icon={X} label="Discard transfer" onClick={discard} data-testid="retarget-discard">Discard</PanelAction>
        </div>
      </>}
    </>}
    <details ref={details} className="workspace-task-details" data-testid="retarget-mapping-details" onToggle={event=>setMappingOpen(event.currentTarget.open)} onKeyDown={event=>{
      if(event.key==='Escape' && details.current?.open){event.preventDefault();event.stopPropagation();details.current.open=false;details.current.querySelector('summary')?.focus();}
    }}>
      <summary>Mapping details</summary>
      {state.phase!=='idle' && !busy && sourcePicker}
      <div className="transfer-conventions">
        {(['source','target'] as const).map(side=><label key={side}>{side==='source'?'Source names':'Target names'}
          <select aria-label={`${side==='source'?'Source':'Target'} naming convention`} value={state[`${side}Convention`]} disabled={busy}
            onChange={event=>transfer.updateReview({[`${side}Convention`]:event.target.value as ConventionV1})}>
            {conventions.map(([value,label])=><option value={value} key={value}>{label}</option>)}
          </select>
        </label>)}
      </div>
      {mappingOpen && !!state.sourceBones.length && <>
        <label>Find bone<input type="search" value={filter} onChange={event=>{setFilter(event.target.value);setMappingPage(0);}} disabled={busy}/></label>
        <div className="transfer-mapping-list">
          {filteredBones.slice(page*12,(page+1)*12).map((name,index)=><label key={`${name}-${index}`}>
            <span title={name}>{name}</span>
            <select aria-label={`Map ${name}`} disabled={busy} value={state.overrides[name]??''} onChange={event=>{
              const overrides={...state.overrides};if(event.target.value)overrides[name]=event.target.value;else delete overrides[name];
              transfer.updateReview({overrides});
            }}>
              <option value="">{state.analysis?.mapping.map[name]?`Auto: ${state.analysis.mapping.map[name]}`:'Unresolved'}</option>
              {state.targetBones.map((target,index)=><option value={target} key={`${target}-${index}`}>{target}</option>)}
            </select>
          </label>)}
        </div>
        {filteredBones.length>12 && <nav aria-label="Mapping pages" className="transfer-actions">
          <button type="button" disabled={page===0} onClick={()=>setMappingPage(page-1)}>Previous</button>
          <span>{page+1} / {Math.ceil(filteredBones.length/12)}</span>
          <button type="button" disabled={(page+1)*12>=filteredBones.length} onClick={()=>setMappingPage(page+1)}>Next</button>
        </nav>}
      </>}
      {state.analysis && <ul className="transfer-diagnostics">{state.analysis.diagnostics.map((item,index)=><li key={`${item.code}-${index}`} data-level={item.level}>
        <strong>{item.code}</strong> {item.message}
      </li>)}</ul>}
      {!!state.reportNotes.length && <div data-testid="retarget-bake-notes">Review {state.reportNotes.length} flagged clips<ul>{state.reportNotes.map((note,index)=><li key={index}>{note}</li>)}</ul></div>}
      {state.analysis?.mapping.ok && <PanelAction icon={FloppyDisk} label="Export reviewed mapping" disabled={busy} onClick={()=>void transfer.exportMapping()} data-testid="retarget-mapping-export">Export mapping</PanelAction>}
      {profileControls}
    </details>
  </div>;
}
