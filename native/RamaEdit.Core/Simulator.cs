using System.Globalization;
using System.Text.RegularExpressions;

namespace RamaEdit.Core;

public static class Simulator
{
    public static SimulationResult Simulate(string source, string machine = "mill", bool diameter = true, string latheSystem = "A")
    {
        var r = new SimulationResult(); var pos = new Point3(); bool absolute = true, hasPosition = false, ended = false;
        if (machine == "lathe" && latheSystem is not ("A" or "B")) { r.Issues.Add(new(1, "Sistema di codici tornio non valido: scegliere Fanuc A oppure ISO G90/G91.")); return r; }
        var fanuc = new FanucCycles(); var profileHeaders = new Dictionary<int, Dictionary<string, double>>();
        double feed = 0; Point3 localShift = new(); Point3? programmedCorner = null; var unknownAxes = new HashSet<int>();
        double unit = 1; int motion = 0, plane = machine == "lathe" ? 18 : 17;
        string? origin = null; Point3? shift = null; double? spindleLimit = null; RoughingHeader? rough = null;
        void Fail(int line, string message) => r.Issues.Add(new(line, message));
        void State(string kind, int line, string? action = null) => r.Steps.Add(new(kind, line, origin, shift, spindleLimit, pos, r.Segments.Count, action) { PositionKnown = unknownAxes.Count == 0 });
        void Add(Point3 target, bool rapid, int line, string? action = null, int moveMotion = 1)
        {
            if (!target.Valid || r.Segments.Count >= 100000) throw new CycleException(line, "coordinate geometriche o numero di segmenti fuori limite.", "Movimento");
            r.Distance += pos.Distance(target); r.Segments.Add(new(pos, target, rapid, line, origin, shift) { Motion = rapid ? 0 : moveMotion, Action = action }); pos = target; hasPosition = true; State("motion", line, action);
        }
        var lines = source.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        var visibleLines = ProgramTools.VisibleCode(string.Join("\n", lines)).Split('\n');
        if (machine == "lathe" && Regex.IsMatch(string.Join("\n", visibleLines), @"G\s*0*(?:41|42)(?![\d.])")) r.Notes.Add("G41/G42: visualizzato il profilo programmato. Raggio/orientamento della punta e compensazione reale non applicati.");
        for (int n = 0; n < lines.Length; n++)
        {
            try
            {
            int line = n + 1; string text = visibleLines[n].Trim().ToUpperInvariant();
            if (ended) break;
            if (text.Length == 0 || text == "%" || Regex.IsMatch(text, @"^:\s*\d+$")) continue;
            if (Regex.IsMatch(text, @"[#\[\]]|\b(IF|WHILE|GOTO)\b")) { Fail(line, "Macro o espressioni non simulate. Anteprima interrotta."); break; }
            if (text.StartsWith('/')) { Fail(line, "Blocco opzionale: esito dipendente dalla macchina. Anteprima interrotta."); break; }
            if (!GCode.Syntax(text)) { Fail(line, "Sintassi non supportata. Anteprima interrotta."); break; }
            var (gs, ms, v, unique) = GCode.Parse(text);
            if (ms.Any(m => m is 2 or 30)) ended = true;
            bool Has(string keys) => keys.Split(',').Any(v.ContainsKey);
            bool Only(string keys) => v.Keys.All(keys.Split(',').Contains);
            double Val(string k, double fallback = 0) => v.GetValueOrDefault(k, fallback);
            if (v.Values.Any(x => !double.IsFinite(x)) || gs.Any(x => !double.IsFinite(x))) { Fail(line, "Valore numerico non finito."); break; }
            if (machine == "lathe")
            {
                var coordinates = GCode.WordRegex().Matches(text).Where(w => w.Groups[1].Value is not ("G" or "M")).Select(w => w.Groups[1].Value).ToList();
                if (coordinates.Count != coordinates.Distinct().Count()) { Fail(line, "Indirizzo duplicato nello stesso blocco."); break; }
                if (fanuc.HasHeader && !gs.Contains(fanuc.PendingCode)) { Fail(line, $"G{fanuc.PendingCode}: seconda riga del ciclo mancante."); break; }
                if (profileHeaders.Count > 0 && !gs.Contains(profileHeaders.Keys.First())) { Fail(line, "Seconda riga del ciclo G72/G73 mancante."); break; }
                var motionCodes = gs.Where(g => g is 0 or 1 or 2 or 3 or 32 or 33 or 34 || latheSystem == "A" && g is 90 or 92 or 94 || latheSystem != "A" && g is 77 or 78 or 79).ToList();
                bool conflict = motionCodes.Count > 1 || gs.Count(g => g is >= 80 and <= 89) > 1 || gs.Count(g => g is 17 or 18 or 19) > 1 || gs.Count(g => g is 20 or 21) > 1 || gs.Count(g => g is 40 or 41 or 42) > 1 || gs.Count(g => g is 96 or 97) > 1 || latheSystem != "A" && gs.Count(g => g is 90 or 91) > 1;
                if (conflict) { Fail(line, latheSystem == "A" && gs.Contains(90) ? "G90 nel Fanuc A è un ciclo: per quote assolute G90/G91 selezionare Tornio G90/91." : "Codici G incompatibili nello stesso gruppo modale."); break; }
                if (v.ContainsKey("F")) feed = Val("F");
                if (gs.Any(g => g is 0 or 1 or 2 or 3 or 32 or 33 or 34 or 70 or 71 or 72 or 73 or 80)) fanuc.Cancel();
            }
            if (rough is not null && !gs.Contains(71)) { Fail(rough.Line, "G71 non simulato: manca la seconda riga P/Q subito dopo U/R."); break; }
            if (machine == "lathe" && gs.Any(g => g is 72 or 73))
            {
                int code = (int)gs.First(g => g is 72 or 73);
                if (plane != 18 || gs.Count != 1 || ms.Count > 0 || !unique || unknownAxes.Count > 0) { Fail(line, $"G{code}: richiesti piano XZ, posizione nota e ciclo in un blocco separato."); break; }
                try
                {
                    if (!Has("P,Q"))
                    {
                        bool ok = code == 72 ? Only("N,W,R") && Has("R") && Val("W") > 0 && Val("R") >= 0 : Only("N,U,W,R") && Val("R") >= 1 && Val("R") == Math.Truncate(Val("R"));
                        if (!ok || profileHeaders.ContainsKey(code)) throw new CycleException(line, "prima riga non valida o seconda riga mancante.", "G" + code);
                        profileHeaders[code] = new(v); State("auxiliary", line, $"G{code} · impostazione ciclo"); continue;
                    }
                    if (!Only("N,P,Q,U,W,F,S,T") || !profileHeaders.Remove(code, out var header)) throw new CycleException(line, "manca la prima riga del ciclo.", "G" + code);
                    var plan = LathePath.Rough(visibleLines, n, pos, unit, diameter, latheSystem, code, v, header);
                    if (r.Segments.Count + plan.Moves.Count > 100000) throw new CycleException(line, "limite di 100.000 segmenti raggiunto.", "G" + code);
                    foreach (var move in plan.Moves) Add(move.To, move.Rapid, move.Line, move.Action, move.Motion);
                    if (plan.Note is not null) r.Notes.Add(plan.Note); n = plan.EndIndex!.Value;
                }
                catch (CycleException e) { Fail(e.Line, e.Message); break; }
                continue;
            }
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
                if ((cycle == "G71" && (rough is null || !Only("N,P,Q,U,W,F,S,T"))) || (cycle == "G70" && !Only("N,P,Q,F,S,T")))
                { Fail(line, $"{cycle} non simulato: parametri non supportati o prima riga U/R mancante."); break; }
                try
                {
                    if (cycle == "G71")
                    {
                        RoughingPlan plan;
                        try { plan = Turning.PlanG71(visibleLines, n, pos, unit, diameter, Val("P"), Val("Q"), Val("U") * unit * (diameter ? .5 : 1), Val("W") * unit, rough!); }
                        catch (CycleException)
                        {
                            var advanced = LathePath.Rough(visibleLines, n, pos, unit, diameter, latheSystem, 71, v, new Dictionary<string, double> { ["U"] = rough!.Depth / unit, ["R"] = rough.Retract / unit });
                            plan = new(advanced.Moves, advanced.EndIndex!.Value, advanced.Passes); if (advanced.Note is not null) r.Notes.Add(advanced.Note);
                        }
                        if (r.Segments.Count + plan.Moves.Count > 100000) throw new CycleException(line, "limite di 100.000 segmenti raggiunto.");
                        foreach (var move in plan.Moves) Add(move.To, move.Rapid, move.Line, move.Action, move.Motion);
                        State("auxiliary", line, $"G71 · completate {plan.Passes} passate"); n = plan.EndIndex;
                        r.Notes.Add("G71 tipo I: passate geometriche, sovrametalli U/W e ritrazioni convenzionali a 45°; nessuna verifica di collisione o asportazione.");
                    }
                    else
                    {
                        List<CycleMove> moves;
                        try { moves = Turning.PlanG70(visibleLines, n, pos, unit, diameter, Val("P"), Val("Q")); }
                        catch (CycleException)
                        {
                            var range = LathePath.Range(visibleLines, Val("P"), Val("Q"), n);
                                moves = LathePath.Profile(visibleLines, range.From, range.To, pos, unit, diameter, latheSystem).Select(m => m with { Action = "G70 · finitura del profilo nominale" }).ToList();
                            moves.Add(new(pos, true, line, "G70 · ritorno al punto iniziale"));
                        }
                        if (r.Segments.Count + moves.Count > 100000) throw new CycleException(line, "limite di 100.000 segmenti raggiunto.", "G70");
                        State("auxiliary", line, "G70 · richiamo profilo di finitura");
                        foreach (var move in moves) Add(move.To, move.Rapid, move.Line, move.Action, move.Motion);
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
            if (machine == "lathe" && gs.Any(g => g is 22 or 23))
            {
                if (gs.Count != 1 || !Only("N,X,Y,Z,I,J,K") || gs.Contains(23) && Has("X,Y,Z,I,J,K")) { Fail(line, "G22/G23: formato dei limiti di corsa non supportato."); break; }
                r.Notes.Add("G22/G23: impostazione controllo corsa riconosciuta; limiti macchina e collisioni non verificati."); State("auxiliary", line, "Controllo corsa macchina"); continue;
            }
            if (machine == "lathe" && gs.Contains(52))
            {
                if (gs.Count != 1 || !Only("N,X,Y,Z") || !Has("X,Y,Z")) { Fail(line, "G52: specificare la traslazione locale X/Y/Z in un blocco separato."); break; }
                var next = localShift with { X = Has("X") ? Val("X") * unit * (diameter ? .5 : 1) : localShift.X, Y = Has("Y") ? Val("Y") * unit : localShift.Y, Z = Has("Z") ? Val("Z") * unit : localShift.Z };
                var delta = new Point3(next.X - localShift.X, next.Y - localShift.Y, next.Z - localShift.Z); var shifted = (shift ?? new Point3()).Offset(delta);
                var moved = hasPosition ? pos with { X = pos.X - delta.X, Y = pos.Y - delta.Y, Z = pos.Z - delta.Z } : pos;
                if (!next.Valid || !shifted.Valid || !moved.Valid) { Fail(line, "G52: coordinate fuori limite."); break; }
                shift = shifted; pos = moved; localShift = next; State("origin", line, "G52 · traslazione locale"); continue;
            }
            if (machine == "lathe" && (gs.Contains(50) || gs.Contains(92) && (Has("S") || latheSystem != "A")))
            {
                int code = gs.Contains(50) ? 50 : 92;
                if (gs.Count != 1 || ms.Count > 0 || !unique || !Only("N,S,X,Z")) { Fail(line, $"G{code}: formato limite giri/coordinate non valido."); break; }
                if (Has("S"))
                {
                    if (!(Val("S") > 0 && Val("S") <= 1e6)) { Fail(line, "Limite mandrino S non valido."); break; }
                    spindleLimit = Val("S"); State("auxiliary", line, $"Limite mandrino · {spindleLimit} giri/min");
                }
                if (Has("X,Z"))
                {
                    if (unknownAxes.Count > 0) { Fail(line, "Impostazione coordinate con posizione macchina sconosciuta."); break; }
                    var next = pos with { X = Has("X") ? Val("X") * unit * (diameter ? .5 : 1) : pos.X, Z = Has("Z") ? Val("Z") * unit : pos.Z };
                    var shifted = (shift ?? new Point3()).Offset(new(pos.X - next.X, pos.Y - next.Y, pos.Z - next.Z));
                    if (!next.Valid || !shifted.Valid) { Fail(line, $"G{code}: coordinate fuori limite."); break; }
                    shift = shifted; pos = next; State("origin", line, $"G{code} · impostazione coordinate");
                }
                if (!Has("S,X,Z")) { Fail(line, $"G{code}: specificare S oppure X/Z."); break; }
                continue;
            }
            if (machine == "lathe")
            {
                try
                {
                    var cycleWords = new Dictionary<string, double>(v);
                    if (Has("X,Z,U,W") && !Has("F") && feed > 0) cycleWords["F"] = feed;
                    if (latheSystem != "A" && !absolute)
                    {
                        if (cycleWords.ContainsKey("X") && !cycleWords.ContainsKey("U")) { cycleWords["U"] = cycleWords["X"]; cycleWords.Remove("X"); }
                        if (cycleWords.ContainsKey("Z") && !cycleWords.ContainsKey("W")) { cycleWords["W"] = cycleWords["Z"]; cycleWords.Remove("Z"); }
                    }
                    var cycle = fanuc.TryPlan(gs, cycleWords, pos, unit, diameter, line, latheSystem);
                    if (cycle is not null)
                    {
                        if (unknownAxes.Count > 0 || plane != 18 || ms.Count > 0) throw new CycleException(line, "richiesti posizione nota, piano XZ e ciclo separato.");
                        if (r.Segments.Count + cycle.Moves.Count > 100000) throw new CycleException(line, "limite di 100.000 segmenti raggiunto.");
                        foreach (var move in cycle.Moves) Add(move.To, move.Rapid, move.Line, move.Action, move.Motion);
                        if (cycle.Moves.Count == 0) State("auxiliary", line, "Impostazione ciclo Fanuc");
                        if (cycle.Note is not null) r.Notes.Add(cycle.Note); continue;
                    }
                }
                catch (CycleException e) { Fail(e.Line, e.Message); break; }
            }
            double[] allowedG = [0, 1, 2, 3, 4, 17, 18, 19, 20, 21, 40, 49, 54, 55, 56, 57, 58, 59, 80, 90, 91, 94, 95, 96, 97, 98, 99];
            double[] latheExtra = [9, 27, 28, 30, 32, 33, 34, 41, 42, 53, 54.1, 60, 61, 63, 64];
            var badG = gs.Where(g => !(allowedG.Contains(g) || machine == "lathe" && latheExtra.Contains(g)) || machine == "lathe" && latheSystem == "A" && g == 91).Cast<double?>().FirstOrDefault();
            if (badG is not null) { Fail(line, $"G{badG} non simulato. Anteprima interrotta."); break; }
            double[] allowedM = machine == "lathe" ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 40, 41, 42, 43] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 19, 30];
            var badM = ms.Where(m => !allowedM.Contains(m)).Cast<double?>().FirstOrDefault();
            if (badM is not null) { Fail(line, $"M{badM} non simulato. Anteprima interrotta."); break; }
            if (!Only(machine == "lathe" ? "N,O,X,Y,Z,I,J,K,R,F,S,T,P,U,W,A,C" : "N,O,X,Y,Z,I,J,K,R,F,S,T,P"))
            { Fail(line, "Indirizzo non simulato. Anteprima interrotta."); break; }
            foreach (double g in gs)
            {
                if (g == 90) absolute = true; if (g == 91) absolute = false; if (g == 20) unit = 25.4; if (g == 21) unit = 1;
                if (g is 17 or 18 or 19) plane = (int)g; if (g == 60) { motion = 0; r.Notes.Add("G60: destinazione nominale; sovracorsa di accostamento unidirezionale non modellata."); } if (g <= 3 || machine == "lathe" && g is 32 or 33 or 34) motion = (int)g; if (g == 80 && !gs.Any(h => h is 0 or 1 or 2 or 3 or 32 or 33 or 34)) motion = -1;
            }
            if (machine == "lathe")
            {
                if (gs.Any(g => g is 41 or 42)) r.Notes.Add("G41/G42: visualizzato il profilo programmato. Raggio/orientamento della punta e compensazione reale non applicati.");
                if (ms.Any(m => m is 10 or 11 or 13 or 14 or >= 20 and <= 29 or 31 or >= 40 and <= 43)) r.Notes.Add("Funzioni M ausiliarie registrate; movimenti di mandrino, autocentrante e altri organi meccanici non rappresentati.");
                if (gs.Any(g => g is 27 or 28 or 30 or 53))
                {
                    int code = (int)gs.First(g => g is 27 or 28 or 30 or 53);
                    if (!Only("N,X,Z,U,W,P") || !Has("X,Z,U,W")) { Fail(line, $"G{code}: specificare gli assi X/Z o U/W in un blocco separato."); break; }
                    if (Has("P") && (code != 30 || Val("P") is < 2 or > 4 || Val("P") != Math.Truncate(Val("P"))) || code == 53 && Has("U,W")) { Fail(line, "Formato del riferimento macchina non valido."); break; }
                    if (code != 53 && unknownAxes.Count == 0)
                    {
                        var relative = new Dictionary<string, double>(v);
                        if (!absolute) { if (relative.Remove("X", out var xx)) relative["U"] = xx; if (relative.Remove("Z", out var zz)) relative["W"] = zz; }
                        try { var intermediate = LathePath.Target(pos, relative, unit, diameter, line); if (intermediate.Distance(pos) > 1e-8) Add(intermediate, true, line, $"G{code} · punto intermedio"); }
                        catch (CycleException e) { Fail(e.Line, e.Message); break; }
                    }
                    if (code == 27) { r.Notes.Add("G27: punto intermedio rappresentato; verifica del riferimento macchina non eseguita."); State("auxiliary", line, "G27 · verifica riferimento"); continue; }
                    if (Has("X,U")) unknownAxes.Add(0); if (Has("Z,W")) unknownAxes.Add(2);
                    r.OmittedMoves++; programmedCorner = null;
                    r.Notes.Add($"G{code}: riferimento/coordinate macchina non configurati; tratto macchina omesso. La geometria riprende dopo quote assolute note degli assi interessati.");
                    State("reference", line, $"G{code} · posizione macchina non definita"); continue;
                }
                if (motion is 32 or 33 or 34)
                {
                    if (feed <= 0) { Fail(line, "Filettatura: specificare un passo F positivo."); break; }
                    r.Notes.Add("G32/G33/G34: proiezione X/Z della filettatura; sincronizzazione mandrino e variazione temporale del passo non calcolate.");
                }
            }
            if (machine == "lathe" && gs.Contains(54.1))
            {
                if (!Has("P") || Val("P") < 1 || Val("P") > 300 || Val("P") != Math.Truncate(Val("P"))) { Fail(line, "G54.1: P deve selezionare un’origine tra 1 e 300."); break; }
                string next = "G54.1 P" + Val("P").ToString(CultureInfo.InvariantCulture);
                if (next != origin) { origin = next; pos = new(); hasPosition = false; }
                r.Notes.Add("Origini estese: visualizzazione nelle coordinate locali programmate; distanze fisiche tra zeri macchina non configurate."); State("origin", line);
            }
            var origins = gs.Where(g => g >= 54 && g <= 59 && g != 54.1).Distinct().ToList();
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
            var basisPosition = programmedCorner ?? pos;
            var target = basisPosition;
            string[] axes = ["X", "Y", "Z"];
            for (int i = 0; i < 3; i++) if (Has(axes[i])) target = target.With(i, (absolute ? 0 : basisPosition[i]) + Val(axes[i]) * unit * (i == 0 && machine == "lathe" && diameter ? .5 : 1));
            if (machine == "lathe")
            {
                if (Has("U")) target = target with { X = basisPosition.X + Val("U") * unit * (diameter ? .5 : 1) };
                if (Has("W")) target = target with { Z = basisPosition.Z + Val("W") * unit };
            }
            if (machine == "lathe" && Has("A"))
            {
                if (motion != 1 || plane != 18) { Fail(line, "Angoli A supportati nei movimenti G1 sul piano XZ."); break; }
                try { target = LathePath.Target(basisPosition, v, unit, diameter, line, absolute); }
                catch (CycleException e) { Fail(e.Line, e.Message); break; }
            }
            if (!target.Valid) { Fail(line, "Coordinata non valida."); break; }
            if (unknownAxes.Count > 0)
            {
                foreach (int axis in unknownAxes.ToArray()) if (v.ContainsKey(axes[axis]) && absolute) unknownAxes.Remove(axis);
                pos = target; programmedCorner = null; r.OmittedMoves++; State("reference", line, unknownAxes.Count == 0 ? "Posizione pezzo riacquisita" : "Posizione macchina non definita"); continue;
            }
            if (machine == "lathe" && motion == 1 && Has("R,C"))
            {
                try
                {
                    if (plane != 18 || Has("R") && Has("C") || ms.Any(m => m is 2 or 30)) throw new CycleException(line, "usare un solo R oppure C nel piano XZ.", "G1");
                    Dictionary<string, double>? nextWords = null;
                    for (int i = n + 1; i < lines.Length; i++)
                    {
                        string look = visibleLines[i].Trim().ToUpperInvariant(); if (look.Length == 0) continue;
                        var (nextG, nextM, nextV, _) = GCode.Parse(look);
                        if (nextM.Count > 0 || nextG.Any(g => g != 1)) break;
                        if (nextV.Keys.Any(k => "X,Z,U,W,A".Split(',').Contains(k))) { nextWords = nextV; break; }
                        if (nextV.Keys.Any(k => k is not ("N" or "F" or "S"))) break;
                    }
                    if (nextWords is null) throw new CycleException(line, "R/C richiede un tratto G1 successivo con quote X/Z.", "G1");
                    var next = LathePath.Target(target, nextWords, unit, diameter, line, absolute);
                    foreach (var item in LathePath.Corner(pos, target, next, Val("R") * unit, Val("C") * unit, line)) Add(item.Point, false, line, "Raccordo/smusso automatico", item.Motion);
                    programmedCorner = target; continue;
                }
                catch (CycleException e) { Fail(e.Line, e.Message); break; }
            }
            if (machine == "lathe" && Has("C")) { Fail(line, "C di smusso supportato solo nei tratti G1 XZ; asse C non modellato."); break; }
            programmedCorner = null;
            if (!target.Valid) { Fail(line, "Coordinata non valida."); break; }
            if (motion < 2 || motion is 32 or 33 or 34) Add(target, motion == 0, line, motion is 32 or 33 or 34 ? $"G{motion} · filettatura" : null);
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
                if (!double.IsFinite(radius) || !double.IsFinite(endRadius) || radius > 1e6 || radius < 1e-8 || Math.Abs(radius - endRadius) > Math.Max(.01, radius * .001)) { Fail(line, "Centro e punto finale dell’arco non coerenti."); break; }
                double angle = Math.Atan2(sy - cy, sx - cx), sweep = Math.Atan2(ey - cy, ex - cx) - angle;
                if (motion == 3 && sweep <= 1e-10) sweep += Math.PI * 2; if (motion == 2 && sweep >= -1e-10) sweep -= Math.PI * 2;
                int count = Math.Min(2048, Math.Max(8, (int)Math.Ceiling(Math.Abs(sweep) * Math.Max(radius, 1) / .5))); var basis = pos;
                for (int j = 1; j <= count; j++)
                {
                    double t = (double)j / count;
                    var p = basis.With(a, cx + radius * Math.Cos(angle + sweep * t)).With(b, cy + radius * Math.Sin(angle + sweep * t)).With(c, basis[c] + (target[c] - basis[c]) * t);
                    Add(j == count ? target : p, false, line, moveMotion: motion);
                }
            }
            if (ms.Any(m => m is 2 or 30)) ended = true;
            if (r.Segments.Count > 100000) { Fail(line, "Limite di 100.000 segmenti raggiunto. Riduci il programma."); break; }
            }
            catch (CycleException e) { Fail(e.Line, e.Message); break; }
        }
        if (rough is not null && r.Issues.Count == 0) Fail(rough.Line, "G71 non simulato: seconda riga P/Q mancante.");
        if (r.Issues.Count == 0 && (fanuc.HasHeader || profileHeaders.Count > 0)) Fail(lines.Length, "Seconda riga del ciclo Fanuc mancante a fine programma.");
        return r;
    }
}
