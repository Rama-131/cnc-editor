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

await using (var device = new FakeDevice())
{
    var s = new SerialSettings { Delay = 0 }; s.Transmit.WaitForXon = true; s.Transmit.HandshakeTimeout = 1;
    await using var session = new SerialSession(device, s); session.Start();
    var send = session.SendAsync("O1\nM30"); await Task.Delay(50); Check(device.Bytes.Count == 0, "Attesa XON");
    device.Inject("\x11"); await send.WaitAsync(TimeSpan.FromSeconds(3)); Check(device.Bytes.Count > 0, "Riprende dopo XON");
}
await using (var device = new FakeDevice())
{
    var s = new SerialSettings(); s.Receive.StartTrigger = "%"; s.Receive.EndTrigger = "%";
    await using var session = new SerialSession(device, s); string received = ""; session.Received += text => received += text; session.Start();
    await session.StartReceivingAsync(0); device.Inject("%\r\nO1\r\n%"); await Task.Delay(100);
    Check(received == "%\r\nO1\r\n%" && !session.Receiving, "Ricezione con completamento automatico");
}
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
    public ValueTask DisposeAsync() { input.Writer.TryComplete(); return ValueTask.CompletedTask; }
}
