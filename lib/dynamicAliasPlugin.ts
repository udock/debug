'use strict'

import chalk from 'chalk'
import _ from 'lodash'
import webpack = require('webpack')

interface CallbackWrapper {
  (x: any): any
  stack: any
  missing: any
}

function createInnerCallback(callback: any, options?: any, message?: string, messageOptional?: any) {
	const log = options.log
	if(!log) {
		if(options.stack !== callback.stack) {
      const callbackWrapper = function callbackWrapper(this: any): any {
        return callback.apply(this, arguments)
      } as any as CallbackWrapper
      callbackWrapper.stack = options.stack
      callbackWrapper.missing = options.missing
			return callbackWrapper
		}
		return callback
	}

	function loggingCallbackWrapper(this: any) {
		if(message) {
			if(!messageOptional || theLog.length > 0) {
				log(message)
				for(let i = 0; i < theLog.length; i++)
					log("  " + theLog[i])
			}
		} else {
			for(let i = 0; i < theLog.length; i++)
				log(theLog[i])
		}
		return callback.apply(this, arguments)
  }

	const theLog: string[] = []
	loggingCallbackWrapper.log = function writeLog(msg: string) {
		theLog.push(msg)
	}
	loggingCallbackWrapper.stack = options.stack
	loggingCallbackWrapper.missing = options.missing
	return loggingCallbackWrapper
}

module.exports = function (options: any): webpack.ResolvePlugin {
  return {
    apply: doApply.bind(this, options)
  }
}

// 延时输出日志
let msgBuffer = ''
const logDelay = _.debounce(() => {
  console.log(msgBuffer)
  msgBuffer = ''
}, 1000)

function log (msg: string) {
  msgBuffer += `${msg}\n`
  logDelay()
}

function doApply (options: any, resolver: any) {
  resolver.plugin('described-resolve', (request: any, callback: any) => {
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
          return resolver.doResolve('resolve', obj, null, createInnerCallback(function (err: any, result: any) {
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
