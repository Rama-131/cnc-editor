using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;

namespace RamaEdit.Windows;

internal static class NativeColorPicker
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct ChooseColorData
    {
        public uint Size;
        public nint Owner, Instance;
        public uint Result;
        public nint CustomColors;
        public uint Flags;
        public nint Data, Hook, Template;
    }
    [DllImport("comdlg32.dll", CharSet = CharSet.Unicode, EntryPoint = "ChooseColorW")]
    [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool ChooseColor(ref ChooseColorData data);
    [DllImport("comdlg32.dll")] static extern uint CommDlgExtendedError();
    static readonly int[] CustomColors = Enumerable.Repeat(0x00ffffff, 16).ToArray();

    public static string? Select(Window owner, string current)
    {
        var color = (Color)ColorConverter.ConvertFromString(current);
        nint memory = Marshal.AllocHGlobal(16 * sizeof(int));
        try
        {
            Marshal.Copy(CustomColors, 0, memory, 16);
            var data = new ChooseColorData
            {
                Size = (uint)Marshal.SizeOf<ChooseColorData>(),
                Owner = new WindowInteropHelper(owner).Handle,
                Result = (uint)(color.R | color.G << 8 | color.B << 16),
                CustomColors = memory, Flags = 0x00000001 | 0x00000002 | 0x00000100
            };
            if (!ChooseColor(ref data))
            {
                if (CommDlgExtendedError() != 0) throw new InvalidOperationException("Impossibile aprire il selettore colori di Windows.");
                return null;
            }
            Marshal.Copy(memory, CustomColors, 0, 16);
            return $"#{data.Result & 255:X2}{data.Result >> 8 & 255:X2}{data.Result >> 16 & 255:X2}";
        }
        finally { Marshal.FreeHGlobal(memory); }
    }
}
