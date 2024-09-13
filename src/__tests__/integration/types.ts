import {WebhookHandler} from '@shopify/shopify-api';

export type CookiesType = Record<string, string>;

export interface CallbackInfo {
  params: URLSearchParams;
  cookies: string[];
}

export interface OAuthTestCase {
  embedded: boolean;
  online: boolean;
  host: string;
  existingWebhooks: boolean;
}

export interface AppUninstalledTestCase {
  handler: WebhookHandler;
  expectWrap: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockResponse: Record<string, any>;
  expectedQuery: string;
}
