'use strict'

import _ from 'lodash'
import path from 'path'

let config: {__filepath?: string, alias?: any} = {}
try {
  const configFilePath = require.resolve(path.resolve('debug.config'))
  delete require.cache[configFilePath]
  config = _.clone(require(configFilePath))
  config.__filepath = configFilePath

  if (config.alias) {
    // 转换 alias 配置格式
    config.alias = _.mapValues(config.alias, (item) => {
      if (!_.isArray(item)) {
        item = [item]
      }
      const aliasPath = item[0]
      const mainPath = item[1] === true ? 'src/main' : item[1]
      return {
        path: aliasPath,
        main: mainPath ? `/${mainPath.replace(/^\//, '')}` : undefined
      }
    })
  }
} catch (e) {}

module.exports = config
