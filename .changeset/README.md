# Changesets

One file per change, folded into `CHANGELOG.md` and the release notes when a release is cut, then deleted. Kinds: `added`, `changed`, `fixed`, `removed`.

```
---
kind: fixed
---
The coach accepts a five-field run again.
```

```
pnpm changeset fixed "The coach accepts a five-field run again."
pnpm release:notes
```
