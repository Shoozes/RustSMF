using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Threading;
using System.Windows.Automation;

public sealed class InstalledDialogResult {
    public long dialogHwnd,editHwnd,buttonHwnd,buttonParent;
    public string expected,readback,method,buttonName,error;
    public bool buttonEnabled,closed;public long textResult,clickDelivered;
}
public static class InstalledDialogControl {
    public static void Notify(IntPtr dialog,IntPtr button,int id,string job,string desktop) {
        InstalledPickerProbe.Own(dialog,job,desktop);InstalledPickerProbe.Own(button,job,desktop);
        if(!InstalledTestNative.IsWindowEnabled(button) || InstalledTestNative.GetDlgCtrlID(button)!=id)throw new Exception("Button identity/enabled state changed.");
        var parent=InstalledTestNative.GetParent(button);InstalledPickerProbe.Own(parent,job,desktop);
        if(parent!=dialog && !InstalledTestNative.IsChild(dialog,parent))throw new Exception("Button parent escaped dialog.");
        if(!InstalledTestNative.PostMessageW(parent,0x111,new IntPtr(id),button))throw InstalledTestNative.Error("PostMessageW/BN_CLICKED");
    }
    public static InstalledDialogResult Submit(IntPtr dialog,string path,bool save,string job,string desktop,int seconds) {
        var r=new InstalledDialogResult {dialogHwnd=dialog.ToInt64(),expected=Path.GetFullPath(path)};
        try {
            if(save && File.Exists(r.expected))throw new Exception("This bounded case requires a fresh save destination.");
            InstalledPickerProbe.Own(dialog,job,desktop);
            var root=AutomationElement.FromHandle(dialog);AutomationElement edit=null,button=null;var watch=Stopwatch.StartNew();
            while(watch.Elapsed.TotalSeconds<seconds && (edit==null || button==null)) {
                var all=root.FindAll(TreeScope.Descendants,Condition.TrueCondition);
                for(int i=0;i<all.Count;i++) {
                    var item=all[i];if(item.Current.ClassName=="Edit" && item.Current.AutomationId==(save?"1001":"1148"))edit=item;
                    if(item.Current.ClassName=="Button" && item.Current.AutomationId=="1")button=item;
                }
                if(edit==null || button==null)Thread.Sleep(100);
            }
            if(edit==null || button==null)throw new Exception("Exact filename edit or action button unavailable.");
            var eh=new IntPtr(edit.Current.NativeWindowHandle);var bh=new IntPtr(button.Current.NativeWindowHandle);
            InstalledPickerProbe.Own(eh,job,desktop);InstalledPickerProbe.Own(bh,job,desktop);
            r.editHwnd=eh.ToInt64();r.buttonHwnd=bh.ToInt64();r.buttonName=button.Current.Name;r.buttonEnabled=button.Current.IsEnabled;
            object pattern;IntPtr result;
            if(edit.TryGetCurrentPattern(ValuePattern.Pattern,out pattern)) {((ValuePattern)pattern).SetValue(r.expected);r.method="UIA ValuePattern";}
            else {if(InstalledTestNative.SendMessageTimeoutW(eh,12,IntPtr.Zero,r.expected,2,2000,out result)==IntPtr.Zero)throw InstalledTestNative.Error("WM_SETTEXT");r.textResult=result.ToInt64();r.method="WM_SETTEXT";}
            var text=new StringBuilder(32768);
            if(InstalledTestNative.SendMessageTimeoutW(eh,13,new IntPtr(text.Capacity),text,2,2000,out result)==IntPtr.Zero)throw InstalledTestNative.Error("WM_GETTEXT");
            r.readback=text.ToString();if(r.readback!=r.expected)throw new Exception("Filename readback differs; no Open/Save sent.");
            InstalledPickerProbe.Own(bh,job,desktop);
            // Native UIA Button.Invoke uses focus/SendInput on this host. Notify the
            // exact native button parent instead, entirely within the owned desktop.
            var parent=InstalledTestNative.GetParent(bh);r.buttonParent=parent.ToInt64();
            InstalledPickerProbe.Own(parent,job,desktop);
            if(parent!=dialog && !InstalledTestNative.IsChild(dialog,parent))throw new Exception("Button parent escaped the selected dialog.");
            var id=InstalledTestNative.GetDlgCtrlID(bh);
            if(id!=1)throw new Exception("Native Open/Save button ID changed.");
            Notify(dialog,bh,id,job,desktop);r.clickDelivered=1;r.method+=" + parent BN_CLICKED";
            watch.Restart();while(InstalledTestNative.IsWindow(dialog) && watch.Elapsed.TotalSeconds<seconds)Thread.Sleep(100);
            r.closed=!InstalledTestNative.IsWindow(dialog);
        }catch(Exception e){r.error=e.ToString();}
        return r;
    }
}
