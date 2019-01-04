'use strict'
const _ = require('lodash')
const path = require('path')
const Module = require('module')

const projectNodeModulesPath = path.resolve(__dirname, '../..')
const alias = require('./lib/debug').alias
const originalResolveLookupPaths = Module._resolveLookupPaths
Module._resolveLookupPaths = function (request, parent, newReturn) {
  const result = originalResolveLookupPaths(request, parent, newReturn)
  const paths = newReturn ? result : result[1]
  for (const key in alias) {
    const packageName = key
    if (request === packageName || request.startsWith(packageName + '/')) {
      // 使用别称指定的路径
      paths.splice(0, paths.length, path.resolve(alias[packageName].path, '../..'))
      return result
    }
  }

  let current = parent
  let isLoadByAlias = false
  while (current) {
    for (const key in alias) {
      const packageName = key
      const packagePath = alias[packageName].path + path.sep
      if (current.filename.startsWith(packagePath)) {
        isLoadByAlias = packageName
        current = {}
        break
      }
    }
    current = current.parent
  }
  if (isLoadByAlias) {
    // 该模块是通过别称模块加载的
    let absoluteRequest
    if (request.startsWith('.')) {
      // 将相对路径转换为绝对路径
      absoluteRequest = path.resolve(paths[0], request)
      if (absoluteRequest.startsWith(alias[isLoadByAlias].path + path.sep)) {
        request = absoluteRequest
      }
    }
    const packageJson = require(`${alias[isLoadByAlias].path}/package.json`)
    const peerDeps = packageJson.peerDependencies || {}
    for (let key in peerDeps) {
      if (request === key || request.startsWith(`${alias[isLoadByAlias].path}/node_modules/${key}/`)) {
        // 是宿主项目依赖
        paths.splice(0, paths.length, projectNodeModulesPath)
        break
      }
    }
  }
  return result
}

module.exports = {
  attach: (loader) => {
    // 调试配置
    const debugPath = require.resolve('./lib/debug')
    delete require.cache[debugPath]
    const debug = require(debugPath)
    if (debug.__filepath) {
      loader.addDependency(debug.__filepath)
      return debug
    }
  },
  setup: (webpackConfig, pluginTasks) => {
    let alias

    const updateAlias = () => {
      alias = []
      delete require.cache[require.resolve('./lib/debug')]
      const debug = require('./lib/debug')
      for (let item in debug.alias) {
        const aliasPath = debug.alias[item].path
        alias.push(path.join(aliasPath, 'src'))
      }
    }

    updateAlias()

    pluginTasks.push((compiler) => {
      compiler.plugin('compile', updateAlias)
    })

    const DynamicAliasPlugin = require.resolve('./lib/dynamicAliasPlugin')
    const eslintConfigFile = path.resolve('./.eslintrc.js')
    if (_.isFunction(_.get(webpackConfig, 'toConfig'))) {
      // 关闭 resolve 缓存
      webpackConfig.resolve
        .unsafeCache(false)
        .modules// 配置 modules 查找顺序
        .add(projectNodeModulesPath)
        .add('./node_modules').end()
        .plugin('dynamic-alias-plugin')
        .use(DynamicAliasPlugin)

      process.nextTick(() => {
        webpackConfig.module.rule('eslint')
          .use('eslint-loader')
          .tap(options => {
            // 明确指定 eslint 配置文件路径
            // options = options || {}
            options.configFile = eslintConfigFile
            return options
          })
      })
    } else {
      (_.get(webpackConfig, 'module.rules') || []).forEach(function (rule) {
        if (rule.loader === 'eslint-loader') {
          _.set(rule, 'options.configFile', eslintConfigFile)
        }
      })

      // 关闭 resolve 缓存
      webpackConfig.resolve.unsafeCache = false

      // 配置 modules 查找顺序
      webpackConfig.resolve.modules = webpackConfig.resolve.modules || []
      webpackConfig.resolve.modules.unshift('./node_modules')
      webpackConfig.resolve.modules.unshift(projectNodeModulesPath)

      // 注入 webpack 插件
      webpackConfig.resolve.plugins = webpackConfig.resolve.plugins || []
      webpackConfig.resolve.plugins.unshift(new (require(DynamicAliasPlugin))())
    }
  }
}
