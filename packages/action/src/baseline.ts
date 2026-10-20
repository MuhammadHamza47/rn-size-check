import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { reportFromJson, type Report } from '@rnsc/core/node';

const FILE = join(tmpdir(), 'rn-size-check-baseline.json');

/** The branch a PR targets, or the default branch on a push. */
function baseBranch(): string {
  const ctx = github.context;
  return ctx.payload.pull_request?.base?.ref || ctx.payload.repository?.default_branch || 'main';
}

const keyPrefix = (branch: string) => `rn-size-check-report-${process.platform}-${branch}-`;

/**
 * The report this action cached on its last run on the base branch, or null.
 * A unique primary key that will never hit forces a restore-keys prefix match, i.e. the most recent one.
 */
export async function restoreBaseline(): Promise<Report | null> {
  const branch = baseBranch();
  try {
    const hit = await cache.restoreCache([FILE], `${keyPrefix(branch)}none`, [keyPrefix(branch)]);
    if (!hit) {
      core.info(`No cached baseline for "${branch}" yet — run this action on ${branch} once to create it.`);
      return null;
    }
    return reportFromJson(JSON.parse(await readFile(FILE, 'utf8')), 'cached baseline');
  } catch (err) {
    core.warning(`Could not restore the baseline: ${(err as Error).message}`);
    return null;
  }
}

/** Store this build's report so pull requests into this branch can compare against it. */
export async function saveBaseline(report: Report): Promise<void> {
  const branch = github.context.ref.replace('refs/heads/', '');
  try {
    await writeFile(FILE, JSON.stringify(report));
    await cache.saveCache([FILE], `${keyPrefix(branch)}${github.context.sha}`);
    core.info(`Saved the size baseline for "${branch}".`);
  } catch (err) {
    core.warning(`Could not save the baseline: ${(err as Error).message}`);
  }
}

/** True on a push to the repo's default branch (where we refresh the baseline). */
export function isDefaultBranchPush(): boolean {
  const ctx = github.context;
  const def = ctx.payload.repository?.default_branch;
  return ctx.eventName === 'push' && !!def && ctx.ref === `refs/heads/${def}`;
}
