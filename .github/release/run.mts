import { appendFileSync } from "node:fs";
import semanticRelease, { type ReleaseInfo } from "semantic-release";

type ReleaseRule = ({ breaking: true } | { type: string }) & {
  release: "major" | "minor" | "patch";
};

const releaseRules: ReleaseRule[] = [
  { breaking: true, release: "major" },
  { type: "feat", release: "minor" },
  { type: "fix", release: "patch" },
  { type: "perf", release: "patch" },
  { type: "revert", release: "patch" },
];

const release: Awaited<ReturnType<typeof semanticRelease>> = await semanticRelease({
  branches: ["main"],
  plugins: [
    ["@semantic-release/commit-analyzer", { preset: "conventionalcommits", releaseRules }],
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits" }],
    // Release notes only: no issue or pull request comments, labels or failure issues.
    [
      "@semantic-release/github",
      { successComment: false, failComment: false, releasedLabels: false },
    ],
  ],
});

if (!release) {
  // semantic-release also returns false when main moved on during the run or outside main.
  console.log("::warning::semantic-release did not publish a release; see its log above for why.");
  process.exit(0);
}

const { version, gitTag }: ReleaseInfo = release.nextRelease;
console.log(`Released ${gitTag}.`);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\ntag=${gitTag}\n`);
}
