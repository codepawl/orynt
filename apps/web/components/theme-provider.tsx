import { ThemeProvider as NextThemesProvider } from "@wrksz/themes/next";
import type { ComponentProps, ReactNode } from "react";

type Props = Omit<ComponentProps<typeof NextThemesProvider>, "children"> & {
  children: ReactNode;
};

export function ThemeProvider({ children, ...rest }: Props) {
  return <NextThemesProvider {...rest}>{children}</NextThemesProvider>;
}
