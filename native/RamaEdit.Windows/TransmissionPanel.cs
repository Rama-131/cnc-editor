using System.Diagnostics;
using System.Text;
using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using RamaEdit.Core;

namespace RamaEdit.Windows;

public sealed class TransmissionPanel : Expander
{
    const int MaxLog = 64000;
    readonly TextBlock heading = new() { FontWeight = FontWeights.SemiBold }, context = new() { TextWrapping = TextWrapping.Wrap, MaxHeight = 56, FontSize = 12 };
    readonly TextBlock state = new() { FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap, FontSize = 14 }, detail = new() { TextWrapping = TextWrapping.Wrap, FontSize = 12 };
    readonly TextBlock counts = new() { FontSize = 12 }, elapsed = new() { FontSize = 12, HorizontalAlignment = HorizontalAlignment.Right };
    readonly ProgressBar progress = new() { Minimum = 0, Maximum = 100, Height = 12, Margin = new(0, 5, 0, 5), Foreground = new SolidColorBrush(Color.FromRgb(58, 168, 255)) };
    readonly TextBox log = new() { IsReadOnly = true, AcceptsReturn = true, FontFamily = new("Consolas"), FontSize = 12, Height = 88, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, Margin = new(0, 5, 0, 3) };
    readonly Button stop, close;
    readonly Stopwatch clock = new();
    readonly DispatcherTimer refresh = new() { Interval = TimeSpan.FromMilliseconds(100) };
    readonly object gate = new(); readonly StringBuilder pending = new();
    SerialSession? source; bool running, truncated; string connection = "";
    TransmissionStatus? previous;
    public bool HasTransmission { get; private set; }
    internal string StatusText => state.Text;
    internal double ProgressPercent => progress.Value;
    internal bool CanStop => stop.IsEnabled;

    public TransmissionPanel()
    {
        var header = new Grid(); header.ColumnDefinitions.Add(new()); header.ColumnDefinitions.Add(new() { Width = GridLength.Auto });
        heading.VerticalAlignment = VerticalAlignment.Center; heading.TextTrimming = TextTrimming.CharacterEllipsis; header.Children.Add(heading);
        close = Button("×", Dismiss); close.Width = 38; close.MinHeight = 32; close.FontSize = 24; close.FontWeight = FontWeights.Bold;
        close.Foreground = new SolidColorBrush(Color.FromRgb(255, 52, 74)); close.BorderBrush = close.Foreground;
        close.Padding = new(0); close.Margin = new(4, 0, 0, 0); close.Visibility = Visibility.Collapsed;
        close.ToolTip = "Chiudi stato trasmissione"; AutomationProperties.SetName(close, "Chiudi stato trasmissione"); Grid.SetColumn(close, 1); header.Children.Add(close);
        Header = header; SizeChanged += (_, _) => header.Width = Math.Max(0, ActualWidth - 36);
        Visibility = Visibility.Collapsed; Margin = new(8, 4, 8, 3);
        Background = new SolidColorBrush(Color.FromRgb(26, 41, 53)); Foreground = new SolidColorBrush(Color.FromRgb(215, 226, 235));
        HorizontalContentAlignment = HorizontalAlignment.Stretch;
        var panel = new StackPanel { Margin = new(9, 5, 9, 5) }; Content = panel;
        panel.Children.Add(context); panel.Children.Add(state); panel.Children.Add(detail); panel.Children.Add(progress);
        var row = new DockPanel(); DockPanel.SetDock(elapsed, Dock.Right); row.Children.Add(elapsed); row.Children.Add(counts); panel.Children.Add(row);
        panel.Children.Add(log);
        var buttons = new WrapPanel(); panel.Children.Add(buttons);
        stop = Button("■ Interrompi invio", StopSending); buttons.Children.Add(stop);
        buttons.Children.Add(Button("Copia dettagli", () =>
        {
            try { Clipboard.SetText(Report()); }
            catch (Exception e) { MessageBox.Show(Window.GetWindow(this), "Impossibile copiare: " + e.Message, "Rama Edit", MessageBoxButton.OK, MessageBoxImage.Error); }
        }));
        buttons.Children.Add(Button("Nascondi", () => IsExpanded = false));
        refresh.Tick += (_, _) => RefreshStatus(); Unloaded += (_, _) => refresh.Stop();
    }
    static Button Button(string text, Action action)
    {
        var button = new Button { Content = text, Padding = new(10, 5, 10, 5) }; AutomationProperties.SetName(button, text);
        button.Click += (_, _) => action(); return button;
    }
    void StopSending() { source?.CancelSend(); stop.IsEnabled = false; }
    void Dismiss()
    {
        lock (gate) if (running) return;
        HasTransmission = false; Visibility = Visibility.Collapsed;
    }
    public void Begin(SerialSession session, string file, string machine, string port, SerialSettings settings)
    {
        refresh.Stop();
        previous = session.GetTransmissionStatus();
        lock (gate) { source = session; pending.Clear(); running = true; }
        truncated = false; log.Clear(); clock.Restart(); HasTransmission = true;
        string parity = settings.Parity switch { "even" => "pari", "odd" => "dispari", "none" => "nessuna", _ => settings.Parity };
        string flow = settings.FlowControl switch { "both" => "XON/XOFF + RTS/CTS", "software" => "XON/XOFF", "hardware" => "RTS/CTS", _ => "nessuno" };
        string timeout = settings.Transmit.HandshakeTimeout == 0 ? "illimitato" : settings.Transmit.HandshakeTimeout + " s";
        connection = $"File: {file}\nMacchina: {machine} · Porta: {port}\n{settings.BaudRate} baud · {settings.DataBits} bit · parità {parity} · {settings.StopBits} stop · flusso {flow}\nDTR: {settings.Port.Dtr} · RTS: {settings.Port.Rts} · XON: {settings.Port.Xon} · XOFF: {settings.Port.Xoff} · Attendi XON: {settings.Transmit.WaitForXon} · Controlla parità: {settings.Port.CheckParity} · Timeout: {timeout}";
        context.Text = $"{machine} · {port} · {file}\n{settings.BaudRate} baud · {settings.DataBits} bit · parità {parity} · {settings.StopBits} stop · {flow}";
        state.Text = "Preparazione dell’invio…"; state.Foreground = Brushes.LightSkyBlue; detail.Text = "";
        heading.Text = "Stato trasmissione · Preparazione"; progress.Value = 0; counts.Text = "0 byte"; elapsed.Text = "Tempo 00:00:00";
        stop.IsEnabled = true; close.Visibility = Visibility.Collapsed; Visibility = Visibility.Visible; IsExpanded = true; refresh.Start();
    }
    public void Append(SerialSession session, string text)
    {
        lock (gate)
        {
            if (source != session || !running) return;
            pending.Append(text);
            if (pending.Length > MaxLog) { pending.Remove(0, pending.Length - MaxLog); truncated = true; }
        }
    }
    void FlushLog()
    {
        string addition;
        lock (gate) { addition = pending.ToString(); pending.Clear(); }
        if (addition.Length == 0) return;
        string text = log.Text + addition;
        if (text.Length > MaxLog) { text = text[^MaxLog..]; truncated = true; }
        log.Text = text; log.ScrollToEnd();
    }
    internal void RefreshStatus()
    {
        FlushLog(); if (source is null) return;
        ShowStatus(source.GetTransmissionStatus());
    }
    void ShowStatus(TransmissionStatus status)
    {
        string label = status.Phase switch
        {
            TransmissionPhase.Sending => "Invio in corso",
            TransmissionPhase.PausedByXoff => "In pausa · XOFF ricevuto dalla CNC",
            TransmissionPhase.WaitingForXon => "In attesa del segnale XON dalla CNC",
            TransmissionPhase.WaitingForCts => "In attesa di CTS · La CNC non dà il consenso",
            TransmissionPhase.Completed => "Invio terminato sulla porta",
            TransmissionPhase.Limited => "Invio parziale · Raggiunto il limite di caratteri",
            TransmissionPhase.Cancelled => "Invio interrotto",
            TransmissionPhase.Failed => "Errore di trasmissione",
            _ => "Preparazione dell’invio…"
        };
        state.Text = label; heading.Text = "Stato trasmissione · " + label;
        state.Foreground = status.Phase switch { TransmissionPhase.Failed => Brushes.LightSalmon, TransmissionPhase.Completed => Brushes.LightGreen, TransmissionPhase.Cancelled or TransmissionPhase.Limited => Brushes.Gold, _ => Brushes.LightSkyBlue };
        detail.Text = status.Error ?? (status.Phase is TransmissionPhase.Completed or TransmissionPhase.Limited or TransmissionPhase.Cancelled ? "Verifica sulla CNC il programma ricevuto." : "");
        detail.Foreground = status.Phase == TransmissionPhase.Failed ? Brushes.LightSalmon : Brushes.LightSteelBlue;
        progress.Value = Math.Clamp(status.Percent, 0, 100); counts.Text = $"{status.SentBytes:N0} / {status.TotalBytes:N0} byte inviati alla porta · {status.Percent:0.0}%";
        elapsed.Text = "Tempo " + clock.Elapsed.ToString(@"hh\:mm\:ss");
    }
    public void Finish(string? error = null, bool started = true)
    {
        refresh.Stop(); clock.Stop();
        lock (gate) running = false;
        FlushLog();
        var status = started ? source?.GetTransmissionStatus() ?? new(TransmissionPhase.Idle) : new(TransmissionPhase.Idle);
        if (ReferenceEquals(status, previous)) status = new(TransmissionPhase.Idle);
        if (error is not null) status = status with { Phase = TransmissionPhase.Failed, Error = error };
        ShowStatus(status); stop.IsEnabled = false; close.Visibility = Visibility.Visible;
        if (status.Phase == TransmissionPhase.Failed) IsExpanded = true;
    }
    internal string Report()
    {
        FlushLog();
        return $"{AppInfo.DisplayName} · Stato trasmissione\n{connection}\n\n{state.Text}\n{detail.Text}\n{counts.Text}\n{elapsed.Text}\n\nRegistro{(truncated ? " (ultimi 64.000 caratteri)" : "")}\n{log.Text}";
    }
}
