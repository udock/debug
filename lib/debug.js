'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var lodash_1 = __importDefault(require("lodash"));
var path_1 = __importDefault(require("path"));
var config = {};
try {
    var configFilePath = require.resolve(path_1.default.resolve('debug.config'));
    delete require.cache[configFilePath];
    config = lodash_1.default.clone(require(configFilePath));
    config.__filepath = configFilePath;
    if (config.alias) {
        // 转换 alias 配置格式
        config.alias = lodash_1.default.mapValues(config.alias, function (item) {
            if (!lodash_1.default.isArray(item)) {
                item = [item];
            }
            var aliasPath = item[0];
            var mainPath = item[1] === true ? 'src/main' : item[1];
            return {
                path: aliasPath,
                main: mainPath ? "/" + mainPath.replace(/^\//, '') : undefined
            };
        });
    }
}
catch (e) { }
module.exports = config;
