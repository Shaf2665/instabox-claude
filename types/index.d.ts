export type MachineRow = {
  account: string
  id: string
  name: string
  state: string
  isReady: boolean
  cooldownUntil: string | null
  note: string
}

export type View = { rows: MachineRow[]; message: string }

declare module 'claude-code' {
  interface PluginState {
    instabox: { view: Shaped<View> }
  }
}
