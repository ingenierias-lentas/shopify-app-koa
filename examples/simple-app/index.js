const Koa = require('koa');
const Router = require('@koa/router');
const { bodyParser } = require('@koa/bodyparser');
const { shopifyApp } = require('@ingenierias-lentas/shopify-app-koa'); // Assuming you are using your own package version
const { DeliveryMethod } = require('@shopify/shopify-api');
const { SHOPIFY_HOST } = require('@shopify/shopify-api/test-helpers');

require('dotenv').config();

const {
    SHOPIFY_API_KEY,
    SHOPIFY_API_SECRET,
    SHOPIFY_HOST_SCHEME,
    SHOPIFY_HOST_NAME,
} = process.env;

const shopify = shopifyApp({
  api: {
    apiKey: SHOPIFY_API_KEY,
    apiSecretKey: SHOPIFY_API_SECRET,
    scopes: [''],
    hostScheme: SHOPIFY_HOST_SCHEME,
    hostName: SHOPIFY_HOST_NAME,
    isEmbeddedApp: false,
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
    console.log(`Webhook received for shop ${shop} with session ID ${sessionId}`);
    console.log(`Request: ${JSON.stringify(context.request)}`);

    // Run your webhook-processing code here!
}
const webhookHandlers = {
    CUSTOMERS_DATA_REQUEST: [
        {
            deliveryMethod: DeliveryMethod.Http,
            callback: handleWebhookRequest,
            callbackUrl: '/api/webhooks',
        }
    ],
    CUSTOMERS_REDACT: [
        {
            deliveryMethod: DeliveryMethod.Http,
            callback: handleWebhookRequest,
            callbackUrl: '/api/webhooks',
        }
    ],
    SHOP_REDACT: [
        {
            deliveryMethod: DeliveryMethod.Http,
            callback: handleWebhookRequest,
            callbackUrl: '/api/webhooks',
        }
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
router.get('/', shopify.validateAuthenticatedSession(), async (ctx) => {
  ctx.body = 'Hello world!';
});

// Apply routes and middleware
app.use(router.routes()).use(router.allowedMethods());

app.listen(PORT, () => console.log(`Server started on ${SHOPIFY_HOST_SCHEME}://${SHOPIFY_HOST_NAME}`));
