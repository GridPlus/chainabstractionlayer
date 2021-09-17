import { LatticeProvider } from '../../lattice-provider'
import { BitcoinWalletProvider } from '@liquality/bitcoin-wallet-provider'

// import { padHexStart } from '@liquality/crypto'
// import { compressPubKey, getAddressNetwork, decodeRawTransaction } from '@liquality/bitcoin-utils'
import { BitcoinNetwork } from '@liquality/bitcoin-networks'
import { bitcoin, Address } from '@liquality/types'
// import { address, Psbt, PsbtTxInput, Transaction as BitcoinJsTransaction, script } from 'bitcoinjs-lib'

const HARDENED_OFFSET = 0x80000000

class HwAppBitcoin {
  client: any
  deviceID: string
}

type WalletProviderConstructor<T = LatticeProvider<HwAppBitcoin>> = new (...args: any[]) => T

interface BitcoinLatticeProviderOptions {
  network: BitcoinNetwork
  baseDerivationPath: string
  addressType?: bitcoin.AddressType
  appName?: string
}

export default class BitcoinLatticeProvider extends BitcoinWalletProvider(
  LatticeProvider as WalletProviderConstructor
) {
  _walletAddressKeyCache: { [index: string]: any }
  _baseDerivationPath: string

  constructor(options: BitcoinLatticeProviderOptions) {
    const { network, baseDerivationPath, addressType = bitcoin.AddressType.BECH32, appName = null } = options
    super({ network, addressType, App: HwAppBitcoin, appName })
    this._walletAddressKeyCache = {}
    this._baseDerivationPath = baseDerivationPath
  }

  async getAddresses(startIdx = 0, numAddresses = 1, change = false): Promise<Address[]> {
    if (numAddresses < 1) {
      throw new Error('You must return at least one address')
    }
    const app = await this.getApp()
    const addresses = []
    const changeVal = change ? '1' : '0'
    for (let i = startIdx; i < startIdx + numAddresses; i++) {
      const pathStr = `${this._baseDerivationPath}/${changeVal}/${i}`
      const pathIdxs = this._getPathIndices(pathStr)
      const opts = {
        startPath: pathIdxs,
        n: 1
      }
      const address = await app.client.getAddresses(opts)
      addresses.push(address)
    }
    return addresses
  }

  async signMessage(message: string, from: string) {
    // TODO: Implement
    return message + from
  }

  _getPathIndices(path: string): number[] {
    const indices: number[] = []
    path.split('/').forEach((i: string) => {
      if (i !== 'm') {
        if (i.indexOf("'") > -1) {
          const _i = i.slice(i.indexOf("'"))
          indices.push(Number(_i) + HARDENED_OFFSET)
        } else {
          indices.push(Number(i))
        }
      }
    })
    return indices
  }
}
