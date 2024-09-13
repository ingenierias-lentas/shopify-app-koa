import { Context } from 'koa';
import {Shopify} from '@shopify/shopify-api';

import {AppConfigInterface} from './config-types';

export interface ApiAndConfigParams {
  api: Shopify;
  config: AppConfigInterface;
}

export interface RedirectToAuthParams extends ApiAndConfigParams {
  ctx: Context;
  isOnline?: boolean;
}

export interface RedirectOutOfAppInnerParams {
  ctx: Context;
  redirectUri: string;
  shop: string;
}

export type RedirectOutOfAppFunction = (
  params: RedirectOutOfAppInnerParams,
) => void;
