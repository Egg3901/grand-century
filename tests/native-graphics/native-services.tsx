import React from "react";
import { View, Text, useWindowDimensions } from "./platform";
export class Worker {
  private worker = new window.Worker(
    new URL("../../apps/mobile/game/sim.worker.ts", import.meta.url),
    { type: "module" },
  );
  set onmessage(handler: (event: MessageEvent) => void) {
    this.worker.onmessage = (event) => {
      if (event.data.t === "snapshot")
        (window as any).nativeSnapshot = event.data.snapshot;
      if (event.data.t === "nationDetail")
        (window as any).nativeNationDetail = event.data.detail;
      handler(event);
    };
  }
  postMessage(message: any) {
    if (message.t === "command") (window as any).nativeCommand = message.cmd;
    this.worker.postMessage(message);
  }
  terminate() {
    this.worker.terminate();
  }
}
const keyOf = (parts: any[]) =>
  parts.map((part) => (typeof part === "string" ? part : part.uri)).join("/");
/**
 * File shim. Text (save metadata) stays in localStorage, where tests inspect
 * it. Binary saves live in memory mirrored to IndexedDB: localStorage caps an
 * origin at about 5 MB, which world v8 saves (about 1 MB each) exceed.
 * hydrateFiles() must resolve before the app renders.
 */
// globalThis.Map: this module also exports a MapLibre stand-in named Map.
const binary = new globalThis.Map<string, Uint8Array>();
const DB = "native-graphics-files";
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore("files");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}
function persist(uri: string, data: Uint8Array | null) {
  void db().then((d) => {
    const tx = d.transaction("files", "readwrite");
    if (data) tx.objectStore("files").put(data, uri);
    else tx.objectStore("files").delete(uri);
  });
}
export async function hydrateFiles(): Promise<void> {
  const d = await db();
  await new Promise<void>((resolve) => {
    const req = d.transaction("files").objectStore("files").openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();
      binary.set(String(cursor.key), cursor.value as Uint8Array);
      cursor.continue();
    };
    req.onerror = () => resolve();
  });
}
export class File {
  uri: string;
  constructor(...parts: any[]) {
    this.uri = keyOf(parts);
  }
  get name() {
    return this.uri.split("/").pop()!;
  }
  get exists() {
    return localStorage.getItem(this.uri) !== null || binary.has(this.uri);
  }
  textSync() {
    return localStorage.getItem(this.uri) ?? "";
  }
  async bytes() {
    // A value in localStorage wins: tests corrupt saves by writing one there.
    const legacy = localStorage.getItem(this.uri);
    if (legacy !== null) return new Uint8Array(JSON.parse(legacy));
    return binary.get(this.uri) ?? new Uint8Array();
  }
  write(data: string | Uint8Array) {
    if (typeof data === "string") {
      localStorage.setItem(this.uri, data);
      return;
    }
    localStorage.removeItem(this.uri);
    const copy = new Uint8Array(data);
    binary.set(this.uri, copy);
    persist(this.uri, copy);
  }
  delete() {
    localStorage.removeItem(this.uri);
    binary.delete(this.uri);
    persist(this.uri, null);
  }
}
export class Directory {
  uri: string;
  constructor(...parts: any[]) {
    this.uri = keyOf(parts);
  }
  create() {}
  list() {
    const keys = new Set([...Object.keys(localStorage), ...binary.keys()]);
    return [...keys]
      .filter((key) => key.startsWith(this.uri + "/"))
      .map((key) => new File(key));
  }
}
export const Paths = { document: "test" };
export const WebBrowserPresentationStyle = { FULL_SCREEN: "fullScreen" };
export async function openBrowserAsync(url: string) {
  (window as any).accountURL = url;
  return { type: "cancel" };
}
export const StatusBar = () => null;
export default function Ionicons({ name }: any) {
  return (
    <Text>
      {name === "menu" ? "☰" : name === "settings-outline" ? "⚙" : "◇"}
    </Text>
  );
}
export const Map = ({ children, style }: any) => (
  <View style={{ ...style, backgroundColor: "#406776" }}>{children}</View>
);
export const Camera = () => null,
  GeoJSONSource = () => null,
  ImageSource = () => null,
  Images = () => null,
  Layer = () => null;
export const SafeAreaProvider = ({ children }: any) => <>{children}</>;
export const SafeAreaView = ({ children, style }: any) => {
  const { width, height } = useWindowDimensions();
  return (
    <View
      style={[
        style,
        width > height
          ? {
              paddingTop: 0,
              paddingBottom: 21,
              paddingLeft: 44,
              paddingRight: 44,
            }
          : { paddingTop: 59, paddingBottom: 34 },
      ]}
    >
      {children}
    </View>
  );
};

export const modelId = null,
  modelName = null,
  totalMemory = null,
  isDevice = false;

export const setAudioModeAsync = async () => {};
export function useAudioPlayer(_source: any) {
  const ref = React.useRef({
    loop: false,
    play() {},
    pause() {},
    replace(_asset: any) {},
  });
  return ref.current;
}
