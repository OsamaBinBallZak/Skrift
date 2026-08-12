import XCTest
import SwiftUI
@testable import SkriftMobile

/// A rendered fixture of the importance card, for the eyes rather than for an
/// assertion.
///
/// The Mac has `-snapshot-significance` in its own binary; the phone has no
/// headless render mode, so this bundle is where its control gets LOOKED at. It
/// was written for the 2026-08-12 un-twinning (one shared
/// `SignificanceCirclesView`, one style table per app) to prove the phone's half
/// changed no pixels either: run it on the old code, run it on the new, compare
/// the two PNGs. Point `SKRIFT_RENDER_DIR` at a directory to keep the output.
@MainActor
final class SignificanceCirclesRenderTests: XCTestCase {

    /// All five states the card has, stacked, at the phone's real card width.
    func testRenderTheCard() throws {
        let card = VStack(alignment: .leading, spacing: 14) {
            SignificanceCircles(value: .constant(0), onCommit: {})
            SignificanceCircles(value: .constant(0.5), onCommit: {})
            SignificanceCircles(value: .constant(0.8), onCommit: {})
            SignificanceCircles(value: .constant(1.0), onCommit: {})
            SignificanceCircles(value: .constant(0.3), onCommit: {})
        }
        .padding(16)
        .frame(width: 390, alignment: .leading)
        .background(Color.skBg)
        .environment(\.colorScheme, .dark)

        let renderer = ImageRenderer(content: card)
        renderer.scale = 2
        let image = try XCTUnwrap(renderer.uiImage, "the card rendered to nothing")
        let png = try XCTUnwrap(image.pngData())
        // A blank or collapsed render still produces a PNG — pin the size so a
        // control that laid out to nothing can't pass as a green test.
        XCTAssertGreaterThan(image.size.width, 300)
        XCTAssertGreaterThan(image.size.height, 400)

        let dir = ProcessInfo.processInfo.environment["SKRIFT_RENDER_DIR"]
            ?? NSTemporaryDirectory()
        let url = URL(fileURLWithPath: dir).appendingPathComponent("significance-phone.png")
        try png.write(to: url)
        print("significance render written: \(url.path)")
    }
}
