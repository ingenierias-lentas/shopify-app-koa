import Koa from 'koa';
import bodyParser from '@koa/bodyparser';
import Router from '@koa/router';
import request from 'supertest';
import {LATEST_API_VERSION, LogSeverity} from '@shopify/shopify-api';

import {AppInstallations} from '../../app-installations';
import {
  MockBody,
  mockShopifyResponses,
  shopify,
  TEST_SHOP,
  TEST_WEBHOOK_ID,
  validWebhookHeaders,
} from '../test-helper';

import {AppUninstalledTestCase} from './types';
import * as mockResponses from './responses';
import {
  convertBeginResponseToCallbackInfo,
  EVENT_BRIDGE_HANDLER,
  httpHandlerMock,
  HTTP_HANDLER,
  PUBSUB_HANDLER,
} from './utils';

const APP_UNINSTALLED_TEST_CASES: AppUninstalledTestCase[] = [
  {
    handler: {...HTTP_HANDLER, callbackUrl: '/test/webhooks'},
    expectWrap: true,
    mockResponse: mockResponses.HTTP_WEBHOOK_CREATE_RESPONSE,
    expectedQuery: 'webhookSubscriptionCreate(\n      topic: APP_UNINSTALLED',
  },
  {
    handler: {...EVENT_BRIDGE_HANDLER},
    expectWrap: false,
    mockResponse: mockResponses.EVENT_BRIDGE_WEBHOOK_CREATE_RESPONSE,
    expectedQuery:
      'eventBridgeWebhookSubscriptionCreate(\n      topic: APP_UNINSTALLED',
  },
  {
    handler: {...PUBSUB_HANDLER},
    expectWrap: false,
    mockResponse: mockResponses.PUBSUB_WEBHOOK_CREATE_RESPONSE,
    expectedQuery:
      'pubSubWebhookSubscriptionCreate(\n      topic: APP_UNINSTALLED',
  },
];

describe('webhook integration', () => {
  describe('APP_UNINSTALLED wrapping', () => {
    APP_UNINSTALLED_TEST_CASES.forEach((config) => {
      describe(`test ${JSON.stringify(config)}`, () => {
        let app: Koa;
        let router: Router;

        beforeEach(() => {
          shopify.config.webhooks.path = '/test/webhooks';

          app = new Koa();
          router = new Router();

          router.get('/test/auth', shopify.auth.begin());

          router.get(
            '/test/auth/callback',
            shopify.auth.callback(),
            shopify.redirectToShopifyOrAppRoot(),
          );

          router.post('/test/webhooks',
            ...shopify.processWebhooks({webhookHandlers: {APP_UNINSTALLED: config.handler}})
          );

          app.use(bodyParser({
            enableTypes: ['json', 'text'], // Enable both JSON and text parsing
            encoding: 'utf-8',
            jsonLimit: '1mb', // Adjust the limit as needed
            textLimit: '1mb',
            extendTypes: {
              text: ['text/plain'], // Only treat text/plain as text
            },
          }));
          app.use(router.routes()).use(router.allowedMethods());
        });

        afterEach(() => {
          httpHandlerMock.mockReset();
        });

        it('registers and triggers as expected', async () => {
          const responses: [MockBody][] = [
            [mockResponses.OFFLINE_ACCESS_TOKEN_RESPONSE],
            [mockResponses.EMPTY_WEBHOOK_RESPONSE],
          ];

          if (config.expectWrap) {
            expect(
              shopify.api.config.logger.log as jest.Mock,
            ).toHaveBeenCalledWith(
              LogSeverity.Info,
              expect.stringContaining(
                "Detected multiple handlers for 'APP_UNINSTALLED', webhooks.process will call them sequentially",
              ),
            );
          } else {
            expect(
              shopify.api.config.logger.log as jest.Mock,
            ).not.toHaveBeenCalledWith(
              LogSeverity.Info,
              expect.stringContaining(
                "Detected multiple handlers for 'APP_UNINSTALLED', webhooks.process will call them sequentially",
              ),
            );

            responses.push([config.mockResponse]);
          }

          responses.push([mockResponses.HTTP_WEBHOOK_CREATE_RESPONSE]);

          mockShopifyResponses(...responses);

          await performOAuth(app);

          const webhookQueries = ['webhookSubscriptions('];
          if (!config.expectWrap) {
            webhookQueries.push(config.expectedQuery);
          }
          webhookQueries.push(
            'webhookSubscriptionCreate(\n      topic: APP_UNINSTALLED',
          );

          webhookQueries.forEach((query) =>
            expect({
              method: 'POST',
              url: `https://${TEST_SHOP}/admin/api/${LATEST_API_VERSION}/graphql.json`,
              body: expect.objectContaining({
                query: expect.stringContaining(query),
              }),
            }).toMatchMadeHttpRequest(),
          );

          const appInstallations = new AppInstallations(shopify.config);
          expect(await appInstallations.includes(TEST_SHOP)).toBe(true);

          await triggerWebhook(app);

          expect(
            shopify.api.config.logger.log as jest.Mock,
          ).toHaveBeenCalledWith(
            LogSeverity.Info,
            expect.stringContaining(
              'Webhook processed, returned status code 200',
            ),
          );

          expect(await appInstallations.includes(TEST_SHOP)).toBe(false);

          if (config.expectWrap) {
            expect(httpHandlerMock).toHaveBeenCalledWith(
              'APP_UNINSTALLED',
              TEST_SHOP,
              '{}',
              TEST_WEBHOOK_ID,
              LATEST_API_VERSION,
              undefined,
            );
          }
        });
      });
    });
  });
});

async function performOAuth(app: Koa) {
  const beginResponse = await request(app.callback())
    .get(`/test/auth?shop=${TEST_SHOP}`)
    .expect(302);

  const callbackInfo = convertBeginResponseToCallbackInfo(
    beginResponse,
    shopify.api.config.apiSecretKey,
    TEST_SHOP,
  );

  await request(app.callback())
    .get(`/test/auth/callback?${callbackInfo.params.toString()}`)
    .set('Cookie', callbackInfo.cookies)
    .expect(302);

  expect({
    method: 'POST',
    url: `https://${TEST_SHOP}/admin/oauth/access_token`,
    body: {
      client_id: shopify.api.config.apiKey,
      client_secret: shopify.api.config.apiSecretKey,
      code: callbackInfo.params.get('code'),
    },
  }).toMatchMadeHttpRequest();
}

async function triggerWebhook(app: Koa) {
  const body = JSON.stringify({});

  await request(app.callback())
    .post('/test/webhooks')
    .set('Content-Type', 'application/json') // Ensure this header is set
    .set(
      validWebhookHeaders(
        'APP_UNINSTALLED',
        body,
        shopify.api.config.apiSecretKey,
      ),
    )
    .send(body)
    .expect(200);
}
