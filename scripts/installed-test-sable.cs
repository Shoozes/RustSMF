using System;
using System.IO;
using System.Diagnostics;
using System.Collections.Generic;
using System.Threading;
using System.Windows.Automation;

public sealed class InstalledSableResult {
    public string status="failed",stage="sable-controls",error,failedAction;
    public bool pausedAtZero,animalSuggestions,correctionInvalidatedPreview,correctionReviewed,previewAtMidpoint,ambiguousUnresolved,applied,reopened;
    public bool reopenWarningShown,reopenConfirmedTaskSnapshot;
    public string suggestedUi,correctedUi,previewUi,ambiguousUi,finalUi,reopenedUi;
    public string correctionRoute,initialProfileReadback,correctedProfileReadback;
    public string baseline,previewExport,suggestedMapping,correctedMapping,correctedProfile,committed,project,reopenedExport,ambiguousMapping,afterDiscard;
    public string[] controlsAtStop;public string controlsError;
    public List<InstalledDialogResult> submissions=new List<InstalledDialogResult>();
    public List<string> menuObservations=new List<string>();
}

// Installed UI only. This driver never injects JavaScript, calls app internals,
// moves input focus or substitutes a browser/CLI export for native controls.
public sealed class InstalledSableCase {
    AutomationElement root;readonly IntPtr renderer;readonly int pid,seconds;readonly string job,desktop,output;string lastAction;readonly List<string> menuObservations=new List<string>();
    InstalledSableCase(AutomationElement root,IntPtr renderer,int pid,string job,string desktop,int seconds,string output){this.root=root;this.renderer=renderer;this.pid=pid;this.job=job;this.desktop=desktop;this.seconds=seconds;this.output=output;}
    void Check(){InstalledPickerProbe.Own(renderer,job,desktop);if(InstalledTestNative.InputName()==desktop)throw new Exception("Test desktop became input desktop.");root=AutomationElement.FromHandle(renderer);}
    AutomationElement Find(string name){Check();return root.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.NameProperty,name));}
    void Wait(Func<bool> ready,string message){var watch=Stopwatch.StartNew();while(watch.Elapsed.TotalSeconds<seconds){Check();if(ready())return;Thread.Sleep(100);}throw new TimeoutException(message);}
    string[] SnapshotNames(){
        Check();var cache=new CacheRequest();cache.Add(AutomationElement.NameProperty);cache.Add(AutomationElement.ControlTypeProperty);
        // Snapshot properties in the query, rather than asking live descendants
        // again after React has replaced them during project/model loading.
        using(cache.Activate()){var all=root.FindAll(TreeScope.Descendants,Condition.TrueCondition);var list=new List<string>();for(int i=0;i<all.Count&&list.Count<800;i++)if(!String.IsNullOrEmpty(all[i].Cached.Name))list.Add(all[i].Cached.ControlType.ProgrammaticName+": "+all[i].Cached.Name);return list.ToArray();}
    }
    string[] Names(){
        // UIA can return an unavailable marker even in a cached query while
        // the loaded project replaces its descendants. Retry only this read.
        for(int attempt=0;attempt<8;attempt++){
            try{return SnapshotNames();}
            catch(ElementNotAvailableException){}
            catch(System.Runtime.InteropServices.COMException e){if(e.ErrorCode!=unchecked((int)0x80040201))throw;}
            Thread.Sleep(100);
        }
        throw new TimeoutException("UIA did not provide a stable owned snapshot within eight reads.");
    }
    string Text(){return String.Join("\n",Names());}
    void Act(string name){lastAction=name;File.WriteAllText(Path.Combine(output,"progress.txt"),DateTime.UtcNow.ToString("o")+" "+name);object pattern=null;int kind=0;Wait(()=>{
        var all=root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.NameProperty,name));
        for(int i=0;i<all.Count;i++){var e=all[i];if(!e.Current.IsEnabled)continue;
            if(e.TryGetCurrentPattern(ExpandCollapsePattern.Pattern,out pattern)){kind=2;return true;}
            if(e.TryGetCurrentPattern(InvokePattern.Pattern,out pattern)){kind=1;return true;}
            if(e.TryGetCurrentPattern(SelectionItemPattern.Pattern,out pattern)){kind=3;return true;}
            if(e.TryGetCurrentPattern(TogglePattern.Pattern,out pattern)){kind=4;return true;}
        }return false;
    },"Enabled actionable control missing: "+name);
        if(kind==1)((InvokePattern)pattern).Invoke();else if(kind==2){var p=(ExpandCollapsePattern)pattern;if(p.Current.ExpandCollapseState==ExpandCollapseState.Expanded)p.Collapse();else p.Expand();}else if(kind==3)((SelectionItemPattern)pattern).Select();else ((TogglePattern)pattern).Toggle();
    }
    void Value(string name,string value){lastAction=name+" = "+value;object pattern=null;Wait(()=>{var all=root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.NameProperty,name));for(int i=0;i<all.Count;i++)if(all[i].Current.IsEnabled&&all[i].TryGetCurrentPattern(ValuePattern.Pattern,out pattern))return true;return false;},"Editable control missing: "+name);((ValuePattern)pattern).SetValue(value);}
    string ReadValue(string name){Check();var all=root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.NameProperty,name));for(int i=0;i<all.Count;i++){object value;if(all[i].TryGetCurrentPattern(ValuePattern.Pattern,out value))return ((ValuePattern)value).Current.Value;}return null;}
    IntPtr Dialog(){
        // HTML file inputs are hosted by a WebView descendant; Tauri Save/Open
        // dialogs belong to the app PID. Both must be in this exact owned job.
        var handles=new List<IntPtr>();var handle=InstalledTestNative.OpenJobObjectW(4,false,job);if(handle==IntPtr.Zero)throw InstalledTestNative.Error("OpenJobObjectW");
        try{InstalledTestNative.EnumDesktopWindows(InstalledTestNative.GetThreadDesktop(InstalledTestNative.GetCurrentThreadId()),(h,d)=>{if(InstalledTestNative.Class(h)=="#32770"&&InstalledTestNative.WindowInJob(h,handle))handles.Add(h);return true;},IntPtr.Zero);}finally{InstalledTestNative.CloseHandle(handle);}
        if(handles.Count>1)throw new Exception("Ambiguous owned native dialogs.");return handles.Count==1?handles[0]:IntPtr.Zero;
    }
    void Submit(InstalledSableResult r,string path,bool save){IntPtr d=IntPtr.Zero;Wait(()=>{d=Dialog();return d!=IntPtr.Zero;},"Native file dialog did not open.");var submission=InstalledDialogControl.Submit(d,path,save,job,desktop,seconds);r.submissions.Add(submission);if(!submission.closed||submission.error!=null)throw new Exception("Native submission failed: "+submission.error);if(save)Wait(()=>File.Exists(path),"Saved file not published: "+path);}
    string Save(InstalledSableResult r,string name,string command){var path=Path.Combine(output,name);Act(command);Submit(r,path,true);return path;}
    void MenuFor(string command){
        // Disclosure state can lag the DOM after a native dialog. Only the
        // actual command proves the menu is open. Retrying this reversible
        // disclosure is bounded and never retries Save, Apply or file input.
        lastAction="More commands -> "+command;int attempts=0;
        Wait(()=>{
            var target=Find(command);if(target!=null&&target.Current.IsEnabled)return true;
            var menu=Find("More commands");if(menu==null||!menu.Current.IsEnabled)return false;
            object expansion,invoke,toggle;
            menu.TryGetCurrentPattern(ExpandCollapsePattern.Pattern,out expansion);menu.TryGetCurrentPattern(TogglePattern.Pattern,out toggle);
            if(attempts++>=8)throw new Exception("Menu retry bound reached for "+command);
            var observed=command+": toggle="+(toggle==null?"none":((TogglePattern)toggle).Current.ToggleState.ToString())+", disclosure="+(expansion==null?"none":((ExpandCollapsePattern)expansion).Current.ExpandCollapseState.ToString());
            try{
                if(toggle!=null)((TogglePattern)toggle).Toggle();
                else if(expansion!=null)((ExpandCollapsePattern)expansion).Expand();
                else if(menu.TryGetCurrentPattern(InvokePattern.Pattern,out invoke))((InvokePattern)invoke).Invoke();
                else throw new Exception("Quiet menu pattern unavailable.");
            }
            catch(InvalidOperationException e){observed+="; "+e.Message;}
            if(menuObservations.Count<64)menuObservations.Add(observed);
            return false;
        },"Menu did not expose "+command);
    }
    string Export(InstalledSableResult r,string name){MenuFor("Export GLB");return Save(r,name,"Export GLB");}
    void PauseZero(){Wait(()=>Find("Pause")!=null||Find("Play")!=null,"Timeline missing.");if(Find("Pause")!=null)Act("Pause");Act("Reset");Wait(()=>Find("Play")!=null&&Text().Contains("0.00"),"Timeline did not pause/reset.");}
    void Source(InstalledSableResult r,string fixture){Act("Retarget clips");Submit(r,fixture,false);Wait(()=>Find("Apply transfer")!=null||Find("Review mapping")!=null,"Transfer analysis/preview did not settle.");}
    InstalledSableResult Execute(string motion,string ambiguous,int captureSeconds){var r=new InstalledSableResult();r.menuObservations=menuObservations;try{
        Act("Workspace: Model");Act("Animate");PauseZero();r.pausedAtZero=true;
        r.baseline=Export(r,"sable-baseline.glb");Act("Tools");Act("Transfer");
        r.stage="source-preview";Source(r,motion);Wait(()=>Find("Apply transfer")!=null,"Valid Sable motion did not preview.");
        Act("Mapping details");Wait(()=>Text().Contains("RIG_MAP_ANIMAL_REVIEW"),"Animal-chain review diagnostic absent.");r.suggestedUi=Text();r.animalSuggestions=true;
        r.suggestedMapping=Save(r,"suggested-mapping.json","Export reviewed mapping");
        r.stage="mapping-correction";Act("Retarget profile");
        var incorrect="{\"$schema\":\"rustsmf.retarget-profile.v1\",\"retarget\":{\"manualMap\":{\"FrontUpper_L\":\"ForeUpper_R\"}}}";
        var corrected=incorrect.Replace("ForeUpper_R","ForeUpper_L");Value("Profile JSON",incorrect);
        Wait(()=>Find("Apply transfer")==null&&ReadValue("Profile JSON")==incorrect,"Profile change did not invalidate preview.");r.correctionInvalidatedPreview=true;r.initialProfileReadback=ReadValue("Profile JSON");
        Value("Profile JSON",corrected);Wait(()=>ReadValue("Profile JSON")==corrected,"Corrected profile readback mismatch.");r.correctedProfileReadback=ReadValue("Profile JSON");
        r.correctionRoute="Public Profile JSON ValuePattern, then Retarget with profile; HTML select popup interaction remains unverified.";
        r.correctedProfile=Save(r,"corrected-profile.json","Export profile");Wait(()=>Find("Profile edits are not exported.")==null,"Corrected profile save did not settle.");
        Act("Retarget with profile");Submit(r,motion,false);Wait(()=>Find("Apply transfer")!=null,"Corrected mapping did not preview.");
        if(Find("Export reviewed mapping")==null)Act("Mapping details");
        r.correctedUi=Text();r.correctedMapping=Save(r,"corrected-mapping.json","Export reviewed mapping");r.correctionReviewed=true;
        r.stage="preview-inspection";if(Find("Pause")!=null)Act("Pause");var slider=Find("Preview time");object range;if(slider==null||!slider.TryGetCurrentPattern(RangeValuePattern.Pattern,out range))throw new Exception("Quiet preview timeline range unavailable.");((RangeValuePattern)range).SetValue(.5);
        Wait(()=>Find("Play")!=null&&Find("0.50")!=null&&((RangeValuePattern)range).Current.Value==.5,"Preview did not remain paused at midpoint.");r.previewAtMidpoint=true;r.previewUi=Text();
        r.previewExport=Export(r,"sable-during-preview.glb");
        if(captureSeconds>0){File.WriteAllText(Path.Combine(output,"preview-ready.json"),"{\"pid\":"+pid+",\"rendererHwnd\":"+renderer.ToInt64()+",\"phase\":0.5}");var hold=Stopwatch.StartNew();while(hold.Elapsed.TotalSeconds<captureSeconds&&!File.Exists(Path.Combine(output,"preview-release"))){Check();Thread.Sleep(100);}}
        r.stage="commit-transfer";Act("Apply transfer");Wait(()=>Find("Apply transfer")==null,"Apply did not clear preview.");r.applied=true;PauseZero();
        r.committed=Export(r,"sable-committed.glb");r.project=Save(r,"sable-transfer.rsproj","Save project");Wait(()=>Find("Saved RustSMF project snapshot atomically.")!=null,"Project save did not settle.");
        r.stage="reopen-project";MenuFor("Open Project");Act("Open Project");Submit(r,r.project,false);
        // Save Project preserves a snapshot; it does not erase authoring
        // history or its replacement guard. All live state here is test-owned
        // and saved, so explicitly confirm loading that exact owned snapshot.
        Wait(()=>Find("Discard unsaved changes?")!=null||(Text().Contains("Loaded:")&&Find("Workspace: Model")!=null),"Project replacement did not settle.");
        if(Find("Discard unsaved changes?")!=null){r.reopenWarningShown=true;Act("Discard and load");r.reopenConfirmedTaskSnapshot=true;}
        // The modern status intentionally shows only Loaded: <name>. The
        // independent output parser, not hidden status details, checks retained clips plus the transferred clip.
        Wait(()=>Text().Contains("Loaded:")&&Find("Workspace: Model")!=null,"Saved project did not reopen.");r.reopenedUi=Text();Act("Workspace: Model");Act("Animate");PauseZero();r.reopenedExport=Export(r,"sable-reopened.glb");r.reopened=true;
        r.stage="ambiguous-chain";if(Find("Transfer")==null)Act("Tools");Act("Transfer");Source(r,ambiguous);if(Find("Find bone")==null)Act("Mapping details");Value("Find bone","");Wait(()=>Text().Contains("RIG_MAP_ANIMAL_CHAIN_UNRESOLVED"),"Ambiguous chain was not reported unresolved.");r.ambiguousUi=Text();
        r.ambiguousMapping=Save(r,"ambiguous-mapping.json","Export reviewed mapping");r.ambiguousUnresolved=true;Act("Discard transfer");PauseZero();r.afterDiscard=Export(r,"sable-after-discard.glb");r.finalUi=Text();
        r.status="passed";r.stage="complete";
    }catch(Exception e){r.failedAction=lastAction;r.error=e.ToString();try{r.controlsAtStop=Names();}catch(Exception details){r.controlsError=details.ToString();}}return r;}
    public static InstalledSableResult Run(AutomationElement root,IntPtr renderer,int pid,string job,string desktop,int seconds,string output,string motion,string ambiguous,int captureSeconds){return new InstalledSableCase(root,renderer,pid,job,desktop,seconds,output).Execute(motion,ambiguous,captureSeconds);}
}
