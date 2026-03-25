"use client";
import * as React from "react";
import { useTheme } from "next-themes";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";
import { CircleHalf } from "react-bootstrap-icons";
import { motion } from "motion/react";

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

export const ThemeSwitch: React.FC = React.memo(() => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = React.useCallback(() => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  }, [theme, setTheme]);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center w-9 h-9 rounded-md border border-neutral-300 dark:border-neutral-700">
        <CircleHalf
          className="h-5 w-5 text-neutral-900 dark:text-neutral-100"
          aria-hidden="true"
        />
      </div>
    );
  }

  const currentTheme = theme === "dark" ? "dark" : "light";

  return (
    <motion.button
      id="theme-toggle"
      aria-label={`${currentTheme} mode`}
      onClick={toggleTheme}
      className="flex items-center justify-center w-9 h-9 rounded-md border border-neutral-300 dark:border-neutral-700 hover:opacity-80 hover:border-neutral-400 dark:hover:border-neutral-600"
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.15 }}
    >
      <CircleHalf className="h-5 w-5 text-neutral-900 dark:text-neutral-100" />
    </motion.button>
  );
});

ThemeSwitch.displayName = "ThemeSwitch";
