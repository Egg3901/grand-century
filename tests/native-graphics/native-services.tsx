import React from "react";
import { View, Text } from "./platform";
export class Worker {
  private worker = new window.Worker(new URL('../../apps/mobile/game/sim.worker.ts', import.meta.url), { type: 'module' });
  set onmessage(handler: (event: MessageEvent) => void) { this.worker.onmessage = handler; }
  postMessage(message: any) { if (message.t === 'command') (window as any).nativeCommand = message.cmd; this.worker.postMessage(message); }
  terminate() { this.worker.terminate(); }
}
const keyOf = (parts: any[]) => parts.map((part) => typeof part === 'string' ? part : part.uri).join('/');
export class File {
  uri: string;
  constructor(...parts: any[]) { this.uri = keyOf(parts); }
  get name() { return this.uri.split('/').pop()!; }
  get exists() { return localStorage.getItem(this.uri) !== null; }
  textSync() { return localStorage.getItem(this.uri) ?? ''; }
  async bytes() { return new Uint8Array(JSON.parse(this.textSync())); }
  write(data: string | Uint8Array) { localStorage.setItem(this.uri, typeof data === 'string' ? data : JSON.stringify(Array.from(data))); }
  delete() { localStorage.removeItem(this.uri); }
}
export class Directory {
  uri: string;
  constructor(...parts: any[]) { this.uri = keyOf(parts); }
  create() {}
  list() { return Object.keys(localStorage).filter((key) => key.startsWith(this.uri + '/')).map((key) => new File(key)); }
}
export const Paths = { document: 'test' };
export const WebBrowserPresentationStyle = { FULL_SCREEN: 'fullScreen' };
export async function openBrowserAsync(url: string) { (window as any).accountURL = url; return { type: 'cancel' }; }
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
export const SafeAreaView = ({ children, style }: any) => (
  <View style={[style, { paddingTop: 59, paddingBottom: 34 }]}>{children}</View>
);

export const modelId = null,
  modelName = null,
  totalMemory = null,
  isDevice = false;
