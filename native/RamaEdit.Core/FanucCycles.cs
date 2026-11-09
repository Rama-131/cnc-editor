namespace RamaEdit.Core;

public record FanucPlan(List<CycleMove> Moves, int? EndIndex = null, string? Note = null, int Passes = 0);

// Fanuc turning cycles, projected onto the programmed X/Z plane. All distances
// here are physical mm (X is a radius); only the input boundary decodes diameter
// coordinates and Fanuc's integer P/Q least-input increments.
public sealed class FanucCycles
{
    const double E = 1e-7;
    int modal, pending;
    readonly Dictionary<string, double> remembered = [];
    readonly Dictionary<int, Dictionary<string, double>> headers = [];
    public void Cancel() { modal = 0; remembered.Clear(); }
    public bool HasHeader => pending != 0;
    public int PendingCode => pending;
    static bool Has(IReadOnlyDictionary<string, double> v, string keys) => keys.Split(',').Any(v.ContainsKey);
    static double V(IReadOnlyDictionary<string, double> v, string key, double fallback = 0) => v.GetValueOrDefault(key, fallback);
    static void Check(bool ok, int line, int code, string message)
    {
        if (!ok) throw new CycleException(line, message, "G" + code);
    }
    static void Addresses(IReadOnlyDictionary<string, double> v, string allowed, int line, int code)
    {
        Check(v.Keys.All(allowed.Split(',').Contains) && v.Values.All(double.IsFinite), line, code, "indirizzi o valori non supportati per questo formato Fanuc.");
    }
    static Point3 Target(Point3 start, IReadOnlyDictionary<string, double> v, double unit, bool diameter, int line, int code)
    {
        Check(!(v.ContainsKey("X") && v.ContainsKey("U")) && !(v.ContainsKey("Z") && v.ContainsKey("W")), line, code, "quote assolute e incrementali dello stesso asse.");
        double xs = unit * (diameter ? .5 : 1);
        var end = start with
        {
            X = v.ContainsKey("X") ? v["X"] * xs : start.X + V(v, "U") * xs,
            Z = v.ContainsKey("Z") ? v["Z"] * unit : start.Z + V(v, "W") * unit
        };
        Check(end.Valid, line, code, "coordinate fuori limite."); return end;
    }
    static double Increment(double encoded, double unit, int line, int code, string name)
    {
        Check(encoded > 0 && encoded == Math.Truncate(encoded), line, code, name + " richiede un intero positivo in incrementi Fanuc (0,001 mm oppure 0,0001 pollici).");
        return encoded * (unit == 1 ? .001 : .0001 * unit);
    }
    sealed class Builder(Point3 start, int line, int code)
    {
        public readonly List<CycleMove> Moves = [];
        public Point3 Position = start;
        public void Emit(Point3 point, bool rapid, string action)
        {
            Check(point.Valid && Moves.Count < 100000, line, code, "limite di coordinate o 100.000 segmenti raggiunto.");
            if (point.Distance(Position) > E) Moves.Add(new(point, rapid, line, $"G{code} · {action}"));
            Position = point;
        }
    }
    public FanucPlan? TryPlan(List<double> gs, Dictionary<string, double> words, Point3 start, double unit, bool diameter, int line, string system)
    {
        int[] simple = system == "A" ? [90, 92, 94] : [77, 78, 79];
        int code = (int)gs.FirstOrDefault(g => g == Math.Truncate(g) && (simple.Contains((int)g) || g is 74 or 75 or 76 or >= 81 and <= 89));
        bool explicitCode = code != 0;
        if (code == 92 && words.ContainsKey("S") && !Has(words, "X,Z,U,W")) return null;
        if (code == 0)
        {
            if (gs.Any(g => g is 0 or 1 or 2 or 3 or 32 or 33 or 34 or 70 or 71 or 72 or 73 or 80)) Cancel();
            if (gs.Any(g => g is not (98 or 99) && !(system != "A" && g is 94 or 95)) || modal == 0 || !Has(words, "X,Z,U,W")) return null;
            code = modal;
        }
        Check(gs.All(g => g == code || g is 98 or 99 || system != "A" && g is 94 or 95), line, code, "usare il ciclo con soli codici compatibili di avanzamento.");
        if (code is 74 or 75 or 76)
        {
            Cancel();
            if (pending != 0 && pending != code) throw new CycleException(line, "la seconda riga del ciclo precedente è mancante.", "G" + PendingCode);
            if (!Has(words, "X,Z,U,W"))
            {
                Addresses(words, code == 76 ? "N,P,Q,R" : "N,R", line, code);
                Check(code == 76 || words.ContainsKey("R"), line, code, "prima riga attesa con R di ritrazione esplicito.");
                Check(pending != code, line, code, "seconda riga del ciclo mancante.");
                if (code == 76)
                {
                    Check(words.ContainsKey("P") && words.ContainsKey("Q"), line, code, "prima riga attesa P... Q... R...");
                    int packed = (int)V(words, "P");
                    Check(V(words, "P") == packed && packed >= 10000 && packed <= 999999, line, code, "P deve contenere le sei cifre mmrr aa, per esempio P020060.");
                    Check(packed / 10000 is >= 1 and <= 99 && packed % 100 is 0 or 29 or 30 or 55 or 60 or 80, line, code, "ripetizioni o angolo del filetto non validi.");
                    Check((packed / 100) % 100 == 0, line, code, "smusso finale del filetto diverso da zero: occorre la geometria di uscita prevista dai parametri macchina.");
                    _ = Increment(V(words, "Q"), unit, line, code, "Q");
                }
                Check(V(words, "R") >= 0, line, code, "R deve essere non negativo.");
                headers[code] = new(words); pending = code; return new([], Note: $"G{code}: prima riga acquisita.");
            }
            Check(headers.TryGetValue(code, out var header), line, code, "prima riga del ciclo mancante.");
            pending = 0;
            return code == 76 ? Thread(words, header!, start, unit, diameter, line) : Groove(code, words, header!, start, unit, diameter, line);
        }
        if (explicitCode) { remembered.Clear(); modal = code; }
        foreach (var (key, value) in words) if (key != "N") remembered[key] = value;
        // Incremental dimensions are relative to the cycle's unchanged start.
        if (words.ContainsKey("X")) remembered.Remove("U"); if (words.ContainsKey("U")) remembered.Remove("X");
        if (words.ContainsKey("Z")) remembered.Remove("W"); if (words.ContainsKey("W")) remembered.Remove("Z");
        if (code is >= 81 and <= 89) return Drill(code, remembered, start, unit, diameter, line);
        Addresses(remembered, code is 92 or 78 ? "X,Z,U,W,R,F,Q" : "X,Z,U,W,R,F", line, code);
        Check(Has(remembered, "X,U") && Has(remembered, "Z,W"), line, code, "specificare le quote X/Z (oppure U/W) alla prima chiamata.");
        Check(V(remembered, "F") > 0, line, code, "avanzamento o passo F positivo mancante.");
        var target = Target(start, remembered, unit, diameter, line, code);
        double taper = V(remembered, "R") * unit;
        var b = new Builder(start, line, code);
        bool face = code is 94 or 79, threading = code is 92 or 78;
        if (threading && remembered.ContainsKey("Q")) Check(V(remembered, "Q") >= 0 && V(remembered, "Q") < 360000 && V(remembered, "Q") == Math.Truncate(V(remembered, "Q")), line, code, "Q fase angolare deve essere un intero tra 0 e 359999.");
        if (face)
        {
            b.Emit(start with { Z = target.Z - taper }, true, "avvicinamento");
            b.Emit(target, false, "sfacciatura");
            b.Emit(target with { Z = start.Z }, false, "uscita");
            b.Emit(start, true, "ritorno");
        }
        else
        {
            b.Emit(start with { X = target.X - taper }, true, "avvicinamento");
            b.Emit(target, false, threading ? "filettatura" : "tornitura");
            b.Emit(target with { X = start.X }, threading, "uscita");
            b.Emit(start, true, "ritorno");
        }
        return new(b.Moves, Note: threading ? "Filettatura: proiezione X/Z del percorso programmato; sincronizzazione mandrino e profilo del filetto non rappresentati." : null);
    }
    static FanucPlan Drill(int code, Dictionary<string, double> v, Point3 start, double unit, bool diameter, int line)
    {
        Addresses(v, "X,Z,U,W,R,F,Q,P", line, code);
        bool radial = code is 87 or 88 or 89, peck = code is 83 or 87, tapping = code is 84 or 88, feedOut = tapping || code is 85 or 89;
        int feed = radial ? 0 : 2, station = radial ? 2 : 0;
        Check(peck || V(v, "Q") == 0, line, code, "variante con Q non supportata per questo ciclo: serve il formato del controllo.");
        Check(Has(v, radial ? "X,U" : "Z,W") && V(v, "F") > 0 && V(v, "P") >= 0, line, code, "specificare fondo, F positivo ed eventuale sosta P non negativa.");
        var end = Target(start, v, unit, diameter, line, code);
        // Fanuc turning canned-drill R is the signed distance from the initial
        // level to point R, rather than the mill's absolute R-plane coordinate.
        double plane = start[feed] + V(v, "R") * unit, direction = Math.Sign(end[feed] - plane);
        Check(direction != 0, line, code, "fondo coincidente con il piano R.");
        double step = peck ? Increment(V(v, "Q"), unit, line, code, "Q") : Math.Abs(end[feed] - plane);
        double count = Math.Ceiling(Math.Abs(end[feed] - plane) / step - E);
        Check(count is >= 1 and <= 1000, line, code, "oltre 1000 affondi: verificare Q e profondità.");
        var b = new Builder(start, line, code); var clearance = start.With(station, end[station]);
        b.Emit(clearance, true, "posizionamento");
        b.Emit(clearance.With(feed, plane), true, "piano R");
        for (int i = 1; i <= (int)count; i++)
        {
            double previous = plane + direction * Math.Min(Math.Abs(end[feed] - plane), (i - 1) * step);
            if (i > 1) b.Emit(b.Position.With(feed, previous), true, "rientro nel foro");
            double depth = plane + direction * Math.Min(Math.Abs(end[feed] - plane), i * step);
            b.Emit(b.Position.With(feed, depth), false, tapping ? "maschiatura" : "affondo");
            if (i < count) b.Emit(b.Position.With(feed, plane), true, "scarico truciolo");
        }
        b.Emit(clearance.With(feed, plane), !feedOut, tapping ? "uscita sincronizzata" : "ritiro");
        b.Emit(clearance, true, "ritorno al piano iniziale");
        return new(b.Moves, Note: $"G{code} tornio: piano R incrementale dal livello iniziale. Proiezione X/Z; orientamento mandrino, soste, reingresso e sincronizzazione reali non modellati.");
    }
    static FanucPlan Groove(int code, Dictionary<string, double> v, Dictionary<string, double> h, Point3 start, double unit, bool diameter, int line)
    {
        Addresses(v, "N,X,Z,U,W,P,Q,R,F", line, code);
        Check(V(v, "R") == 0, line, code, "lo scarico di fondo R diverso da zero richiede il formato specifico del controllo.");
        Check(V(v, "F") > 0, line, code, "F positivo mancante.");
        var end = Target(start, v, unit, diameter, line, code);
        int feed = code == 74 ? 2 : 0, station = code == 74 ? 0 : 2;
        Check(Math.Abs(end[feed] - start[feed]) > E, line, code, "profondità di lavorazione nulla.");
        double step = Increment(V(v, code == 74 ? "Q" : "P"), unit, line, code, code == 74 ? "Q" : "P");
        double width = Math.Abs(end[station] - start[station]), spacing = width > E ? Increment(V(v, code == 74 ? "P" : "Q"), unit, line, code, code == 74 ? "P" : "Q") : 1;
        int stations = Math.Max(1, (int)Math.Ceiling(width / spacing) + (width > E ? 1 : 0)), pecks = (int)Math.Ceiling(Math.Abs(end[feed] - start[feed]) / step);
        Check(stations <= 1000 && pecks is > 0 and <= 1000 && (long)stations * pecks < 30000, line, code, "oltre 1000 posizioni/passate o 30.000 affondi.");
        double dir = Math.Sign(end[feed] - start[feed]), lateral = Math.Sign(end[station] - start[station]), retract = V(h, "R") * unit;
        var b = new Builder(start, line, code);
        for (int i = 0; i < stations; i++)
        {
            double at = start[station] + lateral * Math.Min(width, i * spacing);
            b.Emit(start.With(station, at), true, "posizionamento");
            for (int j = 1; j <= pecks; j++)
            {
                double depth = start[feed] + dir * Math.Min(Math.Abs(end[feed] - start[feed]), j * step);
                b.Emit(b.Position.With(feed, depth), false, $"affondo {j}/{pecks}");
                if (j < pecks) b.Emit(b.Position.With(feed, depth - dir * Math.Min(retract, Math.Abs(depth - start[feed]))), true, "rompitruciolo");
            }
            b.Emit(start.With(station, at), true, "ritiro");
        }
        b.Emit(start, true, "ritorno");
        return new(b.Moves, Note: $"G{code}: affondi e ritrazioni geometriche; larghezza utensile e materiale non modellati.");
    }
    static FanucPlan Thread(Dictionary<string, double> v, Dictionary<string, double> h, Point3 start, double unit, bool diameter, int line)
    {
        const int code = 76; Addresses(v, "N,X,Z,U,W,R,P,Q,F", line, code);
        Check(Has(v, "X,U") && Has(v, "Z,W") && V(v, "F") > 0, line, code, "richiesti X/Z (o U/W), P, Q e F positivo.");
        var end = Target(start, v, unit, diameter, line, code);
        double height = Increment(V(v, "P"), unit, line, code, "P"), first = Increment(V(v, "Q"), unit, line, code, "Q"), minimum = Increment(V(h, "Q"), unit, line, code, "Q prima riga");
        double finish = V(h, "R") * unit, taper = V(v, "R") * unit;
        Check(finish < height && Math.Abs(end.Z - start.Z) > E && Math.Abs(end.X - start.X) > E, line, code, "altezza, sovrametallo o estremi del filetto non validi.");
        int direction = Math.Sign(end.X - start.X), springs = (int)V(h, "P") / 10000;
        double crest = end.X - direction * height, depth = 0; int pass = 0; var depths = new List<double>();
        while (depth < height - finish - E)
        {
            Check(++pass <= 1000, line, code, "oltre 1000 passate: verificare P/Q.");
            depth = Math.Min(height - finish, Math.Max(first * Math.Sqrt(pass), depth + minimum)); depths.Add(depth);
        }
        for (int i = depths.Count > 0 && Math.Abs(depths[^1] - height) < E ? 1 : 0; i < springs; i++) depths.Add(height);
        var b = new Builder(start, line, code);
        for (int i = 0; i < depths.Count; i++)
        {
            double radius = crest + direction * depths[i];
            b.Emit(start with { X = radius - taper }, true, $"ingresso passata {i + 1}/{depths.Count}");
            b.Emit(end with { X = radius }, false, $"filettatura passata {i + 1}/{depths.Count}");
            b.Emit(end with { X = start.X }, true, "uscita");
            b.Emit(start, true, "ritorno");
        }
        return new(b.Moves, Note: "G76 a due righe: passate a sezione progressiva in proiezione X/Z. Sincronizzazione, penetrazione sui fianchi e forma reale del filetto non modellate.");
    }
}
