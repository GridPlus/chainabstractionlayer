import { LatticeProvider, LatticeProviderOptions } from '../../lattice-provider'
import { BitcoinNetwork } from '@liquality/bitcoin-networks';

interface BitcoinLatticeProviderOptions extends LatticeProviderOptions {
  network: BitcoinNetwork
}

export default class BitcoinLatticeProvider extends LatticeProvider {
  _network: BitcoinNetwork

  //----------------------------------------------------------------------------
  constructor(options: BitcoinLatticeProviderOptions) {
    const { network } = options
    super({ ...options }, network)

    this._network = network
  }

  async signMessage(message: string, from: string): Promise<string> {
    throw new Error()
  }
}
