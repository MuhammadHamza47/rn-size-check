import { readFile } from 'node:fs/promises';
import * as core from '@actions/core';
import {
  analyze,
  comparisonToMarkdown,
  compareReports,
  formatBytes,
  reportFromJson,
  reportToMarkdown,
  type Report,
} from '@rnsc/core/node';
import { isDefaultBranchPush, restoreBaseline, saveBaseline } from './baseline.js';
import { upsertComment } from './comment.js';

const MB = 1_000_000;
const VERSION = '0.4.0';

async function loadReport(path: string, opts: { abi?: string; density?: string }): Promise<Report> {
  if (/\.json$/i.test(path)) return reportFromJson(JSON.parse(await readFile(path, 'utf8')), path);
  return analyze(path, { ...opts, toolVersion: VERSION });
}

export async function run(): Promise<void> {
  const build = core.getInput('build', { required: true });
  const baselineInput = core.getInput('baseline');
  const project = core.getInput('project') || undefined;
  const sourcemap = core.getInput('sourcemap') || undefined;
  const abi = core.getInput('abi') || undefined;
  const density = core.getInput('density') || undefined;
  const maxGrowth = core.getInput('max-growth');
  const budget = core.getInput('budget');
  const doComment = core.getBooleanInput('comment');
  const failOnGrowth = core.getBooleanInput('fail-on-growth');
  const token = core.getInput('github-token');

  const newReport = await analyze(build, { project, sourcemap, abi, density, toolVersion: VERSION });

  // Baseline: an explicit input, else the report cached on the base branch's last run.
  const baseline = baselineInput
    ? await loadReport(baselineInput, { abi, density })
    : await restoreBaseline();

  let body: string;
  let overBy = '';

  if (baseline) {
    const cmp = compareReports(baseline, newReport);
    body = comparisonToMarkdown(cmp);
    core.setOutput('download-change', cmp.sizes.download.change);
    core.info(`Download: ${formatBytes(cmp.sizes.download.old)} → ${formatBytes(cmp.sizes.download.new)} (${cmp.sizes.download.change >= 0 ? '+' : ''}${formatBytes(cmp.sizes.download.change)})`);
    if (maxGrowth && cmp.sizes.download.change > Number(maxGrowth) * MB) {
      overBy = `Download grew ${formatBytes(cmp.sizes.download.change)}, over the ${maxGrowth} MB limit.`;
    }
  } else {
    body = reportToMarkdown(newReport);
    core.info(`Download: ${formatBytes(newReport.sizes.download.bytes)} (no baseline to compare against yet)`);
    if (budget && newReport.sizes.download.bytes > Number(budget) * MB) {
      overBy = `Download ${formatBytes(newReport.sizes.download.bytes)} is over the ${budget} MB budget.`;
    }
  }

  core.setOutput('download-bytes', newReport.sizes.download.bytes);
  core.setOutput('markdown', body);

  if (doComment) await upsertComment(token, body);

  // Refresh the baseline so future PRs compare against the latest default-branch build.
  if (isDefaultBranchPush()) await saveBaseline(newReport);

  if (overBy) {
    if (failOnGrowth) core.setFailed(overBy);
    else core.warning(overBy);
  }
}

run().catch((err) => core.setFailed(err instanceof Error ? err.message : String(err)));
