using System.Windows.Controls;
using System.Windows.Input;
using ICSharpCode.AvalonEdit;

namespace RamaEdit.Windows;

internal static class EditorContextMenu
{
    internal static ContextMenu Create(TextEditor editor)
    {
        var menu = new ContextMenu { FontFamily = new("Segoe UI"), FontSize = 14 };
        Add("Seleziona tutto", ApplicationCommands.SelectAll, "Ctrl+A");
        Add("Copia", ApplicationCommands.Copy, "Ctrl+C");
        Add("Incolla", ApplicationCommands.Paste, "Ctrl+V");
        return menu;

        void Add(string label, RoutedUICommand command, string shortcut)
        {
            // The popup has its own focus scope: route to AvalonEdit explicitly.
            // Its command bindings preserve the selection and enforce read-only/undo.
            menu.Items.Add(new MenuItem
            {
                Header = label, Command = command, CommandTarget = editor.TextArea,
                InputGestureText = shortcut
            });
        }
    }
}
