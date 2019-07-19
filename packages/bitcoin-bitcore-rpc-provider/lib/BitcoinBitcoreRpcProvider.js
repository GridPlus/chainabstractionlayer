import BitcoinRpcProvider from '@liquality/bitcoin-rpc-provider'
import { base58 } from '@liquality/crypto'
import { addressToPubKeyHash } from '@liquality/bitcoin-utils'
import networks from '@liquality/bitcoin-networks'
import { Address, addressToString } from '@liquality/utils'

import { version } from '../package.json'

/**
 * BitcoinBitcoreRpcProvider overrides the BitcoinRpcProvider to use the address index
 * for retrieving address utxos
 */
export default class BitcoinBitcoreRpcProvider extends BitcoinRpcProvider {
  createScript (address) {
    address = addressToString(address)
    const type = base58.decode(address).toString('hex').substring(0, 2).toUpperCase()
    const pubKeyHash = addressToPubKeyHash(address)
    if (Object.values(networks).find(network => network.pubKeyHash === type)) {
      return [
        '76', // OP_DUP
        'a9', // OP_HASH160
        '14', // data size to be pushed
        pubKeyHash, // <PUB_KEY_HASH>
        '88', // OP_EQUALVERIFY
        'ac' // OP_CHECKSIG
      ].join('')
    } else if (Object.values(networks).find(network => network.scriptHash === type)) {
      return [
        'a9', // OP_HASH160
        '14', // data size to be pushed
        pubKeyHash, // <PUB_KEY_HASH>
        '87' // OP_EQUAL
      ].join('')
    } else {
      throw new Error('Not a valid address:', address)
    }
  }

  /* These methods need to be removed, but are required for now - END */
  async isAddressUsed (address) {
    address = addressToString(address)
    const data = await this.getAddressBalance(address)

    return data.received !== 0
  }

  async getNewAddress () {
    const newAddress = await this.jsonrpc('getnewaddress')

    if (!newAddress) return null

    return new Address(newAddress)
  }

  async getAddressBalances (addresses) {
    addresses = addresses.map(addressToString)
    return this.jsonrpc('getaddressdeltas', { 'addresses': addresses })
  }

  async getAddressBalance (address) {
    address = addressToString(address)
    return this.jsonrpc('getaddressbalance', { 'addresses': [address] })
  }

  async getUnspentTransactionsForAddresses (addresses) {
    addresses = addresses.map(addressToString)
    return this.jsonrpc('getaddressutxos', { 'addresses': addresses })
  }

  async getUnspentTransactions (address) {
    address = addressToString(address)
    return this.jsonrpc('getaddressutxos', { 'addresses': [address] })
  }

  async getAddressUtxos (addresses) {
    addresses = addresses.map(addressToString)
    return this.jsonrpc('getaddressutxos', { 'addresses': addresses })
  }

  async getAddressMempool (addresses) {
    addresses = addresses.map(addressToString)
    return this.jsonrpc('getaddressmempool', { 'addresses': addresses })
  }

  // async getAddressTransactions (address, start, end) {
  //   return this.jsonrpc('getaddresstxids', { 'addresses': [address], start, end })
  // }

  async getAddressDeltas (addresses) {
    addresses = addresses.map(addressToString)
    return this.jsonrpc('getaddressdeltas', { 'addresses': addresses })
  }
}

BitcoinBitcoreRpcProvider.version = version
