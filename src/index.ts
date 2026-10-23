// Deploy entry for MioGit: default token auth, plus the GitHub two-way sync
// push hook (src/sync.ts; quietly off until its secrets are set).
import { createDurableGit } from "./mod";
import { onPushSync } from "./sync";

export { RepoCell, Registry } from "./mod";

export default createDurableGit({ onPush: onPushSync });
