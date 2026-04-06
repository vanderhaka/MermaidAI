---
paths:
  - 'src/lib/services/llm-*.ts'
  - 'src/lib/services/prompt-builder.ts'
  - 'src/lib/services/graph-operation-executor.ts'
---

# AI Integration Conventions

## LLM Client (`llm-client.ts`)

- Anthropic SDK singleton — one instance at module scope
- Model: `process.env.AI_MODEL` or `'claude-sonnet-4-6'` default
- Max tokens: 4096
- Returns `ReadableStream<string>` from `messages.stream()`
- Sanitizes API keys from error messages before throwing

## Prompt Building (`prompt-builder.ts`)

- Three modes: `discovery`, `module_map`, `module_detail`
- Each mode has tailored system prompt with operation JSON schemas embedded
- Context includes current modules, nodes, edges for the active scope
- File path instruction: `// file: <path>` convention for pseudocode

## Response Parsing (`llm-response-parser.ts`)

- Extracts JSON from `<operations>...</operations>` XML tags in LLM output
- Regex: `/<operations>([\s\S]*?)<\/operations>/`
- Returns typed `GraphOperation[]` array

## Operation Execution (`graph-operation-executor.ts`)

- Switch on `operation.type` — dispatches to appropriate service function
- Operations: create/update/delete for modules, nodes, edges, connections
- Executes sequentially — order matters for dependencies
