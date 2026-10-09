import { CHECKS } from '@rnsc/core';
import { Command, Option } from 'commander';
import pkg from '../package.json';
import { EXIT, runAnalyze } from './commands/analyze.js';

const program = new Command()
  .name('rn-size-check')
  .description('Find out why your React Native app is big and how to shrink it.')
  .version(pkg.version);

program
  .command('analyze', { isDefault: true })
  .description('Analyze an Android .aab or .apk')
  .argument('<build>', 'path to app-release.aab or .apk')
  .option('--abi <abi>', 'ABI for the download estimate (default: arm64-v8a if present)')
  .option('--density <density>', 'screen density for the AAB estimate: mdpi…xxxhdpi (default: xxhdpi)')
  .option('--json <file>', 'also write the full report as JSON')
  .addOption(new Option('--format <format>', 'stdout format').choices(['pretty', 'plain', 'json']).default('pretty'))
  .option('--top <n>', 'rows to show in tables', '10')
  .option('--budget <MB>', 'exit with code 1 if the download size exceeds this many MB')
  .option('--ignore <ids>', 'comma-separated check ids to skip')
  .action(async (build: string, opts) => {
    process.exitCode = await runAnalyze(build, opts, pkg.version);
  });

program
  .command('checks')
  .description('List all checks')
  .action(() => {
    for (const check of CHECKS) {
      process.stdout.write(`${check.id.padEnd(22)}${check.description}\n`);
    }
  });

program.parseAsync().catch((err: Error) => {
  process.stderr.write(`rn-size-check: unexpected error: ${err.stack ?? err.message}\n`);
  process.stderr.write('Please report it at https://github.com/MuhammadHamza47/rn-size-check/issues\n');
  process.exitCode = EXIT.internal;
});
