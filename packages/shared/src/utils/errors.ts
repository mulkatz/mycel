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
