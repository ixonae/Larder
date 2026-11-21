// The subset of the separately installed release tool's API used by run.mts.
declare module "semantic-release" {
  export interface ReleaseInfo {
    version: string;
    gitTag: string;
  }

  export default function semanticRelease(options: {
    branches: string[];
    plugins: [name: string, options: Record<string, unknown>][];
  }): Promise<false | { nextRelease: ReleaseInfo }>;
}
