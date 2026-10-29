import { type Command, STATE_COMMANDS, viewCommands } from '@state'
import { viewTitles } from '../layout/view-titles'

/** Every command, by id: `state`'s, the views' (titled by `viewTitles`) and those that need `ui`. */
export const COMMANDS: readonly Command[] = [...STATE_COMMANDS, ...viewCommands(viewTitles)]

const byId = new Map(COMMANDS.map((command) => [command.id, command]))

export const commandById = (id: string): Command | undefined => byId.get(id)
