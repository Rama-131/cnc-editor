namespace RamaEdit.Core;

public record FanucExample(string Name, string Text, string System = "A");

public static class FanucExamples
{
    public static IReadOnlyList<FanucExample> All { get; } =
    [
        new("fanuc_g71_archi.txt", """
            %
            O7100 (SGROSSATURA E FINITURA CON ARCO)
            G18 G21 G40 G99
            G50 S2500
            T0101
            G97 S1200 M3
            G0 X60 Z2
            G71 U2 R0.5
            G71 P100 Q150 U0.2 W0.1 F0.2
            N100 G0 X20
            N110 G1 Z0
            N120 G3 X30 Z-5 R5
            N130 G1 Z-20
            N140 X40
            N150 X50 Z-25
            T0202
            G70 P100 Q150
            G0 X80 Z10
            M30
            %
            """),
        new("fanuc_g72_frontale.txt", """
            %
            O7200 (SGROSSATURA FRONTALE)
            G18 G21 G40 G99
            G50 S2000
            T0101
            G97 S1000 M3
            G0 X80 Z2
            G72 W2 R0.5
            G72 P100 Q160 U0.5 W0.1 F0.2
            N100 G0 Z-30
            N110 G1 X60
            N120 Z-20
            N130 X40
            N140 Z-10
            N150 X20
            N160 Z0
            G0 X90 Z10
            M30
            %
            """),
        new("fanuc_g73_ripetizione.txt", """
            %
            O7300 (RIPETIZIONE PROFILO)
            G18 G21 G40 G99
            T0101
            G97 S1000 M3
            G0 X70 Z2
            G73 U2 W1 R3
            G73 P100 Q130 U0.2 W0.1 F0.2
            N100 G0 X40
            N110 G1 Z0
            N120 X50 Z-10
            N130 X60 Z-20
            M30
            %
            """),
        new("fanuc_g74_g75.txt", """
            %
            O7400 (FORATURA E SCANALATURA)
            G18 G21 G40 G99
            T0303
            G97 S800 M3
            G0 X0 Z2
            G74 R0.5
            G74 Z-20 Q3000 F0.1
            G0 X60 Z-5
            T0404
            G75 R0.5
            G75 X40 Z-11 P2000 Q3000 F0.1
            G0 X80 Z10
            M30
            %
            """),
        new("fanuc_g76_filetto.txt", """
            %
            O7600 (FILETTATURA MULTIPASSATA)
            G18 G21 G40 G99
            G50 S1200
            T0505
            G97 S600 M3
            G0 X24 Z3
            G76 P020060 Q100 R0.05
            G76 X18 Z-25 P1000 Q300 F1.5
            G0 X40 Z10
            M30
            %
            """),
        new("fanuc_g83_foratura.txt", """
            %
            O8300 (FORATURA PROFONDA)
            G18 G21 G40 G99
            T0303
            G97 S800 M3
            G0 X0 Z5
            (R INCREMENTALE: DA Z5 A Z2)
            G83 Z-25 R-3 Q5000 F0.1
            G80
            G0 X60 Z10
            M30
            %
            """),
        new("fanuc_iso_g90_g91.txt", """
            %
            O9000 (MODALITA ISO G90/G91)
            G18 G21 G40
            G90 G0 X60 Z2
            G95 F0.2
            G77 X50 Z-20 F0.2
            X40
            G0 X70 Z5
            G91 G1 X4 Z-2
            G90 G0 X80 Z10
            M30
            %
            """, "B")
    ];
}
