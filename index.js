'use strict'
const path = require('path')
const Module = require('module')

function concat (target, data) {
  target.splice.apply(target, [target.length, 0].concat(data))
}

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
  setup: (config, pluginTasks) => {
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

    const isInAlias = (req) => {
      for (let item of alias) {
        if (req.startsWith(item)) {
          return true
        }
      }
      return false
    }

    // 关闭 resolve 缓存
    config.resolve.unsafeCache = false

    // 注入 webpack 插件
    config.resolve.plugins = config.resolve.plugins || []
    config.resolve.plugins.unshift(new (require('./lib/dynamicAliasPlugin'))())

    // 配置 modules 查找顺序
    config.resolve.modules = config.resolve.modules || ['./node_modules']
    config.resolve.modules.unshift(projectNodeModulesPath)

    const rules = config.module.rules

    rules.forEach(function (rule) {
      if (rule.loader === 'vue-loader') {
        rule.exclude = (rule.exclude || []).concat(isInAlias)
      }
    })
    const babelLoaderOptions = {
      babelrc: false,
      presets: [[require.resolve('babel-preset-env'), {modules: false}], require.resolve('babel-preset-stage-2')],
      plugins: [require.resolve('babel-plugin-transform-runtime')],
      comments: false
    }
    concat(rules, [
      {
        test: /\.js$/,
        loader: 'babel-loader',
        include: isInAlias,
        options: babelLoaderOptions
      },
      {
        test: /\.vue$/,
        loader: 'vue-loader',
        include: isInAlias,
        options: {
          loaders: {
            js: {
              loader: require.resolve('babel-loader'),
              options: babelLoaderOptions
            }
          }
        }
      }
    ])
  }
}
