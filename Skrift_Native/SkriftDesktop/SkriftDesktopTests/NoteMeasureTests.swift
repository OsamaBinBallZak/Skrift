import XCTest
import CoreGraphics

/// `NoteMeasure.column` — where the note's reading column sits while the
/// Connections inspector floats over the trailing edge.
///
/// The contract Tuur picked (2026-07-25, adaptive): honour "the note never moves"
/// whenever the window can afford it, and when it can't, NARROW the column rather
/// than let the panel hide text. The invariant that matters more than any specific
/// number: **the column never extends under the panel**.
final class NoteMeasureTests: XCTestCase {
    private let panel: CGFloat = 280   // ConnectionsPanel.width

    /// The column's trailing edge, given the measure's centring rules.
    private func columnTrailingEdge(width: CGFloat, panelWidth: CGFloat) -> CGFloat {
        let m = NoteMeasure.column(width: width, panelWidth: panelWidth)
        return (m.region + m.colW) / 2      // region is pinned to the leading edge
    }

    // MARK: resting (no inspector)

    func testClosedCapsAtTheMeasureAndCentresInTheFullWidth() {
        let m = NoteMeasure.column(width: 1180, panelWidth: 0)
        XCTAssertEqual(m.colW, NoteMeasure.maxColumn)
        XCTAssertEqual(m.region, 1180)
    }

    func testClosedNarrowWindowGivesUpTheGutterBeforeTheMeasure() {
        let m = NoteMeasure.column(width: 600, panelWidth: 0)
        XCTAssertEqual(m.colW, 600 - NoteMeasure.gutter)
        XCTAssertEqual(m.region, 600)
    }

    func testClosedNeverGoesBelowMinColumn() {
        XCTAssertEqual(NoteMeasure.column(width: 200, panelWidth: 0).colW, NoteMeasure.minColumn)
    }

    // MARK: open — wide enough that nothing has to move

    func testWideWindowLeavesTheLayoutIDENTICALToClosed() {
        // 820 + 2×280 = 1380: the first width where centring already clears the panel.
        let closed = NoteMeasure.column(width: 1380, panelWidth: 0)
        let open   = NoteMeasure.column(width: 1380, panelWidth: panel)
        XCTAssertEqual(open.colW, closed.colW, "the note must not resize")
        XCTAssertEqual(open.region, closed.region, "the note must not move")
    }

    func testVeryWideWindowAlsoLeavesItUntouched() {
        let closed = NoteMeasure.column(width: 2000, panelWidth: 0)
        let open   = NoteMeasure.column(width: 2000, panelWidth: panel)
        XCTAssertEqual(open.colW, closed.colW)
        XCTAssertEqual(open.region, closed.region)
    }

    // MARK: open — too narrow, so the column steps aside

    func testNarrowWindowStepsAsideInsteadOfHidingText() {
        // The width that shipped the bug: an 820 column centred in 952 ran 214pt
        // under the panel.
        let m = NoteMeasure.column(width: 952, panelWidth: panel)
        XCTAssertEqual(m.region, 952 - panel, "the column must lay out left of the panel")
        XCTAssertLessThan(m.colW, NoteMeasure.maxColumn, "it has to narrow to fit")
    }

    func testJustBelowTheThresholdStepsAside() {
        let m = NoteMeasure.column(width: 1379, panelWidth: panel)
        XCTAssertEqual(m.region, 1379 - panel)
    }

    /// The window has no `minWidth`, so it can be dragged narrower than
    /// minColumn + panel. There the column gives up `minColumn` rather than hide
    /// text — a cramped column you can read beats one that's partly behind glass.
    func testAbsurdlyNarrowWindowSacrificesTheMinimumRatherThanHideText() {
        let m = NoteMeasure.column(width: 400, panelWidth: panel)
        XCTAssertEqual(m.region, 120)
        XCTAssertEqual(m.colW, 120, "must fit the free region, minColumn notwithstanding")
    }

    // MARK: the invariant, swept

    func testColumnNeverExtendsUnderThePanelAtAnyWidth() {
        for w in stride(from: 400.0, through: 2400.0, by: 1.0) {
            let width = CGFloat(w)
            let trailing = columnTrailingEdge(width: width, panelWidth: panel)
            // Sub-pixel tolerance only — a whole point of text under glass is a bug.
            XCTAssertLessThanOrEqual(trailing, width - panel + 0.5,
                                     "column runs under the inspector at width \(width)")
        }
    }

    func testColumnAlwaysFitsItsRegionAtAnyWidth() {
        for w in stride(from: 400.0, through: 2400.0, by: 1.0) {
            for pw in [CGFloat(0), panel] {
                let m = NoteMeasure.column(width: CGFloat(w), panelWidth: pw)
                XCTAssertLessThanOrEqual(m.colW, m.region, "column overflows its region at \(w)/\(pw)")
                XCTAssertGreaterThanOrEqual(m.colW, min(NoteMeasure.minColumn, m.region))
            }
        }
    }
}
