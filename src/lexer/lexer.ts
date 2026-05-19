import { Token, TokenType } from "./tokens";

export class LexerError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number
  ) {
    super(`${line}:${column} — ${message}`);
    this.name = "LexerError";
  }
}

const SPECIAL_FORMS: Record<string, TokenType> = {
  const: TokenType.Const,
  var: TokenType.Var,
  func: TokenType.Func,
  local: TokenType.Local,
  if: TokenType.If,
  do: TokenType.Do,
  set: TokenType.Set,
  async: TokenType.Async,
  await: TokenType.Await,
  try: TokenType.Try,
  catch: TokenType.Catch,
  finally: TokenType.Finally,
  macro: TokenType.Macro,
};

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isAlpha(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

// Valid symbol start: letter, _, +, *, -
function isSymbolStart(ch: string): boolean {
  return isAlpha(ch) || ch === "_" || ch === "+" || ch === "*" || ch === "-";
}

// Valid symbol continuation: letter, digit, _, +, *, -
function isSymbolContinue(ch: string): boolean {
  return isAlpha(ch) || isDigit(ch) || ch === "_" || ch === "+" || ch === "*" || ch === "-";
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\r" || ch === "\n";
}

export class Lexer {
  private source: string;
  private pos = 0;
  private line = 1;
  private col = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      this.skipWhitespaceAndComments();
      if (this.pos >= this.source.length) break;
      this.scanToken();
    }
    this.emit(TokenType.EOF, "", this.line, this.col);
    return this.tokens;
  }

  private peek(offset = 0): string {
    const idx = this.pos + offset;
    return idx < this.source.length ? this.source[idx] : "";
  }

  private advance(): string {
    const ch = this.source[this.pos++];
    if (ch === "\n") {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  private emit(type: TokenType, value: string, l: number, c: number): void {
    this.tokens.push({ type, value, line: l, column: c });
  }

  private error(msg: string, l: number, c: number): never {
    throw new LexerError(msg, l, c);
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (isWhitespace(ch)) {
        this.advance();
      } else if (ch === ";") {
        while (this.pos < this.source.length && this.peek() !== "\n") {
          this.advance();
        }
      } else {
        break;
      }
    }
  }

  private scanToken(): void {
    const l = this.line, c = this.col;
    const ch = this.peek();

    if (ch === "(") { this.advance(); this.emit(TokenType.LeftParen, "(", l, c); return; }
    if (ch === ")") { this.advance(); this.emit(TokenType.RightParen, ")", l, c); return; }
    if (ch === "[") { this.advance(); this.emit(TokenType.LeftBracket, "[", l, c); return; }
    if (ch === "]") { this.advance(); this.emit(TokenType.RightBracket, "]", l, c); return; }
    if (ch === "/") { this.advance(); this.emit(TokenType.Slash, "/", l, c); return; }
    if (ch === "%") { this.advance(); this.emit(TokenType.Interop, "%", l, c); return; }
    if (ch === "`") { this.advance(); this.emit(TokenType.QuasiQuote, "`", l, c); return; }

    if (ch === "~") {
      this.advance();
      if (this.peek() === "@") {
        this.advance();
        this.emit(TokenType.UnquoteSplice, "~@", l, c);
      } else {
        this.emit(TokenType.Unquote, "~", l, c);
      }
      return;
    }

    if (ch === "?") {
      if (this.peek(1) === "?") {
        this.advance(); this.advance();
        this.emit(TokenType.NilCoalesce, "??", l, c);
      } else {
        this.advance();
        this.emit(TokenType.NilUnwrap, "?", l, c);
      }
      return;
    }

    if (ch === ":") {
      this.scanKeyword(l, c);
      return;
    }

    if (ch === '"') {
      this.scanString(l, c);
      return;
    }

    if (isDigit(ch)) {
      this.scanNumber(l, c);
      return;
    }

    // Negative number literal: - immediately followed by a digit
    if (ch === "-" && isDigit(this.peek(1))) {
      this.scanNumber(l, c);
      return;
    }

    if (isSymbolStart(ch)) {
      this.scanSymbol(l, c);
      return;
    }

    this.error(`Unexpected character: '${ch}'`, l, c);
  }

  private scanKeyword(startLine: number, startCol: number): void {
    this.advance(); // consume :
    let name = "";
    while (this.pos < this.source.length && isSymbolContinue(this.peek())) {
      name += this.advance();
    }
    if (name.length === 0) {
      this.error("Expected keyword name after ':'", startLine, startCol);
    }
    this.emit(TokenType.Keyword, ":" + name, startLine, startCol);
  }

  private scanNumber(startLine: number, startCol: number): void {
    let value = "";
    if (this.peek() === "-") value += this.advance();
    while (this.pos < this.source.length && isDigit(this.peek())) {
      value += this.advance();
    }
    // Optional decimal part
    if (this.peek() === "." && isDigit(this.peek(1))) {
      value += this.advance(); // consume .
      while (this.pos < this.source.length && isDigit(this.peek())) {
        value += this.advance();
      }
    }
    this.emit(TokenType.Number, value, startLine, startCol);
  }

  private scanString(startLine: number, startCol: number): void {
    this.advance(); // consume opening "

    // Peek ahead to detect whether this string contains interpolation
    let hasInterpolation = false;
    for (let i = this.pos; i < this.source.length && this.source[i] !== '"'; i++) {
      if (this.source[i] === "\\") { i++; continue; } // skip escaped char
      if (this.source[i] === "{") { hasInterpolation = true; break; }
    }

    if (!hasInterpolation) {
      let value = "";
      while (this.pos < this.source.length && this.peek() !== '"') {
        value += this.readStringChar();
      }
      if (this.pos >= this.source.length) {
        this.error("Unterminated string", startLine, startCol);
      }
      this.advance(); // consume closing "
      this.emit(TokenType.String, value, startLine, startCol);
    } else {
      this.scanInterpolatedString(startLine, startCol);
    }
  }

  private readStringChar(): string {
    if (this.peek() === "\\") {
      this.advance(); // consume backslash
      const esc = this.advance();
      switch (esc) {
        case "n": return "\n";
        case "t": return "\t";
        case '"': return '"';
        case "{": return "{"; // escaped { in interpolated strings
        case "\\": return "\\";
        default: return "\\" + esc;
      }
    }
    return this.advance();
  }

  private scanInterpolatedString(startLine: number, startCol: number): void {
    let isFirst = true;
    let partValue = "";
    let partLine = this.line, partCol = this.col;

    while (this.pos < this.source.length && this.peek() !== '"') {
      if (this.peek() === "{") {
        if (isFirst) {
          this.emit(TokenType.InterpolatedStringStart, partValue, startLine, startCol);
          isFirst = false;
        } else {
          this.emit(TokenType.InterpolatedStringPart, partValue, partLine, partCol);
        }
        this.advance(); // consume {

        // Collect and re-lex the inner expression
        const innerSource = this.collectUntilClosingBrace();
        const innerTokens = new Lexer(innerSource).tokenize();
        innerTokens.pop(); // discard inner EOF
        this.tokens.push(...innerTokens);

        partValue = "";
        partLine = this.line;
        partCol = this.col;
      } else {
        partValue += this.readStringChar();
      }
    }

    if (this.pos >= this.source.length) {
      this.error("Unterminated string", startLine, startCol);
    }
    this.advance(); // consume closing "
    this.emit(TokenType.InterpolatedStringEnd, partValue, partLine, partCol);
  }

  // Collects source text up to (but not including) the matching }, handling nesting.
  private collectUntilClosingBrace(): string {
    let inner = "";
    let depth = 1;
    while (this.pos < this.source.length && depth > 0) {
      const ch = this.peek();
      if (ch === "{") {
        depth++;
        inner += this.advance();
      } else if (ch === "}") {
        depth--;
        if (depth > 0) inner += this.advance();
        else this.advance(); // consume the closing } without adding it
      } else if (ch === '"') {
        // String literal inside the interpolation — pass through as-is
        inner += this.advance(); // opening "
        while (this.pos < this.source.length && this.peek() !== '"') {
          if (this.peek() === "\\") {
            inner += this.advance();
            if (this.pos < this.source.length) inner += this.advance();
          } else {
            inner += this.advance();
          }
        }
        if (this.pos < this.source.length) inner += this.advance(); // closing "
      } else {
        inner += this.advance();
      }
    }
    return inner;
  }

  private scanSymbol(startLine: number, startCol: number): void {
    let name = "";

    while (this.pos < this.source.length) {
      const ch = this.peek();

      if (isSymbolContinue(ch)) {
        name += this.advance();
      } else if (ch === ":") {
        // Determine if this is a TypeColon (name: Type) or Colon (obj:prop)
        const afterColon = this.peek(1);
        const colonLine = this.line, colonCol = this.col + name.length; // approx; startCol used below
        this.emitSymbolToken(name, startLine, startCol);

        const cl = this.line, cc = this.col;
        this.advance(); // consume :

        if (isWhitespace(afterColon) || afterColon === "" || afterColon === ")" || afterColon === "]") {
          this.emit(TokenType.TypeColon, ":", cl, cc);
        } else {
          this.emit(TokenType.Colon, ":", cl, cc);
        }
        return;
      } else if (ch === "?") {
        // Optional type suffix: Int?
        this.emitSymbolToken(name, startLine, startCol);
        const ql = this.line, qc = this.col;
        this.advance(); // consume ?
        this.emit(TokenType.QuestionMark, "?", ql, qc);
        return;
      } else {
        break;
      }
    }

    if (name.length > 0) {
      this.emitSymbolToken(name, startLine, startCol);
    }
  }

  private emitSymbolToken(name: string, l: number, c: number): void {
    if (name in SPECIAL_FORMS) {
      this.emit(SPECIAL_FORMS[name], name, l, c);
    } else if (name === "true" || name === "false") {
      this.emit(TokenType.Boolean, name, l, c);
    } else if (name === "nil") {
      this.emit(TokenType.Nil, name, l, c);
    } else {
      this.emit(TokenType.Symbol, name, l, c);
    }
  }
}

export function tokenize(source: string): Token[] {
  return new Lexer(source).tokenize();
}
