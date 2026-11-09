using System.IO.Ports;
using System.IO;
using RamaEdit.Core;
namespace RamaEdit.Windows;

public sealed class WindowsSerialDevice : ISerialDevice
{
    readonly SerialPort port; readonly bool hardware; readonly int timeoutSeconds; bool disposed;
    public bool HardwareReady => !hardware || port.CtsHolding;
    public event Action<string, bool>? PortError;
    public WindowsSerialDevice(string name, SerialSettings settings)
    {
        settings.Validate();
        hardware = settings.FlowControl is "hardware" or "both";
        timeoutSeconds = settings.Transmit.HandshakeTimeout;
        port = CreatePort(name, settings);
        port.ErrorReceived += (_, e) => PortError?.Invoke("Errore seriale " + e.EventType + ". Verificare parità, bit dati e cablaggio.", e.EventType == SerialError.RXParity);
        try { port.Open(); if (settings.Port.Dtr is bool dtr) port.DtrEnable = dtr; if (!hardware && settings.Port.Rts is bool rts) port.RtsEnable = rts; }
        catch { port.Dispose(); throw; }
    }
    internal static SerialPort CreatePort(string name, SerialSettings settings)
    {
        settings.Validate();
        return new SerialPort(name, settings.BaudRate, Enum.Parse<Parity>(settings.Parity, true), settings.DataBits, settings.StopBits == 1.5 ? StopBits.OnePointFive : settings.StopBits == 2 ? StopBits.Two : StopBits.One)
        {
            Handshake = settings.FlowControl is "hardware" or "both" ? Handshake.RequestToSend : Handshake.None,
            ReadTimeout = 150,
            WriteTimeout = settings.Transmit.HandshakeTimeout > 0 ? settings.Transmit.HandshakeTimeout * 1000 : SerialPort.InfiniteTimeout,
            Encoding = System.Text.Encoding.ASCII,
            ParityReplace = 0,
            ReadBufferSize = 65536
        };
    }
    public async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token)
    {
        byte[] bytes = new byte[buffer.Length];
        int count = await Task.Run(() => { token.ThrowIfCancellationRequested(); try { return port.Read(bytes, 0, bytes.Length); } catch (TimeoutException) { return 0; } }, token);
        bytes.AsMemory(0, count).CopyTo(buffer); return count;
    }
    public async ValueTask WriteAsync(ReadOnlyMemory<byte> bytes, CancellationToken token)
    {
        var data = bytes.ToArray();
        using var registration = token.Register(DiscardOutput);
        try { await Task.Run(() => { token.ThrowIfCancellationRequested(); port.Write(data, 0, data.Length); }, token); token.ThrowIfCancellationRequested(); }
        catch (Exception) when (token.IsCancellationRequested) { throw new OperationCanceledException(token); }
        catch (TimeoutException e) { throw new TimeoutException("Tempo limite di scrittura seriale scaduto. Verifica CTS e la ricezione sulla CNC. " + e.Message, e); }
    }
    public async ValueTask DrainAsync(CancellationToken token)
    {
        long started = Environment.TickCount64;
        while (port.BytesToWrite > 0)
        {
            token.ThrowIfCancellationRequested();
            if (timeoutSeconds > 0 && Environment.TickCount64 - started >= timeoutSeconds * 1000L) throw new TimeoutException("Tempo limite di uscita scaduto: dati ancora in coda sulla porta. Verifica CTS e lo stato di ricezione della CNC.");
            await Task.Delay(2, token);
        }
        token.ThrowIfCancellationRequested();
    }
    public void DiscardOutput()
    {
        try { if (port.IsOpen) port.DiscardOutBuffer(); }
        catch (Exception e) when (e is IOException or InvalidOperationException) { }
    }
    public ValueTask DisposeAsync() { if (!disposed) { disposed = true; port.Dispose(); } return ValueTask.CompletedTask; }
}
