export type MockFileNode = {
  id: string
  name: string
  path: string
  type: 'file' | 'directory'
  children?: MockFileNode[]
}

export const mockFiles: MockFileNode[] = [
  {
    id: 'src',
    name: 'src',
    path: 'src',
    type: 'directory',
    children: [
      {
        id: 'renderer',
        name: 'renderer',
        path: 'src/renderer',
        type: 'directory',
        children: [
          {
            id: 'components',
            name: 'components',
            path: 'src/renderer/components',
            type: 'directory',
            children: [
              {
                id: 'shared',
                name: 'shared',
                path: 'src/renderer/components/shared',
                type: 'directory',
                children: [
                  {
                    id: 'tabbar',
                    name: 'TabBar.tsx',
                    path: 'src/renderer/components/shared/TabBar.tsx',
                    type: 'file'
                  },
                  {
                    id: 'statusbadge',
                    name: 'StatusBadge.tsx',
                    path: 'src/renderer/components/shared/StatusBadge.tsx',
                    type: 'file'
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
]
