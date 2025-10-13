import XCTest
import SwiftTreeSitter
import TreeSitterMelbi

final class TreeSitterMelbiTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_melbi())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Melbi Language Parser grammar")
    }
}
