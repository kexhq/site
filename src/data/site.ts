/**
 * Central place for the source repository URL.
 *
 * If the project moves (e.g. under the `kex` org), change `REPO` here and
 * every link across the site updates with it.
 */
export const REPO = "https://github.com/kexhq/kex";
export const REPO_BRANCH = "main";

const strip = (p: string) => p.replace(/^\/+/, "");

/** Link to a directory in the repo, e.g. repoTree("examples"). */
export const repoTree = (path: string) =>
  `${REPO}/tree/${REPO_BRANCH}/${strip(path)}`;

/** Link to a file in the repo, e.g. repoBlob("LICENSE"). */
export const repoBlob = (path: string) =>
  `${REPO}/blob/${REPO_BRANCH}/${strip(path)}`;
