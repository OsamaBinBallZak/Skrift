import SwiftUI

// The importance control itself is the SHARED `SignificanceCirclesView`
// (Shared/UI/SignificanceCirclesView.swift) and the 10-step scale is the SHARED
// `SignificanceScale` — one copy each for both apps, since the scale gates
// phone→Mac sync and the control has already drifted twice. What is left here is
// the phone's half: which colours out of `Theme`, and the measurements a 390pt
// touch screen was tuned to.

/// The phone's importance card. Keeps the call sites (`MemoDetailView`,
/// `MergedCaptureView`, `ShareSheetView`) unchanged, including their non-optional
/// `Double` binding — the shared view speaks `Double?` (nil = never rated), which
/// the phone stores as 0.
struct SignificanceCircles: View {
    @Binding var value: Double
    var onCommit: () -> Void

    var body: some View {
        SignificanceCirclesView(
            value: Binding(get: { value == 0 ? nil : value },
                           set: { value = $0 ?? 0 }),
            style: .phone,
            onTap: { Haptics.tap(.light) },
            onCommit: onCommit)
    }
}

extension SignificanceStyle {
    /// Touch panel: 18pt circles at 6pt gaps instead of the mock's 19/9 so the row
    /// plus the inline flame tag fit inside the card on a 390pt phone. No hover, a
    /// 30pt-tall touch row, and every one-line label shrinks rather than truncates.
    static var phone: SignificanceStyle {
        SignificanceStyle(
            accent: .skAccent,
            amber: .skAmber,
            green: .skGreen,
            surface: .skSurface,
            divider: .skBorder,
            ring: ring,
            cardStroke: nil,            // the phone's card is fill-only
            textMuted: .skTextFaint,
            textSecondary: .skTextDim,
            warmFill: warmFill,
            dotSize: 18,
            gap: 6,
            cardRadius: Theme.Radius.card,
            rowHeight: 30,              // the row is the touch zone, not the glyph
            flameSize: 10,
            tagTracking: 0.5,
            tierTracking: 0.5,
            tierWeight: .medium,
            syncDotSize: 6,
            syncFontSize: 10.5,
            hoverPreview: false,
            tooltips: false,
            flameTrailing: true,        // pushed to the card's trailing edge
            syncFlameWhenRefine: true,
            syncTintsWithState: true,
            scalesToFit: true,
            animation: SkMotion.snappy,
            litShadowOpacity: 0.3,
            warmShadowRadius: 2.5,
            warmShadowY: 1,
            flameOpacity: 1,
            topRowBaseline: true)
    }

    /// Unlit circle ring — the mock's 20% hairline, adaptive.
    private static let ring = Color(uiColor: UIColor { tc in
        tc.userInterfaceStyle == .dark ? UIColor(white: 1, alpha: 0.22)
                                       : UIColor(white: 0, alpha: 0.18)
    })

    /// Lit circles 8–10. The mix weight and both channel sets live in
    /// `SignificanceWarmFill` (over `Palette`) — this is only the UIColor wrapper.
    private static let warmFill = Color(uiColor: UIColor { tc in
        let c = tc.userInterfaceStyle == .dark ? SignificanceWarmFill.darkMix
                                               : SignificanceWarmFill.lightMix
        return UIColor(red: c.r / 255, green: c.g / 255, blue: c.b / 255, alpha: 1)
    })
}
