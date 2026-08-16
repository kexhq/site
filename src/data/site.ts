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

/**
 * Safety net if the GitHub API is unreachable at build time. Bump this when
 * cutting a release so even a fully offline build stays truthful.
 */
const LATEST_RELEASE_FALLBACK = "v0.3.1";

/**
 * The latest published Kex release, read from GitHub at build time so the
 * site never shows a hand-edited stale version. Static build: this runs in
 * `npm run build` (deploy.yml), never in the visitor's browser.
 */
export async function latestRelease(): Promise<{ tag: string; url: string }> {
  try {
    const res = await fetch(
      "https://api.github.com/repos/kexhq/kex/releases/latest",
      {
        headers: { accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(5_000),
      },
    );
    const tag = res.ok ? (await res.json()).tag_name : undefined;
    if (typeof tag === "string" && tag !== "") {
      return { tag, url: `${REPO}/releases/tag/${tag}` };
    }
    throw new Error(`unexpected response (${res.status})`);
  } catch {
    return { tag: LATEST_RELEASE_FALLBACK, url: `${REPO}/releases/latest` };
  }
}
