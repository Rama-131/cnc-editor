using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.IO.Ports;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Data;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using ICSharpCode.AvalonEdit;
using ICSharpCode.AvalonEdit.Document;
using Microsoft.Win32;
using RamaEdit.Core;
using CoreTools = RamaEdit.Core.ProgramTools;
using Path = System.IO.Path;

namespace RamaEdit.Windows;

public class NativeDocument
{
    public SavedDocument Model { get; set; } = new();
    public TextDocument Text { get; set; } = new();
    public string? View { get; set; }
    public int Caret { get; set; }
    public double VerticalOffset { get; set; }
    public double HorizontalOffset { get; set; }
}
public class MainWindow : Window
{
    public TextEditor Editor { get; } = new() { ShowLineNumbers = true, FontFamily = new("Consolas"), FontSize = 16, Background = new SolidColorBrush(Color.FromRgb(18, 22, 28)), Foreground = Brushes.LightGray, LineNumbersForeground = Brushes.SlateGray, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
    public double WorkspaceWidth => body.ActualWidth;
    public ToolpathView Preview { get; } = new(); public SimulationResult CurrentSimulation { get; private set; } = new();
    public IReadOnlyList<NativeDocument> Documents => documents;
    readonly List<NativeDocument> documents = []; NativeDocument? active; readonly bool testMode;
    List<MachineProfile> machines = []; readonly ComboBox machineSelect = new() { Width = 205, DisplayMemberPath = "Name" }, portSelect = new() { Width = 105, IsEditable = true };
    readonly ComboBox machineType = new() { Width = 145, ItemsSource = new[] { "Fresatrice · 3 assi", "Tornio Fanuc A", "Tornio G90/91" } }, diameter = new() { Width = 130, ItemsSource = new[] { "X a diametro", "X a raggio" } };
    readonly ComboBox viewSelect = new() { Width = 67, ItemsSource = new[] { "3D", "XY", "XZ", "YZ" }, SelectedIndex = 0 }, speed = new() { Width = 66, ItemsSource = new[] { "0.25×", "0.5×", "1×", "2×", "4×", "10×" }, SelectedIndex = 2 };
    readonly TextBlock pageTitle = new() { FontWeight = FontWeights.SemiBold, FontSize = 15, Margin = new(16, 0, 12, 0), VerticalAlignment = VerticalAlignment.Center };
    readonly TextBlock message = new() { Margin = new(12, 4, 12, 4), TextWrapping = TextWrapping.Wrap, Foreground = Brushes.LightSteelBlue }, editorStatus = new() { Padding = new(10, 4, 10, 4), FontSize = 11, Foreground = Brushes.SlateGray };
    readonly TextBlock coordinateText = new() { FontFamily = new("Consolas"), FontSize = 18, Margin = new(10, 5, 10, 5), TextWrapping = TextWrapping.Wrap }, simulationStatus = new() { Margin = new(10, 4, 10, 6), FontSize = 11, TextWrapping = TextWrapping.Wrap };
    readonly Grid toolbar = new();
    readonly StackPanel toolbarLeft = new() { Orientation = Orientation.Horizontal }, toolbarRight = new() { Orientation = Orientation.Horizontal };
    readonly StackPanel tabs = new() { Orientation = Orientation.Horizontal }, editTools = new() { Orientation = Orientation.Horizontal }, extraTools = new() { Orientation = Orientation.Horizontal }, transferTools = new() { Orientation = Orientation.Horizontal };
    readonly ScrollViewer tabScroll, toolbarScroll; readonly Grid body = new(); readonly DockPanel simulationPanel = new(), editorPanel = new(); readonly WrapPanel fileActions = new() { Orientation = Orientation.Horizontal };
    readonly StackPanel findPanel = new() { Visibility = Visibility.Collapsed, Background = new SolidColorBrush(Color.FromRgb(29, 45, 56)), Margin = new(0) };
    readonly TextBox search = new() { MinWidth = 200, Width = 280 }, replacement = new() { MinWidth = 200, Width = 280 }, receivedName = new() { Text = "ricevuto.txt", Width = 300 };
    readonly CheckBox matchCase = new() { Content = "Maiuscole/minuscole" }, wholeWord = new() { Content = "Parola intera" }, regexSearch = new() { Content = "Espressione regolare" }, follow = new() { Content = "Segui riga", IsChecked = true }, rapids = new() { Content = "Rapidi", IsChecked = true };
    readonly StackPanel receiveHeader = new() { Orientation = Orientation.Horizontal }, playRow = new() { Orientation = Orientation.Horizontal };
    readonly Slider timeline = new() { Minimum = 0, Maximum = 1, MinWidth = 80, VerticalAlignment = VerticalAlignment.Center, IsSnapToTickEnabled = true, TickFrequency = 1 };
    readonly GCodeColorizer colorizer = new(); readonly ExecutionLine execution = new(); readonly TextDocument receivedDocument = new();
    readonly StringBuilder received = new(); readonly object rxGate = new(); bool receivedDirty;
    readonly DispatcherTimer debounce = new() { Interval = TimeSpan.FromMilliseconds(350) }, autosave = new() { Interval = TimeSpan.FromSeconds(2) }, playback = new() { Interval = TimeSpan.FromMilliseconds(40) };
    Button spacingButton = null!, toolListButton = null!;
    Button undoButton = null!, redoButton = null!, colorsButton = null!, transferSettingsButton = null!;
    Button connectButton = null!, sendButton = null!, receiveButton = null!, refreshPortsButton = null!, printButton = null!, saveButton = null!, saveAsButton = null!, previewButton = null!, examplesButton = null!, findButton = null!, playButton = null!, newReceiveButton = null!, openReceivedButton = null!;
    SerialSession? serial; string page = "workspace"; bool syncing, simulationVisible = true, busy, closing, preparingClose, persistenceFailed;
    readonly Queue<string> logChunks = new(); int logLength; int receivedPending; readonly DispatcherTimer receivedRefresh = new() { Interval = TimeSpan.FromMilliseconds(80) }; double[] cumulative = []; bool playing; double playbackPosition;
    readonly TransmissionPanel transmissionPanel = new();
    internal TransmissionPanel TransmissionDetails => transmissionPanel;
    readonly List<string> recentFiles = [];
    internal IReadOnlyList<string> RecentFilePaths => recentFiles;
    readonly RecentFilesPopup recentMenu = new();
    public MainWindow(bool testMode = false)
    {
        Style = (Style)Application.Current.FindResource(typeof(Window));
        this.testMode = testMode; Title = AppInfo.DisplayName; MinWidth = 900; MinHeight = 600;
        WindowStyle = WindowStyle.SingleBorderWindow; ResizeMode = ResizeMode.CanResize; ShowInTaskbar = true;
        WindowPlacement.SetInitialBounds(this, 1440, 920); AllowDrop = true;
        try { machines = testMode ? Storage.Defaults() : Storage.Read<List<MachineProfile>>("machines.json") ?? Storage.Defaults(); foreach (var m in machines) m.Settings.Validate(); }
        catch (Exception e) { machines = Storage.Defaults(); Loaded += (_, _) => Error("Configurazioni non caricate: " + e.Message); persistenceFailed = true; }
        try { if (Storage.UpgradeReceiveProfiles(machines) && !testMode) Storage.Save("machines.json", machines); }
        catch (Exception e) { Loaded += (_, _) => Error("Formato ricezione aggiornato, ma non salvato: " + e.Message); }
        var root = new DockPanel(); Content = root;
        var header = new DockPanel { Background = new SolidColorBrush(Color.FromRgb(18, 25, 33)), LastChildFill = true };
        DockPanel.SetDock(header, Dock.Top); root.Children.Add(header);
        var rail = new DockPanel { Width = 65, Background = new SolidColorBrush(Color.FromRgb(17, 25, 32)) }; DockPanel.SetDock(rail, Dock.Left); root.Children.Add(rail);
        var navigation = new StackPanel(); DockPanel.SetDock(navigation, Dock.Top); rail.Children.Add(navigation);
        var navigationGap = new Border();
        var navigationButtons = new Dictionary<string, Button>();
        foreach (var (symbol, label, target) in new[] { ("⌨", "Scrittura / Simulazione", "workspace"), ("⇧", "Trasmissione", "send"), ("⇩", "Ricezione", "receive") })
        {
            var b = B(symbol, () => Navigate(target)); b.ToolTip = label; AutomationProperties.SetName(b, label);
            b.Margin = new(3, target == "receive" ? 6 : 0, 3, 0); navigationButtons.Add(target, b);
            if (target is "send" or "receive")
            {
                var content = new StackPanel { HorizontalAlignment = HorizontalAlignment.Center };
                content.Children.Add(new TextBlock { Text = symbol, FontSize = 23, FontWeight = FontWeights.SemiBold, TextAlignment = TextAlignment.Center, Foreground = new SolidColorBrush(target == "send" ? Color.FromRgb(58, 168, 255) : Color.FromRgb(57, 237, 154)) });
                content.Children.Add(new TextBlock { Text = target == "send" ? "INVIA" : "RICEVI", FontSize = 11, FontWeight = FontWeights.SemiBold, TextAlignment = TextAlignment.Center, Margin = new(0, 2, 0, 0) });
                b.Content = content; b.Padding = new(4, 6, 4, 6); b.MinHeight = 60; b.Height = 70;
            }
            if (target == "send") navigation.Children.Add(navigationGap);
            navigation.Children.Add(b);
        }
        var settingsButton = B("⚙", Settings); settingsButton.ToolTip = "Impostazioni macchine";
        AutomationProperties.SetName(settingsButton, "Impostazioni macchine"); DockPanel.SetDock(settingsButton, Dock.Bottom); rail.Children.Add(settingsButton);
        rail.Children.Add(new Border());
        var main = new DockPanel(); root.Children.Add(main);
        var context = new StackPanel { Orientation = Orientation.Horizontal, Margin = new(10, 0, 5, 0) };
        var brand = new TextBlock { FontWeight = FontWeights.Bold, FontSize = 19, Margin = new(0, 10, 0, 10) };
        brand.Inlines.Add(new Run("Rama Edit")); brand.Inlines.Add(new Run(" " + AppInfo.Version) { FontSize = 14, FontWeight = FontWeights.Normal, Foreground = Brushes.LightSteelBlue });
        AutomationProperties.SetName(brand, AppInfo.DisplayName); context.Children.Add(brand); context.Children.Add(pageTitle); header.Children.Add(context);
        fileActions.Children.Add(BuildOpenButton()); saveButton = BA("Salva", () => Save(false)); saveAsButton = BA("Salva con nome", () => Save(true)); printButton = B("▤ Stampa", Print);
        saveButton.Content = FileCommandIcons.DiskLabel("Salva"); saveAsButton.Content = FileCommandIcons.DiskLabel("Salva con nome");
        fileActions.Children.Add(saveButton); fileActions.Children.Add(saveAsButton); fileActions.Children.Add(printButton); examplesButton = B("▧ Esempi", Examples); fileActions.Children.Add(examplesButton); colorsButton = B("◉ Colori", Colors); fileActions.Children.Add(colorsButton); header.Children.Add(fileActions);
        tabScroll = new() { Content = tabs, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalScrollBarVisibility = ScrollBarVisibility.Disabled, Background = new SolidColorBrush(Color.FromRgb(26, 34, 43)) }; DockPanel.SetDock(tabScroll, Dock.Top); main.Children.Add(tabScroll);
        toolbar.ColumnDefinitions.Add(new() { Width = GridLength.Auto }); toolbar.ColumnDefinitions.Add(new() { Width = new(1, GridUnitType.Star) }); toolbar.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        toolbarLeft.Children.Add(editTools); toolbarLeft.Children.Add(extraTools); toolbarLeft.Children.Add(transferTools);
        toolbar.Children.Add(toolbarLeft); Grid.SetColumn(toolbarRight, 2); toolbar.Children.Add(toolbarRight);
        toolbarScroll = new() { Content = toolbar, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalScrollBarVisibility = ScrollBarVisibility.Disabled, Background = new SolidColorBrush(Color.FromRgb(27, 40, 52)), Padding = new(5, 3, 5, 3) }; toolbar.SetBinding(MinWidthProperty, new Binding(nameof(ScrollViewer.ViewportWidth)) { Source = toolbarScroll }); DockPanel.SetDock(toolbarScroll, Dock.Top); main.Children.Add(toolbarScroll);
        undoButton = Tool("↶", "Annulla", () => Editor.Undo()); redoButton = Tool("↷", "Ripristina", () => Editor.Redo()); editTools.Children.Add(undoButton); editTools.Children.Add(redoButton); spacingButton = Tool("␣", "Aggiungi spazi", () => ReplaceSource(CoreTools.AddSpaces(Editor.Text))); editTools.Children.Add(spacingButton);
        toolListButton = Tool("☷", "Crea lista utensili", ToolList); editTools.Children.Add(toolListButton);
        extraTools.Children.Add(Tool("F", "Avanzamento", () => Adjust("F"))); extraTools.Children.Add(Tool("S", "Giri mandrino", () => Adjust("S")));
        findButton = Tool("⌕", "Trova / sostituisci", ToggleFind); extraTools.Children.Add(findButton);
        extraTools.Children.Add(Tool("◁", "Utensile precedente", () => ToolNavigate(false), new SolidColorBrush(Color.FromRgb(255, 98, 110))));
        extraTools.Children.Add(Tool("▷", "Prossimo utensile", () => ToolNavigate(true), new SolidColorBrush(Color.FromRgb(57, 237, 154))));
        previewButton = Tool("◫", "Nascondi simulazione", () => { simulationVisible = !simulationVisible; ApplyPage(); }); extraTools.Children.Add(previewButton);
        transferTools.Children.Add(Labeled("Macchina", machineSelect)); transferSettingsButton = B("⚙ Impostazioni", Settings); transferTools.Children.Add(transferSettingsButton); transferTools.Children.Add(Labeled("Porta", portSelect));
        refreshPortsButton = B("⟳", RefreshPorts); refreshPortsButton.ToolTip = "Aggiorna porte"; AutomationProperties.SetName(refreshPortsButton, "Aggiorna porte");
        connectButton = BA("Collega porta", Connect); sendButton = BA("⇧ INVIA PROGRAMMA", Send); receiveButton = BA("⇩ AVVIA RICEZIONE", Receive);
        sendButton.Background = new SolidColorBrush(Color.FromRgb(8, 126, 255)); sendButton.Foreground = Brushes.White; sendButton.BorderBrush = new SolidColorBrush(Color.FromRgb(77, 163, 255)); sendButton.FontWeight = FontWeights.SemiBold;
        receiveButton.Background = new SolidColorBrush(Color.FromRgb(33, 220, 130)); receiveButton.Foreground = new SolidColorBrush(Color.FromRgb(8, 37, 24)); receiveButton.BorderBrush = new SolidColorBrush(Color.FromRgb(97, 247, 182)); receiveButton.FontWeight = FontWeights.SemiBold;
        transferTools.Children.Add(sendButton); transferTools.Children.Insert(0, receiveButton); transferTools.Children.Add(connectButton); transferTools.Children.Add(B("Dati ricevuti", ShowLog));
        BuildFind(); DockPanel.SetDock(findPanel, Dock.Top); main.Children.Add(findPanel);
        DockPanel.SetDock(transmissionPanel, Dock.Top); main.Children.Add(transmissionPanel);
        DockPanel.SetDock(message, Dock.Top); main.Children.Add(message);
        body.ColumnDefinitions.Add(new()); body.ColumnDefinitions.Add(new() { Width = new(0) }); main.Children.Add(body);
        body.Children.Add(editorPanel); Grid.SetColumn(simulationPanel, 1); body.Children.Add(simulationPanel);
        receiveHeader.Children.Add(receivedName); newReceiveButton = B("+ Nuova ricezione", ClearReceived); receiveHeader.Children.Add(newReceiveButton); openReceivedButton = B("Apri in scrittura", () => OpenReceivedProgram()); receiveHeader.Children.Add(openReceivedButton); DockPanel.SetDock(receiveHeader, Dock.Top); editorPanel.Children.Add(receiveHeader);
        var statusRow = new DockPanel(); DockPanel.SetDock(statusRow, Dock.Bottom); DockPanel.SetDock(follow, Dock.Right); statusRow.Children.Add(follow); editorStatus.TextTrimming = TextTrimming.CharacterEllipsis; statusRow.Children.Add(editorStatus); editorPanel.Children.Add(statusRow); editorPanel.Children.Add(Editor);
        BuildSimulation(); Editor.TextArea.TextView.LineTransformers.Add(colorizer); Editor.TextArea.TextView.BackgroundRenderers.Add(execution);
        void AlignNavigation()
        {
            double tabHeight = Math.Max(34, tabs.ActualHeight);
            double functionHeight = toolListButton.IsVisible && toolListButton.ActualHeight >= 60 ? toolListButton.ActualHeight : navigationButtons["send"].Height;
            navigationButtons["workspace"].Height = tabHeight;
            navigationGap.Height = (tabScroll.IsVisible ? Math.Max(0, tabScroll.ActualHeight - tabHeight) : 0) + toolbarScroll.Padding.Top + toolListButton.Margin.Top;
            navigationButtons["send"].Height = navigationButtons["receive"].Height = functionHeight;
        }
        header.SizeChanged += (_, _) => AlignNavigation(); tabs.SizeChanged += (_, _) => AlignNavigation();
        tabScroll.SizeChanged += (_, _) => AlignNavigation(); toolListButton.SizeChanged += (_, _) => AlignNavigation();
        tabScroll.IsVisibleChanged += (_, _) => AlignNavigation(); Loaded += (_, _) => AlignNavigation();
        Editor.Options.EnableHyperlinks = false; Editor.Options.EnableEmailHyperlinks = false; Editor.Options.ConvertTabsToSpaces = true;
        Editor.ContextMenu = EditorContextMenu.Create(Editor);
        Editor.TextChanged += (_, _) => { if (syncing || page == "receive" || active is null) return; active.Model.Dirty = true; RefreshTabs(); debounce.Stop(); debounce.Start(); Status(); };
        Editor.TextArea.Caret.PositionChanged += (_, _) => Status();
        Editor.MouseHover += Hover; Editor.MouseHoverStopped += (_, _) => { if (Editor.ToolTip is ToolTip t) t.IsOpen = false; };
        machineSelect.SelectionChanged += (_, _) => { if (serial is null) { var m = SelectedMachine; portSelect.Text = m?.PortName ?? ""; } };
        machineType.SelectionChanged += (_, _) => { if (syncing || active is null) return; active.Model.Machine = machineType.SelectedIndex >= 1 ? "lathe" : "mill"; active.Model.LatheSystem = machineType.SelectedIndex == 2 ? "B" : "A"; viewSelect.SelectedItem = active.Model.Machine == "lathe" ? "XZ" : "3D"; RebuildSimulation(); };
        diameter.SelectionChanged += (_, _) => { if (!syncing && active is not null) { active.Model.Diameter = diameter.SelectedIndex == 0; RebuildSimulation(); } };
        debounce.Tick += (_, _) => { debounce.Stop(); RebuildSimulation(); };
        autosave.Tick += (_, _) => Persist(); playback.Tick += (_, _) => Tick();
        receivedRefresh.Tick += (_, _) => { if (Interlocked.Exchange(ref receivedPending, 0) == 1) RenderReceived(); }; receivedRefresh.Start();
        PreviewKeyDown += HandleKey;
        DragOver += (_, e) => { e.Effects = e.Data.GetDataPresent(DataFormats.FileDrop) ? DragDropEffects.Copy : DragDropEffects.None; e.Handled = true; };
        Drop += (_, e) => { if (e.Data.GetData(DataFormats.FileDrop) is string[] paths) foreach (var path in paths) try { OpenPath(path); } catch (Exception ex) { Error(ex.Message); } };
        Closing += OnClosing;
        LoadState(); machineSelect.ItemsSource = machines; machineSelect.SelectedItem = machines.FirstOrDefault(m => m.Id == restoredMachineId) ?? machines.FirstOrDefault(); RefreshPorts();
        if (documents.Count == 0) AddDocument(new() { Name = "nuovo_programma.txt", Text = Storage.Resource<Dictionary<string, string>>("samples")["mill"] });
        else Activate(documents[Math.Clamp(restoredIndex, 0, documents.Count - 1)]);
        ApplyAppearance(AppearancePalette.Defaults(), true);
        if (!testMode) { try { LoadAppearance(); } catch (Exception e) { Error(e.Message); } autosave.Start(); }
        ApplyPage();
    }
    internal void SelectTransferMachine(string id) => machineSelect.SelectedItem = machines.FirstOrDefault(m => m.Id == id);
    MachineProfile? SelectedMachine => machineSelect.SelectedItem as MachineProfile;
    static Border Labeled(string text, UIElement control) { var p = new StackPanel { Margin = new(7, 3, 7, 3), VerticalAlignment = VerticalAlignment.Center }; p.Children.Add(new TextBlock { Text = text, FontSize = 11, Foreground = Brushes.LightSteelBlue, Margin = new(3, 0, 0, 1) }); p.Children.Add(control); return new Border { Child = p, BorderThickness = new(0, 0, 1, 0), BorderBrush = Brushes.DimGray }; }
    Button B(string text, Action action)
    {
        var b = new Button { Content = text }; AutomationProperties.SetName(b, text);
        b.Click += (_, _) => { try { action(); } catch (Exception e) { Error(e.Message); } }; return b;
    }
    Button BA(string text, Func<Task> action)
    {
        var b = new Button { Content = text }; AutomationProperties.SetName(b, text);
        b.Click += async (_, _) => { try { await action(); } catch (OperationCanceledException) { if (serial?.Faulted == true) Error(serial.FaultMessage ?? "Porta seriale in errore. Ricollega la porta e verifica i dati presenti sulla CNC."); else Notify("Operazione interrotta. Verifica i dati presenti sulla CNC."); } catch (Exception e) { Error(e.Message); } finally { TransferState(); } }; return b;
    }
    Button Tool(string symbol, string text, Action action, Brush? symbolBrush = null)
    {
        var b = B(text, action);
        var content = new TextBlock { TextAlignment = TextAlignment.Center, TextWrapping = TextWrapping.Wrap };
        if (symbolBrush is null) content.Text = symbol + "\n" + text;
        else
        {
            content.Inlines.Add(new Run(symbol) { Foreground = symbolBrush });
            content.Inlines.Add(new Run("\n" + text));
        }
        b.Content = content; b.Width = 94; b.MinHeight = 60; b.Padding = new(5); b.ToolTip = text; return b;
    }
    void Notify(string text) { message.Foreground = Brushes.LightSteelBlue; message.Text = text; }
    public void Error(string text) { message.Foreground = Brushes.LightSalmon; message.Text = text; }
    int restoredIndex; string? restoredMachineId;
    void LoadState()
    {
        if (testMode) return;
        try
        {
            var state = Storage.Read<WorkspaceState>("workspace.json"); if (state is null) return; restoredIndex = state.ActiveIndex; restoredMachineId = state.SelectedMachineId; simulationVisible = state.SimulationVisible;
            foreach (var d in state.Documents.Where(d => d.Text.Length <= SerialText.MaxReceived)) { documents.Add(new() { Model = d, Text = new(d.Text) }); }
            RestoreRecentFiles(state.RecentFiles ?? state.Documents.Where(d => d.Path is not null).Select(d => d.Path!).Reverse().ToList());
            received.Append(state.Received); receivedDocument.Text = state.Received; receivedName.Text = state.ReceivedName; receivedDirty = state.ReceivedDirty;
        }
        catch (Exception e) { persistenceFailed = true; Loaded += (_, _) => Error("Sessione non caricata; i dati originali restano sul PC. " + e.Message); }
    }
    void Persist()
    {
        if (testMode || persistenceFailed) return;
        try
        {
            foreach (var d in documents) d.Model.Text = d.Text.Text;
            string raw; lock (rxGate) raw = received.ToString();
            Storage.Save("workspace.json", new WorkspaceState { Documents = documents.Select(d => d.Model).ToList(), RecentFiles = recentFiles.ToList(), ActiveIndex = active is null ? 0 : documents.IndexOf(active), SelectedMachineId = SelectedMachine?.Id, SimulationVisible = simulationVisible, Received = raw, ReceivedName = receivedName.Text, ReceivedDirty = receivedDirty });
        }
        catch (Exception e) { persistenceFailed = true; Error("Impossibile salvare la sessione. Salva i file sul PC. " + e.Message); }
    }
    void AddDocument(SavedDocument d) { var doc = new NativeDocument { Model = d, Text = new(d.Text) }; documents.Add(doc); Activate(doc); }
    public void NewDocument() { int n = 1; string name = "nuovo_programma.txt"; while (documents.Any(d => d.Model.Name == name)) name = $"nuovo_programma_{++n}.txt"; AddDocument(new() { Name = name }); }
    void Capture() { if (active is null || page == "receive") return; active.Caret = Editor.CaretOffset; active.VerticalOffset = Editor.VerticalOffset; active.HorizontalOffset = Editor.HorizontalOffset; }
    void Activate(NativeDocument doc, bool capture = true)
    {
        Pause(); if (capture) Capture(); active = doc;
        if (page != "receive") { syncing = true; Editor.Document = doc.Text; Editor.CaretOffset = Math.Min(doc.Caret, doc.Text.TextLength); Editor.ScrollToVerticalOffset(doc.VerticalOffset); Editor.ScrollToHorizontalOffset(doc.HorizontalOffset); machineType.SelectedIndex = doc.Model.Machine == "lathe" ? (doc.Model.LatheSystem == "B" ? 2 : 1) : 0; diameter.SelectedIndex = doc.Model.Diameter ? 0 : 1; viewSelect.SelectedItem = doc.View ?? (doc.Model.Machine == "lathe" ? "XZ" : "3D"); Preview.View = viewSelect.SelectedItem?.ToString() ?? "3D"; syncing = false; }
        RefreshTabs(); RebuildSimulation(); ApplyPage();
    }
    void RefreshTabs()
    {
        tabs.Children.Clear();
        foreach (var d in documents)
        {
            bool selected = d == active;
            var row = new StackPanel { Orientation = Orientation.Horizontal };
            var background = new SolidColorBrush(selected ? Color.FromRgb(0, 111, 184) : Color.FromRgb(26, 34, 43));
            var foreground = selected ? Brushes.White : Brushes.LightSteelBlue;
            var name = B(d.Model.Name + (d.Model.Dirty ? " ●" : ""), () => Activate(d));
            name.Margin = new(0); name.Padding = new(12, 7, 8, 7); name.MaxWidth = 260;
            name.Background = Brushes.Transparent; name.BorderThickness = new(0); name.Foreground = foreground;
            name.ToolTip = d.Model.Path ?? d.Model.Name;
            var close = BA("×", async () => { await CloseDocument(d); });
            close.Margin = new(0); close.Padding = new(3, 1, 3, 1); close.Width = 36; close.FontSize = 19; close.FontWeight = FontWeights.SemiBold; close.ToolTip = "Chiudi " + d.Model.Name;
            close.Background = Brushes.Transparent; close.BorderThickness = new(0); close.Foreground = foreground;
            AutomationProperties.SetName(close, "Chiudi " + d.Model.Name);
            row.Children.Add(name); row.Children.Add(new Border { Child = close, BorderThickness = new(1, 0, 0, 0), BorderBrush = selected ? new SolidColorBrush(Color.FromArgb(105, 255, 255, 255)) : new SolidColorBrush(Color.FromRgb(65, 86, 102)) });
            tabs.Children.Add(new Border { Child = row, Background = background, BorderBrush = background,
                BorderThickness = new(1), CornerRadius = new(4), Margin = new(0, 0, 4, 0) });

        }
        tabs.Children.Add(B("+ Nuovo", NewDocument));
    }
    internal async Task<bool> CloseDocument(NativeDocument d)
    {
        if (!await ConfirmDocument(d)) return false;
        int index = documents.IndexOf(d); documents.Remove(d);
        if (active == d) { active = null; if (documents.Count > 0) Activate(documents[Math.Min(index, documents.Count - 1)]); else { syncing = true; Editor.Document = new(); syncing = false; CurrentSimulation = new(); Preview.Result = CurrentSimulation; } }
        RefreshTabs(); ApplyPage(); Persist(); return true;
    }
    async Task<bool> ConfirmDocument(NativeDocument d)
    {
        if (!d.Model.Dirty) return true;
        var answer = MessageBox.Show(this, $"Salvare le modifiche a {d.Model.Name}?", "Rama Edit", MessageBoxButton.YesNoCancel, MessageBoxImage.Question);
        return answer == MessageBoxResult.No || (answer == MessageBoxResult.Yes && await SaveDocument(d, false));
    }
    public void OpenPath(string path)
    {
        path = Path.GetFullPath(path);
        var existing = documents.FirstOrDefault(d => string.Equals(d.Model.Path, path, StringComparison.OrdinalIgnoreCase)); if (existing is not null) { Activate(existing); RememberRecentFile(path); return; }
        if (new FileInfo(path).Length > SerialText.MaxReceived) throw new InvalidDataException("Il file supera 2 MB.");
        byte[] bytes = File.ReadAllBytes(path); string text;
        try { text = new UTF8Encoding(false, true).GetString(bytes).TrimStart('\uFEFF'); }
        catch (DecoderFallbackException) { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); text = Encoding.GetEncoding(1252).GetString(bytes); }
        if (text.Contains('\0')) throw new InvalidDataException("Il file contiene dati binari. Aprire un programma di testo.");
        AddDocument(new() { Name = Path.GetFileName(path), Path = path, Text = text }); RememberRecentFile(path);
    }
    UIElement BuildOpenButton()
    {
        var group = new Grid { Width = 124, MinHeight = 40, Margin = new(3) };
        var buttons = new DockPanel();
        var arrow = B("▾", ShowRecentFiles); arrow.Width = 28; arrow.Margin = new(0); arrow.Padding = new(0); arrow.Background = Brushes.Transparent; arrow.BorderThickness = new(0); arrow.ToolTip = "Ultimi file aperti";
        AutomationProperties.SetName(arrow, "File recenti");
        var divider = new Border { Child = arrow, BorderBrush = new SolidColorBrush(Color.FromRgb(61, 80, 96)), BorderThickness = new(1, 0, 0, 0) };
        DockPanel.SetDock(divider, Dock.Right); buttons.Children.Add(divider);
        var open = BA("Apri", OpenFiles); open.Content = FileCommandIcons.FolderLabel("Apri"); open.Margin = new(0); open.Padding = new(14, 8, 14, 8); open.Background = Brushes.Transparent; open.BorderThickness = new(0); buttons.Children.Add(open);
        group.Children.Add(new Border { Child = buttons, Background = new SolidColorBrush(Color.FromRgb(35, 49, 61)), BorderBrush = new SolidColorBrush(Color.FromRgb(61, 80, 96)), BorderThickness = new(1), CornerRadius = new(4) });
        var hover = new Border { IsHitTestVisible = false, BorderBrush = new SolidColorBrush(Color.FromRgb(25, 200, 255)), BorderThickness = new(2), CornerRadius = new(4) };
        var hoverStyle = new Style(typeof(Border)); hoverStyle.Setters.Add(new Setter(VisibilityProperty, Visibility.Collapsed));
        foreach (string property in new[] { nameof(IsMouseOver), nameof(IsKeyboardFocusWithin) })
        {
            var trigger = new DataTrigger { Binding = new Binding(property) { Source = group }, Value = true };
            trigger.Setters.Add(new Setter(VisibilityProperty, Visibility.Visible)); hoverStyle.Triggers.Add(trigger);
        }
        hover.Style = hoverStyle; group.Children.Add(hover);
        recentMenu.PlacementTarget = group; recentMenu.Placement = System.Windows.Controls.Primitives.PlacementMode.Bottom;
        recentMenu.Opener = arrow;
        return group;
    }
    void RememberRecentFile(string path, bool persist = true)
    {
        path = Path.GetFullPath(path); recentFiles.RemoveAll(p => string.Equals(p, path, StringComparison.OrdinalIgnoreCase)); recentFiles.Insert(0, path);
        if (recentFiles.Count > 20) recentFiles.RemoveRange(20, recentFiles.Count - 20);
        if (persist) Persist();
    }
    internal void RestoreRecentFiles(IEnumerable<string> paths)
    {
        recentFiles.Clear();
        foreach (string path in paths.Take(20).Reverse())
            try { if (!string.IsNullOrWhiteSpace(path) && Path.IsPathFullyQualified(path)) RememberRecentFile(path, false); }
            catch (Exception e) when (e is ArgumentException or NotSupportedException or PathTooLongException) { }
    }
    internal void ShowRecentFiles()
    {
        recentMenu.Items.Clear(); recentMenu.Frame.MaxHeight = Math.Min(520, SystemParameters.WorkArea.Height * .75);
        if (recentFiles.Count == 0) recentMenu.Items.Add(new Button { Content = "Nessun file recente", IsEnabled = false, Style = (Style)FindResource("RecentFileButton") });
        foreach (string path in recentFiles)
        {
            var header = new StackPanel { MaxWidth = 520 };
            header.Children.Add(new TextBlock { Text = Path.GetFileName(path), FontWeight = FontWeights.SemiBold, TextTrimming = TextTrimming.CharacterEllipsis });
            header.Children.Add(new TextBlock { Text = Path.GetDirectoryName(path), FontSize = 11, Opacity = .75, TextTrimming = TextTrimming.CharacterEllipsis });
            var item = new Button { Content = header, ToolTip = path, Tag = path, Style = (Style)FindResource("RecentFileButton") }; AutomationProperties.SetName(item, "Apri " + Path.GetFileName(path));
            item.Click += (_, _) =>
            {
                recentMenu.IsOpen = false;
                try { OpenPath(path); }
                catch (Exception e) when (e is FileNotFoundException or DirectoryNotFoundException) { Error("File non disponibile: " + path); }
                catch (Exception e) { Error(e.Message); }
            };
            recentMenu.Items.Add(item);
        }
        if (recentFiles.Count > 0)
        {
            recentMenu.Items.Add(new Separator());
            var clear = new Button { Content = "Svuota lista", Style = (Style)FindResource("RecentFileButton") }; clear.Click += (_, _) => { recentMenu.IsOpen = false; recentFiles.Clear(); Persist(); }; recentMenu.Items.Add(clear);
        }
        recentMenu.IsOpen = true;
    }
    internal RecentFilesPopup RecentFilesMenu => recentMenu;
    Task OpenFiles()
    {
        // The Windows shell namespace opens This PC, including when Documents is redirected to OneDrive.
        var dlg = new OpenFileDialog { Multiselect = true, Filter = "Programmi CNC e testo|*.txt;*.nc;*.cnc;*.tap;*.iso;*.mpf;*.gcode|Tutti i file|*.*", InitialDirectory = "::{20D04FE0-3AEA-1069-A2D8-08002B30309D}" };
        if (dlg.ShowDialog(this) == true) foreach (string path in dlg.FileNames) OpenPath(path); return Task.CompletedTask;
    }
    static void WriteText(string path, string text)
    {
        string temp = path + "." + Guid.NewGuid().ToString("N") + ".ramatmp";
        try { File.WriteAllText(temp, text, new UTF8Encoding(false)); File.Move(temp, path, true); } finally { if (File.Exists(temp)) File.Delete(temp); }
    }
    async Task Save(bool saveAs)
    {
        if (page == "receive")
        {
            if (serial?.Receiving == true) throw new InvalidOperationException("Termina la ricezione prima di salvare.");
            string raw; lock (rxGate) raw = received.ToString(); if (raw.Length == 0) return;
            var dlg = new SaveFileDialog { FileName = receivedName.Text, Filter = "File di testo TXT|*.txt|Programmi NC|*.nc|Tutti i file|*.*", DefaultExt = ".txt", InitialDirectory = SelectedMachine?.Settings.Directories.Receive.Path ?? "" };
            if (dlg.ShowDialog(this) == true) { WriteText(dlg.FileName, raw); receivedName.Text = Path.GetFileName(dlg.FileName); receivedDirty = false; Notify("File ricevuto salvato: " + dlg.FileName); }
            return;
        }
        if (active is not null) await SaveDocument(active, saveAs);
    }
    Task<bool> SaveDocument(NativeDocument doc, bool saveAs)
    {
        string? path = doc.Model.Path;
        if (saveAs || path is null)
        {
            var dlg = new SaveFileDialog { FileName = doc.Model.Name, DefaultExt = ".txt", Filter = "File di testo TXT|*.txt|Programmi NC|*.nc|Tutti i file|*.*", InitialDirectory = path is null ? SelectedMachine?.Settings.Directories.Send.Path ?? "" : Path.GetDirectoryName(path) ?? "" };
            if (dlg.ShowDialog(this) != true) return Task.FromResult(false); path = dlg.FileName;
        }
        WriteText(path, doc.Text.Text); doc.Model.Name = Path.GetFileName(path); doc.Model.Path = path; doc.Model.Dirty = false; RefreshTabs(); Persist(); Notify("Salvato: " + path); return Task.FromResult(true);
    }
    public void Navigate(string target)
    {
        if (target == page) return; Pause(); Capture(); page = target;
        syncing = true;
        if (page == "receive") Editor.Document = receivedDocument;
        syncing = false; ApplyPage(); if (page != "receive" && active is not null) Activate(active, false);
    }
    void ApplyPage()
    {
        pageTitle.Text = page switch { "send" => "Trasmissione", "receive" => "Ricezione", _ => "Scrittura / Simulazione" };
        ArrangeTransferToolbar();
        spacingButton.IsEnabled = toolListButton.IsEnabled = active is not null;
        colorsButton.Visibility = page == "workspace" ? Visibility.Visible : Visibility.Collapsed;
        foreach (var button in new[] { undoButton, redoButton }) button.Visibility = page == "send" ? Visibility.Collapsed : Visibility.Visible;
        examplesButton.Visibility = page == "workspace" ? Visibility.Visible : Visibility.Collapsed;
        bool rx = page == "receive", sim = page == "workspace" && simulationVisible && active is not null;
        Editor.IsReadOnly = rx || active is null; editTools.Visibility = rx || active is null ? Visibility.Collapsed : Visibility.Visible; extraTools.Visibility = page == "workspace" && active is not null ? Visibility.Visible : Visibility.Collapsed;
        transferTools.Visibility = page == "workspace" ? Visibility.Collapsed : Visibility.Visible; tabScroll.Visibility = rx ? Visibility.Collapsed : Visibility.Visible; receiveHeader.Visibility = rx ? Visibility.Visible : Visibility.Collapsed;
        simulationPanel.Visibility = sim ? Visibility.Visible : Visibility.Collapsed; body.ColumnDefinitions[1].Width = sim ? new(1, GridUnitType.Star) : new(0); body.ColumnDefinitions[0].Width = new(1, GridUnitType.Star);
        previewButton.Content = new TextBlock { Text = "◫\n" + (simulationVisible ? "Nascondi simulazione" : "Mostra simulazione"), TextAlignment = TextAlignment.Center, TextWrapping = TextWrapping.Wrap };
        if (rx || page != "workspace") findPanel.Visibility = Visibility.Collapsed;
        transmissionPanel.Visibility = page == "send" && transmissionPanel.HasTransmission ? Visibility.Visible : Visibility.Collapsed;
        execution.Line = sim ? CurrentStep()?.Line ?? 0 : 0; Editor.TextArea.TextView.InvalidateLayer(ICSharpCode.AvalonEdit.Rendering.KnownLayer.Background);
        TransferState(); Status();
    }
    void TransferState()
    {
        bool connected = serial is not null, rx = serial?.Receiving == true, tx = serial?.Sending == true;
        machineSelect.IsEnabled = !connected && !busy; portSelect.IsEnabled = !connected && !busy;
        connectButton.Content = connected ? "Disconnetti porta" : "Collega porta"; connectButton.IsEnabled = !busy && !tx && (connected || SelectedMachine is not null);
        sendButton.Visibility = page == "receive" ? Visibility.Collapsed : Visibility.Visible; receiveButton.Visibility = page == "receive" ? Visibility.Visible : Visibility.Collapsed;
        sendButton.Content = tx ? "■ INTERROMPI INVIO" : "⇧ INVIA PROGRAMMA"; sendButton.IsEnabled = connected && !busy && !rx && serial?.Faulted == false && (tx || !string.IsNullOrWhiteSpace(active?.Text.Text));
        receiveButton.Content = rx ? "■ TERMINA RICEZIONE" : received.Length > 0 ? "⇩ RIPRENDI RICEZIONE" : "⇩ AVVIA RICEZIONE"; receiveButton.IsEnabled = connected && !busy && !tx && serial?.Faulted == false;
        openReceivedButton.IsEnabled = !rx && received.Length > 0;
        newReceiveButton.IsEnabled = !rx; printButton.IsEnabled = !rx && !tx && (page == "receive" ? received.Length > 0 : active is not null);
        saveButton.IsEnabled = !rx && (page == "receive" ? received.Length > 0 : active is not null); saveAsButton.IsEnabled = saveButton.IsEnabled;
    }
    void RefreshPorts()
    {
        string selected = portSelect.Text;
        try { portSelect.ItemsSource = SerialPort.GetPortNames().Order().ToArray(); } catch (Exception e) { Error(e.Message); }
        portSelect.Text = selected.Length > 0 ? selected : SelectedMachine?.PortName ?? "";
    }
    internal async Task Connect()
    {
        if (busy) return; busy = true; TransferState();
        try
        {
            if (serial is not null) { if (serial.Receiving) await serial.StopReceivingAsync(); await serial.DisposeAsync(); serial = null; Notify("Porta disconnessa."); return; }
            var machine = SelectedMachine ?? throw new InvalidOperationException("Seleziona una macchina.");
            if (!Regex.IsMatch(portSelect.Text.Trim(), @"^COM\d+$", RegexOptions.IgnoreCase)) throw new ArgumentException("Indica una porta COM valida, ad esempio COM3.");
            string port = portSelect.Text.Trim().ToUpperInvariant(); machine.Settings.Validate();
            var device = await Task.Run(() => new WindowsSerialDevice(port, machine.Settings)); var session = new SerialSession(device, machine.Settings); AttachSerialSession(session, machine);
            device.PortError += session.ReportFault; AppendTransferLog($"\r\nCollegamento: {machine.Name} · {port}\r\n"); session.Start(); machine.PortName = port;
            try { if (!testMode && !persistenceFailed) Storage.Save("machines.json", machines); } catch (Exception e) { Error("Porta collegata; impossibile salvare la scelta: " + e.Message); return; }
            Notify("Collegato a " + machine.Name + " · " + port + ". Avvia l’invio o la ricezione.");
        }
        finally { busy = false; TransferState(); }
    }
    internal void AttachSerialSession(SerialSession session, MachineProfile machine)
    {
        if (serial is not null) throw new InvalidOperationException("Una porta è già collegata.");
        serial = session; session.Received += AcceptReceived; session.Log += AppendTransferLog;
        session.Error += text => Dispatcher.BeginInvoke(() => { if (serial != session) return; Error(text); TransferState(); });
        session.ReceptionEnded += text => Dispatcher.BeginInvoke(() => { if (serial == session) CompleteReception(text, machine); });
        TransferState();
    }
    async Task Send()
    {
        if (serial is null) return; if (serial.Sending) { serial.CancelSend(); return; }
        await SendProgram(serial, active?.Text.Text ?? "", active?.Model.Name ?? "Programma", SelectedMachine!, portSelect.Text);
    }
    internal async Task<bool> SendProgram(SerialSession session, string source, string file, MachineProfile machine, string port)
    {
        transmissionPanel.Begin(session, file, machine.Name, port, machine.Settings);
        void CaptureLog(string text) => transmissionPanel.Append(session, text);
        session.Log += CaptureLog;
        bool started = false; string? failure = null;
        try
        {
            _ = SerialText.Prepare(source, machine.Settings); started = true;
            var task = session.SendAsync(source, new Progress<double>(p => { if (serial != session || session.Faulted || !session.Sending) return; sendButton.Content = $"■ INTERROMPI · {p:0}%"; Notify($"Invio a {machine.Name} · {p:0}%"); }));
            TransferState(); bool limited = await task;
            Notify(limited ? "Invio parziale: raggiunto il limite di caratteri configurato. Verifica sulla CNC." : "Dati scritti sulla porta. Verifica la ricezione sul controllo CNC.");
            return limited;
        }
        catch (Exception e)
        {
            failure = session.FaultMessage;
            if (failure is not null) throw new IOException(failure, e);
            if (e is not OperationCanceledException) failure = e.Message;
            throw;
        }
        finally { transmissionPanel.Finish(failure, started); session.Log -= CaptureLog; TransferState(); }
    }
    async Task Receive()
    {
        if (serial is null) return;
        if (serial.Receiving) { await serial.StopReceivingAsync(); RenderReceived(); }
        else { int length; lock (rxGate) length = received.Length; await serial.StartReceivingAsync(length); Notify("Ricezione in corso. Avvia l’invio dal controllo CNC."); }
        TransferState();
    }
    internal void CompleteReception(string reason, MachineProfile? source = null)
    {
        RenderReceived(); Notify(reason); TransferState();
        if (closing || preparingClose || serial?.Receiving == true) return;
        try
        {
            if (OpenReceivedProgram(source)) Notify(reason + " Programma aperto in Scrittura / Simulazione. Puoi modificarlo e salvarlo.");
        }
        catch (Exception e) { Error("Dati ricevuti conservati. Impossibile aprire il programma: " + e.Message); }
    }
    internal bool OpenReceivedProgram(MachineProfile? source = null)
    {
        if (serial?.Receiving == true) return false;
        string text; lock (rxGate) text = received.ToString();
        source ??= SelectedMachine;
        if (source?.Settings.Receive is { } rx)
        {
            // Also format a draft left by an older version. Triggers have already
            // been consumed during reception and must not be applied a second time.
            var format = new ReceptionFilter(new ReceiveOptions { LineEnding = rx.LineEnding, OmitEmpty = rx.OmitEmpty, RemoveCharacters = rx.RemoveCharacters, RemoveControls = rx.RemoveControls });
            text = format.Push(text) + format.Finish();
        }
        if (string.IsNullOrWhiteSpace(text)) return false;
        string name = Path.GetFileName(receivedName.Text.Trim());
        if (string.IsNullOrWhiteSpace(name)) name = "ricevuto.txt";
        name = new string(name.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '_' : c).ToArray());
        if (Path.GetExtension(name).Length == 0) name += ".txt";
        string stem = Path.GetFileNameWithoutExtension(name), extension = Path.GetExtension(name); int number = 1;
        while (documents.Any(d => d.Model.Name.Equals(name, StringComparison.OrdinalIgnoreCase))) name = $"{stem}_{++number}{extension}";
        string identity = (source?.ImportedFrom?.FileName ?? source?.Name ?? "").ToUpperInvariant();
        bool lathe = identity.Contains("BIGLIA") || identity.Contains("PUMA") || identity.Contains("MOMAC") || (source?.Control.Contains("tornio", StringComparison.OrdinalIgnoreCase) ?? false);
        AddDocument(new() { Name = name, Text = text, Dirty = true, Machine = lathe ? "lathe" : "mill" });
        lock (rxGate) received.Clear();
        syncing = true; receivedDocument.Text = ""; syncing = false; receivedDirty = false;
        Interlocked.Exchange(ref receivedPending, 0); receivedName.Text = "ricevuto.txt";
        Navigate("workspace"); TransferState(); Persist(); return true;
    }
    internal void AcceptReceived(string text)
    {
        lock (rxGate) { if (received.Length + text.Length > SerialText.MaxReceived) throw new InvalidDataException("Limite di ricezione di 2 MB raggiunto."); received.Append(text); }
        Interlocked.Exchange(ref receivedPending, 1);
    }
    void RenderReceived()
    {
        string raw; lock (rxGate) raw = received.ToString();
        if (raw.Length != receivedDocument.TextLength) receivedDirty = true;
        syncing = true; if (raw.Length >= receivedDocument.TextLength) receivedDocument.Insert(receivedDocument.TextLength, raw[receivedDocument.TextLength..]); else receivedDocument.Text = raw; syncing = false; receivedDocument.UndoStack.ClearAll();
        if (page == "receive" && follow.IsChecked == true) Editor.ScrollToEnd(); Status(); TransferState();
    }
    void ClearReceived()
    {
        if (serial?.Receiving == true) return;
        if (receivedDirty && MessageBox.Show(this, "Eliminare il documento ricevuto non salvato?", "Rama Edit", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
        lock (rxGate) received.Clear(); receivedDocument.Text = ""; receivedName.Text = "ricevuto.txt"; receivedDirty = false; TransferState(); Persist();
    }
    void AppendTransferLog(string text)
    {
        lock (rxGate) { logChunks.Enqueue(text); logLength += text.Length; while (logLength > 200000 && logChunks.Count > 0) logLength -= logChunks.Dequeue().Length; }
    }
    void ShowLog()
    {
        string text; lock (rxGate) text = string.Concat(logChunks);
        var w = new Window { Title = "Rama Edit · Dati ricevuti", Owner = this, Width = 720, Height = 400, WindowStartupLocation = WindowStartupLocation.CenterOwner };
        w.Content = new TextBox { Text = text, IsReadOnly = true, AcceptsReturn = true, FontFamily = new("Consolas"), VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto }; w.Show();
    }
    void Settings()
    {
        var w = new MachineSettingsWindow(machines, serial is null ? null : SelectedMachine?.Id) { Owner = this }; w.ShowDialog();
        if (!w.Saved) return; string? id = SelectedMachine?.Id; machines = w.Machines; machineSelect.ItemsSource = machines; machineSelect.SelectedItem = machines.FirstOrDefault(m => m.Id == id) ?? machines.FirstOrDefault(); TransferState();
    }
    void ReplaceSource(string text)
    {
        if (Editor.IsReadOnly) return; Editor.Document.Replace(0, Editor.Document.TextLength, text);
    }
    void Adjust(string word)
    {
        string? value = Input(word == "F" ? "Imposta avanzamento F" : "Imposta giri mandrino S", "Valore preciso da applicare:");
        if (value is null) return; if (!double.TryParse(value.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out double number) || !double.IsFinite(number) || number <= 0) throw new ArgumentException("Inserire un numero positivo.");
        if (Editor.SelectionLength > 0) Editor.Document.Replace(Editor.SelectionStart, Editor.SelectionLength, CoreTools.Adjust(Editor.SelectedText, word, number)); else ReplaceSource(CoreTools.Adjust(Editor.Text, word, number));
    }
    string? Input(string title, string label, string initial = "")
    {
        string? result = null; var w = new Window { Title = title, Owner = this, Width = 440, Height = 190, ResizeMode = ResizeMode.NoResize, WindowStartupLocation = WindowStartupLocation.CenterOwner };
        var p = new StackPanel { Margin = new(16) }; var box = new TextBox { Text = initial }; p.Children.Add(new TextBlock { Text = label }); p.Children.Add(box);
        var row = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right }; row.Children.Add(B("Annulla", () => w.Close())); var ok = B("Applica", () => { result = box.Text; w.DialogResult = true; }); ok.IsDefault = true; row.Children.Add(ok); p.Children.Add(row); w.Content = p; w.Loaded += (_, _) => { box.Focus(); box.SelectAll(); }; w.ShowDialog(); return result;
    }
    void BuildFind()
    {
        var row = new WrapPanel { Margin = new(8, 4, 8, 0) }; row.Children.Add(new TextBlock { Text = "Trova", VerticalAlignment = VerticalAlignment.Center }); row.Children.Add(search); row.Children.Add(B("↑ Precedente", () => Find(false))); row.Children.Add(B("↓ Successivo", () => Find(true))); row.Children.Add(B("× Chiudi", ToggleFind)); findPanel.Children.Add(row);
        var replace = new WrapPanel { Margin = new(8, 0, 8, 4) }; replace.Children.Add(new TextBlock { Text = "Sostituisci", VerticalAlignment = VerticalAlignment.Center }); replace.Children.Add(replacement); replace.Children.Add(B("Sostituisci", ReplaceMatch)); replace.Children.Add(B("Sostituisci tutto", ReplaceAll)); replace.Children.Add(matchCase); replace.Children.Add(wholeWord); replace.Children.Add(regexSearch); findPanel.Children.Add(replace);
        search.KeyDown += (_, e) => { if (e.Key == Key.Enter) { Find(!Keyboard.Modifiers.HasFlag(ModifierKeys.Shift)); e.Handled = true; } };
    }
    void ToggleFind() { bool show = findPanel.Visibility != Visibility.Visible; findPanel.Visibility = show ? Visibility.Visible : Visibility.Collapsed; findButton.Background = show ? Brushes.DarkOliveGreen : new SolidColorBrush(Color.FromRgb(35, 49, 61)); if (show) { search.Focus(); search.SelectAll(); } else Editor.Focus(); }
    Regex SearchExpression()
    {
        string pattern = regexSearch.IsChecked == true ? search.Text : Regex.Escape(search.Text); if (wholeWord.IsChecked == true) pattern = @"\b(?:" + pattern + @")\b";
        return new(pattern, matchCase.IsChecked == true ? RegexOptions.None : RegexOptions.IgnoreCase, TimeSpan.FromMilliseconds(250));
    }
    void Find(bool next)
    {
        if (search.Text.Length == 0) { if (findPanel.Visibility != Visibility.Visible) ToggleFind(); else search.Focus(); return; }
        var matches = SearchExpression().Matches(Editor.Text).Cast<Match>().Where(m => m.Length > 0).ToList(); if (matches.Count == 0) { Notify("Nessun risultato."); return; }
        var match = next ? matches.FirstOrDefault(m => m.Index >= Editor.SelectionStart + Math.Max(Editor.SelectionLength, 1)) ?? matches[0] : matches.LastOrDefault(m => m.Index < Editor.SelectionStart) ?? matches[^1];
        Editor.Select(match.Index, match.Length); Editor.ScrollToLine(Editor.Document.GetLineByOffset(match.Index).LineNumber); Notify($"{matches.IndexOf(match) + 1} di {matches.Count} risultati");
    }
    void ReplaceMatch()
    {
        if (Editor.IsReadOnly || search.Text.Length == 0) return; var regex = SearchExpression(); var match = regex.Match(Editor.SelectedText);
        if (match.Success && match.Index == 0 && match.Length == Editor.SelectionLength) { int start = Editor.SelectionStart; string value = regexSearch.IsChecked == true ? match.Result(replacement.Text) : replacement.Text; Editor.Document.Replace(start, Editor.SelectionLength, value); Editor.Select(start, value.Length); }
        Find(true);
    }
    void ReplaceAll()
    {
        if (Editor.IsReadOnly || search.Text.Length == 0) return; var regex = SearchExpression(); int count = regex.Matches(Editor.Text).Count;
        string next = regex.Replace(Editor.Text, m => regexSearch.IsChecked == true ? m.Result(replacement.Text) : replacement.Text); ReplaceSource(next); Notify($"{count} sostituzioni.");
    }
    void ToolNavigate(bool next)
    {
        if (active is null) return; var lines = CoreTools.ToolLines(Editor.Text, active.Model.Machine); if (lines.Count == 0) { Notify("Nessun cambio utensile rilevato."); return; }
        int current = Editor.TextArea.Caret.Line; int line = next ? lines.FirstOrDefault(l => l > current, lines[0]) : lines.LastOrDefault(l => l < current, lines[^1]); Editor.TextArea.Caret.Line = line; Editor.ScrollToLine(line); Editor.Focus();
    }
    void ToolList()
    {
        if (active is null) return; var list = CoreTools.Tools(active.Text.Text, active.Model.Machine); string text = list.Text(active.Model.Name);
        var w = new Window { Title = "Rama Edit · Lista utensili · " + active.Model.Name, Owner = this, Width = 950, Height = 620, WindowStartupLocation = WindowStartupLocation.CenterOwner };
        var p = new DockPanel { Margin = new(12) }; var actions = new StackPanel { Orientation = Orientation.Horizontal }; actions.Children.Add(B("Salva lista TXT", () => { var dlg = new SaveFileDialog { Filter = "Testo TXT|*.txt", FileName = Path.GetFileNameWithoutExtension(active.Model.Name) + "_utensili.txt" }; if (dlg.ShowDialog(w) == true) WriteText(dlg.FileName, text); })); var print = B("Stampa lista", () => PrintText(text, "Lista utensili")); print.IsEnabled = serial?.Receiving != true && serial?.Sending != true; actions.Children.Add(print); DockPanel.SetDock(actions, Dock.Top); p.Children.Add(actions);
        p.Children.Add(new TextBox { Text = text, IsReadOnly = true, AcceptsReturn = true, FontFamily = new("Consolas"), HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalScrollBarVisibility = ScrollBarVisibility.Auto }); w.Content = p; w.ShowDialog();
    }
    internal ColorSettingsWindow CreateColorSettings() => new(colorizer.Palette, colorizer.UseMotionColors, (palette, motion) =>
    {
        var saved = AppearancePalette.Saveable(palette, motion);
        if (!testMode) Storage.Save("palette.json", saved);
        ApplyAppearance(palette, motion);
    }) { Owner = this };
    void LoadAppearance()
    {
        var saved = Storage.Read<Dictionary<string, string>>("palette.json");
        if (!AppearancePalette.HasReferencePreset(saved))
        {
            if (saved is not null) Storage.Save("palette-before-iso-reference.json", saved);
            saved = AppearancePalette.Saveable(AppearancePalette.Defaults(), true);
            Storage.Save("palette.json", saved);
        }
        ApplyAppearance(AppearancePalette.Restore(saved), AppearancePalette.MotionStyle(saved));
    }
    void Colors() => CreateColorSettings().ShowDialog();
    void ApplyAppearance(Dictionary<string, string> palette, bool motion)
    {
        colorizer.Palette = AppearancePalette.Restore(palette); colorizer.UseMotionColors = motion;
        colorizer.Invalidate(); Editor.TextArea.TextView.Redraw();
        Preview.RapidBrush = ColorSettingsWindow.Brush(colorizer.Palette["rapid"]);
        Preview.WorkingBrush = ColorSettingsWindow.Brush(colorizer.Palette["cut"]);
        Preview.ClockwiseBrush = ColorSettingsWindow.Brush(colorizer.Palette["cw"]);
        Preview.CounterclockwiseBrush = ColorSettingsWindow.Brush(colorizer.Palette["ccw"]);
        ColorSettingsWindow.ApplyEditorColors(Editor, colorizer.Palette);
        var highlight = ColorSettingsWindow.Brush(colorizer.Palette["block"]).Clone(); highlight.Opacity = .6; execution.Background = highlight;
        Editor.TextArea.TextView.InvalidateLayer(ICSharpCode.AvalonEdit.Rendering.KnownLayer.Background); Preview.InvalidateVisual();
    }
    void ArrangeTransferToolbar()
    {
        toolbarRight.Children.Clear();
        editTools.Children.Remove(spacingButton); editTools.Children.Remove(toolListButton);
        transferTools.Children.Remove(spacingButton); transferTools.Children.Remove(toolListButton);
        transferTools.Children.Remove(transferSettingsButton);
        transferTools.Children.Remove(refreshPortsButton);
        if (page == "send")
        {
            transferTools.Children.Add(spacingButton); transferTools.Children.Add(toolListButton);
        }
        else
        {
            editTools.Children.Add(spacingButton); editTools.Children.Add(toolListButton);
        }
        if (page == "receive") toolbarRight.Children.Add(transferSettingsButton);
        else if (page == "workspace") transferTools.Children.Insert(2, transferSettingsButton);
        if (page == "receive") toolbarRight.Children.Add(refreshPortsButton);
        else transferTools.Children.Add(refreshPortsButton);
    }
    void Examples()
    {
        var w = new Window { Owner = this, Title = "Rama Edit · Esempi", Width = 460, Height = 620, WindowStartupLocation = WindowStartupLocation.CenterOwner }; var p = new StackPanel { Margin = new(20) };
        foreach (var (name, machine, sample) in new[] { ("Profilo fresatura", "mill", "mill"), ("Profilo tornitura", "lathe", "lathe"), ("Fanuc G71 / G70", "lathe", "fanuc") }) p.Children.Add(B(name, () => { AddDocument(new() { Name = sample + "_esempio.txt", Text = Storage.Resource<Dictionary<string, string>>("samples")[sample], Machine = machine }); w.Close(); }));
        foreach (var example in FanucExamples.All) p.Children.Add(B(example.Name, () => { AddDocument(new() { Name = example.Name, Text = example.Text, Machine = "lathe", LatheSystem = example.System }); w.Close(); }));
        w.Content = new ScrollViewer { Content = p, VerticalScrollBarVisibility = ScrollBarVisibility.Auto }; w.ShowDialog();
    }
    void Print()
    {
        if (serial?.Receiving == true || serial?.Sending == true) { Notify("Termina il trasferimento prima di stampare."); return; }
        PrintText(page == "receive" ? receivedDocument.Text : active?.Text.Text ?? "", page == "receive" ? receivedName.Text : active?.Model.Name ?? "Programma");
    }
    void PrintText(string text, string name)
    {
        var dlg = new PrintDialog(); if (dlg.ShowDialog() != true) return;
        var flow = new FlowDocument { FontFamily = new("Consolas"), FontSize = 11, PagePadding = new(36), PageWidth = dlg.PrintableAreaWidth, ColumnWidth = double.PositiveInfinity, Background = Brushes.White, Foreground = Brushes.Black };
        flow.Blocks.Add(new Paragraph(new Run(name)) { FontWeight = FontWeights.Bold, FontSize = 16 }); flow.Blocks.Add(new Paragraph(new Run(text)) { Margin = new(0), LineHeight = 14 });
        dlg.PrintDocument(((IDocumentPaginatorSource)flow).DocumentPaginator, "Rama Edit · " + name);
    }
    void Hover(object? sender, MouseEventArgs e)
    {
        var p = Editor.GetPositionFromPoint(e.GetPosition(Editor)); if (p is null || active is null) return;
        int offset = Editor.Document.GetOffset(p.Value.Location);
        var line = Editor.Document.GetLineByOffset(offset); string text = Editor.Document.GetText(line);
        foreach (Match m in Regex.Matches(text, @"[GM]\s*\d+(?:\.\d+)?", RegexOptions.IgnoreCase))
        {
            if (offset - line.Offset < m.Index || offset - line.Offset > m.Index + m.Length) continue;
            var info = CoreTools.CodeInfo(m.Value.Replace(" ", ""), active.Model.Machine, active.Model.LatheSystem); var tip = new ToolTip { Content = new TextBlock { Text = info.Code + " · " + info.Title + "\n" + info.Description, MaxWidth = 440, TextWrapping = TextWrapping.Wrap }, IsOpen = true }; Editor.ToolTip = tip; break;
        }
    }
    void Status()
    {
        int length = page == "receive" ? receivedDocument.TextLength : active?.Text.TextLength ?? 0;
        editorStatus.Text = $"Ln {Editor.TextArea.Caret.Line}, Col {Editor.TextArea.Caret.Column}     ·     {Editor.Document.LineCount} righe     ·     {length:N0} caratteri     ·     {(page == "receive" ? "Ricezione · sola lettura" : "G-code / ISO")}";
    }
    void BuildSimulation()
    {
        simulationPanel.Background = new SolidColorBrush(Color.FromRgb(24, 34, 44));
        var head = new DockPanel(); var info = B("Dettagli", SimulationDetails); info.FontSize = 11; info.MinHeight = 26; info.Padding = new(7, 3, 7, 3); DockPanel.SetDock(info, Dock.Right); head.Children.Add(info); head.Children.Add(new TextBlock { Text = "⌖  Simulazione percorso", Margin = new(10, 8, 10, 5), FontWeight = FontWeights.SemiBold }); DockPanel.SetDock(head, Dock.Top); simulationPanel.Children.Add(head);
        machineType.ToolTip = "Fanuc A: G90/G92/G94 sono cicli. G90/91: quote assolute/incrementali, cicli G77/G78/G79.";
        var controls = new WrapPanel(); controls.Children.Add(machineType); controls.Children.Add(diameter); controls.Children.Add(viewSelect); controls.Children.Add(B("−", () => Preview.Zoom(1 / 1.2))); controls.Children.Add(B("+", () => Preview.Zoom(1.2))); controls.Children.Add(B("Centra", Preview.Reset)); controls.Children.Add(rapids);
        DockPanel.SetDock(controls, Dock.Top); simulationPanel.Children.Add(controls);
        viewSelect.SelectionChanged += (_, _) => { Preview.View = viewSelect.SelectedItem?.ToString() ?? "3D"; if (!syncing && active is not null) active.View = Preview.View; Preview.Reset(); };
        rapids.Checked += (_, _) => { Preview.ShowRapids = true; Preview.InvalidateVisual(); }; rapids.Unchecked += (_, _) => { Preview.ShowRapids = false; Preview.InvalidateVisual(); };
        var bottom = new DockPanel(); DockPanel.SetDock(bottom, Dock.Bottom); simulationPanel.Children.Add(bottom);
        DockPanel.SetDock(simulationStatus, Dock.Bottom); bottom.Children.Add(simulationStatus); DockPanel.SetDock(coordinateText, Dock.Bottom); bottom.Children.Add(coordinateText);
        var playbackGrid = new Grid { Margin = new(5) }; playbackGrid.ColumnDefinitions.Add(new() { Width = GridLength.Auto }); playbackGrid.ColumnDefinitions.Add(new()); playbackGrid.ColumnDefinitions.Add(new() { Width = GridLength.Auto }); playbackGrid.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        playButton = B("▶", TogglePlay); playbackGrid.Children.Add(playButton); Grid.SetColumn(timeline, 1); playbackGrid.Children.Add(timeline); var reset = B("↺", () => { Pause(); timeline.Value = 0; }); Grid.SetColumn(reset, 2); playbackGrid.Children.Add(reset); Grid.SetColumn(speed, 3); playbackGrid.Children.Add(speed); bottom.Children.Add(playbackGrid);
        timeline.ValueChanged += (_, _) => DrawStep(); simulationPanel.Children.Add(Preview);
    }
    public void SetMachineType(string machine) => machineType.SelectedIndex = machine == "lathe-iso" ? 2 : machine == "lathe" ? 1 : 0;
    public void RebuildSimulation()
    {
        Pause(); if (active is null) return;
        colorizer.Machine = active.Model.Machine; colorizer.LatheSystem = active.Model.LatheSystem; colorizer.Invalidate(); Editor.TextArea.TextView.Redraw();
        CurrentSimulation = Simulator.Simulate(active.Text.Text, active.Model.Machine, active.Model.Diameter, active.Model.LatheSystem); cumulative = new double[CurrentSimulation.Segments.Count + 1]; for (int i = 0; i < CurrentSimulation.Segments.Count; i++) cumulative[i + 1] = cumulative[i] + CurrentSimulation.Segments[i].From.Distance(CurrentSimulation.Segments[i].To); Preview.Result = CurrentSimulation;
        syncing = true; timeline.Maximum = Math.Max(0, CurrentSimulation.Steps.Count - 1); timeline.Value = timeline.Maximum; syncing = false;
        simulationStatus.Foreground = CurrentSimulation.Complete && CurrentSimulation.OmittedMoves == 0 ? Brushes.MediumAquamarine : Brushes.Orange;
        simulationStatus.Text = CurrentSimulation.Complete ? $"Anteprima geometrica · {CurrentSimulation.Segments.Count} segmenti" : $"Anteprima parziale · riga {CurrentSimulation.Issues[0].Line}\n{CurrentSimulation.Issues[0].Message}";
        if (CurrentSimulation.OmittedMoves > 0) simulationStatus.Text += $"\n{CurrentSimulation.OmittedMoves} tratti macchina omessi: coordinate di riferimento non definite.";
        if (CurrentSimulation.Notes.Count > 0) simulationStatus.Text += $"\n{CurrentSimulation.Notes.Count} note: pulsante Dettagli.";
        simulationStatus.Text += "\nGeometria programmata · Nessuna verifica di collisione o asportazione.";
        DrawStep();
    }
    void SimulationDetails()
    {
        if (active is null) return;
        var rows = new List<string> { "SIMULAZIONE · " + active.Model.Name, "", active.Model.Machine == "lathe" ? (active.Model.LatheSystem == "A" ? "Fanuc A: G90/G92/G94 cicli" : "ISO G90/G91: quote assolute/incrementali; G77/G78/G79 cicli") : "Fresatrice", "" };
        rows.AddRange(CurrentSimulation.Issues.Select(i => $"Riga {i.Line}: {i.Message}"));
        rows.AddRange(CurrentSimulation.Notes); rows.Add(""); rows.Add("CODICI G PRESENTI NEL PROGRAMMA");
        foreach (var word in CoreTools.Words(active.Text.Text).Where(w => w.Letter == "G").DistinctBy(w => w.Value).OrderBy(w => w.Value))
        {
            var help = CoreTools.CodeInfo("G" + word.Raw.TrimStart('+'), active.Model.Machine, active.Model.LatheSystem);
            rows.Add(help.Code + " · " + help.Title); rows.Add(help.Description); rows.Add("");
        }
        var window = new Window { Owner = this, Title = "Rama Edit · Dettagli simulazione", Width = 800, Height = 620, WindowStartupLocation = WindowStartupLocation.CenterOwner };
        window.Content = new TextBox { Text = string.Join("\r\n", rows), IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, Margin = new(12), FontSize = 14, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        window.ShowDialog();
    }
    SimulationStep? CurrentStep() => CurrentSimulation.Steps.Count > 0 ? CurrentSimulation.Steps[Math.Clamp((int)timeline.Value, 0, CurrentSimulation.Steps.Count - 1)] : null;
    void DrawStep()
    {
        if (syncing) return; var step = CurrentStep(); Preview.StepIndex = step is null ? -1 : (int)timeline.Value; Preview.InvalidateVisual();
        var p = step?.Position ?? new Point3();
        coordinateText.Inlines.Clear();
        foreach (var (axis, value) in new[] { ('X', p.X), ('Y', p.Y), ('Z', p.Z) })
        {
            coordinateText.Inlines.Add(new Run(step?.PositionKnown == false ? $"{axis}         —  " : $"{axis} {value,9:0.000}  ") { Foreground = AxisColors.For(axis), FontWeight = FontWeights.SemiBold });
        }
        coordinateText.Inlines.Add(new Run($"\nPercorso {(step is not null && step.SegmentCount < cumulative.Length ? cumulative[step.SegmentCount] : CurrentSimulation.Distance):0.0} mm" + (step?.Action is string action ? " · " + action : "")) { FontSize = 13, Foreground = Brushes.LightSteelBlue });

        execution.Line = page == "workspace" && simulationVisible ? step?.Line ?? 0 : 0;
        Editor.TextArea.TextView.InvalidateLayer(ICSharpCode.AvalonEdit.Rendering.KnownLayer.Background);
        if (playing && follow.IsChecked == true && step is not null) Editor.ScrollToLine(step.Line);
    }
    void TogglePlay()
    {
        if (playing) { Pause(); return; }
        if (CurrentSimulation.Steps.Count == 0) return;
        if (timeline.Value >= timeline.Maximum) timeline.Value = 0; playbackPosition = timeline.Value; playing = true; playButton.Content = "Ⅱ"; playback.Start(); DrawStep();
    }
    void Tick()
    {
        double factor = new[] { .25, .5, 1, 2, 4, 10 }[Math.Max(0, speed.SelectedIndex)]; playbackPosition = Math.Min(timeline.Maximum, playbackPosition + factor * .65); timeline.Value = Math.Floor(playbackPosition);
        if (playbackPosition >= timeline.Maximum) Pause();
    }
    void Pause() { playing = false; playback.Stop(); if (playButton is not null) playButton.Content = "▶"; }
    async void HandleKey(object sender, KeyEventArgs e)
    {
        try
        {
            var ctrl = Keyboard.Modifiers.HasFlag(ModifierKeys.Control); var shift = Keyboard.Modifiers.HasFlag(ModifierKeys.Shift);
            if (e.Key == Key.Escape && findPanel.Visibility == Visibility.Visible) { ToggleFind(); e.Handled = true; }
            if (ctrl && e.Key == Key.O) { await OpenFiles(); e.Handled = true; }
            if (ctrl && e.Key == Key.S) { await Save(shift); e.Handled = true; }
            if (ctrl && e.Key == Key.N && page != "receive") { NewDocument(); e.Handled = true; }
            if (ctrl && e.Key == Key.W && active is not null && page != "receive") { await CloseDocument(active); e.Handled = true; }
            if (ctrl && e.Key == Key.P) { Print(); e.Handled = true; }
            if (ctrl && e.Key is Key.F or Key.H && page == "workspace") { if (findPanel.Visibility != Visibility.Visible) ToggleFind(); else search.Focus(); e.Handled = true; }
            if (e.Key == Key.F3) { Find(!shift); e.Handled = true; }
        }
        catch (Exception ex) { Error(ex.Message); }
    }
    async void OnClosing(object? sender, CancelEventArgs e)
    {
        if (closing || testMode) return; e.Cancel = true;
        if (preparingClose) return; preparingClose = true;
        try
        {
            if (serial?.Sending == true || serial?.Receiving == true)
            {
                if (MessageBox.Show(this, "Un trasferimento è in corso. Interromperlo e chiudere?", "Rama Edit", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
                serial.CancelSend(); if (serial.Receiving) await serial.StopReceivingAsync();
            }
            if (serial?.Sending == true) { for (int wait = 0; wait < 100 && serial.Sending; wait++) await Task.Delay(50); if (serial.Sending) { Error("Attendi l’arresto dell’invio prima di chiudere."); return; } }
            foreach (var d in documents.ToArray()) if (!await ConfirmDocument(d)) return;
            RenderReceived();
            if (receivedDirty)
            {
                var answer = MessageBox.Show(this, "Salvare il documento ricevuto prima di chiudere?", "Rama Edit", MessageBoxButton.YesNoCancel);
                if (answer == MessageBoxResult.Cancel) return;
                if (answer == MessageBoxResult.Yes) { Navigate("receive"); await Save(false); if (receivedDirty) return; }
            }
            Persist(); autosave.Stop(); receivedRefresh.Stop(); Pause(); if (serial is not null) await serial.DisposeAsync(); closing = true; Close();
        }
        catch (Exception ex) { Error(ex.Message); }
        finally { preparingClose = false; }
    }
}
