/**
 * Represents a stored memory document.
 */
export interface MemoryDocument {
  readonly id: string;
  readonly content: string;
  readonly metadata: Record<string, unknown>;
  readonly timestamp: string;
  readonly embedding?: ReadonlyArray<number>;
}

/**
 * Interface for long-term semantic memory storage and retrieval.
 */
export interface SemanticMemoryStore {
  save(document: MemoryDocument): Promise<void>;
  query(text: string, limit?: number): Promise<ReadonlyArray<MemoryDocument>>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Interface for short-term working session memory storage.
 */
export interface SessionMemoryStore {
  get(sessionId: string): Promise<Record<string, unknown> | null>;
  set(sessionId: string, state: Record<string, unknown>, ttlSeconds?: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

/**
 * MemoryManager aggregates short-term session memory and long-term semantic memory.
 */
export class MemoryManager {
  private readonly sessionStore: SessionMemoryStore;
  private readonly semanticStore: SemanticMemoryStore;

  constructor(sessionStore: SessionMemoryStore, semanticStore: SemanticMemoryStore) {
    this.sessionStore = sessionStore;
    this.semanticStore = semanticStore;
  }

  public getSessions(): SessionMemoryStore {
    return this.sessionStore;
  }

  public getSemanticStore(): SemanticMemoryStore {
    return this.semanticStore;
  }
}

/**
 * Simple in-memory implementation of SessionMemoryStore for local development.
 */
export class LocalSessionMemoryStore implements SessionMemoryStore {
  private readonly store = new Map<string, Record<string, unknown>>();

  public async get(sessionId: string): Promise<Record<string, unknown> | null> {
    return this.store.get(sessionId) ?? null;
  }

  public async set(sessionId: string, state: Record<string, unknown>): Promise<void> {
    this.store.set(sessionId, { ...state });
  }

  public async delete(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }
}

/**
 * Simple in-memory implementation of SemanticMemoryStore for local development.
 * Stubs semantic search with substring queries or simple Jaccard similarity.
 */
export class LocalSemanticMemoryStore implements SemanticMemoryStore {
  private documents: MemoryDocument[] = [];

  public async save(document: MemoryDocument): Promise<void> {
    // Avoid duplicates
    this.documents = this.documents.filter(doc => doc.id !== document.id);
    this.documents.push({ ...document });
  }

  public async query(text: string, limit: number = 5): Promise<ReadonlyArray<MemoryDocument>> {
    const queryLower = text.toLowerCase();
    
    // Sort documents based on simple word-match count (mock semantic relevance)
    return this.documents
      .map(doc => {
        const docText = doc.content.toLowerCase();
        let matches = 0;
        const words = queryLower.split(/\s+/);
        for (const word of words) {
          if (word && docText.includes(word)) {
            matches++;
          }
        }
        return { doc, score: matches };
      })
      .filter(item => item.score > 0 || text === "")
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.doc);
  }

  public async delete(id: string): Promise<void> {
    this.documents = this.documents.filter(doc => doc.id !== id);
  }

  public async clear(): Promise<void> {
    this.documents = [];
  }
}
