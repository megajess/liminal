import { Token, TokenType } from "../lexer/tokens";
import {
  ASTNode,
  Program,
  TypeAnnotation,
  FuncParam,
  CondClause,
  StringSegment,
} from "../ast/types";

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number
  ) {
    super(`${line}:${column} — ${message}`);
    this.name = "ParseError";
  }
}

export class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Program {
    const body: ASTNode[] = [];
    while (!this.check(TokenType.EOF)) {
      body.push(this.parseExpr());
    }
    return { type: "Program", body };
  }

  // --- Token navigation ---

  private peek(offset = 0): Token {
    const idx = this.pos + offset;
    return idx < this.tokens.length
      ? this.tokens[idx]
      : this.tokens[this.tokens.length - 1]; // EOF
  }

  private advance(): Token {
    const tok = this.tokens[this.pos];
    if (tok.type !== TokenType.EOF) this.pos++;
    return tok;
  }

  private check(type: TokenType, offset = 0): boolean {
    return this.peek(offset).type === type;
  }

  private expect(type: TokenType): Token {
    if (!this.check(type)) {
      const tok = this.peek();
      throw new ParseError(
        `Expected ${type} but got ${tok.type} ('${tok.value}')`,
        tok.line,
        tok.column
      );
    }
    return this.advance();
  }

  private error(msg: string, tok = this.peek()): never {
    throw new ParseError(msg, tok.line, tok.column);
  }

  // --- Top-level expression dispatch ---

  private parseExpr(): ASTNode {
    const tok = this.peek();
    let node: ASTNode;

    // Interpolated string — reassemble from lexer segments
    if (tok.type === TokenType.InterpolatedStringStart) {
      node = this.parseInterpolatedString();

    // Interop expression: %symbol — chains its own Colon/Slash internally
    } else if (tok.type === TokenType.Interop) {
      return this.parseInteropExpr();

    // Quasiquoting — early return, no trailing member chain expected
    } else if (tok.type === TokenType.QuasiQuote) {
      this.advance();
      return { type: "QuasiQuote", expression: this.parseExpr(), loc: tok };
    } else if (tok.type === TokenType.Unquote) {
      this.advance();
      return { type: "Unquote", expression: this.parseExpr(), loc: tok };
    } else if (tok.type === TokenType.UnquoteSplice) {
      this.advance();
      return { type: "UnquoteSplice", expression: this.parseExpr(), loc: tok };

    // List form: ( ... )
    } else if (tok.type === TokenType.LeftParen) {
      node = this.parseList();

    // Atoms and base expressions
    } else {
      node = this.parseAtomBase();
    }

    // Unified Colon member access chaining — applies after any expression form.
    // Handles: symbol:prop, (expr):result, "str":length, tuple:0, etc.
    while (this.check(TokenType.Colon)) {
      const colon = this.advance();
      let member: string;
      if (this.check(TokenType.Symbol)) {
        member = this.advance().value;
      } else if (this.check(TokenType.Number)) {
        // Numeric index access for tuples: t:0, t:1, etc.
        member = String(Number(this.advance().value));
      } else {
        this.error(`Expected member name after ':'`);
      }
      node = {
        type: "MemberAccess",
        object: node,
        member,
        loc: { line: colon.line, column: colon.column },
      };
    }

    return node;
  }

  private parseAtomBase(): ASTNode {
    const tok = this.peek();

    if (tok.type === TokenType.Number) {
      this.advance();
      return { type: "NumberLiteral", value: Number(tok.value), loc: { line: tok.line, column: tok.column } };
    }
    if (tok.type === TokenType.String) {
      this.advance();
      return { type: "StringLiteral", value: tok.value, loc: { line: tok.line, column: tok.column } };
    }
    if (tok.type === TokenType.Boolean) {
      this.advance();
      return { type: "BooleanLiteral", value: tok.value === "true", loc: { line: tok.line, column: tok.column } };
    }
    if (tok.type === TokenType.Nil) {
      this.advance();
      // nil? is a predicate function name, not the nil literal
      if (this.check(TokenType.QuestionMark)) {
        this.advance();
        return { type: "Symbol", name: "nil?", loc: { line: tok.line, column: tok.column } };
      }
      return { type: "NilLiteral", trace: null, loc: { line: tok.line, column: tok.column } };
    }
    if (tok.type === TokenType.Keyword) {
      this.advance();
      return { type: "Symbol", name: tok.value, loc: { line: tok.line, column: tok.column } };
    }
    if (tok.type === TokenType.Symbol) {
      const t = this.advance();
      // Allow ? suffix on symbol names: nil?, number?, etc.
      let name = t.value;
      if (this.check(TokenType.QuestionMark)) {
        this.advance();
        name += "?";
      }
      return { type: "Symbol", name, loc: { line: t.line, column: t.column } };
    }

    this.error(`Unexpected token: ${tok.type} ('${tok.value}')`);
  }

  // --- Interpolated string ---

  private parseInterpolatedString(): ASTNode {
    const start = this.expect(TokenType.InterpolatedStringStart);
    const segments: StringSegment[] = [];

    if (start.value.length > 0) {
      segments.push({ kind: "literal", value: start.value });
    }

    while (!this.check(TokenType.InterpolatedStringEnd)) {
      if (this.check(TokenType.InterpolatedStringPart)) {
        const part = this.advance();
        segments.push({ kind: "literal", value: part.value });
      } else if (this.check(TokenType.EOF)) {
        this.error("Unterminated interpolated string");
      } else {
        segments.push({ kind: "expression", expr: this.parseExpr() });
      }
    }

    const end = this.expect(TokenType.InterpolatedStringEnd);
    if (end.value.length > 0) {
      segments.push({ kind: "literal", value: end.value });
    }

    return { type: "InterpolatedString", segments, loc: { line: start.line, column: start.column } };
  }

  // --- Interop: %symbol or %symbol:chain ---

  private parseInteropExpr(): ASTNode {
    const pct = this.expect(TokenType.Interop);
    const sym = this.expect(TokenType.Symbol);

    let node: ASTNode = {
      type: "InteropExpression",
      target: sym.value,
      loc: { line: pct.line, column: pct.column },
    };

    // Chain any following Colon or Slash member accesses
    while (this.check(TokenType.Colon) || this.check(TokenType.Slash)) {
      const sep = this.advance();
      const member = this.expect(TokenType.Symbol);
      if (sep.type === TokenType.Slash) {
        // %ns/fn — namespace call; member access same structure
      }
      node = {
        type: "MemberAccess",
        object: node,
        member: member.value,
        loc: { line: pct.line, column: pct.column },
      };
    }

    return node;
  }

  // --- List forms: ( head ... ) ---

  private parseList(): ASTNode {
    const open = this.expect(TokenType.LeftParen);

    if (this.check(TokenType.RightParen)) {
      this.advance();
      return { type: "List", elements: [], loc: { line: open.line, column: open.column } };
    }

    const head = this.peek();

    // Special forms dispatched by token type
    switch (head.type) {
      case TokenType.Const:   return this.parseConst(open);
      case TokenType.Var:     return this.parseVar(open);
      case TokenType.Func:    return this.parseFunc(open, false);
      case TokenType.Async:   return this.parseAsync(open);
      case TokenType.Local:   return this.parseLocal(open);
      case TokenType.If:      return this.parseIf(open);
      case TokenType.Cond:    return this.parseCond(open);
      case TokenType.Do:      return this.parseDo(open);
      case TokenType.Set:     return this.parseSet(open);
      case TokenType.Mutate:  return this.parseMutate(open);
      case TokenType.Import:  return this.parseImport(open);
      case TokenType.Try:     return this.parseTry(open);
      case TokenType.Await:   return this.parseAwait(open);
      case TokenType.NilCoalesce: return this.parseNilCoalesce(open);
      case TokenType.NilUnwrap:   return this.parseNilUnwrap(open);
      case TokenType.Macro:   return this.parseMacro(open);
      case TokenType.Symbol: {
        // Symbol-headed special forms — dispatched by name, not token type.
        // Guard against predicate suffixes: (dict? ...) must fall through to parseCall.
        const noQMark = !this.check(TokenType.QuestionMark, 1);
        if (head.value === "dict"  && noQMark) return this.parseDict(open);
        if (head.value === "tuple" && noQMark) return this.parseTuple(open);
        if (head.value === "throw")            return this.parseThrow(open);
        return this.parseCall(open);
      }
      default:
        return this.parseCall(open);
    }
  }

  // --- (const name [: Type] value) ---

  private parseConst(open: Token): ASTNode {
    this.expect(TokenType.Const);
    const nameTok = this.expect(TokenType.Symbol);
    const typeAnnotation = this.tryParseTypeAnnotation();
    const value = this.parseExpr();
    this.expect(TokenType.RightParen);
    return {
      type: "ConstDeclaration",
      name: nameTok.value,
      typeAnnotation,
      value,
      loc: { line: open.line, column: open.column },
    };
  }

  // --- (var name: Type [value]) ---

  private parseVar(open: Token): ASTNode {
    this.expect(TokenType.Var);
    const nameTok = this.expect(TokenType.Symbol);
    const typeAnnotation = this.parseRequiredTypeAnnotation();
    let value: ASTNode | null = null;
    if (!this.check(TokenType.RightParen)) {
      value = this.parseExpr();
    }
    this.expect(TokenType.RightParen);
    return {
      type: "VarDeclaration",
      name: nameTok.value,
      typeAnnotation,
      value,
      initialized: value !== null,
      loc: { line: open.line, column: open.column },
    };
  }

  // --- (func name: ReturnType [params] body...) ---

  private parseFunc(open: Token, async: boolean): ASTNode {
    this.expect(TokenType.Func);
    const nameTok = this.check(TokenType.Symbol) ? this.advance() : null;
    const returnType = this.tryParseTypeAnnotation();
    const params = this.parseParamList();
    const body = this.parseBody();
    this.expect(TokenType.RightParen);
    return {
      type: "FuncDeclaration",
      name: nameTok ? nameTok.value : null,
      async,
      params,
      returnType,
      body,
      loc: { line: open.line, column: open.column },
    };
  }

  // --- (async func ...) ---

  private parseAsync(open: Token): ASTNode {
    this.expect(TokenType.Async);
    if (!this.check(TokenType.Func)) {
      this.error("Expected 'func' after 'async'");
    }
    return this.parseFunc(open, true);
  }

  // --- (local [name val ...] body...) ---

  private parseLocal(open: Token): ASTNode {
    this.expect(TokenType.Local);
    this.expect(TokenType.LeftBracket);
    const bindings: [string, ASTNode][] = [];
    while (!this.check(TokenType.RightBracket)) {
      const name = this.expect(TokenType.Symbol);
      const val = this.parseExpr();
      bindings.push([name.value, val]);
    }
    this.expect(TokenType.RightBracket);
    const body = this.parseBody();
    this.expect(TokenType.RightParen);
    return {
      type: "LocalBinding",
      bindings,
      body,
      loc: { line: open.line, column: open.column },
    };
  }

  // --- (if condition then :else else) ---

  private parseIf(open: Token): ASTNode {
    this.expect(TokenType.If);
    const condition = this.parseExpr();
    const consequent = this.parseExpr();
    let alternate: ASTNode | null = null;
    if (this.check(TokenType.Keyword) && this.peek().value === ":else") {
      this.advance(); // consume :else
      alternate = this.parseExpr();
    }
    this.expect(TokenType.RightParen);
    return {
      type: "IfExpression",
      condition,
      consequent,
      alternate,
      loc: { line: open.line, column: open.column },
    };
  }

  // --- (cond (cond1) result1 ... :else default) ---

  private parseCond(open: Token): ASTNode {
    this.expect(TokenType.Cond);
    const clauses: CondClause[] = [];
    let elseExpr: ASTNode | null = null;

    while (!this.check(TokenType.RightParen)) {
      if (this.check(TokenType.Keyword) && this.peek().value === ":else") {
        this.advance();
        elseExpr = this.parseExpr();
        break;
      }
      const condition = this.parseExpr();
      const result = this.parseExpr();
      clauses.push({ condition, result });
    }

    this.expect(TokenType.RightParen);
    return {
      type: "CondExpression",
      clauses,
      else: elseExpr,
      loc: { line: open.line, column: open.column },
    };
  }

  // --- (do expr...) ---

  private parseDo(open: Token): ASTNode {
    this.expect(TokenType.Do);
    const body = this.parseBody();
    this.expect(TokenType.RightParen);
    return { type: "DoBlock", body, loc: { line: open.line, column: open.column } };
  }

  // --- (set name value) ---

  private parseSet(open: Token): ASTNode {
    this.expect(TokenType.Set);
    const nameTok = this.expect(TokenType.Symbol);
    const value = this.parseExpr();
    this.expect(TokenType.RightParen);
    return {
      type: "SetExpression",
      name: nameTok.value,
      value,
      loc: { line: open.line, column: open.column },
    };
  }

  // --- (mutate name value) — REPL-only force-reassign ---

  private parseMutate(open: Token): ASTNode {
    this.expect(TokenType.Mutate);
    const nameTok = this.expect(TokenType.Symbol);
    const value = this.parseExpr();
    this.expect(TokenType.RightParen);
    return {
      type: "MutateExpression",
      name: nameTok.value,
      value,
      loc: { line: open.line, column: open.column },
    };
  }

  // --- (import name :from "path") ---

  private parseImport(open: Token): ASTNode {
    this.expect(TokenType.Import);
    const nameTok = this.expect(TokenType.Symbol);
    // consume :from keyword
    const fromKw = this.expect(TokenType.Keyword);
    if (fromKw.value !== ":from") {
      this.error(`Expected :from, got ${fromKw.value}`, fromKw);
    }
    const pathTok = this.expect(TokenType.String);
    this.expect(TokenType.RightParen);
    return {
      type: "ImportDeclaration",
      name: nameTok.value,
      path: pathTok.value,
      loc: { line: open.line, column: open.column },
    };
  }

  // --- (try body (catch err body...) (finally body...)) ---

  private parseTry(open: Token): ASTNode {
    this.expect(TokenType.Try);
    const body: ASTNode[] = [];

    // Parse the try body — everything up to (catch ...) or (finally ...) or )
    while (!this.check(TokenType.RightParen)) {
      if (this.check(TokenType.LeftParen)) {
        const next = this.peek(1);
        if (next.type === TokenType.Catch || next.type === TokenType.Finally) break;
      }
      body.push(this.parseExpr());
    }

    let catchBinding: string | null = null;
    let catchBody: ASTNode[] = [];
    let finallyBody: ASTNode[] | null = null;

    // Optional (catch err body...)
    if (this.check(TokenType.LeftParen) && this.peek(1).type === TokenType.Catch) {
      this.advance(); // (
      this.expect(TokenType.Catch);
      catchBinding = this.expect(TokenType.Symbol).value;
      catchBody = this.parseBody();
      this.expect(TokenType.RightParen);
    }

    // Optional (finally body...)
    if (this.check(TokenType.LeftParen) && this.peek(1).type === TokenType.Finally) {
      this.advance(); // (
      this.expect(TokenType.Finally);
      finallyBody = this.parseBody();
      this.expect(TokenType.RightParen);
    }

    this.expect(TokenType.RightParen);
    return {
      type: "TryCatch",
      body,
      catchBinding,
      catchBody,
      finallyBody,
      loc: { line: open.line, column: open.column },
    };
  }

  // --- (await expr) ---

  private parseAwait(open: Token): ASTNode {
    this.expect(TokenType.Await);
    const expression = this.parseExpr();
    this.expect(TokenType.RightParen);
    return { type: "AwaitExpression", expression, loc: { line: open.line, column: open.column } };
  }

  // --- (?? expr default) ---

  private parseNilCoalesce(open: Token): ASTNode {
    this.expect(TokenType.NilCoalesce);
    const expression = this.parseExpr();
    const defaultExpr = this.parseExpr();
    this.expect(TokenType.RightParen);
    return {
      type: "NilCoalesce",
      expression,
      default: defaultExpr,
      loc: { line: open.line, column: open.column },
    };
  }

  // --- (? body... [:is-nil nil-body...]) ---

  private parseNilUnwrap(open: Token): ASTNode {
    this.expect(TokenType.NilUnwrap);
    const nonNilBranch: ASTNode[] = [];
    while (!this.check(TokenType.RightParen) && !this.check(TokenType.EOF)) {
      if (this.check(TokenType.Keyword) && this.peek().value === ":is-nil") break;
      nonNilBranch.push(this.parseExpr());
    }
    let nilBranch: ASTNode[] | null = null;
    if (this.check(TokenType.Keyword) && this.peek().value === ":is-nil") {
      this.advance(); // consume :is-nil
      nilBranch = this.parseBody();
    }
    this.expect(TokenType.RightParen);
    return {
      type: "NilUnwrapBlock",
      nonNilBranch,
      nilBranch,
      loc: { line: open.line, column: open.column },
    };
  }

  // --- (macro name [params] body...) ---

  private parseMacro(open: Token): ASTNode {
    this.expect(TokenType.Macro);
    const nameTok = this.expect(TokenType.Symbol);
    this.expect(TokenType.LeftBracket);
    const params: string[] = [];
    while (!this.check(TokenType.RightBracket)) {
      params.push(this.expect(TokenType.Symbol).value);
    }
    this.expect(TokenType.RightBracket);
    const body = this.parseBody();
    this.expect(TokenType.RightParen);
    return {
      type: "MacroDeclaration",
      name: nameTok.value,
      params,
      body,
      loc: { line: open.line, column: open.column },
    };
  }

  // --- (dict :key val ...) — Dict literal ---

  private parseDict(open: Token): ASTNode {
    this.expect(TokenType.Symbol); // consume "dict"
    const entries: { key: string; value: ASTNode }[] = [];
    while (!this.check(TokenType.RightParen) && !this.check(TokenType.EOF)) {
      const kw = this.expect(TokenType.Keyword);
      const key = kw.value.startsWith(":") ? kw.value.slice(1) : kw.value;
      const value = this.parseExpr();
      entries.push({ key, value });
    }
    this.expect(TokenType.RightParen);
    return { type: "Dict", entries, loc: { line: open.line, column: open.column } };
  }

  // --- (tuple val ...) — Tuple literal ---

  private parseTuple(open: Token): ASTNode {
    this.expect(TokenType.Symbol); // consume "tuple"
    const elements: ASTNode[] = [];
    while (!this.check(TokenType.RightParen) && !this.check(TokenType.EOF)) {
      elements.push(this.parseExpr());
    }
    this.expect(TokenType.RightParen);
    return { type: "Tuple", elements, loc: { line: open.line, column: open.column } };
  }

  // --- (throw expr) — Throw expression ---

  private parseThrow(open: Token): ASTNode {
    this.expect(TokenType.Symbol); // consume "throw"
    const value = this.parseExpr();
    this.expect(TokenType.RightParen);
    return { type: "ThrowExpression", value, loc: { line: open.line, column: open.column } };
  }

  // --- (callee arg...) — general call, also handles namespace and member calls ---

  private parseCall(open: Token): ASTNode {
    // The callee may be: symbol, symbol/symbol, symbol:symbol, %symbol..., or / as division
    let callee: ASTNode;

    if (this.check(TokenType.Interop)) {
      callee = this.parseInteropExpr();
    } else if (this.check(TokenType.Symbol)) {
      callee = this.parseCalleeExpr();
    } else if (this.check(TokenType.Slash)) {
      // / used as division operator: (/ a b)
      const slash = this.advance();
      callee = { type: "Symbol", name: "/", loc: { line: slash.line, column: slash.column } };
    } else {
      callee = this.parseExpr();
    }

    const args: ASTNode[] = [];
    while (!this.check(TokenType.RightParen) && !this.check(TokenType.EOF)) {
      args.push(this.parseExpr());
    }
    this.expect(TokenType.RightParen);

    const loc = open ? { line: open.line, column: open.column } : undefined;
    return { type: "CallExpression", callee, args, loc };
  }

  // Parses a symbol that may be followed by ?, /, or : to form a namespace/member callee.
  private parseCalleeExpr(): ASTNode {
    const tok = this.expect(TokenType.Symbol);
    let name = tok.value;
    // Allow ? suffix: nil?, number?, etc.
    if (this.check(TokenType.QuestionMark)) {
      this.advance();
      name += "?";
    }
    let node: ASTNode = { type: "Symbol", name, loc: { line: tok.line, column: tok.column } };

    while (this.check(TokenType.Slash) || this.check(TokenType.Colon)) {
      const sep = this.advance();
      const member = this.expect(TokenType.Symbol);
      node = {
        type: "MemberAccess",
        object: node,
        member: member.value,
        loc: { line: tok.line, column: tok.column },
      };
      // After a slash, also consume any following Colon chains
      if (sep.type === TokenType.Slash) {
        while (this.check(TokenType.Colon)) {
          this.advance();
          const m = this.expect(TokenType.Symbol);
          node = { type: "MemberAccess", object: node, member: m.value, loc: { line: tok.line, column: tok.column } };
        }
        break; // Slash is a single segment; stop after consuming its chain
      }
    }

    return node;
  }

  // --- Parameter list: [ param... ] ---

  private parseParamList(): FuncParam[] {
    this.expect(TokenType.LeftBracket);
    const params: FuncParam[] = [];
    while (!this.check(TokenType.RightBracket)) {
      params.push(this.parseParam());
    }
    this.expect(TokenType.RightBracket);
    return params;
  }

  private parseParam(): FuncParam {
    // Positional: _ name: Type  (no defaults on positional params)
    if (this.check(TokenType.Symbol) && this.peek().value === "_") {
      this.advance(); // consume _
      const name = this.expect(TokenType.Symbol);
      const typeAnnotation = this.parseRequiredTypeAnnotation();
      return { externalName: null, name: name.value, typeAnnotation, defaultValue: null };
    }

    // Peek ahead to distinguish:
    //   label: Type           — Symbol TypeColon Symbol  (shorthand)
    //   to recipient: Type    — Symbol Symbol TypeColon  (full form)
    const first = this.expect(TokenType.Symbol);

    if (this.check(TokenType.TypeColon)) {
      // Shorthand: label: Type[?] or label: (Type[?] default)
      this.advance(); // consume :
      const { typeAnnotation, defaultValue } = this.parseTypeWithOptionalDefault();
      return { externalName: first.value, name: first.value, typeAnnotation, defaultValue };
    }

    if (this.check(TokenType.Symbol)) {
      // Full form: externalName internalName: Type[?] or externalName internalName: (Type[?] default)
      const internal = this.advance();
      this.expect(TokenType.TypeColon);
      const { typeAnnotation, defaultValue } = this.parseTypeWithOptionalDefault();
      return { externalName: first.value, name: internal.value, typeAnnotation, defaultValue };
    }

    this.error(`Unexpected token in parameter list: ${this.peek().type}`);
  }

  // Parses TypeName[?] or (TypeName[?] defaultExpr) — called AFTER TypeColon has been consumed.
  private parseTypeWithOptionalDefault(): { typeAnnotation: TypeAnnotation; defaultValue: ASTNode | null } {
    if (this.check(TokenType.LeftParen)) {
      // (Type[?] defaultValue) form
      this.advance(); // (
      const typeTok = this.expect(TokenType.Symbol);
      const optional = this.check(TokenType.QuestionMark) ? (this.advance(), true) : false;
      const typeAnnotation: TypeAnnotation = { name: typeTok.value, optional };
      const defaultValue = this.parseExpr();
      this.expect(TokenType.RightParen);
      return { typeAnnotation, defaultValue };
    }
    const typeTok = this.expect(TokenType.Symbol);
    const optional = this.check(TokenType.QuestionMark) ? (this.advance(), true) : false;
    return { typeAnnotation: { name: typeTok.value, optional }, defaultValue: null };
  }

  // --- Type annotation helpers ---

  // Parses `: Type[?]` — returns null if no TypeColon present (optional annotation)
  private tryParseTypeAnnotation(): TypeAnnotation | null {
    if (!this.check(TokenType.TypeColon)) return null;
    return this.parseRequiredTypeAnnotation();
  }

  // Parses `: Type[?]` — errors if TypeColon not present
  private parseRequiredTypeAnnotation(): TypeAnnotation {
    this.expect(TokenType.TypeColon);
    const typeName = this.expect(TokenType.Symbol);
    const optional = this.check(TokenType.QuestionMark) ? (this.advance(), true) : false;
    return { name: typeName.value, optional };
  }

  // --- Body: sequence of expressions ---

  private parseBody(): ASTNode[] {
    const body: ASTNode[] = [];
    while (!this.check(TokenType.RightParen) && !this.check(TokenType.EOF)) {
      body.push(this.parseExpr());
    }
    return body;
  }
}

export function parse(tokens: Token[]): Program {
  return new Parser(tokens).parse();
}
