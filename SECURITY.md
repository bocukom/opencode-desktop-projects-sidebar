# Security

## Supported versions

Security fixes are provided for the latest published beta. The plugin is verified against OpenCode Desktop 2.2.5–2.2.7.

## Reporting

Do not open a public issue for a vulnerability. Use GitHub Security Advisories for the repository, or email the maintainer at the address in `package.json`.

Include the plugin version, Desktop version, OS, and a minimal description. Do not include prompts, session transcripts, tokens, screenshots with private project names, or log files that have not been redacted.

## Scope and data handling

- The plugin runs inside OpenCode Desktop and uses the host's authenticated clients. It does not add network endpoints or credentials.
- It reads project catalogues, session indexes, activity metadata, and pending-request state.
- It writes only when the user triggers a native action: rename, fork, close, delete, or opening a draft. It never sends prompts on its own.
- Preferences are stored in OpenCode's plugin storage: enabled state, collapsed groups, draft-tab links, and sidebar width. Prompt content and attachments stay in OpenCode's own composer storage.
- The plugin does not patch application files and does not store session transcripts.

Diagnostic builds used during development can mount the plugin and read real history in a Desktop window. They are not part of the published package and must never be shipped.
