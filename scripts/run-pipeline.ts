import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '@mycel/schemas/src/config-loader.js';
import { createLlmClient } from '@mycel/core/src/llm/llm-client.js';
import { createPipeline } from '@mycel/core/src/orchestration/pipeline.js';
import type { AgentInput } from '@mycel/shared/src/types/agent.types.js';

async function main(): Promise<void> {
  const configDir = process.argv[2] ?? resolve(process.cwd(), 'config');
  const inputText =
    process.argv[3] ?? 'The old church in the village center was built in 1732 by local craftsmen.';

  console.log('=== Mycel Pipeline Runner ===\n');
  console.log(`Config directory: ${configDir}`);
  console.log(`Input text: ${inputText}`);
  console.log(`Mock LLM: ${process.env['MYCEL_MOCK_LLM'] === 'true' ? 'yes' : 'no'}\n`);

  const startTime = Date.now();

  const config = await loadConfig(configDir);
  console.log(`Domain: ${config.domain.name} (${config.domain.categories.length} categories)`);
  console.log(`Persona: ${config.persona.name}\n`);

  const llmClient = await createLlmClient();

  const pipeline = createPipeline({
    domainConfig: config.domain,
    personaConfig: config.persona,
    llmClient,
  });

  const input: AgentInput = {
    sessionId: randomUUID(),
    content: inputText,
    metadata: { source: 'cli' },
  };

  console.log('Running pipeline...\n');
  const result = await pipeline.run(input);
  const elapsed = Date.now() - startTime;

  console.log('--- Classification ---');
  if (result.classifierOutput) {
    console.log(`  Category: ${result.classifierOutput.result.categoryId}`);
    console.log(`  Confidence: ${String(result.classifierOutput.result.confidence)}`);
    if (result.classifierOutput.reasoning) {
      console.log(`  Reasoning: ${result.classifierOutput.reasoning}`);
    }
  }

  console.log('\n--- Context Dispatcher ---');
  if (result.contextDispatcherOutput) {
    console.log(`  Summary: ${result.contextDispatcherOutput.result.contextSummary}`);
    console.log(
      `  Relevant entries: ${String(result.contextDispatcherOutput.result.relevantContext.length)}`,
    );
  }

  console.log('\n--- Gap Analysis ---');
  if (result.gapReasoningOutput) {
    console.log(`  Gaps found: ${String(result.gapReasoningOutput.result.gaps.length)}`);
    for (const gap of result.gapReasoningOutput.result.gaps) {
      console.log(`    - ${gap.field} (${gap.priority}): ${gap.description}`);
    }
    console.log(`  Follow-up questions:`);
    for (const q of result.gapReasoningOutput.result.followUpQuestions) {
      console.log(`    - ${q}`);
    }
  }

  console.log('\n--- Persona Response ---');
  if (result.personaOutput) {
    console.log(`  ${result.personaOutput.result.response}`);
    if (result.personaOutput.result.followUpQuestions.length > 0) {
      console.log(`  Questions:`);
      for (const q of result.personaOutput.result.followUpQuestions) {
        console.log(`    - ${q}`);
      }
    }
  }

  console.log('\n--- Structured Entry ---');
  if (result.structuringOutput) {
    const { entry, isComplete, missingFields } = result.structuringOutput.result;
    console.log(`  ID: ${entry.id}`);
    console.log(`  Title: ${entry.title}`);
    console.log(`  Category: ${entry.categoryId}`);
    console.log(`  Tags: ${entry.tags.join(', ')}`);
    console.log(`  Complete: ${String(isComplete)}`);
    if (missingFields.length > 0) {
      console.log(`  Missing fields: ${missingFields.join(', ')}`);
    }
    if (entry.followUp) {
      console.log(`  Follow-up gaps: ${entry.followUp.gaps.join('; ')}`);
    }
  }

  console.log(`\n=== Pipeline completed in ${String(elapsed)}ms ===`);
}

main().catch((error: unknown) => {
  console.error('Pipeline failed:', error);
  process.exit(1);
});
