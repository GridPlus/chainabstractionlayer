import { Network } from '@liquality/types'
import { WalletProvider } from '@liquality/wallet-provider'
import { WalletError } from '@liquality/errors'
import { Address } from '@liquality/types'
import { Client } from 'gridplus-sdk'
import crypto, { createHash } from 'crypto'

// @ts-ignore
const LATTICE_SIGNING_DEV = 'https://signing.staging-gridpl.us'
const LATTICE_SIGNING_PROD = 'https://signing.gridpl.us'

export interface LatticeProviderOptions {
  pairingCodeProvider?: () => Promise<string>
  appName?: string
  derivationPath: string
  deviceEndpoint?: string
  deviceID: string
  devicePassword: string
}

export default abstract class LatticeProvider extends WalletProvider {
  _derivationPath: string
  _deviceID: string
  _cachedAddresses: Array<Address>
  _pairingCodeProvider?: () => Promise<string>
  protected _lattice: any

  constructor(options: LatticeProviderOptions, network: Network) {
    const {
      pairingCodeProvider,
      appName = 'Liquality',
      derivationPath,
      deviceEndpoint = LATTICE_SIGNING_PROD,
      deviceID,
      devicePassword,
    } = options

    //--------------------------------------------------------------------------
    super({ network: network })

    //--------------------------------------------------------------------------
    this._derivationPath = derivationPath
    this._deviceID = deviceID
    this._pairingCodeProvider = pairingCodeProvider
    this._cachedAddresses = []
    //--------------------------------------------------------------------------
    console.log(`${JSON.stringify(network, null, 2)}`)
    console.log(`${JSON.stringify(this._derivationPath, null, 2)}`)

    //--------------------------------------------------------------------------
    const privKeyPreImage = Buffer.concat([Buffer.from(deviceID), Buffer.from(devicePassword), Buffer.from(appName)])

    //--------------------------------------------------------------------------
    const clientOpts = {
      name: appName,
      baseUrl: deviceEndpoint,
      crypto,
      timeout: 180000,
      privKey: createHash('sha256').update(privKeyPreImage).digest()
    }

    //--------------------------------------------------------------------------
    this._lattice = new Client(clientOpts)
  }

  //----------------------------------------------------------------------------
  // CACHING
  //----------------------------------------------------------------------------
  _addressIsCached(address: Address): boolean {
    return this._getAddresses(address) === null
  }

  public _getCachedAddress(from: string): Address | null {
    return this._cachedAddresses.filter((address) => address.address === from)[0]
  }

  //----------------------------------------------------------------------------
  // PARSE & VALIDATE PATHS
  //----------------------------------------------------------------------------
  _parse(derivationPath: string = this._derivationPath): Array<number> {
    const pathIndices: Array<number> = []
    derivationPath.split('/').forEach((i) => {
      const hardIdx = i.indexOf("'")
      const isHard = hardIdx > -1
      const iNum = isHard ? i.slice(0, hardIdx) : i
      if (!isNaN(Number(iNum))) {
        pathIndices.push(isHard ? Number(iNum) + 0x80000000 : Number(iNum))
      }
    })
    return pathIndices
  }

  _isValidAssetPath(path: Array<number> = this._parse()): boolean {
    const HARDENED_OFFSET = 0x80000000
    const allowedPurposes = [HARDENED_OFFSET + 49, HARDENED_OFFSET + 44]
    const allowedCoins = [HARDENED_OFFSET, HARDENED_OFFSET + 1, HARDENED_OFFSET + 60]
    const allowedAccounts = [HARDENED_OFFSET]
    const allowedChange = [0, 1]
    return (
      allowedPurposes.indexOf(path[0]) >= 0 &&
      allowedCoins.indexOf(path[1]) >= 0 &&
      allowedAccounts.indexOf(path[2]) >= 0 &&
      allowedChange.indexOf(path[3]) >= 0
    )
  }

  //----------------------------------------------------------------------------
  // CONNECT
  //----------------------------------------------------------------------------
  private _connect(deviceId: string = this._deviceID): Promise<boolean> {
    return new Promise<boolean>((resolved, rejected) => {
      this._lattice.connect(deviceId, (err: Error, isPaired: boolean) => {
        if (err) {
          const { name, ...errorNoName } = err
          rejected(new WalletError(err.toString(), errorNoName))
        } else {
          resolved(isPaired)
        }
      })
    })
  }

  //----------------------------------------------------------------------------
  // PAIR
  //----------------------------------------------------------------------------
  private _pair(secret: string): Promise<boolean> {
    return new Promise<boolean>((resolved, rejected) => {
      this._lattice.pair(secret, (err: Error, hasActiveWallet: boolean) => {
        if (err) {
          const { name, ...errorNoName } = err
          rejected(new WalletError(err.toString(), errorNoName))
        } else {
          resolved(hasActiveWallet)
        }
      })
    })
  }

  //----------------------------------------------------------------------------
  // GET ADDRESSES
  //----------------------------------------------------------------------------
  private _getAddresses(request: any): Promise<[string]> {
    return new Promise((resolved, rejected) => {
      this._lattice.getAddresses(request, (err: Error, res: [string]) => {
        if (err) {
          const { name, ...errorNoName } = err
          rejected(new WalletError(err.toString(), errorNoName))
        } else {
          resolved(res)
        }
      })
    })
  }

  //----------------------------------------------------------------------------
  // SIGN
  //----------------------------------------------------------------------------
  protected _sign(opts: any): Promise<any> {
    return new Promise((resolved, rejected) => {
      this._lattice.sign(opts, (err: Error, res: any) => {
        if (err) {
          const { name, ...errorNoName } = err
          rejected(new WalletError(err.toString(), errorNoName))
        } else {
          resolved(res)
        }
      })
    })
  }

  //----------------------------------------------------------------------------
  // WALLETPROVIDER IMPL
  //----------------------------------------------------------------------------
  async isWalletAvailable(): Promise<boolean> {
    try {
      const isPaired = await this._connect()
      if (!isPaired) {
        const secret = await this._pairingCodeProvider()
        const active = await this._pair(secret)
        return Promise.resolve(active)
      }
      return Promise.resolve(isPaired)
    } catch (e) {
      return Promise.reject(e)
    }
  }

  async getAddresses(startingIndex: number = 0, numAddresses: number = 1, change?: boolean): Promise<Address[]> {
    return await this
      .isWalletAvailable()
      .then((isWalletAvailable) => {
        if (isWalletAvailable === false) {
          throw new Error('Device not available.')
        }
        const startPath = this._parse()
        startPath[4] = startingIndex
        const req = {
          startPath: startPath,
          n: numAddresses
        }
        console.log(`${JSON.stringify(req, null, 2)}`)
        return this._getAddresses(req)
      })
      .then((addresses) => {
        // Convert address strings to 'Address'.
        const asAddresses = addresses.map((address, index) => {
          //----------------------------------------------------------------------
          // Replaces 'change` (default: 0) with the appropriate value.
          // Replaces 'address_index` (default: 0) with the correct index offset.
          //----------------------------------------------------------------------
          const pathIndices = this._parse()
          const changePathLength = parseInt(`${pathIndices[3].toString().length}`)
          const indexPathLength = parseInt(`${pathIndices[4].toString().length}`)
          const changeString = change ? '1' : '0'
          const changeAndIndexString = `${changeString}/${startingIndex + index}`
          const derivationPath = `${this._derivationPath.slice(0, -(changePathLength + indexPathLength))}${changeAndIndexString}`
          //----------------------------------------------------------------------
          return new Address({
            address: address,
            derivationPath: derivationPath,
            publicKey: address
          })
        })
        // Cache the addresses, if necessary.
        asAddresses.forEach((address) => {
          if (this._addressIsCached(address) === false) {
            this._cachedAddresses.push(address)
          }
        })
        console.log(`${JSON.stringify(asAddresses, null, 2)}`)
        return asAddresses
      })
  }

  async getUsedAddresses(numAddressPerCall?: number): Promise<Address[]> {
    throw new Error()
  }

  async getUnusedAddress(change?: boolean, numAddressPerCall?: number): Promise<Address> {
    throw new Error()
  }

  async getConnectedNetwork() {
    return Promise.resolve(this._network)
  }
}
