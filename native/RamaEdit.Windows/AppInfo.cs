namespace RamaEdit.Windows;

internal static class AppInfo
{
    internal static string Version { get; } = typeof(App).Assembly.GetName().Version?.ToString(3) ?? "n/d";
    internal static string DisplayName => "Rama Edit " + Version;
}
