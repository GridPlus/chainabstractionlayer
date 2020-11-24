import NodeProvider from '@liquality/node-provider'
import Debug from '@liquality/debug'
import { NodeError } from '@liquality/errors'

import JSONBigInt from 'json-bigint'
import { has } from 'lodash'

import { version } from '../package.json'

const debug = Debug('jsonrpc')

const { parse } = JSONBigInt({ storeAsString: true, strict: true })

export default class JsonRpcProvider extends NodeProvider {
  constructor (uri, username, password) {
    const config = {
      baseURL: uri,
      responseType: 'text',
      transformResponse: undefined, // https://github.com/axios/axios/issues/907,
      validateStatus: status => true
    }

    if (username || password) {
      config.auth = { username, password }
    }

    super(config)
  }

  _prepareRequest (method, params) {
    const id = Date.now()
    const req = { id, method, params }

    debug('jsonrpc request', req)

    return req
  }

  _parseResponse (response) {
    let { data } = response

    debug('raw jsonrpc response', data)

    data = parse(data)

    debug('parsed jsonrpc response', data)

    const { error } = data

    if (error != null) {
      throw new NodeError(error.message || error, { response })
    }

    if (!has(data, 'result')) {
      throw new NodeError('Missing `result` on the RPC call result', { response })
    }

    return data.result
  }

  async jsonrpc (method, ...params) {
    const response = await this.nodePost('', this._prepareRequest(method, params))

    return this._parseResponse(response)
  }
}

JsonRpcProvider.version = version
