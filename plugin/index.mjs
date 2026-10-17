/**
 * Host half of `dsh-code-marks`.
 *
 * The plugin is browser-only: every mark, tag and highlight lives in the web
 * client, next to the conversation it annotates. The profile still needs one
 * Host-side entry so the client module system can see the package and serve
 * its `./client` bundle — this entry exists for exactly that reason and
 * deliberately registers nothing.
 */
export const name = 'code-marks'

/** No Host service, Tool, Route or Event: the client half owns everything. */
export function apply() {}
