export function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const programExtensions = new Set([
  "nc",
  "cnc",
  "tap",
  "txt",
  "iso",
  "mpf",
  "gcode",
]);
export function fileExtension(name: string) {
  return /\.([a-z\d]{1,10})$/i.exec(name.trim())?.[1].toLowerCase() ?? "";
}
export function saveAsFilename(
  input: string,
  extension: string,
  originalExtension = "",
) {
  const name = input.trim();
  if (!name) return "";
  const current = fileExtension(name);
  if (current === extension.toLowerCase()) return name;
  if (
    current &&
    (programExtensions.has(current) ||
      current === originalExtension.toLowerCase())
  )
    return name.slice(0, name.lastIndexOf(".")) + "." + extension;
  return name + "." + extension;
}
export function fileNameError(name: string): string | null {
  if (!name.trim() || !name.replace(/\.[^.]*$/, "").replace(/[. ]/g, ""))
    return "Inserisci un nome per il file.";
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(name))
    return 'Il nome non può contenere \\ / : * ? " < > |.';
  if (/[. ]$/.test(name))
    return "Il nome non può terminare con un punto o uno spazio.";
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    return "Questo nome è riservato da Windows. Scegli un altro nome.";
  if (name.length > 255)
    return "Il nome del file è troppo lungo (massimo 255 caratteri).";
  return null;
}
