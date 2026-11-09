namespace RamaEdit.Core;

public enum TransmissionPhase { Idle, Sending, PausedByXoff, WaitingForXon, WaitingForCts, Completed, Limited, Cancelled, Failed }
public sealed record TransmissionStatus(TransmissionPhase Phase, int SentBytes = 0, int TotalBytes = 0, string? Error = null)
{
    public double Percent => TotalBytes > 0 ? 100d * SentBytes / TotalBytes : 0;
}
