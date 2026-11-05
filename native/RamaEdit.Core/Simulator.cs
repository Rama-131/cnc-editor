using System.Globalization;
using System.Text.RegularExpressions;

namespace RamaEdit.Core;

public static class Simulator
{
    public static SimulationResult Simulate(string source, string machine = "mill", bool diameter = true)
    {
        var r = new SimulationResult(); var pos = new Point3(); bool absolute = true, hasPosition = false, ended = false;
        double unit = 1; int motion = 0, plane = machine == "lathe" ? 18 : 17;
        string? origin = null; Point3? shift = null; double? spindleLimit = null; RoughingHeader? rough = null;
        void Fail(int line, string message) => r.Issues.Add(new(line, message));
        void State(string kind, int line, string? action = null) => r.Steps.Add(new(kind, line, origin, shift, spindleLimit, pos, r.Segments.Count, action));
        void Add(Point3 target, bool rapid, int line, string? action = null)
        {
            r.Distance += pos.Distance(target); r.Segments.Add(new(pos, target, rapid, line, origin, shift)); pos = target; hasPosition = true; State("motion", line, action);
        }
        var lines = source.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        for (int n = 0; n < lines.Length; n++)
        {
            int line = n + 1; string text = GCode.Clean(lines[n]);
            if (ended) break;
            if (text.Length == 0 || text == "%") continue;
            if (Regex.IsMatch(text, @"[#\[\]]|\b(IF|WHILE|GOTO)\b")) { Fail(line, "Macro o espressioni non simulate. Anteprima interrotta."); break; }
            if (text.StartsWith('/')) { Fail(line, "Blocco opzionale: esito dipendente dalla macchina. Anteprima interrotta."); break; }
            if (!GCode.Syntax(text)) { Fail(line, "Sintassi non supportata. Anteprima interrotta."); break; }
            var (gs, ms, v, unique) = GCode.Parse(text);
            bool Has(string keys) => keys.Split(',').Any(v.ContainsKey);
            bool Only(string keys) => v.Keys.All(keys.Split(',').Contains);
            double Val(string k, double fallback = 0) => v.GetValueOrDefault(k, fallback);
            if (rough is not null && !gs.Contains(71)) { Fail(rough.Line, "G71 non simulato: manca la seconda riga P/Q subito dopo U/R."); break; }
            if (gs.Contains(71) || gs.Contains(70))
            {
                string cycle = gs.Contains(71) ? "G71" : "G70";
                if (machine != "lathe" || plane != 18 || gs.Count != 1 || ms.Count > 0 || !unique || v.Values.Any(x => !double.IsFinite(x)))
                { Fail(line, $"{cycle} non simulato: richiesti Tornio, piano G18 e parametri numerici univoci in un blocco separato."); break; }
                if (cycle == "G71" && !Has("P,Q"))
                {
                    if (rough is not null || !Only("N,U,R") || Val("U") <= 0 || !v.ContainsKey("R") || Val("R") < 0 || Val("U") * unit > 1e6 || Val("R") * unit > 1e6)
                    { Fail(line, "G71 non simulato: prima riga attesa U positivo e R non negativo."); break; }
                    rough = new(Val("U") * unit, Val("R") * unit, line); State("auxiliary", line, "G71 · impostazione sgrossatura"); continue;
                }
                if ((cycle == "G71" && (rough is null || !Only("N,P,Q,U,W,F"))) || (cycle == "G70" && !Only("N,P,Q")))
                { Fail(line, $"{cycle} non simulato: parametri non supportati o prima riga U/R mancante."); break; }
                try
                {
                    if (cycle == "G71")
                    {
                        var plan = Turning.PlanG71(lines, n, pos, unit, diameter, Val("P"), Val("Q"), Val("U") * unit * (diameter ? .5 : 1), Val("W") * unit, rough!);
                        if (r.Segments.Count + plan.Moves.Count > 100000) throw new CycleException(line, "limite di 100.000 segmenti raggiunto.");
                        foreach (var move in plan.Moves) Add(move.To, move.Rapid, move.Line, move.Action);
                        State("auxiliary", line, $"G71 · completate {plan.Passes} passate"); n = plan.EndIndex;
                        r.Notes.Add("G71 tipo I esterno: passate geometriche, sovrametalli U/W e ritrazioni convenzionali a 45°; nessuna verifica di collisione o asportazione.");
                    }
                    else
                    {
                        var moves = Turning.PlanG70(lines, n, pos, unit, diameter, Val("P"), Val("Q"));
                        if (r.Segments.Count + moves.Count > 100000) throw new CycleException(line, "limite di 100.000 segmenti raggiunto.", "G70");
                        State("auxiliary", line, "G70 · richiamo profilo di finitura");
                        foreach (var move in moves) Add(move.To, move.Rapid, move.Line, move.Action);
                        State("auxiliary", line, "G70 · finitura completata");
                        r.Notes.Add("G70: profilo nominale senza sovrametalli; ritorno rapido rappresentato geometricamente.");
                    }
                }
                catch (CycleException e) { Fail(e.Line, e.Message); }
                rough = null; if (r.Issues.Count > 0) break; continue;
            }
            if (gs.Contains(10))
            {
                if (machine != "lathe" || gs.Count != 1 || ms.Count > 0 || Val("P", -1) != 0 || !unique || !Only("N,P,X,Z,U,W") || !Has("X,Z,U,W") || (Has("X") && Has("U")) || (Has("Z") && Has("W")))
                { Fail(line, "G10: supportato P0 sul tornio con X/Z assoluti o U/W incrementali, in un blocco separato."); break; }
                var previous = shift ?? new(); var next = previous; double xs = unit * (diameter ? .5 : 1);
                if (Has("X")) next = next with { X = Val("X") * xs };
                if (Has("Z")) next = next with { Z = Val("Z") * unit };
                if (Has("U")) next = next with { X = next.X + Val("U") * xs };
                if (Has("W")) next = next with { Z = next.Z + Val("W") * unit };
                var p = hasPosition ? pos with { X = pos.X - (next.X - previous.X), Z = pos.Z - (next.Z - previous.Z) } : pos;
                if (!next.Valid || !p.Valid) { Fail(line, "Spostamento G10 P0 non valido. Anteprima interrotta."); break; }
                pos = p; shift = next; State("origin", line); continue;
            }
            if (gs.Contains(92))
            {
                if (machine != "lathe" || gs.Count != 1 || ms.Count > 0 || !unique || !Only("N,S") || !(Val("S") > 0 && Val("S") <= 1e6))
                { Fail(line, "G92: supportato sul tornio solo S positivo per il limite giri, in un blocco separato."); break; }
                spindleLimit = Val("S"); State("auxiliary", line, $"Limite mandrino · {spindleLimit} giri/min"); continue;
            }
            double[] allowedG = [0, 1, 2, 3, 4, 17, 18, 19, 20, 21, 40, 49, 54, 55, 56, 57, 58, 59, 80, 90, 91, 94, 95, 96, 97, 98, 99];
            var badG = gs.Where(g => !allowedG.Contains(g) || (machine == "lathe" && (g == 90 || g == 91))).Cast<double?>().FirstOrDefault();
            if (badG is not null) { Fail(line, $"G{badG} non simulato. Anteprima interrotta."); break; }
            double[] allowedM = machine == "lathe" ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 19, 26, 30] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 19, 30];
            var badM = ms.Where(m => !allowedM.Contains(m)).Cast<double?>().FirstOrDefault();
            if (badM is not null) { Fail(line, $"M{badM} non simulato. Anteprima interrotta."); break; }
            if (!Only(machine == "lathe" ? "N,O,X,Y,Z,I,J,K,R,F,S,T,P,U,W" : "N,O,X,Y,Z,I,J,K,R,F,S,T,P"))
            { Fail(line, "Indirizzo non simulato. Anteprima interrotta."); break; }
            foreach (double g in gs)
            {
                if (g == 90) absolute = true; if (g == 91) absolute = false; if (g == 20) unit = 25.4; if (g == 21) unit = 1;
                if (g is 17 or 18 or 19) plane = (int)g; if (g <= 3) motion = (int)g; if (g == 80) motion = -1;
            }
            var origins = gs.Where(g => g >= 54 && g <= 59).Distinct().ToList();
            if (origins.Count > 1) { Fail(line, "Più origini pezzo nello stesso blocco. Anteprima interrotta."); break; }
            if (origins.Count == 1)
            {
                string next = "G" + origins[0].ToString(CultureInfo.InvariantCulture);
                if (next != origin) { pos = new(); hasPosition = false; origin = next; }
                State("origin", line);
            }
            if (gs.Contains(4)) continue;
            bool hasAxis = Has("X,Y,Z,U,W"), hasArc = motion is 2 or 3 && Has("I,J,K,R");
            if (hasAxis && motion == -1) { Fail(line, "Manca un comando di movimento dopo G80."); break; }
            if (machine == "lathe" && ((Has("X") && Has("U")) || (Has("Z") && Has("W"))))
            { Fail(line, "Quote assolute e incrementali dello stesso asse nel medesimo blocco."); break; }
            if (!hasAxis && !hasArc)
            {
                if (ms.Contains(26)) State("auxiliary", line, "Contropunta avanti · movimento non rappresentato");
                if (ms.Any(m => m is 2 or 30)) ended = true; continue;
            }
            var target = pos;
            string[] axes = ["X", "Y", "Z"];
            for (int i = 0; i < 3; i++) if (Has(axes[i])) target = target.With(i, (absolute ? 0 : pos[i]) + Val(axes[i]) * unit * (i == 0 && machine == "lathe" && diameter ? .5 : 1));
            if (machine == "lathe")
            {
                if (Has("U")) target = target with { X = pos.X + Val("U") * unit * (diameter ? .5 : 1) };
                if (Has("W")) target = target with { Z = pos.Z + Val("W") * unit };
            }
            if (!target.Valid) { Fail(line, "Coordinata non valida."); break; }
            if (motion < 2) Add(target, motion == 0, line);
            else
            {
                var (a, b, c, ia, ib) = plane == 17 ? (0, 1, 2, "I", "J") : plane == 18 ? (2, 0, 1, "K", "I") : (1, 2, 0, "J", "K");
                double sx = pos[a], sy = pos[b], ex = target[a], ey = target[b], cx, cy;
                if (Has("R"))
                {
                    double rr = Math.Abs(Val("R") * unit), dx = ex - sx, dy = ey - sy, chord = Math.Sqrt(dx * dx + dy * dy);
                    if (chord == 0 || chord > 2 * rr + 1e-6) { Fail(line, "Arco R impossibile: raggio insufficiente o cerchio completo senza centro."); break; }
                    double h = Math.Sqrt(Math.Max(0, rr * rr - chord * chord / 4)), side = (motion == 3 ? 1 : -1) * (Val("R") < 0 ? -1 : 1);
                    cx = (sx + ex) / 2 - side * dy / chord * h; cy = (sy + ey) / 2 + side * dx / chord * h;
                }
                else
                {
                    if (!Has(ia + "," + ib)) { Fail(line, $"Arco privo di centro {ia}/{ib} o raggio R."); break; }
                    cx = sx + Val(ia) * unit; cy = sy + Val(ib) * unit;
                }
                double radius = Math.Sqrt(Math.Pow(sx - cx, 2) + Math.Pow(sy - cy, 2)), endRadius = Math.Sqrt(Math.Pow(ex - cx, 2) + Math.Pow(ey - cy, 2));
                if (radius < 1e-8 || Math.Abs(radius - endRadius) > Math.Max(.01, radius * .001)) { Fail(line, "Centro e punto finale dell’arco non coerenti."); break; }
                double angle = Math.Atan2(sy - cy, sx - cx), sweep = Math.Atan2(ey - cy, ex - cx) - angle;
                if (motion == 3 && sweep <= 1e-10) sweep += Math.PI * 2; if (motion == 2 && sweep >= -1e-10) sweep -= Math.PI * 2;
                int count = Math.Min(2048, Math.Max(8, (int)Math.Ceiling(Math.Abs(sweep) * Math.Max(radius, 1) / .5))); var basis = pos;
                for (int j = 1; j <= count; j++)
                {
                    double t = (double)j / count;
                    var p = basis.With(a, cx + radius * Math.Cos(angle + sweep * t)).With(b, cy + radius * Math.Sin(angle + sweep * t)).With(c, basis[c] + (target[c] - basis[c]) * t);
                    Add(j == count ? target : p, false, line);
                }
            }
            if (ms.Any(m => m is 2 or 30)) ended = true;
            if (r.Segments.Count > 100000) { Fail(line, "Limite di 100.000 segmenti raggiunto. Riduci il programma."); break; }
        }
        if (rough is not null && r.Issues.Count == 0) Fail(rough.Line, "G71 non simulato: seconda riga P/Q mancante.");
        return r;
    }
}
