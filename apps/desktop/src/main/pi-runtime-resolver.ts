import path from 'node:path'

export function resolvePiRuntimePaths(input: {
  isPackaged: boolean
  resourcesPath: string
  platform: NodeJS.Platform
}) {
  const launcher = input.platform === 'win32'
    ? path.join(input.resourcesPath, 'pi.cmd')
    : path.join(input.resourcesPath, 'pi')

  return {
    launcher,
    kataCli: path.join(input.resourcesPath, 'kata-cli'),
    skillBundle: path.join(input.resourcesPath, 'kata-skills'),
    symphony: input.platform === 'win32'
      ? path.join(input.resourcesPath, 'symphony.exe')
      : path.join(input.resourcesPath, 'symphony'),
  }
}
