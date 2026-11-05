namespace RamaEdit.Core;

public readonly record struct WindowBounds(double Left, double Top, double Width, double Height)
{
    public double Right => Left + Width;
    public double Bottom => Top + Height;
}
public static class WindowGeometry
{
    public static WindowBounds Center(WindowBounds workArea, double preferredWidth, double preferredHeight, double margin = 16)
    {
        if (!double.IsFinite(workArea.Left) || !double.IsFinite(workArea.Top) ||
            !double.IsFinite(workArea.Width) || !double.IsFinite(workArea.Height) ||
            workArea.Width <= 0 || workArea.Height <= 0 ||
            !double.IsFinite(preferredWidth) || !double.IsFinite(preferredHeight) ||
            preferredWidth <= 0 || preferredHeight <= 0)
            throw new ArgumentOutOfRangeException(nameof(workArea));
        double padding = Math.Min(Math.Max(0, margin), Math.Min(workArea.Width, workArea.Height) / 4);
        double width = Math.Min(preferredWidth, workArea.Width - padding * 2);
        double height = Math.Min(preferredHeight, workArea.Height - padding * 2);
        return new(workArea.Left + (workArea.Width - width) / 2,
            workArea.Top + (workArea.Height - height) / 2, width, height);
    }
}
