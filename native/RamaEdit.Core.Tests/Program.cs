using RamaEdit.Core;
using System.Text.Json;
using System.Text;
using System.Threading.Channels;

int checks = 0;
void Check(bool value, string message) { checks++; if (!value) throw new Exception(message); }
void Near(double a, double b, string message) => Check(Math.Abs(a - b) <= Math.Max(1e-8, Math.Abs(b) * 1e-9), $"{message}: {a} != {b}");
// Startup bounds must fit complete work areas at common laptop resolutions,
// scaling factors and monitor positions, including a monitor above/left of primary.
foreach (var area in new[] {
    new WindowBounds(0, 0, 1366, 728),
    new WindowBounds(0, 32, 1366 / 1.25, 728 / 1.25),
    new WindowBounds(0, 0, 1366 / 1.5, 728 / 1.5),
    new WindowBounds(-1920, -200, 1920, 1040),
    new WindowBounds(3840, 120, 1920, 1040),
    new WindowBounds(0, 0, 3840, 2120)
})
{
    var fit = WindowGeometry.Center(area, 1440, 920);
    Check(fit.Left >= area.Left && fit.Top >= area.Top && fit.Right <= area.Right && fit.Bottom <= area.Bottom, "Finestra intera nell’area disponibile");
    Check(fit.Width > 0 && fit.Height > 0 && fit.Width <= 1440 && fit.Height <= 920, "Dimensioni iniziali limitate");
    Near(fit.Left + fit.Width / 2, area.Left + area.Width / 2, "Centratura orizzontale");
    Near(fit.Top + fit.Height / 2, area.Top + area.Height / 2, "Centratura verticale");
}
var fixtures = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures/parity.json")));
foreach (var fixture in fixtures.RootElement.EnumerateArray())
{
    string source = fixture.GetProperty("source").GetString()!, machine = fixture.GetProperty("machine").GetString()!;
    var r = Simulator.Simulate(source, machine, fixture.GetProperty("diameter").GetBoolean()); var expected = fixture.GetProperty("expected");
    Check(r.Complete == expected.GetProperty("complete").GetBoolean(), "Complete: " + source);
    Near(r.Distance, expected.GetProperty("distance").GetDouble(), "Distanza");
    var segments = expected.GetProperty("segments").EnumerateArray().ToArray();
    Check(r.Segments.Count == segments.Length, "Conteggio segmenti: " + source);
    for (int i = 0; i < segments.Length; i++)
    {
        var s = segments[i]; var a = r.Segments[i];
        foreach (var (point, key) in new[] { (a.From, "from"), (a.To, "to") })
            for (int axis = 0; axis < 3; axis++) Near(point[axis], s.GetProperty(key).GetProperty(new[] { "x", "y", "z" }[axis]).GetDouble(), $"Geometria {i}/{axis}");
        Check(a.Line == s.GetProperty("line").GetInt32() && a.Rapid == s.GetProperty("rapid").GetBoolean() && a.Origin == s.GetProperty("origin").GetString(), "Riga/modalità/origine segmento");
    }
    var steps = expected.GetProperty("steps").EnumerateArray().ToArray();
    Check(r.Steps.Count == steps.Length, "Conteggio passi");
    for (int i = 0; i < steps.Length; i++)
    {
        var e = steps[i]; var a = r.Steps[i]; Check(a.Line == e.GetProperty("line").GetInt32() && a.Origin == e.GetProperty("origin").GetString() && a.SegmentCount == e.GetProperty("segmentCount").GetInt32(), "Stato passo");
        for (int axis = 0; axis < 3; axis++) Near(a.Position[axis], e.GetProperty("position").GetProperty(new[] { "x", "y", "z" }[axis]).GetDouble(), "Posizione passo");
    }
    if (!r.Complete) Check(r.Issues[0].Line == expected.GetProperty("issues")[0].GetProperty("line").GetInt32(), "Riga errore");
}
FanucTests.Run(Check, Near);
var oldPalette = new Dictionary<string, string> { ["g"] = "#123ABC", ["comment"] = "#80FF80" };
var restoredPalette = AppearancePalette.Restore(oldPalette);
Check(restoredPalette["g"] == "#123ABC" && restoredPalette["comment"] == "#80FF80" && restoredPalette.ContainsKey("rapid") && restoredPalette.ContainsKey("cut"), "Recupero vecchi colori con rapido/lavorazione nuovi");
Check(AppearancePalette.MotionStyle(oldPalette) && !AppearancePalette.MotionStyle(new Dictionary<string, string> { ["_style"] = "tokens" }), "Stile dei movimenti e scelta per codice salvabile");
var motionKinds = EditorMotion.Classify("(G0 X99)\nG90 G54\nG0 X10\nZ5\nM3\nG1 Z-2\nX30 (G0)\nG2 X40 I5\nG4 X1\nG10 P0 Z-10\nG1 X20\nG80\nX40\nG0 X50");
var expectedKinds = new[] { MotionColorKind.None, MotionColorKind.None, MotionColorKind.Rapid, MotionColorKind.Rapid, MotionColorKind.None, MotionColorKind.Working, MotionColorKind.Working, MotionColorKind.Clockwise, MotionColorKind.None, MotionColorKind.None, MotionColorKind.Working, MotionColorKind.None, MotionColorKind.None, MotionColorKind.Rapid };
Check(motionKinds.SequenceEqual(expectedKinds), "Colori modali G0/G1/G2, commenti ignorati, soste e G10 senza falso movimento");
Check(EditorMotion.Classify("G0 X10\n(commento (G1 X99)\nfine)\nX20\nG3 X30").SequenceEqual(new[] { MotionColorKind.Rapid, MotionColorKind.None, MotionColorKind.None, MotionColorKind.Rapid, MotionColorKind.Counterclockwise }), "Commenti multilinea e annidati non cambiano il colore modale");
Check(EditorMotion.Classify("G81 X10 Z-5\nX20\nG80\nX30").SequenceEqual(new[] { MotionColorKind.Working, MotionColorKind.Working, MotionColorKind.None, MotionColorKind.None }), "Colore dei cicli di lavorazione e annullamento");
var modalArcs = EditorMotion.Classify("G2 X10 I5\rX20 I5\rG3 X30 I5\rX40 I5\rG1 X50");
Check(modalArcs.SequenceEqual(new[] { MotionColorKind.Clockwise, MotionColorKind.Clockwise, MotionColorKind.Counterclockwise, MotionColorKind.Counterclockwise, MotionColorKind.Working }), "Archi G2/G3 modali distinti, anche con fine riga CR");
Check(EditorMotion.Classify("G2 I5 J0\nI5 J0").All(k => k == MotionColorKind.Clockwise), "Colore dei cerchi completi definiti con il solo centro modale");
var arcColors = Simulator.Simulate("G0 X0 Y0\nG2 X10 Y0 I5 J0\nX20 Y0 I5 J0\nG3 X30 Y0 I5 J0\nX40 Y0 I5 J0\nG1 X50 Y0");
Check(arcColors.Complete && arcColors.Segments.Where(s => s.Line is 2 or 3).All(s => s.Motion == 2) && arcColors.Segments.Where(s => s.Line is 4 or 5).All(s => s.Motion == 3) && arcColors.Segments[^1].Motion == 1 && arcColors.Segments[0].Motion == 0, "Il disegno conserva G2/G3 su tutti i segmenti interpolati e modali");
var customPalette = AppearancePalette.Restore(new Dictionary<string, string> { ["cw"] = "#123ABC", ["ccw"] = "#789DEF", ["background"] = "#101010" });
var savedPalette = JsonSerializer.Deserialize<Dictionary<string, string>>(JsonSerializer.Serialize(AppearancePalette.Saveable(customPalette, false)))!;
Check(!AppearancePalette.HasReferencePreset(oldPalette) && AppearancePalette.HasReferencePreset(savedPalette) && !AppearancePalette.MotionStyle(savedPalette) && AppearancePalette.Restore(savedPalette)["cw"] == "#123ABC" && AppearancePalette.Restore(savedPalette)["background"] == "#101010", "Il preset distingue la vecchia palette e conserva le personalizzazioni successive");
var machines = Storage.Defaults();
Check(machines.Count == 7 && machines.Any(m => m.Name.Contains("QUARTZ")), "Sette macchine importate");
foreach (var m in machines) Check(Storage.Clone(m).Settings.BaudRate == m.Settings.BaudRate, "Persistenza parametri");
Check(ProgramTools.AddSpaces("N10G1X20Z-5F0.2M8 (X1M9)\n#1=20") == "N10 G1 X20 Z-5 F0.2 M8 (X1M9)\n#1=20", "Aggiungi spazi conserva commenti e macro");
Check(ProgramTools.Adjust("G1 F100 (F20)\n; F40\nS500", "F", 120) == "G1 F120 (F20)\n; F40\nS500", "Aggiusta ignora commenti");
var tools = ProgramTools.Tools("T2 (PUNTA)\nM6\nG43 H3\nT4\nM98 H50\nT2 M6", "mill");
Check(tools.Tools.Count == 2 && tools.Tools[0].Changes == 2 && tools.Tools[0].Offset == "H3" && tools.Tools[1].Changes == 0, "Utensili attivi, preselezioni, H esterno");
Check(ProgramTools.Tools("T0101 (ESTERNO)\nT1212", "lathe").Tools[0].Offset == "Offset 01", "Utensili tornio");
Check(ProgramTools.CodeInfo("G090", "lathe").Title.Contains("Ciclo"), "Descrizioni tornio");
Check(ProgramTools.CodeInfo("G090", "mill").Title.Contains("assolute"), "Descrizioni fresatrice");
var settings = new SerialSettings { Delay = 0 };
var tx = SerialText.Prepare("O1\nG1 X10\nM30", settings);
Check(Encoding.ASCII.GetString(tx.Packets.SelectMany(b => b).ToArray()) == "%\r\nO1\r\nG1 X10\r\nM30\r\n%\r\n", "Fine riga e delimitatori");
bool rejected = false; try { SerialText.Prepare("O1 (à)", settings); } catch (ArgumentException) { rejected = true; }
Check(rejected, "ASCII validato prima di scrivere");
var rx = new ReceptionFilter(new() { StartTrigger = "%", EndTrigger = "%", LineEnding = "CRLF", OmitLineString = "SKIP" });
string filtered = rx.Push("noise%O1\r") + rx.Push("\nSKIP ME\r\nG1 X10\r\n%tail") + rx.Finish();
Check(filtered == "%O1\r\nG1 X10\r\n%" && rx.Done, "Trigger spezzati e filtri di ricezione");
var exact = new ReceptionFilter(new()); Check(exact.Push("%\r") + exact.Push("\nO1\r\n") + exact.Finish() == "%\r\nO1\r\n", "CRLF raw conservato");


// Reproduce the Biglia report: DC2 leader and two empty rows between blocks.
var biglia = Storage.Defaults().Single(m => m.Id == "mch-biglias131");
var bigliaLines = new[] { "%", ":0118", "N10G10P0Z4.6", "N20T707G97S1400M3", "N30G0X0Z2M8", "N40G1Z-7.65F0.06", "(PUNTA  8 HSS\tCONTROLLO)", "M30", "%" };
string expectedBiglia = string.Join("\r\n", bigliaLines) + "\r\n";
var bigliaPreview = Simulator.Simulate(expectedBiglia, "lathe");
Check(bigliaPreview.Complete && bigliaPreview.Segments.Count == 2 && bigliaPreview.Segments[0].Line == 5 && bigliaPreview.Segments[1].Line == 6, "Anteprima Biglia: intestazione :0118 riconosciuta, movimenti e numeri di riga conservati");
foreach (string eol in new[] { "\r\n\r\n\r\n", "\r\r\n", "\n\r\r", "\n\n\n", "\r\r\r" })
{
    string wire = "\x12\0" + string.Join(eol, bigliaLines) + eol + "\x14";
    for (int split = 0; split <= wire.Length; split++)
    {
        var filter = new ReceptionFilter(biglia.Settings.Receive);
        string clean = filter.Push(wire[..split]) + filter.Push(wire[split..]) + filter.Finish();
        Check(clean == expectedBiglia, "Biglia: un blocco per riga con CR/LF spezzati, senza DC2 e senza alterare testo o commenti");
    }
    var singleBytes = new ReceptionFilter(biglia.Settings.Receive); var singleOutput = new StringBuilder();
    foreach (char c in wire) singleOutput.Append(singleBytes.Push(c.ToString()));
    singleOutput.Append(singleBytes.Finish());
    Check(singleOutput.ToString() == expectedBiglia, "Biglia: risultato identico ricevendo un carattere per volta");
}
var legacyBiglia = Storage.Clone(biglia); legacyBiglia.ReceiveFormatVersion = 0;
legacyBiglia.Settings.Receive.LineEnding = "auto"; legacyBiglia.Settings.Receive.OmitEmpty = false; legacyBiglia.Settings.Receive.RemoveCharacters = @"\0";
legacyBiglia.PortName = "COM14"; legacyBiglia.Settings.BaudRate = 19200;
var otherMachine = Storage.Defaults()[0]; string otherBefore = JsonSerializer.Serialize(otherMachine, Storage.Json);
Check(Storage.UpgradeReceiveProfiles(new[] { legacyBiglia, otherMachine }) && legacyBiglia.ReceiveFormatVersion == 1 && legacyBiglia.Settings.Receive.OmitEmpty && legacyBiglia.Settings.Receive.LineEnding == "CRLF" && SerialText.Control(legacyBiglia.Settings.Receive.RemoveCharacters).Contains((char)18), "Aggiornamento dei profili Biglia già salvati");
Check(legacyBiglia.PortName == "COM14" && legacyBiglia.Settings.BaudRate == 19200 && JsonSerializer.Serialize(otherMachine, Storage.Json) == otherBefore, "Aggiornamento limitato al formato di ricezione Biglia, parametri porta e altre macchine conservati");
legacyBiglia.Settings.Receive.OmitEmpty = false;
Check(!Storage.UpgradeReceiveProfiles(new[] { legacyBiglia }) && !legacyBiglia.Settings.Receive.OmitEmpty, "Le scelte successive dell’utente non vengono sovrascritte");
var triggeredBiglia = Storage.Clone(biglia.Settings.Receive); triggeredBiglia.StartTrigger = "%"; triggeredBiglia.EndTrigger = "%";
var triggeredFilter = new ReceptionFilter(triggeredBiglia);
Check(triggeredFilter.Push("\x12%\r\n\r\n:0118\r\n\r\n%\x14") == "%\r\n:0118\r\n%" && triggeredFilter.Done, "Pulizia Biglia compatibile con i trigger di inizio e fine");

await using (var bigliaDevice = new FakeDevice())
{
    await using var bigliaSession = new SerialSession(bigliaDevice, biglia.Settings);
    var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously); string actualBiglia = "";
    bigliaSession.Received += text => { actualBiglia += text; if (actualBiglia.Length >= expectedBiglia.Length) ready.TrySetResult(); };
    bigliaSession.Error += text => ready.TrySetException(new Exception(text));
    bigliaSession.Start(); await bigliaSession.StartReceivingAsync(0);
    string wire = "\x12\0" + string.Join("\r\n\r\n\r\n", bigliaLines) + "\r\n\r\n\r\n\x14";
    for (int i = 0; i < wire.Length; i += 7) bigliaDevice.Inject(wire.Substring(i, Math.Min(7, wire.Length - i)));
    await ready.Task.WaitAsync(TimeSpan.FromSeconds(3)); await bigliaSession.StopReceivingAsync();
    Check(actualBiglia == expectedBiglia && !bigliaSession.Receiving && !bigliaSession.Faulted, "Ricezione Biglia completa attraverso la sessione seriale, senza righe vuote o perdita di blocchi");
}

await using (var device = new FakeDevice())
{
    var s = new SerialSettings { Delay = 0 }; s.Transmit.WaitForXon = true; s.Transmit.HandshakeTimeout = 1;
    await using var session = new SerialSession(device, s); session.Start();
    var send = session.SendAsync("O1\nM30"); await Task.Delay(50); Check(device.Bytes.Count == 0, "Attesa XON");
    Check(session.GetTransmissionStatus().Phase == TransmissionPhase.WaitingForXon, "Monitor distingue l’attesa XON iniziale dalle altre pause");
    device.Inject("\x11"); await send.WaitAsync(TimeSpan.FromSeconds(3)); Check(device.Bytes.Count > 0, "Riprende dopo XON");
}
await using (var device = new FakeDevice())
{
    var s = new SerialSettings(); s.Receive.StartTrigger = "%"; s.Receive.EndTrigger = "%";
    await using var session = new SerialSession(device, s); string received = ""; session.Received += text => received += text; session.Start();
    await session.StartReceivingAsync(0); device.Inject("%\r\nO1\r\n%"); await Task.Delay(100);
    Check(received == "%\r\nO1\r\n%" && !session.Receiving, "Ricezione con completamento automatico");
}
await SerialRegressionTests.Run(Check);
Console.WriteLine($"Rama Edit: {checks} verifiche superate, {fixtures.RootElement.GetArrayLength()} programmi equivalenti alla versione web.");

sealed class FakeDevice : ISerialDevice
{
    readonly Channel<byte[]> input = Channel.CreateUnbounded<byte[]>(); public List<byte> Bytes { get; } = []; public bool HardwareReady => true;
    public void Inject(string text) => input.Writer.TryWrite(Encoding.ASCII.GetBytes(text));
    public async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token); timeout.CancelAfter(50);
        try { var data = await input.Reader.ReadAsync(timeout.Token); data.CopyTo(buffer); return data.Length; } catch (OperationCanceledException) when (!token.IsCancellationRequested) { return 0; }
    }
    public ValueTask WriteAsync(ReadOnlyMemory<byte> bytes, CancellationToken token) { Bytes.AddRange(bytes.ToArray()); return ValueTask.CompletedTask; }
    public ValueTask DrainAsync(CancellationToken token) => ValueTask.CompletedTask;
    public void DiscardOutput() { }
    public ValueTask DisposeAsync() { input.Writer.TryComplete(); return ValueTask.CompletedTask; }
}
