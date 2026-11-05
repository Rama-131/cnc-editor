import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import {
  EditorState,
  Compartment,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  hoverTooltip,
  placeholder,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  isolateHistory,
  undo as undoCommand,
  redo as redoCommand,
  undoDepth,
  redoDepth,
} from "@codemirror/commands";
import {
  StreamLanguage,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  search,
  searchKeymap,
  openSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  closeSearchPanel,
  searchPanelOpen,
} from "@codemirror/search";
import { codeInfo, type Machine } from "../lib/codes";
import { gcodeSpacingChanges } from "../lib/gcodeSpacing";
import { createEditorSearchPanel } from "../lib/editorSearchPanel";
import {
  adjustmentChanges,
  adjacentToolChange,
  toolChangePositions,
  type AdjustmentWord,
  type TextRange,
} from "../lib/programTools";
import {
  followSimulationLine,
  setSimulationLine,
  simulationLineField,
} from "../lib/editorSimulation";
import {
  defaultPalette,
  movementBlock,
  type Palette,
} from "../lib/editorAppearance";
export { defaultPalette };
export type { Palette };
export type EditorHistory = { canUndo: boolean; canRedo: boolean };
export type EditorSearchMode = "find" | "replace";
const setEditorSearchMode = StateEffect.define<EditorSearchMode>();
const editorSearchMode = StateField.define<EditorSearchMode>({
  create: () => "find",
  update(value, transaction) {
    for (const effect of transaction.effects)
      if (effect.is(setEditorSearchMode)) value = effect.value;
    return value;
  },
});
function openEditorSearch(view: EditorView, mode: EditorSearchMode) {
  view.dispatch({ effects: setEditorSearchMode.of(mode) });
  openSearchPanel(view);
  if (mode === "replace")
    view.dom.querySelector<HTMLInputElement>('input[name="replace"]')?.focus();
  return true;
}
function findEditorText(view: EditorView, direction: -1 | 1) {
  if (!getSearchQuery(view.state).valid) return openEditorSearch(view, "find");
  return direction === 1 ? findNext(view) : findPrevious(view);
}
export type EditorHandle = {
  focus: () => void;
  insertSpaces: () => void;
  undo: () => void;
  redo: () => void;
  toggleSearch: (replace?: boolean) => void;
  closeSearch: () => void;
  find: (direction: -1 | 1) => boolean;
  goToTool: (direction: -1 | 1) => boolean;
  selection: () => TextRange | undefined;
  adjust: (word: AdjustmentWord, value: string, range?: TextRange) => number;
};
function makeLanguage(blockColors: boolean) {
  return StreamLanguage.define({
    startState: () => ({ commentDepth: 0, movement: false }),
    token(stream, state) {
      if (stream.sol())
        state.movement = movementBlock(stream.string, state.commentDepth);
      if (state.commentDepth || stream.peek() === "(") {
        if (!state.commentDepth) {
          stream.next();
          state.commentDepth = 1;
        }
        while (!stream.eol() && state.commentDepth) {
          const c = stream.next();
          if (c === "(") state.commentDepth++;
          if (c === ")") state.commentDepth--;
        }
        return "comment";
      }
      if (stream.eatSpace()) return null;
      if (stream.eat(";")) {
        stream.skipToEnd();
        return "comment";
      }
      let type: string | null = null;
      if (stream.match(/[Gg]\s*\d+(?:\.\d+)?/)) type = "keyword";
      else if (stream.match(/[Mm]\s*\d+/)) type = "atom";
      else if (stream.match(/[XxYyZzIiJjKkUuVvWwRr]/)) type = "variableName";
      else if (stream.match(/[TtHhDd]\s*\d+/)) type = "typeName";
      else if (stream.match(/[+-]?(?:\d+\.?\d*|\.\d+)/)) type = "number";
      else stream.next();
      return blockColors ? (state.movement ? "keyword" : "atom") : type;
    },
  });
}
const blockLanguage = makeLanguage(true),
  tokenLanguage = makeLanguage(false);
function colors(p: Palette) {
  const blocks = p.mode === "blocks";
  const background = blocks ? "#262824" : "#12161c";
  return [
    blocks ? blockLanguage : tokenLanguage,
    syntaxHighlighting(
      HighlightStyle.define([
        { tag: tags.keyword, color: blocks ? p.motion : p.g },
        { tag: tags.atom, color: blocks ? p.auxiliary : p.m },
        { tag: tags.variableName, color: p.axis },
        { tag: tags.number, color: p.value },
        { tag: tags.comment, color: p.comment },
        { tag: tags.typeName, color: p.tool },
      ]),
    ),
    EditorView.theme({
      "&": {
        backgroundColor: background,
        color: blocks ? p.auxiliary : "#d7dee7",
      },
      ".cm-gutters": { backgroundColor: background, color: p.lineNumber },
      ".cm-lineNumbers .cm-gutterElement": { fontStyle: "italic" },
      ".cm-activeLine": { backgroundColor: blocks ? "#ffffff08" : "#20293466" },
      ".cm-activeLineGutter": { color: p.lineNumber },
    }),
  ];
}
export function Editor({
  ref,
  documentId = "default",
  openDocumentIds,
  onHistoryChange,
  onSearchChange,
  value,
  onChange,
  onCursor,
  machine,
  palette,
  simulationLine,
  followSimulation,
  readOnly = false,
  ariaLabel = "Editor programma G-code",
  emptyHint = "",
  followEnd = false,
}: {
  ref?: Ref<EditorHandle>;
  documentId?: string;
  openDocumentIds?: string[];
  onHistoryChange?: (history: EditorHistory) => void;
  onSearchChange?: (mode: EditorSearchMode | null) => void;
  value: string;
  onChange: (v: string) => void;
  onCursor: (line: number, col: number) => void;
  machine: Machine;
  palette: Palette;
  simulationLine: number | null;
  followSimulation: boolean;
  readOnly?: boolean;
  ariaLabel?: string;
  emptyHint?: string;
  followEnd?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    colorConfig = useRef(new Compartment()),
    tooltipConfig = useRef(new Compartment());
  const changeRef = useRef(onChange),
    cursorRef = useRef(onCursor);
  const historyRef = useRef(onHistoryChange);
  const searchRef = useRef(onSearchChange);
  const reportedSearch = useRef<EditorSearchMode | null | undefined>(undefined);
  const currentId = useRef(documentId);
  const requestedId = useRef(documentId);
  const documents = useRef(
    new Map<string, { state: EditorState; top: number; left: number }>(),
  );
  requestedId.current = documentId;
  historyRef.current = onHistoryChange;
  searchRef.current = onSearchChange;
  changeRef.current = onChange;
  cursorRef.current = onCursor;
  function reportSearchState(state: EditorState) {
    const mode = searchPanelOpen(state) ? state.field(editorSearchMode) : null;
    if (mode !== reportedSearch.current) {
      reportedSearch.current = mode;
      searchRef.current?.(mode);
    }
  }
  function reportState(state: EditorState) {
    const position = state.selection.main.head;
    const line = state.doc.lineAt(position);
    cursorRef.current(line.number, position - line.from + 1);
    historyRef.current?.({
      canUndo: undoDepth(state) > 0,
      canRedo: redoDepth(state) > 0,
    });
    reportSearchState(state);
  }
  useImperativeHandle(
    ref,
    () => ({
      focus() {
        view.current?.focus();
      },
      undo() {
        const v = view.current;
        if (!v || v.state.readOnly) return;
        undoCommand(v);
        v.focus();
      },
      redo() {
        const v = view.current;
        if (!v || v.state.readOnly) return;
        redoCommand(v);
        v.focus();
      },
      insertSpaces() {
        const v = view.current;
        if (!v || v.state.readOnly) return;
        const changes = gcodeSpacingChanges(v.state.doc.toString());
        if (changes.length)
          v.dispatch({
            changes,
            annotations: isolateHistory.of("full"),
            userEvent: "input.format",
          });
        v.focus();
      },
      toggleSearch(replace = false) {
        const v = view.current;
        if (!v) return;
        const mode = replace ? "replace" : "find";
        if (
          searchPanelOpen(v.state) &&
          v.state.field(editorSearchMode) === mode
        ) {
          closeSearchPanel(v);
          v.focus();
        } else openEditorSearch(v, mode);
      },
      closeSearch() {
        if (view.current) closeSearchPanel(view.current);
      },
      find(direction) {
        const v = view.current;
        if (!v) return false;
        if (!getSearchQuery(v.state).valid) return openEditorSearch(v, "find");
        const found = findEditorText(v, direction);
        if (found) v.focus();
        return found;
      },
      goToTool(direction) {
        const v = view.current;
        if (!v) return false;
        const line = v.state.doc.lineAt(v.state.selection.main.head);
        const position = adjacentToolChange(
          toolChangePositions(v.state.doc.toString(), machine),
          direction === 1 ? line.to : line.from,
          direction,
        );
        if (position === null) return false;
        v.dispatch({
          selection: { anchor: position },
          effects: EditorView.scrollIntoView(position, { y: "center" }),
          userEvent: "select.tool",
        });
        v.focus();
        return true;
      },
      selection() {
        const selection = view.current?.state.selection.main;
        return selection && !selection.empty
          ? { from: selection.from, to: selection.to }
          : undefined;
      },
      adjust(word, value, range) {
        const v = view.current;
        if (!v || v.state.readOnly) return 0;
        const { changes } = adjustmentChanges(
          v.state.doc.toString(),
          word,
          value,
          range,
        );
        if (changes.length)
          v.dispatch({
            changes,
            annotations: isolateHistory.of("full"),
            userEvent: "input.adjust",
          });
        v.focus();
        return changes.length;
      },
    }),
    [machine],
  );
  function tooltip(m: Machine) {
    return hoverTooltip(
      (v, pos) => {
        const line = v.state.doc.lineAt(pos);
        const offset = pos - line.from;
        const clean = line.text.slice(0, offset);
        if (
          clean.lastIndexOf("(") > clean.lastIndexOf(")") ||
          clean.includes(";")
        )
          return null;
        for (const match of line.text.matchAll(/[GM]\s*\d+(?:\.\d+)?/gi)) {
          const start = match.index!,
            end = start + match[0].length;
          if (offset >= start && offset <= end) {
            const info = codeInfo(match[0].replace(/\s/g, ""), m);
            return {
              pos: line.from + start,
              end: line.from + end,
              above: true,
              create() {
                const dom = document.createElement("div");
                dom.className = "code-tooltip";
                const heading = document.createElement("strong");
                heading.textContent = `${info.code} · ${info.title}`;
                const body = document.createElement("p");
                body.textContent = info.description;
                dom.append(heading, body);
                return { dom };
              },
            };
          }
        }
        return null;
      },
      { hoverTime: 250 },
    );
  }
  function createState(doc: string) {
    return EditorState.create({
      doc,
      extensions: [
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        placeholder(emptyHint),
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        simulationLineField,
        editorSearchMode,
        search({
          top: true,
          literal: true,
          createPanel: createEditorSearchPanel,
        }),
        EditorState.phrases.of({
          Find: "Trova testo",
          Replace: "Sostituisci con",
          next: "Successivo",
          previous: "Precedente",
          all: "Seleziona tutti",
          "match case": "Maiuscole/minuscole",
          regexp: "Espressione regolare",
          "by word": "Parola intera",
          replace: "Sostituisci",
          "replace all": "Sostituisci tutto",
          close: "Chiudi ricerca",
          "current match": "Corrispondenza corrente",
          "on line": "alla riga",
          "replaced match on line $": "Sostituita corrispondenza alla riga $",
          "replaced $ matches": "Sostituite $ corrispondenze",
        }),
        keymap.of([
          {
            key: "Mod-f",
            run: (v) => openEditorSearch(v, "find"),
            scope: "editor search-panel",
          },
          {
            key: "Mod-h",
            run: (v) => {
              if (v.state.readOnly) return false;
              return openEditorSearch(v, "replace");
            },
            scope: "editor search-panel",
          },
          {
            key: "F3",
            run: (v) => findEditorText(v, 1),
            shift: (v) => findEditorText(v, -1),
            scope: "editor search-panel",
            preventDefault: true,
          },
          {
            key: "Mod-g",
            run: (v) => findEditorText(v, 1),
            shift: (v) => findEditorText(v, -1),
            scope: "editor search-panel",
            preventDefault: true,
          },
          ...searchKeymap,
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        colorConfig.current.of(colors(palette)),
        tooltipConfig.current.of(tooltip(machine)),
        EditorView.contentAttributes.of({
          "aria-label": ariaLabel,
          "aria-readonly": String(readOnly),
          spellcheck: "false",
        }),
        EditorView.theme(
          {
            "&": {
              height: "100%",
              fontSize: "15px",
            },
            ".cm-scroller": {
              fontFamily:
                '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
              lineHeight: "1.75",
            },
            ".cm-content": { padding: "10px 0" },
            ".cm-gutters": {
              border: "none",
              minWidth: "55px",
            },
            ".cm-lineNumbers .cm-gutterElement": { paddingRight: "18px" },
            ".cm-activeLineGutter": {
              backgroundColor: "transparent",
            },
            ".cm-line.cm-simulationLine": {
              backgroundColor: "#254b3a99",
              boxShadow: "inset 3px 0 #8ee5b8",
            },
            ".cm-gutterElement.cm-simulationLineGutter": {
              backgroundColor: "#254b3a99",
              color: "#aaf3cb",
              fontWeight: "700",
            },
            ".cm-cursor": { borderLeftColor: "#7ae5b4" },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
              backgroundColor: "#344d6266",
            },
            ".cm-tooltip": {
              backgroundColor: "#232c37",
              border: "1px solid #3e4b5c",
              color: "#e2e8f0",
            },
          },
          { dark: true },
        ),
        EditorView.updateListener.of((u) => {
          if (currentId.current !== requestedId.current) return;
          reportSearchState(u.state);
          if (u.docChanged) changeRef.current(u.state.doc.toString());
          if (u.selectionSet || u.docChanged) {
            const p = u.state.selection.main.head,
              l = u.state.doc.lineAt(p);
            cursorRef.current(l.number, p - l.from + 1);
          }
          historyRef.current?.({
            canUndo: undoDepth(u.state) > 0,
            canRedo: redoDepth(u.state) > 0,
          });
        }),
      ],
    });
  }
  useEffect(() => {
    if (!root.current) return;
    view.current = new EditorView({
      parent: root.current,
      state: createState(value),
    });
    reportState(view.current.state);
    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    if (currentId.current !== documentId) {
      documents.current.set(currentId.current, {
        state: v.state,
        top: v.scrollDOM.scrollTop,
        left: v.scrollDOM.scrollLeft,
      });
      const cached = documents.current.get(documentId);
      currentId.current = documentId;
      v.setState(cached?.state ?? createState(value));
      v.dispatch({
        effects: [
          colorConfig.current.reconfigure(colors(palette)),
          tooltipConfig.current.reconfigure(tooltip(machine)),
          setSimulationLine.of(null),
        ],
      });
      reportState(v.state);
      v.requestMeasure({
        read: () => cached,
        write: (saved) => {
          if (currentId.current !== documentId) return;
          v.scrollDOM.scrollTop = saved?.top ?? 0;
          v.scrollDOM.scrollLeft = saved?.left ?? 0;
        },
      });
    }
    const current = v.state.doc.toString();
    if (current !== value)
      v.dispatch({
        changes:
          readOnly && value.startsWith(current)
            ? { from: v.state.doc.length, insert: value.slice(current.length) }
            : { from: 0, to: v.state.doc.length, insert: value },
      });
  }, [documentId, value, readOnly]);
  useEffect(() => {
    if (!openDocumentIds) return;
    const open = new Set(openDocumentIds);
    for (const id of documents.current.keys())
      if (!open.has(id)) documents.current.delete(id);
  }, [openDocumentIds]);
  useEffect(() => {
    const v = view.current;
    if (v && followEnd)
      v.requestMeasure({
        key: "receive-follow-end",
        read: (view) => view.scrollDOM.scrollHeight,
        write: (height, view) => {
          view.scrollDOM.scrollTop = height;
        },
      });
  }, [value, followEnd]);
  useEffect(() => {
    view.current?.dispatch({
      effects: colorConfig.current.reconfigure(colors(palette)),
    });
  }, [palette]);
  useEffect(() => {
    view.current?.dispatch({
      effects: tooltipConfig.current.reconfigure(tooltip(machine)),
    });
  }, [machine]);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ effects: setSimulationLine.of(simulationLine) });
    if (followSimulation && simulationLine !== null) followSimulationLine(v);
  }, [simulationLine, followSimulation, value, documentId]);
  return <div className="editor-mount" ref={root} />;
}
