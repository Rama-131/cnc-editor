using System.IO.Ports;
using RamaEdit.Core;
namespace RamaEdit.Windows;

public sealed class WindowsSerialDevice : ISerialDevice
{
    readonly SerialPort port; readonly bool hardware; bool disposed;
    public bool HardwareReady => !hardware || port.CtsHolding;
    public event Action<string>? PortError;
    public WindowsSerialDevice(string name, SerialSettings settings)
    {
        settings.Validate();
        hardware = settings.FlowControl is "hardware" or "both";
        port = new SerialPort(name, settings.BaudRate, Enum.Parse<Parity>(settings.Parity, true), settings.DataBits, settings.StopBits == 1.5 ? StopBits.OnePointFive : settings.StopBits == 2 ? StopBits.Two : StopBits.One)
        {
            Handshake = hardware ? Handshake.RequestToSend : Handshake.None,
            ReadTimeout = 150,
            WriteTimeout = settings.Transmit.HandshakeTimeout > 0 ? settings.Transmit.HandshakeTimeout * 1000 : 30000,
            Encoding = System.Text.Encoding.ASCII,
            ParityReplace = 0,
            ReadBufferSize = 65536
        };
        port.ErrorReceived += (_, e) => PortError?.Invoke("Errore seriale " + e.EventType + ". Verificare parità, bit dati e cablaggio.");
        try { port.Open(); if (settings.Port.Dtr is bool dtr) port.DtrEnable = dtr; if (!hardware && settings.Port.Rts is bool rts) port.RtsEnable = rts; }
        catch { port.Dispose(); throw; }
    }
    public async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token)
    {
        byte[] bytes = new byte[buffer.Length];
        int count = await Task.Run(() => { token.ThrowIfCancellationRequested(); try { return port.Read(bytes, 0, bytes.Length); } catch (TimeoutException) { return 0; } }, token);
        bytes.AsMemory(0, count).CopyTo(buffer); return count;
    }
    public async ValueTask WriteAsync(ReadOnlyMemory<byte> bytes, CancellationToken token)
    {
        var data = bytes.ToArray(); await Task.Run(() => { token.ThrowIfCancellationRequested(); port.Write(data, 0, data.Length); }, token);
    }
    public ValueTask DisposeAsync() { if (!disposed) { disposed = true; port.Dispose(); } return ValueTask.CompletedTask; }
}
