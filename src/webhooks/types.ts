import { Context } from 'koa';
import { Shopify, WebhookHandler } from '@shopify/shopify-api';

import { AppConfigInterface } from '../config-types';

export type WebhookHandlersParam = Record<
  string,
  WebhookHandler | WebhookHandler[]
>;

export interface WebhookProcessParams {
  ctx: Context;
  api: Shopify;
  config: AppConfigInterface;
}

export interface ProcessWebhooksMiddlewareParams {
  webhookHandlers: WebhookHandlersParam;
}

export type ProcessWebhooksMiddleware = (
  params: ProcessWebhooksMiddlewareParams,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Array<(ctx: Context, next: () => Promise<any>) => Promise<void>>;
