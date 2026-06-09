import { Link as RouterLink, type LinkProps as RouterLinkProps } from "@tanstack/react-router";
import type { ComponentProps } from "react";

type AppLinkProps = Omit<ComponentProps<typeof RouterLink>, "to"> & {
  href: string;
};

export function Link({ href, ...props }: AppLinkProps) {
  return <RouterLink to={href as RouterLinkProps["to"]} {...props} />;
}
