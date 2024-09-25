const Koa = require('koa');
const Router = require('@koa/router');
const { bodyParser } = require('@koa/bodyparser');
const { shopifyApp } = require('@ingenierias-lentas/shopify-app-koa'); // Assuming you are using your own package version
const { DeliveryMethod } = require('@shopify/shopify-api');

const PORT = 8080;

const shopify = shopifyApp({
  api: {
    apiKey: 'ApiKeyFromPartnersDashboard',
    apiSecretKey: 'ApiSecretKeyFromPartnersDashboard',
    scopes: ['your_scopes'],
    hostScheme: 'http',
    hostName: `localhost:${PORT}`,
  },
  auth: {
    path: '/api/auth',
    callbackPath: '/api/auth/callback',
  },
  webhooks: {
    path: '/api/webhooks',
  },
});

function handleWebhookRequest(
    topic,
    shop,
    webhookRequestBody,
    webhookId,
    apiVersion,
    context
) {
    const sessionId = shopify.session.getOfflineId(shop);

    // Run your webhook-processing code here!
}
const webhookHandlers = {
    TEST_TOPIC: [
        {
            deliveryMethod: DeliveryMethod.Http,
            callbackUrl: '/api/webhooks',
            callback: handleWebhookRequest,
        },
    ],
};

const app = new Koa();
const router = new Router();

// Add body parser for handling POST requests
app.use(bodyParser({
    enableTypes: ['json', 'text'], // Enable both JSON and text parsing
    encoding: 'utf-8',
    extendTypes: {
        text: ['text/plain'], // Only treat text/plain as text
    },
}));

// Shopify Auth Routes
router.get(shopify.config.auth.path, shopify.auth.begin());
router.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot(),
);

// Shopify Webhook handling route
router.post(
  shopify.config.webhooks.path,
  ...shopify.processWebhooks({ webhookHandlers })
);

// Root route with Shopify installation check
router.get('/', shopify.ensureInstalledOnShop(), async (ctx) => {
  ctx.body = 'Hello world!';
});

// Apply routes and middleware
app.use(router.routes()).use(router.allowedMethods());

app.listen(PORT, () => console.log(`Server started on http://localhost:${PORT}`));
