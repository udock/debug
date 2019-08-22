'use strict'
import _ from 'lodash'
import path from 'path'
import Module from 'module'
import Config from 'webpack-chain'
import webpack = require('webpack');

const projectNodeModulesPath = path.resolve(__dirname, '../..')
let alias = require('./lib/debug').alias
const ModuleRef = Module as any as { _resolveLookupPaths: any }
const originalResolveLookupPaths = ModuleRef._resolveLookupPaths

ModuleRef._resolveLookupPaths = function (request: string, parent: any, newReturn: string) {
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
  let isLoadByAlias = ''
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
  attach: (loader: webpack.loader.LoaderContext) => {
    // 调试配置
    const debugPath = require.resolve('./lib/debug')
    delete require.cache[debugPath]
    const debug = require(debugPath)
    if (debug.__filepath) {
      loader.addDependency(debug.__filepath)
      return debug
    }
  },
  setup: (webpackConfig: Config | webpack.Configuration, pluginTasks: any) => {
    let eslintExcludes: string[] = []

    const updateAlias = () => {
      eslintExcludes = []
      delete require.cache[require.resolve('./lib/debug')]
      alias = require('./lib/debug').alias
      for (var key in alias) {
        if (!alias[key].eslint) eslintExcludes.push(alias[key].path)
      }
    }

    updateAlias()

    pluginTasks.push((compiler: webpack.Compiler) => {
      compiler.plugin('compile', updateAlias)
    })

    const DynamicAliasPlugin = require('./lib/dynamicAliasPlugin')
    const eslintConfigFile = path.resolve('./.eslintrc.js')
    if ('toConfig' in webpackConfig) {
      // 关闭 resolve 缓存
      webpackConfig.resolve
        .unsafeCache(false)
        .modules// 配置 modules 查找顺序
        .add(projectNodeModulesPath)
        .add('./node_modules').end()
        .plugin('dynamic-alias-plugin')
        .use(DynamicAliasPlugin)

      webpackConfig.module.rule('eslint').exclude.add(path => {
        for (let item of eslintExcludes) {
          if (path.startsWith(item)) return true
        }
        return false
      })

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
      (_.get(webpackConfig, 'module.rules') || []).forEach(function (rule: webpack.Rule) {
        if (rule.loader === 'eslint-loader') {
          _.set(rule, 'options.configFile', eslintConfigFile)
        }
      })

      webpackConfig.resolve = webpackConfig.resolve || {}
      // 关闭 resolve 缓存
      webpackConfig.resolve.unsafeCache = false

      // 配置 modules 查找顺序
      webpackConfig.resolve.modules = webpackConfig.resolve.modules || []
      webpackConfig.resolve.modules.unshift('./node_modules')
      webpackConfig.resolve.modules.unshift(projectNodeModulesPath)

      // 注入 webpack 插件
      webpackConfig.resolve.plugins = webpackConfig.resolve.plugins || []
      webpackConfig.resolve.plugins.unshift(new DynamicAliasPlugin())
    }
  }
}
