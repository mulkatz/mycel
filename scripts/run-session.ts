import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { loadConfig } from '@mycel/schemas/src/config-loader.js';
import { createLlmClient } from '@mycel/core/src/llm/llm-client.js';
import { createVertexEmbeddingClient } from '@mycel/core/src/embedding/vertex-embedding-client.js';
import { createMockEmbeddingClient } from '@mycel/core/src/embedding/mock-embedding-client.js';
import { createSessionManager } from '@mycel/core/src/session/session-manager.js';
import { createInMemorySessionRepository } from '@mycel/core/src/repositories/in-memory-session.repository.js';
import { createInMemoryKnowledgeRepository } from '@mycel/core/src/repositories/in-memory-knowledge.repository.js';
import { createFirestoreClient } from '@mycel/core/src/infrastructure/firestore-client.js';
import { createFirestoreSessionRepository } from '@mycel/core/src/infrastructure/firestore-session.repository.js';
import { createFirestoreKnowledgeRepository } from '@mycel/core/src/infrastructure/firestore-knowledge.repository.js';
import type { SessionRepository } from '@mycel/core/src/repositories/session.repository.js';
import type { KnowledgeRepository } from '@mycel/core/src/repositories/knowledge.repository.js';
import type { SessionResponse } from '@mycel/shared/src/types/session.types.js';

const EXIT_KEYWORDS = ['done', 'fertig', 'tschüss', 'tschuss', 'exit', 'quit'];

function createRepositories(): {
  sessionRepository: SessionRepository;
  knowledgeRepository: KnowledgeRepository;
  persistenceMode: string;
} {
  if (process.env['FIRESTORE_EMULATOR_HOST']) {
    const db = createFirestoreClient();
    return {
      sessionRepository: createFirestoreSessionRepository(db),
      knowledgeRepository: createFirestoreKnowledgeRepository(db),
      persistenceMode: `Firestore (emulator: ${process.env['FIRESTORE_EMULATOR_HOST']})`,
    };
  }

  return {
    sessionRepository: createInMemorySessionRepository(),
    knowledgeRepository: createInMemoryKnowledgeRepository(),
    persistenceMode: 'In-memory (no persistence)',
  };
}

function renderProgressBar(score: number, width: number = 30): string {
  const filled = Math.round(score * width);
  const empty = width - filled;
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
  const pct = Math.round(score * 100);
  return `[${bar}] ${String(pct)}%`;
}

function renderResponse(response: SessionResponse): void {
  console.log(`\n--- Turn ${String(response.turnNumber)} ---`);
  console.log(`Completeness: ${renderProgressBar(response.completenessScore)}`);
  console.log(`\nPersona: ${response.personaResponse}`);

  if (response.followUpQuestions.length > 0) {
    console.log('\nFollow-up questions:');
    for (let i = 0; i < response.followUpQuestions.length; i++) {
      console.log(`  ${String(i + 1)}. ${response.followUpQuestions[i]}`);
    }
  }

  if (response.isComplete) {
    console.log('\n--- Knowledge entry looks complete! Feel free to continue or type "done" to finish. ---');
  }
}

function renderFinalEntry(response: SessionResponse): void {
  if (!response.entry) {
    console.log('\nNo knowledge entry was created.');
    return;
  }

  const entry = response.entry;
  console.log('\n=== Final Knowledge Entry ===');
  console.log(`  ID: ${entry.id}`);
  console.log(`  Title: ${entry.title}`);
  console.log(`  Category: ${entry.categoryId}`);
  console.log(`  Content: ${entry.content}`);
  console.log(`  Tags: ${entry.tags.join(', ')}`);
  console.log(`  Structured data: ${JSON.stringify(entry.structuredData, null, 2)}`);
  if (entry.followUp) {
    console.log(`  Remaining gaps: ${entry.followUp.gaps.join('; ')}`);
  }
}

function isExitCommand(input: string): boolean {
  return EXIT_KEYWORDS.includes(input.trim().toLowerCase());
}

async function main(): Promise<void> {
  const configDir = process.argv[2] ?? resolve(process.cwd(), 'config');

  const { sessionRepository, knowledgeRepository, persistenceMode } = createRepositories();

  console.log('=== Mycel Interactive Session ===\n');
  console.log(`Config directory: ${configDir}`);
  console.log(`Mock LLM: ${process.env['MYCEL_MOCK_LLM'] === 'true' ? 'yes' : 'no'}`);
  console.log(`Persistence: ${persistenceMode}`);
  console.log('Type "done", "fertig", or "tschüss" to end the session. Press Ctrl+C to quit.\n');

  const config = await loadConfig(configDir);
  const llmClient = await createLlmClient();
  const embeddingClient = process.env['MYCEL_MOCK_LLM'] === 'true'
    ? createMockEmbeddingClient()
    : createVertexEmbeddingClient();

  const sessionManager = createSessionManager({
    pipelineConfig: {
      domainConfig: config.domain,
      personaConfig: config.persona,
      llmClient,
    },
    sessionRepository,
    knowledgeRepository,
    embeddingClient,
  });

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = (question: string): Promise<string> =>
    new Promise((resolve) => {
      rl.question(question, resolve);
    });

  let sessionId: string | undefined;
  let lastResponse: SessionResponse | undefined;

  try {
    const firstInput = await prompt('You: ');
    if (isExitCommand(firstInput) || firstInput.trim() === '') {
      console.log('Session ended.');
      rl.close();
      return;
    }

    const response = await sessionManager.startSession(
      {
        content: firstInput,
        isFollowUpResponse: false,
      },
      { source: 'cli' },
    );

    sessionId = response.sessionId;
    lastResponse = response;
    renderResponse(response);

    for (;;) {
      const input = await prompt('\nYou: ');
      if (isExitCommand(input)) {
        break;
      }

      const followUp = await sessionManager.continueSession(sessionId, {
        content: input,
        isFollowUpResponse: true,
        respondingToQuestions: lastResponse?.followUpQuestions,
      });

      lastResponse = followUp;
      renderResponse(followUp);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_USE_AFTER_CLOSE') {
      // readline closed by Ctrl+C
    } else {
      throw error;
    }
  }

  if (sessionId) {
    const session = await sessionManager.endSession(sessionId);
    console.log(`\nSession status: ${session.status}`);
    console.log(`Total turns: ${String(session.turns.length)}`);
    if (lastResponse) {
      renderFinalEntry(lastResponse);
    }
  }

  rl.close();
  console.log('\n=== Session complete ===');
}

main().catch((error: unknown) => {
  console.error('Session failed:', error);
  process.exit(1);
});
