using System.Text.RegularExpressions;
namespace RamaEdit.Core;

public record RoughingHeader(double Depth, double Retract, int Line);
public record CycleMove(Point3 To, bool Rapid, int Line, string Action);
public record RoughingPlan(List<CycleMove> Moves, int EndIndex, int Passes);
public class CycleException(int line, string message, string cycle = "G71") : Exception($"{cycle} non simulato: {message}")
{ public int Line { get; } = line; }
public static class Turning
{
    const double E = 1e-7;
    record Vertex(Point3 Point, int Line, double Radius = 0, bool Rapid = false);
    static List<Vertex> Vertices(string[] lines, int from, int to, Point3 start, double unit, bool diameter)
    {
        var result = new List<Vertex>(); var pos = start;
        for (int i = from; i <= to; i++)
        {
            string text = GCode.Clean(lines[i]); if (text.Length == 0) continue;
            var matches = GCode.WordRegex().Matches(text);
            if (!GCode.Syntax(text) || matches.Select(m => m.Groups[1].Value).Distinct().Count() != matches.Count) throw new CycleException(i + 1, "sintassi del profilo non supportata.");
            var v = matches.ToDictionary(m => m.Groups[1].Value, m => GCode.Number(m.Groups[2].Value));
            bool Has(string k) => v.ContainsKey(k); double Val(string k) => v.GetValueOrDefault(k);
            if (v.Keys.Any(k => !new[] { "N", "G", "X", "Z", "A", "R", "F" }.Contains(k)) || v.Values.Any(n => !double.IsFinite(n))) throw new CycleException(i + 1, "il profilo deve contenere G0/G1, X/Z, A o raccordi R.");
            if (result.Count == 0)
            {
                if (!Has("G") || (Val("G") != 0 && Val("G") != 1) || !Has("X") || Has("Z") || Has("A") || Has("R")) throw new CycleException(i + 1, "il tipo I deve iniziare con G0/G1 e la sola quota X.");
            }
            else if (Has("G") && Val("G") != 1) throw new CycleException(i + 1, "sono supportati profili lineari tipo I; G2/G3 e tasche richiedono un altro interprete.");
            if (result.Count > 0 && !new[] { "X", "Z", "A", "R" }.Any(Has)) continue;
            var next = pos;
            if (Has("X")) next = next with { X = Val("X") * unit * (diameter ? .5 : 1) };
            if (Has("Z")) next = next with { Z = Val("Z") * unit };
            if (Has("A"))
            {
                if (Has("X") == Has("Z")) throw new CycleException(i + 1, "A richiede una sola quota X oppure Z.");
                double angle = Val("A") % 360 * Math.PI / 180, direction = Has("X") ? Math.Sin(angle) : Math.Cos(angle), length = (Has("X") ? next.X - pos.X : next.Z - pos.Z) / direction;
                if (Math.Abs(direction) < E || !double.IsFinite(length) || length <= E) throw new CycleException(i + 1, "angolo A incompatibile con la quota e il verso del profilo.");
                next = Has("X") ? next with { Z = pos.Z + length * Math.Cos(angle) } : next with { X = pos.X + length * Math.Sin(angle) };
            }
            if (!next.Valid || next.X < 0) throw new CycleException(i + 1, "quota del profilo non valida.");
            if (result.Count > 0 && (next.X < pos.X - E || next.Z > pos.Z + E)) throw new CycleException(i + 1, "supportata la sgrossatura esterna tipo I con X crescente e Z decrescente; tasche e inversioni non simulate.");
            double radius = Val("R") * unit;
            if (radius < 0 || radius > 1e6) throw new CycleException(i + 1, "raccordo R non valido.");
            if (result.Count == 0 || next.Distance(pos) > E || radius > 0) result.Add(new(next, i + 1, radius, Has("G") && Val("G") == 0));
            pos = next;
        }
        if (result.Count < 2) throw new CycleException(from + 1, "profilo incompleto.");
        return result;
    }
    static List<Vertex> Rounded(List<Vertex> vertices)
    {
        var trims = new double[vertices.Count];
        for (int i = 0; i < vertices.Count; i++)
        {
            var v = vertices[i]; if (v.Radius == 0) continue;
            if (i == 0 || i == vertices.Count - 1) throw new CycleException(v.Line, "R richiede un tratto prima e uno dopo lo spigolo.");
            var a = vertices[i - 1].Point; var b = v.Point; var c = vertices[i + 1].Point;
            double before = b.Distance(a), after = c.Distance(b);
            if (before < E || after < E) throw new CycleException(v.Line, "raccordo R su un tratto nullo.");
            double dot = ((b.X - a.X) * (c.X - b.X) + (b.Z - a.Z) * (c.Z - b.Z)) / (before * after), angle = Math.Acos(Math.Clamp(dot, -1, 1));
            if (angle < E || Math.PI - angle < E) throw new CycleException(v.Line, "raccordo R su tratti collineari.");
            trims[i] = v.Radius * Math.Tan(angle / 2);
        }
        for (int i = 1; i < vertices.Count; i++) if (trims[i - 1] + trims[i] > vertices[i].Point.Distance(vertices[i - 1].Point) + E) throw new CycleException(vertices[i].Line, "raccordi R troppo grandi per i tratti disponibili.");
        var points = new List<Vertex>();
        for (int i = 0; i < vertices.Count; i++)
        {
            var v = vertices[i];
            if (v.Radius == 0) { points.Add(v); continue; }
            var a = vertices[i - 1].Point; var b = v.Point; var c = vertices[i + 1].Point;
            double la = b.Distance(a), lb = c.Distance(b), ix = (b.X - a.X) / la, iz = (b.Z - a.Z) / la, ox = (c.X - b.X) / lb, oz = (c.Z - b.Z) / lb;
            var begin = b with { X = b.X - ix * trims[i], Z = b.Z - iz * trims[i] };
            var end = b with { X = b.X + ox * trims[i], Z = b.Z + oz * trims[i] };
            int sign = Math.Sign(ix * oz - iz * ox); double cx = begin.X - iz * v.Radius * sign, cz = begin.Z + ix * v.Radius * sign;
            double angle = Math.Atan2(begin.Z - cz, begin.X - cx), sweep = Math.Atan2(end.Z - cz, end.X - cx) - angle;
            if (sign > 0 && sweep <= 0) sweep += Math.PI * 2; if (sign < 0 && sweep >= 0) sweep -= Math.PI * 2;
            int count = Math.Min(512, Math.Max(8, (int)Math.Ceiling(Math.Abs(sweep) * v.Radius / .25)));
            if (points.Count + count + 1 > 100000) throw new CycleException(v.Line, "profilo raccordato oltre 100.000 segmenti.");
            points.Add(new(begin, v.Line));
            for (int j = 1; j <= count; j++)
            {
                double t = angle + sweep * j / count;
                points.Add(new(j == count ? end : b with { X = cx + v.Radius * Math.Cos(t), Z = cz + v.Radius * Math.Sin(t) }, v.Line));
            }
        }
        return points;
    }
    static (int From, int To) Range(string[] lines, double p, double q, int call, bool after)
    {
        void Fail(string msg) => throw new CycleException(call + 1, msg);
        if (p <= 0 || q <= 0 || p != Math.Truncate(p) || q != Math.Truncate(q)) Fail("P/Q devono essere numeri di blocco positivi.");
        var labels = lines.Select((l, i) => (Label: Regex.Match(GCode.Clean(l), @"^N\s*(\d+)(?![\d.])"), Index: i)).Where(x => x.Label.Success).Select(x => (Value: GCode.Number(x.Label.Groups[1].Value), x.Index)).ToList();
        var starts = labels.Where(x => x.Value == p).ToList(); var ends = labels.Where(x => x.Value == q).ToList();
        if (starts.Count != 1 || ends.Count != 1 || ends[0].Index <= starts[0].Index) { Fail($"profilo N{p}–N{q} mancante, ambiguo o fuori ordine."); return default; }
        int from = starts[0].Index, to = ends[0].Index;
        if (after ? from <= call : to >= call) Fail($"il profilo N{p}–N{q} deve trovarsi {(after ? "dopo il" : "prima del")} richiamo.");
        if (to - from > 10000) Fail("profilo oltre 10.000 blocchi."); return (from, to);
    }
    public static List<CycleMove> PlanG70(string[] lines, int call, Point3 start, double unit, bool diameter, double p, double q)
    {
        try
        {
            var (from, to) = Range(lines, p, q, call, false); var vertices = Vertices(lines, from, to, start, unit, diameter); var profile = Rounded(vertices);
            var moves = new List<CycleMove>(); var pos = start;
            void Emit(Point3 target, bool rapid, int line, string action) { if (target.Distance(pos) > E) moves.Add(new(target, rapid, line, action)); pos = target; }
            for (int i = 0; i < profile.Count; i++) Emit(profile[i].Point, i == 0 && vertices[0].Rapid, profile[i].Line, "G70 · finitura del profilo nominale");
            Emit(start, true, call + 1, "G70 · ritorno al punto iniziale"); return moves;
        }
        catch (CycleException e) { throw new CycleException(e.Line, e.Message.Replace("G71 non simulato: ", ""), "G70"); }
    }
    public static RoughingPlan PlanG71(string[] lines, int call, Point3 start, double unit, bool diameter, double p, double q, double ax, double az, RoughingHeader header)
    {
        void Fail(string msg) => throw new CycleException(call + 1, msg);
        if (ax < 0 || az < 0) Fail("U/W devono essere sovrametalli non negativi.");
        var (from, to) = Range(lines, p, q, call, true); var vertices = Vertices(lines, from, to, start, unit, diameter);
        var profile = Rounded(vertices).Select(v => v with { Point = v.Point with { X = v.Point.X + ax, Z = v.Point.Z + az } }).ToList();
        if (!start.Valid || start.X <= profile[0].Point.X + E || vertices[^1].Point.X > start.X + E) Fail("il punto iniziale X deve essere esterno al profilo e al sovrametallo.");
        double min = profile[0].Point.X; double passCount = Math.Ceiling((start.X - min) / header.Depth - E);
        if (!double.IsFinite(passCount) || passCount < 1 || passCount > 1000) Fail("numero di passate oltre il limite di 1000; verifica U.");
        int passes = (int)passCount; var moves = new List<CycleMove>(); var pos = start;
        void Emit(Point3 target, bool rapid, int line, string action)
        {
            if (!target.Valid) Fail("coordinate generate fuori limite.");
            if (target.Distance(pos) > E) { if (moves.Count >= 100000) Fail("limite di 100.000 segmenti raggiunto."); moves.Add(new(target, rapid, line, action)); }
            pos = target;
        }
        for (int pass = 1; pass <= passes; pass++)
        {
            double radius = Math.Max(min, start.X - pass * header.Depth), stopZ = profile[^1].Point.Z;
            for (int i = 1; i < profile.Count; i++)
            {
                var a = profile[i - 1].Point; var b = profile[i].Point;
                if (b.X > radius + E) { stopZ = a.Z + (b.Z - a.Z) * (radius - a.X) / (b.X - a.X); break; }
            }
            if (stopZ > start.Z + E) Fail("intersezione della passata con il profilo non valida.");
            string action = $"G71 · passata {pass}/{passes}";
            Emit(start with { X = radius }, vertices[0].Rapid, call + 1, action);
            Emit(start with { X = radius, Z = stopZ }, false, call + 1, action);
            Emit(start with { X = radius + header.Retract, Z = stopZ + header.Retract }, true, call + 1, action);
            Emit(start with { X = radius + header.Retract }, true, call + 1, action);
        }
        for (int i = 0; i < profile.Count; i++) Emit(profile[i].Point, i == 0 && vertices[0].Rapid, profile[i].Line, "G71 · profilo con sovrametallo");
        double clearance = Math.Max(start.X, pos.X) + header.Retract;
        Emit(pos with { X = clearance }, true, call + 1, "G71 · ritorno al punto iniziale"); Emit(start with { X = clearance }, true, call + 1, "G71 · ritorno al punto iniziale"); Emit(start, true, call + 1, "G71 · ritorno al punto iniziale");
        return new(moves, to, passes);
    }
}
