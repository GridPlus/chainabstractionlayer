import { WalletProvider } from '@liquality/wallet-provider'
import { WalletError } from '@liquality/errors'
import { Network } from '@liquality/types'
import { Client } from 'gridplus-sdk'
import crypto, { createHash } from 'crypto'
const DEFAULT_APP_NAME = 'Liquality Wallet'
const GRIDPLUS_CONNECT_DEV = 'https://gridplus-web-wallet-dev.herokuapp.com'
const GRIDPLUS_CONNECT_PROD = 'https://wallet.gridplus.io'
const GRIDPLUS_SIGNING_DEV = 'https://signing.staging-gridpl.us'
const GRIDPLUS_SIGNING_PROD = 'https://signing.gridpl.us'
let GLOBAL_CLIENT_DATA: SDKClientInfo = null
let GLOBAL_CONNECT_INFO: LatticeConnectInfo = {
  appName: null,
  isTestnet: false
}

interface IApp {
  client: any
  deviceID: string
}

interface LatticeConnectInfo {
  appName: string
  isTestnet: boolean
}

interface SDKClientInfo {
  sdkClient: any
  deviceID: string
}

export type Newable<T> = { new (...args: any[]): T }

export default abstract class LatticeProvider<TApp extends IApp> extends WalletProvider {
  _App: any
  _network: Network
  _appName: string
  _appInstance: TApp
  _isWaitingForWindow: boolean

  constructor(options: { App: Newable<TApp>; network: Network; appName: string }) {
    super({ network: options.network })

    this._App = options.App
    this._network = options.network
    this._appName = options.appName || DEFAULT_APP_NAME
    this._isWaitingForWindow = false
    // Set up our connect info object. This is global to handle scoping of a window event listener.
    GLOBAL_CONNECT_INFO = {
      isTestnet: this._network.isTestnet,
      appName: this._appName
    }
  }

  errorProxy(target: any, func: string) {
    const method = target[func]
    if (Object.getOwnPropertyNames(target).includes(func) && typeof method === 'function') {
      return async (...args: any[]) => {
        try {
          const result = await method.bind(target)(...args)
          return result
        } catch (e) {
          const { name, ...errorNoName } = e
          this._appInstance = null
          throw new WalletError(e.toString(), errorNoName)
        }
      }
    } else {
      return method
    }
  }

  async getApp() {
    if (!this._appInstance && !this._isWaitingForWindow) {
      // Open a window to the Lattice connector web application
      const base = GLOBAL_CONNECT_INFO.isTestnet ? GRIDPLUS_CONNECT_DEV : GRIDPLUS_CONNECT_PROD
      const url = `${base}?keyring=${GLOBAL_CONNECT_INFO.appName}`
      console.log('Opening window', url)
      const popup = window.open(url)
      this._isWaitingForWindow = true
      popup.postMessage('GET_LATTICE_CREDS', base)
      window.addEventListener('message', this._handleNewAppInstance, false)
      const tmpInterval = setInterval(() => {
        console.log('waiting for app instance')
        if (GLOBAL_CLIENT_DATA) {
          const { sdkClient, deviceID } = GLOBAL_CLIENT_DATA
          this._appInstance = new Proxy(new this._App(sdkClient, deviceID), { get: this.errorProxy.bind(this) })
          GLOBAL_CLIENT_DATA = null
          this._isWaitingForWindow = false
          console.log('got app instance')
          clearInterval(tmpInterval)
          return this._appInstance
        }
      }, 1000)
    } else {
      return this._appInstance
    }
  }

  async isWalletAvailable() {
    console.log('checking if wallet is available')
    if (!this._appInstance) {
      return false
    }
    await this.getApp()
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
  async _connect() {
    /*
    if (!this._appInstance) {
      throw new WalletError('GridPlus SDK client not instantiated.')
    }
    this._appInstance.client.connect(this._appInstance.deviceID, (err) => {
      if (err) {
        throw new WalletError(err.message())
      }
      return
    })
    */
    return
  }

  _handleNewAppInstance(event: any) {
    console.log('got event from', event.origin, JSON.parse(event.data))
    console.log('what is my scope', this)
    // Ensure origin
    const base = GLOBAL_CONNECT_INFO.isTestnet ? GRIDPLUS_CONNECT_DEV : GRIDPLUS_CONNECT_PROD
    console.log('base', base)
    if (event.origin !== base) {
      return
    }
    console.log('event origin matches base... parsing')
    // Parse response data
    try {
      const data = JSON.parse(event.data)
      console.log('event data', data)
      if (!data.deviceID || !data.password) {
        throw new WalletError('Invalid credentials returned from Lattice.')
      }
      // Instantiate an SDK client with the returned credential data
      const defaultSigningUrl = GLOBAL_CONNECT_INFO.isTestnet ? GRIDPLUS_SIGNING_DEV : GRIDPLUS_SIGNING_PROD
      const privKeyPreImage = Buffer.concat([
        Buffer.from(data.password),
        Buffer.from(data.deviceID),
        Buffer.from(GLOBAL_CONNECT_INFO.appName)
      ])
      const clientOpts = {
        name: GLOBAL_CONNECT_INFO.appName,
        baseUrl: data.endpoint ? data.endpoint : defaultSigningUrl,
        crypto,
        timeout: 180000,
        privKey: createHash('sha256').update(privKeyPreImage).digest()
      }
      const sdkClient = new Client(clientOpts)
      console.log('returning new client')
      // Add the client to our app instance and return
      GLOBAL_CLIENT_DATA = {
        sdkClient,
        deviceID: data.deviceID
      }
    } catch (err) {
      throw new WalletError(err.toString())
    }
  }
}
