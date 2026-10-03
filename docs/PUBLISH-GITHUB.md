# Publish the Developer Preview to GitHub

The connected GitHub account is `Projetxana`. The suggested public repository name is:

`Projetxana/gate-authority-network`

From the repository root on macOS:

```bash
brew install gh        # only if gh is not installed
gh auth login          # only if gh is not authenticated
./scripts/publish-github.sh
```

The script initializes `main`, creates the first commit, creates the public GitHub repository if needed, and pushes the validated Developer Preview.

To use a different repository name:

```bash
./scripts/publish-github.sh Projetxana/another-name public
```

Do not publish secrets, private keys, customer data, or production credentials. The current preview uses generated/local demo identities only.
