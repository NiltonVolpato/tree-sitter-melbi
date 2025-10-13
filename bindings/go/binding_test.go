package tree_sitter_melbi_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_melbi "github.com/niltonvolpato/melbi/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_melbi.Language())
	if language == nil {
		t.Errorf("Error loading Melbi Language Parser grammar")
	}
}
