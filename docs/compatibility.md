# Compatibility

## Verified versions

The shipped interface has been checked on OpenCode Desktop **2.2.5–2.2.7** on Linux. Windows and macOS have not been separately validated.

The plugin checks the expected Inbox selectors and native mode radios instead of a Desktop version allowlist, so compatible updates keep Projects working automatically. Future incompatible API or DOM changes can still require a plugin fix.

## Unsupported host integration

The GUI plugin API has no left-sidebar or interface-mode registry. `src/adapter.ts` is an explicitly unsupported DOM adapter, not a new native layout.

Only the Inbox list is visually covered; native header, search, new-session, and resize controls are kept. Native nodes are never removed or reparented. The hiding selector requires an immediately adjacent, ready plugin root, so removing the root automatically reveals Inbox even before cleanup. On a mismatched host structure the adapter leaves the standard interface alone.

## Startup guard and cold start

When the saved Projects selection is ready at plugin setup, the adapter immediately hides intermediate Inbox content without changing shell geometry. It removes this temporary guard when Projects mounts, when disabled, on failure or unload, or after at most two seconds if the host never becomes compatible.

Reconciliation waits for preference readiness and never persists the default over an unhydrated selection. The plugin cannot suppress frames painted before its setup runs: a fully seamless cold launch requires Desktop to coordinate the initial paint with GUI plugins. No separate startup cache or application patch is used.

## Failure handling

Mount or render failures reveal the standard Inbox and report an error once, without clearing the saved Projects preference or collapsed groups and branches. Automatic retries stop for that adapter instance. Select **Projects** again in Preferences to retry, or rebuild or reload after a fix.

While Projects is ready, the mount's extra shell bottom padding is removed so the footer's 9px bottom padding is measured to the actual sidebar edge, not an inset content box. The guard restores native spacing when Projects is hidden or unloaded.

## Host updates

A Desktop update can change the DOM the adapter relies on. In that case:

1. The plugin reveals the standard Inbox instead of leaving an empty or inaccessible sidebar.
2. An error is reported once; saved preferences and collapsed groups are preserved.
3. Open an issue with the Desktop version and a description of what changed.

Diagnostic builds that mount the plugin in the real Desktop window are documented in [CONTRIBUTING.md](../CONTRIBUTING.md). They are read-only apart from explicitly requested mock actions and must never be shipped.
