import SwiftUI
import AppKit

// The importance control itself is the SHARED `SignificanceCirclesView`
// (Shared/UI/SignificanceCirclesView.swift) and the value↔circle mapping is the
// SHARED `SignificanceScale` — one copy each for both apps, since the scale gates
// phone→Mac sync and the control has already drifted twice. What is left here is
// the Mac's half: which colours out of `Theme`, and the measurements a pointer-
// driven desktop card was tuned to.

/// The Mac's importance card. Keeps the call sites (`NoteProperties`,
/// `UnpipelinedMemoSheet`) unchanged; everything it draws comes from the shared view.
struct SignificanceCircles: View {
    /// nil = the user hasn't rated this note yet. Set values are exact 0.1 snaps.
    @Binding var value: Double?
    /// Disabled until the note is processed (#18 — can't rate an unprocessed note).
    var enabled: Bool = true

    var body: some View {
        SignificanceCirclesView(value: $value, style: .mac, enabled: enabled)
    }
}

extension SignificanceStyle {
    /// Desktop card: 13pt circles at 7pt gaps (dense enough not to be mistaken for
    /// the audio scrubber), pointer hover + tooltips, an outlined card.
    static var mac: SignificanceStyle {
        SignificanceStyle(
            accent: Theme.accent,
            amber: Theme.amber,
            green: Theme.green,
            surface: Theme.surface,
            divider: Theme.hairline.opacity(0.07),
            ring: Theme.hairline.opacity(0.2),
            cardStroke: Theme.hairline.opacity(0.07),
            textMuted: Theme.textMuted,
            textSecondary: Theme.textSecondary,
            warmFill: warmFill,
            dotSize: 13,
            gap: 7,
            cardRadius: 12,
            rowHeight: nil,             // the glyph is the target — a pointer is precise
            flameSize: 9,
            tagTracking: 0.54,
            tierTracking: 0.63,
            tierWeight: .regular,
            syncDotSize: 5,
            syncFontSize: 11,
            hoverPreview: true,
            tooltips: true,
            flameTrailing: false,       // a fixed step after the last circle
            syncFlameWhenRefine: false, // the dot goes amber instead
            syncTintsWithState: false,
            scalesToFit: false,
            animation: .easeOut(duration: 0.12),
            litShadowOpacity: 0.35,
            warmShadowRadius: 4,
            warmShadowY: 0,
            flameOpacity: 0.9,
            topRowBaseline: false)
    }

    /// Lit circles 8–10. The mix weight and both channel sets live in
    /// `SignificanceWarmFill` (over `Palette`) — this is only the NSColor wrapper.
    private static let warmFill = Color(nsColor: NSColor(name: nil) { ap in
        let dark = ap.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua
        let c = dark ? SignificanceWarmFill.darkMix : SignificanceWarmFill.lightMix
        return NSColor(srgbRed: c.r / 255, green: c.g / 255, blue: c.b / 255, alpha: 1)
    })
}
