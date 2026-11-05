using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using ICSharpCode.AvalonEdit;
using RamaEdit.Core;

namespace RamaEdit.Windows;

internal sealed class ColorSettingsWindow : Window
{
    const string Sample = "(ANTEPRIMA COLORI)\nG90 G54\nT1 M6 (PUNTA)\nS1200 M3\nG0 X10 Y5 Z5\nG1 Z-2 F120\nX30 Y20\nG2 X40 Y20 I5 J0\nG3 X50 Y20 I5 J0\nG0 Z15\nM5\nM30";
    readonly Dictionary<string, string> palette;
    readonly Dictionary<string, TextBox> fields = [];
    readonly Dictionary<string, Button> swatches = [];
    readonly Action<Dictionary<string, string>, bool> apply;
    readonly ComboBox style = new() { ItemsSource = new[] { "Movimenti G0/G1/G2/G3", "Colori per codice G/M" } };
    readonly TextBlock error = new() { Foreground = Brushes.LightSalmon, Margin = new(4, 8, 4, 4), TextWrapping = TextWrapping.Wrap };
    readonly GCodeColorizer previewColorizer = new();
    internal TextEditor PreviewEditor { get; } = new()
    {
        IsReadOnly = true, ShowLineNumbers = true, FontFamily = new("Consolas"), FontSize = 14,
        Background = new SolidColorBrush(Color.FromRgb(18, 22, 28)), Foreground = Brushes.LightGray,
        LineNumbersForeground = Brushes.SlateGray, Height = 235,
        HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalScrollBarVisibility = ScrollBarVisibility.Auto
    };
    internal ToolpathView PreviewGraph { get; } = new() { Height = 210, View = "XY", ShowLegend = false };
    readonly Button save = new() { Content = "Applica", MinWidth = 100 };
    public ColorSettingsWindow(Dictionary<string, string> current, bool useMotionColors, Action<Dictionary<string, string>, bool> apply)
    {
        this.apply = apply; palette = AppearancePalette.Restore(current);
        Style = (Style)Application.Current.FindResource(typeof(Window));
        Title = "Rama Edit · Colori"; Width = 980; Height = 720; MinWidth = 660; MinHeight = 450;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        var root = new DockPanel { Margin = new(16) }; Content = root;
        var footer = new DockPanel { Margin = new(0, 10, 0, 0) }; DockPanel.SetDock(footer, Dock.Bottom); root.Children.Add(footer);
        var commands = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        var reset = Button("Ripristina", Reset); var cancel = Button("Annulla", Close);
        commands.Children.Add(reset); commands.Children.Add(cancel); commands.Children.Add(save);
        DockPanel.SetDock(commands, Dock.Right); footer.Children.Add(commands); footer.Children.Add(error);
        save.Click += (_, _) => ApplyChanges();
        var content = new Grid();
        content.ColumnDefinitions.Add(new() { Width = new(1, GridUnitType.Star) });
        content.ColumnDefinitions.Add(new() { Width = new(1, GridUnitType.Star) });
        root.Children.Add(new ScrollViewer { Content = content, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled });
        var left = new StackPanel { Margin = new(0, 0, 18, 0) }; content.Children.Add(left);
        left.Children.Add(new TextBlock { Text = "Scegli i colori", FontSize = 19, FontWeight = FontWeights.SemiBold, Margin = new(3, 0, 0, 10) });
        left.Children.Add(new TextBlock { Text = "Colorazione del testo", Margin = new(3, 4, 0, 2), Foreground = Brushes.LightSteelBlue });
        style.SelectedIndex = useMotionColors ? 0 : 1; left.Children.Add(style);
        left.Children.Add(new TextBlock { Text = "Colori dei movimenti uguali nel testo e nel disegno.\nI commenti mantengono sempre il proprio colore.", TextWrapping = TextWrapping.Wrap, Margin = new(3, 6, 3, 12), FontSize = 12, Foreground = Brushes.LightSteelBlue });
        var tokenRows = new StackPanel();
        var tokenOptions = new Expander { Header = "Colori per codice", Content = tokenRows, Margin = new(3, 8, 3, 0), IsExpanded = !useMotionColors };
        foreach (var (key, label) in new[] {
            ("text", "Testo"), ("background", "Sfondo editor"), ("block", "Selezione · sfondo"), ("blockText", "Selezione · testo"),
            ("comment", "Commenti"), ("rapid", "Rapido · G0"), ("cut", "Lineare · G1 e cicli"),
            ("cw", "Archi orari · G2"), ("ccw", "Archi antiorari · G3"),
            ("g", "Codici G"), ("m", "Codici M"), ("axis", "Assi nel testo"), ("value", "Valori"), ("tool", "Utensili")
        })
        {
            var row = new Grid { MinHeight = 42 };
            row.ColumnDefinitions.Add(new() { Width = new(1, GridUnitType.Star), MinWidth = 100 });
            row.ColumnDefinitions.Add(new() { Width = new(58) });
            row.ColumnDefinitions.Add(new() { Width = new(86) });
            row.ColumnDefinitions.Add(new() { Width = new(108) });
            row.Children.Add(new TextBlock { Text = label, VerticalAlignment = VerticalAlignment.Center, TextWrapping = TextWrapping.Wrap, FontSize = 13, Margin = new(3, 0, 4, 0) });
            var swatch = Button("", () => Pick(key)); swatch.Padding = new(0); swatch.ToolTip = "Scegli colore: " + label; swatch.Height = 34;
            System.Windows.Automation.AutomationProperties.SetName(swatch, "Campione " + label);
            var choose = Button("Scegli…", () => Pick(key)); choose.Padding = new(6); choose.FontSize = 13;
            var box = new TextBox { Text = palette[key], FontFamily = new("Consolas"), FontSize = 13, VerticalContentAlignment = VerticalAlignment.Center, ToolTip = "Codice colore (facoltativo): " + label };
            Grid.SetColumn(swatch, 1); Grid.SetColumn(choose, 2); Grid.SetColumn(box, 3);
            row.Children.Add(swatch); row.Children.Add(choose); row.Children.Add(box);
            fields[key] = box; swatches[key] = swatch;
            if (key is "g" or "m" or "axis" or "value" or "tool") tokenRows.Children.Add(row); else left.Children.Add(row);
            box.TextChanged += (_, _) => RefreshPreview();
        }
        left.Children.Add(tokenOptions);
        var right = new StackPanel { Margin = new(0, 0, 0, 0) }; Grid.SetColumn(right, 1); content.Children.Add(right);
        right.Children.Add(new TextBlock { Text = "Anteprima", FontSize = 19, FontWeight = FontWeights.SemiBold, Margin = new(3, 0, 0, 10) });
        PreviewEditor.Text = Sample; PreviewEditor.TextArea.TextView.LineTransformers.Add(previewColorizer); right.Children.Add(PreviewEditor);
        var legend = new WrapPanel { Margin = new(0, 10, 0, 6) }; right.Children.Add(legend);
        rapidLegend = new TextBlock { Text = "━━ Rapido    ", FontWeight = FontWeights.SemiBold }; cutLegend = new TextBlock { Text = "━━ Lineare    ", FontWeight = FontWeights.SemiBold };
        clockwiseLegend = new TextBlock { Text = "━━ G2    ", FontWeight = FontWeights.SemiBold }; counterclockwiseLegend = new TextBlock { Text = "━━ G3", FontWeight = FontWeights.SemiBold };
        legend.Children.Add(rapidLegend); legend.Children.Add(cutLegend); legend.Children.Add(clockwiseLegend); legend.Children.Add(counterclockwiseLegend);
        PreviewGraph.Result = Simulator.Simulate(Sample); right.Children.Add(PreviewGraph);
        style.SelectionChanged += (_, _) => { tokenOptions.IsExpanded = style.SelectedIndex == 1; RefreshPreview(); };
        RefreshPreview();
    }
    readonly TextBlock rapidLegend, cutLegend, clockwiseLegend, counterclockwiseLegend;
    Button Button(string label, Action action)
    {
        var b = new Button { Content = label }; b.Click += (_, _) => { try { action(); } catch (Exception e) { error.Text = e.Message; } }; return b;
    }
    void Pick(string key)
    {
        string? selected = NativeColorPicker.Select(this, palette[key]);
        if (selected is not null) fields[key].Text = selected;
    }
    internal void SetColor(string key, string value) => fields[key].Text = value;
    internal void SetMotionStyle(bool enabled) => style.SelectedIndex = enabled ? 0 : 1;
    internal void ApplyChanges()
    {
        if (!fields.Values.All(f => AppearancePalette.ValidColor(f.Text))) { error.Text = "Scegli colori validi prima di applicare."; return; }
        try { apply(new(palette), style.SelectedIndex == 0); Close(); }
        catch (Exception e) { error.Text = "Impossibile salvare i colori: " + e.Message; }
    }
    void Reset()
    {
        foreach (var (key, value) in AppearancePalette.Defaults()) fields[key].Text = value;
        style.SelectedIndex = 0; RefreshPreview();
    }
    void RefreshPreview()
    {
        if (fields.Count == 0 || rapidLegend is null) return;
        bool valid = true;
        foreach (var (key, field) in fields)
        {
            bool ok = AppearancePalette.ValidColor(field.Text);
            field.BorderBrush = ok ? new SolidColorBrush(Color.FromRgb(69, 89, 104)) : Brushes.LightSalmon;
            valid &= ok;
            if (ok) { palette[key] = field.Text.ToUpperInvariant(); swatches[key].Background = Brush(palette[key]); }
        }
        save.IsEnabled = valid; error.Text = valid ? "" : "Scegli un colore o inserisci un codice come #7DFF6A.";
        previewColorizer.Palette = new(palette); previewColorizer.UseMotionColors = style.SelectedIndex == 0;
        previewColorizer.Invalidate(); PreviewEditor.TextArea.TextView.Redraw();
        PreviewGraph.RapidBrush = Brush(palette["rapid"]); PreviewGraph.WorkingBrush = Brush(palette["cut"]);
        PreviewGraph.ClockwiseBrush = Brush(palette["cw"]); PreviewGraph.CounterclockwiseBrush = Brush(palette["ccw"]);
        ApplyEditorColors(PreviewEditor, palette);
        rapidLegend.Foreground = PreviewGraph.RapidBrush; cutLegend.Foreground = PreviewGraph.WorkingBrush;
        clockwiseLegend.Foreground = PreviewGraph.ClockwiseBrush; counterclockwiseLegend.Foreground = PreviewGraph.CounterclockwiseBrush;
        PreviewGraph.InvalidateVisual();
    }
    internal static void ApplyEditorColors(TextEditor editor, Dictionary<string, string> palette)
    {
        editor.Background = Brush(palette["background"]); editor.Foreground = Brush(palette["text"]);
        editor.TextArea.SelectionBrush = Brush(palette["block"]); editor.TextArea.SelectionForeground = Brush(palette["blockText"]);
        editor.TextArea.SelectionBorder = null; editor.TextArea.SelectionCornerRadius = 0;
    }
    internal static Brush Brush(string hex)
    {
        var brush = (SolidColorBrush)new BrushConverter().ConvertFromString(hex)!; brush.Freeze(); return brush;
    }
}
