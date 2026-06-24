# Commercial Backend, Trial, and License

## Later backend scope

The local alpha must not require this backend to run controlled browser tasks. P0 uses offline-first placeholder trial/license state plus local BYOK model settings.

When commercial backend work starts, scope it to:

```text
account identity
trial state
license validation
billing portal link
plan limits metadata
device registration
release channel metadata
```

Runtime remains local.

Design the backend for roughly 1000 registered users first. Use the cloud plan in `39_cloud_backend_scale_1000_users.md` as the implementation source of truth.

## License cache

```ts
export interface LicenseState {
  accountId: string;
  plan: 'trial' | 'starter' | 'pro' | 'expired';
  validUntil: string;
  offlineGraceUntil: string;
  features: string[];
  signature: string;
}
```

## BYOK first

Use BYOK for model providers at first. Add included credits only after cost patterns are known.
