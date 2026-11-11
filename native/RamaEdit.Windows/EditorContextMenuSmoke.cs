using System.Windows;
using System.Windows.Automation.Peers;
using System.Windows.Automation.Provider;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Threading;

namespace RamaEdit.Windows;

internal static class EditorContextMenuSmoke
{
    internal static async Task Run(Action<bool, string> check, Action<FrameworkElement, string> shot)
    {
        var window = new MainWindow(true);
        var previousClipboard = Clipboard.GetDataObject();
        try
        {
            window.Show(); window.NewDocument(); window.Navigate("send");
            var editor = window.Editor;
            editor.Text = "G0 X10\r\nG1 Z-20\r\nM30";
            editor.Document.UndoStack.ClearAll();
            var source = window.Documents[^1]; source.Model.Dirty = false;
            var menu = editor.ContextMenu;
            check(menu is not null && menu.Items.OfType<MenuItem>().Select(i => i.Header?.ToString())
                .SequenceEqual(new[] { "Seleziona tutto", "Copia", "Incolla" }), "Menu editor: tre comandi richiesti nell’ordine corretto");
            var select = (MenuItem)menu!.Items[0]; var copy = (MenuItem)menu.Items[1]; var paste = (MenuItem)menu.Items[2];
            async Task Open()
            {
                editor.TextArea.Focus(); menu.PlacementTarget = editor; menu.IsOpen = true;
                CommandManager.InvalidateRequerySuggested();
                await window.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
                check(menu.IsOpen && menu.ActualWidth > 100 && menu.ActualHeight > 50, "Menu contestuale Windows aperto e visibile");
            }
            async Task Invoke(MenuItem item)
            {
                check(item.IsEnabled, "Comando disponibile: " + item.Header);
                var peer = new MenuItemAutomationPeer(item);
                ((IInvokeProvider)peer.GetPattern(PatternInterface.Invoke)!).Invoke();
                await window.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
            }

            editor.Select(3, 3); string original = editor.Text;
            await Open(); shot(menu, "menu-editor");
            check(editor.SelectedText == "X10", "L’apertura del menu conserva la selezione da copiare");
            await Invoke(copy);
            check(Clipboard.GetText() == "X10" && editor.Text == original && !source.Model.Dirty,
                "Copia usa gli appunti Windows senza modificare il programma");
            await Open(); await Invoke(select);
            check(editor.SelectedText == original, "Seleziona tutto comprende il programma completo");
            editor.Select(3, 3); Clipboard.SetText("X25\r\n(incollato)");
            await Open(); await Invoke(paste);
            check(editor.Text == original.Replace("X10", "X25\r\n(incollato)") && source.Model.Dirty,
                "Incolla sostituisce la selezione, conserva le righe e segna il file modificato");
            editor.Undo(); check(editor.Text == original, "Un solo Annulla ripristina il testo prima dell’incolla");
            editor.Redo(); check(editor.Text.Contains("(incollato)"), "Ripristina recupera l’incolla");
            string sourceText = editor.Text;
            window.NewDocument(); editor.Text = "M30"; editor.CaretOffset = 0;
            Clipboard.SetText("G0 X2\r\n"); await Open(); await Invoke(paste);
            check(editor.Text == "G0 X2\r\nM30" && source.Text.Text == sourceText,
                "Incolla senza selezione usa il cursore e modifica soltanto la scheda attiva");
            editor.Select(0, 0); Clipboard.SetData("RamaEditSmoke.NoText", new byte[] { 1 }); await Open();
            check(!paste.IsEnabled, "Incolla senza testo negli appunti è disabilitato"); menu.IsOpen = false;

            window.Navigate("receive"); window.AcceptReceived("%\r\nO1234\r\nM30\r\n%");
            await Task.Delay(200); await window.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ApplicationIdle);
            string received = editor.Text; Clipboard.SetText("NON INSERIRE");
            await Open(); shot(menu, "menu-ricezione");
            check(editor.IsReadOnly && !paste.IsEnabled, "Ricezione: Incolla disabilitato anche con testo negli appunti");
            check(!ApplicationCommands.Paste.CanExecute(null, editor.TextArea), "Ricezione: anche il comando diretto di incolla è bloccato");
            await Invoke(select); check(editor.SelectedText == received, "Ricezione: Seleziona tutto disponibile");
            await Open(); await Invoke(copy);
            check(Clipboard.GetText() == received && editor.Text == received, "Ricezione: copia completa senza alterare i dati acquisiti");
            window.OpenReceivedProgram();
            await Open(); check(!editor.IsReadOnly && paste.IsEnabled, "Ricevuto aperto in scrittura: Incolla torna disponibile"); menu.IsOpen = false;
            foreach (var document in window.Documents.ToArray()) { document.Model.Dirty = false; await window.CloseDocument(document); }
            await Open(); check(editor.IsReadOnly && !paste.IsEnabled, "Nessuna scheda aperta: Incolla disabilitato"); menu.IsOpen = false;
        }
        finally
        {
            window.Editor.ContextMenu.IsOpen = false; window.Close();
            if (previousClipboard is not null) Clipboard.SetDataObject(previousClipboard, true);
        }
    }
}
