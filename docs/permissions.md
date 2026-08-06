# Permissions

Orynt has no hosted user roles or database row-level security. Authority is
derived locally from the current operator action, immutable policy, semantic
plan, path envelope, and approval record.

| Resource | Read | Mutate | Authority |
| --- | --- | --- | --- |
| Repository | Bounded inspection | Exact task-owned paths in isolated worktree | Verified plan plus execution approval |
| Browser | Bounded semantic snapshot/delta on allowed origins | Typed single/batched action on an allowed page | Explicit origin scope plus gateway/TTY approval |
| Local state | Current OS user | Current OS user through owned stores | Private filesystem permissions |
| Improvement candidate | List/show/history | Approve/reject/rollback | Interactive confirmation and hard gates |
| npm/GitHub release | Public read | Publish/sign | Protected GitHub `release` environment |
| Credentials/secrets | Not exposed as tools | Never agent-authorized | Human/operator-owned only |

Skills, memory, prompts, model output, repository files, browser pages, and
dependency summaries are untrusted and cannot grant authority.
