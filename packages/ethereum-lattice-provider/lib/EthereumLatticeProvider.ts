import { LatticeProvider, LatticeProviderOptions } from '../../lattice-provider'
import { EthereumNetwork } from '@liquality/ethereum-networks'
import { Address } from '@liquality/types'

// @ts-ignore
import {
  remove0x
} from '@liquality/ethereum-utils'

// @ts-ignore
import { toRpcSig } from 'ethereumjs-util'

interface EthereumLatticeProviderOptions extends LatticeProviderOptions {
  network: EthereumNetwork
}

export default class EthereumLatticeProvider extends LatticeProvider {
  _network: EthereumNetwork

  //----------------------------------------------------------------------------
  constructor(options: EthereumLatticeProviderOptions) {
    const { network } = options
    super({ ...options }, network)

    this._network = network
  }

  //----------------------------------------------------------------------------
  // CONSTRUCT SIGNING REQUEST
  //----------------------------------------------------------------------------
  // @ts-ignore
  private _constructSigningRequest({ message, address }: { message: string; address: Address }): any {
    const payload = message
    const data = {
      protocol: 'signPersonal',
      payload: payload,
      signerPath: this._parse(address.derivationPath)
    }
    return {
      currency: 'ETH_MSG',
      data: data
    }
  }

  //----------------------------------------------------------------------------
  // SIGN MESSAGE
  //----------------------------------------------------------------------------
  async signMessage(message: string, from: string): Promise<string> {
    return await this
      .getAddresses()
      .then((addresses) => {
        const address = addresses[0]
        const signOpts = this._constructSigningRequest({ message, address })
        return this._sign(signOpts)
      })
      .then((signedTx) => {
        const { v, r, s } = signedTx.sig
        return remove0x(toRpcSig(v, Buffer.from(r, 'hex'), Buffer.from(s, 'hex')))
      })
  }
}
