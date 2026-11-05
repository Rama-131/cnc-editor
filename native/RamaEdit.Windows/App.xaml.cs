using System.IO;
using System.Windows;
using System.Windows.Threading;
namespace RamaEdit.Windows;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        DispatcherUnhandledException += (_, args) => { MessageBox.Show(args.Exception.Message, "Rama Edit", MessageBoxButton.OK, MessageBoxImage.Error); args.Handled = true; };
        if (e.Args.Contains("--smoke-test")) { _ = NativeSmoke.Run(this, e.Args); return; }
        var window = new MainWindow(); MainWindow = window; window.Show();
        foreach (var path in e.Args.Where(File.Exists)) window.OpenPath(path);
    }
}
