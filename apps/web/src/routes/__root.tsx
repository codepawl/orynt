import type { ReactNode } from "react";

import { AppProviders } from "@/components/app-providers";
import { GlobalErrorPage } from "@/components/global-error";
import { NotFoundPage } from "@/components/not-found";
import "../../app/globals.css";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased bg-ink-0 text-fg-1">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CodePawl" },
      {
        name: "description",
        content:
          "Debugging, memory, coordination, and optimization infrastructure for AI agents.",
      },
      { name: "theme-color", content: "#07090C", media: "(prefers-color-scheme: dark)" },
      { name: "theme-color", content: "#ffffff", media: "(prefers-color-scheme: light)" },
    ],
    links: [
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "shortcut icon", href: "/favicon.svg" },
    ],
  }),
  component: RootRouteComponent,
  errorComponent: GlobalErrorPage,
  notFoundComponent: NotFoundPage,
});

function RootRouteComponent() {
  return (
    <RootDocument>
      <AppProviders>
        <Outlet />
      </AppProviders>
    </RootDocument>
  );
}

export { RootDocument };
