using RamaEdit.Core;

internal static class FanucTests
{
    public static void Run(Action<bool, string> check, Action<double, double, string> near)
    {
        SimulationResult Run(string source, bool diameter = true, string system = "A")
        {
            var r = Simulator.Simulate(source, "lathe", diameter, system);
            check(r.Complete, "Fanuc: " + source + "\n" + string.Join("\n", r.Issues.Select(i => i.Message)));
            check(r.Segments.Count < 100000 && r.Segments.All(s => s.From.Valid && s.To.Valid), "Coordinate Fanuc finite e limiti di esecuzione");
            near(r.Distance, r.Segments.Sum(s => s.From.Distance(s.To)), "Distanza Fanuc uguale alla somma geometrica");
            return r;
        }
        void End(SimulationResult r, double x, double z)
        {
            near(r.Segments[^1].To.X, x, "Ritorno X"); near(r.Segments[^1].To.Z, z, "Ritorno Z");
        }
        var thread = Run("G50 S2500\nG96 S180\nG99\nG0 X60 Z2\nG32 Z-20 F2\nZ-40\nG0 X65");
        check(thread.Steps.All(s => s.SpindleLimit == 2500), "G50 S conserva il limite mandrino");
        check(thread.Segments.Count(s => s.Action?.Contains("filettatura") == true) == 2, "G32 resta modale sui blocchi successivi");
        near(thread.Segments[2].To.Z, -40, "Estremo del secondo tratto filettato");
        Run("G0 X40 Z2\nG33 Z-20 F1.5\nG0 X44");
        Run("G0 X40 Z2\nG34 Z-20 F1.5 K0.1\nG0 X44");
        var turning = Run("G0 X60 Z2\nG99 F0.25\nG90 X50 Z-20 F0.25\nX40");
        End(turning, 30, 2);
        check(turning.Segments.Count(s => s.Action?.Contains("tornitura") == true) == 2, "G90 ripete il ciclo con X modale e Z conservata");
        check(turning.Segments.Any(s => !s.Rapid && s.To == new Point3(20, 0, -20)), "Seconda passata G90 alle quote corrette");
        var tapered = Run("G0 X60 Z2\nG90 X40 Z-20 R-5 F0.2");
        near(tapered.Segments[1].To.X, 25, "G90 R è una differenza radiale, anche con X a diametro");
        var facing = Run("G0 X60 Z3\nG94 X0 Z0 F0.15\nZ-2");
        End(facing, 30, 3);
        check(facing.Segments.Any(s => !s.Rapid && s.To == new Point3(0, 0, -2)), "G94 sfacciatura modale");
        var simpleThread = Run("G92 S1800\nG0 X24 Z2\nG92 X20 Z-20 F1.5\nX19.5");
        End(simpleThread, 12, 2);
        check(simpleThread.Segments.Count(s => s.Action?.Contains("filettatura") == true) == 2, "G92 con quote filetta; G92 S imposta il limite");
        var iso = Run("G90 G0 X60 Z2\nG91 G1 X4 Z-5 F0.2", system: "B");
        End(iso, 32, -3);
        Run("G90 G0 X60 Z2\nG77 X40 Z-20 F0.2", system: "B");
        Run("G90 G0 X24 Z2\nG78 X20 Z-20 F1.5", system: "B");
        Run("G90 G0 X60 Z3\nG79 X0 Z0 F0.2", system: "B");
        var drilling = Run("G0 X0 Z2\nG74 R0.5\nG74 Z-8 Q3000 F0.1");
        check(drilling.Segments.Where(s => !s.Rapid).Select(s => s.To.Z).SequenceEqual(new[] { -1d, -4d, -7d, -8d }), "G74 Q3000: affondi di 3 mm, ultimo affondo limitato al fondo");
        End(drilling, 0, 2);
        var groove = Run("G0 X60 Z2\nG75 R0.5\nG75 X40 Z-4 P2000 Q3000 F0.2");
        End(groove, 30, 2);
        check(groove.Segments.Where(s => !s.Rapid).GroupBy(s => s.To.Z).Select(g => g.Key).Order().SequenceEqual(new[] { -4d, -1d, 2d }), "G75 Q3000: tre stazioni distanti 3 mm");
        check(groove.Segments.Where(s => !s.Rapid).All(s => s.To.X >= 20 && s.To.X < 30), "G75 P2000 è radiale e non viene dimezzato con X a diametro");
        var deep = Run("G0 X0 Z5\nG83 Z-20 R-3 Q5000 F0.1\nX10\nG80\nG0 X20");
        check(deep.Segments.Any(s => s.Action?.Contains("piano R") == true && Math.Abs(s.To.Z - 2) < 1e-8), "G83 Fanuc tornio: R-3 da Z5 definisce piano Z2");
        check(deep.Segments.Where(s => !s.Rapid).Select(s => s.To.Z).SequenceEqual(new[] { -3d, -8d, -13d, -18d, -20d, -3d, -8d, -13d, -18d, -20d }), "G83 Q5000: affondi di 5 mm e ripetizione modale su X");
        foreach (int g in new[] { 81, 82, 84, 85, 86 }) Run($"G0 X0 Z5\nG{g} Z-10 R-3 F0.2 P100\nG80");
        foreach (int g in new[] { 87, 88, 89 }) Run($"G0 X60 Z-5\nG{g} X40 R-2 " + (g == 87 ? "Q2000 " : "") + "F0.2\nG80");
        var threading = Run("G0 X24 Z2\nG76 P020060 Q100 R0.05\nG76 X18 Z-20 P1000 Q300 F1.5");
        End(threading, 12, 2);
        var cuts = threading.Segments.Where(s => !s.Rapid).Select(s => s.To.X).ToList();
        check(cuts.Count > 3 && cuts.Zip(cuts.Skip(1)).All(p => p.First >= p.Second) && cuts.Count(x => Math.Abs(x - 9) < 1e-8) == 2, "G76: profondità progressiva, diametro finale e due passate di finitura");
        var noFinish = Run("G0 X24 Z2\nG76 P020060 Q100 R0\nG76 X18 Z-20 P1000 Q300 F1.5");
        check(noFinish.Segments.Count(s => !s.Rapid && Math.Abs(s.To.X - 9) < 1e-8) == 2, "G76 R0 non aggiunge una terza passata di finitura");
        var angle = Run("G0 X20 Z0\nG1 X24 A135 F0.2\nZ-10");
        near(angle.Segments[1].To.X, 12, "A135 quota radiale"); near(angle.Segments[1].To.Z, -2, "A135 ricava Z dalla quota X diametrale");
        var rounded = Run("G0 X20 Z0\nG1 Z-10 R1 F0.2\nU10");
        End(rounded, 15, -10);
        check(rounded.Segments.Any(s => s.Motion == 2), "Raccordo G1 R rappresentato come arco, non come spigolo");
        check(rounded.Segments.All(s => s.To.Distance(new Point3(10, 0, -10)) > .1), "Il raccordo non attraversa lo spigolo nominale");
        var chamfer = Run("G0 X20 Z0\nG1 Z-10 C1 F0.2\nU10");
        End(chamfer, 15, -10);
        check(chamfer.Segments.Any(s => s.To == new Point3(10, 0, -9)) && chamfer.Segments.Any(s => s.To == new Point3(11, 0, -10)), "Smusso C1: due estremi corretti");
        var reference = Run("G0 X60 Z2\nG28 U0 W0\nG0 X70 Z5\nG1 Z-10 F0.2");
        check(reference.OmittedMoves == 2 && reference.Segments.Count == 2 && reference.Steps.Any(s => !s.PositionKnown), "G28 non inventa lo zero macchina e riprende dopo il posizionamento completo");
        near(reference.Segments[^1].From.X, 35, "Ripresa dopo G28 dalla quota nota");
        var machine = Run("G0 X60 Z2\nG53 G0 X0 Z0\nM30");
        check(machine.OmittedMoves > 0 && !machine.Steps[^1].PositionKnown, "G53 distingue coordinate macchina da coordinate pezzo");
        var local = Run("G0 X60 Z2\nG52 X20 Z5\nG0 X40 Z-10\nG52 X0 Z0\nG1 Z-20 F0.2");
        near(local.Segments[1].WorkShift!.X, 10, "G52 X20 a diametro: traslazione radiale 10");
        near(local.Segments[1].WorkShift!.Z, 5, "G52 traslazione Z");
        near(local.Segments[^1].From.X, 30, "G52 annullato: posizione fisica X conservata");
        Run("G0 X60 Z2\nG22 X100 Z100 I0 K-100\nG23\nG09 G1 Z-5 F0.2\nG61\nG64\nG27 U0 W0");
        Run("G54.1 P2\nG0 X40 Z2\nG1 Z-10 F0.2");
        var compensation = Run("G0 X60 Z2\nG41 G1 X40 Z-20 F0.2\nG40\nM30");
        check(compensation.Notes.Any(n => n.Contains("compensazione reale")), "G41/G42 dichiarano la visualizzazione del profilo nominale");
        var faceRough = Run("G0 X80 Z2\nG72 W2 R0.5\nG72 P100 Q160 U0.5 W0.1 F0.2\nN100 G0 Z-30\nN110 G1 X60\nN120 Z-20\nN130 X40\nN140 Z-10\nN150 X20\nN160 Z0\nM30");
        End(faceRough, 40, 2);
        check(faceRough.Segments.Any(s => s.Action?.Contains("G72") == true && s.Action.Contains("passata")), "G72 esegue le passate frontali");
        var repeat = Run("G0 X70 Z2\nG73 U2 W1 R3\nG73 P100 Q130 U0.2 W0.1 F0.2\nN100 G0 X40\nN110 G1 Z0\nN120 X50 Z-10\nN130 X60 Z-20\nM30");
        End(repeat, 35, 2);
        check(repeat.Segments.Any(s => s.Action?.Contains("ripetizione 3/3") == true), "G73 completa tutte le ripetizioni");
        var arcs = Run("G0 X60 Z2\nG71 U2 R0.5\nG71 P100 Q150 U0.2 W0.1 F0.2\nN100 G0 X20\nN110 G1 Z0\nN120 G3 X30 Z-5 R5\nN130 G1 Z-20\nN140 X40\nN150 X50 Z-25\nG70 P100 Q150\nM30");
        End(arcs, 30, 2);
        check(arcs.Segments.Any(s => s.Motion == 3 && s.Action?.Contains("G70") == true), "G71/G70 conservano gli archi del profilo e il loro verso");
        Run("G0 X60 Z2\nG70 P100 Q130\nM30\nN100 G0 X40\nN110 G1 Z0\nN120 X50 Z-10\nN130 X55 Z-20");
        var reportedInternal = Run("N270 G0 X24 Z2\nN280 G71 U2.02 R0.5\nN290 G71 P300 Q330 U-1 W0.1 F0.2\nN300 G0 X30.5\nN310 G1 Z-1.9\nN320 X24 A201.8\nN330 X23.8\nM30");
        End(reportedInternal, 12, 2);
        var reportedPasses = reportedInternal.Segments.Where(s => !s.Rapid && s.Action?.StartsWith("G71 · passata ") == true).ToList();
        check(reportedPasses.Count == 2, "G71 della foto: due passate con profondità radiale 2,02 e sovrametallo U-1 diametrale");
        near(reportedPasses[0].To.X, 14.02, "Prima passata interna: raggio 14,02");
        near(reportedPasses[1].To.X, 14.75, "Seconda passata interna: raggio finale 14,75");
        near(reportedPasses[0].To.Z, -1.8 - .73 / Math.Tan(21.8 * Math.PI / 180), "Intersezione analitica prima passata con la conicità A201.8");
        near(reportedPasses[1].To.Z, -1.8, "La seconda passata termina alla spalla, con W0.1");
        check(reportedPasses.All(m => m.From.X >= 12 && m.To.X >= 12), "Le passate di sgrossatura non entrano nella zona già aperta del foro");
        check(reportedInternal.Segments.Any(m => m.Action == "G71 · profilo con sovrametallo" && Math.Abs(m.To.X - 11.4) < 1e-8), "Il tratto finale X23.8 resta nel profilo con il sovrametallo U-1, senza tagliarlo");
        var outsideExit = Run("G0 X40 Z2\nG71 U2 R0.5\nG71 P100 Q130 U0.2 W0.1 F0.2\nN100 G0 X20\nN110 G1 Z-2\nN120 X40 A135\nN130 X42\nM30");
        End(outsideExit, 20, 2);
        check(outsideExit.Segments.Any(m => m.Action == "G71 · profilo con sovrametallo" && Math.Abs(m.To.X - 21.1) < 1e-8), "Anche il profilo esterno può terminare oltre il diametro iniziale senza essere una tasca");
        foreach (string pocket in new[] {
            "G0 X60 Z2\nG71 U2 R0.5\nG71 P100 Q130 U0.2 W0.1 F0.2\nN100 G0 X20\nN110 G1 Z0\nN120 X40 Z-5\nN130 X30 Z-10",
            "G0 X20 Z2\nG71 U2 R0.5\nG71 P100 Q130 U-0.2 W0.1 F0.2\nN100 G0 X40\nN110 G1 Z0\nN120 X30 Z-5\nN130 X35 Z-10",
            "G0 X24 Z2\nG71 U2.02 R0.5\nG71 P100 Q130 U-1 W0.1 F0.2\nN100 G0 X30.5\nN110 G1 Z-10\nN120 X24 Z-5\nN130 X23.8"
        })
        {
            var rejected = Simulator.Simulate(pocket, "lathe");
            check(!rejected.Complete && rejected.Issues.Any(i => i.Message.Contains("non monotono")), "Le vere tasche/inversioni interne, esterne o assiali restano segnalate");
        }

        var inside = Run("G0 X20 Z2\nG71 U2 R0.5\nG71 P100 Q130 U-0.2 W0.1 F0.2\nN100 G0 X40\nN110 G1 Z0\nN120 X30 Z-10\nN130 X24 Z-20\nM30");
        End(inside, 10, 2);
        var inch = Run("G20\nG0 X0 Z0.1\nG74 R0.01\nG74 Z-0.3 Q1000 F0.01");
        near(inch.Segments.Where(s => !s.Rapid).Min(s => s.To.Z), -7.62, "Q Fanuc in pollici usa incrementi da 0,0001 pollici");
        Run("G0 X0 Z5\nG83 Z-20 R-3 Q5000 F0.1\nG80 G0 X40 Z10");
        Run("G0 X0 Z5\nG83 Z-20 R-3 Q5000 F0.1\nG0 G80 X40 Z10");
        foreach (var example in FanucExamples.All) Run(example.Text, system: example.System);
        var incrementalAngle = Run("G90 G0 X20 Z0\nG91 G1 X4 A135 F0.2", system: "B");
        End(incrementalAngle, 12, -2);
        var incrementalCycle = Run("G90 G0 X60 Z2\nG91\nG77 X-20 Z-22 F0.2", system: "B");
        check(incrementalCycle.Segments.Any(s => !s.Rapid && s.To == new Point3(20, 0, -20)), "Ciclo ISO con G91 conserva la programmazione incrementale");
        Run("G0 X60 Z2\nG99 F0.25\nG90 X50 Z-20\nG99 X40");
        check(EditorMotion.Classify("G0 X60 Z2\nG32 Z-10 F2\nZ-20", "lathe").Skip(1).All(k => k == MotionColorKind.Working), "Colori di filettatura modale");
        check(EditorMotion.Classify("G0 X60 Z2\nG90 X40 Z-20 F0.2\nX30", "lathe").Skip(1).All(k => k == MotionColorKind.Working), "Colori dei cicli semplici modali");
        Run("G0 X0 Z2\nG74 R0.5\nG74 Z-8 Q3000 F0.1\nG0 Z3\nG74 Z-12 Q2000 F0.1");
        var terminal = Run("G0 X60 Z2\nG28 U0 W0 M30\nG0 X999999999 Z0");
        check(terminal.Segments.Count == 1, "M30 termina anche sui blocchi ausiliari senza eseguire le righe successive");
        var saved = Storage.Clone(new SavedDocument { Machine = "lathe", LatheSystem = "B", Diameter = false });
        check(saved.LatheSystem == "B" && !saved.Diameter, "Sistema ISO e diametro/raggio conservati nei dati di sessione");
        var random = new Random(76123);
        for (int i = 0; i < 80; i++)
        {
            double startX = random.Next(40, 200), endX = random.Next(2, (int)startX - 2), startZ = random.Next(1, 10), endZ = -random.Next(1, 100);
            string source = FormattableString.Invariant($"G0 X{startX} Z{startZ}\nG90 X{endX} Z{endZ} F0.2");
            var cycle = Run(source);
            near(cycle.Segments.Skip(1).Sum(s => s.From.Distance(s.To)), startX - endX + 2 * (startZ - endZ), "G90: lunghezza analitica del rettangolo con X a diametro");
            End(cycle, startX / 2, startZ);
        }
        foreach (string bad in new[] { "G0 X10 Z0\nG1 G0 X20", "G0 X10 Z0\nG52 X999999999999999999999999999999", "G0 X10 Z0\nG50 X999999999999999999999999999999", "G28 U0 W0\nG0 X999999999999999999999999999999 Z0", "G0 X20 Z0\nG2 X30 Z-5 R999999999999999999999999999999" })
        {
            var invalid = Simulator.Simulate(bad, "lathe");
            check(!invalid.Complete && invalid.Segments.All(s => s.To.Valid && s.From.Valid) && invalid.Steps.All(s => s.Position.Valid), "Input fuori scala o modale contraddittorio: nessuna coordinata non finita");
        }
        foreach (string bad in new[] {
            "G0 X24 Z2\nG76 P020160 Q100 R0.05\nG76 X18 Z-20 P1000 Q300 F1.5",
            "G0 X60 Z2\nG75 R0.5\nG75 X40 Z-4 P0 Q3000 F0.2",
            "G0 X20 Z0\nG1 Z-10 R20\nX30",
            "G0 X60 Z2\nG74 R0.5",
            "G0 X60 Z2\nG90 X40 Z-20 F0",
            "G0 X60 Z2\nG123 X40",
            "G0 X60 Z2\nG1 X40 X50",
            "G0 X60 Z2\nG74 R0.5\nG0 Z3"
        })
        {
            var rejected = Simulator.Simulate(bad, "lathe");
            check(!rejected.Complete && rejected.Issues.Count > 0 && rejected.Segments.All(s => s.From.Valid && s.To.Valid), "Formato Fanuc ambiguo/non valido rifiutato: " + bad);
        }
    }
}
