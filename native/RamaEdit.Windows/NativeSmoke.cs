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
        bool LineHasColor(ICSharpCode.AvalonEdit.TextEditor editor, int lineNumber, string hex)
        {
            var line = editor.TextArea.TextView.VisualLines.FirstOrDefault(l => l.FirstDocumentLine.LineNumber == lineNumber);
            var color = (Color)ColorConverter.ConvertFromString(hex);
            return line is not null && line.Elements.Any(e => e.TextRunProperties.ForegroundBrush is SolidColorBrush brush && brush.Color == color);
        }
        try
        {
            w = new MainWindow(true); app.MainWindow = w; w.Show(); await w.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle); await Task.Delay(150);
            Check(w.Title == "Rama Edit" && w.Editor.IsLoaded, "Avvio dell’editor WPF");
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
            Check(!w.Editor.IsReadOnly && VisibleButton(w, "Aggiungi spazi") && VisibleButton(w, "Trova / sostituisci") && VisibleButton(w, "↓ Salva"), "Nuovo dopo chiusura di tutte le schede ripristina editor e comandi");
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

                w.Navigate("workspace"); Check(w.Editor.Text == doc.Text.Text && w.Documents.Count == 3, "Il cambio pagina conserva i documenti");
                var colors = w.CreateColorSettings(); colors.Show(); await colors.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                Check(VisibleButton(colors, "Campione Rapido · G0") && VisibleButton(colors, "Campione Lavorazione · G1/G2/G3"), "Campioni colore visibili per rapido e lavorazione");
                Shot(colors, "colori");
                colors.SetColor("rapid", "#FFB347"); colors.SetColor("cut", "#B38CFF"); colors.SetMotionStyle(true);
                await colors.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                Check(LineHasColor(colors.PreviewEditor, 5, "#FFB347") && LineHasColor(colors.PreviewEditor, 6, "#B38CFF") && LineHasColor(colors.PreviewEditor, 7, "#B38CFF"), "Anteprima G0 e G1, compreso il movimento modale senza G ripetuto");
                Check(LineHasColor(colors.PreviewEditor, 1, "#7DFF6A"), "I commenti mantengono il proprio colore");
                Shot(colors, "colori-personalizzati");
                colors.ApplyChanges(); await w.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                Check(w.Preview.RapidBrush is SolidColorBrush rb && rb.Color == (Color)ColorConverter.ConvertFromString("#FFB347") &&
                      w.Preview.WorkingBrush is SolidColorBrush wb && wb.Color == (Color)ColorConverter.ConvertFromString("#B38CFF"), "Colori scelti applicati anche al disegno principale");
                Shot(w, "colori-applicati");
                var settings = new MachineSettingsWindow(Storage.Defaults(), null) { Owner = w }; settings.Show(); await settings.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                Check(settings.IsLoaded && settings.Foreground is SolidColorBrush settingsInk && settingsInk.Color.R > 150, "Configuratore macchine WPF con etichette leggibili"); Shot(settings, "impostazioni"); settings.Close();
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
