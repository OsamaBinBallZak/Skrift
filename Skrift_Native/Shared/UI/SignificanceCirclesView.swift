import SwiftUI

// THE importance control — ONE view for both apps (2026-08-12).
//
// It was two hand-built copies of the same signed mock
// (`mocks/significance-circles.html`) since 2026-07-16, and they drifted twice:
// the top tier read "Significant" on the Mac while the phone said "Important"
// (fixed by sharing the SCALE), and the past-the-wall `warmFill` mix was written
// out channel-by-channel in both files — the exact bug `Palette` claims is "fixed
// by construction", except neither copy sourced `Palette`. Both are gone now: the
// rules live here, and each app supplies only the values it legitimately owns.
//
// What each app owns is a `SignificanceStyle` — colours out of its own Theme
// (which already source `Palette`) plus the measurements it deliberately tuned
// (the phone's 18pt circles fit a 390pt screen; the Mac's 13pt fit a dense card).
// Every field below exists because the two apps render differently TODAY; the
// refactor changes zero pixels on either. Collapsing a pair is a design decision
// with an eyeball round attached, exactly like `Palette.DriftedPair`.

/// The per-app half of the importance control: what to draw it with, never what
/// to draw. No state, no rules — those are in the view and in `SignificanceScale`.
struct SignificanceStyle {

    // ── Colours (each app maps these from its own Theme) ─────────────────────

    var accent: Color
    var amber: Color
    var green: Color
    /// Card background.
    var surface: Color
    /// The hairline above the sync line.
    var divider: Color
    /// Border of an unlit circle.
    var ring: Color
    /// The Mac outlines its card; the phone doesn't. nil = no outline.
    var cardStroke: Color?
    /// "Not rated", the inactive tier labels, the unrated sync dot.
    var textMuted: Color
    /// The sync sentence.
    var textSecondary: Color
    /// Lit circles 8–10. DARK = the mock's accent+amber mix, LIGHT = plain amber
    /// (the mix reads as dirty brown on white — device-found 2026-07-16). Built by
    /// each app from `Palette` via `SignificanceWarmFill`, so the mix weight and
    /// the channel values exist once.
    var warmFill: Color

    // ── Measurements ─────────────────────────────────────────────────────────

    var dotSize: CGFloat
    var gap: CGFloat
    var cardRadius: CGFloat
    /// A touch target taller than the glyph (phone: the whole row is tappable).
    /// nil = the glyph is the target, which is right for a pointer.
    var rowHeight: CGFloat?
    /// Flame glyph in the REFINE PASS tag.
    var flameSize: CGFloat
    /// Letter-spacing on the REFINE PASS tag and on the tier labels. The phone
    /// used `kerning` and the Mac `tracking` — one modifier now (tracking), which
    /// adds the same space after the last character too. Sub-pixel, disclosed.
    var tagTracking: CGFloat
    var tierTracking: CGFloat
    var tierWeight: Font.Weight
    /// Leading dot on the sync line.
    var syncDotSize: CGFloat
    var syncFontSize: CGFloat

    // ── Behaviour ────────────────────────────────────────────────────────────

    /// Pointer hover previews the would-be rating and scales the dot under it.
    var hoverPreview: Bool
    /// `.help()` tooltips — a pointer affordance.
    var tooltips: Bool
    /// The tag sits a fixed step after the last circle (Mac) or is pushed to the
    /// trailing edge (phone).
    var flameTrailing: Bool
    /// Past the wall the sync line's leading dot becomes a flame (phone) or stays
    /// a dot that goes amber (Mac).
    var syncFlameWhenRefine: Bool
    /// The sync sentence takes the state's colour (phone) or is always secondary
    /// (Mac).
    var syncTintsWithState: Bool
    /// Shrink-to-fit on the one-line text — a narrow-screen guard.
    var scalesToFit: Bool
    var animation: Animation
    /// Lit-but-not-warm circle glow.
    var litShadowOpacity: Double
    /// Warm circle glow, which the Mac lifts and the phone leaves alone.
    var warmShadowRadius: CGFloat
    var warmShadowY: CGFloat
    /// The lit REFINE PASS tag.
    var flameOpacity: Double
    /// Title row aligned on the text baseline (phone) or centred (Mac).
    var topRowBaseline: Bool

    // ── Drift, not decision ──────────────────────────────────────────────────
    //
    // Six fields above differ between the apps for no reason anyone recorded —
    // two hands building the same mock. Each is sub-2pt and each is a candidate
    // to collapse on the next eyeball round, the same way `Palette.DriftedPair`
    // parks a colour: `flameSize` (9 / 10), `tagTracking` + `tierTracking`
    // (0.54 + 0.63 / 0.5), `syncDotSize` (5 / 6), `syncFontSize` (11 / 10.5),
    // `flameOpacity` (0.9 / 1.0), `tierWeight` (regular / medium). They are
    // parameters rather than a convergence because this refactor is not allowed
    // to move pixels on a control that has been through five device rounds.
}

/// The 10-circle importance control (signed mock `significance-circles.html`).
///
/// Star-rating interaction: tap/click circle N to set 0.N, tap the set circle to
/// clear back to "Not rated". The 0.8 refine wall is cued three ways at once — an
/// always-visible amber hairline before circle 8, warm fills on lit circles 8–10,
/// and the flame tag after the row.
struct SignificanceCirclesView: View {
    /// nil = never rated (shows "Not rated", not a misleading "0.0 · Passing").
    /// The phone stores a non-optional 0 and adapts at the call site.
    @Binding var value: Double?
    var style: SignificanceStyle
    /// The Mac dims the control until a note is processed.
    var enabled: Bool = true
    /// Fires on tap, before the value is written — the phone's haptic.
    var onTap: () -> Void = {}
    /// Fires after the value is written — the phone's save.
    var onCommit: () -> Void = {}

    /// Dot under the pointer (drives the scale-up).
    @State private var hovered: Int?
    /// Pending-value preview (ghost fills + the top-right label). Cleared on click
    /// so a freshly set rating paints its real colour immediately.
    @State private var preview: Int?

    private var lit: Int { SignificanceScale.litCount(value) }
    private var warm: Bool { lit >= SignificanceScale.refineStep }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            topRow
            dotsRow.padding(.top, 9)
            tierLabels.padding(.top, 7)
            // The card + the sync line are the anatomy the two apps agreed on
            // 2026-07-25: a container, and a statement of what the rating DOES
            // (0 = the Mac leaves it alone, >0 = it gets processed), which is the
            // whole point of the control.
            Rectangle().fill(style.divider).frame(height: 0.5)
                .padding(.top, 11).padding(.bottom, 9)
            syncLine
        }
        .padding(EdgeInsets(top: 13, leading: 13, bottom: 12, trailing: 13))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(style.surface, in: card)
        .overlay(style.cardStroke.map { card.stroke($0, lineWidth: 1) })
        .opacity(enabled ? 1 : 0.5)
        // `.contain` scopes the card as its own AX container — without it this
        // identifier propagates DOWN and overwrites every child's, so the circle
        // buttons all report "significance-circles" and XCUITest can't find
        // significance-circle-N.
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("significance-circles")
    }

    private var card: RoundedRectangle {
        RoundedRectangle(cornerRadius: style.cardRadius, style: .continuous)
    }

    // ── Label + live value ───────────────────────────────────────────────────

    private var topRow: some View {
        HStack(alignment: style.topRowBaseline ? .firstTextBaseline : .center) {
            Text("Importance")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(style.textMuted)
            Spacer(minLength: 8)
            valueLabel
        }
    }

    @ViewBuilder private var valueLabel: some View {
        if !enabled {
            Text("rate after processing")
                .font(.system(size: 11))
                .foregroundStyle(style.textMuted)
        } else if let preview {
            Text(SignificanceScale.valueText(forStep: preview))
                .font(.system(size: 11.5, weight: .semibold).monospacedDigit())
                .foregroundStyle(style.textSecondary)
                .accessibilityIdentifier("significance-value")
        } else {
            Text(SignificanceScale.label(forStep: lit))
                .font(.system(size: 11.5, weight: lit == 0 ? .medium : .semibold).monospacedDigit())
                // Pure amber past the wall — ONE warm text colour with the flame
                // tag and the active tier label (Tuur 2026-07-16; the old 50%
                // blend was a third orange).
                .foregroundStyle(lit == 0 ? style.textMuted : warm ? style.amber : style.accent)
                .accessibilityIdentifier("significance-value")
        }
    }

    // ── The circles ──────────────────────────────────────────────────────────

    private var dotsRow: some View {
        HStack(spacing: style.gap) {
            ForEach(1...SignificanceScale.stepCount, id: \.self) { i in
                if i == SignificanceScale.refineStep { wallTick }
                dot(i)
            }
            if style.flameTrailing { Spacer(minLength: style.gap) }
            flameTag
                .padding(.leading, style.flameTrailing ? 0 : 6)
        }
        .animation(style.animation, value: preview)
        .animation(style.animation, value: lit)
    }

    private func dot(_ i: Int) -> some View {
        let isLit = i <= lit
        let isWarm = isLit && warm && i >= SignificanceScale.refineStep
        let isPreview = !isLit && preview.map { i <= $0 } == true

        let fill: Color = isWarm ? style.warmFill
            : isLit ? style.accent
            : isPreview ? style.accent.opacity(0.3)
            : .clear
        let border: Color = isWarm ? style.warmFill
            : isLit ? style.accent
            : isPreview ? style.accent.opacity(0.55)
            : style.ring

        return Button {
            onTap()
            withAnimation(style.animation) {
                value = lit == i ? nil : SignificanceScale.value(forStep: i)
            }
            preview = nil
            onCommit()
        } label: {
            Circle()
                .fill(fill)
                .overlay(Circle().strokeBorder(border, lineWidth: 1.5))
                .frame(width: style.dotSize, height: style.dotSize)
                .shadow(color: isWarm ? style.amber.opacity(0.3)
                             : isLit ? style.accent.opacity(style.litShadowOpacity) : .clear,
                        radius: isWarm ? style.warmShadowRadius : isLit ? 2.5 : 0,
                        y: isWarm ? style.warmShadowY : isLit ? 1 : 0)
                .frame(height: style.rowHeight)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .scaleEffect(style.hoverPreview && hovered == i ? 1.22 : 1)
        .animation(.easeOut(duration: 0.1), value: hovered)
        .onHover { inside in
            guard style.hoverPreview, enabled else { return }
            if inside {
                hovered = i; preview = i
            } else {
                // Only clear our own marks — entering the next dot may land first.
                if hovered == i { hovered = nil }
                if preview == i { preview = nil }
            }
        }
        .disabled(!enabled)
        .help(style.tooltips ? SignificanceScale.valueText(forStep: i) : "")
        .accessibilityIdentifier("significance-circle-\(i)")
        .accessibilityLabel("Importance \(SignificanceScale.valueText(forStep: i))")
        .accessibilityAddTraits(isLit ? .isSelected : [])
    }

    /// The always-visible amber hairline before circle 8 — the refine wall.
    private var wallTick: some View {
        RoundedRectangle(cornerRadius: 0.5)
            .fill(style.amber.opacity(0.35))
            .frame(width: 1, height: style.dotSize + 5)
            .help(style.tooltips ? "refine wall — 0.8+ notes get a refine pass" : "")
            .accessibilityHidden(true)
    }

    /// Flame + "REFINE PASS" after the row; fades in at 0.8+. Always laid out
    /// (opacity 0 when off) so the row width never jumps — as the mock does.
    private var flameTag: some View {
        HStack(spacing: 4) {
            Image(systemName: "flame.fill")
                .font(.system(size: style.flameSize, weight: .bold))
            Text("REFINE PASS")
                .font(.system(size: 9, weight: .bold))
                .tracking(style.tagTracking)
                .lineLimit(1)
                .minimumScaleFactor(style.scalesToFit ? 0.7 : 1)
        }
        .foregroundStyle(style.amber)
        .fixedSize(horizontal: !style.scalesToFit, vertical: false)
        .opacity(warm ? style.flameOpacity : 0)
        .animation(.easeOut(duration: 0.18), value: warm)
        .allowsHitTesting(warm)
        .help(style.tooltips ? "Rated 0.8+ — this note gets a refine pass before export" : "")
        .accessibilityIdentifier("significance-refine-flag")
        .accessibilityLabel("Refine pass — rated 0.8 or higher")
        .accessibilityHidden(!warm)
    }

    // ── Tier group labels under the circle clusters (1–3 / 4–6 / 7–10) ───────

    private var tierLabels: some View {
        // The "important" cluster is 4 dots + the 1pt wall + its gaps wide.
        let small = 3 * style.dotSize + 2 * style.gap
        let large = 4 * style.dotSize + 4 * style.gap + 1
        return HStack(spacing: style.gap) {
            tierLabel("PASSING", width: small, active: lit >= 1 && lit <= 3, warmTint: false)
            tierLabel("USEFUL", width: small, active: lit >= 4 && lit <= 6, warmTint: false)
            tierLabel("IMPORTANT", width: large, active: lit >= 7, warmTint: warm)
        }
        .animation(style.animation, value: lit)
        .accessibilityHidden(true)   // decorative — each circle already says its tier
    }

    private func tierLabel(_ text: String, width: CGFloat, active: Bool, warmTint: Bool) -> some View {
        Text(text)
            .font(.system(size: 9, weight: style.tierWeight))
            .tracking(style.tierTracking)
            .lineLimit(1)
            .minimumScaleFactor(style.scalesToFit ? 0.8 : 1)
            .foregroundStyle(active ? (warmTint ? style.amber : style.accent) : style.textMuted)
            .frame(width: width)
    }

    // ── What the rating MEANS for processing ─────────────────────────────────

    private var syncLine: some View {
        HStack(spacing: 6) {
            if style.syncFlameWhenRefine && warm {
                Image(systemName: "flame.fill").font(.system(size: 9, weight: .bold))
            } else {
                Circle()
                    .fill(lit == 0 ? style.textMuted : warm ? style.amber : style.green)
                    .frame(width: style.syncDotSize, height: style.syncDotSize)
            }
            Text(SignificanceScale.syncCopy(forStep: lit))
                .font(.system(size: style.syncFontSize))
                .lineLimit(1)
                .minimumScaleFactor(style.scalesToFit ? 0.85 : 1)
        }
        .foregroundStyle(style.syncTintsWithState
                         ? (lit == 0 ? style.textMuted : warm ? style.amber : style.textSecondary)
                         : style.textSecondary)
        .accessibilityIdentifier("significance-sync-line")
    }
}
