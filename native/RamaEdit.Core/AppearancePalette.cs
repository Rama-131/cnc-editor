using System.Text.RegularExpressions;

namespace RamaEdit.Core;

public static class AppearancePalette
{
    public const string StyleKey = "_style";
    public static Dictionary<string, string> Defaults() => new()
    {
        ["g"] = "#4FA9FF", ["m"] = "#FF6BE8", ["axis"] = "#42E8FF",
        ["value"] = "#FFE55B", ["tool"] = "#FF9E45", ["comment"] = "#7DFF6A",
        ["rapid"] = "#6EB5FF", ["cut"] = "#64E5B4"
    };
    public static bool ValidColor(string? value) => value is not null && Regex.IsMatch(value, "^#[a-fA-F0-9]{6}$");
    public static Dictionary<string, string> Restore(IReadOnlyDictionary<string, string>? saved)
    {
        var palette = Defaults();
        if (saved is not null)
            foreach (var key in palette.Keys.ToArray())
                if (saved.TryGetValue(key, out var color) && ValidColor(color))
                    palette[key] = color.ToUpperInvariant();
        return palette;
    }
    public static bool MotionStyle(IReadOnlyDictionary<string, string>? saved) =>
        saved is null || !saved.TryGetValue(StyleKey, out var mode) || mode != "tokens";
}

public enum MotionColorKind { None, Rapid, Working }

public static class EditorMotion
{
    // Lexical highlighting, independent of simulation support. Only real numeric
    // G words change the modal color; comments, strings and assignments don't.
    public static MotionColorKind[] Classify(string source, string machine = "mill")
    {
        var lines = ProgramTools.VisibleCode(source).Split('\n');
        var result = new MotionColorKind[lines.Length];
        MotionColorKind modal = MotionColorKind.None;
        for (int i = 0; i < lines.Length; i++)
        {
            string text = lines[i];
            if (string.IsNullOrWhiteSpace(text) || text.TrimStart().StartsWith('#')) continue;
            var words = GCode.WordRegex().Matches(text);
            var gs = words.Where(w => w.Groups[1].Value.Equals("G", StringComparison.OrdinalIgnoreCase))
                .Select(w => GCode.Number(w.Groups[2].Value)).ToList();
            bool axes = Regex.IsMatch(text, @"[XYZUVW]\s*(?:[+-]?(?:\d|\.)|#|\[)", RegexOptions.IgnoreCase);
            if (gs.Contains(80)) modal = MotionColorKind.None;
            foreach (var g in gs)
                if (g == 0) modal = MotionColorKind.Rapid;
                else if (g is 1 or 2 or 3) modal = MotionColorKind.Working;
            if (gs.Any(g => g is 4 or 10 or 50 or 52)) continue;
            if (machine == "mill" && gs.Contains(92)) continue;
            if (gs.Any(g => g is 28 or 30))
            {
                result[i] = MotionColorKind.Rapid;
                continue;
            }
            bool cycle = gs.Any(g => g >= 70 && g <= 79 || g >= 81 && g <= 89 ||
                machine == "lathe" && axes && g is 90 or 92 or 94);
            if (cycle)
            {
                result[i] = MotionColorKind.Working;
                if (gs.Any(g => g >= 81 && g <= 89)) modal = MotionColorKind.Working;
            }
            else if (axes || gs.Any(g => g is 0 or 1 or 2 or 3))
                result[i] = modal;
        }
        return result;
    }
}
