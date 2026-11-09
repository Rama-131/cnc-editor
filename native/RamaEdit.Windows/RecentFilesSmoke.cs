using System.IO;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using RamaEdit.Core;

namespace RamaEdit.Windows;

internal static class RecentFilesSmoke
{
    internal static async Task Run(MainWindow window, Action<bool, string> check, Action<FrameworkElement, string> shot)
    {
        string folder = Path.Combine(Path.GetTempPath(), "rama-recenti-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(folder, "Tornio")); Directory.CreateDirectory(Path.Combine(folder, "Fresa"));
        string first = Path.Combine(folder, "Tornio", "SETUP1.txt"), second = Path.Combine(folder, "Fresa", "SETUP1.txt"), third = Path.Combine(folder, "PROVA_MAZAK.txt");
        try
        {
            window.Navigate("workspace"); window.Activate();
            File.WriteAllText(first, "G0 X10\nM30"); File.WriteAllText(second, "G0 X20\nM30"); File.WriteAllText(third, "G0 X30\nM30");
            window.RestoreRecentFiles([]);
            window.OpenPath(first); var dirty = window.Documents[^1]; window.Editor.Document.Insert(0, "(MODIFICHE NON SALVATE)\n");
            window.OpenPath(second); var closed = window.Documents[^1]; window.OpenPath(third); var missing = window.Documents[^1];
            var arrow = FindButton(window, "File recenti")!; arrow.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            await window.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
            var menu = window.RecentFilesMenu;
            for (int i = 0; i < 100 && (!menu.IsVisible || menu.ActualWidth <= 0 || menu.ActualHeight <= 0); i++) await Task.Delay(20);
            check(menu.IsOpen && menu.Items.OfType<MenuItem>().Where(i => i.Tag is string).Select(i => (string)i.Tag).SequenceEqual(new[] { third, second, first }),
                "Freccia Apri apre il menu con i file dal più recente e percorsi distinti per nomi uguali");
            check(menu.IsVisible && menu.ActualWidth > 0 && menu.ActualHeight > 0, $"Menu recenti caricato e visibile (aperto {menu.IsOpen}, caricato {menu.IsLoaded}, visibile {menu.IsVisible}, template {menu.Template is not null}, {menu.ActualWidth:0}x{menu.ActualHeight:0}, previsto {menu.DesiredSize})");
            shot(menu, "file-recenti-menu"); shot(window, "apri-file-recenti");
            int before = window.Documents.Count;
            menu.IsOpen = false;
            menu.Items.OfType<MenuItem>().Single(i => Equals(i.Tag, first)).RaiseEvent(new RoutedEventArgs(MenuItem.ClickEvent));
            check(window.Documents.Count == before && window.Editor.Document == dirty.Text && window.Editor.Text.StartsWith("(MODIFICHE NON SALVATE)")
                && window.RecentFilePaths[0] == first && window.RecentFilePaths.Count(p => string.Equals(p, first, StringComparison.OrdinalIgnoreCase)) == 1,
                "File già aperto riattivato dal menu senza duplicati e senza perdere modifiche non salvate");
            await window.CloseDocument(closed); window.ShowRecentFiles(); menu.IsOpen = false;
            menu.Items.OfType<MenuItem>().Single(i => Equals(i.Tag, second)).RaiseEvent(new RoutedEventArgs(MenuItem.ClickEvent));
            check(window.Editor.Text.Contains("X20") && window.Documents.Any(d => d.Model.Path == second) && window.RecentFilePaths[0] == second,
                "Selezione di un file recente chiuso lo riapre dal disco");
            await window.CloseDocument(missing); File.Delete(third); before = window.Documents.Count;
            window.ShowRecentFiles(); menu.IsOpen = false;
            menu.Items.OfType<MenuItem>().Single(i => Equals(i.Tag, third)).RaiseEvent(new RoutedEventArgs(MenuItem.ClickEvent));
            check(window.Documents.Count == before && window.RecentFilePaths.Contains(third), "File non disponibile segnalato senza aprire schede vuote o perdere il riferimento");
            window.RestoreRecentFiles(Enumerable.Range(0, 25).Select(i => Path.Combine(folder, $"programma_{i}.txt")));
            window.OpenPath(first); var saved = Storage.Clone(new WorkspaceState { RecentFiles = window.RecentFilePaths.ToList() });
            string[] expected = window.RecentFilePaths.ToArray(); window.RestoreRecentFiles(saved.RecentFiles!);
            check(window.RecentFilePaths.Count == 20 && window.RecentFilePaths.SequenceEqual(expected) && window.RecentFilePaths[0] == first,
                "Ultimi venti file conservati nello stato della sessione con ordine e riapertura corretti");
            window.ShowRecentFiles(); menu.IsOpen = false;
            menu.Items.OfType<MenuItem>().Single(i => Equals(i.Header, "Svuota lista")).RaiseEvent(new RoutedEventArgs(MenuItem.ClickEvent));
            saved = Storage.Clone(new WorkspaceState { RecentFiles = window.RecentFilePaths.ToList() });
            window.RestoreRecentFiles(saved.RecentFiles!); window.ShowRecentFiles();
            check(window.RecentFilePaths.Count == 0 && saved.RecentFiles is { Count: 0 } && menu.Items.OfType<MenuItem>().All(i => !i.IsEnabled),
                "Svuota lista resta vuoto al ripristino e mostra Nessun file recente");
            menu.IsOpen = false;
        }
        finally { window.RecentFilesMenu.IsOpen = false; Directory.Delete(folder, true); }
    }
    static Button? FindButton(DependencyObject root, string name)
    {
        if (root is Button button && AutomationProperties.GetName(button) == name) return button;
        for (int i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++)
            if (FindButton(VisualTreeHelper.GetChild(root, i), name) is { } found) return found;
        return null;
    }
}
