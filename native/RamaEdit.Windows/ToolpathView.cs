using System.Globalization;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using RamaEdit.Core;
using Point = System.Windows.Point;
namespace RamaEdit.Windows;

public class ToolpathView : FrameworkElement
{
    SimulationResult result = new(); public SimulationResult Result { get => result; set { result = value; Reset(); } }
    public int StepIndex { get; set; } = -1; public string View { get; set; } = "XZ"; public bool ShowRapids { get; set; } = true;
    public bool ShowLegend { get; set; } = true;
    public Brush RapidBrush { get; set; } = new SolidColorBrush((Color)ColorConverter.ConvertFromString(AppearancePalette.Defaults()["rapid"]));
    public Brush WorkingBrush { get; set; } = new SolidColorBrush((Color)ColorConverter.ConvertFromString(AppearancePalette.Defaults()["cut"]));
    public Brush ClockwiseBrush { get; set; } = new SolidColorBrush((Color)ColorConverter.ConvertFromString(AppearancePalette.Defaults()["cw"]));
    public Brush CounterclockwiseBrush { get; set; } = new SolidColorBrush((Color)ColorConverter.ConvertFromString(AppearancePalette.Defaults()["ccw"]));
    double zoom = 1; Vector pan; Point? drag; Point center; double scale = 1;
    public ToolpathView() { ClipToBounds = true; Focusable = true; MinHeight = 140; Cursor = Cursors.Hand; ToolTip = "Trascina per spostare · Rotella per zoomare · Doppio clic per centrare"; }
    Point Project(Point3 p) => View switch { "XY" => new(p.X, -p.Y), "XZ" => new(p.Z, -p.X), "YZ" => new(p.Y, -p.Z), _ => new((p.X - p.Y) * .866, (p.X + p.Y) * .5 - p.Z) };
    Point Screen(Point3 p) { var q = Project(p); return new((q.X - center.X) * scale * zoom + ActualWidth / 2 + pan.X, (q.Y - center.Y) * scale * zoom + ActualHeight / 2 + pan.Y); }
    public void Reset() { zoom = 1; pan = new(); Fit(); InvalidateVisual(); }
    public void Zoom(double factor, Point? pointer = null)
    {
        double next = Math.Clamp(zoom * factor, .05, 500), ratio = next / zoom; Point p = pointer ?? new(ActualWidth / 2, ActualHeight / 2);
        pan = new((p.X - ActualWidth / 2) * (1 - ratio) + pan.X * ratio, (p.Y - ActualHeight / 2) * (1 - ratio) + pan.Y * ratio); zoom = next; InvalidateVisual();
    }
    void Fit()
    {
        var points = result.Segments.SelectMany(s => new[] { s.From.Offset(s.WorkShift), s.To.Offset(s.WorkShift) }).Concat(result.Steps.Select(s => new Point3().Offset(s.WorkShift))).DefaultIfEmpty(new Point3()).Select(Project).ToList();
        double minX = points.Min(p => p.X), maxX = points.Max(p => p.X), minY = points.Min(p => p.Y), maxY = points.Max(p => p.Y);
        center = new((minX + maxX) / 2, (minY + maxY) / 2); scale = Math.Min(Math.Max(50, ActualWidth - 100) / Math.Max(maxX - minX, 1), Math.Max(50, ActualHeight - 100) / Math.Max(maxY - minY, 1));
    }
    protected override void OnRenderSizeChanged(SizeChangedInfo sizeInfo) { base.OnRenderSizeChanged(sizeInfo); Fit(); }
    void Text(DrawingContext dc, string text, Point at, Brush brush, double size = 12) => dc.DrawText(new FormattedText(text, CultureInfo.CurrentCulture, FlowDirection.LeftToRight, new Typeface("Segoe UI"), size, brush, VisualTreeHelper.GetDpi(this).PixelsPerDip), at);
    protected override void OnRender(DrawingContext dc)
    {
        dc.DrawRectangle(new SolidColorBrush(Color.FromRgb(19, 29, 36)), null, new Rect(RenderSize));
        var grid = new Pen(new SolidColorBrush(Color.FromRgb(28, 41, 49)), .7);
        for (double x = 0; x < ActualWidth; x += 24) dc.DrawLine(grid, new(x, 0), new(x, ActualHeight));
        for (double y = 0; y < ActualHeight; y += 24) dc.DrawLine(grid, new(0, y), new(ActualWidth, y));
        var step = StepIndex >= 0 && StepIndex < result.Steps.Count ? result.Steps[StepIndex] : null;
        int done = step?.SegmentCount ?? result.Segments.Count;
        var brushes = new[] { WorkingBrush, ClockwiseBrush, CounterclockwiseBrush };
        var cuts = brushes.Select(b => new Pen(b, 1.8)).ToArray();
        var future = brushes.Select(b => { var faded = b.Clone(); faded.Opacity = .38; return new Pen(faded, 1); }).ToArray();
        var rapid = new Pen(RapidBrush, 1.2) { DashStyle = DashStyles.Dash };
        for (int i = 0; i < result.Segments.Count; i++)
        {
            var s = result.Segments[i]; if (s.Rapid && !ShowRapids) continue;
            int kind = s.Motion == 2 ? 1 : s.Motion == 3 ? 2 : 0;
            dc.DrawLine(s.Rapid ? rapid : i < done ? cuts[kind] : future[kind], Screen(s.From.Offset(s.WorkShift)), Screen(s.To.Offset(s.WorkShift)));
        }
        var shift = step?.WorkShift; Point zero = Screen(new Point3().Offset(shift)); var yellow = Brushes.Gold;
        dc.DrawLine(new(yellow, 1), zero - new Vector(7, 0), zero + new Vector(7, 0)); dc.DrawLine(new(yellow, 1), zero - new Vector(0, 7), zero + new Vector(0, 7));
        Text(dc, "0 " + (step?.Origin ?? (step?.WorkShift is not null ? "G10 P0" : "")), zero + new Vector(-14, -25), yellow, 15);
        if (step is not null && step.PositionKnown) dc.DrawEllipse(Brushes.PaleGreen, new(Brushes.SeaGreen, 4), Screen(step.Position.Offset(shift)), 4, 4);
        Text(dc, View == "3D" ? "VISTA ISOMETRICA" : "PIANO " + View, new(12, 10), Brushes.LightSteelBlue, 10);
        Text(dc, "Coordinate locali · mm · " + (step?.Origin ?? (step?.WorkShift is not null ? "G10 P0" : "origine non indicata")), new(12, 27), Brushes.SlateGray, 11);
        if (ShowLegend)
        {
            double y = Math.Max(50, ActualHeight - 18);
            dc.DrawLine(new Pen(RapidBrush, 1.3) { DashStyle = DashStyles.Dash }, new(12, y + 7), new(33, y + 7));
            Text(dc, "Rapido", new(39, y), RapidBrush, 11);
            dc.DrawLine(new Pen(WorkingBrush, 1.8), new(100, y + 7), new(121, y + 7));
            Text(dc, "Lineare", new(127, y), WorkingBrush, 11);
            dc.DrawLine(new Pen(ClockwiseBrush, 1.8), new(185, y + 7), new(206, y + 7));
            Text(dc, "G2", new(212, y), ClockwiseBrush, 11);
            dc.DrawLine(new Pen(CounterclockwiseBrush, 1.8), new(245, y + 7), new(266, y + 7));
            Text(dc, "G3", new(272, y), CounterclockwiseBrush, 11);
        }
        Point axis = new(Math.Max(40, ActualWidth - 80), Math.Max(80, ActualHeight - 30));
        void Arrow(Vector direction, string label)
        {
            var color = AxisColors.For(label[^1]);
            var end = axis + direction; dc.DrawLine(new(color, 2.6), axis, end); var u = direction; u.Normalize(); var v = new Vector(-u.Y, u.X);
            var head = new StreamGeometry(); using (var c = head.Open()) { c.BeginFigure(end, true, true); c.LineTo(end - u * 9 + v * 4, true, false); c.LineTo(end - u * 9 - v * 4, true, false); }
            dc.DrawGeometry(color, null, head);
            Text(dc, label, end + new Vector(direction.X >= 0 ? 3 : -24, direction.Y < 0 ? -22 : -8), color, 15);
        }
        if (View == "3D") { Arrow(new(28, 15), "+X"); Arrow(new(-28, 15), "+Y"); Arrow(new(0, -35), "+Z"); }
        else { Arrow(new(0, -35), View == "XZ" ? "+X" : View == "YZ" ? "+Z" : "+Y"); Arrow(new(38, 0), View == "XZ" ? "+Z" : View == "YZ" ? "+Y" : "+X"); }
        dc.DrawEllipse(Brushes.WhiteSmoke, null, axis, 3, 3);
    }
    protected override void OnMouseWheel(MouseWheelEventArgs e) { Zoom(Math.Pow(1.15, e.Delta / 120d), e.GetPosition(this)); e.Handled = true; }
    protected override void OnMouseLeftButtonDown(MouseButtonEventArgs e) { if (e.ClickCount == 2) Reset(); else { drag = e.GetPosition(this); CaptureMouse(); Cursor = Cursors.SizeAll; } e.Handled = true; }
    protected override void OnMouseMove(MouseEventArgs e) { if (drag is Point previous && IsMouseCaptured) { Point now = e.GetPosition(this); pan += now - previous; drag = now; InvalidateVisual(); } }
    protected override void OnMouseLeftButtonUp(MouseButtonEventArgs e) { drag = null; ReleaseMouseCapture(); Cursor = Cursors.Hand; }
}
