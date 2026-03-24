"use client";

import React, { useMemo } from "react";
import { ConfigProvider, theme as antTheme } from "antd";
import { useTheme } from "next-themes";

export function AntdConfigProvider({ children }: { children: React.ReactNode }) {
  const { theme, systemTheme } = useTheme();
  const currentTheme = theme === "system" ? (systemTheme || "light") : (theme || "light");
  const isDark = currentTheme === "dark";

  const themeConfig = useMemo(() => ({
    algorithm:
      isDark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorText: isDark ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.88)",
      colorTextSecondary: isDark ? "rgba(255, 255, 255, 0.65)" : "rgba(0, 0, 0, 0.55)",
      colorTextTertiary: isDark ? "rgba(255, 255, 255, 0.45)" : "rgba(0, 0, 0, 0.35)",
      colorTextHeading: isDark ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.88)",
      colorPrimary: isDark ? "#ffffff" : "#000000",
      colorPrimaryHover: isDark ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.8)",
      colorPrimaryActive: isDark ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 0, 0, 0.7)",
      fontFamily: "var(--font-inter), system-ui, sans-serif",
      fontFamilyCode: "var(--font-jetbrains-mono), monospace",
    },
    components: {
      Menu: {
        itemColor: isDark ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.88)",
        itemSelectedColor: isDark ? "rgba(255, 255, 255, 1)" : "rgba(0, 0, 0, 0.88)",
        itemHoverColor: isDark ? "rgba(255, 255, 255, 1)" : "rgba(0, 0, 0, 0.88)",
        itemActiveBg: "transparent",
        itemSelectedBg: "transparent",
        subMenuItemBg: "transparent",
        popupBg: isDark ? "#141414" : "#ffffff",
        activeBarWidth: 0,
        activeBarHeight: 0,
        activeBarBorderWidth: 0,
      },
      Button: {
        primaryColor: isDark ? "#000000" : "#ffffff",
        defaultBg: "transparent",
        defaultColor: isDark ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.88)",
        defaultBorderColor: isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.3)",
        defaultHoverBg: isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)",
        defaultHoverColor: isDark ? "rgba(255, 255, 255, 1)" : "rgba(0, 0, 0, 1)",
        defaultHoverBorderColor: isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)",
        fontFamily: "var(--font-inter), system-ui, sans-serif",
        fontWeight: 600,
      },
      Typography: {
        fontFamily: "var(--font-inter), system-ui, sans-serif",
        fontFamilyCode: "var(--font-jetbrains-mono), monospace",
      },
      List: {
        itemPadding: "16px 0",
      },
      Card: {
        headerBg: isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.02)",
        actionsBg: isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.02)",
      },
      Table: {
        headerBg: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.02)",
        headerColor: isDark ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.88)",
        borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.06)",
      },
      Segmented: {
        itemSelectedBg: isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.08)",
        itemSelectedColor: isDark ? "#ffffff" : "#000000",
        itemColor: isDark ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.4)",
        itemHoverColor: isDark ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.88)",
        trackBg: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)",
        trackPadding: 2,
        borderRadiusSM: 6,
      },
      Spin: {
        colorPrimary: isDark ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.88)",
      },
    },
  }), [isDark]);

  return (
    <ConfigProvider theme={themeConfig}>
      {children}
    </ConfigProvider>
  );
}
