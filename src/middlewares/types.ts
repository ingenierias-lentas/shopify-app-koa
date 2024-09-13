import { Context, Next } from 'koa';

// Define the type for a Koa middleware function
export type KoaMiddleware = (ctx: Context, next: Next) => Promise<void>;

export type ValidateAuthenticatedSessionMiddleware = () => KoaMiddleware;
export type EnsureInstalledMiddleware = () => KoaMiddleware;
export type CspHeadersMiddleware = () => KoaMiddleware;
export type RedirectToShopifyOrAppRootMiddleware = () => KoaMiddleware;
