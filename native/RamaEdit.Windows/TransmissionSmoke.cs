using System.IO;
using System.Text;
using System.Threading.Channels;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using RamaEdit.Core;

namespace RamaEdit.Windows;

internal static class TransmissionSmoke
{
    internal static async Task Run(MainWindow window, Action<bool, string> check, Action<FrameworkElement, string> shot)
    {
        var machine = Storage.Defaults().Single(m => m.Id == "mch-mazakhtc400");
        string text = "%\nO0001 (PROVA TRASMISSIONE)\nG0 X10 Z2\nM30\n%";
        window.Navigate("send"); window.SelectTransferMachine(machine.Id);
        window.NewDocument(); window.Documents[^1].Model.Name = "prova_mazak.txt"; window.Editor.Text = text;
        var panel = window.TransmissionDetails;
        await using (var device = new TestDevice { HardwareReady = false, HoldDrain = true })
        {
            var session = new SerialSession(device, machine.Settings); window.AttachSerialSession(session, machine); session.Start();
            try
            {
                var sendButton = FindButton(window, "⇧ INVIA PROGRAMMA")!; var refresh = FindButton(window, "Aggiorna porte")!;
                window.UpdateLayout();
                var row = (Panel)sendButton.Parent; var commands = row.Children.OfType<FrameworkElement>().Where(e => e.IsVisible).ToArray();
                check(sendButton.IsEnabled && sendButton.Background is SolidColorBrush blue && blue.Color.B > 230 && blue.Color.R < 30
                    && commands.Length == 9 && commands[0] is Border && commands[1] is Border && commands[2] == sendButton
                    && commands[3] == FindButton(window, "Invia intervallo") && commands[4] is Button { Content: "Disconnetti porta" } && commands[5] is Button { Content: "Dati ricevuti" }
                    && commands[6] == FindButton(window, "Aggiungi spazi") && commands[7] == FindButton(window, "Crea lista utensili") && commands[8] == refresh,
                    "Trasmissione: Macchina, COM, INVIA PROGRAMMA, Disconnetti, Dati ricevuti, Aggiungi spazi, Lista utensili, Aggiorna nello stesso gruppo");
                check(commands.Zip(commands.Skip(1), (left, right) => right.TranslatePoint(new Point(), row).X - left.TranslatePoint(new Point(left.ActualWidth, 0), row).X).All(gap => gap >= -.5 && gap <= 8),
                    "Comandi di trasmissione adiacenti senza spazio elastico tra invio, strumenti e aggiornamento porte");
                shot(window, "trasmissione-pronta");
                var send = window.SendProgram(session, text, "prova_mazak.txt", machine, machine.PortName);
                await Task.Delay(150); panel.RefreshStatus();
                check(panel.IsExpanded && panel.IsVisible && panel.StatusText.Contains("CTS") && panel.ProgressPercent == 0,
                    "Invia programma apre automaticamente il pannello con attesa CTS e avanzamento reale");
                device.HardwareReady = true; await device.DrainEntered.Task.WaitAsync(TimeSpan.FromSeconds(3));
                device.Inject("\x13"); await Task.Delay(150); device.DrainRelease.TrySetResult(); await Task.Delay(150); panel.RefreshStatus();
                check(panel.StatusText.Contains("XOFF") && panel.ProgressPercent > 0 && panel.ProgressPercent < 100 && panel.CanStop,
                    "Pannello: pausa XOFF, byte confermati e pulsante Interrompi disponibili durante l’invio");
                shot(window, "stato-trasmissione-pausa"); panel.IsExpanded = false;
                session.ReportFault("Errore seriale Frame. Verificare bit dati, parità e cablaggio.");
                try { await send; } catch (IOException) { }
                await window.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                string report = panel.Report();
                check(panel.IsExpanded && !panel.CanStop && panel.StatusText.Contains("Errore") && report.Contains("Frame")
                    && report.Contains("MAZAK HTC 400") && report.Contains(machine.PortName) && report.Contains("prova_mazak.txt") && report.Contains("XOFF ricevuto"),
                    "Errore: pannello riaperto, causa originale e registro conservati con file, macchina e porta");
                var copy = FindButton(panel, "Copia dettagli")!; copy.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                check(Clipboard.GetText() == report, "Copia dettagli copia il resoconto completo con la causa dell’errore");
                shot(window, "stato-trasmissione-errore");
            }
            finally { await window.Connect(); }
        }
        await using (var device = new TestDevice { HardwareReady = false })
        {
            var session = new SerialSession(device, machine.Settings); window.AttachSerialSession(session, machine); session.Start();
            try
            {
                var send = window.SendProgram(session, text, "prova_annullamento.txt", machine, machine.PortName); await Task.Delay(80);
                panel.Append(session, new string('x', 100000));
                string bounded = panel.Report();
                check(bounded.Length < 70000 && bounded.Contains("ultimi 64.000") && bounded.Contains("MAZAK HTC 400"),
                    "Registro lungo limitato senza perdere il riepilogo della connessione");
                FindButton(panel, "■ Interrompi invio")!.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                bool cancelled = false; try { await send; } catch (OperationCanceledException) { cancelled = true; }
                check(cancelled && panel.StatusText.Contains("interrotto") && !panel.CanStop && panel.ProgressPercent == 0,
                    "Interrompi dal pannello annulla l’attesa CTS e conserva lo stato interrotto senza falso 100%");
                var close = FindButton(panel, "Chiudi stato trasmissione")!;
                window.UpdateLayout(); double right = close.TranslatePoint(new Point(close.ActualWidth, 0), panel).X;
                check(close.IsVisible && close.ActualWidth > 0 && right > panel.ActualWidth - 24 && right <= panel.ActualWidth,
                    "X di chiusura visibile a destra dopo l’interruzione dell’invio");
                shot(window, "stato-trasmissione-interrotta");
                close.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                window.Navigate("workspace"); window.Navigate("send");
                check(!panel.IsVisible && !panel.HasTransmission, "X chiude completamente lo stato di trasmissione anche tornando alla pagina");
            }
            finally { await window.Connect(); }
        }
        await using (var device = new TestDevice())
        {
            var session = new SerialSession(device, machine.Settings); window.AttachSerialSession(session, machine); session.Start();
            try
            {
                await window.SendProgram(session, text, "prova_completata.txt", machine, machine.PortName);
                check(panel.IsExpanded && panel.StatusText.Contains("terminato") && panel.ProgressPercent == 100 && !panel.CanStop
                    && !panel.Report().Contains("Frame"), "Nuovo invio: registro precedente azzerato e completamento conservato al 100%");
                shot(window, "stato-trasmissione-completata");
                var originalDocument = window.Editor.Document; string originalText = window.Editor.Text;
                var range = new LineRangeWindow(text, "prova_mazak.txt") { Owner = window }; range.Show();
                try
                {
                    range.First.Text = "3"; range.Last.Text = "4";
                    await window.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                    check(range.SendButton.IsEnabled && range.SelectedSource == "G0 X10 Z2\nM30\n" && range.PreviewText.Text == range.SelectedSource, "Intervallo: anteprima delle righe 3–4 comprese, senza intestazione e senza riga successiva");
                    shot(range, "invia-intervallo");
                    device.Output.SetLength(0);
                    await window.SendProgram(session, range.SelectedSource, "prova_mazak.txt · righe 3–4", machine, machine.PortName);
                    var expected = SerialText.Prepare(range.SelectedSource, machine.Settings).Packets.SelectMany(p => p).ToArray();
                    check(device.Output.ToArray().SequenceEqual(expected) && panel.Report().Contains("righe 3–4"), "Invio intervallo: byte effettivi sulla porta simulata corrispondono alle sole righe scelte con i parametri macchina");
                    check(window.Editor.Document == originalDocument && window.Editor.Text == originalText, "Invio intervallo conserva il documento originale completo");
                    foreach (var invalidRange in new[] { ("0", "4"), ("4", "3"), ("1", "999"), ("abc", "4") })
                    { range.First.Text = invalidRange.Item1; range.Last.Text = invalidRange.Item2; check(!range.SendButton.IsEnabled && range.SelectedSource == "", "Intervallo non valido bloccato: " + invalidRange); }
                    range.First.Text = "3"; range.Last.Text = "3";
                    check(range.SelectedSource == "G0 X10 Z2\n", "Invio di una sola riga");
                    foreach (var eol in new[] { "\r\n", "\n", "\r" })
                    { var doc = new ICSharpCode.AvalonEdit.Document.TextDocument("UNO" + eol + "DUE" + eol + "TRE"); check(LineRangeWindow.Extract(doc, 2, 3) == "DUE" + eol + "TRE", "Intervallo conserva fine riga e ultima riga senza terminatore"); }
                }
                finally { range.Close(); }
                bool invalid = false;
                try { await window.SendProgram(session, "O1 (perché)\nM30", "prova_non_ascii.txt", machine, machine.PortName); } catch (ArgumentException) { invalid = true; }
                check(invalid && panel.StatusText.Contains("Errore") && panel.ProgressPercent == 0 && panel.Report().Contains("ASCII"),
                    "Errore prima dell’invio visibile nel pannello senza riutilizzare il 100% del file precedente");
            }
            finally { await window.Connect(); }
        }
        var receiver = new MainWindow(true);
        await using (var device = new TestDevice())
        {
            try
            {
                receiver.Show(); receiver.Navigate("receive"); receiver.SelectTransferMachine(machine.Id);
                var session = new SerialSession(device, machine.Settings); receiver.AttachSerialSession(session, machine); session.Start();
                await receiver.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle); receiver.UpdateLayout();
                var start = FindButton(receiver, "⇩ AVVIA RICEZIONE")!; var refresh = FindButton(receiver, "Aggiorna porte")!;
                check(start.IsEnabled && start.Content.ToString() == "⇩ AVVIA RICEZIONE" && start.Background is SolidColorBrush green
                    && green.Color.G > 210 && green.Color.R < 50 && ((Panel)start.Parent).Children.OfType<FrameworkElement>().First(e => e.IsVisible) == start
                    && ((Panel)refresh.Parent).Children[((Panel)refresh.Parent).Children.Count - 1] == refresh,
                    "AVVIA RICEZIONE maiuscolo, verde acceso e primo a sinistra; aggiornamento porte all’estremità destra");
                shot(receiver, "ricezione-pronta"); await receiver.Connect();
            }
            finally { receiver.Close(); }
        }
        window.Navigate("workspace");
        check(!panel.IsVisible, "Pannello di trasmissione nascosto in Scrittura / Simulazione");
    }
    static Button? FindButton(DependencyObject root, string name)
    {
        if (root is Button button && AutomationProperties.GetName(button) == name) return button;
        for (int i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++)
            if (FindButton(VisualTreeHelper.GetChild(root, i), name) is { } found) return found;
        return null;
    }
    sealed class TestDevice : ISerialDevice
    {
        public MemoryStream Output { get; } = new();
        readonly Channel<byte[]> input = Channel.CreateUnbounded<byte[]>();
        volatile bool ready = true;
        public bool HardwareReady { get => ready; set => ready = value; }
        public bool HoldDrain { get; init; }
        public TaskCompletionSource DrainEntered { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource DrainRelease { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public void Inject(string text) => input.Writer.TryWrite(Encoding.ASCII.GetBytes(text));
        public async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token)
        {
            var bytes = await input.Reader.ReadAsync(token); bytes.CopyTo(buffer); return bytes.Length;
        }
        public ValueTask WriteAsync(ReadOnlyMemory<byte> bytes, CancellationToken token) { token.ThrowIfCancellationRequested(); Output.Write(bytes.Span); return ValueTask.CompletedTask; }
        public async ValueTask DrainAsync(CancellationToken token)
        {
            DrainEntered.TrySetResult(); if (HoldDrain) await DrainRelease.Task.WaitAsync(token); token.ThrowIfCancellationRequested();
        }
        public void DiscardOutput() { }
        public ValueTask DisposeAsync() { input.Writer.TryComplete(); return ValueTask.CompletedTask; }
    }
}
