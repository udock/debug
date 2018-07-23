'use strict'

const createInnerCallback = require('enhanced-resolve/lib/createInnerCallback')
const chalk = require('chalk')
const _ = require('lodash')

module.exports = function (options) {
  return {
    apply: doApply.bind(this, options)
  }
}

// 延时输出日志
const logDelay = _.debounce(function () {
  console.log(logDelay.msg)
  logDelay.msg = ''
}, 1000)

logDelay.msg = ''

function log (msg) {
  logDelay.msg += `${msg}\n`
  logDelay()
}

function doApply (options, resolver) {
  resolver.plugin('described-resolve', (request, callback) => {
    const innerRequest = request.request
    if (!innerRequest) return callback()
    const conf = require('./debug')
    conf.__logged = conf.__logged || {}
    for (let key in conf.alias) {
      let name = key
      let alias = conf.alias[key].path
      if (innerRequest === name || innerRequest.startsWith(name + '/')) {
        if (innerRequest !== alias && !innerRequest.startsWith(alias + '/')) {
          let newRequestStr = alias
          if (innerRequest === name && conf.alias[key].main) {
            newRequestStr += conf.alias[key].main
          } else {
            newRequestStr += innerRequest.substr(name.length)
          }
          const obj = Object.assign({}, request, {
            request: newRequestStr
          })
          if (!conf.__logged[name]) {
            const msg = `${chalk.yellow(name)} is in debug mode:\npath -> ${chalk.gray(conf.alias[key].path)}\nmain -> ${conf.alias[key].main ? chalk.green(conf.alias[key].main.replace(/^\//, '')) : chalk.gray('not set')}\n`
            conf.__logged[name] = true
            log(msg)
          }
          return resolver.doResolve('resolve', obj, null, createInnerCallback((err, result) => {
            if (arguments.length > 0) return callback(err, result)
            // don't allow other aliasing or raw request
            callback(null, null)
          }, callback))
        }
      }
    }
    return callback()
  })
}
