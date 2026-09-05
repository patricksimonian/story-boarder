import type { Variable, VariableRegistry, VariableState, VariableValue } from '../domain/types'

/**
 * The expression language behind conditions and effects. It is small on
 * purpose — no loops, no functions, no scripting — so what's written in
 * a scene file stays data: readable, portable, and checkable against the
 * registry before anything runs. The same evaluator serves the simulator
 * and, later, the playable export.
 *
 *   condition := or
 *   or        := and ('or' and)*
 *   and       := not ('and' not)*
 *   not       := 'not' not | compare
 *   compare   := sum (('==' | '!=' | '<=' | '>=' | '<' | '>' | '=' | 'is' | 'is not') sum)?
 *   sum       := product (('+' | '-') product)*
 *   product   := unary (('*' | '/') unary)*
 *   unary     := '-' unary | primary
 *   primary   := number | 'true' | 'false' | name | 'quoted' | '(' condition ')'
 *   effect    := name ('=' | '+=' | '-=') sum
 *
 * A bare name is a variable when the registry declares it, and otherwise
 * an enum value — `city_mood == tense` reads as it should.
 */

export type CompareOp = '==' | '!=' | '<' | '<=' | '>' | '>='
export type ArithOp = '+' | '-' | '*' | '/'

export type Expr =
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  /** A quoted string, or a bare name the registry doesn't declare — an enum value. */
  | { kind: 'name'; value: string; quoted: boolean }
  | { kind: 'not'; operand: Expr }
  | { kind: 'neg'; operand: Expr }
  | { kind: 'and' | 'or'; left: Expr; right: Expr }
  | { kind: 'compare'; op: CompareOp; left: Expr; right: Expr }
  | { kind: 'arith'; op: ArithOp; left: Expr; right: Expr }

export type EffectOp = '=' | '+=' | '-='

export interface EffectAst {
  target: string
  op: EffectOp
  value: Expr
}

export interface ParseError {
  message: string
  /** 0-based offset into the source. */
  at: number
}

export type ParseResult<T> = { ok: true; ast: T } | { ok: false; error: ParseError }

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type Token =
  | { type: 'number'; value: number; at: number }
  | { type: 'name'; value: string; at: number }
  | { type: 'string'; value: string; at: number }
  | { type: 'op'; value: string; at: number }
  | { type: 'end'; at: number }

const OPERATORS = ['==', '!=', '<=', '>=', '+=', '-=', '<', '>', '=', '+', '-', '*', '/', '(', ')']

function tokenize(source: string): Token[] | ParseError {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      const match = /^[0-9]*\.?[0-9]+/.exec(source.slice(i)) as RegExpExecArray
      tokens.push({ type: 'number', value: Number(match[0]), at: i })
      i += match[0].length
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i)) as RegExpExecArray
      tokens.push({ type: 'name', value: match[0], at: i })
      i += match[0].length
      continue
    }
    if (ch === "'" || ch === '"') {
      const close = source.indexOf(ch, i + 1)
      if (close < 0) return { message: 'Unterminated string', at: i }
      tokens.push({ type: 'string', value: source.slice(i + 1, close), at: i })
      i = close + 1
      continue
    }
    const op = OPERATORS.find((o) => source.startsWith(o, i))
    if (op) {
      tokens.push({ type: 'op', value: op, at: i })
      i += op.length
      continue
    }
    return { message: `Unexpected character \`${ch}\``, at: i }
  }
  tokens.push({ type: 'end', at: source.length })
  return tokens
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  private pos = 0
  private tokens: Token[]
  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  peek(): Token {
    return this.tokens[this.pos]
  }

  next(): Token {
    return this.tokens[this.pos++]
  }

  isOp(...values: string[]): boolean {
    const t = this.peek()
    return t.type === 'op' && values.includes(t.value)
  }

  isWord(value: string): boolean {
    const t = this.peek()
    return t.type === 'name' && t.value === value
  }

  fail(message: string, at = this.peek().at): never {
    throw new ExprError(message, at)
  }

  condition(): Expr {
    return this.or()
  }

  private or(): Expr {
    let left = this.and()
    while (this.isWord('or')) {
      this.next()
      left = { kind: 'or', left, right: this.and() }
    }
    return left
  }

  private and(): Expr {
    let left = this.not()
    while (this.isWord('and')) {
      this.next()
      left = { kind: 'and', left, right: this.not() }
    }
    return left
  }

  private not(): Expr {
    if (this.isWord('not')) {
      this.next()
      return { kind: 'not', operand: this.not() }
    }
    return this.compare()
  }

  private compare(): Expr {
    const left = this.sum()
    let op: CompareOp | undefined
    if (this.isOp('==', '=')) op = '=='
    else if (this.isOp('!=', '<', '<=', '>', '>=')) op = (this.peek() as { value: CompareOp }).value
    else if (this.isWord('is')) {
      this.next()
      if (this.isWord('not')) {
        this.next()
        return { kind: 'compare', op: '!=', left, right: this.sum() }
      }
      return { kind: 'compare', op: '==', left, right: this.sum() }
    }
    if (!op) return left
    this.next()
    return { kind: 'compare', op, left, right: this.sum() }
  }

  sum(): Expr {
    let left = this.product()
    while (this.isOp('+', '-')) {
      const op = (this.next() as { value: ArithOp }).value
      left = { kind: 'arith', op, left, right: this.product() }
    }
    return left
  }

  private product(): Expr {
    let left = this.unary()
    while (this.isOp('*', '/')) {
      const op = (this.next() as { value: ArithOp }).value
      left = { kind: 'arith', op, left, right: this.unary() }
    }
    return left
  }

  private unary(): Expr {
    if (this.isOp('-')) {
      this.next()
      return { kind: 'neg', operand: this.unary() }
    }
    return this.primary()
  }

  private primary(): Expr {
    const t = this.peek()
    if (t.type === 'number') {
      this.next()
      return { kind: 'number', value: t.value }
    }
    if (t.type === 'string') {
      this.next()
      return { kind: 'name', value: t.value, quoted: true }
    }
    if (t.type === 'name') {
      this.next()
      if (t.value === 'true' || t.value === 'false') return { kind: 'boolean', value: t.value === 'true' }
      if (t.value === 'and' || t.value === 'or' || t.value === 'not' || t.value === 'is') {
        this.fail(`Expected a value, found \`${t.value}\``, t.at)
      }
      return { kind: 'name', value: t.value, quoted: false }
    }
    if (t.type === 'op' && t.value === '(') {
      this.next()
      const inner = this.condition()
      if (!this.isOp(')')) this.fail('Expected `)`')
      this.next()
      return inner
    }
    if (t.type === 'end') this.fail('Expected a value, but the expression ended')
    this.fail(`Expected a value, found \`${(t as { value: string }).value}\``)
  }

  end(): void {
    const t = this.peek()
    if (t.type !== 'end') this.fail(`Unexpected \`${(t as { value: string | number }).value}\``)
  }
}

class ExprError extends Error {
  at: number
  constructor(message: string, at: number) {
    super(message)
    this.at = at
  }
}

function run<T>(source: string, parse: (parser: Parser) => T): ParseResult<T> {
  const tokens = tokenize(source)
  if (!Array.isArray(tokens)) return { ok: false, error: tokens }
  const parser = new Parser(tokens)
  try {
    const ast = parse(parser)
    parser.end()
    return { ok: true, ast }
  } catch (error) {
    if (error instanceof ExprError) return { ok: false, error: { message: error.message, at: error.at } }
    throw error
  }
}

export function parseCondition(source: string): ParseResult<Expr> {
  if (source.trim() === '') return { ok: false, error: { message: 'Expected a value, but the expression is empty', at: 0 } }
  return run(source, (p) => p.condition())
}

export function parseEffect(source: string): ParseResult<EffectAst> {
  return run(source, (p) => {
    const target = p.next()
    if (target.type !== 'name') throw new ExprError('Expected a variable name', target.at)
    const op = p.next()
    if (op.type !== 'op' || !['=', '+=', '-='].includes(op.value)) {
      throw new ExprError('Expected =, +=, or -= after the variable', op.at)
    }
    return { target: target.value, op: op.value as EffectOp, value: p.sum() }
  })
}

// ---------------------------------------------------------------------------
// Evaluation — no eval, no Function: a walk over the tree.
// ---------------------------------------------------------------------------

/** Evaluates against a state; a bare name the state doesn't hold reads as an enum value. */
export function evaluate(expr: Expr, state: VariableState): VariableValue {
  switch (expr.kind) {
    case 'number':
    case 'boolean':
      return expr.value
    case 'name':
      return !expr.quoted && expr.value in state ? state[expr.value] : expr.value
    case 'not':
      return !truthy(evaluate(expr.operand, state))
    case 'neg':
      return -Number(evaluate(expr.operand, state))
    case 'and':
      return truthy(evaluate(expr.left, state)) && truthy(evaluate(expr.right, state))
    case 'or':
      return truthy(evaluate(expr.left, state)) || truthy(evaluate(expr.right, state))
    case 'compare': {
      const left = evaluate(expr.left, state)
      const right = evaluate(expr.right, state)
      switch (expr.op) {
        case '==':
          return left === right
        case '!=':
          return left !== right
        case '<':
          return Number(left) < Number(right)
        case '<=':
          return Number(left) <= Number(right)
        case '>':
          return Number(left) > Number(right)
        case '>=':
          return Number(left) >= Number(right)
      }
    }
    // falls through only for an impossible op
    case 'arith': {
      const left = Number(evaluate(expr.left, state))
      const right = Number(evaluate(expr.right, state))
      switch (expr.op) {
        case '+':
          return left + right
        case '-':
          return left - right
        case '*':
          return left * right
        case '/':
          return left / right
      }
    }
  }
  return false
}

const truthy = (value: VariableValue) => value === true

/** A condition holds when it evaluates to exactly `true`. */
export function holds(expr: Expr, state: VariableState): boolean {
  return evaluate(expr, state) === true
}

export function applyEffect(effect: EffectAst, state: VariableState): VariableState {
  const value = evaluate(effect.value, state)
  const current = state[effect.target]
  switch (effect.op) {
    case '=':
      return { ...state, [effect.target]: value }
    case '+=':
      return { ...state, [effect.target]: Number(current) + Number(value) }
    case '-=':
      return { ...state, [effect.target]: Number(current) - Number(value) }
  }
}

// ---------------------------------------------------------------------------
// Checking against the registry — only registered variables exist.
// ---------------------------------------------------------------------------

type ValueType = 'number' | 'boolean' | 'enum' | 'unknown'

interface Typed {
  type: ValueType
  /** The enum variable a bare name was compared against, when known. */
  enumOf?: Variable & { type: 'enum' }
}

export function checkCondition(expr: Expr, registry: VariableRegistry): string[] {
  const problems: string[] = []
  const result = typeOf(expr, registry, problems)
  if (problems.length === 0 && result.type !== 'boolean' && result.type !== 'unknown') {
    problems.push(`A condition must be true or false; \`${describe(expr)}\` is a ${result.type}`)
  }
  return problems
}

export function checkEffect(effect: EffectAst, registry: VariableRegistry): string[] {
  const problems: string[] = []
  const variable = registry.variables.find((v) => v.id === effect.target)
  if (!variable) return [`\`${effect.target}\` is not a registered variable`]
  if (effect.op !== '=' && variable.type !== 'number') {
    return [`\`${effect.op}\` only works on a number; \`${variable.id}\` is a ${variable.type}`]
  }
  const value = typeOf(effect.value, registry, problems, variable.type === 'enum' ? variable : undefined)
  if (problems.length) return problems
  if (value.type !== 'unknown' && value.type !== variable.type) {
    problems.push(`\`${variable.id}\` is a ${variable.type}, but it is assigned a ${value.type}`)
  }
  return problems
}

/** Every variable an expression reads. */
export function variablesRead(expr: Expr, registry: VariableRegistry, into = new Set<string>()): Set<string> {
  switch (expr.kind) {
    case 'name':
      if (!expr.quoted && registry.variables.some((v) => v.id === expr.value)) into.add(expr.value)
      break
    case 'not':
    case 'neg':
      variablesRead(expr.operand, registry, into)
      break
    case 'and':
    case 'or':
    case 'compare':
    case 'arith':
      variablesRead(expr.left, registry, into)
      variablesRead(expr.right, registry, into)
      break
  }
  return into
}

function typeOf(
  expr: Expr,
  registry: VariableRegistry,
  problems: string[],
  /** When a bare name is expected to be one of this enum's values. */
  expectEnum?: Variable & { type: 'enum' },
): Typed {
  switch (expr.kind) {
    case 'number':
      return { type: 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'name': {
      const variable = expr.quoted ? undefined : registry.variables.find((v) => v.id === expr.value)
      if (variable) return variable.type === 'enum' ? { type: 'enum', enumOf: variable } : { type: variable.type }
      if (expectEnum) {
        if (!expectEnum.values.includes(expr.value)) {
          problems.push(`\`${expr.value}\` is not one of ${expectEnum.id}’s values (${expectEnum.values.join(', ')})`)
        }
        return { type: 'enum', enumOf: expectEnum }
      }
      if (expr.quoted) return { type: 'enum' }
      problems.push(`\`${expr.value}\` is not a registered variable`)
      return { type: 'unknown' }
    }
    case 'not': {
      const inner = typeOf(expr.operand, registry, problems)
      if (inner.type !== 'boolean' && inner.type !== 'unknown') {
        problems.push(`\`not\` needs true or false; \`${describe(expr.operand)}\` is a ${inner.type}`)
      }
      return { type: 'boolean' }
    }
    case 'neg':
      expectNumber(expr.operand, registry, problems)
      return { type: 'number' }
    case 'and':
    case 'or': {
      for (const side of [expr.left, expr.right]) {
        const t = typeOf(side, registry, problems)
        if (t.type !== 'boolean' && t.type !== 'unknown') {
          problems.push(`\`${expr.kind}\` needs true or false on both sides; \`${describe(side)}\` is a ${t.type}`)
        }
      }
      return { type: 'boolean' }
    }
    case 'arith':
      expectNumber(expr.left, registry, problems)
      expectNumber(expr.right, registry, problems)
      return { type: 'number' }
    case 'compare': {
      // Resolve whichever side is a variable first, so a bare name on the
      // other side can be read as one of its values.
      const leftFirst = typeOf(expr.left, registry, [])
      const right = typeOf(expr.right, registry, problems, leftFirst.enumOf)
      const left = typeOf(expr.left, registry, problems, right.enumOf)
      if (left.type === 'unknown' || right.type === 'unknown') return { type: 'boolean' }
      if (left.type !== right.type) {
        problems.push(`\`${describe(expr.left)}\` is a ${left.type}, but it is compared with a ${right.type}`)
      } else if (left.type !== 'number' && !['==', '!='].includes(expr.op)) {
        problems.push(`\`${expr.op}\` only compares numbers; \`${describe(expr.left)}\` is a ${left.type}`)
      }
      return { type: 'boolean' }
    }
  }
}

function expectNumber(expr: Expr, registry: VariableRegistry, problems: string[]): void {
  const t = typeOf(expr, registry, problems)
  if (t.type !== 'number' && t.type !== 'unknown') {
    problems.push(`Arithmetic needs numbers; \`${describe(expr)}\` is a ${t.type}`)
  }
}

/** The expression back as text, for messages. */
export function describe(expr: Expr): string {
  switch (expr.kind) {
    case 'number':
      return String(expr.value)
    case 'boolean':
      return String(expr.value)
    case 'name':
      return expr.quoted ? `'${expr.value}'` : expr.value
    case 'not':
      return `not ${describe(expr.operand)}`
    case 'neg':
      return `-${describe(expr.operand)}`
    case 'and':
    case 'or':
      return `${describe(expr.left)} ${expr.kind} ${describe(expr.right)}`
    case 'compare':
    case 'arith':
      return `${describe(expr.left)} ${expr.op} ${describe(expr.right)}`
  }
}

/** The initial state the registry declares. */
export function initialState(registry: VariableRegistry): VariableState {
  const state: VariableState = {}
  for (const v of registry.variables) state[v.id] = v.initial
  return state
}
