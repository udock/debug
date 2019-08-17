'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var lodash_1 = __importDefault(require("lodash"));
var path_1 = __importDefault(require("path"));
var module_1 = __importDefault(require("module"));
var projectNodeModulesPath = path_1.default.resolve(__dirname, '../..');
var alias = require('./lib/debug').alias;
var ModuleRef = module_1.default;
var originalResolveLookupPaths = ModuleRef._resolveLookupPaths;
ModuleRef._resolveLookupPaths = function (request, parent, newReturn) {
    var result = originalResolveLookupPaths(request, parent, newReturn);
    var paths = newReturn ? result : result[1];
    for (var key in alias) {
        var packageName = key;
        if (request === packageName || request.startsWith(packageName + '/')) {
            // 使用别称指定的路径
            paths.splice(0, paths.length, path_1.default.resolve(alias[packageName].path, '../..'));
            return result;
        }
    }
    var current = parent;
    var isLoadByAlias = '';
    while (current) {
        for (var key in alias) {
            var packageName = key;
            var packagePath = alias[packageName].path + path_1.default.sep;
            if (current.filename.startsWith(packagePath)) {
                isLoadByAlias = packageName;
                current = {};
                break;
            }
        }
        current = current.parent;
    }
    if (isLoadByAlias) {
        // 该模块是通过别称模块加载的
        var absoluteRequest = void 0;
        if (request.startsWith('.')) {
            // 将相对路径转换为绝对路径
            absoluteRequest = path_1.default.resolve(paths[0], request);
            if (absoluteRequest.startsWith(alias[isLoadByAlias].path + path_1.default.sep)) {
                request = absoluteRequest;
            }
        }
        var packageJson = require(alias[isLoadByAlias].path + "/package.json");
        var peerDeps = packageJson.peerDependencies || {};
        for (var key in peerDeps) {
            if (request === key || request.startsWith(alias[isLoadByAlias].path + "/node_modules/" + key + "/")) {
                // 是宿主项目依赖
                paths.splice(0, paths.length, projectNodeModulesPath);
                break;
            }
        }
    }
    return result;
};
module.exports = {
    attach: function (loader) {
        // 调试配置
        var debugPath = require.resolve('./lib/debug');
        delete require.cache[debugPath];
        var debug = require(debugPath);
        if (debug.__filepath) {
            loader.addDependency(debug.__filepath);
            return debug;
        }
    },
    setup: function (webpackConfig, pluginTasks) {
        var alias;
        var updateAlias = function () {
            alias = [];
            delete require.cache[require.resolve('./lib/debug')];
            var debug = require('./lib/debug');
            for (var item in debug.alias) {
                var aliasPath = debug.alias[item].path;
                alias.push(path_1.default.join(aliasPath, 'src'));
            }
        };
        updateAlias();
        pluginTasks.push(function (compiler) {
            compiler.plugin('compile', updateAlias);
        });
        var DynamicAliasPlugin = require('./lib/dynamicAliasPlugin');
        var eslintConfigFile = path_1.default.resolve('./.eslintrc.js');
        if ('toConfig' in webpackConfig) {
            // 关闭 resolve 缓存
            webpackConfig.resolve
                .unsafeCache(false)
                .modules // 配置 modules 查找顺序
                .add(projectNodeModulesPath)
                .add('./node_modules').end()
                .plugin('dynamic-alias-plugin')
                .use(DynamicAliasPlugin);
            process.nextTick(function () {
                webpackConfig.module.rule('eslint')
                    .use('eslint-loader')
                    .tap(function (options) {
                    // 明确指定 eslint 配置文件路径
                    // options = options || {}
                    options.configFile = eslintConfigFile;
                    return options;
                });
            });
        }
        else {
            (lodash_1.default.get(webpackConfig, 'module.rules') || []).forEach(function (rule) {
                if (rule.loader === 'eslint-loader') {
                    lodash_1.default.set(rule, 'options.configFile', eslintConfigFile);
                }
            });
            webpackConfig.resolve = webpackConfig.resolve || {};
            // 关闭 resolve 缓存
            webpackConfig.resolve.unsafeCache = false;
            // 配置 modules 查找顺序
            webpackConfig.resolve.modules = webpackConfig.resolve.modules || [];
            webpackConfig.resolve.modules.unshift('./node_modules');
            webpackConfig.resolve.modules.unshift(projectNodeModulesPath);
            // 注入 webpack 插件
            webpackConfig.resolve.plugins = webpackConfig.resolve.plugins || [];
            webpackConfig.resolve.plugins.unshift(new DynamicAliasPlugin());
        }
    }
};
