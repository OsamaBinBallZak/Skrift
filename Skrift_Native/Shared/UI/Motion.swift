import SwiftUI

/// THE cross-app motion table — the two animation curves the whole product moves
/// on. SHARED because a spring tuned twice reads as two different products (the
/// same lesson as `Palette`: one hex table, one source). The phone's
/// `Theme.Motion` delegates here; the Mac reads it directly.
enum SkMotion {
    /// The signature spring — panels, sheets, anything with weight.
    static let spring = Animation.spring(response: 0.35, dampingFraction: 0.85)
    /// Taps and toggles — a control acknowledging a click.
    static let snappy = Animation.snappy(duration: 0.22)
}
