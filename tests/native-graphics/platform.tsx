import React, { useLayoutEffect, useRef, useState } from "react";
export const AccessibilityInfo = {
  isReduceMotionEnabled: async () => true,
  addEventListener: () => ({ remove() {} }),
};
export const AppState = {
  currentState: "active",
  addEventListener: () => ({ remove() {} }),
};
export const PixelRatio = { get: () => 3 };
export const PanResponder = { create: () => ({ panHandlers: {} }) };
export const StyleSheet = {
  create: (s: any) => s,
  absoluteFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
};
function css(style: any): any {
  const flat = Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  if (typeof flat.lineHeight === "number")
    flat.lineHeight = flat.lineHeight + "px";
  for (const kind of ["padding", "margin"]) {
    if (flat[kind + "Vertical"] != null) {
      flat[kind + "Top"] = flat[kind + "Vertical"];
      flat[kind + "Bottom"] = flat[kind + "Vertical"];
      delete flat[kind + "Vertical"];
    }
    if (flat[kind + "Horizontal"] != null) {
      flat[kind + "Left"] = flat[kind + "Horizontal"];
      flat[kind + "Right"] = flat[kind + "Horizontal"];
      delete flat[kind + "Horizontal"];
    }
  }
  if (flat.flex === 1) {
    flat.flex = "1 1 0%";
  }
  if (Array.isArray(flat.transform))
    flat.transform = flat.transform
      .map((t: any) => `scale(${t.scale})`)
      .join(" ");
  return {
    boxSizing: "border-box",
    minWidth: 0,
    minHeight: 0,
    flexShrink: 0,
    ...flat,
  };
}
export function View({ style, children, onLayout, ...props }: any) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!onLayout || !ref.current) return;
    const observer = new ResizeObserver(([e]) =>
      onLayout({
        nativeEvent: {
          layout: { width: e.contentRect.width, height: e.contentRect.height },
        },
      }),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{
        display: "flex",
        position: "relative",
        flexDirection: "column",
        ...css(style),
      }}
      data-testid={props.testID}
      aria-label={props.accessibilityLabel}
    >
      {children}
    </div>
  );
}
export const Text = ({ children, style, accessibilityRole }: any) => (
  <span
    role={accessibilityRole === "header" ? "heading" : accessibilityRole}
    style={{ display: "block", ...css(style) }}
  >
    {children}
  </span>
);
export const Pressable = ({
  children,
  onPress,
  style,
  accessibilityLabel,
  accessibilityState,
  disabled,
}: any) => (
  <button
    disabled={disabled}
    aria-label={accessibilityLabel}
    aria-pressed={accessibilityState?.selected}
    onClick={onPress}
    style={{
      border: 0,
      backgroundColor: "transparent",
      fontFamily: "inherit",
      padding: 0,
      display: "flex",
      alignItems: "center",
      flexDirection: "column",
      ...css(typeof style === "function" ? style({ pressed: false }) : style),
    }}
  >
    {children}
  </button>
);
export function GLView({ style, onContextCreate }: any) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const canvas = ref.current!;
    const real = canvas.getContext("webgl", { preserveDrawingBuffer: true })!;
    // ExpoGL 57 installs these as fixed JS values in createWebGLRenderer.
    // iOS layoutSubviews resizes the framebuffer without updating those values.
    const width = real.drawingBufferWidth,
      height = real.drawingBufferHeight;
    const gl = new Proxy(real, {
      get(target, key) {
        if (key === "drawingBufferWidth") return width;
        if (key === "drawingBufferHeight") return height;
        if (key === "drawElements" && location.search.includes("blank"))
          return () => {};
        if (key === "endFrameEXP") return () => {};
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    (window as any).nativeGL = { real, gl, initial: [width, height] };
    void onContextCreate(gl);
  }, []);
  return (
    <canvas
      ref={ref}
      width={Math.round(style.width * 3)}
      height={Math.round(style.height * 3)}
      style={css(style)}
    />
  );
}

export const Alert = {
  alert: (title: string, message: string, buttons: any[]) => {
    if (window.confirm(`${title}\n${message}`)) buttons.at(-1).onPress();
  },
};
export function useWindowDimensions() {
  const [size, setSize] = useState({ width: innerWidth, height: innerHeight });
  useLayoutEffect(() => {
    const listener = () => setSize({ width: innerWidth, height: innerHeight });
    addEventListener("resize", listener);
    return () => removeEventListener("resize", listener);
  }, []);
  return size;
}
export const ScrollView = ({ children, style, contentContainerStyle }: any) => (
  <div style={{ overflow: "auto", minHeight: 0, ...css(style) }}>
    <View style={contentContainerStyle}>{children}</View>
  </div>
);
export const FlatList = ({ data, renderItem, ListEmptyComponent }: any) => (
  <ScrollView style={{ flex: 1 }}>
    {data.length
      ? data.map((item: any) => (
          <React.Fragment key={item.tag}>{renderItem({ item })}</React.Fragment>
        ))
      : ListEmptyComponent}
  </ScrollView>
);
export const TextInput = ({
  value,
  onChangeText,
  style,
  placeholder,
  accessibilityLabel,
}: any) => (
  <input
    aria-label={accessibilityLabel}
    placeholder={placeholder}
    value={value}
    onChange={(e) => onChangeText(e.target.value)}
    style={css(style)}
  />
);
export const Image = Object.assign(
  ({ source, style, accessibilityLabel, testID }: any) => (
    <img
      src={source}
      alt={accessibilityLabel}
      data-testid={testID}
      style={css(style)}
    />
  ),
  { resolveAssetSource: () => ({ width: 200, height: 50 }) },
);
export const Modal = ({ visible, children }: any) =>
  visible ? (
    <div
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        display: "flex",
        flexDirection: "column",
        background: "#eeeae0",
      }}
    >
      {children}
    </div>
  ) : null;

export const Linking = {
  getInitialURL: async () => null,
  addEventListener: () => ({ remove() {} }),
};
export const Share = {
  share: async (value: any) => {
    (window as any).sharedInvitation = value.message;
  },
};
