import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  hoverTooltip,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  StreamLanguage,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { codeInfo, type Machine } from "../lib/codes";
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
  value,
  onChange,
  onCursor,
  machine,
  palette,
  simulationLine,
  followSimulation,
}: {
  value: string;
  onChange: (v: string) => void;
  onCursor: (line: number, col: number) => void;
  machine: Machine;
  palette: Palette;
  simulationLine: number | null;
  followSimulation: boolean;
}) {
  const root = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    colorConfig = useRef(new Compartment()),
    tooltipConfig = useRef(new Compartment());
  const changeRef = useRef(onChange),
    cursorRef = useRef(onCursor);
  changeRef.current = onChange;
  cursorRef.current = onCursor;
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
  useEffect(() => {
    if (!root.current) return;
    view.current = new EditorView({
      parent: root.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          simulationLineField,
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
          language,
          colorConfig.current.of(colors(palette)),
          tooltipConfig.current.of(tooltip(machine)),
          EditorView.contentAttributes.of({
            "aria-label": "Editor programma G-code",
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
              ".cm-content": { padding: "20px 0" },
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
            if (u.docChanged) changeRef.current(u.state.doc.toString());
            if (u.selectionSet || u.docChanged) {
              const p = u.state.selection.main.head,
                l = u.state.doc.lineAt(p);
              cursorRef.current(l.number, p - l.from + 1);
            }
          }),
        ],
      }),
    });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value)
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: value },
      });
  }, [value]);
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
  }, [simulationLine, followSimulation, value]);
  return <div className="editor-mount" ref={root} />;
}
