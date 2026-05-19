// ============================================================
// Liminal AST Types
// ============================================================

// --- Source Location ---

export interface SourceLocation {
  line: number;
  column: number;
}

export interface BaseNode {
  loc?: SourceLocation;
}

// --- Type Annotations ---

export interface TypeAnnotation {
  name: string;       // "Int", "String", "Bool", etc.
  optional: boolean;  // true for Int?, String?, etc.
}

// --- Literals ---

export interface NumberLiteral extends BaseNode {
  type: "NumberLiteral";
  value: number;
}

export interface StringLiteral extends BaseNode {
  type: "StringLiteral";
  value: string;
}

export type StringSegment =
  | { kind: "literal"; value: string }
  | { kind: "expression"; expr: ASTNode };

export interface InterpolatedString extends BaseNode {
  type: "InterpolatedString";
  segments: StringSegment[];  // alternating literal and expression parts
}

export interface BooleanLiteral extends BaseNode {
  type: "BooleanLiteral";
  value: boolean;
}

export interface NilTrace {
  symbol: string;
  line: number;
  column: number;
  propagatedThrough: NilTrace[];
}

export interface NilLiteral extends BaseNode {
  type: "NilLiteral";
  trace: NilTrace | null;   // null at compile time, populated at runtime
}

// --- Symbol / Identifier ---

export interface Symbol extends BaseNode {
  type: "Symbol";
  name: string;
}

// --- Collections ---

export interface LiminalList extends BaseNode {
  type: "List";
  elements: ASTNode[];
}

// --- Bindings ---

export interface ConstDeclaration extends BaseNode {
  type: "ConstDeclaration";
  name: string;
  typeAnnotation: TypeAnnotation | null;  // can be inferred
  value: ASTNode;                         // const must always have a value
}

export interface VarDeclaration extends BaseNode {
  type: "VarDeclaration";
  name: string;
  typeAnnotation: TypeAnnotation;
  value: ASTNode | null;    // null = deferred initialization
  initialized: boolean;     // definite assignment tracking — compile time only
}

export interface LocalBinding extends BaseNode {
  type: "LocalBinding";
  bindings: [string, ASTNode][];
  body: ASTNode[];
}

// --- Member Access ---

export interface MemberAccess extends BaseNode {
  type: "MemberAccess";
  object: ASTNode;  // recursively nested for chains like err:stack:frames
  member: string;
}

// --- Functions ---

export interface FuncParam {
  externalName: string | null;    // null = positional (_ name: Type); string = label at call site
  name: string;                   // internal name used inside the function body
  typeAnnotation: TypeAnnotation;
  defaultValue: ASTNode | null;   // null = required; ASTNode = omittable with this default
}

export interface FuncDeclaration extends BaseNode {
  type: "FuncDeclaration";
  name: string | null;              // null for anonymous/lambda
  async: boolean;
  params: FuncParam[];
  returnType: TypeAnnotation | null;
  body: ASTNode[];
}

export interface CallExpression extends BaseNode {
  type: "CallExpression";
  callee: ASTNode;
  args: ASTNode[];
}

// --- Control Flow ---

export interface IfExpression extends BaseNode {
  type: "IfExpression";
  condition: ASTNode;
  consequent: ASTNode;
  alternate: ASTNode | null;    // null when no :else branch
}

export interface CondClause {
  condition: ASTNode;
  result: ASTNode;
}

export interface CondExpression extends BaseNode {
  type: "CondExpression";
  clauses: CondClause[];
  else: ASTNode | null;
}

export interface DoBlock extends BaseNode {
  type: "DoBlock";
  body: ASTNode[];
}

// --- Nil Handling ---

export interface NilCoalesce extends BaseNode {
  type: "NilCoalesce";    // (?? expr default)
  expression: ASTNode;
  default: ASTNode;
}

export interface NilUnwrapBlock extends BaseNode {
  type: "NilUnwrapBlock"; // (? (non-nil-body) (nil-body))
  nonNilBranch: ASTNode[];
  nilBranch: ASTNode[];
}

// --- Async ---

export interface AwaitExpression extends BaseNode {
  type: "AwaitExpression";
  expression: ASTNode;
}

// --- Error Handling ---

export interface TryCatch extends BaseNode {
  type: "TryCatch";
  body: ASTNode[];
  catchBinding: string | null;
  catchBody: ASTNode[];
  finallyBody: ASTNode[] | null;
}

// --- Interop ---

export interface InteropExpression extends BaseNode {
  type: "InteropExpression";  // % root — wraps the bare JS/npm target symbol
  target: string;             // e.g. "process", "fs"
  // member access and call args are expressed via wrapping MemberAccess / CallExpression nodes
}

// --- Macros ---

export interface MacroDeclaration extends BaseNode {
  type: "MacroDeclaration";
  name: string;
  params: string[];
  body: ASTNode[];
}

export interface QuasiQuote extends BaseNode {
  type: "QuasiQuote";
  expression: ASTNode;
}

export interface Unquote extends BaseNode {
  type: "Unquote";
  expression: ASTNode;
}

export interface UnquoteSplice extends BaseNode {
  type: "UnquoteSplice";
  expression: ASTNode;
}

// --- Program Root ---

export interface Program extends BaseNode {
  type: "Program";
  body: ASTNode[];
}

// --- Union ---

export type ASTNode =
  | Program
  | NumberLiteral
  | StringLiteral
  | InterpolatedString
  | BooleanLiteral
  | NilLiteral
  | Symbol
  | LiminalList
  | ConstDeclaration
  | VarDeclaration
  | LocalBinding
  | FuncDeclaration
  | CallExpression
  | MemberAccess
  | IfExpression
  | CondExpression
  | DoBlock
  | NilCoalesce
  | NilUnwrapBlock
  | AwaitExpression
  | TryCatch
  | InteropExpression
  | MacroDeclaration
  | QuasiQuote
  | Unquote
  | UnquoteSplice;