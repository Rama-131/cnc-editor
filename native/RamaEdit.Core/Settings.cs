using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace RamaEdit.Core;

public class PortOptions { public bool? Dtr { get; set; } public bool? Rts { get; set; } public string Xon { get; set; } = @"\17"; public string Xoff { get; set; } = @"\19"; }
public class TransmitOptions
{
    public string StartTrigger { get; set; } = ""; public string EndTrigger { get; set; } = "";
    public string BeforeFile { get; set; } = ""; public string AfterFile { get; set; } = ""; public string IgnoreLines { get; set; } = ""; public string RemoveCharacters { get; set; } = "";
    public int StopAfter { get; set; }
    public int HandshakeTimeout { get; set; } = 30; public int BeforeLineDelay { get; set; }
    public bool WaitForXon { get; set; }
    public bool RemoveNul { get; set; }
    public bool RemoveSpaces { get; set; }
    public bool TabsToSpaces { get; set; }
    public bool CustomLineEnding { get; set; }
    public string LineEndingSequence { get; set; } = @"\13\10";
}
public class ReceiveOptions
{
    public string LineEnding { get; set; } = "auto"; public string DiscardLineCharacters { get; set; } = ""; public string OmitLineString { get; set; } = ""; public string RemoveCharacters { get; set; } = "";
    public bool RemoveControls { get; set; }
    public bool OmitEmpty { get; set; }
    public string StartTrigger { get; set; } = ""; public string EndTrigger { get; set; } = "";
    public int Timeout { get; set; }
    public bool SendXon { get; set; } = true; public string Initial { get; set; } = "";
}
public class DirectoryEntry { public string Extension { get; set; } = "txt"; public string AdditionalExtensions { get; set; } = "nc;cnc;tap;iso;mpf;gcode"; public string Path { get; set; } = ""; }
public class DirectoryOptions { public DirectoryEntry Send { get; set; } = new(); public DirectoryEntry Receive { get; set; } = new(); }
public class SerialSettings
{
    public int BaudRate { get; set; } = 9600; public int DataBits { get; set; } = 7; public double StopBits { get; set; } = 2;
    public string Parity { get; set; } = "even"; public string FlowControl { get; set; } = "software"; public string LineEnding { get; set; } = "CRLF";
    public int Delay { get; set; } = 10; public bool Wrap { get; set; } = true;
    public PortOptions Port { get; set; } = new(); public TransmitOptions Transmit { get; set; } = new(); public ReceiveOptions Receive { get; set; } = new(); public DirectoryOptions Directories { get; set; } = new();
    public void Validate()
    {
        if (BaudRate < 110 || BaudRate > 921600 || DataBits is < 5 or > 8 || !new[] { 1d, 1.5, 2d }.Contains(StopBits) || !new[] { "none", "even", "odd", "mark", "space" }.Contains(Parity) || !new[] { "none", "software", "hardware", "both" }.Contains(FlowControl)) throw new ArgumentException("Parametri porta seriale non validi.");
        if (Port is null || Transmit is null || Receive is null || Directories is null || Directories.Send is null || Directories.Receive is null) throw new ArgumentException("Configurazione seriale incompleta.");
        if (!new[] { "CRLF", "CR", "LF" }.Contains(LineEnding) || !new[] { "auto", "CRLF", "CR", "LF" }.Contains(Receive.LineEnding)) throw new ArgumentException("Fine riga non valido.");
        if (Transmit.HandshakeTimeout is < 0 or > 3600 || Receive.Timeout is < 0 or > 3600 || Transmit.BeforeLineDelay is < 0 or > 60000 || Delay is < 0 or > 60000 || Transmit.StopAfter < 0) throw new ArgumentException("Tempi e limiti non validi.");
        foreach (var model in new object[] { Port, Transmit, Receive })
            foreach (var p in model.GetType().GetProperties().Where(p => p.PropertyType == typeof(string))) SerialText.Control((string?)p.GetValue(model) ?? "");
        string xon = SerialText.Control(Port.Xon), xoff = SerialText.Control(Port.Xoff);
        if (xon.Length != 1 || xoff.Length != 1 || xon == xoff) throw new ArgumentException("XON e XOFF devono essere caratteri ASCII singoli e diversi.");
        if (Transmit.WaitForXon && FlowControl is not ("software" or "both")) throw new ArgumentException("Attendi XON richiede il controllo di flusso Software.");
        if (Transmit.CustomLineEnding && SerialText.Control(Transmit.LineEndingSequence).Length == 0) throw new ArgumentException("Specificare il fine riga.");
    }
}
public class ImportInfo { public string FileName { get; set; } = ""; public string Port { get; set; } = ""; public string Protocol { get; set; } = ""; }
public class MachineProfile
{
    public string Id { get; set; } = Guid.NewGuid().ToString(); public string Name { get; set; } = "Nuova macchina"; public string Control { get; set; } = "Fanuc";
    public string PortName { get; set; } = ""; public SerialSettings Settings { get; set; } = new(); public ImportInfo? ImportedFrom { get; set; }
    public int ReceiveFormatVersion { get; set; }
    public override string ToString() => Name;
}
public class SavedDocument { public string Name { get; set; } = "nuovo_programma.txt"; public string? Path { get; set; } public string Text { get; set; } = ""; public bool Dirty { get; set; } public string Machine { get; set; } = "mill"; public string LatheSystem { get; set; } = "A"; public bool Diameter { get; set; } = true; }
public class WorkspaceState { public List<SavedDocument> Documents { get; set; } = []; public int ActiveIndex { get; set; } public string? SelectedMachineId { get; set; } public bool SimulationVisible { get; set; } = true; public string Received { get; set; } = ""; public string ReceivedName { get; set; } = "ricevuto.txt"; public bool ReceivedDirty { get; set; } }
public static class Storage
{
    public static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true, WriteIndented = true };
    public static readonly string Folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Rama Edit");
    public static T Resource<T>(string name)
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream($"RamaEdit.Core.Data.{name}.json") ?? throw new FileNotFoundException(name);
        return JsonSerializer.Deserialize<T>(stream, Json) ?? throw new InvalidDataException(name);
    }
    public static T Clone<T>(T model) => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(model, Json), Json)!;
    public static void Save<T>(string filename, T data)
    {
        Directory.CreateDirectory(Folder); string path = Path.Combine(Folder, filename), temp = path + ".tmp";
        using (var stream = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
        { JsonSerializer.Serialize(stream, data, Json); stream.Flush(true); }
        File.Move(temp, path, true);
    }
    public static T? Read<T>(string filename)
    {
        string path = Path.Combine(Folder, filename);
        if (!File.Exists(path)) return default;
        return JsonSerializer.Deserialize<T>(File.ReadAllText(path), Json) ?? throw new InvalidDataException($"File {filename} non valido. Una copia rimane in {Folder}.");
    }
    public static bool UpgradeReceiveProfiles(IEnumerable<MachineProfile> profiles)
    {
        bool changed = false;
        foreach (var machine in profiles)
        {
            bool biglia = machine.Id == "mch-biglias131" || string.Equals(machine.ImportedFrom?.FileName, "BIGLIAS131.mch", StringComparison.OrdinalIgnoreCase);
            if (!biglia || machine.ReceiveFormatVersion >= 1) continue;
            var rx = machine.Settings.Receive;
            rx.OmitEmpty = true; rx.LineEnding = "CRLF";
            // DC2/DC4 delimit the serial tape stream; they are not NC program text.
            foreach (int control in new[] { 18, 20 })
                if (!SerialText.Control(rx.RemoveCharacters).Contains((char)control)) rx.RemoveCharacters += "\\" + control;
            machine.ReceiveFormatVersion = 1; changed = true;
        }
        return changed;
    }
    public static List<MachineProfile> Defaults()
    {
        var profiles = Resource<List<MachineProfile>>("machines");
        foreach (var m in profiles) { m.PortName = m.ImportedFrom?.Port ?? ""; m.Settings.Validate(); }
        UpgradeReceiveProfiles(profiles); return profiles;
    }
}
