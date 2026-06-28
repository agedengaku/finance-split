# Production releases

Production deployments use a release branch, a merge to `main`, and a semantic
version tag. Pushing the tag runs all quality checks again, deploys the exact
tagged build to Hawk Host, verifies the health endpoint, and publishes a GitHub
release with generated release notes.

## One-time Hawk Host setup

The cPanel Node.js application must remain configured as:

- Application root: `fair-share`
- Application mode: `Production`
- Node.js version: `24`
- Startup file: `server-dist/index.js`

Keep all existing production environment variables in cPanel's **Setup Node.js
App** configuration. The deployment invokes the compiled migration through
CloudLinux's Node.js selector, which supplies those cPanel variables even
though they are not visible in an ordinary interactive SSH shell. Database and
session secrets therefore remain on Hawk Host and are not copied to GitHub.

## One-time GitHub setup

Create a dedicated SSH key for GitHub Actions. Do not add a passphrase because
the workflow cannot answer an interactive passphrase prompt:

```sh
ssh-keygen -t ed25519 -C "github-actions-finance-split" -f ~/.ssh/finance_split_deploy
```

Import and authorize `~/.ssh/finance_split_deploy.pub` in cPanel under **SSH
Access > Manage SSH Keys**. The private key remains secret.

Capture Hawk Host's SSH host key:

```sh
ssh-keyscan -t ed25519 172.96.185.224 > hawkhost_known_hosts
ssh-keygen -lf hawkhost_known_hosts
```

Confirm that its fingerprint matches the host fingerprint already verified
during manual SSH setup. Then open the GitHub repository and go to **Settings >
Environments > New environment**. Create an environment named `production`.

Add these environment secrets:

| Secret                     | Value                                                   |
| -------------------------- | ------------------------------------------------------- |
| `HAWKHOST_HOST`            | `172.96.185.224`                                        |
| `HAWKHOST_USERNAME`        | `jmotaylo`                                              |
| `HAWKHOST_SSH_PRIVATE_KEY` | Entire contents of `~/.ssh/finance_split_deploy`        |
| `HAWKHOST_KNOWN_HOSTS`     | Entire contents of the generated `hawkhost_known_hosts` |

Add these environment variables:

| Variable                | Value                              |
| ----------------------- | ---------------------------------- |
| `HAWKHOST_APP_ROOT`     | `fair-share`                       |
| `HAWKHOST_NODE_VERSION` | `24`                               |
| `HAWKHOST_SSH_PORT`     | `22`                               |
| `PRODUCTION_URL`        | `https://fair-share.jmotaylor.com` |

Optionally add yourself as a required reviewer under the `production`
environment's deployment protection rules. This adds an approval step after
the tagged build passes its checks and before production is changed.

Under the repository's branch rules, protect `main` and require the **Code
quality and tests** status check before pull requests can merge. The tag
workflow still reruns every check against the exact tagged commit.

## Release process

Choose a semantic version such as `0.2.0`. The version in `package.json`, the
version in `package-lock.json`, and the Git tag must match.

```sh
git switch main
git pull --ff-only
git switch -c release-0.2.0
npm version 0.2.0 --no-git-tag-version
npm run check
git add package.json package-lock.json
git commit -m "Prepare release 0.2.0"
git push -u origin release-0.2.0
```

Open a pull request from `release-0.2.0` into `main`. GitHub runs ESLint,
Stylelint, Prettier, TypeScript checks, tests, and the production build. Merge
only after CI passes.

After merging, tag the merge commit from an updated local `main`:

```sh
git switch main
git pull --ff-only
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

The **Release and deploy** workflow then:

1. Confirms that the tag version matches `package.json`.
2. Confirms that the tagged commit is contained in `main`.
3. Reruns all code-quality checks and tests.
4. Builds and packages the tagged source.
5. Uploads the build to Hawk Host over SSH.
6. Installs production dependencies and runs database migrations.
7. Restarts the cPanel Node.js application.
8. Verifies `https://fair-share.jmotaylor.com/api/health`.
9. Publishes the GitHub release and attaches the production build.

If any step fails, later steps do not run. In particular, a failed check cannot
deploy, and a failed deployment cannot be published as a GitHub release.
