import XCTest
import Foundation

/// `Palette.speakerHue(slot:)` — a colour per voice for conversation turns, keyed by
/// DIARIZATION SLOT so a rename can never reshuffle a note's colours.
final class SpeakerHueTests: XCTestCase {

    func testSlotIsStableAndDistinct() {
        // The same slot always yields the same hue — the whole point of keying by slot.
        XCTAssertEqual(Palette.speakerHue(slot: 1).dark, Palette.speakerHue(slot: 1).dark)
        // Adjacent speakers differ, or a two-person conversation gains nothing.
        XCTAssertNotEqual(Palette.speakerHue(slot: 0).dark, Palette.speakerHue(slot: 1).dark)
        XCTAssertNotEqual(Palette.speakerHue(slot: 0).light, Palette.speakerHue(slot: 1).light)
    }

    func testEveryHueIsUniqueInBothSchemes() {
        XCTAssertEqual(Set(Palette.speakerHues.map(\.dark)).count, Palette.speakerHues.count)
        XCTAssertEqual(Set(Palette.speakerHues.map(\.light)).count, Palette.speakerHues.count)
    }

    /// Past the table it CYCLES — a 9-speaker recording repeats rather than crashing or
    /// collapsing every extra voice onto one colour.
    func testCyclesPastTheTable() {
        let n = Palette.speakerHues.count
        XCTAssertEqual(Palette.speakerHue(slot: n).dark, Palette.speakerHue(slot: 0).dark)
        XCTAssertEqual(Palette.speakerHue(slot: n + 2).dark, Palette.speakerHue(slot: 2).dark)
        for slot in 0..<50 { _ = Palette.speakerHue(slot: slot) }   // no trap
    }

    /// A negative / unknown slot must still render rather than crash on a bad modulo.
    func testNegativeSlotFoldsRatherThanTrapping() {
        XCTAssertEqual(Palette.speakerHue(slot: -1).dark,
                       Palette.speakerHue(slot: Palette.speakerHues.count - 1).dark)
        XCTAssertEqual(Palette.speakerHue(slot: -7).dark,
                       Palette.speakerHue(slot: (-7 % Palette.speakerHues.count
                                                 + Palette.speakerHues.count)
                                                % Palette.speakerHues.count).dark)
    }

    /// SEMANTIC SEPARATION — the reason these are their own tokens. A speaker must never
    /// wear green/amber/red (which mean good/warning/bad app-wide) or the accent (which
    /// means "this turn is playing"), or the colour stops being identity and starts
    /// looking like a verdict.
    func testNoSpeakerHueCollidesWithASemanticColour() {
        let reserved: [UInt32] = [
            Palette.green.light, Palette.green.dark,
            Palette.amber.light, Palette.amber.dark,
            Palette.red.light,   Palette.red.dark,
            Palette.accent.light, Palette.accent.dark,
            Palette.nameLinked.light, Palette.nameLinked.dark,
        ]
        for (i, hue) in Palette.speakerHues.enumerated() {
            XCTAssertFalse(reserved.contains(hue.light), "speaker \(i) light reuses a reserved colour")
            XCTAssertFalse(reserved.contains(hue.dark), "speaker \(i) dark reuses a reserved colour")
        }
    }

    /// Light values must actually be darker than their dark-scheme twins — they sit on
    /// white. Caught by luminance rather than by eye so a future edit can't quietly
    /// invert one.
    func testLightVariantsAreDarkerThanDarkVariants() {
        func luma(_ hex: UInt32) -> Double {
            let r = Double((hex >> 16) & 0xff), g = Double((hex >> 8) & 0xff), b = Double(hex & 0xff)
            return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        }
        for (i, hue) in Palette.speakerHues.enumerated() {
            XCTAssertLessThan(luma(hue.light), luma(hue.dark),
                              "speaker \(i): the light-scheme value must be the darker one")
        }
    }
}
