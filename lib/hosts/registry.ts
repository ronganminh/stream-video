import { doodProvider } from "./dood";
import { earnVidsProvider } from "./earnvids";
import type { HostProvider } from "./types";
import { voeProvider } from "./voe";

export const hostRegistry = new Map<string, HostProvider>([
  [doodProvider.id, doodProvider],
  [voeProvider.id, voeProvider],
  [earnVidsProvider.id, earnVidsProvider],
]);

export function getHostProvider(id: string): HostProvider | undefined {
  return hostRegistry.get(id);
}
