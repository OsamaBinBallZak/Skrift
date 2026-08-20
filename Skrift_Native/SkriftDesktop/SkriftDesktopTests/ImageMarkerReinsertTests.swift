import XCTest
import Foundation

final class ImageMarkerReinsertTests: XCTestCase {

    func testExtractAnchorsStripsAndSavesContext() {
        let (stripped, nums, anchors) = ImageMarkerReinsert.extractAnchors("I went outside [[img_001]] and saw a bird")
        XCTAssertEqual(nums, [1])
        XCTAssertEqual(stripped, "I went outside and saw a bird")
        XCTAssertTrue(anchors[1]!.before.hasSuffix("outside"))
        XCTAssertTrue(anchors[1]!.after.hasPrefix("and saw"))
    }

    func testExtractAnchorsNoMarkers() {
        let (stripped, nums, anchors) = ImageMarkerReinsert.extractAnchors("just  text   here")
        XCTAssertEqual(nums, [])
        XCTAssertEqual(stripped, "just text here")   // horizontal whitespace collapsed
        XCTAssertTrue(anchors.isEmpty)
    }

    /// THE picture-collapse bug (Tuur, 2026-08-20). Stripping markers used to flatten
    /// `\s+` to a single space — and this text is exactly what the model is fed whenever
    /// a note HAS a picture, so a photo was the one thing that destroyed a note's
    /// paragraphs before copy-edit ever ran. Gemma won't put them back (that is why
    /// `ensureParagraphs` exists), so they were simply gone.
    func testStrippingAMarkerKeepsTheAuthorsParagraphs() {
        let body = """
        Mats was tien jaar oud.

        Elke ochtend liep hij [[img_001]] het duin over.

        Op een dag was er een boot.
        """
        let (stripped, nums, _) = ImageMarkerReinsert.extractAnchors(body)
        XCTAssertEqual(nums, [1])
        XCTAssertEqual(stripped, """
        Mats was tien jaar oud.

        Elke ochtend liep hij het duin over.

        Op een dag was er een boot.
        """, "the paragraphs the author wrote must reach the model intact")
    }

    /// …while the seam the marker leaves is still tidied, and a runaway stack of breaks
    /// normalises — the model should see clean structure, not the raw artefacts.
    func testStrippedTextIsStillTidied() {
        let (stripped, _, _) = ImageMarkerReinsert.extractAnchors(
            "one   [[img_001]]   two \n\n\n\n three  \n  four")
        XCTAssertEqual(stripped, "one two\n\nthree\nfour")
    }

    func testReinsertPlacesMarkerAfterBeforeAnchor() {
        let anchors = [1: ImageMarkerReinsert.Anchors(before: "went outside", after: "and saw")]
        let out = ImageMarkerReinsert.reinsert(text: "I went outside and saw a bird.", imgNums: [1], anchors: anchors)
        XCTAssertTrue(out.contains("[[img_001]]"))
        let marker = out.range(of: "[[img_001]]")!
        let outside = out.range(of: "outside")!
        let saw = out.range(of: "saw")!
        XCTAssertTrue(outside.upperBound <= marker.lowerBound)   // after "outside"
        XCTAssertTrue(marker.upperBound <= saw.lowerBound)       // before "saw"
    }

    func testReinsertPreservesMarkerOrder() {
        let anchors = [
            1: ImageMarkerReinsert.Anchors(before: "first part", after: "second"),
            2: ImageMarkerReinsert.Anchors(before: "second part", after: "third"),
        ]
        let out = ImageMarkerReinsert.reinsert(text: "first part second part third part", imgNums: [1, 2], anchors: anchors)
        let m1 = out.range(of: "[[img_001]]")!
        let m2 = out.range(of: "[[img_002]]")!
        XCTAssertTrue(m1.lowerBound < m2.lowerBound)
    }

    func testReinsertNoImagesReturnsInput() {
        XCTAssertEqual(ImageMarkerReinsert.reinsert(text: "unchanged", imgNums: [], anchors: [:]), "unchanged")
    }
}
