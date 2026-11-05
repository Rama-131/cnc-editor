using System.Windows.Media;

namespace RamaEdit.Windows;

internal static class AxisColors
{
    public static readonly Brush X = Color("#FF626E");
    public static readonly Brush Y = Color("#39ED9A");
    public static readonly Brush Z = Color("#4DCBFF");

    static Brush Color(string value)
    {
        var brush = (SolidColorBrush)new BrushConverter().ConvertFromString(value)!;
        brush.Freeze();
        return brush;
    }
    public static Brush For(char axis) => axis switch
    {
        'X' => X, 'Y' => Y, 'Z' => Z, _ => throw new ArgumentOutOfRangeException(nameof(axis))
    };
}
