using System;
using System.IO;
using System.Diagnostics;
using System.Collections.Generic;
using System.Threading;
using System.Windows.Automation;
using System.Security.Cryptography;

public sealed class InstalledQueueResult {
    public string status="failed",stage="queue-controls",error,outputA,outputB,hashA,hashB,beforeFailureUi,failedUi,afterRetryUi;
    public string outputAModifiedTicks;public bool obstructionReleased,nativeWriteFailure,completedOutputUnchanged,retrySucceeded;
    public string obstructionPath,obstructionError,failedStageCopy;public bool obstructionAcquired;
    public bool dirtyBeforeFailure,dirtyAfterFailure,pausedAtZero;public string liveExport;
    public string[] controlsAtStop;public string controlsError;public List<InstalledDialogResult> destinations=new List<InstalledDialogResult>();
}
public sealed class InstalledQueueCase {
    sealed class StageObstruction : IDisposable {
        readonly object gate=new object();readonly FileSystemWatcher watcher;readonly string directory;readonly int pid;
        FileStream held;bool closed;public string path,error;
        public StageObstruction(string output,int pid){directory=Path.GetFullPath(output);this.pid=pid;watcher=new FileSystemWatcher(directory,".rustsmf-export-"+pid+"-*.tmp");watcher.IncludeSubdirectories=false;watcher.Created+=Capture;watcher.EnableRaisingEvents=true;}
        void Capture(object sender,FileSystemEventArgs e){lock(gate){if(closed||held!=null)return;try{
            var p=Path.GetFullPath(e.FullPath);if(!String.Equals(Path.GetDirectoryName(p),directory,StringComparison.OrdinalIgnoreCase))throw new Exception("Staged path escaped owned output.");
            if(!System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(p),"^\\.rustsmf-export-"+pid+"-[0-9]+\\.tmp$"))throw new Exception("Foreign staged path.");
            held=new FileStream(p,FileMode.Open,FileAccess.Read,FileShare.ReadWrite);path=p;
        }catch(Exception ex){error=ex.ToString();}}}
        public bool Acquired{get{lock(gate){return held!=null;}}}
        public void Dispose(){lock(gate){closed=true;watcher.EnableRaisingEvents=false;if(held!=null){held.Dispose();held=null;}watcher.Dispose();}}
    }
    AutomationElement root;readonly IntPtr renderer;readonly int pid,seconds;readonly string job,desktop;
    InstalledQueueCase(AutomationElement root,IntPtr renderer,int pid,string job,string desktop,int seconds){this.root=root;this.renderer=renderer;this.pid=pid;this.job=job;this.desktop=desktop;this.seconds=seconds;}
    void Check(){InstalledPickerProbe.Own(renderer,job,desktop);if(InstalledTestNative.InputName()==desktop)throw new Exception("Test desktop became input desktop.");root=AutomationElement.FromHandle(renderer);}
    AutomationElement Find(string name){Check();return root.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.NameProperty,name));}
    void Wait(Func<bool> ready,string message){var watch=Stopwatch.StartNew();while(watch.Elapsed.TotalSeconds<seconds){Check();if(ready())return;Thread.Sleep(100);}throw new TimeoutException(message);}
    string[] Names(){Check();var all=root.FindAll(TreeScope.Descendants,Condition.TrueCondition);var list=new List<string>();for(int i=0;i<all.Count && list.Count<512;i++)if(!String.IsNullOrEmpty(all[i].Current.Name))list.Add(all[i].Current.Name);return list.ToArray();}
    void Act(string name){object pattern=null;int kind=0;Wait(()=>{
        var matches=root.FindAll(TreeScope.Descendants,name=="Export queue"?Condition.TrueCondition:new PropertyCondition(AutomationElement.NameProperty,name));
        for(int i=0;i<matches.Count;i++){var e=matches[i];if(!e.Current.IsEnabled || (name=="Export queue" && !e.Current.Name.StartsWith("Export queue")))continue;
            if(e.TryGetCurrentPattern(InvokePattern.Pattern,out pattern)){kind=1;return true;}
            if(e.TryGetCurrentPattern(ExpandCollapsePattern.Pattern,out pattern)){kind=2;return true;}
            if(e.TryGetCurrentPattern(SelectionItemPattern.Pattern,out pattern)){kind=3;return true;}
            if(e.TryGetCurrentPattern(TogglePattern.Pattern,out pattern)){kind=4;return true;}
        }return false;
    },"Enabled actionable control missing: "+name);
        if(kind==1)((InvokePattern)pattern).Invoke();else if(kind==2)((ExpandCollapsePattern)pattern).Expand();else if(kind==3)((SelectionItemPattern)pattern).Select();else ((TogglePattern)pattern).Toggle();
    }
    IntPtr Dialog(){IntPtr found=IntPtr.Zero;InstalledTestNative.EnumDesktopWindows(InstalledTestNative.GetThreadDesktop(InstalledTestNative.GetCurrentThreadId()),(h,d)=>{uint p;InstalledTestNative.GetWindowThreadProcessId(h,out p);if(p==pid && InstalledTestNative.Class(h)=="#32770")found=h;return true;},IntPtr.Zero);return found;}
    void Save(InstalledQueueResult result,string path){IntPtr d=IntPtr.Zero;Wait(()=>{d=Dialog();return d!=IntPtr.Zero;},"Native destination did not open.");var submission=InstalledDialogControl.Submit(d,path,true,job,desktop,seconds);result.destinations.Add(submission);if(!submission.closed || submission.error!=null)throw new Exception("Native destination submission failed: "+submission.error);}
    static string Hash(string path){using(var sha=SHA256.Create())using(var file=File.OpenRead(path))return BitConverter.ToString(sha.ComputeHash(file)).Replace("-","").ToLowerInvariant();}
    static void SameA(InstalledQueueResult r){if(Hash(r.outputA)!=r.hashA || File.GetLastWriteTimeUtc(r.outputA).Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture)!=r.outputAModifiedTicks)throw new Exception("Completed item A was rewritten.");}
    void DirtyCheck(string fixture){
        Act("Open asset");IntPtr dialog=IntPtr.Zero;Wait(()=>{dialog=Dialog();return dialog!=IntPtr.Zero;},"Dirty-state probe picker missing.");
        var submission=InstalledDialogControl.Submit(dialog,fixture,false,job,desktop,seconds);
        if(!submission.closed)throw new Exception("Dirty-state probe did not submit fixture.");
        Wait(()=>Find("Discard unsaved changes?")!=null,"Expected dirty-state replacement refusal was absent.");
        Act("Cancel");Wait(()=>Find("Discard unsaved changes?")==null,"Dirty-state cancellation did not settle.");
    }
    void EditLive(){
        Act("Close supporting panel");Act("Workspace: Export");Act("Model");Act("Tools");Act("Scene");
        if(Find("Objects")!=null)Act("Objects");
        AutomationElement mesh=null;
        Wait(()=>{var all=root.FindAll(TreeScope.Descendants,Condition.TrueCondition);for(int i=0;i<all.Count;i++)if(all[i].Current.Name.StartsWith("mesh_0") && all[i].Current.ControlType==ControlType.Button){object pattern;if(all[i].TryGetCurrentPattern(InvokePattern.Pattern,out pattern)){mesh=all[i];return true;}}return false;},"First loaded mesh control missing.");
        ((InvokePattern)mesh.GetCurrentPattern(InvokePattern.Pattern)).Invoke();
        object valuePattern=null;Wait(()=>{var all=root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.NameProperty,"Rename selected"));for(int i=0;i<all.Count;i++)if(all[i].Current.IsEnabled && all[i].TryGetCurrentPattern(ValuePattern.Pattern,out valuePattern))return true;return false;},"Actionable rename input missing.");
        ((ValuePattern)valuePattern).SetValue("queue-live-edited");Act("Rename object");
        Wait(()=>String.Join("\n",Names()).Contains("queue-live-edited"),"Live edit did not appear.");
        Act("Close supporting panel");
    }
    InstalledQueueResult Execute(string output,string fixture){var r=new InstalledQueueResult();StageObstruction obstruction=null;
        try {
            // Make the intended captured pose explicit. The imported Wave clip
            // starts at its bind pose; animation data remains included in full.
            Act("Workspace: Model");Act("Animate");Wait(()=>Find("Pause")!=null||Find("Play")!=null,"Timeline did not appear.");
            if(Find("Pause")!=null)Act("Pause");Act("Reset");
            Wait(()=>Find("Play")!=null&&Find("0.00")!=null,"Playback did not pause/reset to zero.");r.pausedAtZero=true;
            Act("Workspace: Animate");Act("Export");Act("Tools");Act("Export queue");
            Act("Add export to queue");Act("Add export to queue");r.beforeFailureUi=String.Join("\n",Names());
            r.stage="live-edit";EditLive();DirtyCheck(fixture);r.dirtyBeforeFailure=true;
            Act("Workspace: Model");Act("Export");Act("Tools");Act("Export queue");
            r.outputA=Path.Combine(output,"queue-a.glb");r.outputB=Path.Combine(output,"queue-b.glb");
            if(File.Exists(r.outputA)||File.Exists(r.outputB))throw new Exception("Owned output already exists.");
            r.stage="save-a";Act(Find("Export queued")!=null?"Export queued":"Retry incomplete");Save(r,r.outputA);Wait(()=>File.Exists(r.outputA),"A did not publish.");
            r.hashA=Hash(r.outputA);r.outputAModifiedTicks=File.GetLastWriteTimeUtc(r.outputA).Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture);
            // A new B destination avoids conflating overwrite-dialog refusal with
            // a native failure. Deny deletion of B's real staged output instead.
            obstruction=new StageObstruction(output,pid);
            r.stage="write-b-failure";Save(r,r.outputB);
            Wait(()=>Find("Retry incomplete")!=null,"Native write did not settle to an incomplete queue item.");
            r.failedUi=String.Join("\n",Names());
            r.obstructionAcquired=obstruction.Acquired;r.obstructionPath=obstruction.path;r.obstructionError=obstruction.error;
            if(!r.obstructionAcquired || !r.failedUi.Contains("Failed to install staged export") || !r.failedUi.Contains("Failed"))throw new Exception("No actual native publication-failure witness from owned staged-file obstruction.");
            r.nativeWriteFailure=true;SameA(r);
            if(File.Exists(r.outputB))throw new Exception("Failed publication installed B unexpectedly.");
            r.failedStageCopy=Path.Combine(output,"failed-native-stage.glb");File.Copy(r.obstructionPath,r.failedStageCopy,false);
            obstruction.Dispose();obstruction=null;r.obstructionReleased=true;
            // Native Drop could not unlink a deliberately locked stage; remove
            // only this exact recorded task-owned path after preserving its bytes.
            File.Delete(r.obstructionPath);
            Act("Close supporting panel");DirtyCheck(fixture);r.dirtyAfterFailure=true;
            Act("Tools");Act("Export queue");
            r.stage="retry-b";Act("Retry incomplete");Save(r,r.outputB);
            Wait(()=>Find("Retry incomplete")==null && Find("Cancel queue")==null && File.Exists(r.outputB) && new FileInfo(r.outputB).Length>100,"B retry did not finish.");
            SameA(r);r.completedOutputUnchanged=true;r.retrySucceeded=true;r.hashB=Hash(r.outputB);r.afterRetryUi=String.Join("\n",Names());
            r.stage="live-export";Act("Close supporting panel");Act("Export asset");
            r.liveExport=Path.Combine(output,"live-after-queue.glb");Save(r,r.liveExport);
            Wait(()=>File.Exists(r.liveExport),"Live authored model did not export after queue failure/retry.");
            r.status="passed";r.stage="complete";
        }catch(Exception e){r.error=e.ToString();try{r.controlsAtStop=Names();}catch(Exception inspection){r.controlsError=inspection.ToString();}}
        finally{if(obstruction!=null){obstruction.Dispose();r.obstructionReleased=true;}}
        return r;
    }
    public static InstalledQueueResult Run(AutomationElement root,IntPtr renderer,int pid,string job,string desktop,int seconds,string output,string fixture){return new InstalledQueueCase(root,renderer,pid,job,desktop,seconds).Execute(output,fixture);}
}
