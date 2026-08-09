# Model Tier Routing

Implement a shared Light/Medium/Heavy model configuration and deterministic
task router across Core, CLI, and Desktop.

- Tier bindings own provider, model, effort, and system invocation caps.
- Roles point to tiers; the final tier is the maximum of the role tier, task
  safety floor, and an optional operator minimum.
- Routing is deterministic and conservative. Mutable work starts at Medium;
  high-risk, broad, destructive, and recovery work requires Heavy.
- A selected tier must resolve exactly. There is no silent model, effort, or
  tier fallback.
- Existing single-model settings migrate by copying the current binding to all
  tiers. Existing role profiles remain readable during migration.
- Every invocation records the selected tier and reason codes.
