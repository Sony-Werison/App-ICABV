"use client";
import type { CSSProperties, ReactNode } from "react";
type NativeStyle = Record<string, string | number | undefined>;
type Style = NativeStyle | Style[] | false | undefined;
function style(value: Style): CSSProperties {
  if (!value) return {};
  if (Array.isArray(value)) return Object.assign({}, ...value.map(style));
  const result: Record<string, string | number | undefined> = {};
  for (const [key, v] of Object.entries(value)) {
    if (key === "marginHorizontal" || key === "paddingHorizontal") {
      result[key.startsWith("margin") ? "marginInline" : "paddingInline"] = v;
      continue;
    }
    if (key === "marginVertical" || key === "paddingVertical") {
      result[key.startsWith("margin") ? "marginBlock" : "paddingBlock"] = v;
      continue;
    }
    result[key] = key === "lineHeight" && typeof v === "number" ? `${v}px` : v;
  }
  if (result.borderWidth) result.borderStyle = "solid";
  return result as CSSProperties;
}
export function View({
  children,
  style: s,
}: {
  children?: ReactNode;
  style?: Style;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        ...style(s),
      }}
    >
      {children}
    </div>
  );
}
export function Text({
  children,
  style: s,
  accessibilityRole,
}: {
  children?: ReactNode;
  style?: Style;
  accessibilityRole?: string;
}) {
  return (
    <div
      role={accessibilityRole === "header" ? "heading" : undefined}
      aria-level={accessibilityRole === "header" ? 2 : undefined}
      style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", ...style(s) }}
    >
      {children}
    </div>
  );
}
export function ScrollView({
  children,
  horizontal,
  contentContainerStyle,
}: {
  children: ReactNode;
  horizontal?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  contentContainerStyle?: Style;
}) {
  return (
    <div
      style={{
        overflowX: horizontal ? "auto" : undefined,
        display: "flex",
        flexDirection: horizontal ? "row" : "column",
        ...style(contentContainerStyle),
      }}
    >
      {children}
    </div>
  );
}
export const Linking = {
  async openURL(value: string) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password)
      throw Error("invalid_url");
    window.open(url.href, "_blank", "noopener,noreferrer");
  },
};
export const Share = {
  async share({ title, message }: { title: string; message: string }) {
    if (navigator.share) await navigator.share({ title, text: message });
    else await navigator.clipboard.writeText(message);
  },
};
export const AppState = {
  get currentState(): string {
    return typeof document === "undefined" ||
      document.visibilityState === "visible"
      ? "active"
      : "background";
  },
  addEventListener(_event: string, callback: (state: string) => void) {
    const handler = () =>
      callback(
        document.visibilityState === "visible" ? "active" : "background",
      );
    document.addEventListener("visibilitychange", handler);
    return {
      remove: () => document.removeEventListener("visibilitychange", handler),
    };
  },
};
