using System.Windows.Media;
using ICSharpCode.AvalonEdit.Document;
using ICSharpCode.AvalonEdit.Rendering;
using RamaEdit.Core;
namespace RamaEdit.Windows;

public class GCodeColorizer : DocumentColorizingTransformer
{
    public Dictionary<string, string> Palette { get; set; } = AppearancePalette.Defaults();
    public bool UseMotionColors { get; set; } = true;
    public string Machine { get; set; } = "mill";
    public string LatheSystem { get; set; } = "A";
    object? cachedVersion; List<(int From, int To, string Color)> spans = [];
    public void Invalidate() => cachedVersion = null;
    void Build(TextDocument document)
    {
        if (ReferenceEquals(cachedVersion, document.Version)) return; cachedVersion = document.Version; spans.Clear();
        var text = document.Text;
        var kinds = UseMotionColors ? EditorMotion.Classify(text, Machine, LatheSystem) : null;
        var lineStarts = new List<int> { 0 };
        for (int i = 0; i < text.Length; i++) if (text[i] == '\n' || text[i] == '\r' && (i + 1 == text.Length || text[i + 1] != '\n')) lineStarts.Add(i + 1);
        int lineIndex = 0;
        foreach (var w in ProgramTools.Words(text))
        {
            while (lineIndex + 1 < lineStarts.Count && lineStarts[lineIndex + 1] <= w.From) lineIndex++;
            var kind = kinds is null ? MotionColorKind.None : kinds[lineIndex];
            string key = kind switch
            {
                MotionColorKind.Rapid => "rapid",
                MotionColorKind.Working => "cut",
                MotionColorKind.Clockwise => "cw",
                MotionColorKind.Counterclockwise => "ccw",
                _ => w.Letter switch { "G" => "g", "M" => "m", "T" or "H" => "tool", _ => "" }
            };
            if (key.Length > 0) spans.Add((w.From, w.From + w.Length, key));
            else { spans.Add((w.From, w.From + 1, "axis")); spans.Add((w.From + 1, w.From + w.Length, "value")); }
        }
        int start = -1, depth = 0; bool semi = false; char quote = '\0';
        for (int i = 0; i < text.Length; i++)
        {
            char c = text[i];
            if (semi && c is '\r' or '\n') { spans.Add((start, i, "comment")); semi = false; start = -1; }
            if (semi) continue;
            if (depth > 0) { if (c == '(') depth++; else if (c == ')' && --depth == 0) { spans.Add((start, i + 1, "comment")); start = -1; } continue; }
            if (quote != '\0') { if (c == quote) quote = '\0'; continue; }
            if (c is '"' or '\'') quote = c;
            else if (c == '(') { start = i; depth = 1; }
            else if (c == ';') { start = i; semi = true; }
        }
        if (start >= 0) spans.Add((start, text.Length, "comment"));
        spans.Sort((a, b) => a.From.CompareTo(b.From));
    }
    protected override void ColorizeLine(DocumentLine line)
    {
        Build(CurrentContext.Document); int start = line.Offset, end = line.EndOffset;
        int lo = 0, hi = spans.Count;
        while (lo < hi) { int mid = (lo + hi) / 2; if (spans[mid].To <= start) lo = mid + 1; else hi = mid; }
        for (int i = lo; i < spans.Count && spans[i].From < end; i++)
        {
            var s = spans[i]; int from = Math.Max(start, s.From), to = Math.Min(end, s.To); if (from >= to) continue;
            var brush = (SolidColorBrush)new BrushConverter().ConvertFromString(Palette[s.Color])!; brush.Freeze();
            ChangeLinePart(from, to, visual => visual.TextRunProperties.SetForegroundBrush(brush));
        }
    }
}
public class ExecutionLine : IBackgroundRenderer
{
    public int Line { get; set; }
    public Brush Background { get; set; } = new SolidColorBrush(Color.FromArgb(150, 22, 75, 115));
    public KnownLayer Layer => KnownLayer.Background;
    public void Draw(TextView textView, DrawingContext context)
    {
        if (Line <= 0 || Line > textView.Document.LineCount) return;
        var segment = textView.Document.GetLineByNumber(Line);
        foreach (var rect in BackgroundGeometryBuilder.GetRectsForSegment(textView, segment))
            context.DrawRectangle(Background, null, new System.Windows.Rect(0, rect.Y, textView.ActualWidth, rect.Height));
    }
}
