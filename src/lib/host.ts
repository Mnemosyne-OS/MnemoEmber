/**
 * host.ts — the one door between Ember and the shell.
 *
 * Lot 1 uses two ungated host actions (doc 73): read and write this
 * cartridge's durable state. No vault, no model, no network, no camera.
 */
import { MnemoCartridgeSDK } from '../sdk/mnemo-sdk';

/** Must match "name" in mnemo-plugin.json: the host keys the durable state on
 *  it. 🚨 Renaming it later orphans every logged event (no migration). */
export const PLUGIN_ID = '@mnemosyne-plugins/mnemo-ember';

export const sdk = new MnemoCartridgeSDK(PLUGIN_ID);

/** True inside the Mnemosyne shell. Opened standalone in a browser (dev), the
 *  store keeps its data in this browser's localStorage and the screen says so. */
export function hasHost(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}

/** The durable blob, inside the host's `{ state, updatedAt }` envelope. */
export function readState(): Promise<unknown> {
  return sdk.invoke<unknown>('state.get');
}

/** Replaces the durable blob. The host refuses past 256 KB. */
export function writeState(state: unknown): Promise<unknown> {
  return sdk.invoke('state.set', { state });
}
