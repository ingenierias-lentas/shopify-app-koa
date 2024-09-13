import request from 'supertest';
import Koa, {Context} from 'koa';
import Router from '@koa/router';
import {
  BotActivityDetected,
  CookieNotFound,
  DeliveryMethod,
  InvalidOAuthError,
  LogSeverity,
  Session,
} from '@shopify/shopify-api';

import {BASE64_HOST, shopify, SHOPIFY_HOST} from '../../__tests__/test-helper';

const TEST_SHOP = 'my-shop.myshopify.io';

describe('auth', () => {
  let app: Koa;
  let router: Router;

  beforeEach(async () => {
    app = new Koa();
    router = new Router();
    
    // Add routes for auth and callback
    router.get('/auth', shopify.auth.begin());
    router.get(
      '/auth/callback',
      shopify.auth.callback(),
      shopify.redirectToShopifyOrAppRoot(),
    );
    
    app.use(router.routes()).use(router.allowedMethods());
  });

  describe('begin', () => {
    it('triggers library auth start', async () => {
      const beginMock = jest.spyOn(shopify.api.auth, 'begin');
      beginMock.mockImplementationOnce(async ({rawResponse}) => {
        rawResponse.writeHead(302, { Location: 'https://oauth-url' });
        rawResponse.end();
      });

      const response = await request(app.callback())
        .get(`/auth?shop=${TEST_SHOP}`)
        .expect(302);

      expect(beginMock).toHaveBeenCalledWith(
        expect.objectContaining({
          callbackPath: '/auth/callback',
          isOnline: shopify.config.useOnlineTokens,
          shop: TEST_SHOP,
        }),
      );
      expect(response.header.location).toBe('https://oauth-url');
    });
  });

  describe('callback', () => {
    let callbackMock: jest.SpyInstance;
    let session: Session;
    
    beforeEach(async () => {
      session = new Session({
        id: 'test-session',
        isOnline: shopify.config.useOnlineTokens,
        shop: TEST_SHOP,
        state: '1234',
        accessToken: 'test-access-token',
      });

      callbackMock = jest.spyOn(shopify.api.auth, 'callback');
    });

    describe('when successful', () => {
      beforeEach(() => {
        callbackMock.mockResolvedValueOnce({session, headers: undefined});
      });

      it('redirects to app', async () => {
        jest.spyOn(shopify.api.webhooks, 'register').mockResolvedValueOnce({});

        const response = await request(app.callback())
          .get(`/auth/callback?host=${BASE64_HOST}`)
          .expect(302);

        const url = new URL(response.header.location);
        expect(url.host).toBe(SHOPIFY_HOST);
        expect(url.pathname).toBe(`/apps/${shopify.api.config.apiKey}`);
      });

      describe('with webhooks', () => {
        let registerMock: jest.SpyInstance;
        
        beforeEach(() => {
          shopify.api.webhooks.addHandlers({
            TEST_TOPIC: {
              deliveryMethod: DeliveryMethod.Http,
              callbackUrl: '/webhooks',
              callback: async () => {},
            },
          });

          registerMock = jest.spyOn(shopify.api.webhooks, 'register');
        });

        it('registers webhooks', async () => {
          registerMock.mockResolvedValueOnce({
            TEST_TOPIC: [
              {
                success: true,
                result: {},
              },
            ],
          });

          await request(app.callback())
            .get(`/auth/callback?host=${BASE64_HOST}`)
            .expect(302);

          expect(registerMock).toHaveBeenCalledWith({
            session: expect.objectContaining({
              shop: TEST_SHOP,
              accessToken: 'test-access-token',
            }),
          });
        });

        it('logs when registration fails', async () => {
          const errorMessage = 'Test result errors';
          registerMock.mockResolvedValueOnce({
            TEST_TOPIC: [
              {
                success: false,
                result: {errors: [{message: errorMessage}]},
              },
            ],
          });

          await request(app.callback())
            .get(`/auth/callback?host=${BASE64_HOST}`)
            .expect(302);

          expect(
            shopify.api.config.logger.log as jest.Mock,
          ).toHaveBeenCalledWith(
            LogSeverity.Error,
            expect.stringContaining(errorMessage),
          );

          // Reset the callback mock
          callbackMock.mockResolvedValueOnce({session, headers: undefined});
          registerMock.mockResolvedValueOnce({
            TEST_TOPIC: [
              {
                success: false,
                result: {data: {message: errorMessage}},
              },
            ],
          });

          await request(app.callback())
            .get(`/auth/callback?host=${BASE64_HOST}`)
            .expect(302);

          expect(
            shopify.api.config.logger.log as jest.Mock,
          ).toHaveBeenCalledWith(
            LogSeverity.Error,
            expect.stringContaining(errorMessage),
          );
        });
      });
    });

    describe('fails', () => {
      it('restarts OAuth if CookieNotFound', async () => {
        const errorMessage = 'Test no cookie found';
        callbackMock.mockRejectedValueOnce(new CookieNotFound(errorMessage));

        const beginMock = jest.spyOn(shopify.api.auth, 'begin');
        beginMock.mockImplementationOnce(async ({rawResponse}) => {
          rawResponse.writeHead(302, { Location: 'https://oauth-url' });
          rawResponse.end();
        });

        const response = await request(app.callback())
          .get(`/auth/callback?shop=${TEST_SHOP}&host=${BASE64_HOST}`)
          .expect(302);

        expect(beginMock).toHaveBeenCalledWith(
          expect.objectContaining({
            callbackPath: '/auth/callback',
            isOnline: shopify.config.useOnlineTokens,
            shop: TEST_SHOP,
          }),
        );
        expect(response.header.location).toBe('https://oauth-url');

        expect(shopify.api.config.logger.log as jest.Mock).toHaveBeenCalledWith(
          LogSeverity.Error,
          expect.stringContaining(errorMessage),
        );
      });

      it('fails if the request is invalid', async () => {
        const errorMessage = 'Test invalid auth';
        callbackMock.mockRejectedValueOnce(new InvalidOAuthError(errorMessage));

        await request(app.callback())
          .get(`/auth/callback?shop=${TEST_SHOP}&host=${BASE64_HOST}`)
          .expect(400)
          .expect(errorMessage);

        expect(shopify.api.config.logger.log as jest.Mock).toHaveBeenCalledWith(
          LogSeverity.Error,
          expect.stringContaining(errorMessage),
        );
      });

      it('fails if the request is detected as a bot', async () => {
        const errorMessage = 'Test bot detected';
        callbackMock.mockRejectedValueOnce(
          new BotActivityDetected(errorMessage),
        );

        await request(app.callback())
          .get(`/auth/callback?shop=${TEST_SHOP}&host=${BASE64_HOST}`)
          .expect(410)
          .expect(errorMessage);

        expect(shopify.api.config.logger.log as jest.Mock).toHaveBeenCalledWith(
          LogSeverity.Error,
          expect.stringContaining(errorMessage),
        );
      });

      it('borks on unknown errors', async () => {
        const errorMessage = 'Unknown error';
        callbackMock.mockRejectedValueOnce(new Error(errorMessage));

        await request(app.callback())
          .get(`/auth/callback?shop=${TEST_SHOP}&host=${BASE64_HOST}`)
          .expect(500)
          .expect(errorMessage);

        expect(shopify.api.config.logger.log as jest.Mock).toHaveBeenCalledWith(
          LogSeverity.Error,
          expect.stringContaining(errorMessage),
        );
      });
    });
  });
});

describe('auth with action after callback', () => {
  const afterAuth = jest.fn();

  let app: Koa;
  let router: Router;

  beforeEach(async () => {
    app = new Koa();
    router = new Router();

    router.get('/auth', shopify.auth.begin());
    router.get('/auth/callback', shopify.auth.callback(), afterAuth);

    app.use(router.routes()).use(router.allowedMethods());
  });

  let session: Session;
  beforeEach(async () => {
    session = new Session({
      id: 'test-session',
      isOnline: shopify.config.useOnlineTokens,
      shop: TEST_SHOP,
      state: '1234',
      accessToken: 'test-access-token',
    });

    jest
      .spyOn(shopify.api.auth, 'callback')
      .mockResolvedValueOnce({session, headers: undefined});
    jest.spyOn(shopify.api.webhooks, 'register').mockResolvedValueOnce({});
  });

  afterEach(() => {
    afterAuth.mockReset();
  });

  it('triggers callback', async () => {
    afterAuth.mockImplementation(async (ctx: Context, next: () => Promise<void>) => {
      expect(ctx.state.shopify.session).toEqual(session);
      await shopify.redirectToShopifyOrAppRoot()(ctx, next);
    });

    const response = await request(app.callback())
      .get(`/auth/callback?shop=${TEST_SHOP}&host=${BASE64_HOST}`)
      .expect(302);

    const url = new URL(response.header.location);
    expect(url.host).toBe(SHOPIFY_HOST);
    expect(url.pathname).toBe(`/apps/${shopify.api.config.apiKey}`);
    expect(afterAuth).toHaveBeenCalled();
  });

  it('allows redirecting to arbitrary addresses', async () => {
    afterAuth.mockImplementation(async (ctx: Context) => {
      ctx.redirect('https://example.com');
    });

    const response = await request(app.callback())
      .get(`/auth/callback?shop=${TEST_SHOP}&host=${BASE64_HOST}`)
      .expect(302);

    expect(response.header.location).toMatch(/^https:\/\/example\.com\/?$/);
    expect(afterAuth).toHaveBeenCalled();
  });
});

