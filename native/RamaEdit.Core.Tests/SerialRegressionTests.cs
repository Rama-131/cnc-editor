using System.Text;
using System.Threading.Channels;
using RamaEdit.Core;

static class SerialRegressionTests
{
    public static async Task Run(Action<bool, string> check)
    {
        var mazak = Storage.Defaults().Single(m => m.Id == "mch-mazakhtc400");
        var settings = mazak.Settings;
        check(settings.BaudRate == 9600 && settings.DataBits == 7 && settings.StopBits == 2 && settings.Parity == "even"
            && settings.FlowControl == "both" && settings.Port.Dtr == true && settings.Port.Rts == true
            && !settings.Port.CheckParity && settings.Transmit.HandshakeTimeout == 0 && !settings.Transmit.WaitForXon,
            "Mazak: parametri 9600 7E2, BOTH, DTR/RTS, USEPARITY=0 e TRAN_TIMEOUT=0 del file MCH originale");
        var legacyPort = System.Text.Json.JsonSerializer.Deserialize<PortOptions>("{\"dtr\":true,\"rts\":true}", Storage.Json)!;
        check(!legacyPort.CheckParity, "Profili già salvati: USEPARITY=0 conservato senza cambiare la parità even del collegamento");
        string source = "%\nO0001 (MAZAK)\n" + new string(' ', 100) + "G0 X10\nM30\n%";
        byte[] expected = SerialText.Prepare(source, settings).Packets.SelectMany(p => p).ToArray();

        await using (var device = new QueuedDevice { HardwareReady = false })
        await using (var session = new SerialSession(device, settings))
        {
            session.Start(); var send = session.SendAsync(source);
            await Task.Delay(80);
            check(!send.IsCompleted && device.WriteCalls == 0, "Mazak BOTH: nessun byte prima del CTS, senza richiedere un XON iniziale non configurato");
            check(session.GetTransmissionStatus() is { Phase: TransmissionPhase.WaitingForCts, SentBytes: 0 } status && status.TotalBytes == expected.Length,
                "Stato trasmissione: attesa CTS e byte totali del piano disponibili prima della scrittura");
            device.HardwareReady = true;
            await send.WaitAsync(TimeSpan.FromSeconds(3));
            check(device.Output.SequenceEqual(expected) && !session.Faulted, "Mazak: trasmissione completa identica al piano, senza perdita di byte o alterazione dei blocchi");
            check(session.GetTransmissionStatus() is { Phase: TransmissionPhase.Completed, Percent: 100 } done && done.SentBytes == expected.Length,
                "Stato terminato al 100% solo dopo lo svuotamento della coda");
        }

        await using (var device = new QueuedDevice { HoldDrain = true })
        await using (var session = new SerialSession(device, settings))
        {
            var xoff = Signal(); var xon = Signal();
            session.Log += s => { if (s.Contains("XOFF ricevuto")) xoff.TrySetResult(); if (s.Contains("XON ricevuto")) xon.TrySetResult(); };
            session.Start(); var send = session.SendAsync(source);
            await device.DrainEntered.Task.WaitAsync(TimeSpan.FromSeconds(3));
            check(device.WriteCalls == 1 && !send.IsCompleted, "Un solo frammento accodato: invio incompleto finché il driver ha dati in uscita");
            device.Inject("\x13"); await xoff.Task.WaitAsync(TimeSpan.FromSeconds(3));
            device.DrainRelease.TrySetResult(); await Task.Delay(80);
            check(device.WriteCalls == 1 && !send.IsCompleted, "XOFF durante lo svuotamento della coda impedisce di accodare il resto del programma");
            check(session.GetTransmissionStatus().Phase == TransmissionPhase.PausedByXoff, "Stato trasmissione: pausa XOFF distinguibile da attesa CTS");
            device.HardwareReady = false; device.Inject("\x11"); await xon.Task.WaitAsync(TimeSpan.FromSeconds(3));
            await Task.Delay(80);
            check(device.WriteCalls == 1 && !send.IsCompleted, "BOTH: XON da solo non scavalca il CTS disattivato durante l’invio");
            check(session.GetTransmissionStatus().Phase == TransmissionPhase.WaitingForCts, "Stato trasmissione: XON ripristinato ma attesa CTS ancora visibile");
            device.HardwareReady = true;
            await send.WaitAsync(TimeSpan.FromSeconds(3));
            check(device.Output.SequenceEqual(expected) && device.MaxWrite <= 32 && !session.Faulted,
                "XON riprende dallo stesso byte: file identico, frammenti limitati e controllo combinato rispettato");
        }

        await using (var device = new QueuedDevice { HoldDrain = true })
        await using (var session = new SerialSession(device, settings))
        {
            session.Start(); var send = session.SendAsync(source);
            await device.DrainEntered.Task.WaitAsync(TimeSpan.FromSeconds(3)); session.CancelSend();
            bool cancelled = false;
            try { await send.WaitAsync(TimeSpan.FromSeconds(3)); } catch (OperationCanceledException) { cancelled = true; }
            check(cancelled && !session.Sending && !session.Faulted && device.DiscardCalls == 1 && device.Pending == 0,
                "Interrompi annulla anche la coda del driver; nessun falso successo e nessun invio residuo");
            check(session.GetTransmissionStatus() is { Phase: TransmissionPhase.Cancelled, SentBytes: 0, Percent: 0 },
                "Stato interrotto senza conteggiare i byte annullati nella coda");
        }

        await using (var device = new QueuedDevice { HoldDrain = true })
        await using (var session = new SerialSession(device, settings))
        {
            var warning = Signal(); int errors = 0;
            session.Log += s => { if (s.Contains("RXParity")) warning.TrySetResult(); }; session.Error += _ => errors++;
            session.Start(); var send = session.SendAsync(source);
            await device.DrainEntered.Task.WaitAsync(TimeSpan.FromSeconds(3));
            session.ReportFault("Errore seriale RXParity.", parityOnly: true);
            await warning.Task.WaitAsync(TimeSpan.FromSeconds(3));
            check(!session.Faulted && errors == 0 && !send.IsCompleted, "USEPARITY=0: sola segnalazione RXParity registrata senza interrompere l’invio");
            device.DrainRelease.TrySetResult(); await send.WaitAsync(TimeSpan.FromSeconds(3));
            check(device.Output.SequenceEqual(expected) && settings.Parity == "even", "Ignorare la sola verifica RXParity non cambia i byte trasmessi né il formato 7E2");
        }

        foreach (bool parityCheck in new[] { false, true })
        {
            var configured = Storage.Clone(settings); configured.Port.CheckParity = parityCheck;
            await using var device = new QueuedDevice { HoldDrain = true };
            await using var session = new SerialSession(device, configured);
            string firstError = parityCheck ? "Errore seriale RXParity." : "Errore seriale Frame.";
            int errors = 0; string? shown = null; session.Error += s => { errors++; shown = s; };
            session.Start(); var send = session.SendAsync(source); await device.DrainEntered.Task.WaitAsync(TimeSpan.FromSeconds(3));
            session.ReportFault(firstError, parityOnly: parityCheck); session.ReportFault("Errore secondario durante l’annullamento.");
            bool cancelled = false;
            try { await send.WaitAsync(TimeSpan.FromSeconds(3)); } catch (OperationCanceledException) { cancelled = true; }
            check(cancelled && session.Faulted && errors == 1 && shown == session.FaultMessage && shown!.Contains(firstError)
                && !shown.Contains("secondario") && device.Pending == 0,
                parityCheck ? "Controllo parità attivo: stop, coda annullata e causa RXParity originale conservata"
                    : "USEPARITY=0 non ignora errori Frame: stop, coda annullata e causa originale conservata");
            check(session.GetTransmissionStatus() is { Phase: TransmissionPhase.Failed } failed && failed.Error == shown,
                "Il monitor riceve il motivo originale dell’errore e lo conserva dopo il termine dell’invio");
        }

        await using (var device = new QueuedDevice { FailDrain = true })
        await using (var session = new SerialSession(device, settings))
        {
            session.Start(); bool timedOut = false;
            try { await session.SendAsync(source).WaitAsync(TimeSpan.FromSeconds(3)); } catch (TimeoutException) { timedOut = true; }
            check(timedOut && session.Faulted && session.FaultMessage!.Contains("CTS") && device.DiscardCalls == 1 && device.Pending == 0,
                "Timeout del driver: messaggio preciso conservato e coda annullata prima di un nuovo tentativo");
        }
        await using (var device = new QueuedDevice())
        {
            var limited = Storage.Clone(settings); limited.Transmit.StopAfter = 5;
            await using var session = new SerialSession(device, limited); session.Start();
            check(await session.SendAsync(source) && session.GetTransmissionStatus() is { Phase: TransmissionPhase.Limited, SentBytes: 5, TotalBytes: 5 },
                "Invio limitato distinto dal completamento del file anche quando i byte previsti dal limite sono tutti usciti");
        }
    }

    static TaskCompletionSource Signal() => new(TaskCreationOptions.RunContinuationsAsynchronously);
    sealed class QueuedDevice : ISerialDevice
    {
        readonly Channel<byte[]> input = Channel.CreateUnbounded<byte[]>();
        readonly List<byte> output = []; readonly object gate = new();
        volatile bool ready = true; int writes, pending, discards, maxWrite;
        public bool HardwareReady { get => ready; set => ready = value; }
        public bool HoldDrain { get; init; } public bool FailDrain { get; init; }
        public int WriteCalls => Volatile.Read(ref writes); public int Pending => Volatile.Read(ref pending);
        public int DiscardCalls => Volatile.Read(ref discards); public int MaxWrite => maxWrite;
        public byte[] Output { get { lock (gate) return output.ToArray(); } }
        public TaskCompletionSource DrainEntered { get; } = Signal();
        public TaskCompletionSource DrainRelease { get; } = Signal();
        public void Inject(string text) => input.Writer.TryWrite(Encoding.ASCII.GetBytes(text));
        public async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token)
        {
            var data = await input.Reader.ReadAsync(token); data.CopyTo(buffer); return data.Length;
        }
        public ValueTask WriteAsync(ReadOnlyMemory<byte> bytes, CancellationToken token)
        {
            token.ThrowIfCancellationRequested(); lock (gate) output.AddRange(bytes.ToArray());
            maxWrite = Math.Max(maxWrite, bytes.Length); Interlocked.Add(ref pending, bytes.Length); Interlocked.Increment(ref writes);
            return ValueTask.CompletedTask;
        }
        public async ValueTask DrainAsync(CancellationToken token)
        {
            DrainEntered.TrySetResult();
            if (FailDrain) throw new TimeoutException("Tempo limite di uscita scaduto: verifica CTS.");
            if (HoldDrain) await DrainRelease.Task.WaitAsync(token);
            token.ThrowIfCancellationRequested(); Interlocked.Exchange(ref pending, 0);
        }
        public void DiscardOutput() { Interlocked.Increment(ref discards); Interlocked.Exchange(ref pending, 0); }
        public ValueTask DisposeAsync() { input.Writer.TryComplete(); return ValueTask.CompletedTask; }
    }
}
