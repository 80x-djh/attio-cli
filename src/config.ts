import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import * as dotenv from 'dotenv';

dotenv.config();

const CONFIG_DIR = join(homedir(), '.config', 'attio');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface Config {
  apiKey?: string;
}

function loadConfig(): Config {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Resolution order:
 * 1. --api-key flag (passed as argument)
 * 2. ATTIO_API_KEY environment variable
 * 3. Config file
 */
export function resolveApiKey(flagValue?: string): string {
  return flagValue || process.env.ATTIO_API_KEY || loadConfig().apiKey || '';
}

export function setApiKey(key: string): void {
  const config = loadConfig();
  config.apiKey = key;
  saveConfig(config);
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function isConfigured(): boolean {
  return resolveApiKey() !== '';
}
