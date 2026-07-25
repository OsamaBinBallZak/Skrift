import CoreGraphics

/// Where the note's reading column sits, given the window width and whether the
/// Connections inspector is floating over the trailing edge.
///
/// The inspector floats (it doesn't take a column), so the two things Tuur asked
/// for collide below a certain width: "the note never moves" and "the panel never
/// hides text" can't both hold once `column + 2 × panel > width`. The rule he
/// picked (2026-07-25) is ADAPTIVE — honour "never moves" whenever the window can
/// afford it, and degrade by narrowing (never by hiding text) when it can't:
///
///   • panel closed → column capped at `maxColumn`, centred in the full width.
///   • panel open, wide enough that centring ALREADY clears the panel → identical
///     layout to closed. The note genuinely does not move.
///   • panel open, too narrow → the column narrows into the free region left of
///     the panel, so every line stays fully readable.
///
/// Pure arithmetic on purpose: this is the one rule that decides whether the user
/// can read their own note, so it's unit-tested rather than eyeballed.
enum NoteMeasure {
    /// The widest a reading column ever gets (the measure, ~100ch at 15pt).
    static let maxColumn: CGFloat = 820
    /// Never narrower than this — below it we'd rather clip than reflow to a sliver.
    static let minColumn: CGFloat = 320
    /// Breathing room either side of the column at rest.
    static let gutter: CGFloat = 72

    /// `region` is the width the column is centred within, pinned to the LEADING
    /// edge of the note area (the panel occupies the trailing edge).
    static func column(width: CGFloat, panelWidth: CGFloat) -> (colW: CGFloat, region: CGFloat) {
        let resting = min(maxColumn, max(minColumn, width - gutter))
        guard panelWidth > 0 else { return (resting, width) }
        // Centred in the full width, does the column already stop short of the
        // panel? Then changing nothing is the correct answer.
        if resting <= width - 2 * panelWidth { return (resting, width) }
        // It doesn't — lay out in the free region so nothing hides behind glass.
        // `free` is in the min as well as `minColumn`: the window is freely
        // resizable (no `minWidth` on the scene), so it CAN be dragged narrower
        // than minColumn + panel. There, a cramped column you can read beats a
        // comfortable one with a third of it behind glass — never hide text.
        let free = width - panelWidth
        return (min(resting, max(minColumn, free - gutter), free), free)
    }
}
