export type EvolutionProposalType = 'new_category' | 'new_field' | 'change_priority';
export type EvolutionProposalStatus = 'pending' | 'approved' | 'rejected' | 'auto_applied';

export interface EvolutionProposal {
  readonly id: string;
  readonly domainSchemaId: string;
  readonly type: EvolutionProposalType;
  readonly description: string;
  readonly evidence: readonly string[];
  readonly confidence: number;
  readonly status: EvolutionProposalStatus;
  readonly newCategory?: {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly suggestedFields: readonly string[];
  };
  readonly newField?: {
    readonly targetCategoryId: string;
    readonly fieldName: string;
    readonly fieldType: 'required' | 'optional';
    readonly reasoning: string;
  };
  readonly changePriority?: {
    readonly targetCategoryId: string;
    readonly fieldName: string;
    readonly answerRate: number;
    readonly reasoning: string;
  };
  readonly clusterMetadata?: {
    readonly centroidEntryId: string;
    readonly clusterSize: number;
    readonly averageSimilarity: number;
    readonly topKeywords: readonly string[];
  };
  readonly createdAt: Date;
  readonly reviewedAt?: Date;
  readonly appliedAt?: Date;
}

export interface FieldStats {
  readonly domainSchemaId: string;
  readonly categoryId: string;
  readonly fieldName: string;
  readonly timesAsked: number;
  readonly timesAnswered: number;
  readonly answerRate: number;
  readonly lastUpdatedAt: Date;
}
