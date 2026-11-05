// Rebuild the native app's reference data and parity fixtures from the web version.
import { writeFileSync } from "node:fs";
import { importedMachines } from "../src/lib/importedMachineProfiles";
import { codeInfo } from "../src/lib/codes";
import { millSample, latheSample } from "../src/lib/samples";
import { simulate } from "../src/lib/simulator";
import { fanucG71Program, fanucG70Program } from "../tests/fixtures/fanucG71";
const save = (path: string, value: unknown) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
save("native/RamaEdit.Core/Data/machines.json", importedMachines);
save("native/RamaEdit.Core/Data/samples.json", {
  mill: millSample,
  lathe: latheSample,
  fanuc: fanucG70Program,
});
save(
  "native/RamaEdit.Core/Data/codes.json",
  Object.fromEntries(
    ["mill", "lathe"].map((machine) => [
      machine,
      Object.fromEntries(
        ["G", "M"].flatMap((letter) =>
          Array.from({ length: 200 }, (_, i) => {
            const code = letter + i;
            return [code, codeInfo(code, machine as "mill" | "lathe")];
          }),
        ),
      ),
    ]),
  ),
);
const sources: [string, "mill" | "lathe", boolean?][] = [
  [millSample, "mill"],
  [latheSample, "lathe"],
  [fanucG71Program, "lathe"],
  [fanucG70Program, "lathe"],
  ["G21 G90\nG1 X10 Y5\nG91\nX2\nG20\nY1", "mill"],
  ["G0 X40 Z10\nG1 U-10 W-5", "lathe"],
  ["G1 X40", "lathe", false],
  ["G0 X10\nG3 X10 Y0 I-10 J0 Z5", "mill"],
  ...[17, 18, 19].map(
    (g) =>
      [
        g === 17
          ? "G17 G0 X10 Y0\nG3 X0 Y10 I-10 J0"
          : g === 18
            ? "G18 G0 Z10 X0\nG3 Z0 X10 K-10 I0"
            : "G19 G0 Y10 Z0\nG3 Y0 Z10 J-10 K0",
        "mill",
      ] as [string, "mill"],
  ),
  ["G0 X10\nG3 X0 Y10 R10", "mill"],
  ["G0 X10\nG3 X0 Y10 R-10", "mill"],
  ["G54\nG1 X10\nG55\nG1 X20\nG56\nM30", "mill"],
  ["G0 X40 Z10\nG10 P0 U2 W-5\nG1 U-10 W-5\nM26\nG92 S1200", "lathe"],
  ...[
    "G2 X100 R1",
    "G2 X10 I1",
    "G1 X1\n#1=3\nX99",
    "G1 X1\nM98 P2\nX99",
    "G1 X1\nG41\nX99",
    "G1 X1\nG80\nX3",
    "G54 G55 X10",
  ].map((s) => [s, "mill"] as [string, "mill"]),
  ["G90 X10 Z-5", "lathe"],
  ["G71 U2 R.5", "lathe"],
  ["G70 P1 Q2", "lathe"],
];
save(
  "native/RamaEdit.Core.Tests/Fixtures/parity.json",
  sources.map(([source, machine, diameter = true]) => ({
    source,
    machine,
    diameter,
    expected: simulate(source, machine, diameter),
  })),
);
