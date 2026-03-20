export class DocumentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentNotFoundError';
  }
}

export class DocumentCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentCreationError';
  }
}

export class DocumentConflictResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentConflictResolutionError';
  }
}
