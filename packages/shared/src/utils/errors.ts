export class MycelError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'MycelError';
  }
}

export class IngestionError extends MycelError {
  constructor(message: string, cause?: Error) {
    super(message, 'INGESTION_ERROR', cause);
    this.name = 'IngestionError';
  }
}

export class AgentError extends MycelError {
  constructor(message: string, cause?: Error) {
    super(message, 'AGENT_ERROR', cause);
    this.name = 'AgentError';
  }
}

export class SchemaValidationError extends MycelError {
  constructor(
    message: string,
    public readonly validationErrors: readonly string[],
  ) {
    super(message, 'SCHEMA_VALIDATION_ERROR');
    this.name = 'SchemaValidationError';
  }
}

export class ConfigurationError extends MycelError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}

export class LlmError extends MycelError {
  constructor(
    message: string,
    public readonly retryable: boolean,
    cause?: Error,
  ) {
    super(message, 'LLM_ERROR', cause);
    this.name = 'LlmError';
  }
}

export class SessionError extends MycelError {
  constructor(message: string, cause?: Error) {
    super(message, 'SESSION_ERROR', cause);
    this.name = 'SessionError';
  }
}

export class PersistenceError extends MycelError {
  constructor(message: string, cause?: Error) {
    super(message, 'PERSISTENCE_ERROR', cause);
    this.name = 'PersistenceError';
  }
}

export class SchemaGenerationError extends MycelError {
  constructor(message: string, cause?: Error) {
    super(message, 'SCHEMA_GENERATION_ERROR', cause);
    this.name = 'SchemaGenerationError';
  }
}
