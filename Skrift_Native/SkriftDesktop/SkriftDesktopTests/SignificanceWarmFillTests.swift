import XCTest

/// `SignificanceWarmFill` — the importance control's past-the-wall circle fill.
///
/// This exists because the rule was written out twice. Until 2026-08-12 both apps
/// hardcoded the same channel arithmetic in their own `SignificanceCircles.swift`
/// — the exact bug `Palette`'s header calls "fixed by construction", sitting
/// outside `Palette`. The un-twinning moved it here, and these tests pin the
/// result to the literal numbers the two copies produced, so the refactor is
/// provably a no-op on colour rather than an eyeball claim.
final class SignificanceWarmFillTests: XCTestCase {

    /// The dark mix, byte-for-byte as both apps computed it before the move.
    func testDarkMixMatchesTheTwoHardcodedCopies() {
        let expected = (r: 124 * 0.42 + 245 * 0.58,
                        g: 107 * 0.42 + 158 * 0.58,
                        b: 245 * 0.42 + 11 * 0.58)
        let got = SignificanceWarmFill.darkMix
        XCTAssertEqual(got.r, expected.r, accuracy: 1e-9)
        XCTAssertEqual(got.g, expected.g, accuracy: 1e-9)
        XCTAssertEqual(got.b, expected.b, accuracy: 1e-9)
    }

    /// Light is plain amber — the mix reads as dirty brown on white
    /// (device-found 2026-07-16), so there is deliberately no blend here.
    func testLightMixIsPlainAmber() {
        let got = SignificanceWarmFill.lightMix
        XCTAssertEqual(got.r, 217, accuracy: 1e-9)
        XCTAssertEqual(got.g, 119, accuracy: 1e-9)
        XCTAssertEqual(got.b, 6, accuracy: 1e-9)
    }

    /// The point of the move: the numbers come FROM `Palette`, so retuning accent
    /// or amber carries into the control instead of leaving it behind. If someone
    /// changes a Palette hex, the two tests above are supposed to fail — this one
    /// says why, by deriving the same answer straight from the table.
    func testMixIsDerivedFromPaletteRatherThanRestated() {
        func channels(_ hex: UInt32) -> (r: Double, g: Double, b: Double) {
            (Double((hex >> 16) & 0xff), Double((hex >> 8) & 0xff), Double(hex & 0xff))
        }
        let a = channels(Palette.accent.dark), m = channels(Palette.amber.dark)
        let w = SignificanceWarmFill.accentWeight
        let got = SignificanceWarmFill.darkMix
        XCTAssertEqual(got.r, a.r * w + m.r * (1 - w), accuracy: 1e-9)
        XCTAssertEqual(got.g, a.g * w + m.g * (1 - w), accuracy: 1e-9)
        XCTAssertEqual(got.b, a.b * w + m.b * (1 - w), accuracy: 1e-9)
        XCTAssertEqual(SignificanceWarmFill.lightMix.r, channels(Palette.amber.light).r, accuracy: 1e-9)
    }
}
