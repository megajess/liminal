// ============================================================
// Liminal Token Types
// ============================================================

export enum TokenType {
  // Delimiters
  LeftParen = "LeftParen",     // (
  RightParen = "RightParen",    // )
  LeftBracket = "LeftBracket",   // [
  RightBracket = "RightBracket",  // ]

  // Literals
  Number = "Number",
  String = "String",
  Boolean = "Boolean",
  Nil = "Nil",

  // Identifiers & Keywords
  Symbol = "Symbol",
  Keyword = "Keyword",       // :keyword

  // Type annotation
  TypeColon = "TypeColon",     // : in name: Type (trailing space — declaration context)
  Colon = "Colon",             // : in obj:prop (no spaces — property access)
  QuestionMark = "QuestionMark",  // ? in Type?

  // Special forms
  Const = "Const",
  Var = "Var",
  Func = "Func",
  Local = "Local",
  If = "If",
  Cond = "Cond",
  Do = "Do",
  Set = "Set",
  Import = "Import",
  Async = "Async",
  Await = "Await",
  Try = "Try",
  Catch = "Catch",
  Finally = "Finally",
  Macro = "Macro",
  Mutate = "Mutate",         // REPL-only force-reassign of const

  // Nil operators
  NilCoalesce = "NilCoalesce",   // ??
  NilUnwrap = "NilUnwrap",     // ?

  // Namespace separator
  Slash = "Slash",           // /

  // Interop
  Interop = "Interop",       // %

  // Interpolated strings
  InterpolatedStringStart = "InterpolatedStringStart",  // opening " — value is text before first {
  InterpolatedStringPart = "InterpolatedStringPart",    // literal segment between expressions
  InterpolatedStringEnd = "InterpolatedStringEnd",      // closing " — value is text after last }

  // Quasiquoting
  QuasiQuote = "QuasiQuote",    // `
  Unquote = "Unquote",       // ~
  UnquoteSplice = "UnquoteSplice",// ~@

  // Meta
  EOF = "EOF",
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}