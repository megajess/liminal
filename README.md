# Liminal

A Lisp-inspired language with S-expression syntax, first-class JavaScript interop via `%`, and an optional LLVM backend.

## File Extension

`.lmnl`

## Pipeline

```
source (.lmnl)
  → Lexer       (src/lexer)
  → Parser      (src/parser)
  → Analysis    (src/analysis)
      - Definite Assignment
      - Type Checker
      - Nil Analysis
  → Interpreter (src/interpreter)   ← REPL / dev mode
  → JS Emitter  (src/emitters/js)   ← Node target
  → LLVM Emitter(src/emitters/llvm) ← native target
```

## Runtime Tiers

| Mode | Nil handling | Assignment checking |
|------|-------------|---------------------|
| REPL / interpreter | Runtime `NilValue` with trace | Runtime (permissive) |
| Node compiled | Static analysis, clean JS emitted | Compile-time |
| LLVM compiled | Static analysis, bare `i64` / `{ i1, i64 }` | Compile-time |

## Usage

```bash
lmnl                   # start REPL
lmnl run file.lmnl     # interpret a file
lmnl build file.lmnl   # compile to JS
```

## Development

```bash
npm install
npm run repl           # start REPL via ts-node
npm test               # run tests
npm run build          # compile TypeScript
```