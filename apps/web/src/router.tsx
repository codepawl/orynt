import { createRouter } from "@tanstack/react-router";

import { Route as rootRoute } from "./routes/__root";
import { Route as siteRoute } from "./routes/site";
import { Route as homeRoute } from "./routes/index";
import { Route as pricingRoute } from "./routes/pricing";
import { Route as productsRoute } from "./routes/products";
import { Route as productsIndexRoute } from "./routes/products.index";
import { Route as productDetailRoute } from "./routes/products.$slug";
import { Route as researchRoute } from "./routes/research";
import { Route as blogRoute } from "./routes/blog";
import { Route as cloudRoute } from "./routes/cloud";
import { Route as cloudEvidenceRoute } from "./routes/cloud.evidence";
import { Route as cloudWaitlistRoute } from "./routes/cloud.waitlist";
import { Route as contactRoute } from "./routes/contact";
import { Route as careersRoute } from "./routes/careers";
import { Route as newsletterConfirmRoute } from "./routes/newsletter.confirm";
import { Route as cloudWaitlistApiRoute } from "./routes/api.cloud.waitlist";
import { Route as githubMarketplaceRoute } from "./routes/api.github.marketplace";
import { Route as docsRoute } from "./routes/docs";
import { Route as docsIndexRoute } from "./routes/docs.index";
import { Route as docsProductRoute } from "./routes/docs.$";
import { Route as openpawlRoute } from "./routes/openpawl";
import { Route as openpawlInstallRoute } from "./routes/openpawl.install";
import { Route as openpawlDocsRoute } from "./routes/openpawl.docs";
import { Route as openpawlSupportRoute } from "./routes/openpawl.support";
import { Route as statusRoute } from "./routes/status";
import { Route as privacyRoute } from "./routes/privacy";
import { Route as termsRoute } from "./routes/terms";
import { Route as securityRoute } from "./routes/security";

const routeTree = rootRoute.addChildren([
  siteRoute.addChildren([
    homeRoute,
    pricingRoute,
    productsRoute.addChildren([productsIndexRoute, productDetailRoute]),
    researchRoute,
    blogRoute,
    cloudRoute,
    cloudEvidenceRoute,
    cloudWaitlistRoute,
    contactRoute,
    careersRoute,
    newsletterConfirmRoute,
    openpawlRoute,
    openpawlInstallRoute,
    openpawlDocsRoute,
    openpawlSupportRoute,
    statusRoute,
    privacyRoute,
    termsRoute,
    securityRoute,
    docsRoute.addChildren([docsIndexRoute, docsProductRoute]),
  ]),
  cloudWaitlistApiRoute,
  githubMarketplaceRoute,
]);

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
