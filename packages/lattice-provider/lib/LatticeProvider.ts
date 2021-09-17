import { WalletProvider } from '@liquality/wallet-provider'
import { WalletError } from '@liquality/errors'
import { Network } from '@liquality/types'
import { Client } from 'gridplus-sdk'
const crypto = require('crypto')
const DEFAULT_APP_NAME = 'Liquality Wallet'
const GRIDPLUS_CONNECT_DEV = 'https://gridplus-web-wallet-dev.herokuapp.com'
const GRIDPLUS_CONNECT_PROD = 'https://wallet.gridplus.io'
const GRIDPLUS_SIGNING_DEV = 'https://signing.staging-gridpl.us'
const GRIDPLUS_SIGNING_PROD = 'https://signing.gridpl.us'

interface IApp {
  client: any
  deviceID: string
}

export type Newable<T> = { new (...args: any[]): T }

export default abstract class LatticeProvider<TApp extends IApp> extends WalletProvider {
  _App: any
  _network: Network
  _appName: string
  _appInstance: TApp

  constructor(options: { App: Newable<TApp>; network: Network; appName: string }) {
    super({ network: options.network })

    this._App = options.App
    this._network = options.network
    this._appName = options.appName || DEFAULT_APP_NAME;
  }

  errorProxy(target: any, func: string) {
    const method = target[func]
    if (Object.getOwnPropertyNames(target).includes(func) && typeof method === 'function') {
      return async (...args: any[]) => {
        debug(`calling "${func}" on ledger object`, args)

        try {
          const result = await method.bind(target)(...args)
          debug(`result from "${func}" on ledger object`, result)
          return result
        } catch (e) {
          const { name, ...errorNoName } = e
          this._transport = null
          this._appInstance = null
          throw new WalletError(e.toString(), errorNoName)
        }
      }
    } else {
      return method
    }
  }

  async getApp() {
    if (!this._appInstance) {
      // Open a window to the Lattice connector web application
      const base = this.network.isTestnet ? GRIDPLUS_CONNECT_DEV : GRIDPLUS_CONNECT_PROD
      const url = `${base}?keyring=${this._appName}`
      const popup = window.open(url)
      popup.postMessage('GET_LATTICE_CREDS', base)

      // PostMessage handler
      function receiveMessage(event) {
        // Ensure origin
        if (event.origin !== base)
          return;
        // Parse response data
        try {
          const data = JSON.parse(event.data);
          if (!data.deviceID || !data.password) {
            throw new WalletError('Invalid credentials returned from Lattice.')
          }
          // Instantiate an SDK client with the returned credential data
          const defaultSigningUrl = this.network.isTestNet ? GRIDPLUS_SIGNING_DEV : GRIDPLUS_SIGNING_PROD
          const privKeyPreImage = Buffer.concat([
            Buffer.from(data.password),
            Buffer.from(data.deviceID),
            Buffer.from(this._appName)
          ])
          const clientOpts = {
            name: this._appName,
            baseUrl: data.endpoint ? data.endpoint : defaultSigningUrl,
            crypto,
            timeout: 180000,
            privKey: crypto.createHash('sha256').update(privateKeyPreImage).digest(),
          }
          const client = new Client(clientOpts)
          // Add the client to our app instance and return
          this._appInstance = new Proxy(new this._App(client, data.deviceID), { get: this.errorProxy.bind(this) })
          // Connect to the device
          await this._connect()
          // Return the connected instance
          return this._appInstance
        } catch (err) {
          throw new WalletError(err.toString())
        }
      }
      window.addEventListener("message", receiveMessage, false);
    } else {
      // Connect and return the instance
      await this._connect()
      return this._appInstance
    }
  }

  async isWalletAvailable() {
    const app = await this.getApp()
    // Connect to the Lattice device
    await this._connect()
    // If we didn't throw an error, the wallet is available
    return true
  }

  async getConnectedNetwork() {
    return this._network
  }

  // Connect to the user's Lattice via the instantiated app's SDK Client.
  // The state inside the client object will be updated with a new wallet UID
  // if the user has switched wallets (e.g. using a SafeCard).
  _connect() {
    return new Promise((resolve, reject) => {
      if (!this._appInstance) {
        throw new WalletError('GridPlus SDK client not instantiated.')
      }
      this._appInstance.client.connect(this._appInstance.deviceID, (err) => {
        if (err) {
          throw new WalletError(err.message())
        }
        return resolve()
      })
    })
  }
}
