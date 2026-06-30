export function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}

export function jinja_statement_start() {
  return alias(/\{\%[\+\-]?/, "jinja_statement_start");
}

export function jinja_statement_end() {
  return alias(/[\+\-]?\%\}/, "jinja_statement_end");
}

/**
 * Matches something like `{% <kw> ...rest %}`
 */
export function jinja_statement(kw, ...rest) {
  return seq(jinja_statement_start(), jinja_keyword(kw), ...rest, jinja_statement_end());
}


/**
 * The expression part of a statement / output, decomposed into a flat token
 * stream (identifiers, filters, operators, literals, keywords) so it can be
 * highlighted. Aliased to `expression` to keep the public node name stable.
 */
export function jinja_expression_in_statement($) {
  return alias($._jinja_inner, $.expression);
}

export function jinja_keyword(kw) {
  return alias(token(kw), "keyword");
}

export function jinja_context_specifier() {
  return choice(jinja_keyword("with context"), jinja_keyword("without context"));
}
