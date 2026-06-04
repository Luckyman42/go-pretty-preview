/**
 * Go highlight query, adapted from tree-sitter-go's `queries/highlights.scm`.
 * Inlined as a string so it bundles with the extension (no runtime file IO).
 *
 * Capture names map to `tok-<name>` CSS classes (dots → dashes), e.g.
 * `@function.method` → `tok-function-method`. See media/preview.css for the
 * two hand-tuned palettes (dark / light).
 */
export const GO_HIGHLIGHTS_SCM = String.raw`
; Function calls
(call_expression
  function: (identifier) @function)

(call_expression
  function: (identifier) @function.builtin
  (#match? @function.builtin "^(append|cap|close|complex|copy|delete|imag|len|make|new|panic|print|println|real|recover)$"))

(call_expression
  function: (selector_expression
    field: (field_identifier) @function.method))

; Function definitions
(function_declaration
  name: (identifier) @function)

(method_declaration
  name: (field_identifier) @function.method)

; Identifiers
(type_identifier) @type
(field_identifier) @property
(package_identifier) @namespace
(identifier) @variable

; Operators
[
  "--" "-" "-=" ":=" "!" "!=" "..." "*" "*=" "/" "/=" "&" "&&" "&=" "%" "%="
  "^" "^=" "+" "++" "+=" "<-" "<" "<<" "<<=" "<=" "=" "==" ">" ">=" ">>" ">>="
  "|" "|=" "||" "~"
] @operator

; Keywords
[
  "break" "case" "chan" "const" "continue" "default" "defer" "else"
  "fallthrough" "for" "func" "go" "goto" "if" "import" "interface" "map"
  "package" "range" "return" "select" "struct" "switch" "type" "var"
] @keyword

; Literals
[
  (interpreted_string_literal)
  (raw_string_literal)
  (rune_literal)
] @string

(escape_sequence) @escape

[
  (int_literal)
  (float_literal)
  (imaginary_literal)
] @number

[
  (true)
  (false)
  (nil)
  (iota)
] @constant.builtin

(comment) @comment
`;
