export interface WebSearchClient {
  search(query: string, systemContext?: string): Promise<WebSearchResult>;
}

export interface WebSearchResult {
  readonly query: string;
  readonly content: string;
  readonly sourceUrls: readonly string[];
}
