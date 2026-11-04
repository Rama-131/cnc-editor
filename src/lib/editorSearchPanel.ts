import { EditorView, runScopeHandlers, type Panel } from "@codemirror/view";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  selectMatches,
  setSearchQuery,
} from "@codemirror/search";

type Icon = "up" | "down" | "close" | "select" | "replace";
const iconPaths: Record<Icon, string> = {
  up: "m18 15-6-6-6 6",
  down: "m6 9 6 6 6-6",
  close: "M18 6 6 18M6 6l12 12",
  select: "m3 7 2 2 4-4m-6 12 2 2 4-4M13 6h8M13 12h8M13 18h8",
  replace: "M4 7h14m-4-4 4 4-4 4M20 17H6m4-4-4 4 4 4",
};
function icon(name: Icon) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({
    viewBox: "0 0 24 24",
    width: "16",
    height: "16",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.8",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  }))
    svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", iconPaths[name]);
  svg.append(path);
  return svg;
}
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function createEditorSearchPanel(view: EditorView): Panel {
  const dom = element("div", "cm-search editor-search-panel");
  dom.setAttribute("role", "group");
  dom.setAttribute("aria-label", "Ricerca e sostituzione nel file attivo");
  const searchField = field(
    "Trova",
    "Trova testo",
    "search",
    "Testo da cercare",
    "search-field",
  );
  const replaceField = field(
    "Sostituisci",
    "Sostituisci con",
    "replace",
    "Testo sostitutivo",
    "replace-field",
  );
  searchField.input.setAttribute("main-field", "true");
  const navigation = element("div", "search-actions search-navigation");
  const replacements = element("div", "search-actions search-replacements");
  const options = element("div", "search-options");
  const caseField = option("Maiuscole/minuscole", "case");
  const wordField = option("Parola intera", "word");
  const regexField = option("Espressione regolare", "re");
  const count = element("span", "search-count");
  count.setAttribute("role", "status");
  const previous = button(
    "prev",
    "Precedente",
    "up",
    () => findPrevious(view),
    true,
  );
  previous.title = "Trova precedente (Maiusc+F3)";
  const next = button("next", "Successivo", "down", () => findNext(view), true);
  next.title = "Trova prossimo (F3)";
  const select = button("select", "Seleziona tutti", "select", () =>
    selectMatches(view),
  );
  const replace = button("replace", "Sostituisci", "replace", () =>
    replaceNext(view),
  );
  replace.classList.add("replace-primary");
  const all = button("replaceAll", "Sostituisci tutto", "replace", () =>
    replaceAll(view),
  );
  const close = button(
    "close",
    "Chiudi ricerca",
    "close",
    () => closeSearchPanel(view),
    true,
  );
  close.classList.add("search-close");
  navigation.append(previous, next, select);
  replacements.append(replace, all);
  options.append(caseField.label, wordField.label, regexField.label, count);
  dom.append(searchField.label, navigation, close);
  if (!view.state.readOnly) dom.append(replaceField.label, replacements);
  else dom.classList.add("search-readonly");
  dom.append(options);
  let query = getSearchQuery(view.state);
  sync(true);

  function field(
    labelText: string,
    accessibleName: string,
    name: string,
    placeholder: string,
    className: string,
  ) {
    const label = element("label", `search-field-label ${className}`);
    const caption = element("span", "search-caption", labelText);
    const input = element("input", "cm-textfield");
    input.type = "text";
    input.name = name;
    input.placeholder = placeholder;
    input.setAttribute("aria-label", accessibleName);
    input.setAttribute("form", "");
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.addEventListener("input", commit);
    const shell = element("span", "search-input-shell");
    shell.append(input);
    label.append(caption, shell);
    return { label, input };
  }
  function option(text: string, name: string) {
    const label = element("label", "search-option");
    const input = element("input", "");
    input.type = "checkbox";
    input.name = name;
    input.setAttribute("form", "");
    input.addEventListener("change", commit);
    label.append(input, document.createTextNode(text));
    return { label, input };
  }
  function button(
    name: string,
    text: string,
    glyph: Icon,
    action: () => boolean,
    iconOnly = false,
  ) {
    const button = element(
      "button",
      `cm-button${iconOnly ? " search-icon-button" : ""}`,
    );
    button.type = "button";
    button.name = name;
    button.title = text;
    button.setAttribute("aria-label", text);
    button.append(icon(glyph));
    if (!iconOnly) button.append(element("span", "", text));
    button.addEventListener("click", () => {
      commit();
      action();
    });
    return button;
  }
  function commit() {
    const next = new SearchQuery({
      search: searchField.input.value,
      replace: replaceField.input.value,
      caseSensitive: caseField.input.checked,
      wholeWord: wordField.input.checked,
      regexp: regexField.input.checked,
      literal: !regexField.input.checked,
    });
    if (!next.eq(getSearchQuery(view.state)))
      view.dispatch({ effects: setSearchQuery.of(next) });
  }
  function sync(docChanged = false) {
    const nextQuery = getSearchQuery(view.state);
    if (!docChanged && query.eq(nextQuery)) return;
    query = nextQuery;
    if (searchField.input.value !== query.search)
      searchField.input.value = query.search;
    if (replaceField.input.value !== query.replace)
      replaceField.input.value = query.replace;
    caseField.input.checked = query.caseSensitive;
    wordField.input.checked = query.wholeWord;
    regexField.input.checked = query.regexp;
    let total = 0;
    if (query.valid) {
      const cursor = query.getCursor(view.state);
      while (!cursor.next().done && total <= 1000) total++;
    }
    searchField.input.setAttribute(
      "aria-invalid",
      String(!!query.search && !query.valid),
    );
    count.textContent = !query.search
      ? "Nel file attivo"
      : !query.valid
        ? "Espressione non valida"
        : total > 1000
          ? "Oltre 1.000 risultati"
          : total === 0
            ? "Nessun risultato"
            : `${total} ${total === 1 ? "risultato" : "risultati"}`;
    count.classList.toggle(
      "no-results",
      !!query.search && (!query.valid || !total),
    );
    for (const button of [previous, next, select, replace, all])
      button.disabled = !total || !query.valid;
    select.disabled ||= total > 1000;
    select.title =
      total > 1000
        ? "Restringi la ricerca per selezionare tutti i risultati insieme"
        : "Seleziona tutti i risultati";
  }
  dom.addEventListener("keydown", (event) => {
    if (runScopeHandlers(view, event, "search-panel")) event.preventDefault();
    else if (
      event.key === "Enter" &&
      (event.target === searchField.input ||
        event.target === replaceField.input)
    ) {
      event.preventDefault();
      commit();
      if (event.target === searchField.input)
        (event.shiftKey ? findPrevious : findNext)(view);
      else replaceNext(view);
    }
  });
  return {
    dom,
    top: true,
    mount() {
      searchField.input.focus();
      searchField.input.select();
    },
    update(update) {
      sync(update.docChanged);
    },
  };
}
