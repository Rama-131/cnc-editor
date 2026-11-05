using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
namespace RamaEdit.Core;

public record CodeWord(int From, int Length, string Letter, string Raw, double Value);
public record CodeHelp(string Code, string Title, string Description);
public class ToolEntry
{
    public int Number { get; set; }
    public string Label => "T" + Number;
    public List<string> Codes { get; set; } = []; public List<string> Descriptions { get; set; } = []; public List<string> Offsets { get; set; } = [];
    public int FirstLine { get; set; }
    public int Changes { get; set; }
    public string Description => string.Join(" / ", Descriptions); public string Offset => string.Join(", ", Offsets); public string State => Changes > 0 ? $"{Changes} richiami" : "Solo preselezione";
}
public record ToolList(List<ToolEntry> Tools, List<Issue> Notes)
{
    public string Text(string filename)
    {
        var rows = new List<string> { "LISTA UTENSILI · " + filename, "", "Utensile\tDescrizione\tCorrettori\tStato\tPrima riga\tCodici T" };
        rows.AddRange(Tools.Select(t => $"{t.Label}\t{t.Description}\t{t.Offset}\t{t.State}\t{t.FirstLine}\t{string.Join(", ", t.Codes)}"));
        if (Tools.Count == 0) rows.Add("Nessun utensile numerico rilevato.");
        rows.AddRange(Notes.Select(n => $"Riga {n.Line}: {n.Message}")); return string.Join("\r\n", rows) + "\r\n";
    }
}
public static class ProgramTools
{
    public static string VisibleCode(string source)
    {
        var text = source.ToCharArray(); int depth = 0; char quote = '\0'; bool semicolon = false;
        for (int i = 0; i < text.Length; i++)
        {
            char c = source[i];
            if (c is '\r' or '\n') { semicolon = false; continue; }
            if (semicolon) { text[i] = ' '; continue; }
            if (depth > 0) { if (c == '(') depth++; if (c == ')') depth--; text[i] = ' '; continue; }
            if (quote != '\0') { text[i] = ' '; if (c == quote) { if (i + 1 < text.Length && source[i + 1] == quote) text[++i] = ' '; else quote = '\0'; } continue; }
            if (c == '(') { depth = 1; text[i] = ' '; }
            else if (c == ';') { semicolon = true; text[i] = ' '; }
            else if (c is '\'' or '"') { quote = c; text[i] = ' '; }
        }
        return new(text);
    }
    public static List<CodeWord> Words(string source) => GCode.WordRegex().Matches(VisibleCode(source)).Select(m => new CodeWord(m.Index, m.Length, m.Groups[1].Value.ToUpperInvariant(), m.Groups[2].Value, GCode.Number(m.Groups[2].Value))).ToList();
    public static string AddSpaces(string source)
    {
        var result = new StringBuilder(); var visible = VisibleCode(source); int start = 0;
        foreach (var line in source.Split('\n'))
        {
            string code = visible.Substring(start, line.Length); start += line.Length + 1;
            bool safe = !Regex.IsMatch(code, @"[#\[\]*/=]") && !Regex.IsMatch(GCode.WordRegex().Replace(code, ""), @"[^\s%:]");
            if (!safe) result.Append(line);
            else
            {
                var indexes = GCode.WordRegex().Matches(code).Select(m => m.Index).ToHashSet();
                for (int i = 0; i < line.Length; i++) { if (i > 0 && indexes.Contains(i) && !char.IsWhiteSpace(line[i - 1]) && line[i - 1] is not ('%' or ':')) result.Append(' '); result.Append(line[i]); }
            }
            result.Append('\n');
        }
        return result.ToString()[..^1];
    }
    public static string Adjust(string source, string letter, double value)
    {
        if (!double.IsFinite(value) || value <= 0) throw new ArgumentException("Inserire un valore positivo.");
        var result = new StringBuilder(source); string formatted = value.ToString("0.############", CultureInfo.InvariantCulture);
        foreach (var word in Words(source).Where(w => w.Letter == letter).OrderByDescending(w => w.From)) result.Remove(word.From, word.Length).Insert(word.From, letter + formatted);
        return result.ToString();
    }
    public static List<int> ToolLines(string source, string machine)
    {
        string[] lines = VisibleCode(source).Split('\n'); var result = new List<int>();
        for (int i = 0; i < lines.Length; i++) if (Words(lines[i]).Any(w => machine == "lathe" ? w.Letter == "T" && w.Value > 0 : w.Letter == "M" && w.Value == 6)) result.Add(i + 1);
        return result;
    }
    public static ToolList Tools(string source, string machine)
    {
        var result = new ToolList([], []); ToolEntry? pending = null, active = null; List<string> preceding = [];
        string[] lines = source.Split('\n'), visible = VisibleCode(source).Split('\n'); bool externalNoted = false;
        for (int i = 0; i < lines.Length; i++)
        {
            int line = i + 1; var words = Words(visible[i]); var ms = words.Where(w => w.Letter == "M").Select(w => w.Value).ToList();
            var comments = Regex.Matches(lines[i], @"\(([^)]*)\)|;\s*(.*)").Select(m => (m.Groups[1].Success ? m.Groups[1].Value : m.Groups[2].Value).Trim()).Where(s => s.Length > 0).ToList();
            if (string.IsNullOrWhiteSpace(visible[i])) { if (comments.Count > 0) preceding = comments; continue; }
            bool dynamic = Regex.IsMatch(visible[i], @"T\s*[#\[]", RegexOptions.IgnoreCase);
            if (dynamic) { pending = null; result.Notes.Add(new(line, "Richiamo T parametrico: verificare il valore sul controllo.")); }
            foreach (var word in words.Where(w => w.Letter == "T"))
            {
                if (word.Value < 0 || word.Value != Math.Truncate(word.Value) || word.Value > int.MaxValue) { pending = null; result.Notes.Add(new(line, "Richiamo T non riconosciuto.")); continue; }
                int value = (int)word.Value; string digits = word.Raw.TrimStart('+'); if (value == 0) { pending = null; continue; }
                bool latheOffset = machine == "lathe" && digits.Length is >= 3 and <= 4; int number = latheOffset ? value / 100 : value; if (number == 0) { pending = null; continue; }
                var entry = result.Tools.FirstOrDefault(t => t.Number == number);
                if (entry is null) { entry = new() { Number = number, FirstLine = line }; result.Tools.Add(entry); }
                void Append(List<string> list, string text) { if (!list.Contains(text)) list.Add(text); }
                Append(entry.Codes, "T" + digits); foreach (string c in comments.Count > 0 ? comments : preceding) Append(entry.Descriptions, c);
                pending = entry;
                if (machine == "lathe")
                {
                    active = entry; entry.Changes++; if (latheOffset) Append(entry.Offsets, "Offset " + (value % 100).ToString("00"));
                    else if (digits.Length > 4) result.Notes.Add(new(line, "Formato T oltre quattro cifre: verificare numero e correttore sul controllo."));
                }
            }
            if (dynamic) pending = null;
            if (machine == "mill" && ms.Contains(6)) { active = pending; if (active is not null) { active.Changes++; foreach (string c in comments) if (!active.Descriptions.Contains(c)) active.Descriptions.Add(c); } else if (!dynamic) result.Notes.Add(new(line, "M6 senza utensile T numerico identificabile.")); }
            if (machine == "mill" && active is not null && !ms.Any(m => m is 98 or 99))
                foreach (var h in words.Where(w => w.Letter == "H" && w.Value >= 0 && w.Value == Math.Truncate(w.Value))) { string offset = "H" + h.Value; if (!active.Offsets.Contains(offset)) active.Offsets.Add(offset); }
            if (!externalNoted && ms.Contains(98)) { result.Notes.Add(new(line, "Verificare separatamente gli utensili nei sottoprogrammi M98.")); externalNoted = true; }
            preceding = [];
        }
        return result;
    }
    static readonly Lazy<Dictionary<string, Dictionary<string, CodeHelp>>> Help = new(() => Storage.Resource<Dictionary<string, Dictionary<string, CodeHelp>>>("codes"));
    public static CodeHelp CodeInfo(string code, string machine)
    {
        string key = Regex.Replace(code.ToUpperInvariant(), @"^([GM])0+(?=\d)", "$1");
        return Help.Value[machine].GetValueOrDefault(key) ?? new(key, "Codice specifico del controllo", "Consultare il manuale della macchina.");
    }
}
