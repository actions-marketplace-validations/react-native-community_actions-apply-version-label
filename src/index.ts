import * as core from "@actions/core";
import * as github from "@actions/github";
import { marked } from "marked";
import semverParse from "semver/functions/parse";

const versionLabel = "Version: ";
const versionTitlesInMarkdown = ["Version", "New Version"];
const rnInfoTitleInMarkdown = "Output of `react-native info`";
const labelForNoVersion = "Version: unspecified";

type TokenWithText = {
  text: string;
};

function isTokenWithText(token: any): token is TokenWithText {
  return !!token?.text;
}

const getVersionFromIssueBody = (issueBody: string) => {
  let versionFromIssueBody = "";

  // Parse the markdown from the issue body
  const markdownSection = marked.lexer(issueBody);

  // Loop through all sections
  for (const markdownSectionIndex in markdownSection) {
    // Skip sections that don't contain text
    const currentSection = markdownSection[markdownSectionIndex];
    if (!isTokenWithText(currentSection)) {
      continue;
    }

    // If this section matches `versionTitleInMarkdown`
    if (versionTitlesInMarkdown.includes(currentSection.text)) {
      // Then the version can be found in the next section
      const specifiedVersion =
        markdownSection[Number(markdownSectionIndex) + 1];

      if (!isTokenWithText(specifiedVersion)) {
        continue;
      }

      const parsedVersion = semverParse(specifiedVersion.text);

      if (!parsedVersion) {
        continue;
      }

      versionFromIssueBody = parsedVersion.version;

      break;
    }

    // If this section matches `rnInfoTitleInMarkdown`
    if (currentSection.text === rnInfoTitleInMarkdown) {
      // Then the version can be found in the next section
      const rnInfoOutput = markdownSection[Number(markdownSectionIndex) + 1];

      if (!isTokenWithText(rnInfoOutput)) {
        continue;
      }

      const rnInfoRNPart = rnInfoOutput.text.match(/react-native:(.+?)=>/);

      if (!rnInfoRNPart || rnInfoRNPart.length === 0) {
        continue;
      }

      const versionFromRnInfoPart = semverParse(rnInfoRNPart[1].trim());

      if (!versionFromRnInfoPart) {
        continue;
      }

      versionFromIssueBody = versionFromRnInfoPart.version;

      break;
    }
  }

  return versionFromIssueBody;
};

const getLabelToBeApplied = (version: string) =>
  version ? `${versionLabel}${version}` : labelForNoVersion;

// Look for a version on the issue body
const getIsIssueLabelAVersion = (label: string) =>
  label.startsWith(versionLabel);

const init = async () => {
  const githubToken = core.getInput("github-token", { required: true });
  const requiredLabel = core.getInput("required-label", { required: true });
  const octokit = github.getOctokit(githubToken);

  const { issue } = github.context;

  // This fetches the issue again as it can have different data after running the other actions
  const { data: updatedIssue } = await octokit.rest.issues.get({
    owner: issue.owner,
    repo: issue.repo,
    issue_number: issue.number,
  });

  if (updatedIssue.state === "closed") {
    // Do nothing if the issue has been closed
    core.debug("Issue already closed");

    return;
  }

  if (!updatedIssue.body) {
    core.debug("No description provided");
    return;
  }

  const versionFromIssueBody = getVersionFromIssueBody(updatedIssue.body);
  const labelToBeApplied = getLabelToBeApplied(versionFromIssueBody);

  // Get all the labels in the issue
  const { data: labels } = await octokit.rest.issues.listLabelsOnIssue({
    owner: issue.owner,
    repo: issue.repo,
    issue_number: issue.number,
  });

  if (labels.every(({ name }) => name !== requiredLabel)) {
    core.debug(`Issue not tagged with ${requiredLabel}`);

    return;
  }

  // Loop through all labels and remove the version label if it exists
  // and is not the same as the version from the issue body
  try {
    await Promise.all(
      labels.map(({ name }) => {
        const isLabelAVersion = getIsIssueLabelAVersion(name);

        if (!isLabelAVersion || name === labelToBeApplied) {
          return;
        }

        return octokit.rest.issues.removeLabel({
          owner: issue.owner,
          repo: issue.repo,
          issue_number: issue.number,
          name,
        });
      })
    );
  } catch (error) {
    core.error(error);

    core.setFailed("Failed to remove version labels");
  }

  try {
    // Make sure that the label to be added exists
    await octokit.rest.issues.getLabel({
      owner: issue.owner,
      repo: issue.repo,
      name: labelToBeApplied,
    });

    // Then add it
    await octokit.rest.issues.addLabels({
      owner: issue.owner,
      repo: issue.repo,
      issue_number: issue.number,
      labels: [labelToBeApplied],
    });
  } catch (error) {
    core.warning(`Label ${labelToBeApplied} doesn't seem to exist`);
  }
};

init();
