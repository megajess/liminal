import { tokenize } from "../lexer/lexer";
import { parse, ParseError } from "./parser";
import { ASTNode } from "../ast/types";

function parseSource(src: string): ASTNode[] {
  return parse(tokenize(src)).body;
}

function parseOne(src: string): ASTNode {
  const nodes = parseSource(src);
  expect(nodes).toHaveLength(1);
  return nodes[0];
}

// --- Literals ---

test("number literal", () => {
  expect(parseOne("42")).toMatchObject({ type: "NumberLiteral", value: 42 });
});

test("negative number", () => {
  expect(parseOne("-7")).toMatchObject({ type: "NumberLiteral", value: -7 });
});

test("float literal", () => {
  expect(parseOne("3.14")).toMatchObject({ type: "NumberLiteral", value: 3.14 });
});

test("string literal", () => {
  expect(parseOne('"hello"')).toMatchObject({ type: "StringLiteral", value: "hello" });
});

test("boolean true", () => {
  expect(parseOne("true")).toMatchObject({ type: "BooleanLiteral", value: true });
});

test("boolean false", () => {
  expect(parseOne("false")).toMatchObject({ type: "BooleanLiteral", value: false });
});

test("nil literal", () => {
  expect(parseOne("nil")).toMatchObject({ type: "NilLiteral", trace: null });
});

// --- Symbols and member access ---

test("symbol", () => {
  expect(parseOne("foo")).toMatchObject({ type: "Symbol", name: "foo" });
});

test("property access: a:b", () => {
  expect(parseOne("a:b")).toMatchObject({
    type: "MemberAccess",
    object: { type: "Symbol", name: "a" },
    member: "b",
  });
});

test("chained property access: a:b:c", () => {
  expect(parseOne("a:b:c")).toMatchObject({
    type: "MemberAccess",
    object: {
      type: "MemberAccess",
      object: { type: "Symbol", name: "a" },
      member: "b",
    },
    member: "c",
  });
});

// --- Interpolated string ---

test("interpolated string", () => {
  const node = parseOne('"Hello {name}"');
  expect(node).toMatchObject({
    type: "InterpolatedString",
    segments: [
      { kind: "literal", value: "Hello " },
      { kind: "expression", expr: { type: "Symbol", name: "name" } },
    ],
  });
});

test("interpolated string: trailing literal", () => {
  const node = parseOne('"{name} wins"');
  expect(node).toMatchObject({
    type: "InterpolatedString",
    segments: [
      { kind: "expression" },
      { kind: "literal", value: " wins" },
    ],
  });
});

// --- Interop ---

test("interop: %fs", () => {
  expect(parseOne("%fs")).toMatchObject({ type: "InteropExpression", target: "fs" });
});

test("interop member: %process:env", () => {
  expect(parseOne("%process:env")).toMatchObject({
    type: "MemberAccess",
    object: { type: "InteropExpression", target: "process" },
    member: "env",
  });
});

test("interop chain: %process:env:NODE_ENV", () => {
  expect(parseOne("%process:env:NODE_ENV")).toMatchObject({
    type: "MemberAccess",
    object: {
      type: "MemberAccess",
      object: { type: "InteropExpression", target: "process" },
      member: "env",
    },
    member: "NODE_ENV",
  });
});

test("interop namespace call callee: %marked/parse", () => {
  const node = parseOne("(%marked/parse content)");
  expect(node).toMatchObject({
    type: "CallExpression",
    callee: {
      type: "MemberAccess",
      object: { type: "InteropExpression", target: "marked" },
      member: "parse",
    },
  });
});

// --- const ---

test("const with type annotation", () => {
  expect(parseOne('(const name: String "John")')).toMatchObject({
    type: "ConstDeclaration",
    name: "name",
    typeAnnotation: { name: "String", optional: false },
    value: { type: "StringLiteral", value: "John" },
  });
});

test("const without type annotation (inferred)", () => {
  expect(parseOne('(const name "John")')).toMatchObject({
    type: "ConstDeclaration",
    name: "name",
    typeAnnotation: null,
    value: { type: "StringLiteral", value: "John" },
  });
});

// --- var ---

test("var with initial value", () => {
  expect(parseOne("(var counter: Int 0)")).toMatchObject({
    type: "VarDeclaration",
    name: "counter",
    typeAnnotation: { name: "Int", optional: false },
    value: { type: "NumberLiteral", value: 0 },
    initialized: true,
  });
});

test("var deferred (no initial value)", () => {
  expect(parseOne("(var x: Int)")).toMatchObject({
    type: "VarDeclaration",
    name: "x",
    value: null,
    initialized: false,
  });
});

test("var with optional type", () => {
  expect(parseOne("(var x: Int? nil)")).toMatchObject({
    type: "VarDeclaration",
    typeAnnotation: { name: "Int", optional: true },
  });
});

// --- func ---

test("func with params and return type", () => {
  expect(parseOne("(func add: Int [a: Int b: Int] (+ a b))")).toMatchObject({
    type: "FuncDeclaration",
    name: "add",
    async: false,
    returnType: { name: "Int", optional: false },
    params: [
      { externalName: "a", name: "a", typeAnnotation: { name: "Int", optional: false } },
      { externalName: "b", name: "b", typeAnnotation: { name: "Int", optional: false } },
    ],
    body: [{ type: "CallExpression" }],
  });
});

test("func with no params", () => {
  expect(parseOne("(func greet: String [] \"hello\")")).toMatchObject({
    type: "FuncDeclaration",
    name: "greet",
    params: [],
  });
});

test("func with positional param", () => {
  const node = parseOne("(func id: Int [_ x: Int] x)") as any;
  expect(node.params[0]).toMatchObject({ externalName: null, name: "x" });
});

test("func with full-form param (external/internal names)", () => {
  const node = parseOne("(func send: Void [to recipient: String] recipient)") as any;
  expect(node.params[0]).toMatchObject({ externalName: "to", name: "recipient" });
});

test("func with optional param", () => {
  const node = parseOne("(func f: Int [x: Int?] x)") as any;
  expect(node.params[0].typeAnnotation).toMatchObject({ name: "Int", optional: true });
});

// --- async func ---

test("async func", () => {
  expect(parseOne("(async func fetch: String [url: String] url)")).toMatchObject({
    type: "FuncDeclaration",
    async: true,
    name: "fetch",
  });
});

// --- local ---

test("local binding", () => {
  expect(parseOne("(local [x 1 y 2] (+ x y))")).toMatchObject({
    type: "LocalBinding",
    bindings: [
      ["x", { type: "NumberLiteral", value: 1 }],
      ["y", { type: "NumberLiteral", value: 2 }],
    ],
    body: [{ type: "CallExpression" }],
  });
});

// --- if ---

test("if without else", () => {
  expect(parseOne("(if x a)")).toMatchObject({
    type: "IfExpression",
    condition: { type: "Symbol", name: "x" },
    consequent: { type: "Symbol", name: "a" },
    alternate: null,
  });
});

test("if with :else", () => {
  expect(parseOne("(if x a :else b)")).toMatchObject({
    type: "IfExpression",
    alternate: { type: "Symbol", name: "b" },
  });
});

// --- cond ---

test("cond expression", () => {
  expect(parseOne("(cond (eq x 1) :a (eq x 2) :b :else :c)")).toMatchObject({
    type: "CondExpression",
    clauses: [
      { condition: { type: "CallExpression" }, result: { type: "Symbol", name: ":a" } },
      { condition: { type: "CallExpression" }, result: { type: "Symbol", name: ":b" } },
    ],
    else: { type: "Symbol", name: ":c" },
  });
});

// --- do ---

test("do block", () => {
  expect(parseOne("(do (log 1) (log 2))")).toMatchObject({
    type: "DoBlock",
    body: [{ type: "CallExpression" }, { type: "CallExpression" }],
  });
});

// --- set ---

test("set expression", () => {
  expect(parseOne("(set counter 5)")).toMatchObject({
    type: "SetExpression",
    name: "counter",
    value: { type: "NumberLiteral", value: 5 },
  });
});

// --- import ---

test("native import", () => {
  expect(parseOne('(import utils :from "./utils.lmnl")')).toMatchObject({
    type: "ImportDeclaration",
    name: "utils",
    path: "./utils.lmnl",
  });
});

test("npm import", () => {
  expect(parseOne('(import marked :from "marked")')).toMatchObject({
    type: "ImportDeclaration",
    name: "marked",
    path: "marked",
  });
});

// --- try/catch/finally ---

test("try with catch", () => {
  expect(parseOne("(try (risky) (catch err (log err:message) nil))")).toMatchObject({
    type: "TryCatch",
    catchBinding: "err",
    catchBody: [{ type: "CallExpression" }, { type: "NilLiteral" }],
    finallyBody: null,
  });
});

test("try with catch and finally", () => {
  expect(parseOne("(try (risky) (catch e nil) (finally (cleanup)))")).toMatchObject({
    type: "TryCatch",
    catchBinding: "e",
    finallyBody: [{ type: "CallExpression" }],
  });
});

// --- await ---

test("await expression", () => {
  expect(parseOne("(await (fetch url))")).toMatchObject({
    type: "AwaitExpression",
    expression: { type: "CallExpression" },
  });
});

// --- nil operators ---

test("nil coalesce", () => {
  expect(parseOne("(?? x 0)")).toMatchObject({
    type: "NilCoalesce",
    expression: { type: "Symbol", name: "x" },
    default: { type: "NumberLiteral", value: 0 },
  });
});

test("nil unwrap block with :is-nil branch", () => {
  expect(parseOne("(? (const x 1) x :is-nil (const x 0) x)")).toMatchObject({
    type: "NilUnwrapBlock",
    nonNilBranch: [{ type: "ConstDeclaration" }, { type: "Symbol" }],
    nilBranch: [{ type: "ConstDeclaration" }, { type: "Symbol" }],
  });
});

test("nil unwrap block without :is-nil branch", () => {
  expect(parseOne("(? (const x 1) x)")).toMatchObject({
    type: "NilUnwrapBlock",
    nonNilBranch: [{ type: "ConstDeclaration" }, { type: "Symbol" }],
    nilBranch: null,
  });
});

// --- call expressions ---

test("simple call", () => {
  expect(parseOne("(log 42)")).toMatchObject({
    type: "CallExpression",
    callee: { type: "Symbol", name: "log" },
    args: [{ type: "NumberLiteral", value: 42 }],
  });
});

test("namespace call: utils/helper", () => {
  expect(parseOne("(utils/helper 1)")).toMatchObject({
    type: "CallExpression",
    callee: {
      type: "MemberAccess",
      object: { type: "Symbol", name: "utils" },
      member: "helper",
    },
  });
});

test("method call via : accessor", () => {
  expect(parseOne("(person:validate)")).toMatchObject({
    type: "CallExpression",
    callee: {
      type: "MemberAccess",
      object: { type: "Symbol", name: "person" },
      member: "validate",
    },
  });
});

test("empty call", () => {
  expect(parseOne("(noop)")).toMatchObject({
    type: "CallExpression",
    callee: { type: "Symbol", name: "noop" },
    args: [],
  });
});

// --- program root ---

test("multiple top-level expressions", () => {
  const nodes = parseSource("1 2 3");
  expect(nodes).toHaveLength(3);
});

// --- error cases ---

test("unclosed paren throws ParseError", () => {
  expect(() => parseSource("(foo bar")).toThrow(ParseError);
});

test("missing :from in import throws ParseError", () => {
  expect(() => parseSource('(import utils "path")')).toThrow(ParseError);
});
