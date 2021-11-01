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

  async importAddresses() {
    const change = await this.getAddresses(0, 5, true)
    const nonChange = await this.getAddresses(0, 5, false)
    const all = [...nonChange, ...change].map((address) => address.address)
    await this.getMethod('importAddresses')(all)
  }

  //----------------------------------------------------------------------------
  // CONSTRUCT SIGNING REQUEST
  //----------------------------------------------------------------------------
  // @ts-ignore
  private _constructSigningRequest({ message, address }: { message: string; address: Address }): any {
    const data = {
    }
    return {
      currency: 'BTC',
      data: data
    }
  }

  //----------------------------------------------------------------------------
  // SIGN MESSAGE
  //----------------------------------------------------------------------------
  async signMessage(message: string, from: string): Promise<string> {
    return await this
      .getWalletAddress(from)
      .then((address) => {
        const signOpts = this._constructSigningRequest({ message, address })
        return this._sign(signOpts)
      })
      .then((signedTx) => {
        const { r, s } = signedTx.sig
        return r + s
      })
  }
}
