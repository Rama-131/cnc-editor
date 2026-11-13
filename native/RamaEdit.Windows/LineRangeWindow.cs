using System.Windows;
using System.Windows.Controls;
using ICSharpCode.AvalonEdit.Document;

namespace RamaEdit.Windows;

internal sealed class LineRangeWindow : Window
{
    readonly TextDocument document;
    internal TextBox First { get; } = new() { Text = "1", Width = 100 };
    internal TextBox Last { get; } = new() { Width = 100 };
    internal TextBox PreviewText { get; } = new() { IsReadOnly = true, AcceptsReturn = true, FontFamily = new("Consolas"), VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto };
    internal Button SendButton { get; } = new() { Content = "INVIA INTERVALLO", IsDefault = true };
    readonly TextBlock status = new() { Margin = new(6), TextWrapping = TextWrapping.Wrap };
    internal int FirstLine { get; private set; }
    internal int LastLine { get; private set; }
    internal string SelectedSource { get; private set; } = "";
    internal LineRangeWindow(string source, string file)
    {
        document = new(source); Last.Text = document.LineCount.ToString();
        Title = "Rama Edit · Invia intervallo · " + file; Width = 850; Height = 600; MinWidth = 600; MinHeight = 400; WindowStartupLocation = WindowStartupLocation.CenterOwner;
        var root = new DockPanel { Margin = new(12) }; Content = root;
        var fields = new WrapPanel(); fields.Children.Add(new TextBlock { Text = "Da riga", VerticalAlignment = VerticalAlignment.Center }); fields.Children.Add(First); fields.Children.Add(new TextBlock { Text = "A riga (compresa)", VerticalAlignment = VerticalAlignment.Center }); fields.Children.Add(Last);
        DockPanel.SetDock(fields, Dock.Top); root.Children.Add(fields);
        var note = new TextBlock { Text = "Numeri di riga sul margine dell’editor. Il file originale resta intero.\nLe righe precedenti non vengono inviate: verifica utensile, origine e impostazioni richieste sulla CNC. Restano applicati i parametri di trasmissione della macchina.", TextWrapping = TextWrapping.Wrap, Margin = new(6) };
        DockPanel.SetDock(note, Dock.Top); root.Children.Add(note); DockPanel.SetDock(status, Dock.Top); root.Children.Add(status);
        var actions = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        var cancel = new Button { Content = "Annulla", IsCancel = true }; actions.Children.Add(cancel); actions.Children.Add(SendButton); DockPanel.SetDock(actions, Dock.Bottom); root.Children.Add(actions); root.Children.Add(PreviewText);
        First.TextChanged += (_, _) => UpdatePreview(); Last.TextChanged += (_, _) => UpdatePreview();
        SendButton.Click += (_, _) => { if (SendButton.IsEnabled) DialogResult = true; };
        UpdatePreview();
    }
    internal static string Extract(TextDocument document, int first, int last)
    {
        if (first < 1 || last < first || last > document.LineCount) throw new ArgumentException($"Inserisci un intervallo valido da 1 a {document.LineCount}.");
        var start = document.GetLineByNumber(first); var end = document.GetLineByNumber(last);
        return document.GetText(start.Offset, end.EndOffset + end.DelimiterLength - start.Offset);
    }
    void UpdatePreview()
    {
        bool valid = int.TryParse(First.Text, out int first) && int.TryParse(Last.Text, out int last) && first >= 1 && last >= first && last <= document.LineCount;
        if (!valid) { SelectedSource = ""; PreviewText.Text = ""; SendButton.IsEnabled = false; status.Text = $"Inserisci righe intere da 1 a {document.LineCount}, con inizio non successivo alla fine."; return; }
        FirstLine = first; LastLine = int.Parse(Last.Text); SelectedSource = Extract(document, FirstLine, LastLine); PreviewText.Text = SelectedSource;
        SendButton.IsEnabled = !string.IsNullOrWhiteSpace(SelectedSource); status.Text = $"Anteprima: righe {FirstLine}–{LastLine} comprese · {LastLine - FirstLine + 1} righe · {SelectedSource.Length} caratteri";
    }
}
