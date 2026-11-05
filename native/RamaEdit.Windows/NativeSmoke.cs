using System.IO;
using System.Text.Json;
using System.Windows;
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
        try
        {
            w = new MainWindow(true); app.MainWindow = w; w.Show(); await w.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle); await Task.Delay(150);
            Check(w.Title == "Rama Edit" && w.Editor.IsLoaded, "Avvio dell’editor WPF");
            Check(w.CurrentSimulation.Complete && w.CurrentSimulation.Segments.Count > 10, "Simulazione fresatura iniziale");
            w.NewDocument(); w.Editor.Document.Insert(0, "G1 X12\nM30"); w.RebuildSimulation(); Check(w.Documents.Count == 2 && w.CurrentSimulation.Segments[^1].To.X == 12, "Schede e aggiornamento simulazione");
            w.Editor.Undo(); Check(w.Editor.Text.Length == 0, "Annulla dell’editor nativo"); w.Editor.Redo(); Check(w.Editor.Text.Contains("X12"), "Ripristina dell’editor nativo");
            string path = Path.Combine(Path.GetTempPath(), "rama-smoke-" + Guid.NewGuid().ToString("N") + ".txt");
            try
            {
                File.WriteAllText(path, Storage.Resource<Dictionary<string, string>>("samples")["fanuc"]); w.OpenPath(path); var doc = w.Documents[^1]; doc.Model.Machine = "lathe"; w.RebuildSimulation();
                Check(w.CurrentSimulation.Complete && w.CurrentSimulation.Steps.Any(s => s.Action?.Contains("G70") == true), "Programma reale Fanuc G71 e G70");
                Shot(w, "scrittura-simulazione");
                w.Navigate("send"); await w.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                Check(!w.Editor.IsReadOnly && w.Editor.ActualWidth > 1000, "Trasmissione con editor a tutta larghezza"); Shot(w, "trasmissione");
                w.Navigate("receive"); await w.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                Check(w.Editor.IsReadOnly && w.Editor.Text.Length == 0 && w.Editor.ActualWidth > 1000, "Ricezione separata e vuota a tutta larghezza"); Shot(w, "ricezione");
                w.Navigate("workspace"); Check(w.Editor.Text == doc.Text.Text && w.Documents.Count == 3, "Il cambio pagina conserva i documenti");
                var settings = new MachineSettingsWindow(Storage.Defaults(), null) { Owner = w }; settings.Show(); await settings.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                Check(settings.IsLoaded, "Configuratore macchine WPF"); Shot(settings, "impostazioni"); settings.Close();
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
