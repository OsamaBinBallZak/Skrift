import Foundation

/// The past-the-wall fill for the importance control's lit circles 8–10.
///
/// Its own file, beside `Palette` and with the same discipline: channel VALUES
/// only, no `Color`/`UIColor`/`NSColor` type — each app wraps it in its own
/// dynamic-colour provider. That is also what makes it testable from the
/// SwiftUI-free unit bundle, which matters because this is the exact rule that
/// drifted: until 2026-08-12 both apps wrote the mix out channel-by-channel
/// (`(124 * 0.42 + 245 * 0.58) / 255`, twice), so `Palette` claimed the
/// warmFill class of bug was "fixed by construction" while two hardcoded copies
/// sat outside it.
///
/// DARK = the mock's accent-toward-amber mix. LIGHT = plain amber: the mix reads
/// as dirty brown on white (device-found 2026-07-16).
enum SignificanceWarmFill {
    /// Accent's share of the dark-mode mix — the mock's oklab blend, flattened to
    /// an sRGB lerp when it was first built. Kept as-is: it was eyeballed on device.
    static let accentWeight: Double = 0.42

    /// Dark mode: accent mixed toward amber. 0–255 channels.
    static var darkMix: (r: Double, g: Double, b: Double) {
        let a = channels(Palette.accent.dark), m = channels(Palette.amber.dark)
        let w = accentWeight
        return (a.r * w + m.r * (1 - w), a.g * w + m.g * (1 - w), a.b * w + m.b * (1 - w))
    }

    /// Light mode: plain amber. 0–255 channels.
    static var lightMix: (r: Double, g: Double, b: Double) { channels(Palette.amber.light) }

    private static func channels(_ hex: UInt32) -> (r: Double, g: Double, b: Double) {
        (Double((hex >> 16) & 0xff), Double((hex >> 8) & 0xff), Double(hex & 0xff))
    }
}
