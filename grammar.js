/**
 * @file html+jinja2
 * @author Meow King <mr.meowking@posteo.com>
 * @license MIT
 * @reference https://github.com/tree-sitter/tree-sitter-html
 * @reference https://github.com/geigerzaehler/tree-sitter-jinja2
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const {
  sep1,
  jinja_statement_start,
  jinja_statement_end,
  jinja_statement,
  jinja_expression_in_statement,
  jinja_keyword,
  jinja_context_specifier
} = require('./utils.js');

module.exports = grammar({
  name: "htmljinja2",

  // Keyword extraction: keywords are only recognized as whole words, so `or`
  // does not match inside `order`, `for` not inside `form`, etc.
  word: $ => $.jinja_identifier,

  extras: $ => [
    // it can appear anywhere in the tree structure, not in alias
    // for example,
    // alias(repeat($._node), $.body)  => (html_comment) (body)
    $.html_comment,  
    /\s+/,
  ],
  
  conflicts: ($) => [
    [$.jinja_for_else_statement],
    [$.jinja_if_elif_statement],
    [$.jinja_if_else_statement],
    [$.single_element, $.element]
  ],

  externals: ($) => [
    $._start_tag_name,
    $._script_start_tag_name,
    $._style_start_tag_name,
    $._end_tag_name,
    $.erroneous_end_tag_name,
    '/>',
    $._implicit_end_tag,
    $._raw_text,
    $.html_comment,
    // Jinja line statements / line comments (line_statement_prefix='%',
    // line_comment_prefix='##'). Emitted by the scanner only at line start.
    $._line_statement_marker,
    $._line_comment,
    $._line_end,
  ],


  rules: {
    source_file: $ => repeat($._node),

    _node: $ => choice(
      $.doctype,
      $.script_element,
      $.style_element,
      $.erroneous_end_tag,
      $.element,
      $.entity,
      $.text,
      $._jinja,
      $.jinja_line_statement,
      $.jinja_line_comment
    ),

    _html_node: $ => choice(
      $.doctype,
      $.script_element,
      $.style_element,
      $.erroneous_end_tag,
      $.element,
      $.entity,
      $.text,
    ),
    
    // HTML ==================================================================
    doctype: $ => seq(
      '<!',
      alias($._doctype, 'doctype'),
      /[^>]+/,
      '>',
    ),

    _doctype: _ => /DOCTYPE/i,

    element: $ => choice(
      seq(
        $.start_tag,
        repeat($._node),
        choice($.end_tag, $._implicit_end_tag),
      ),
      $.self_closing_tag,
    ),
    
    single_element: $ => choice(  // 🐶
      $.start_tag,
      $.end_tag
    ),
    
    start_tag: $ => seq(
      '<',
      alias($._start_tag_name, $.tag_name),
      repeat($.attribute),
      '>',
    ),

    
    end_tag: $ => seq(
      '</',
      alias($._end_tag_name, $.tag_name),
      '>',
    ),

    erroneous_end_tag: $ => seq(
      '</',
      $.erroneous_end_tag_name,
      '>',
    ),

    
    self_closing_tag: $ => seq(
      '<',
      alias($._start_tag_name, $.tag_name),
      repeat($.attribute),
      '/>',
    ),


    script_element: $ => seq(
      alias($.script_start_tag, $.start_tag),
      alias(repeat(choice(
        $._raw_text,
        $._jinja
      )), $.raw_text),
      $.end_tag,
    ),
    
    script_start_tag: $ => seq(
      '<',
      alias($._script_start_tag_name, $.tag_name),
      repeat($.attribute),
      '>',
    ),
    

    style_element: $ => seq(
      alias($.style_start_tag, $.start_tag),
      alias(repeat(choice(
        $._raw_text,
        $._jinja
      )), "raw_text"),
      $.end_tag,
    ),
    
    style_start_tag: $ => seq(
      '<',
      alias($._style_start_tag_name, $.tag_name),
      repeat($.attribute),
      '>',
    ),

    attribute: $ => seq(
      $.attribute_name,
      optional(seq(
        '=',
        choice(
          $.attribute_value,
          $.quoted_attribute_value,
        ),
      )),
    ),

    attribute_name: $ => choice(
      prec(-1, /[^<>"'/=\s\{]+/),
      prec(1, $._jinja)
    ),
    attribute_value: $ => choice(
      /[^<>"'=\s\{]+/,
      $._jinja
    ),


    quoted_attribute_value: $ => choice(
      seq('\'', alias(
        optional(repeat1(choice(
          /[^'\{]+/,
          // Handle single curly braces as text
          /\{/,
          // tree sitter will choose $._jinja rather than single \{, I don't know why,
          // but it works XD
          $._jinja
        ))),
        "attribute_value"
      ), '\''),
      seq('"', alias(
        optional(repeat1(choice(
          /[^"\{]+/,
          /\{/,
          $._jinja
        ))),
        "attribute_value"
      ), '"'),
    ),


    entity: _ => /&(#([xX][0-9a-fA-F]{1,6}|[0-9]{1,5})|[A-Za-z]{1,30});?/,
    
    // JinJa2 ==================================================================

    _jinja: $ => choice(
      $._jinja_statement,
      $.jinja_output,
      $.jinja_comment
    ),

    // Kept opaque only for unknown/custom tags.
    _jinja_expression_in_statement: () => repeat1(/[^\s\%\-\+]+|[\%\-\+]/),

    jinja_output: ($) =>
      seq("{{", alias(optional($._jinja_inner), $.expression), "}}"),

    // ---- Decomposed expression interior -----------------------------------
    // Flat token stream shared by {{ }}, {% %} expression parts, and line
    // statements. Whitespace is handled by `extras`, so no explicit ws tokens.
    _jinja_inner: $ => prec.right(repeat1($._jinja_expr_token)),

    _jinja_expr_token: $ => choice(
      $.jinja_test,
      $._jinja_kw,
      $.jinja_filter,
      $.jinja_string,
      $.jinja_number,
      $.jinja_boolean,
      $.jinja_none,
      $.jinja_attribute,
      $.jinja_identifier,
      $.jinja_operator
    ),

    // Any Jinja keyword appearing inside an expression or a line statement.
    // Aliased to "keyword" so it reuses the same highlight as statement
    // keywords.
    _jinja_kw: () => alias(choice(
      "for", "endfor", "if", "elif", "else", "endif", "in",
      "and", "or", "not", "set", "endset", "block", "endblock",
      "macro", "endmacro", "call", "endcall", "filter", "endfilter",
      "with", "endwith", "include", "import", "from", "extends", "as",
      "raw", "endraw", "do", "autoescape", "endautoescape",
      "scoped", "required", "recursive"
    ), "keyword"),

    jinja_filter: $ => seq("|", field("name", $.jinja_identifier)),

    // `is [not] <test>` — e.g. `is defined`, `is not none`, `is divisibleby(3)`.
    jinja_test: $ => seq(
      alias("is", "keyword"),
      optional(alias("not", "keyword")),
      field("name", $.jinja_identifier)
    ),

    // Attribute access as a standalone token so it works after anything:
    // `a.b`, `form.get('x').name`, `(a - b).days`, `foo()['k'].bar`.
    jinja_attribute: $ => seq(".", field("name", $.jinja_identifier)),

    jinja_identifier: () => /[a-zA-Z_][\w]*/,

    jinja_number: () => token(prec(1, /\d+(\.\d+)?/)),

    jinja_boolean: () => token(prec(2, choice("true", "false", "True", "False"))),

    jinja_none: () => token(prec(2, choice("none", "None", "null"))),

    // Symbol runs: arithmetic, comparison, grouping, assignment. The run
    // excludes `{ # % } ' " | . \s` so it never eats a closing delimiter, a
    // dotted access, or a filter pipe. Modulo `%` is a SEPARATE single-char
    // token (not part of the run) so that `]%}`/`)%}` lex as operator + `%}`,
    // while `%}` still beats a bare `%` by longest-match.
    jinja_operator: () => choice(token(/[^\w{#%}'"|\s.]+/), "%"),

    // ---- Line statements / line comments ----------------------------------
    jinja_line_statement: $ => seq(
      alias($._line_statement_marker, "jinja_statement_start"),
      optional($._jinja_inner),
      $._line_end
    ),

    jinja_line_comment: $ => $._line_comment,



    
    _jinja_statement: $ => choice(
      $.jinja_for_statement,
      $.jinja_if_statement,
      $.jinja_macro_statement,
      $.jinja_call_statement,
      $.jinja_filter_statement,
      $.jinja_assignment_statement,
      $.jinja_end_assignment_statement,
      $.jinja_extends_statement,
      $.jinja_block_statement,
      $.jinja_include_statement,
      $.jinja_import_statement,
      $.jinja_with_statement,
      $.jinja_raw_statement,
      $.jinja_custom_statement,
    ),

    jinja_for_statement: $ => seq(
      alias($.jinja_for_statement_start, $.start_statement),
      alias(repeat($._node), $.body),
      optional(alias($.jinja_for_else_statement, $.else_statement)),
      alias($.jinja_for_statement_end, $.end_statement)
    ),

    jinja_for_statement_start: $ => jinja_statement(
      "for", field("iteration", jinja_expression_in_statement($))
    ),

    jinja_for_statement_end: _ => jinja_statement("endfor"),

    jinja_for_else_statement: $ => seq(
      alias($.jinja_for_statement_else, $.statement),
      alias(repeat($._node), $.body),
    ),

    jinja_for_statement_else: _ => jinja_statement("else"),

    
    

    jinja_if_statement: $ => seq(
      alias($.jinja_if_statement_start, $.start_statement),
      alias(repeat(choice(
        $._node,
        $.single_element,
      )), $.body),
      repeat(alias($.jinja_if_elif_statement, $.elif_statement)),
      optional(alias($.jinja_if_else_statement, $.else_statement)),
      alias($.jinja_if_statement_end, $.end_statement)
    ),

    jinja_if_statement_start: $ => jinja_statement(
      "if", field("condition", jinja_expression_in_statement($))
    ),


    jinja_if_elif_statement: $ => seq(
      alias($.jinja_if_statement_elif, $.statement),
      alias(repeat(choice(
        $._node,
        $.single_element,
      )), $.body),
    ),

    jinja_if_statement_elif: $ => jinja_statement(
      "elif", field("condition", jinja_expression_in_statement($))
    ),
    
    jinja_if_else_statement: $ => seq(
      alias($.jinja_if_statement_else, $.statement),
      alias(repeat(choice(
        $._node,
        $.single_element,
      )), $.body),
    ),

    jinja_if_statement_else: _ => jinja_statement("else"),
    jinja_if_statement_end: _ => jinja_statement("endif"),


    
    
    jinja_macro_statement: $ => seq(
      alias($.jinja_macro_statement_start, $.start_statement),
      alias(repeat($._node), $.body),
      alias($.jinja_macro_statement_end, $.end_statement)
    ),

    jinja_macro_statement_start: $ => jinja_statement(
      "macro", field("signature", jinja_expression_in_statement($))
    ),

    jinja_macro_statement_end: _ => jinja_statement("endmacro"),


    
    jinja_call_statement: $ => seq(
      alias($.jinja_call_statement_start, $.start_statement),
      alias(repeat($._node), $.body),
      alias($.jinja_call_statement_end, $.end_statement),
    ),

    jinja_call_statement_start: $ => jinja_statement(
      "call", field("call", jinja_expression_in_statement($))
    ),

    jinja_call_statement_end: _ => jinja_statement("endcall"),


    
    jinja_filter_statement: $ => seq(
      alias($.jinja_filter_statement_start, $.start_statement),
      field("body", repeat($._node)),
      alias($.jinja_filter_statement_end, $.end_statement),
    ),

    jinja_filter_statement_start: $ => jinja_statement(
      "filter", field("code", jinja_expression_in_statement($))
    ),

    jinja_filter_statement_end: _ => jinja_statement("endfilter"),


    
    jinja_assignment_statement: $ => jinja_statement(
      "set", field("code", jinja_expression_in_statement($))
    ),

    jinja_end_assignment_statement: $ => jinja_statement("endset"),

    jinja_extends_statement: $ => jinja_statement(
      "extends", jinja_expression_in_statement($)
    ),


    
    jinja_block_statement: $ => seq(
      alias($.jinja_block_statement_start, $.start_statement),
      field("body", repeat($._node)),
      alias($.jinja_block_statement_end, $.end_statement),
    ),

    jinja_block_statement_start: $ => jinja_statement(
      "block",
      field("id", $.jinja_identifier),
      optional(jinja_keyword("scoped")),
      optional(jinja_keyword("required")),
    ),

    jinja_block_statement_end: $ => jinja_statement(
      "endblock", 
      optional($.jinja_identifier)
    ),

    

    jinja_include_statement: $ => jinja_statement(
      "include",
      choice($.jinja_string, $.jinja_identifier),
      optional(alias("ignore missing", "_keyword")),
      optional(jinja_context_specifier()),
    ),

    jinja_import_statement: $ => choice(
      jinja_statement(
        "import",
        field("id", $.jinja_string),
        alias("as", "_keyword"),
        $.jinja_identifier,
        optional(jinja_context_specifier()),
      ),
      jinja_statement(
        "from",
        field("id", $.jinja_string),
        jinja_keyword("import"),
        sep1(
          choice(
            $.jinja_identifier,
            seq($.jinja_identifier, jinja_keyword("as"), $.jinja_identifier),
          ),
          ",",
        ),
        optional(jinja_context_specifier()),
      ),
    ),

    
    jinja_with_statement: $ => seq(
      alias($.jinja_with_statement_start, $.start_statement),
      alias(repeat($._node), $.body),
      alias($.jinja_with_statement_end, $.end_statement),
    ),

    jinja_with_statement_start: $ => jinja_statement(
      "with",
      optional(field("assignment", jinja_expression_in_statement($))),
    ),

    jinja_with_statement_end: _ => jinja_statement("endwith"),
    
    

    jinja_raw_statement: $ => seq(
      alias($.jinja_raw_statement_start, $.start_statement),
      field("body", repeat($._html_node)),
      alias($.jinja_raw_statement_end, $.end_statement),
    ),

    jinja_raw_statement_start: _ => jinja_statement("raw"),

    jinja_raw_statement_end: _ => jinja_statement("endraw"),


    
    // dynamic prec -1 to not mess up with multiple elif
    jinja_custom_statement: $ => prec.dynamic(-1, seq(
      jinja_statement_start(),
      alias($._jinja_expression_in_statement, $.jinja_custom_tag),
      jinja_statement_end(),
    )),


    
    jinja_identifier: () => /[\w]+/,

    jinja_string: () => choice(seq(`"`, /[^\"]*/, `"`), seq(`'`, /[^\']*/, `'`)),
    
    jinja_comment: () => seq("{#", repeat(/[^\#]+|[\#]/), "#}"),

    

    // Common ==================================================================
    text: _ => prec.right(
      repeat1(
        choice(
          // Single open brace with low precedence (similar to Jinja2 rule)
          token(prec(-1, /\{/)),
        
          // Text content that respects both HTML and Jinja2 special characters
          token(prec(1, /[^<>&\s\{][^<>&\{]*[^<>&\s\{]?/)),
        )
      ),
    ),
  }
});
