import { tokenize, LexerError } from "./lexer";
import { Token, TokenType } from "./tokens";

// Strip EOF and return just the meaningful tokens
function lex(source: string): Token[] {
  const tokens = tokenize(source);
  return tokens.slice(0, -1);
}

function types(source: string): TokenType[] {
  return lex(source).map((t) => t.type);
}

function values(source: string): string[] {
  return lex(source).map((t) => t.value);
}

// --- Delimiters ---

test("parens and brackets", () => {
  expect(types("( ) [ ]")).toEqual([
    TokenType.LeftParen,
    TokenType.RightParen,
    TokenType.LeftBracket,
    TokenType.RightBracket,
  ]);
});

// --- Numbers ---

test("integer", () => {
  expect(lex("42")).toEqual([{ type: TokenType.Number, value: "42", line: 1, column: 1 }]);
});

test("float", () => {
  expect(lex("3.14")[0]).toMatchObject({ type: TokenType.Number, value: "3.14" });
});

test("negative integer", () => {
  expect(lex("-7")[0]).toMatchObject({ type: TokenType.Number, value: "-7" });
});

test("negative float", () => {
  expect(lex("-1.5")[0]).toMatchObject({ type: TokenType.Number, value: "-1.5" });
});

test("standalone - is a symbol, not a negative number", () => {
  expect(lex("-")[0]).toMatchObject({ type: TokenType.Symbol, value: "-" });
});

test("- followed by non-digit is a symbol", () => {
  expect(lex("-x")[0]).toMatchObject({ type: TokenType.Symbol, value: "-x" });
});

// --- Strings ---

test("plain string", () => {
  expect(lex('"hello"')[0]).toMatchObject({ type: TokenType.String, value: "hello" });
});

test("string with escape sequences", () => {
  expect(lex('"line1\\nline2"')[0]).toMatchObject({ type: TokenType.String, value: "line1\nline2" });
});

test("empty string", () => {
  expect(lex('""')[0]).toMatchObject({ type: TokenType.String, value: "" });
});

// --- Interpolated strings ---

test("interpolated string: single expression", () => {
  const tokens = lex('"Hello {name}"');
  expect(tokens[0]).toMatchObject({ type: TokenType.InterpolatedStringStart, value: "Hello " });
  expect(tokens[1]).toMatchObject({ type: TokenType.Symbol, value: "name" });
  expect(tokens[2]).toMatchObject({ type: TokenType.InterpolatedStringEnd, value: "" });
});

test("interpolated string: multiple expressions", () => {
  const tokens = lex('"Hello {first} {last}"');
  expect(tokens[0]).toMatchObject({ type: TokenType.InterpolatedStringStart, value: "Hello " });
  expect(tokens[1]).toMatchObject({ type: TokenType.Symbol, value: "first" });
  expect(tokens[2]).toMatchObject({ type: TokenType.InterpolatedStringPart, value: " " });
  expect(tokens[3]).toMatchObject({ type: TokenType.Symbol, value: "last" });
  expect(tokens[4]).toMatchObject({ type: TokenType.InterpolatedStringEnd, value: "" });
});

test("interpolated string: expression at start", () => {
  const tokens = lex('"{name} wins"');
  expect(tokens[0]).toMatchObject({ type: TokenType.InterpolatedStringStart, value: "" });
  expect(tokens[1]).toMatchObject({ type: TokenType.Symbol, value: "name" });
  expect(tokens[2]).toMatchObject({ type: TokenType.InterpolatedStringEnd, value: " wins" });
});

test("interpolated string: complex inner expression", () => {
  const tokens = lex('"Result: {(+ a b)}"');
  expect(tokens[0]).toMatchObject({ type: TokenType.InterpolatedStringStart, value: "Result: " });
  expect(tokens[1]).toMatchObject({ type: TokenType.LeftParen });
  expect(tokens[2]).toMatchObject({ type: TokenType.Symbol, value: "+" });
  expect(tokens[3]).toMatchObject({ type: TokenType.Symbol, value: "a" });
  expect(tokens[4]).toMatchObject({ type: TokenType.Symbol, value: "b" });
  expect(tokens[5]).toMatchObject({ type: TokenType.RightParen });
  expect(tokens[6]).toMatchObject({ type: TokenType.InterpolatedStringEnd, value: "" });
});

test("escaped { in string is not interpolation", () => {
  expect(lex('"price: \\{0}"')[0]).toMatchObject({ type: TokenType.String, value: "price: {0}" });
});

// --- Booleans and nil ---

test("true", () => {
  expect(lex("true")[0]).toMatchObject({ type: TokenType.Boolean, value: "true" });
});

test("false", () => {
  expect(lex("false")[0]).toMatchObject({ type: TokenType.Boolean, value: "false" });
});

test("nil", () => {
  expect(lex("nil")[0]).toMatchObject({ type: TokenType.Nil, value: "nil" });
});

// --- Keywords ---

test("keyword atom :else", () => {
  expect(lex(":else")[0]).toMatchObject({ type: TokenType.Keyword, value: ":else" });
});

test("keyword :from", () => {
  expect(lex(":from")[0]).toMatchObject({ type: TokenType.Keyword, value: ":from" });
});

test("multiple keywords", () => {
  expect(types(":a :b :c")).toEqual([TokenType.Keyword, TokenType.Keyword, TokenType.Keyword]);
  expect(values(":a :b :c")).toEqual([":a", ":b", ":c"]);
});

// --- Colon disambiguation ---

test("TypeColon: name followed by colon and space", () => {
  const tokens = lex("counter: Int");
  expect(tokens[0]).toMatchObject({ type: TokenType.Symbol, value: "counter" });
  expect(tokens[1]).toMatchObject({ type: TokenType.TypeColon, value: ":" });
  expect(tokens[2]).toMatchObject({ type: TokenType.Symbol, value: "Int" });
});

test("Colon: property access with no spaces", () => {
  const tokens = lex("err:message");
  expect(tokens[0]).toMatchObject({ type: TokenType.Symbol, value: "err" });
  expect(tokens[1]).toMatchObject({ type: TokenType.Colon, value: ":" });
  expect(tokens[2]).toMatchObject({ type: TokenType.Symbol, value: "message" });
});

test("Colon: chained property access", () => {
  const tokens = lex("err:stack:frames");
  expect(tokens[0]).toMatchObject({ type: TokenType.Symbol, value: "err" });
  expect(tokens[1]).toMatchObject({ type: TokenType.Colon });
  expect(tokens[2]).toMatchObject({ type: TokenType.Symbol, value: "stack" });
  expect(tokens[3]).toMatchObject({ type: TokenType.Colon });
  expect(tokens[4]).toMatchObject({ type: TokenType.Symbol, value: "frames" });
});

test("TypeColon: colon at end of input treated as TypeColon", () => {
  const tokens = lex("x:");
  expect(tokens[0]).toMatchObject({ type: TokenType.Symbol, value: "x" });
  expect(tokens[1]).toMatchObject({ type: TokenType.TypeColon });
});

// --- QuestionMark (optional type suffix) ---

test("QuestionMark: optional type suffix", () => {
  const tokens = lex("Int?");
  expect(tokens[0]).toMatchObject({ type: TokenType.Symbol, value: "Int" });
  expect(tokens[1]).toMatchObject({ type: TokenType.QuestionMark, value: "?" });
});

// --- NilUnwrap and NilCoalesce ---

test("NilCoalesce: ??", () => {
  expect(lex("??")[0]).toMatchObject({ type: TokenType.NilCoalesce, value: "??" });
});

test("NilUnwrap: standalone ?", () => {
  expect(lex("?")[0]).toMatchObject({ type: TokenType.NilUnwrap, value: "?" });
});

// --- Interop and Slash ---

test("interop %", () => {
  expect(lex("%")[0]).toMatchObject({ type: TokenType.Interop, value: "%" });
});

test("slash /", () => {
  expect(lex("/")[0]).toMatchObject({ type: TokenType.Slash, value: "/" });
});

test("namespace call tokens: utils/helper", () => {
  const tokens = lex("utils/helper");
  expect(tokens[0]).toMatchObject({ type: TokenType.Symbol, value: "utils" });
  expect(tokens[1]).toMatchObject({ type: TokenType.Slash });
  expect(tokens[2]).toMatchObject({ type: TokenType.Symbol, value: "helper" });
});

test("interop namespace call: %marked/parse", () => {
  const tokens = lex("%marked/parse");
  expect(tokens[0]).toMatchObject({ type: TokenType.Interop });
  expect(tokens[1]).toMatchObject({ type: TokenType.Symbol, value: "marked" });
  expect(tokens[2]).toMatchObject({ type: TokenType.Slash });
  expect(tokens[3]).toMatchObject({ type: TokenType.Symbol, value: "parse" });
});

// --- Special forms ---

test("special form tokens", () => {
  expect(types("const var func local if do set async await try catch finally macro")).toEqual([
    TokenType.Const,
    TokenType.Var,
    TokenType.Func,
    TokenType.Local,
    TokenType.If,
    TokenType.Do,
    TokenType.Set,
    TokenType.Async,
    TokenType.Await,
    TokenType.Try,
    TokenType.Catch,
    TokenType.Finally,
    TokenType.Macro,
  ]);
});

// --- Quasiquoting ---

test("quasiquote, unquote, unquote-splice", () => {
  const tokens = lex("` ~ ~@");
  expect(tokens[0]).toMatchObject({ type: TokenType.QuasiQuote });
  expect(tokens[1]).toMatchObject({ type: TokenType.Unquote });
  expect(tokens[2]).toMatchObject({ type: TokenType.UnquoteSplice });
});

// --- Whitespace and comments ---

test("whitespace is skipped", () => {
  expect(lex("  42  ")[0]).toMatchObject({ type: TokenType.Number, value: "42" });
});

test("line comments are skipped", () => {
  const tokens = lex("42 ; this is a comment\n99");
  expect(tokens).toHaveLength(2);
  expect(tokens[0]).toMatchObject({ value: "42" });
  expect(tokens[1]).toMatchObject({ value: "99" });
});

// --- Source locations ---

test("tracks column positions", () => {
  const tokens = lex("(+ 1 2)");
  expect(tokens[0]).toMatchObject({ type: TokenType.LeftParen, line: 1, column: 1 });
  expect(tokens[1]).toMatchObject({ type: TokenType.Symbol, value: "+", line: 1, column: 2 });
  expect(tokens[4]).toMatchObject({ type: TokenType.RightParen, line: 1, column: 7 });
});

test("tracks line numbers across newlines", () => {
  const tokens = lex("a\nb");
  expect(tokens[0]).toMatchObject({ line: 1, column: 1 });
  expect(tokens[1]).toMatchObject({ line: 2, column: 1 });
});

// --- Full expression examples ---

test("const declaration", () => {
  const tokens = lex('(const name: String "John")');
  expect(tokens[0]).toMatchObject({ type: TokenType.LeftParen });
  expect(tokens[1]).toMatchObject({ type: TokenType.Const });
  expect(tokens[2]).toMatchObject({ type: TokenType.Symbol, value: "name" });
  expect(tokens[3]).toMatchObject({ type: TokenType.TypeColon });
  expect(tokens[4]).toMatchObject({ type: TokenType.Symbol, value: "String" });
  expect(tokens[5]).toMatchObject({ type: TokenType.String, value: "John" });
  expect(tokens[6]).toMatchObject({ type: TokenType.RightParen });
});

test("func declaration with params", () => {
  const tokens = lex("(func add: Int [a: Int b: Int] (+ a b))");
  expect(tokens[1]).toMatchObject({ type: TokenType.Func });
  expect(tokens[2]).toMatchObject({ type: TokenType.Symbol, value: "add" });
  expect(tokens[3]).toMatchObject({ type: TokenType.TypeColon });
  expect(tokens[4]).toMatchObject({ type: TokenType.Symbol, value: "Int" });
  expect(tokens[5]).toMatchObject({ type: TokenType.LeftBracket });
});

test("var declaration with optional type", () => {
  const tokens = lex("(var x: Int? nil)");
  expect(tokens[2]).toMatchObject({ type: TokenType.Symbol, value: "x" });
  expect(tokens[3]).toMatchObject({ type: TokenType.TypeColon });
  expect(tokens[4]).toMatchObject({ type: TokenType.Symbol, value: "Int" });
  expect(tokens[5]).toMatchObject({ type: TokenType.QuestionMark });
  expect(tokens[6]).toMatchObject({ type: TokenType.Nil });
});

test("if expression with :else", () => {
  const tokens = lex("(if cond a :else b)");
  expect(tokens[1]).toMatchObject({ type: TokenType.If });
  expect(tokens[4]).toMatchObject({ type: TokenType.Keyword, value: ":else" });
});

test("interop property chain: %process:env:NODE_ENV", () => {
  const tokens = lex("%process:env:NODE_ENV");
  expect(tokens[0]).toMatchObject({ type: TokenType.Interop });
  expect(tokens[1]).toMatchObject({ type: TokenType.Symbol, value: "process" });
  expect(tokens[2]).toMatchObject({ type: TokenType.Colon });
  expect(tokens[3]).toMatchObject({ type: TokenType.Symbol, value: "env" });
  expect(tokens[4]).toMatchObject({ type: TokenType.Colon });
  expect(tokens[5]).toMatchObject({ type: TokenType.Symbol, value: "NODE_ENV" });
});

test("nil coalesce expression", () => {
  const tokens = lex("(?? myNum 0)");
  expect(tokens[1]).toMatchObject({ type: TokenType.NilCoalesce });
});

test("async func declaration", () => {
  const tokens = lex("(async func read-file: String [path: String])");
  expect(tokens[1]).toMatchObject({ type: TokenType.Async });
  expect(tokens[2]).toMatchObject({ type: TokenType.Func });
  expect(tokens[3]).toMatchObject({ type: TokenType.Symbol, value: "read-file" });
});

test("hyphenated symbol", () => {
  expect(lex("my-var")[0]).toMatchObject({ type: TokenType.Symbol, value: "my-var" });
});

// --- Error cases ---

test("unexpected character throws LexerError", () => {
  expect(() => tokenize("@foo")).toThrow(LexerError);
});

test("unterminated string throws LexerError", () => {
  expect(() => tokenize('"hello')).toThrow(LexerError);
});

test("bare colon throws LexerError", () => {
  expect(() => tokenize(": ")).toThrow(LexerError);
});
