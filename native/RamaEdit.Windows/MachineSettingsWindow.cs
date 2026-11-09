using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using Microsoft.Win32;
using RamaEdit.Core;
namespace RamaEdit.Windows;

public class MachineSettingsWindow : Window
{
    readonly List<MachineProfile> machines; readonly string? lockedId; readonly ListBox list = new(); readonly Grid form = new();
    readonly List<Action> readers = []; MachineProfile? draft; bool changing;
    public bool Saved { get; private set; }
    public List<MachineProfile> Machines => machines;
    public MachineSettingsWindow(List<MachineProfile> machines, string? lockedId)
    {
        Style = (Style)Application.Current.FindResource(typeof(Window));
        this.machines = Storage.Clone(machines); this.lockedId = lockedId; Title = "Rama Edit · Impostazioni macchine RS232";
        Width = 1080; Height = 760; MinWidth = 780; MinHeight = 550; WindowStartupLocation = WindowStartupLocation.CenterOwner;
        var root = new DockPanel { Margin = new(12) }; Content = root;
        var footer = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        var cancel = Button("Chiudi", () => Close()); footer.Children.Add(cancel); DockPanel.SetDock(footer, Dock.Bottom); root.Children.Add(footer);
        var grid = new Grid(); grid.ColumnDefinitions.Add(new() { Width = new(240) }); grid.ColumnDefinitions.Add(new()); root.Children.Add(grid);
        var library = new DockPanel { Margin = new(0, 0, 12, 0) }; grid.Children.Add(library);
        var actions = new WrapPanel();
        actions.Children.Add(Button("+ Nuova", () => { machines.Add(new()); Refresh(machines[^1].Id); }));
        actions.Children.Add(Button("Elimina", Delete));
        actions.Children.Add(Button("Importa JSON", Import));
        actions.Children.Add(Button("Esporta JSON", Export)); DockPanel.SetDock(actions, Dock.Bottom); library.Children.Add(actions);
        list.SelectionChanged += (_, _) => { if (!changing) Edit(list.SelectedItem as MachineProfile); };
        library.Children.Add(list); Grid.SetColumn(form, 1); grid.Children.Add(form); Refresh(machines.FirstOrDefault()?.Id);
    }
    static Button Button(string text, Action action) { var b = new Button { Content = text }; b.Click += (_, _) => { try { action(); } catch (Exception e) { MessageBox.Show(e.Message, "Rama Edit", MessageBoxButton.OK, MessageBoxImage.Error); } }; return b; }
    void Refresh(string? id) { changing = true; list.ItemsSource = null; list.ItemsSource = machines; list.SelectedItem = machines.FirstOrDefault(m => m.Id == id) ?? machines.FirstOrDefault(); changing = false; Edit(list.SelectedItem as MachineProfile); }
    void Edit(MachineProfile? machine)
    {
        form.Children.Clear(); readers.Clear(); if (machine is null) return; draft = Storage.Clone(machine);
        var root = new DockPanel(); form.Children.Add(root);
        var footer = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        footer.Children.Add(Button("Ripristina modulo", () => Edit(machine))); footer.Children.Add(Button("Salva macchina", Save)); DockPanel.SetDock(footer, Dock.Bottom); root.Children.Add(footer);
        if (machine.Id == lockedId)
        {
            var note = new TextBlock { Text = "Questa macchina è collegata. Disconnetti la porta per modificarla.", Margin = new(8), TextWrapping = TextWrapping.Wrap }; DockPanel.SetDock(note, Dock.Top); root.Children.Add(note);
        }
        var header = new StackPanel(); DockPanel.SetDock(header, Dock.Top); root.Children.Add(header);
        Field(header, draft, nameof(draft.Name), "Nome macchina");
        Field(header, draft, nameof(draft.Control), "Controllo", ["Fanuc", "Mitsubishi", "Altro controllo ISO"]);
        var tabs = new TabControl { Margin = new(3, 8, 3, 3), IsEnabled = machine.Id != lockedId }; header.IsEnabled = tabs.IsEnabled; footer.IsEnabled = tabs.IsEnabled; root.Children.Add(tabs);
        StackPanel Tab(string name) { var panel = new StackPanel { Margin = new(16) }; tabs.Items.Add(new TabItem { Header = name, Content = new ScrollViewer { Content = panel, VerticalScrollBarVisibility = ScrollBarVisibility.Auto } }); return panel; }
        var port = Tab("Porta");
        Field(port, draft, nameof(draft.PortName), "Porta COM (esempio COM3)");
        Field(port, draft.Settings, "BaudRate", "Velocità baud"); Field(port, draft.Settings, "DataBits", "Bit dati"); Field(port, draft.Settings, "StopBits", "Bit di stop (1, 1.5 o 2)");
        Field(port, draft.Settings, "Parity", "Parità", ["none", "even", "odd", "mark", "space"]);
        Field(port, draft.Settings, "FlowControl", "Controllo flusso", ["none", "software", "hardware", "both"]);
        Field(port, draft.Settings.Port, "Dtr", "Attiva DTR (indeterminato = predefinito)"); Field(port, draft.Settings.Port, "Rts", "Attiva RTS (gestito dal driver con flusso hardware)");
        Field(port, draft.Settings.Port, "CheckParity", "Controlla errori di parità ricevuti");
        Field(port, draft.Settings.Port, "Xon", @"Carattere XON (\17)"); Field(port, draft.Settings.Port, "Xoff", @"Carattere XOFF (\19)");
        var tx = Tab("Trasmissione");
        Field(tx, draft.Settings, "LineEnding", "Fine riga CR/LF", ["CRLF", "LF", "CR"]);
        foreach (var (p, label) in new[] { ("StartTrigger", "Trigger d’inizio"), ("EndTrigger", "Trigger di fine"), ("BeforeFile", "Invia prima del file"), ("AfterFile", "Invia dopo il file"), ("IgnoreLines", "Ignora righe contenenti"), ("RemoveCharacters", "Rimuovi caratteri"), ("StopAfter", "Interrompi dopo N caratteri (0 = tutto)"), ("HandshakeTimeout", "Tempo limite handshake (secondi; 0 = nessuno)"), ("BeforeLineDelay", "Ritardo prima di ogni riga (ms)"), ("WaitForXon", "Attendi XON"), ("RemoveNul", "Rimuovi ASCII 0"), ("RemoveSpaces", "Rimuovi spazi"), ("TabsToSpaces", "Sostituisci tab con spazi"), ("CustomLineEnding", "Fine riga personalizzato"), ("LineEndingSequence", @"Sequenza fine riga (\13\10)") }) Field(tx, draft.Settings.Transmit, p, label);
        Field(tx, draft.Settings, "Wrap", "Aggiungi delimitatori % se mancanti"); Field(tx, draft.Settings, "Delay", "Pausa aggiuntiva tra blocchi (ms)");
        var rx = Tab("Ricezione");
        Field(rx, draft.Settings.Receive, "LineEnding", "Fine riga CR/LF", ["auto", "CRLF", "LF", "CR"]);
        foreach (var (p, label) in new[] { ("StartTrigger", "Trigger d’inizio"), ("EndTrigger", "Trigger di fine"), ("DiscardLineCharacters", "Scarta righe contenenti questi caratteri"), ("OmitLineString", "Ometti righe contenenti la stringa"), ("RemoveCharacters", @"Rimuovi caratteri (esempio \0)"), ("RemoveControls", "Rimuovi controlli ASCII 0–31, conserva CR/LF"), ("OmitEmpty", "Ometti righe vuote"), ("Timeout", "Tempo limite ricezione (secondi; 0 = manuale)"), ("SendXon", "Invia XON all’inizio"), ("Initial", "Invia all’inizio della ricezione") }) Field(rx, draft.Settings.Receive, p, label);
        var dirs = Tab("Directory");
        Field(dirs, draft.Settings.Directories.Send, "Path", "Cartella trasmissione predefinita"); Field(dirs, draft.Settings.Directories.Send, "Extension", "Estensione trasmissione"); Field(dirs, draft.Settings.Directories.Send, "AdditionalExtensions", "Estensioni aggiuntive trasmissione");
        Field(dirs, draft.Settings.Directories.Receive, "Path", "Cartella ricezione predefinita"); Field(dirs, draft.Settings.Directories.Receive, "Extension", "Estensione ricezione"); Field(dirs, draft.Settings.Directories.Receive, "AdditionalExtensions", "Estensioni aggiuntive ricezione");
        var info = Tab("Info versione"); info.Children.Add(new TextBlock { Foreground = Brushes.LightSteelBlue, Text = "Rama Edit 0.2 · Applicazione nativa Windows\nC# · .NET 10 · WPF\n\nConfigurazioni e sessione salvate in:\n" + Storage.Folder + "\n\nSoftware XON/XOFF con caratteri configurabili;\nRTS/CTS gestiti dal driver Windows.\nLa ricezione si interrompe in caso di errore della porta.\n\nL’anteprima geometrica non verifica collisioni o asportazione.", TextWrapping = TextWrapping.Wrap });
    }
    void Field(Panel parent, object model, string property, string label, string[]? choices = null)
    {
        var p = model.GetType().GetProperty(property)!;
        if (p.PropertyType == typeof(bool) || p.PropertyType == typeof(bool?))
        {
            var box = new CheckBox { Content = label, IsThreeState = p.PropertyType == typeof(bool?), IsChecked = (bool?)p.GetValue(model) }; parent.Children.Add(box); readers.Add(() => p.SetValue(model, box.IsChecked)); return;
        }
        var row = new Grid { Margin = new(0, 2, 0, 2) }; row.ColumnDefinitions.Add(new() { Width = new(280) }); row.ColumnDefinitions.Add(new());
        row.Children.Add(new TextBlock { Text = label, Foreground = Brushes.LightSteelBlue, TextWrapping = TextWrapping.Wrap, VerticalAlignment = VerticalAlignment.Center, Margin = new(3) });
        if (choices is not null)
        {
            var labels = new Dictionary<string, string> { ["none"] = "Nessuno", ["even"] = "Pari", ["odd"] = "Dispari", ["software"] = "Software · XON/XOFF", ["hardware"] = "Hardware · RTS/CTS", ["both"] = "Software + hardware", ["auto"] = "Automatico" };
            var combo = new ComboBox { ItemsSource = choices.Select(c => new KeyValuePair<string, string>(c, labels.GetValueOrDefault(c, c))).ToList(), SelectedValuePath = "Key", DisplayMemberPath = "Value", SelectedValue = p.GetValue(model) }; Grid.SetColumn(combo, 1); row.Children.Add(combo); readers.Add(() => p.SetValue(model, combo.SelectedValue?.ToString() ?? ""));
        }
        else
        {
            var box = new TextBox { Text = Convert.ToString(p.GetValue(model), System.Globalization.CultureInfo.InvariantCulture) ?? "" }; Grid.SetColumn(box, 1); row.Children.Add(box);
            readers.Add(() => { try { p.SetValue(model, Convert.ChangeType(box.Text, p.PropertyType, System.Globalization.CultureInfo.InvariantCulture)); } catch { throw new ArgumentException($"Valore non valido: {label}."); } });
        }
        parent.Children.Add(row);
    }
    void Save()
    {
        if (draft is null || draft.Id == lockedId) return; foreach (var read in readers) read();
        if (string.IsNullOrWhiteSpace(draft.Name) || draft.Name.Length > 80) throw new ArgumentException("Inserire un nome macchina di massimo 80 caratteri.");
        draft.Settings.Validate();
        var next = Storage.Clone(machines); int at = next.FindIndex(m => m.Id == draft.Id); next[at] = Storage.Clone(draft);
        Storage.Save("machines.json", next); machines.Clear(); machines.AddRange(next); Saved = true; Refresh(draft.Id);
    }
    void Delete()
    {
        if (list.SelectedItem is not MachineProfile m || m.Id == lockedId) return;
        if (MessageBox.Show($"Eliminare la macchina {m.Name}?", "Rama Edit", MessageBoxButton.YesNo) != MessageBoxResult.Yes) return;
        var next = machines.Where(x => x.Id != m.Id).ToList(); Storage.Save("machines.json", next); machines.Remove(m); Saved = true; Refresh(null);
    }
    void Import()
    {
        var dlg = new OpenFileDialog { Filter = "Configurazioni macchine JSON|*.json" };
        if (dlg.ShowDialog(this) != true) return; string text = File.ReadAllText(dlg.FileName); if (text.Length > 2 * 1024 * 1024) throw new InvalidDataException("File oltre 2 MB.");
        using var json = JsonDocument.Parse(text); var array = json.RootElement.ValueKind == JsonValueKind.Array ? json.RootElement : json.RootElement.GetProperty("machines");
        var imported = JsonSerializer.Deserialize<List<MachineProfile>>(array.GetRawText(), Storage.Json) ?? throw new InvalidDataException("File non valido.");
        foreach (var m in imported) { m.Settings.Validate(); if (string.IsNullOrWhiteSpace(m.Name) || m.Name.Length > 80) throw new InvalidDataException("Nome macchina non valido."); if (string.IsNullOrWhiteSpace(m.PortName)) m.PortName = m.ImportedFrom?.Port ?? ""; }
        Storage.UpgradeReceiveProfiles(imported);
        var next = Storage.Clone(machines);
        foreach (var m in imported) { m.Id = Guid.NewGuid().ToString(); if (next.Any(n => n.Name.Equals(m.Name, StringComparison.OrdinalIgnoreCase))) m.Name += " (importata)"; next.Add(m); }
        Storage.Save("machines.json", next); machines.Clear(); machines.AddRange(next); Saved = true; Refresh(imported.FirstOrDefault()?.Id);
    }
    void Export() { var dlg = new SaveFileDialog { Filter = "Configurazioni JSON|*.json", FileName = "Rama Edit - macchine.json" }; if (dlg.ShowDialog(this) == true) File.WriteAllText(dlg.FileName, JsonSerializer.Serialize(machines, Storage.Json)); }
}
