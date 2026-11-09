using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace RamaEdit.Windows;

internal static class FileCommandIcons
{
    internal static FrameworkElement FolderLabel(string text) => Label(text, true);
    internal static FrameworkElement DiskLabel(string text) => Label(text, false);

    static FrameworkElement Label(string text, bool folder)
    {
        var drawing = new Canvas { Width = 22, Height = 22 };
        void Shape(string data, string fill, string? stroke = null) => drawing.Children.Add(new Path
        {
            Data = Geometry.Parse(data), Fill = (Brush)new BrushConverter().ConvertFromString(fill)!,
            Stroke = stroke is null ? null : (Brush)new BrushConverter().ConvertFromString(stroke)!, StrokeThickness = .8,
            StrokeLineJoin = PenLineJoin.Round
        });
        if (folder)
        {
            Shape("M1,5 V3 Q1,2 2,2 H8 L10,5 H19 Q20,5 20,6 V17 H1 Z", "#DCA323", "#B98016");
            Shape("M2,7 H21 L18,19 H0 Z", "#FFD54A", "#F3B528");
        }
        else
        {
            Shape("M2,1 H16 L21,6 V20 Q21,21 20,21 H2 Q1,21 1,20 V2 Q1,1 2,1 Z", "#2B8FFF", "#1657A0");
            Shape("M5,1 H16 V8 H5 Z", "#DDE8F4");
            Shape("M12,2 H15 V7 H12 Z", "#234D78");
            Shape("M5,12 H17 V21 H5 Z", "#F1F7FF");
            Shape("M7,15 H15 V16 H7 Z M7,18 H15 V19 H7 Z", "#9BB0C7");
        }
        var label = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
        label.Children.Add(new Viewbox { Child = drawing, Width = 20, Height = 20, Margin = new(0, 0, 6, 0) });
        label.Children.Add(new TextBlock { Text = text, VerticalAlignment = VerticalAlignment.Center });
        return label;
    }
}
