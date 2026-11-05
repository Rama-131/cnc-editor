using System.Text;
using System.Text.RegularExpressions;
namespace RamaEdit.Core;

public record Transmission(List<byte[]> Packets, bool Limited) { public int Total => Packets.Sum(p => p.Length); }
public static class SerialText
{
    public const int MaxReceived = 2 * 1024 * 1024;
    public static string Control(string text)
    {
        var result = new StringBuilder();
        for (int i = 0; i < text.Length; i++)
        {
            if (text[i] != '\\') { result.Append(text[i]); continue; }
            var m = Regex.Match(text[(i + 1)..], @"^\d{1,3}");
            if (m.Success) { int code = int.Parse(m.Value); if (code > 127) throw new ArgumentException("I codici ASCII devono essere tra 0 e 127."); result.Append((char)code); i += m.Length; }
            else { if (++i >= text.Length) throw new ArgumentException("Sequenza ASCII incompleta."); result.Append(text[i] switch { 'r' => '\r', 'n' => '\n', 't' => '\t', '\\' => '\\', _ => throw new ArgumentException(@"Sequenza non valida: usa \13\10, \17, \19 o \\.") }); }
        }
        if (result.ToString().Any(c => c > 127)) throw new ArgumentException("Le sequenze seriali richiedono caratteri ASCII.");
        return result.ToString();
    }
    public static string Eol(string value) => value switch { "CRLF" => "\r\n", "CR" => "\r", "LF" => "\n", _ => throw new ArgumentException("Fine riga non valido.") };
    public static Transmission Prepare(string source, SerialSettings settings)
    {
        settings.Validate(); var t = settings.Transmit; string start = Control(t.StartTrigger), end = Control(t.EndTrigger); int offset = 0;
        if (start.Length > 0) { int at = source.IndexOf(start, StringComparison.Ordinal); if (at < 0) throw new ArgumentException("Trigger d’inizio non trovato."); source = source[at..]; offset = start.Length; }
        if (end.Length > 0) { int at = source.IndexOf(end, offset, StringComparison.Ordinal); if (at < 0) throw new ArgumentException("Trigger di fine non trovato."); source = source[..(at + end.Length)]; }
        var remove = (Control(t.RemoveCharacters) + (t.RemoveNul ? "\0" : "")).ToHashSet(); string ignore = Control(t.IgnoreLines);
        var lines = source.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n').Where(l => ignore.Length == 0 || !l.Contains(ignore, StringComparison.Ordinal)).Select(l =>
        {
            var s = new string(l.Where(c => !remove.Contains(c)).ToArray()); if (t.TabsToSpaces) s = s.Replace("\t", "    "); if (t.RemoveSpaces) s = s.Replace(" ", ""); return s;
        }).ToList();
        if (lines.Any(l => l.Any(c => c != '\t' && (c < 32 || c > 126)))) throw new ArgumentException("La trasmissione richiede testo ASCII. Rimuovere caratteri accentati o simboli anche dai commenti.");
        while (lines.Count > 0 && lines[^1].Length == 0) lines.RemoveAt(lines.Count - 1);
        if (!lines.Any(l => l.Trim().Length > 0 && l.Trim() != "%")) throw new ArgumentException("Il programma è vuoto.");
        if (settings.Wrap) { if (lines[0].Trim() != "%") lines.Insert(0, "%"); if (lines[^1].Trim() != "%") lines.Add("%"); }
        string eol = t.CustomLineEnding ? Control(t.LineEndingSequence) : Eol(settings.LineEnding);
        var packets = new[] { Control(t.BeforeFile) }.Concat(lines.Select(l => l + eol)).Concat([Control(t.AfterFile)]).Where(s => s.Length > 0).Select(Encoding.ASCII.GetBytes).ToList();
        int total = packets.Sum(p => p.Length); bool limited = t.StopAfter > 0 && t.StopAfter < total;
        if (limited) { int left = t.StopAfter; packets = packets.Select(p => { var bytes = p[..Math.Min(p.Length, left)]; left -= bytes.Length; return bytes; }).Where(p => p.Length > 0).ToList(); }
        return new(packets, limited);
    }
}
public class ReceptionFilter
{
    readonly ReceiveOptions options; readonly string start, end, discard, omit; readonly HashSet<char> remove;
    string pending = "", line = ""; bool started; public bool Done { get; private set; }
    public ReceptionFilter(ReceiveOptions options)
    {
        this.options = options; start = SerialText.Control(options.StartTrigger); end = SerialText.Control(options.EndTrigger); started = start.Length == 0;
        remove = SerialText.Control(options.RemoveCharacters).ToHashSet();
        if (options.RemoveControls) for (int i = 0; i < 32; i++) if (i is not (10 or 13)) remove.Add((char)i);
        discard = SerialText.Control(options.DiscardLineCharacters); omit = SerialText.Control(options.OmitLineString);
    }
    public string Push(string text)
    {
        if (Done) return ""; pending += text; string output = "";
        if (!started)
        {
            int at = pending.IndexOf(start, StringComparison.Ordinal);
            if (at < 0) { pending = start.Length > 1 ? pending[Math.Max(0, pending.Length - start.Length + 1)..] : ""; return ""; }
            pending = pending[(at + start.Length)..]; started = true; output = start;
        }
        if (end.Length > 0)
        {
            int at = pending.IndexOf(end, StringComparison.Ordinal);
            if (at >= 0) { output += pending[..(at + end.Length)]; pending = ""; Done = true; }
            else { int keep = Math.Min(end.Length - 1, pending.Length); output += pending[..(pending.Length - keep)]; pending = pending[(pending.Length - keep)..]; }
        }
        else { output += pending; pending = ""; }
        return Filter(output, Done);
    }
    public string Finish() { if (!started || Done) return ""; string tail = pending; pending = ""; return Filter(tail, true); }
    string Filter(string text, bool final)
    {
        text = new string(text.Where(c => !remove.Contains(c)).ToArray());
        if (discard.Length == 0 && omit.Length == 0 && !options.OmitEmpty && options.LineEnding == "auto") return text;
        line += text; if (line.Length > SerialText.MaxReceived) throw new InvalidDataException("Riga ricevuta oltre 2 MB.");
        var result = new StringBuilder();
        void Emit(string body, string eol)
        {
            if (discard.Any(body.Contains) || (omit.Length > 0 && body.Contains(omit, StringComparison.Ordinal)) || (options.OmitEmpty && string.IsNullOrWhiteSpace(body))) return;
            result.Append(body).Append(eol.Length > 0 && options.LineEnding != "auto" ? SerialText.Eol(options.LineEnding) : eol);
        }
        while (true)
        {
            int at = line.IndexOfAny(['\r', '\n']); if (at < 0 || (!final && at == line.Length - 1 && line[at] == '\r')) break;
            int size = line[at..].StartsWith("\r\n", StringComparison.Ordinal) ? 2 : 1; Emit(line[..at], line.Substring(at, size)); line = line[(at + size)..];
        }
        if (final && line.Length > 0) { Emit(line, ""); line = ""; }
        return result.ToString();
    }
}
public interface ISerialDevice : IAsyncDisposable
{
    bool HardwareReady { get; }
    ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token);
    ValueTask WriteAsync(ReadOnlyMemory<byte> bytes, CancellationToken token);
}
public sealed class SerialSession : IAsyncDisposable
{
    readonly ISerialDevice device; readonly SerialSettings settings; readonly CancellationTokenSource life = new(); readonly SemaphoreSlim writer = new(1, 1); readonly object gate = new();
    Task? reader; ReceptionFilter? filter; bool faulted, sending; volatile bool paused; volatile bool flowSeen;
    DateTime lastReceived; int receivedLength; CancellationTokenSource? sendCancel;
    public bool Receiving { get { lock (gate) return filter is not null; } }
    public bool Sending => sending; public bool Faulted => faulted;
    public event Action<string>? Received; public event Action<string>? Log; public event Action<string>? Error; public event Action<string>? ReceptionEnded;
    public SerialSession(ISerialDevice device, SerialSettings settings) { settings.Validate(); this.device = device; this.settings = Storage.Clone(settings); }
    public void Start() { if (reader is not null) throw new InvalidOperationException("Collegamento già avviato."); reader = ReadLoop(); }
    public void ReportFault(string message) => Fault(message);
    void Fault(string message) { lock (gate) { faulted = true; filter = null; } sendCancel?.Cancel(); Error?.Invoke(message + " I dati ricevuti sono conservati. Ricollega la porta prima di continuare."); }
    async Task ReadLoop()
    {
        byte[] buffer = new byte[4096]; byte xon = (byte)SerialText.Control(settings.Port.Xon)[0], xoff = (byte)SerialText.Control(settings.Port.Xoff)[0];
        try
        {
            while (!life.IsCancellationRequested)
            {
                int count = await device.ReadAsync(buffer, life.Token);
                if (count == 0)
                {
                    bool timeout; lock (gate) timeout = filter is not null && settings.Receive.Timeout > 0 && (DateTime.UtcNow - lastReceived).TotalSeconds >= settings.Receive.Timeout;
                    if (timeout) await StopReceivingAsync("Ricezione terminata per inattività."); continue;
                }
                var text = new StringBuilder();
                for (int i = 0; i < count; i++)
                {
                    byte b = buffer[i];
                    if (settings.FlowControl is "software" or "both" && (b == xon || b == xoff)) { paused = b == xoff; if (b == xon) flowSeen = true; continue; }
                    if (b > 127) throw new InvalidDataException("Ricevuto un byte non ASCII. Verifica parità e bit dati.");
                    text.Append((char)b);
                }
                if (text.Length == 0) continue; string raw = text.ToString(); Log?.Invoke(raw);
                bool done = false;
                lock (gate)
                {
                    if (filter is not null)
                    {
                        lastReceived = DateTime.UtcNow; Deliver(filter.Push(raw)); done = filter.Done;
                        if (done) filter = null;
                    }
                }
                if (done) { if (settings.FlowControl is "software" or "both" || settings.Receive.SendXon) await SendControl(settings.Port.Xoff); ReceptionEnded?.Invoke("Ricezione terminata al trigger finale."); }
            }
        }
        catch (OperationCanceledException) when (life.IsCancellationRequested) { }
        catch (Exception e) { if (!life.IsCancellationRequested) Fault(e.Message); }
    }
    void Deliver(string text)
    {
        if (receivedLength + text.Length > SerialText.MaxReceived) throw new InvalidDataException("Limite di ricezione di 2 MB raggiunto. Salva il file prima di continuare.");
        receivedLength += text.Length; if (text.Length > 0) Received?.Invoke(text);
    }
    public async Task StartReceivingAsync(int currentLength)
    {
        lock (gate)
        {
            if (faulted || sending || filter is not null) throw new InvalidOperationException("Porta occupata o in errore.");
            receivedLength = currentLength; filter = new(settings.Receive); lastReceived = DateTime.UtcNow;
        }
        try { if (settings.Receive.Initial.Length > 0) await SendControl(settings.Receive.Initial); if (settings.Receive.SendXon) await SendControl(settings.Port.Xon); }
        catch { lock (gate) filter = null; throw; }
    }
    public async Task StopReceivingAsync(string reason = "Ricezione terminata.")
    {
        lock (gate) { if (filter is null) return; Deliver(filter.Finish()); filter = null; }
        try { if (settings.FlowControl is "software" or "both" || settings.Receive.SendXon) await SendControl(settings.Port.Xoff); }
        finally { ReceptionEnded?.Invoke(reason); }
    }
    async Task SendControl(string text)
    {
        byte[] bytes = Encoding.ASCII.GetBytes(SerialText.Control(text)); if (bytes.Length == 0) return;
        await writer.WaitAsync(life.Token); try { await device.WriteAsync(bytes, life.Token); } finally { writer.Release(); }
    }
    public void CancelSend() => sendCancel?.Cancel();
    public async Task<bool> SendAsync(string source, IProgress<double>? progress = null)
    {
        var plan = SerialText.Prepare(source, settings);
        lock (gate) { if (faulted || sending || filter is not null) throw new InvalidOperationException("Porta occupata o in errore."); sending = true; }
        sendCancel = CancellationTokenSource.CreateLinkedTokenSource(life.Token); var token = sendCancel.Token;
        try
        {
            int sent = 0; DateTime waiting = DateTime.UtcNow;
            foreach (var packet in plan.Packets)
            {
                if (settings.Transmit.BeforeLineDelay + settings.Delay > 0) await Task.Delay(settings.Transmit.BeforeLineDelay + settings.Delay, token);
                for (int i = 0; i < packet.Length; i += 32)
                {
                    while (paused || (settings.Transmit.WaitForXon && !flowSeen) || !device.HardwareReady)
                    {
                        token.ThrowIfCancellationRequested();
                        if (faulted) throw new IOException("Porta seriale in errore.");
                        if (settings.Transmit.HandshakeTimeout > 0 && (DateTime.UtcNow - waiting).TotalSeconds >= settings.Transmit.HandshakeTimeout) throw new TimeoutException("Tempo limite handshake scaduto. Verifica XON e CTS.");
                        await Task.Delay(10, token);
                    }
                    int size = Math.Min(32, packet.Length - i);
                    await writer.WaitAsync(token); try { await device.WriteAsync(packet.AsMemory(i, size), token); } finally { writer.Release(); }
                    sent += size; waiting = DateTime.UtcNow; progress?.Report(100d * sent / plan.Total);
                }
            }
            return plan.Limited;
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception e) { Fault(e.Message); throw; }
        finally { lock (gate) sending = false; sendCancel.Dispose(); sendCancel = null; }
    }
    public async ValueTask DisposeAsync()
    {
        life.Cancel(); sendCancel?.Cancel(); await device.DisposeAsync(); if (reader is not null) await reader;
        lock (gate) filter = null;
    }
}
