using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Automation;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using RamaEdit.Core;

namespace RamaEdit.Windows;

public static class NativeSmoke
{
    public static async Task Run(App app, string[] args)
    {
        app.ShutdownMode = ShutdownMode.OnExplicitShutdown; int index = Array.IndexOf(args, "--smoke-test"); string folder = index + 1 < args.Length ? args[index + 1] : "smoke-results"; Directory.CreateDirectory(folder);
        MainWindow? w = null; var checks = new List<string>();
        void Check(bool value, string text) { if (!value) throw new Exception(text); checks.Add(text); }
        void Shot(FrameworkElement element, string name)
        {
            element.UpdateLayout(); var bmp = new RenderTargetBitmap((int)Math.Ceiling(element.ActualWidth), (int)Math.Ceiling(element.ActualHeight), 96, 96, PixelFormats.Pbgra32); bmp.Render(element);
            var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(bmp)); using var file = File.Create(Path.Combine(folder, name + ".png")); encoder.Save(file);
        }
        bool VisibleButton(FrameworkElement root, string name)
        {
            if (root is Button b && AutomationProperties.GetName(b) == name && b.IsVisible) return true;
            for (int i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++)
                if (VisualTreeHelper.GetChild(root, i) is FrameworkElement child && VisibleButton(child, name)) return true;
            return false;
        }
        Button? NamedButton(DependencyObject root, string name)
        {
            if (root is Button button && AutomationProperties.GetName(button) == name) return button;
            for (int i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++)
                if (NamedButton(VisualTreeHelper.GetChild(root, i), name) is { } found) return found;
            return null;
        }
        CheckBox? FindCheckBox(DependencyObject root, string name)
        {
            if (root is CheckBox checkbox && checkbox.Content?.ToString() == name) return checkbox;
            for (int i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++)
                if (FindCheckBox(VisualTreeHelper.GetChild(root, i), name) is { } match) return match;
            return null;
        }
        bool LineHasColor(ICSharpCode.AvalonEdit.TextEditor editor, int lineNumber, string hex)
        {
            var line = editor.TextArea.TextView.VisualLines.FirstOrDefault(l => l.FirstDocumentLine.LineNumber == lineNumber);
            var color = (Color)ColorConverter.ConvertFromString(hex);
            return line is not null && line.Elements.Any(e => e.TextRunProperties.ForegroundBrush is SolidColorBrush brush && brush.Color == color);
        }
        try
        {
            var mazakSerial = Storage.Defaults().Single(m => m.Id == "mch-mazakhtc400").Settings;
            using (var port = WindowsSerialDevice.CreatePort("COM1", mazakSerial))
                Check(!port.IsOpen && port.WriteTimeout == System.IO.Ports.SerialPort.InfiniteTimeout && port.BaudRate == 9600
                    && port.DataBits == 7 && port.Parity == System.IO.Ports.Parity.Even && port.StopBits == System.IO.Ports.StopBits.Two
                    && port.Handshake == System.IO.Ports.Handshake.RequestToSend,
                    "Porta Mazak Windows: 7E2, CTS e timeout zero realmente illimitato, senza aprire una porta fisica");
            var finiteSerial = Storage.Clone(mazakSerial); finiteSerial.Transmit.HandshakeTimeout = 2;
            using (var port = WindowsSerialDevice.CreatePort("COM1", finiteSerial))
                Check(port.WriteTimeout == 2000, "Porta Windows: timeout finito del profilo conservato");
            w = new MainWindow(true); app.MainWindow = w; w.Show(); await w.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle); await Task.Delay(150);
            Check(w.Title == AppInfo.DisplayName && w.Title.Contains(AppInfo.Version) && w.Editor.IsLoaded, "Avvio dell’editor WPF con versione del programma nel titolo");
            Check(WindowPlacement.IsInsideWorkArea(w) && WindowPlacement.HasCaptionButtons(w), "Finestra iniziale intera sullo schermo, barra titolo e pulsanti Windows presenti");
            var work = SystemParameters.WorkArea;
            w.Left = work.Left - 350; w.Top = work.Top - 250; w.Width = Math.Max(w.MinWidth, work.Width + 300); w.Height = Math.Max(w.MinHeight, work.Height + 300);
            WindowPlacement.EnsureVisible(w); await w.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
            Check(WindowPlacement.IsInsideWorkArea(w) && WindowPlacement.HasCaptionButtons(w), "Recupero della finestra troppo grande e fuori schermo");

            Check(w.Foreground is SolidColorBrush ink && ink.Color.R > 150 && w.Background is SolidColorBrush background && background.Color.R < 50, "Contrasto del tema scuro nella finestra principale");
            Check(w.CurrentSimulation.Complete && w.CurrentSimulation.Segments.Count > 10, "Simulazione fresatura iniziale");
            await w.CloseDocument(w.Documents[0]);
            Check(w.Documents.Count == 0 && w.Editor.IsReadOnly, "Chiusura di tutte le schede");
            w.NewDocument(); await w.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
            Check(!w.Editor.IsReadOnly && VisibleButton(w, "Aggiungi spazi") && VisibleButton(w, "Trova / sostituisci") && VisibleButton(w, "Salva"), "Nuovo dopo chiusura di tutte le schede ripristina editor e comandi");
            w.UpdateLayout();
            var workspaceNav = NamedButton(w, "Scrittura / Simulazione")!; var sendNav = NamedButton(w, "Trasmissione")!; var receiveNav = NamedButton(w, "Ricezione")!;
            var fileTab = NamedButton(w, w.Documents[0].Model.Name)!; var undo = NamedButton(w, "Annulla")!;
            Check(Math.Abs(workspaceNav.TranslatePoint(new Point(), w).Y - fileTab.TranslatePoint(new Point(), w).Y) <= 2,
                "Pulsante Scrittura della barra laterale allineato alla riga delle schede file");
            Check(Math.Abs(sendNav.TranslatePoint(new Point(), w).Y - undo.TranslatePoint(new Point(), w).Y) <= 1
                && Math.Abs(sendNav.ActualHeight - undo.ActualHeight) <= 1 && Math.Abs(sendNav.ActualHeight - receiveNav.ActualHeight) <= .5,
                "INVIA laterale allineato ai tasti funzione; INVIA e RICEVI della stessa altezza dei tasti funzione");
            w.NewDocument(); w.Editor.Document.Insert(0, "G1 X12\nM30"); w.RebuildSimulation(); Check(w.Documents.Count == 2 && w.CurrentSimulation.Segments[^1].To.X == 12, "Schede e aggiornamento simulazione");
            w.Editor.Undo(); Check(w.Editor.Text.Length == 0, "Annulla dell’editor nativo"); w.Editor.Redo(); Check(w.Editor.Text.Contains("X12"), "Ripristina dell’editor nativo");
            string path = Path.Combine(Path.GetTempPath(), "rama-smoke-" + Guid.NewGuid().ToString("N") + ".txt");
            try
            {
                File.WriteAllText(path, Storage.Resource<Dictionary<string, string>>("samples")["fanuc"]); w.OpenPath(path); var doc = w.Documents[^1]; w.SetMachineType("lathe"); w.RebuildSimulation();
                Check(w.CurrentSimulation.Complete && w.CurrentSimulation.Steps.Any(s => s.Action?.Contains("G70") == true), "Programma reale Fanuc G71 e G70");
                Shot(w, "scrittura-simulazione");
                w.Navigate("send"); await w.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                Check(!w.Editor.IsReadOnly && Math.Abs(w.Editor.ActualWidth - w.WorkspaceWidth) < 2, $"Trasmissione con editor a tutta larghezza ({w.Editor.ActualWidth:0}/{w.WorkspaceWidth:0})"); Shot(w, "trasmissione");
                w.Navigate("receive"); await w.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                Check(w.Editor.IsReadOnly && w.Editor.Text.Length == 0 && Math.Abs(w.Editor.ActualWidth - w.WorkspaceWidth) < 2, $"Ricezione separata e vuota a tutta larghezza ({w.Editor.ActualWidth:0}/{w.WorkspaceWidth:0})"); Shot(w, "ricezione");
                string raw = "%\r\nO9001\r\n" + string.Concat(Enumerable.Repeat("G1 X1\r\n", 30000)) + "M30\r\n%\r\n";
                await Task.Run(() => { for (int i = 0; i < raw.Length; i += 137) w.AcceptReceived(raw.Substring(i, Math.Min(137, raw.Length - i))); });
                await Task.Delay(350); await w.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                Check(w.Editor.Text == raw, "Ricezione oltre 200.000 caratteri: nessuna perdita di dati e CR/LF conservati");

                var bigliaWindow = new MainWindow(true);
                try
                {
                    bigliaWindow.SelectTransferMachine("mch-biglias131"); bigliaWindow.Navigate("receive"); bigliaWindow.Show();
                    var filter = new ReceptionFilter(Storage.Defaults().Single(m => m.Id == "mch-biglias131").Settings.Receive);
                    string wire = "\x12%\r\n\r\n\r\n:0118\r\n\r\n\r\nN10G10P0Z4.6\r\n\r\n\r\nN20T707G97S1400M3\r\n\r\n\r\nN30G0X0Z2M8\r\n\r\n\r\nN40G1Z-7.65F0.06\r\n\r\n\r\nM30\r\n\r\n\r\n%\r\n";
                    foreach (char c in wire) bigliaWindow.AcceptReceived(filter.Push(c.ToString()));
                    bigliaWindow.AcceptReceived(filter.Finish());
                    await Task.Delay(200); await bigliaWindow.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                    Check(bigliaWindow.Editor.Text == "%\r\n:0118\r\nN10G10P0Z4.6\r\nN20T707G97S1400M3\r\nN30G0X0Z2M8\r\nN40G1Z-7.65F0.06\r\nM30\r\n%\r\n", "Ricezione Biglia visualizzata senza righe vuote e senza DC2, un blocco per riga");
                    Shot(bigliaWindow, "ricezione-biglia");
                    int beforeReception = bigliaWindow.Documents.Count; string clean = bigliaWindow.Editor.Text;
                    bigliaWindow.CompleteReception("Ricezione terminata per inattività.");
                    await bigliaWindow.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                    var incoming = bigliaWindow.Documents[^1];
                    Check(bigliaWindow.Documents.Count == beforeReception + 1 && incoming.Model.Dirty && incoming.Model.Path is null && incoming.Model.Machine == "lathe" && bigliaWindow.CurrentSimulation.Complete && bigliaWindow.Editor.Document == incoming.Text && !bigliaWindow.Editor.IsReadOnly && incoming.Text.Text == clean && VisibleButton(bigliaWindow, "ricevuto.txt ●"), "Fine ricezione: nuova scheda attiva modificabile, Tornio, nome TXT e programma ancora da salvare");
                    Shot(bigliaWindow, "ricevuto-in-scrittura");
                    bigliaWindow.CompleteReception("Notifica duplicata.");
                    Check(bigliaWindow.Documents.Count == beforeReception + 1, "Una sola scheda per ricezione, anche con notifiche ripetute");
                    bigliaWindow.Navigate("receive");
                    Check(bigliaWindow.Editor.Text.Length == 0, "La ricezione successiva inizia da un documento vuoto");
                    // The explicit command also recovers a draft produced by an old version.
                    bigliaWindow.AcceptReceived(wire);
                    Check(bigliaWindow.OpenReceivedProgram() && bigliaWindow.Documents.Count == beforeReception + 2 && bigliaWindow.Documents[^1].Model.Name == "ricevuto_2.txt" && bigliaWindow.Editor.Text == clean && incoming.Text.Text == clean, "Apri in scrittura pulisce il vecchio testo Biglia e crea un nome distinto senza sovrascrivere il primo programma");

                }
                finally { bigliaWindow.Close(); }

                w.Navigate("workspace"); Check(w.Editor.Text == doc.Text.Text && w.Documents.Count == 3, "Il cambio pagina conserva i documenti");
                var fanucWindow = new MainWindow(true);
                try
                {
                    fanucWindow.Show();
                    foreach (var example in FanucExamples.All)
                    {
                        fanucWindow.Documents[^1].Model.Name = example.Name;
                        fanucWindow.SetMachineType(example.System == "A" ? "lathe" : "lathe-iso");
                        fanucWindow.Editor.Text = example.Text; fanucWindow.RebuildSimulation();
                        await fanucWindow.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                        Check(fanucWindow.CurrentSimulation.Complete && fanucWindow.CurrentSimulation.Segments.Count > 0 && fanucWindow.Documents[^1].Model.LatheSystem == example.System && VisibleButton(fanucWindow, "Dettagli"), "Simulazione Fanuc Windows: " + example.Name);
                        if (example.Name.Contains("g71_interno"))
                        {
                            Check(fanucWindow.CurrentSimulation.Segments.Count(s => !s.Rapid && s.Action?.StartsWith("G71 · passata ") == true) == 2, "G71 interno della foto completato con due passate, senza errore tasche");
                            Shot(fanucWindow, "fanuc-g71-interno");
                            var showRapids = FindCheckBox(fanucWindow, "Rapidi");
                            Check(showRapids is not null, "Selettore rapido visibile"); showRapids!.IsChecked = false;
                            await fanucWindow.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                            Check(!fanucWindow.Preview.ShowRapids, "Nascondi rapidi centra i soli movimenti di lavorazione");
                            Shot(fanucWindow, "fanuc-g71-interno-dettaglio"); showRapids.IsChecked = true;
                        }
                        if (example.Name.Contains("g76")) Shot(fanucWindow, "fanuc-g76");
                        if (example.Name.Contains("g72")) Shot(fanucWindow, "fanuc-g72");
                        if (example.Name.Contains("iso_g90")) Shot(fanucWindow, "fanuc-iso");
                    }
                }
                finally { fanucWindow.Close(); }
                var colors = w.CreateColorSettings(); colors.Show(); await colors.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                Check(VisibleButton(colors, "Campione Rapido · G0") && VisibleButton(colors, "Campione Lineare · G1 e cicli"), "Campioni colore visibili per rapido e lavorazione");
                Check(LineHasColor(colors.PreviewEditor, 5, "#FFFF55") && LineHasColor(colors.PreviewEditor, 6, "#00D5AF") && LineHasColor(colors.PreviewEditor, 8, "#28B8FF") && LineHasColor(colors.PreviewEditor, 9, "#3986FF"), "Palette delle foto: G0 giallo, G1 turchese, G2 azzurro, G3 blu");
                Check(colors.PreviewEditor.Background is SolidColorBrush bg && bg.Color == (Color)ColorConverter.ConvertFromString("#101418") && colors.PreviewEditor.TextArea.SelectionBrush is SolidColorBrush selection && selection.Color == (Color)ColorConverter.ConvertFromString("#164B73"), "Sfondo scuro e selezione blu applicati");
                Shot(colors, "colori");
                colors.SetColor("rapid", "#FFB347"); colors.SetColor("cut", "#B38CFF"); colors.SetColor("cw", "#65C7F7"); colors.SetColor("ccw", "#527BFF"); colors.SetMotionStyle(true);
                await colors.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                Check(LineHasColor(colors.PreviewEditor, 5, "#FFB347") && LineHasColor(colors.PreviewEditor, 6, "#B38CFF") && LineHasColor(colors.PreviewEditor, 7, "#B38CFF"), "Anteprima G0 e G1, compreso il movimento modale senza G ripetuto");
                Check(LineHasColor(colors.PreviewEditor, 1, "#60F340"), "I commenti mantengono il proprio colore");
                Check(LineHasColor(colors.PreviewEditor, 8, "#65C7F7") && LineHasColor(colors.PreviewEditor, 9, "#527BFF"), "Colori dei due tipi di arco modificabili separatamente");
                Shot(colors, "colori-personalizzati");
                colors.ApplyChanges(); await w.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                Check(w.Preview.RapidBrush is SolidColorBrush rb && rb.Color == (Color)ColorConverter.ConvertFromString("#FFB347") &&
                      w.Preview.WorkingBrush is SolidColorBrush wb && wb.Color == (Color)ColorConverter.ConvertFromString("#B38CFF") &&
                      w.Preview.ClockwiseBrush is SolidColorBrush cw && cw.Color == (Color)ColorConverter.ConvertFromString("#65C7F7") &&
                      w.Preview.CounterclockwiseBrush is SolidColorBrush ccw && ccw.Color == (Color)ColorConverter.ConvertFromString("#527BFF"), "Colori scelti applicati anche al disegno principale");
                Shot(w, "colori-applicati");
                var settings = new MachineSettingsWindow(Storage.Defaults(), null) { Owner = w }; settings.Show(); await settings.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                Check(settings.IsLoaded && settings.Foreground is SolidColorBrush settingsInk && settingsInk.Color.R > 150, "Configuratore macchine WPF con etichette leggibili");
                Check(FindCheckBox(settings, "Controlla errori di parità ricevuti") is { IsChecked: false }, "Verifica degli errori parità selezionabile e disattivata come nei profili MCH originali");
                Shot(settings, "impostazioni"); settings.Close();
                await TransmissionSmoke.Run(w, Check, Shot);
                await RecentFilesSmoke.Run(w, Check, Shot);
                await EditorContextMenuSmoke.Run(Check, Shot);
            }
            finally { File.Delete(path); }
            File.WriteAllText(Path.Combine(folder, "result.json"), JsonSerializer.Serialize(new { success = true, checks }, Storage.Json)); w.Close(); app.Shutdown(0);
        }
        catch (Exception e)
        {
            File.WriteAllText(Path.Combine(folder, "result.json"), JsonSerializer.Serialize(new { success = false, checks, error = e.ToString() }, Storage.Json)); w?.Close(); app.Shutdown(1);
        }
    }
}
