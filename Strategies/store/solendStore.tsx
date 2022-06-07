import create, { State } from 'zustand'
import axios from 'axios'
import { ConfigType } from '@solendprotocol/solend-sdk'

const SOLEND_ENDPOINT = 'https://api.solend.fi'

export interface SolendStore extends State {
  config?: ConfigType
  loadConfig: () => void
}
const useSolendStore = create<SolendStore>((set, _get) => ({
  loadConfig: async () => {
    const config = await (
      await axios.get(`${SOLEND_ENDPOINT}/v1/config?deployment=production`)
    ).data
    set((s: SolendStore) => {
      s.config = config
    })
  },
}))

export default useSolendStore
