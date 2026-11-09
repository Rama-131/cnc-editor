namespace RamaEdit.Core;

public static class LathePath
{
    const double E = 1e-8;
    public static Point3 Target(Point3 startPoint, IReadOnlyDictionary<string, double> v, double unit, bool diameter, int line, bool absolute = true)
    {
        bool x = v.ContainsKey("X") || v.ContainsKey("U"), z = v.ContainsKey("Z") || v.ContainsKey("W");
        if (v.ContainsKey("X") && v.ContainsKey("U") || v.ContainsKey("Z") && v.ContainsKey("W")) throw new CycleException(line, "X/U o Z/W simultanei.", "G1");
        double xs = unit * (diameter ? .5 : 1);
        var to = startPoint with
        {
            X = v.ContainsKey("X") ? (absolute ? 0 : startPoint.X) + v["X"] * xs : startPoint.X + v.GetValueOrDefault("U") * xs,
            Z = v.ContainsKey("Z") ? (absolute ? 0 : startPoint.Z) + v["Z"] * unit : startPoint.Z + v.GetValueOrDefault("W") * unit
        };
        if (v.TryGetValue("A", out double degrees))
        {
            if (x == z) throw new CycleException(line, "A richiede una sola quota X/U oppure Z/W.", "G1");
            double angle = degrees * Math.PI / 180, direction = x ? Math.Sin(angle) : Math.Cos(angle);
            double length = (x ? to.X - startPoint.X : to.Z - startPoint.Z) / direction;
            if (Math.Abs(direction) < E || !double.IsFinite(length) || length <= E) throw new CycleException(line, "angolo A incompatibile con quota e direzione.", "G1");
            to = x ? to with { Z = startPoint.Z + length * Math.Cos(angle) } : to with { X = startPoint.X + length * Math.Sin(angle) };
        }
        if (!to.Valid) throw new CycleException(line, "coordinate fuori limite.", "G1");
        return to;
    }
    public static List<(Point3 Point, int Motion)> Corner(Point3 from, Point3 corner, Point3 next, double radius, double chamfer, int line)
    {
        void Fail(string text) => throw new CycleException(line, text, "G1");
        double a = from.Distance(corner), b = corner.Distance(next);
        if (radius < 0 || chamfer < 0 || radius > 0 && chamfer > 0 || a < E || b < E) Fail("raccordo R/smusso C non valido.");
        double ix = (corner.X - from.X) / a, iz = (corner.Z - from.Z) / a, ox = (next.X - corner.X) / b, oz = (next.Z - corner.Z) / b;
        double angle = Math.Acos(Math.Clamp(ix * ox + iz * oz, -1, 1));
        if (angle < E || Math.PI - angle < E) Fail("spigolo collineare o inversione di direzione.");
        if (chamfer > 0 && Math.Abs(angle - Math.PI / 2) > 1e-6) Fail("C supportato per smussi tra tratti ortogonali.");
        double trim = chamfer > 0 ? chamfer : radius * Math.Tan(angle / 2);
        if (trim > a + E || trim > b + E) Fail("raccordo/smusso troppo grande per i tratti disponibili.");
        var begin = corner with { X = corner.X - ix * trim, Z = corner.Z - iz * trim };
        var end = corner with { X = corner.X + ox * trim, Z = corner.Z + oz * trim };
        var result = new List<(Point3, int)> { (begin, 1) };
        if (chamfer > 0) { result.Add((end, 1)); return result; }
        int sign = Math.Sign(ix * oz - iz * ox);
        double cx = begin.X - iz * radius * sign, cz = begin.Z + ix * radius * sign;
        double start = Math.Atan2(begin.Z - cz, begin.X - cx), sweep = Math.Atan2(end.Z - cz, end.X - cx) - start;
        if (sign > 0 && sweep <= 0) sweep += Math.PI * 2; if (sign < 0 && sweep >= 0) sweep -= Math.PI * 2;
        int count = Math.Min(2048, Math.Max(8, (int)Math.Ceiling(Math.Abs(sweep) * radius / .25)));
        for (int i = 1; i <= count; i++)
        {
            double t = start + sweep * i / count;
            result.Add((i == count ? end : corner with { X = cx + radius * Math.Cos(t), Z = cz + radius * Math.Sin(t) }, sign > 0 ? 2 : 3));
        }
        return result;
    }
    public static (int From, int To) Range(string[] lines, double p, double q, int call)
    {
        if (p <= 0 || q <= 0 || p != Math.Truncate(p) || q != Math.Truncate(q)) throw new CycleException(call + 1, "P/Q devono essere numeri N interi positivi.");
        var from = new List<int>(); var to = new List<int>();
        for (int i = 0; i < lines.Length; i++)
        {
            var w = ProgramTools.Words(lines[i]).FirstOrDefault();
            if (w?.Letter == "N") { if (w.Value == p) from.Add(i); if (w.Value == q) to.Add(i); }
        }
        if (from.Count != 1 || to.Count != 1 || to[0] <= from[0] || to[0] - from[0] > 10000) throw new CycleException(call + 1, "profilo P/Q mancante, ambiguo o fuori ordine.");
        return (from[0], to[0]);
    }
    public static List<CycleMove> Profile(string[] lines, int from, int to, Point3 start, double unit, bool diameter, string system)
    {
        for (int i = from; i <= to; i++)
        {
            var (gs, ms, v, _) = GCode.Parse(GCode.Clean(lines[i]));
            if (gs.Any(g => g is not (0 or 1 or 2 or 3 or 40 or 41 or 42)) || ms.Count > 0 || v.Keys.Any(k => !"N,X,Z,U,W,I,K,A,R,C,F,S".Split(',').Contains(k)))
                throw new CycleException(i + 1, "profilo P/Q: ammessi G0/G1/G2/G3, quote X/Z/U/W, angoli A, raccordi R e smussi C.");
        }
        string seed = FormattableString.Invariant($"{(unit == 1 ? "G21" : "G20")}\nG0 X{start.X / unit * (diameter ? 2 : 1):R} Z{start.Z / unit:R}\n");
        var result = Simulator.Simulate(seed + string.Join("\n", lines[from..(to + 1)]), "lathe", diameter, system);
        if (!result.Complete)
        {
            var issue = result.Issues[0]; throw new CycleException(Math.Max(from + 1, issue.Line + from - 2), issue.Message);
        }
        return result.Segments.Where(s => s.Line > 2).Select(s => new CycleMove(s.To, s.Rapid, s.Line + from - 2, "profilo nominale") { Motion = s.Motion }).ToList();
    }
    public static FanucPlan Rough(string[] lines, int call, Point3 start, double unit, bool diameter, string system, int code, IReadOnlyDictionary<string, double> v, IReadOnlyDictionary<string, double> header)
    {
        void Fail(string text) => throw new CycleException(call + 1, text, "G" + code);
        var (from, to) = Range(lines, v.GetValueOrDefault("P"), v.GetValueOrDefault("Q"), call);
        if (from <= call) Fail("il profilo P/Q deve seguire il richiamo.");
        var nominal = Profile(lines, from, to, start, unit, diameter, system);
        if (nominal.Count < 2) Fail("profilo incompleto.");
        double ax = v.GetValueOrDefault("U") * unit * (diameter ? .5 : 1), az = v.GetValueOrDefault("W") * unit;
        var profile = nominal.Select(m => m with { To = m.To with { X = m.To.X + ax, Z = m.To.Z + az } }).ToList();
        if (code is 71 or 72)
        {
            var first = GCode.Parse(GCode.Clean(lines[from])).V;
            bool firstX = first.ContainsKey("X") || first.ContainsKey("U"), firstZ = first.ContainsKey("Z") || first.ContainsKey("W");
            if (code == 71 ? !firstX || firstZ : !firstZ || firstX) Fail("tipo I: il primo blocco deve specificare soltanto X/U per G71 o Z/W per G72. Tipo II non calcolato.");
        }
        var moves = new List<CycleMove>(); Point3 pos = start;
        void Emit(Point3 point, bool rapid, int line, string action, int motion = 1)
        {
            if (!point.Valid || moves.Count >= 100000) Fail("limite di coordinate o segmenti raggiunto.");
            if (point.Distance(pos) > E) moves.Add(new(point, rapid, line, $"G{code} · {action}") { Motion = rapid ? 0 : motion }); pos = point;
        }
        if (code == 73)
        {
            double reliefX = header.GetValueOrDefault("U") * unit, reliefZ = header.GetValueOrDefault("W") * unit, count = header.GetValueOrDefault("R");
            if (count < 1 || count > 1000 || count != Math.Truncate(count)) Fail("R prima riga deve essere un numero di passate tra 1 e 1000.");
            for (int p = 1; p <= (int)count; p++)
            {
                double fraction = 1 - p / count;
                foreach (var m in profile) Emit(m.To with { X = m.To.X + reliefX * fraction, Z = m.To.Z + reliefZ * fraction }, m == profile[0] && m.Rapid, m.Line, $"ripetizione {p}/{count}", m.Motion);
                double side = Math.Sign(start.X - profile[0].To.X), clearance = side >= 0 ? Math.Max(start.X, profile.Max(m => m.To.X)) + Math.Abs(reliefX) : Math.Min(start.X, profile.Min(m => m.To.X)) - Math.Abs(reliefX);
                Emit(pos with { X = clearance }, true, call + 1, "ritiro"); Emit(start with { X = clearance }, true, call + 1, "ritorno"); Emit(start, true, call + 1, "ritorno");
            }
            return new(moves, to, "G73: ripetizioni geometriche con riduzione uniforme di U/W; forma del grezzo non modellata.");
        }
        int depthAxis = code == 72 ? 2 : 0, feedAxis = code == 72 ? 0 : 2;
        double direction = Math.Sign(start[depthAxis] - profile[0].To[depthAxis]);
        if (direction == 0) Fail("punto iniziale sul profilo: manca il sovrametallo da sgrossare.");
        double min = direction * profile[0].To[depthAxis], stock = direction * start[depthAxis], previousDepth = min, previousFeed = profile[0].To[feedAxis];
        foreach (var m in profile)
        {
            double d = direction * m.To[depthAxis], f = m.To[feedAxis];
            // A monotone contour may leave the stock/start-radius envelope:
            // for an internal cycle its tail can return into the existing bore.
            // That is an air-cut/exit, not a type-II pocket. Each roughing pass
            // is still stopped at its first intersection with the contour.
            if (d < previousDepth - E || f > previousFeed + E) Fail("profilo non monotono: le tasche tipo II richiedono un formato e un grezzo dedicati.");
            previousDepth = d; previousFeed = f;
        }
        double depth = header.GetValueOrDefault(code == 72 ? "W" : "U") * unit, retract = header.GetValueOrDefault("R") * unit;
        if (depth <= 0 || retract < 0) Fail("profondità positiva e ritiro R non negativo richiesti.");
        double passes = Math.Ceiling((stock - min) / depth - E);
        if (passes < 1 || passes > 1000) Fail("numero di passate fuori limite (1–1000).");
        for (int p = 1; p <= (int)passes; p++)
        {
            double at = Math.Max(min, stock - p * depth), stop = profile[^1].To[feedAxis];
            for (int i = 1; i < profile.Count; i++)
            {
                var a = profile[i - 1].To; var b = profile[i].To;
                if (direction * b[depthAxis] > at + E) { stop = a[feedAxis] + (b[feedAxis] - a[feedAxis]) * (at - direction * a[depthAxis]) / (direction * (b[depthAxis] - a[depthAxis])); break; }
            }
            string action = $"passata {p}/{passes}";
            Emit(start.With(depthAxis, direction * at), profile[0].Rapid, call + 1, action);
            Emit(start.With(depthAxis, direction * at).With(feedAxis, stop), false, call + 1, action);
            Emit(pos.With(depthAxis, pos[depthAxis] + direction * retract).With(feedAxis, stop + retract), true, call + 1, "ritrazione");
            Emit(start.With(depthAxis, pos[depthAxis]), true, call + 1, "ritorno");
        }
        foreach (var m in profile) Emit(m.To, m == profile[0] && m.Rapid, m.Line, "profilo con sovrametallo", m.Motion);
        double clear = direction > 0 ? Math.Max(start[depthAxis], profile.Max(m => m.To[depthAxis])) + retract : Math.Min(start[depthAxis], profile.Min(m => m.To[depthAxis])) - retract;
        Emit(pos.With(depthAxis, clear), true, call + 1, "ritiro"); Emit(start.With(depthAxis, clear), true, call + 1, "ritorno"); Emit(start, true, call + 1, "ritorno");
        return new(moves, to, $"G{code} tipo I: sgrossatura geometrica di profilo monotono, incluso il profilo ad archi; grezzo e collisioni non modellati.", (int)passes);
    }
}
