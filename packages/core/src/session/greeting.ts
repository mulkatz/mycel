import type { DomainConfig } from '@mycel/schemas/src/domain.schema.js';
import type { PersonaConfig } from '@mycel/schemas/src/persona.schema.js';
import type { LlmClient } from '../llm/llm-client.js';
import { PersonaResultSchema, PersonaResultJsonSchema } from '../agents/agent-output.schemas.js';
import { invokeAndValidate } from '../llm/invoke-and-validate.js';
import { createChildLogger } from '@mycel/shared/src/logger.js';

const log = createChildLogger('session:greeting');

export async function generateGreeting(
  personaConfig: PersonaConfig,
  domainConfig: DomainConfig,
  llmClient: LlmClient,
): Promise<string> {
  log.info(
    { persona: personaConfig.name, domain: domainConfig.name },
    'Generating session greeting',
  );

  const categoryList = domainConfig.categories
    .map((c) => `- ${c.label}: ${c.description}`)
    .join('\n');

  const systemPrompt = `${personaConfig.systemPromptTemplate}

Your persona:
- Name: ${personaConfig.name}
- Tonality: ${personaConfig.tonality}
- Formality: ${personaConfig.formality}
- Language: ${personaConfig.language}
${personaConfig.addressForm ? `- Address form: ${personaConfig.addressForm}` : ''}

You are starting a NEW conversation. There is no user input yet.
Generate a warm, inviting opening greeting that introduces yourself and asks an open-ended question to get the conversation started.

Domain context (${domainConfig.name}): ${domainConfig.description}
Knowledge categories:
${categoryList}

STRICT RULES:
- Keep it SHORT — 1-3 sentences maximum
- Ask ONE open-ended question that invites the user to share knowledge about any of the categories above
- Show genuine curiosity and warmth
- Do NOT list the categories — weave them naturally into your question
${personaConfig.promptBehavior.encourageStorytelling ? '- Encourage storytelling — invite the user to share stories or memories' : ''}

IMPORTANT: Respond in ${personaConfig.language}. Your response MUST be in ${personaConfig.language}.

Respond with a JSON object containing:
- response: your greeting text (1-3 sentences with one opening question)
- followUpQuestions: empty array (no follow-ups needed for a greeting)`;

  const result = await invokeAndValidate({
    llmClient,
    request: {
      systemPrompt,
      userMessage: 'Generate an opening greeting for a new conversation.',
      jsonSchema: PersonaResultJsonSchema as Record<string, unknown>,
    },
    schema: PersonaResultSchema,
    agentName: 'Greeting',
  });

  log.info('Greeting generated');

  return result.response;
}
