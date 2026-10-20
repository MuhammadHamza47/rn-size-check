import * as core from '@actions/core';
import * as github from '@actions/github';

/** Hidden marker so the action finds and updates its own comment instead of spamming new ones. */
const MARKER = '<!-- rn-size-check -->';

/** Create the size comment on the PR, or update the one from a previous run. */
export async function upsertComment(token: string, body: string): Promise<void> {
  const pr = github.context.payload.pull_request;
  if (!pr) {
    core.info('Not a pull request — writing the report to the job summary instead of a comment.');
    await core.summary.addRaw(body).write();
    return;
  }
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const full = `${MARKER}\n${body}`;
  try {
    const existing = await octokit.paginate(octokit.rest.issues.listComments, { owner, repo, issue_number: pr.number });
    const mine = existing.find((c) => c.body?.includes(MARKER));
    if (mine) {
      await octokit.rest.issues.updateComment({ owner, repo, comment_id: mine.id, body: full });
      core.info(`Updated size comment on PR #${pr.number}.`);
    } else {
      await octokit.rest.issues.createComment({ owner, repo, issue_number: pr.number, body: full });
      core.info(`Posted size comment on PR #${pr.number}.`);
    }
  } catch (err) {
    core.warning(`Could not post the PR comment (check the workflow has pull-requests: write): ${(err as Error).message}`);
    await core.summary.addRaw(body).write();
  }
}
