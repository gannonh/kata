import { homedir } from 'os'
import { join } from 'path'

export const appRoot = join(homedir(), '.kata-cli')
export const agentDir = join(appRoot, 'agent')
export const sessionsDir = join(appRoot, 'sessions')
export const authFilePath = join(agentDir, 'auth.json')
