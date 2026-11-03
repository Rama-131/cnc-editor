import { RangeSet, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutterLineClass,
} from "@codemirror/view";

export const setSimulationLine = StateEffect.define<number | null>();

class SimulationMarker extends GutterMarker {
  elementClass = "cm-simulationLineGutter";
}
const marker = new SimulationMarker();

// Playback is separate from the editing cursor and never creates an undo entry.
export const simulationLineField = StateField.define<number | null>({
  create: () => null,
  update(current, transaction) {
    let line = transaction.docChanged ? null : current;
    for (const effect of transaction.effects) {
      if (effect.is(setSimulationLine)) line = effect.value;
    }
    return line !== null && line >= 1 && line <= transaction.state.doc.lines
      ? line
      : null;
  },
  provide: (field) => [
    EditorView.decorations.compute([field], (state) => {
      const line = state.field(field);
      return line === null
        ? Decoration.none
        : Decoration.set([
            Decoration.line({
              class: "cm-simulationLine",
              attributes: { "data-simulation-line": String(line) },
            }).range(state.doc.line(line).from),
          ]);
    }),
    gutterLineClass.compute([field], (state) => {
      const line = state.field(field);
      return line === null
        ? RangeSet.empty
        : RangeSet.of(marker.range(state.doc.line(line).from));
    }),
  ],
});

export function followSimulationLine(view: EditorView) {
  view.requestMeasure({
    key: simulationLineField,
    read(view) {
      const line = view.state.field(simulationLineField);
      if (line === null) return null;
      const block = view.lineBlockAt(view.state.doc.line(line).from);
      return {
        top: block.top + view.documentPadding.top,
        bottom: block.bottom + view.documentPadding.top,
        height: view.scrollDOM.clientHeight,
        scrollTop: view.scrollDOM.scrollTop,
        margin: view.defaultLineHeight,
      };
    },
    write(measurement, view) {
      if (
        measurement &&
        (measurement.top < measurement.scrollTop + measurement.margin ||
          measurement.bottom >
            measurement.scrollTop + measurement.height - measurement.margin)
      ) {
        // Scroll only the code pane, keeping the drawing and controls in place.
        view.scrollDOM.scrollTop = Math.max(
          0,
          (measurement.top + measurement.bottom - measurement.height) / 2,
        );
      }
    },
  });
}
