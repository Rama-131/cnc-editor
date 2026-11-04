import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { EditorState, Compartment } from "@codemirror/state";
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
export type Palette = {
  g: string;
  m: string;
  axis: string;
  value: string;
  comment: string;
  tool: string;
};
export type EditorHistory = { canUndo: boolean; canRedo: boolean };
export type EditorHandle = {
  focus: () => void;
  insertSpaces: () => void;
  undo: () => void;
  redo: () => void;
  openSearch: (replace?: boolean) => void;
  find: (direction: -1 | 1) => boolean;
  goToTool: (direction: -1 | 1) => boolean;
  selection: () => TextRange | undefined;
  adjust: (word: AdjustmentWord, value: string, range?: TextRange) => number;
};
export const defaultPalette: Palette = {
  g: "#70b7ff",
  m: "#c99aff",
  axis: "#64dcb6",
  value: "#f3c978",
  comment: "#798593",
  tool: "#f0a57d",
};
const language = StreamLanguage.define({
  startState: () => ({ comment: false }),
  token(stream, state) {
    if (state.comment) {
      if (stream.skipTo(")")) {
        stream.next();
        state.comment = false;
      } else stream.skipToEnd();
      return "comment";
    }
    if (stream.eatSpace()) return null;
    if (stream.eat("(")) {
      state.comment = true;
      return "comment";
    }
    if (stream.eat(";")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match(/[Gg]\s*\d+(?:\.\d+)?/)) return "keyword";
    if (stream.match(/[Mm]\s*\d+/)) return "atom";
    if (stream.match(/[XxYyZzIiJjKkUuVvWwRr]/)) return "variableName";
    if (stream.match(/[TtHhDd]\s*\d+/)) return "typeName";
    if (stream.match(/[+-]?(?:\d+\.?\d*|\.\d+)/)) return "number";
    stream.next();
    return null;
  },
});
function colors(p: Palette) {
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.keyword, color: p.g },
      { tag: tags.atom, color: p.m },
      { tag: tags.variableName, color: p.axis },
      { tag: tags.number, color: p.value },
      { tag: tags.comment, color: p.comment },
      { tag: tags.typeName, color: p.tool },
    ]),
  );
}
export function Editor({
  ref,
  documentId = "default",
  openDocumentIds,
  onHistoryChange,
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
  const currentId = useRef(documentId);
  const requestedId = useRef(documentId);
  const documents = useRef(
    new Map<string, { state: EditorState; top: number; left: number }>(),
  );
  requestedId.current = documentId;
  historyRef.current = onHistoryChange;
  changeRef.current = onChange;
  cursorRef.current = onCursor;
  function reportState(state: EditorState) {
    const position = state.selection.main.head;
    const line = state.doc.lineAt(position);
    cursorRef.current(line.number, position - line.from + 1);
    historyRef.current?.({
      canUndo: undoDepth(state) > 0,
      canRedo: redoDepth(state) > 0,
    });
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
      openSearch(replace = false) {
        const v = view.current;
        if (!v) return;
        openSearchPanel(v);
        if (replace)
          v.dom
            .querySelector<HTMLInputElement>('input[name="replace"]')
            ?.focus();
      },
      find(direction) {
        const v = view.current;
        if (!v) return false;
        if (!getSearchQuery(v.state).valid) return openSearchPanel(v);
        const found = direction === 1 ? findNext(v) : findPrevious(v);
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
            key: "Mod-h",
            run: (v) => {
              if (v.state.readOnly) return false;
              openSearchPanel(v);
              v.dom
                .querySelector<HTMLInputElement>('input[name="replace"]')
                ?.focus();
              return true;
            },
          },
          ...searchKeymap,
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        language,
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
              fontSize: "13px",
              backgroundColor: "#12161c",
              color: "#d7dee7",
            },
            ".cm-scroller": {
              fontFamily:
                '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
              lineHeight: "1.9",
            },
            ".cm-content": { padding: "10px 0" },
            ".cm-gutters": {
              backgroundColor: "#12161c",
              color: "#586576",
              border: "none",
              minWidth: "55px",
            },
            ".cm-lineNumbers .cm-gutterElement": { paddingRight: "18px" },
            ".cm-activeLine": { backgroundColor: "#20293466" },
            ".cm-activeLineGutter": {
              backgroundColor: "transparent",
              color: "#cad6e3",
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
