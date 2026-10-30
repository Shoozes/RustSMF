using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.Threading;
using System.Windows.Automation;

public sealed class InstalledPickerResult {
    public string status="failed",stage="thread-desktop",error,desktop,creationTimeUtc,executable;
    public int pid,sessionId,rendererPid; public long appHwnd,rendererHwnd,dialogHwnd,cancelHwnd;
    public string rendererExecutable,rendererCreatedUtc;
    public bool pickerInvoked,pickerObserved,pickerCancelled;
    public string[] rendererControls;
    public InstalledDialogResult submission;
    public InstalledQueueResult queue;
}
public static class InstalledPickerProbe {
    public static void Own(IntPtr h,string jobName,string desktop) {
        uint actual;var thread=InstalledTestNative.GetWindowThreadProcessId(h,out actual);
        var actualDesktop=InstalledTestNative.DesktopName(InstalledTestNative.GetThreadDesktop(thread));
        var job=InstalledTestNative.OpenJobObjectW(4,false,jobName);if(job==IntPtr.Zero)throw InstalledTestNative.Error("OpenJobObjectW");
        try{if(!InstalledTestNative.IsWindow(h) || !InstalledTestNative.WindowInJob(h,job) || actualDesktop!=desktop)throw new Exception("Stale or foreign HWND/desktop: hwnd="+h+" pid="+actual+" desktop="+actualDesktop+" expected="+desktop);}
        finally{InstalledTestNative.CloseHandle(job);}
    }
    public static InstalledPickerResult Await(Thread thread,InstalledPickerResult result,int milliseconds) {
        if(thread.Join(milliseconds))return result;
        return new InstalledPickerResult {pid=result.pid,stage="uia-worker-timeout",error="Dedicated MTA UIA worker timed out; outer job must release process tree."};
    }
    public static InstalledPickerResult Run(int pid,string executable,string created,string desktop,string jobName,int seconds,string scenario,string fixture,string output) {
        var r=new InstalledPickerResult();r.pid=pid;
        var t=new Thread(()=>{
            try {
                r.desktop=InstalledTestNative.DesktopName(InstalledTestNative.GetThreadDesktop(InstalledTestNative.GetCurrentThreadId()));
                if(r.desktop!=desktop || InstalledTestNative.InputName()==desktop)throw new Exception("Worker is not on the selected non-input desktop.");
                var process=Process.GetProcessById(pid);r.creationTimeUtc=process.StartTime.ToUniversalTime().ToString("o");r.executable=process.MainModule.FileName;r.sessionId=process.SessionId;
                if(r.creationTimeUtc!=created || !String.Equals(r.executable,executable,StringComparison.OrdinalIgnoreCase))throw new Exception("App process identity changed.");
                r.stage="renderer";IntPtr app=IntPtr.Zero,renderer=IntPtr.Zero;var timer=Stopwatch.StartNew();
                while(timer.Elapsed.TotalSeconds<seconds && renderer==IntPtr.Zero) {
                    process.Refresh();if(process.HasExited)throw new Exception("Installed app exited before renderer observation.");
                    var own=new List<IntPtr>();
                    InstalledTestNative.EnumDesktopWindows(InstalledTestNative.GetThreadDesktop(InstalledTestNative.GetCurrentThreadId()),(h,d)=>{uint p;InstalledTestNative.GetWindowThreadProcessId(h,out p);if(p==pid && InstalledTestNative.Class(h)!="#32770")own.Add(h);return true;},IntPtr.Zero);
                    foreach(var h in own)InstalledTestNative.EnumChildWindows(h,(child,d)=>{if(InstalledTestNative.Class(child)=="Chrome_RenderWidgetHostHWND"){app=h;renderer=child;}return true;},IntPtr.Zero);
                    if(renderer==IntPtr.Zero)Thread.Sleep(200);
                }
                if(renderer==IntPtr.Zero)throw new TimeoutException("No owned WebView renderer on isolated desktop; picker not invoked.");
                r.appHwnd=app.ToInt64();r.rendererHwnd=renderer.ToInt64();Own(app,jobName,desktop);Own(renderer,jobName,desktop);
                uint rendererPid;InstalledTestNative.GetWindowThreadProcessId(renderer,out rendererPid);var rendererProcess=Process.GetProcessById((int)rendererPid);
                r.rendererPid=(int)rendererPid;r.rendererExecutable=rendererProcess.MainModule.FileName;r.rendererCreatedUtc=rendererProcess.StartTime.ToUniversalTime().ToString("o");
                r.stage="uia-open-control";var root=AutomationElement.FromHandle(renderer);
                AutomationElement button=null;timer.Restart();
                while(timer.Elapsed.TotalSeconds<seconds) {
                    Own(renderer,jobName,desktop);
                    button=root.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.NameProperty,"Open asset"));
                    if(button!=null && button.Current.IsEnabled)break;
                    Thread.Sleep(200);
                }
                var all=root.FindAll(TreeScope.Descendants,Condition.TrueCondition);var names=new List<string>();
                for(int i=0;i<all.Count;i++)if(names.Count<256 && !String.IsNullOrWhiteSpace(all[i].Current.Name))names.Add(all[i].Current.Name);
                r.rendererControls=names.ToArray();
                if(button==null || !button.Current.IsEnabled)throw new Exception("Open asset UIA control unavailable; picker not invoked.");
                Own(renderer,jobName,desktop);if(InstalledTestNative.InputName()==desktop)throw new Exception("Isolated desktop became input desktop.");
                r.stage="picker-open";r.pickerInvoked=true;((InvokePattern)button.GetCurrentPattern(InvokePattern.Pattern)).Invoke();
                IntPtr dialog=IntPtr.Zero;timer.Restart();
                while(timer.Elapsed.TotalSeconds<seconds && dialog==IntPtr.Zero) {
                    InstalledTestNative.EnumDesktopWindows(InstalledTestNative.GetThreadDesktop(InstalledTestNative.GetCurrentThreadId()),(h,d)=>{uint p;InstalledTestNative.GetWindowThreadProcessId(h,out p);if(p==pid && InstalledTestNative.Class(h)=="#32770")dialog=h;return true;},IntPtr.Zero);
                    if(dialog==IntPtr.Zero)Thread.Sleep(100);
                }
                if(dialog==IntPtr.Zero)throw new TimeoutException("No owned native picker on selected desktop.");
                Own(dialog,jobName,desktop);r.dialogHwnd=dialog.ToInt64();r.pickerObserved=true;r.stage="picker-cancel";
                if(scenario!="PickerCancel") {
                    r.stage="filename-open";r.submission=InstalledDialogControl.Submit(dialog,fixture,false,jobName,desktop,seconds);
                    if(!r.submission.closed)throw new Exception("Native filename/Open did not close the picker; see submission readback.");
                    r.stage="model-load";timer.Restart();
                    while(timer.Elapsed.TotalSeconds<seconds) {
                        Own(renderer,jobName,desktop);
                        var tools=root.FindFirst(TreeScope.Descendants,new PropertyCondition(AutomationElement.NameProperty,"Tools"));
                        if(tools!=null && tools.Current.IsEnabled){
                            if(scenario=="QueueWriteRetry"){r.queue=InstalledQueueCase.Run(root,renderer,pid,jobName,desktop,seconds,output,fixture);r.status=r.queue.status;r.stage=r.queue.stage;}
                            else{r.status="passed";r.stage="fixture-loaded";}
                            return;
                        }
                        Thread.Sleep(100);
                    }
                    throw new TimeoutException("Fixture selection returned but model did not load.");
                }
                var cancelHandle=IntPtr.Zero;timer.Restart();
                while(timer.Elapsed.TotalSeconds<seconds && cancelHandle==IntPtr.Zero){cancelHandle=InstalledTestNative.GetDlgItem(dialog,2);if(cancelHandle==IntPtr.Zero)Thread.Sleep(100);}
                if(cancelHandle==IntPtr.Zero || InstalledTestNative.Class(cancelHandle)!="Button")throw new Exception("Native IDCANCEL button unavailable.");
                Own(cancelHandle,jobName,desktop);r.cancelHwnd=cancelHandle.ToInt64();
                // WM_COMMAND/IDCANCEL is posted to the exact owned dialog, never physical input.
                if(!InstalledTestNative.PostMessageW(dialog,0x111,new IntPtr(2),cancelHandle))throw InstalledTestNative.Error("PostMessageW/IDCANCEL");
                timer.Restart();while(InstalledTestNative.IsWindow(dialog) && timer.Elapsed.TotalSeconds<seconds)Thread.Sleep(100);
                if(InstalledTestNative.IsWindow(dialog))throw new TimeoutException("Native picker did not close after cancel.");
                r.pickerCancelled=true;r.stage="complete";r.status="passed";
            }catch(Exception e){r.error=e.ToString();}
        });
        t.SetApartmentState(ApartmentState.MTA);t.IsBackground=true;t.Start();
        return Await(t,r,(seconds*(scenario=="QueueWriteRetry"?20:4)+10)*1000);
    }
}
