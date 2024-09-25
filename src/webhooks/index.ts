import Koa from 'koa';
//import Router from '@koa/router';
import {bodyParser} from '@koa/bodyparser'; // Koa body parsing middleware for JSON/text
import { AddHandlersParams, DeliveryMethod, Shopify } from '@shopify/shopify-api';

import { AppConfigInterface } from '../config-types';
import { ApiAndConfigParams } from '../types';
import { AppInstallations } from '../app-installations';
import { deleteAppInstallationHandler } from '../middlewares';

import {
  ProcessWebhooksMiddleware,
  ProcessWebhooksMiddlewareParams,
  WebhookHandlersParam,
} from './types';
import { process } from './process';

export function processWebhooks({
  api,
  config,
}: ApiAndConfigParams): ProcessWebhooksMiddleware {
  return function ({ webhookHandlers }: ProcessWebhooksMiddlewareParams) {
    // Mount the webhooks to the Shopify API
    mountWebhooks(api, config, webhookHandlers);

    // Return Koa middleware chain
    return [
      bodyParser({ enableTypes: ['text'], textLimit: '500kb', encoding: 'utf-8' }), // Parse text body
      async (ctx: Koa.Context, next: () => Promise<void>) => {
        // Call the process function for webhook handling
        await process({
          ctx,
          api,
          config,
        });
        await next();
      },
    ];
  };
}

function mountWebhooks(
  api: Shopify,
  config: AppConfigInterface,
  handlers: WebhookHandlersParam,
) {
  // Add custom webhook handlers to Shopify API
  api.webhooks.addHandlers(handlers as AddHandlersParams);

  // Add our custom app uninstalled webhook handler
  const appInstallations = new AppInstallations(config);

  api.webhooks.addHandlers({
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: config.webhooks.path,
      callback: deleteAppInstallationHandler(appInstallations, config),
    },
  });
}
