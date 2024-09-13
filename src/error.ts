export class ShopifyAppError extends Error {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(...args: any) {
    super(...args);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SessionStorageError extends ShopifyAppError {}
