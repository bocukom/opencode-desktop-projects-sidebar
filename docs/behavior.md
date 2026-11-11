# Interaction contract

Detailed behavior of the Projects sidebar. It is intentionally specific: these rules describe what the plugin guarantees beyond the native Inbox.

## Preferences card and footer controls

- Selecting **Projects / Experimental** invokes the native Inbox radio and keeps the plugin's enabled preference separately. OpenCode's persisted layout remains `inbox`, never an unsupported enum value.
- The Projects card uses the native compact preview/name structure. Its experimental label and description are in the tooltip; the radio keeps a localized Projects / Experimental accessible label. While Projects is active, only its card is visually selected; the underlying Inbox keeps its native metadata but no second selected border. Switching modes, failure recovery, and unload restore native selection styling.
- The gear at the logical end of the footer opens native General settings. It has a localized tooltip and keyboard access.
- When the native updater appears, its existing button is placed immediately before Settings in the same footer row, with an 18px icon and a 28px button centered in a 30px slot. The extra native footer row is collapsed. Native update handlers, busy/disabled state, and accessible labels remain intact; the full action label is also a tooltip. No update is triggered automatically. Disabling Projects restores the native placement. Unknown icons or footers shared with other controls are left untouched.
- The single-line footer places a compact, content-width segmented activity panel at the logical start and Settings at the end. There is no separate loaded-chat counter. The panel is 30px high, with a 14px radius, 16px icons, a fine vertical button divider, and equal 9px top/bottom footer padding. Narrow sidebars hide the activity icons and keep short labels and count badges.
- **In Progress** is blue and **Unread** is yellow when nonempty, with separate count badges and an accent-tinted selection for the open menu. The history/footer divider fades out at both ends.
- Native session-selection menus match the panel's width and edges, with an 8px gap; viewport clamping takes priority near screen boundaries. `src/activity-popup.ts` adjusts only the linked menu's width and CSS translation, preserving the native positioner and interactions. Popups have 4px padding, headings, and compact single-line rounded rows, without project subtitles, action ellipses, or decorative blue dots.
- Long session titles truncate, with complete titles in native `title` tooltips and accessible names. Pending permission or answer requests belong to **In Progress**, even without a running execution, and have a short inline status badge with the full explanation in the tooltip. **Unread** means completed unread answers. Counts cover loaded history only; zero-count segments are neutral and disabled.
- Removing the last popup entry disposes an open menu, while partial updates keep it open. Presentation attributes are applied only to menus linked to these triggers; unrelated native menus are untouched.
- **Restore the standard sidebar** in the command palette exits Projects. There is no footer Inbox button; automatic failure recovery still reveals native Inbox.

## Width persistence

While Projects is active, the plugin saves the full native sidebar width in its global preferences and restores it on the next ready mount, including after application restart. Closed or peek startup waits until the sidebar is docked and open.

Restoration updates native resize state, so subsequent dragging does not jump back to the default. Widths outside the native 136–640px range are ignored. An unsupported resize implementation leaves the saved value untouched rather than applying a CSS override. Changes made while Projects is disabled are not tracked.

## Data and grouping

`Store.global` persists the enabled state and collapsed group keys, not session copies. Projects are always alphabetical by name, ignoring case and comparing embedded numbers naturally.

Root chats and sibling forks within each project are sorted by the session index's `time.updated`, newest first, with a deterministic ID tie-break. Selection does not override index metadata with potentially stale selected-session cache data. Actual chat updates can move a row; simply selecting it cannot promote the project.

Group identity includes server, project identity, and the full project/checkout path. Worktrees and subfolders under a known project stay together; unrelated same-basename projects, clones, and servers do not merge. Service subagent sessions and archived sessions are excluded, as on the host's main history surface.

Each project initially shows ten root chats, excluding their forks from that limit. Each nested fork sibling list independently shows ten entries. **Show more** reveals the next ten siblings without requesting history or opening a chat. Its trailing marker summarizes only the still-hidden siblings and all their descendants: red for pending approval or input, a working radar for running execution, yellow for completed unread answers, with that priority and an explanatory tooltip and accessibility label.

Expanded page sizes survive metadata refreshes while mounted; existing row identity and branch collapse state are retained. Popup navigation reveals every required page as well as project and fork ancestors. Project headers have no numeric counters. Project catalogues and session indexes use the host's authenticated clients; transcripts are not loaded by this plugin. Selected rows and the active project's name are highlighted.

The plugin reads the first 100 root sessions per connected server and exposes **Load older chats** when another full page may exist.

## Forks

Normal forks are displayed directly beneath their source chat in indented nested lists with a muted vertical tree line. The line curves toward the last child's row and stops at its vertical center, even when that child has its own descendants.

Forks of forks nest further; branches stay expanded within an open project. Only the native `fork.sessionID` link establishes this relationship, never titles or subagent `parentID`. Each fork stays an independent native session with its own menu, rename, activity, and selection. Creating or updating a fork does not promote its source among root chats.

A source outside the loaded project group (including an archived, deleted, or not-yet-loaded source) leaves its forks visible as roots; pagination can reconnect them when the source arrives. Invalid cycles are broken without hiding any sessions. No context compaction is requested or performed.

## Session indicators

Every session has an indicator to the left of the title: a small gray dot by default and after viewing, the muted animated 5×5 Soft Radar grid while working, and a small yellow dot after successful completion until viewed. Gray is neutral, not a claim of successful completion.

The 16px radar preserves the original marker center, title gutter, and compact row height. Its geometry, rounded dots, opacity sweep, and 1.8-second loop match Desktop 2.2.5's AI Spinner. The GUI SDK exports only the unrelated circular Loader, so the plugin carries a small compatibility copy (`spinner-radar.ts`, `working-indicator.tsx`) rather than importing unsupported runtime modules.

Keyframes are plugin-namespaced and removed with the plugin style; radar instances share the host's document-origin phase, pause offscreen, release their observers on unmount, and freeze to the native still frame for reduced motion or forced colors. Working titles keep their normal color with a soft left-to-right opacity wave (60–100% opacity), not a colored text or background sweep. Reduced-motion and forced-color modes remove the mask and keep static readable text.

Opening a completed chat replaces yellow with gray, and leaving it does not resurrect the same unread mark from stale history. A new background completion can mark it again. Failed or interrupted executions are not labeled ready. Native execution and viewed events plus `time.busy`/`idle`/`viewed` metadata drive these states, not title prefixes or `time.updated`.

Event tracking stays active across sidebar mode switches, uses no polling or extra server writes, and detaches on plugin cleanup. The host persists viewed metadata through its normal chat navigation.

## Pending requests

Red takes priority when a native permission awaits approval or a question, MCP elicitation, or provider-selection form awaits the user's answer. Hover and accessibility labels distinguish **Waiting for permission approval** from **Waiting for your answer**. Red is not an error indicator.

Red replaces the radar, stops the working-title wave, and remains even in the selected chat; viewing does not answer anything. The last pending request must be answered, rejected, or cancelled before the row returns to its underlying working, yellow, or gray state.

Native reactive pending-request stores handle removals and existing requests after plugin remount; the plugin adds no request cache, polling, auto-approval, or reply writes. Native subagent families propagate pending requests to their visible root, but independent forks never propagate them to their source. Disconnected servers suppress cached red markers. Initial pending-request loading remains owned by the native Inbox and tab model.

Collapsed project headings show a small yellow dot when any loaded chat in that exact server/project group has a completed unread answer, including nested forks. Pending permission or answer requests take priority with a red dot; its tooltip and accessible label distinguish approval from input. The marker disappears while the project is expanded and updates with the shared activity source, with no extra polling, session writes, or numeric project counters. The project plus follows the same hover, keyboard, and touch rules whether collapsed or expanded.

## Session actions

Each chat has a vertical three-dot menu, visible on hover or keyboard focus and always visible on touch devices. It uses the host's menu, including keyboard navigation, viewport-aware placement, outside-click dismissal, and Escape.

- **Rename** edits the title inline; double-clicking the title does the same. Both place the caret at the beginning without selecting the title and show the beginning of long names. Enter or leaving the field saves; Escape cancels. Saving on blur does not steal focus from the clicked target. Empty names are never submitted; failed saves retain the draft for retry.
- **Fork** copies the whole conversation into an independent session and opens it.
- **Close** archives the session and closes its open tabs, without deleting its history.
- **Delete** requires confirmation in the host's destructive-action dialog before permanent removal.

Writes use the row's authenticated server client, never the selected chat's server. Failed actions leave history and tabs intact and show a generic error; duplicate writes to one session are blocked. Action-triggered refreshes preserve older loaded pages.

After successfully closing or deleting the active chat, selection goes to the nearest remaining chat above it in that same sidebar project group (same server and checkout), or below if none remain above. The sidebar order is captured before removal events can erase the row; disappeared or pending-removal neighbors are skipped. When the group is empty, a blank unsent draft opens in its directory instead of switching projects. Background removals, cancellations, failures, and switching away while a request is pending do not steal selection. Navigation is applied before closing matching tabs so native tab-strip fallback does not pick another project.

## Project plus and drafts

The plus at the end of each project heading appears while hovering anywhere in that project block (heading or chats), including a collapsed heading. Focus on a selected chat or summary never keeps it visible after the pointer leaves. Direct keyboard focus on the plus itself reveals it for accessibility; touch devices keep it visible.

Clicking it expands that project and opens an empty native draft on that project's server and directory, or focuses its existing plus-created draft. Empty drafts are reused too. Switching chats or projects, or remounting the sidebar, does not lose unsent text or attachments: OpenCode owns and persists the composer. The plugin stores only draft-tab to server/directory links (also retained across plugin reloads), never prompt content.

After sending or closing the draft, the next plus creates a fresh one. Pre-existing drafts created outside this plus are not adopted because the public API does not expose their project. Creation is serialized to prevent rapid-click duplicates; disconnected or incompatible servers cannot start drafts. Plus never collapses an open project, changes chat ordering, or sends anything.

## Header and list layout

Project paths appear only in header tooltips, not as extra sidebar rows. Compact muted project headers use a left-hand outlined SVG chevron with rounded ends and join, shared with fork branches, with separated groups and comfortably spaced chat rows. Disclosure animation follows the system's reduced-motion preference. Native `details`/`summary` semantics and keyboard focus remain intact.

Long session names use a 20px trailing fade instead of an ellipsis. Short names remain fully opaque. A row-local ResizeObserver and reactive title updates remeasure overflow after resizing, collapsing or revealing groups, metadata changes, and rename; observers disconnect on unmount.

The fade is on a dedicated title viewport, separate from the inner working-title wave and outer menu mask. Forks have no redundant trailing icon: their nesting and connectors identify them, leaving the full remaining width for the title. RTL mirrors the fade; reduced motion keeps the static fade, while forced colors use a readable ellipsis without transparency. Full titles remain available to accessibility and native tooltips.

Task rows use a compact internal layout: root-list indentation is 6px instead of 14px, title insets within each row are 20/2px instead of 28/28px, and the dot-to-title gap is 7px instead of 11px (2px instead of 6px for the working grid). Together this gives root titles 42px more width than the original layout at the same sidebar width.

The 24×24px menu overlays the trailing text instead of reserving space, reclaiming 24px over the preceding compact layout. On hover, keyboard focus, or while the menu is open, only the trailing text fades under the unmasked button; title position and width never change. Touch keeps both menu and fade visible; forced colors use crisp clipping instead of a gradient. Row height, project headings, native controls, and the 18px-per-level fork hierarchy are unchanged; fork elbows end before the narrower indicator gutter. Logical insets and fades mirror in RTL.

## Sidebar geometry

While Projects is active, the native sidebar mount's external horizontal gutters are halved from 18/10px to 9/5px (start/end), and its duplicate bottom shell inset is removed. This rule does not modify internal row spacing, native control padding, top spacing, or resizing. It requires the same adjacent covered Inbox and ready plugin root; switching modes, losing the root, or unloading immediately restores native spacing without rewriting host styles.

History alone extends into the remaining 5px end gutter, placing its native scrollbar at the sidebar divider and giving titles another 5px. The footer keeps its 5px inset and native header controls do not move. The stable scrollbar gutter remains reserved; the resize handle stays outside the history viewport. Logical margins mirror with RTL. The history scrollbar thumb also drops its end-side transparent border, so the visible thumb reaches the divider while its native 8px target, colors, and scrolling behavior remain unchanged.

Desktop's visible chat frame is another 8px beyond the sidebar layout box. While Projects is docked and open (not peeking), history uses 6px of that strip, leaving 2px to the visible frame and adding another 6px of title width. The native panel's paint box extends by 6px without changing the sidebar's layout width; matching end padding keeps header and footer content unchanged. The native 8px resize target moves alongside history without overlap. Paint containment and clipping remain enabled, and switching modes, peeking, or unloading restores native panel and handle geometry.

## Data freshness

Metadata events refresh the history with a short debounce; message-stream deltas do not cause refetches. There is no background polling. Network errors retain loaded rows and offer retry; disconnected servers are labeled and their rows disabled. Reconnect refreshes the index.

Switching away aborts in-flight history reads and removes history subscriptions; activity subscriptions remain until plugin cleanup. Opening a session may update the host's normal viewed metadata. The plugin never sends prompts.

Selecting an activity-popup entry opens the native chat, expands its project and all enclosing fork branches, and scrolls only the history viewport enough to reveal the selected row. Unrelated collapsed groups and branches are preserved. Popup corners use a smaller 12px radius; the segmented panel retains its 14px radius.
