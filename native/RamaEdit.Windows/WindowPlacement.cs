using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using RamaEdit.Core;

namespace RamaEdit.Windows;

internal static class WindowPlacement
{
    static readonly ConditionalWeakTable<Window, object> Initialized = new();
    [StructLayout(LayoutKind.Sequential)]
    struct NativeRect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    struct MonitorInfo { public int Size; public NativeRect Monitor, Work; public uint Flags; }
    [DllImport("user32.dll")] static extern nint MonitorFromWindow(nint window, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern bool GetMonitorInfo(nint monitor, ref MonitorInfo info);
    [DllImport("user32.dll")] static extern bool GetWindowRect(nint window, out NativeRect rect);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(nint window);
    [DllImport("user32.dll")] static extern bool SetWindowPos(nint window, nint after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern nint GetWindowLongPtr(nint window, int index);

    public static void SetInitialBounds(Window window, double preferredWidth, double preferredHeight)
    {
        var work = SystemParameters.WorkArea;
        var fit = WindowGeometry.Center(new(work.Left, work.Top, work.Width, work.Height), preferredWidth, preferredHeight);
        window.MinWidth = Math.Min(window.MinWidth, fit.Width);
        window.MinHeight = Math.Min(window.MinHeight, fit.Height);
        window.Width = fit.Width; window.Height = fit.Height;
        window.Left = fit.Left; window.Top = fit.Top;
        window.WindowStartupLocation = WindowStartupLocation.Manual;
    }
    public static void OnLoaded(object sender, RoutedEventArgs args)
    {
        if (sender is not Window window || Initialized.TryGetValue(window, out _)) return;
        Initialized.Add(window, new());
        EnsureVisible(window);
    }
    // Native coordinates include the complete caption, resize borders and buttons.
    // Use the actual monitor's work area rather than assuming a screen size or DPI.
    public static void EnsureVisible(Window window)
    {
        if (window.WindowState != WindowState.Normal) return;
        nint handle = new WindowInteropHelper(window).Handle;
        var info = new MonitorInfo { Size = Marshal.SizeOf<MonitorInfo>() };
        if (handle == 0 || !GetWindowRect(handle, out var rect) ||
            !GetMonitorInfo(MonitorFromWindow(handle, 2), ref info)) return;
        double scale = Math.Max(96, GetDpiForWindow(handle)) / 96d;
        var work = new WindowBounds(info.Work.Left, info.Work.Top, info.Work.Right - info.Work.Left, info.Work.Bottom - info.Work.Top);
        var fit = WindowGeometry.Center(work, rect.Right - rect.Left, rect.Bottom - rect.Top, 16 * scale);
        window.MinWidth = Math.Min(window.MinWidth, fit.Width / scale);
        window.MinHeight = Math.Min(window.MinHeight, fit.Height / scale);
        int width = Math.Max(1, (int)Math.Floor(fit.Width)), height = Math.Max(1, (int)Math.Floor(fit.Height));
        int x = Math.Clamp(rect.Left, info.Work.Left, info.Work.Right - width);
        int y = Math.Clamp(rect.Top, info.Work.Top, info.Work.Bottom - height);
        SetWindowPos(handle, 0, x, y, width, height, 0x0004 | 0x0010);
    }
    public static bool IsInsideWorkArea(Window window)
    {
        nint handle = new WindowInteropHelper(window).Handle;
        var info = new MonitorInfo { Size = Marshal.SizeOf<MonitorInfo>() };
        return GetWindowRect(handle, out var rect) && GetMonitorInfo(MonitorFromWindow(handle, 2), ref info) &&
            rect.Left >= info.Work.Left && rect.Top >= info.Work.Top &&
            rect.Right <= info.Work.Right && rect.Bottom <= info.Work.Bottom;
    }
    public static bool HasCaptionButtons(Window window)
    {
        const long required = 0x00C00000 | 0x00080000 | 0x00040000 | 0x00020000 | 0x00010000;
        long style = GetWindowLongPtr(new WindowInteropHelper(window).Handle, -16).ToInt64();
        return (style & required) == required;
    }
}
