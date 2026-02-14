import chalk from 'chalk';

export class AttioApiError extends Error {
  constructor(
    public statusCode: number,
    public type: string,
    public detail: string
  ) {
    super(`Attio API Error: ${detail} (${statusCode})`);
  }

  display(): string {
    return [
      chalk.red(`Error: ${this.detail} (${this.statusCode})`),
      chalk.dim(`  Type: ${this.type}`),
    ].join('\n');
  }

  get exitCode(): number {
    if (this.statusCode === 401 || this.statusCode === 403) return 2;
    if (this.statusCode === 404) return 3;
    if (this.statusCode === 400 || this.statusCode === 409) return 4;
    if (this.statusCode === 429) return 5;
    return 1;
  }
}

export class AttioAuthError extends Error {
  display(): string {
    return [
      chalk.red('Error: Authentication failed'),
      '',
      '  No valid API key found. Set one of:',
      `    1. ${chalk.cyan('ATTIO_API_KEY')} environment variable`,
      `    2. ${chalk.cyan('attio config set api-key <key>')}`,
      `    3. ${chalk.cyan('--api-key <key>')} flag`,
      '',
      `  Get your API key at: ${chalk.underline('https://app.attio.com/settings/developers')}`,
    ].join('\n');
  }

  get exitCode(): number { return 2; }
}

export class AttioRateLimitError extends Error {
  display(): string {
    return chalk.red('Error: Rate limited after 3 retries. Try again in a few seconds.');
  }
  get exitCode(): number { return 5; }
}
