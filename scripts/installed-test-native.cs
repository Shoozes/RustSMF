using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class InstalledTestNative {
    public delegate bool EnumProc(IntPtr window, IntPtr data);
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct Startup {
        public int cb; public string reserved, desktop, title; public int x,y,xSize,ySize,xCount,yCount,fill,flags;
        public short show,reservedSize; public IntPtr reservedBytes,input,output,error;
    }
    [StructLayout(LayoutKind.Sequential)] public struct ProcessInfo { public IntPtr process,thread; public uint pid,tid; }
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits { public long processTime,jobTime; public uint flags; public UIntPtr min,max; public uint active; public UIntPtr affinity; public uint priority,scheduling; }
    [StructLayout(LayoutKind.Sequential)] struct Io { public ulong a,b,c,d,e,f; }
    [StructLayout(LayoutKind.Sequential)] struct Limits { public BasicLimits basic; public Io io; public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
    [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr CreateDesktopW(string name,IntPtr device,IntPtr mode,uint flags,uint access,IntPtr attributes);
    [DllImport("user32.dll",SetLastError=true)] public static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll",SetLastError=true)] public static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
    [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetUserObjectInformationW(IntPtr handle,int index,StringBuilder text,uint length,out uint needed);
    [DllImport("user32.dll")] public static extern IntPtr GetThreadDesktop(uint thread);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    [DllImport("user32.dll",SetLastError=true)] public static extern bool EnumDesktopWindows(IntPtr desktop,EnumProc callback,IntPtr data);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent,EnumProc callback,IntPtr data);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr window,StringBuilder text,int length);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr dialog,int id);
    [DllImport("user32.dll",SetLastError=true)] public static extern bool PostMessageW(IntPtr window,uint message,IntPtr wp,IntPtr lp);
    [DllImport("kernel32.dll",SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessW(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string directory,ref Startup startup,out ProcessInfo info);
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr security,string name);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr OpenJobObjectW(uint access,bool inherit,string name);
    [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool result);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int type,ref Limits limits,uint size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll",SetLastError=true)] public static extern bool TerminateJobObject(IntPtr job,uint code);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int type,IntPtr result,uint length,IntPtr returned);
    public static Exception Error(string api) { var code=Marshal.GetLastWin32Error();return new Win32Exception(code,api+" win32="+code+" "+new Win32Exception(code).Message); }
    public static string DesktopName(IntPtr handle) { var b=new StringBuilder(512);uint needed;if(handle==IntPtr.Zero || !GetUserObjectInformationW(handle,2,b,1024,out needed)) throw Error("GetUserObjectInformationW");return b.ToString(); }
    public static string InputName() { var h=OpenInputDesktop(0,false,0x41);if(h==IntPtr.Zero)throw Error("OpenInputDesktop");try{return DesktopName(h);}finally{CloseDesktop(h);} }
    public static string Class(IntPtr window) {var b=new StringBuilder(256);GetClassName(window,b,256);return b.ToString();}
    public static uint ExitCode(IntPtr process) {uint code;if(!GetExitCodeProcess(process,out code))throw Error("GetExitCodeProcess");return code;}
    public static bool WindowInJob(IntPtr window,IntPtr job) {uint pid;GetWindowThreadProcessId(window,out pid);var p=OpenProcess(0x1000,false,pid);if(p==IntPtr.Zero)return false;try{bool own;if(!IsProcessInJob(p,job,out own))throw Error("IsProcessInJob");return own;}finally{CloseHandle(p);}}
    public static IntPtr Job(string name) {var h=CreateJobObjectW(IntPtr.Zero,name);if(h==IntPtr.Zero)throw Error("CreateJobObjectW");var l=new Limits();l.basic.flags=0x2000;if(!SetInformationJobObject(h,9,ref l,(uint)Marshal.SizeOf(l))){var e=Error("SetInformationJobObject");CloseHandle(h);throw e;}return h;}
    public static int Active(IntPtr job) {var p=Marshal.AllocHGlobal(48);try{if(!QueryInformationJobObject(job,1,p,48,IntPtr.Zero))throw Error("QueryInformationJobObject");return Marshal.ReadInt32(p,40);}finally{Marshal.FreeHGlobal(p);}}
    public static ProcessInfo Launch(string app,string command,string desktop,string directory,IntPtr job) {
        var s=new Startup();s.cb=Marshal.SizeOf(s);s.desktop=desktop;s.flags=1;s.show=1;
        ProcessInfo p;if(!CreateProcessW(app,new StringBuilder(command),IntPtr.Zero,IntPtr.Zero,false,0x08000004,IntPtr.Zero,directory,ref s,out p))throw Error("CreateProcessW");
        try{if(job!=IntPtr.Zero && !AssignProcessToJobObject(job,p.process))throw Error("AssignProcessToJobObject");if(ResumeThread(p.thread)==0xffffffff)throw Error("ResumeThread");return p;}
        catch{TerminateProcess(p.process,1);CloseHandle(p.process);throw;}
        finally{CloseHandle(p.thread);}
    }
}
