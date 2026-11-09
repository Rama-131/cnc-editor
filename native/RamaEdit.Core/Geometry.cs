using System.Text.RegularExpressions;
using System.Globalization;

namespace RamaEdit.Core;

public record Point3(double X = 0, double Y = 0, double Z = 0)
{
    public double this[int i] => i == 0 ? X : i == 1 ? Y : Z;
    public Point3 With(int i, double value) => i == 0 ? this with { X = value } : i == 1 ? this with { Y = value } : this with { Z = value };
    public double Distance(Point3 p) => Math.Sqrt(Math.Pow(X - p.X, 2) + Math.Pow(Y - p.Y, 2) + Math.Pow(Z - p.Z, 2));
    public bool Valid => double.IsFinite(X) && double.IsFinite(Y) && double.IsFinite(Z) && Math.Max(Math.Max(Math.Abs(X), Math.Abs(Y)), Math.Abs(Z)) <= 1_000_000;
    public Point3 Offset(Point3? p) => p is null ? this : new(X + p.X, Y + p.Y, Z + p.Z);
}
public record Segment(Point3 From, Point3 To, bool Rapid, int Line, string? Origin, Point3? WorkShift)
{
    public int Motion { get; init; } = Rapid ? 0 : 1;
    public string? Action { get; init; }
}
public record SimulationStep(string Kind, int Line, string? Origin, Point3? WorkShift, double? SpindleLimit, Point3 Position, int SegmentCount, string? Action = null)
{
    public bool PositionKnown { get; init; } = true;
}
public record Issue(int Line, string Message);
public class SimulationResult
{
    public List<Segment> Segments { get; } = [];
    public List<SimulationStep> Steps { get; } = [];
    public List<Issue> Issues { get; } = [];
    public HashSet<string> Notes { get; } = [];
    public bool Complete => Issues.Count == 0;
    public double Distance { get; set; }
    public int OmittedMoves { get; set; }
}
public static partial class GCode
{
    [GeneratedRegex(@"([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))", RegexOptions.IgnoreCase)]
    public static partial Regex WordRegex();
    public static double Number(string value) => double.Parse(value, CultureInfo.InvariantCulture);
    public static string Clean(string text) => Regex.Replace(Regex.Replace(text, @"\([^)]*\)", ""), @";.*$", "").Trim().ToUpperInvariant();
    public static (List<double> G, List<double> M, Dictionary<string, double> V, bool Unique) Parse(string text)
    {
        var g = new List<double>(); var m = new List<double>(); var v = new Dictionary<string, double>(); var seen = new HashSet<string>(); bool unique = true;
        foreach (Match w in WordRegex().Matches(text))
        {
            string a = w.Groups[1].Value.ToUpperInvariant(); double n = Number(w.Groups[2].Value);
            if (!seen.Add(a)) unique = false;
            if (a == "G") g.Add(n); else if (a == "M") m.Add(n); else v[a] = n;
        }
        return (g, m, v, unique);
    }
    public static bool Syntax(string text) => WordRegex().IsMatch(text) && !Regex.IsMatch(WordRegex().Replace(text, ""), @"[^\s%]");
}
