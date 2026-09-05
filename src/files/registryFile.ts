import type { Variable, VariableRegistry } from '../domain/types'

export type RegistryParseResult =
  | { ok: true; registry: VariableRegistry }
  | { ok: false; problems: string[] }

/** Parses `variables.json` — only variables declared here exist. */
export function parseRegistryFile(text: string): RegistryParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    return { ok: false, problems: [`Not valid JSON: ${(error as Error).message}`] }
  }
  const record =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined
  if (!record || !Array.isArray(record.variables)) {
    return { ok: false, problems: ['variables.json must be an object with a `variables` list'] }
  }

  const problems: string[] = []
  const variables: Variable[] = []
  const seen = new Set<string>()
  record.variables.forEach((entry, i) => {
    const variable = parseVariable(entry, `variables[${i}]`, problems)
    if (!variable) return
    if (seen.has(variable.id)) problems.push(`Duplicate variable id \`${variable.id}\``)
    seen.add(variable.id)
    variables.push(variable)
  })

  if (problems.length) return { ok: false, problems }
  return { ok: true, registry: { variables } }
}

function parseVariable(entry: unknown, at: string, problems: string[]): Variable | undefined {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    problems.push(`\`${at}\` must be an object`)
    return undefined
  }
  const record = entry as Record<string, unknown>
  const id = record.id
  if (typeof id !== 'string') {
    problems.push(`\`${at}\` needs a string \`id\``)
    return undefined
  }
  const withDescription = (variable: Variable): Variable =>
    typeof record.description === 'string' && record.description !== ''
      ? { ...variable, description: record.description }
      : variable
  switch (record.type) {
    case 'boolean':
      if (typeof record.initial !== 'boolean') {
        problems.push(`\`${id}\` is a boolean but its initial value isn't`)
        return undefined
      }
      return withDescription({ id, type: 'boolean', initial: record.initial })
    case 'number':
      if (typeof record.initial !== 'number') {
        problems.push(`\`${id}\` is a number but its initial value isn't`)
        return undefined
      }
      return withDescription({ id, type: 'number', initial: record.initial })
    case 'enum': {
      const values = record.values
      if (!Array.isArray(values) || values.some((v) => typeof v !== 'string') || values.length === 0) {
        problems.push(`\`${id}\` is an enum but has no string \`values\` list`)
        return undefined
      }
      if (typeof record.initial !== 'string' || !values.includes(record.initial)) {
        problems.push(`\`${id}\` initial \`${String(record.initial)}\` is not one of its values`)
        return undefined
      }
      return withDescription({ id, type: 'enum', values: values as string[], initial: record.initial })
    }
    default:
      problems.push(`\`${id}\` has unknown type \`${String(record.type)}\``)
      return undefined
  }
}
