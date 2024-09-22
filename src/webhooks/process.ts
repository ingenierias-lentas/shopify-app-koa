import { WebhookProcessParams } from './types';

export async function process({
  ctx,
  api,
  config,
}: WebhookProcessParams): Promise<void> {
  try {
    const isJson = ctx.request.is('application/json');
    const rawBody = isJson ? JSON.stringify(ctx.request.body) : ctx.request.body;
    await api.webhooks.process({
      rawBody: rawBody,
      rawRequest: ctx.req, // Koa's raw Node.js request object
      rawResponse: ctx.res, // Koa's raw Node.js response object
    });

    config.logger.info('Webhook processed, returned status code 200');
  } catch (error) {
    config.logger.error(`Failed to process webhook: ${error}`);

    // Koa automatically handles the response flow, similar to Express
  }
}
