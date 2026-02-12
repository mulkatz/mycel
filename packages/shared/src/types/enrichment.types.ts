export interface KnowledgeEnrichment {
  readonly claims: readonly VerifiedClaim[];
  readonly additionalContext?: string;
  readonly enrichedAt: Date;
  readonly searchQueries: readonly string[];
  readonly sourceUrls: readonly string[];
}

export interface VerifiedClaim {
  readonly claim: string;
  readonly status: 'verified' | 'contradicted' | 'unverifiable';
  readonly evidence?: string;
  readonly sourceUrl?: string;
  readonly confidence: number;
}

export interface ExtractedClaim {
  readonly claim: string;
  readonly verifiable: boolean;
  readonly searchQuery?: string;
}

export interface CachedSearchResult {
  readonly id: string;
  readonly query: string;
  readonly content: string;
  readonly sourceUrls: readonly string[];
  readonly cachedAt: Date;
  readonly expiresAt: Date;
}
