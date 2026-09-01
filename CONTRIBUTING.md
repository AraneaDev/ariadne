# Contributing

## Getting set up

Ariadne is Bun and TypeScript throughout.

```bash
git clone https://github.com/AraneaDev/ariadne
cd ariadne
bun install
```

`bun install` runs the `prepare` script, which points git at the tracked hooks:

```bash
git config core.hooksPath .githooks
```

Reached through `core.hooksPath` rather than copied into `.git/hooks`, so a
fresh clone gets the hook the moment it installs, with nothing to remember to
copy by hand.

## Checks

```bash
bun run lint        # eslint
bun run typecheck    # tsc --noEmit
bun run test         # bun test
bun run lint:docs    # markdownlint against the README and friends
bun run check         # lint, typecheck and test, in that order
```

All of it runs in CI, on Linux and macOS.

## The hot path must never throw

The pre- and post-tool-use hooks run on every single tool call, in every
session, for as long as the plugin is installed. A hook that throws does not
fail quietly: it breaks the tool call it was attached to. So the code on that
path treats every filesystem operation as something that can fail for reasons
that have nothing to do with a bug, a session killed mid-write, a directory
that vanished under it, a marker that raced its own cleanup, and catches
locally rather than letting an exception reach the caller. `src/hook.ts` is
the place to read for the shape of it: small functions, each wrapped in its
own `try`/`catch`, each comment saying why that particular failure is
expected rather than exceptional. Adding a new write to that path means
asking what happens when it fails, not whether it will.

Everything off that path, the CLI, the prober, the backfill importer, can
raise and report an error normally. The constraint is specific to code a hook
runs, not a house style for the whole project.

## Working on it

Changes go through a pull request. New behaviour needs a test; the suite is
the actual guarantee behind the claims in the README, not decoration.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), which is what
release-please reads to work out the next version:

- `feat:` new behaviour
- `fix:` a bug fix
- `perf:` a performance change
- `refactor:` restructuring with no change in behaviour
- `test:` tests only
- `docs:` documentation only
- `ci:` continuous integration
- `chore:` tooling and housekeeping

Example: `fix(prober): recognise a hyphenated transport as a success`

A pull request that gets squash-merged takes its title as the commit subject,
so the title has to follow this convention too, not just the individual
commits on the branch. A CI check enforces that on every pull request.

## Pre-commit hook

`.githooks/pre-commit` runs eslint against the staged TypeScript files and
then `bun run typecheck` before a commit is written. Set
`ARIADNE_SKIP_HOOKS=1` to bypass it once, for a work-in-progress commit you
plan to clean up before pushing:

```bash
ARIADNE_SKIP_HOOKS=1 git commit -m "wip: checkpoint"
```

## Releases

Automated by [release-please](https://github.com/googleapis/release-please) via
`.github/workflows/release-please.yml`:

1. Write commits on `main` following the convention above.
2. release-please keeps a **Release PR** open and up to date, bumping
   `package.json`, `.claude-plugin/plugin.json` and the release manifest, and
   writing `CHANGELOG.md`, all from those commits.
3. Merging that PR creates the `vX.Y.Z` tag and the GitHub Release, then the
   same workflow installs, runs the tests, and asserts the tag matches the
   version it just released in both files.

`package.json` and `.claude-plugin/plugin.json` carry the same version
number, and `test/scaffold.test.ts` asserts they agree. release-please is
configured with an `extra-files` entry pointing at the plugin manifest's
`$.version`, so one release-please run bumps both files from the same commit
history and neither can drift ahead of the other.

Below `1.0.0` a feature bumps the patch number and a breaking change bumps the
minor one, so the shape of the ledger and the report can settle without
spending major versions on it.

### If a Release PR turns up with no checks

That means the workflow fell back to the built-in `GITHUB_TOKEN`, which is what
happens when `RELEASE_PLEASE_TOKEN` is missing or has expired. GitHub does not
start workflows for events that token raises, and checks are required before
merging, so the pull request cannot be merged as it stands.

Closing and reopening it raises the event under your own account and starts the
checks:

```bash
gh pr close <n> && gh pr reopen <n>
```

To fix it properly, replace the secret with a
[fine-grained token](https://github.com/settings/personal-access-tokens/new)
scoped to this repository with **Contents: read and write** and **Pull
requests: read and write**, then:

```bash
gh secret set RELEASE_PLEASE_TOKEN --repo AraneaDev/ariadne
```

### Rules

Do not hand-edit versions or `CHANGELOG.md`, and do not hand-create tags. All
of it is managed by release-please. If a release needs extra narrative, edit
the Release PR description before merging it.
