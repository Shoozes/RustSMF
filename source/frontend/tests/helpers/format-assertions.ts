import { expect } from '@playwright/test';
import fs from 'node:fs';

export const parseSelectedBone = (statusText: string | null): string => {
  const match = /Selected:\s*([^\|\n]+)/.exec(statusText ?? '');
  return match?.[1]?.trim() ?? '';
};

export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const fileToBase64 = (filePath: string): string => fs.readFileSync(filePath).toString('base64');

export interface GlbJsonSummary {
  images?: unknown[];
  textures?: unknown[];
  nodes?: Array<{ name?: string; children?: number[] }>;
  scenes?: Array<{ nodes?: number[] }>;
  scene?: number;
}

export const readGlbJson = (bytes: Buffer): GlbJsonSummary => {
  expect(bytes.toString('utf8', 0, 4)).toBe('glTF');
  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.toString('utf8', 16, 20);
  expect(jsonType).toBe('JSON');
  return JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength)) as GlbJsonSummary;
};
