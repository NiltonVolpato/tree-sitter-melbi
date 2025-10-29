/**
 * @file Melbi grammar for tree-sitter
 * @author Nilton Volpato <nilton@volpa.to>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

module.exports = grammar({
  name: "melbi",

  extras: ($) => [
    /\s/, // Whitespace
    $.comment,
  ],

  word: ($) => $.unquoted_identifier,

  conflicts: ($) => [
    // Grouped expression vs lambda params: (x) could be either
    [$.expression, $.lambda_params],
    // Integer with suffix: ambiguity with consecutive integers and backticks
    [$.integer],
    // Float with suffix: ambiguity with consecutive floats and backticks
    [$.float],
    // Type application: x as List[...] - is [...] type params or index?
    [$.type_application],
  ],

  rules: {
    source_file: ($) => $.expression,

    // Comments
    comment: ($) => token(seq("//", /.*/)),

    // === Expressions ===
    expression: ($) =>
      choice(
        $.lambda_expression, // Lowest precedence (prefix)
        $.where_expression, // Postfix after lambda
        $.otherwise_expression,
        $.if_expression, // Prefix
        $.binary_expression,
        $.unary_expression,
        $.cast_expression, // Highest postfix
        $.field_expression,
        $.index_expression,
        $.call_expression,
        $.grouped_expression,
        $.literal,
        $.identifier,
      ),

    // === Primary Expressions ===

    grouped_expression: ($) => seq("(", $.expression, ")"),

    // === Unary Expressions ===
    // Precedence order from PRATT_PARSER:
    // - not (precedence 3)
    // - neg (precedence 6, unary minus)

    unary_expression: ($) =>
      choice(
        prec(3, seq(field("operator", "not"), field("operand", $.expression))),
        prec(6, seq(field("operator", "-"), field("operand", $.expression))),
      ),

    // === Binary Expressions ===
    // Precedence from PRATT_PARSER (lowest to highest):
    // 1. or (left-assoc)
    // 2. and (left-assoc)
    // 4. +, - (left-assoc)
    // 5. *, / (left-assoc)
    // 7. ^ (right-assoc)

    binary_expression: ($) =>
      choice(
        // or - precedence 1
        prec.left(
          1,
          seq(
            field("left", $.expression),
            field("operator", "or"),
            field("right", $.expression),
          ),
        ),

        // and - precedence 2
        prec.left(
          2,
          seq(
            field("left", $.expression),
            field("operator", "and"),
            field("right", $.expression),
          ),
        ),

        // +, - - precedence 4
        prec.left(
          4,
          seq(
            field("left", $.expression),
            field("operator", choice("+", "-")),
            field("right", $.expression),
          ),
        ),

        // *, / - precedence 5
        prec.left(
          5,
          seq(
            field("left", $.expression),
            field("operator", choice("*", "/")),
            field("right", $.expression),
          ),
        ),

        // ^ - precedence 7 (right-assoc)
        prec.right(
          7,
          seq(
            field("left", $.expression),
            field("operator", "^"),
            field("right", $.expression),
          ),
        ),
      ),

    // === If Expression ===
    // if_op is a prefix operator at precedence 0 (before lambda/where)

    if_expression: ($) =>
      prec(
        0,
        seq(
          "if",
          field("condition", $.expression),
          "then",
          field("consequence", $.expression),
          "else",
          field("alternative", $.expression),
        ),
      ),

    // === Lambda Expression ===
    // lambda_op is a prefix operator (lowest precedence in PRATT_PARSER)

    lambda_expression: ($) =>
      prec(
        -3, // Lowest
        seq(
          "(",
          optional($.lambda_params),
          ")",
          "=>",
          field("body", $.expression),
        ),
      ),

    lambda_params: ($) =>
      seq($.identifier, repeat(seq(",", $.identifier)), optional(",")),

    // === Otherwise Expression ===
    // otherwise_op is an infix operator with right associativity
    // It's between lambda/where and if in precedence

    otherwise_expression: ($) =>
      prec.right(
        -1, // After where
        seq(
          field("left", $.expression),
          "otherwise",
          field("right", $.expression),
        ),
      ),

    // === Postfix Expressions ===
    // From highest to lowest precedence:
    // - cast_op (as)
    // - field_op (.)
    // - index_op ([])
    // - call_op (())

    call_expression: ($) =>
      prec.left(
        8,
        seq(field("function", $.expression), "(", optional($.call_args), ")"),
      ),

    call_args: ($) =>
      seq($.expression, repeat(seq(",", $.expression)), optional(",")),

    index_expression: ($) =>
      prec.left(
        9,
        seq(
          field("object", $.expression),
          "[",
          field("index", $.expression),
          "]",
        ),
      ),

    field_expression: ($) =>
      prec.left(
        10,
        seq(field("object", $.expression), ".", field("field", $.identifier)),
      ),

    cast_expression: ($) =>
      prec.left(
        11,
        seq(
          field("expression", $.expression),
          "as",
          field("type", $.type_expr),
        ),
      ),

    where_expression: ($) =>
      prec.left(
        -2, // After lambda
        seq(
          field("expression", $.expression),
          "where",
          "{",
          optional($.binding_list),
          "}",
        ),
      ),

    binding_list: ($) =>
      seq($.binding, repeat(seq(",", $.binding)), optional(",")),

    binding: ($) =>
      seq(field("name", $.identifier), "=", field("value", $.expression)),

    // === Type Expressions ===

    type_expr: ($) => choice($.record_type, $.type_application),

    record_type: ($) => seq("Record", "[", optional($.type_field_list), "]"),

    type_field_list: ($) =>
      seq($.type_field, repeat(seq(",", $.type_field)), optional(",")),

    type_field: ($) =>
      seq(field("name", $.identifier), ":", field("type", $.type_expr)),

    type_application: ($) =>
      prec(
        12, // Higher than cast (11) and index (9)
        seq(field("name", $.type_path), optional(seq("[", $.type_params, "]"))),
      ),

    type_path: ($) =>
      token(
        seq(
          /[A-Za-z][A-Za-z0-9_]*/,
          repeat(seq("::", /[A-Za-z][A-Za-z0-9_]*/)),
        ),
      ),

    type_params: ($) => seq($.type_expr, repeat(seq(",", $.type_expr))),

    // === Literals ===

    literal: ($) =>
      choice(
        $.integer,
        $.float,
        $.boolean,
        $.string,
        $.bytes,
        $.format_string,
        $.record,
        $.array,
        $.map,
      ),

    // === Composite Literals ===

    record: ($) =>
      choice(seq("Record", "{", "}"), seq("{", $.binding_list, "}")),

    array: ($) => seq("[", optional($.array_elems), "]"),

    array_elems: ($) =>
      seq($.expression, repeat(seq(",", $.expression)), optional(",")),

    map: ($) => seq("{", optional($.map_entry_list), "}"),

    map_entry_list: ($) =>
      seq($.map_entry, repeat(seq(",", $.map_entry)), optional(",")),

    map_entry: ($) =>
      seq(field("key", $.expression), ":", field("value", $.expression)),

    // === Scalar Literals ===

    boolean: ($) => choice("true", "false"),

    // NOTE: Tree-sitter limitation with suffix parsing
    // The suffix syntax `123`expr`` is meant to be atomic (no whitespace allowed),
    // but Tree-sitter's `extras` (whitespace) gets inserted around $.expression.
    // This means:
    //   - "123`s`"   ✅ correctly parses (no whitespace)
    //   - "123 `s`"  ✅ correctly fails (whitespace before opening backtick prevented by token.immediate)
    //   - "123` s`"  ❌ incorrectly parses (whitespace after opening backtick allowed)
    //   - "123`s `"  ❌ incorrectly parses (whitespace before closing backtick allowed)
    //
    // A proper fix would require an external scanner to make the entire suffix atomic,
    // but this is a minor issue that only affects edge cases with unusual whitespace.
    integer: ($) =>
      seq(
        token(
          seq(
            optional("-"),
            choice(
              seq("0b", /_*[01]/, repeat(/[01_]*/)), // Binary
              seq("0o", /_*[0-7]/, repeat(/[0-7_]*/)), // Octal
              seq("0x", /_*[0-9a-fA-F]/, repeat(/[0-9a-fA-F_]*/)), // Hex
              seq(/[0-9]/, repeat(/[0-9_]*/)), // Decimal
            ),
          ),
        ),
        optional(seq(token.immediate("`"), $.expression, token.immediate("`"))),
      ),

    // NOTE: Same whitespace limitation as integer suffix (see comment above)
    float: ($) =>
      seq(
        token(
          seq(
            optional("-"),
            choice(
              // .5, .5e10
              seq(
                ".",
                /[0-9]/,
                repeat(/[0-9_]*/),
                optional(
                  seq(/[eE]/, optional(/[+-]/), /[0-9]/, repeat(/[0-9_]*/)),
                ),
              ),
              // 3.14, 3., 3.14e10
              seq(
                /[0-9]/,
                repeat(/[0-9_]*/),
                ".",
                optional(seq(/[0-9]/, repeat(/[0-9_]*/))),
                optional(
                  seq(/[eE]/, optional(/[+-]/), /[0-9]/, repeat(/[0-9_]*/)),
                ),
              ),
              // 3e10, 3e-10
              seq(
                /[0-9]/,
                repeat(/[0-9_]*/),
                seq(/[eE]/, optional(/[+-]/), /[0-9]/, repeat(/[0-9_]*/)),
              ),
            ),
          ),
        ),
        optional(seq(token.immediate("`"), $.expression, token.immediate("`"))),
      ),

    suffix: ($) => seq("`", $.expression, "`"),

    string: ($) =>
      choice(
        seq('"', repeat(choice($.string_escape, /[^"\\]/)), '"'),
        seq("'", repeat(choice($.string_escape, /[^'\\]/)), "'"),
      ),

    bytes: ($) =>
      choice(
        seq('b"', repeat(choice($.bytes_escape, /[^"\\]/)), '"'),
        seq("b'", repeat(choice($.bytes_escape, /[^'\\]/)), "'"),
      ),

    format_string: ($) =>
      choice(
        seq('f"', repeat(choice($.format_text, $.format_expr)), '"'),
        seq("f'", repeat(choice($.format_text_single, $.format_expr)), "'"),
      ),

    format_text: ($) =>
      token.immediate(prec(1, /(?:\{\{|\}\}|\\[nrt"'\\]|[^{}"\\])+/)),

    format_text_single: ($) =>
      token.immediate(prec(1, /(?:\{\{|\}\}|\\[nrt"'\\]|[^{}'\\])+/)),

    format_expr: ($) => seq("{", $.expression, "}"),

    string_escape: ($) =>
      token.immediate(
        choice(
          /\\[nrt\\"']/,
          seq("\\u", /[0-9a-fA-F]{4}/),
          seq("\\U", /[0-9a-fA-F]{8}/),
        ),
      ),

    bytes_escape: ($) =>
      token.immediate(choice(/\\[nrt\\"']/, seq("\\x", /[0-9a-fA-F]{2}/))),

    // === Identifiers ===

    identifier: ($) => choice($.quoted_identifier, $.unquoted_identifier),

    quoted_identifier: ($) => /`[A-Za-z0-9\-_.:\/]+`/,

    unquoted_identifier: ($) =>
      token(seq(/[A-Za-z_]/, repeat(/[A-Za-z0-9_]*/))),
  },
});
