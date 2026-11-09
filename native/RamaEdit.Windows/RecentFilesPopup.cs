using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;

namespace RamaEdit.Windows;

internal sealed class RecentFilesPopup : Popup
{
    readonly ItemsControl rows = new();
    internal Border Frame { get; }
    internal ItemCollection Items => rows.Items;
    internal Button? Opener { get; set; }
    internal RecentFilesPopup()
    {
        StaysOpen = false; AllowsTransparency = true; Placement = PlacementMode.Bottom; PopupAnimation = PopupAnimation.None;
        Frame = new Border
        {
            MinWidth = 340, MaxWidth = 600, Padding = new(4), BorderThickness = new(1), CornerRadius = new(4), Focusable = true,
            Background = new SolidColorBrush(Color.FromRgb(26, 41, 53)), BorderBrush = new SolidColorBrush(Color.FromRgb(61, 80, 96)),
            Child = new ScrollViewer { Content = rows, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled }
        };
        Child = Frame;
        KeyboardNavigation.SetTabNavigation(Frame, KeyboardNavigationMode.Cycle);
        KeyboardNavigation.SetDirectionalNavigation(Frame, KeyboardNavigationMode.Cycle);
        Frame.PreviewKeyDown += (_, e) => { if (e.Key == Key.Escape) { IsOpen = false; Opener?.Focus(); e.Handled = true; } };
        Opened += (_, _) => Dispatcher.BeginInvoke(() => { if (IsOpen) { var first = rows.Items.OfType<Button>().FirstOrDefault(b => b.IsEnabled); if (first is not null) first.Focus(); else Frame.Focus(); } }, DispatcherPriority.Input);
    }
}
