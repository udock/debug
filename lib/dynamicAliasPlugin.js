'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var chalk_1 = __importDefault(require("chalk"));
var lodash_1 = __importDefault(require("lodash"));
function createInnerCallback(callback, options, message, messageOptional) {
    var log = options.log;
    if (!log) {
        if (options.stack !== callback.stack) {
            var callbackWrapper = function callbackWrapper() {
                return callback.apply(this, arguments);
            };
            callbackWrapper.stack = options.stack;
            callbackWrapper.missing = options.missing;
            return callbackWrapper;
        }
        return callback;
    }
    function loggingCallbackWrapper() {
        if (message) {
            if (!messageOptional || theLog.length > 0) {
                log(message);
                for (var i = 0; i < theLog.length; i++)
                    log("  " + theLog[i]);
            }
        }
        else {
            for (var i = 0; i < theLog.length; i++)
                log(theLog[i]);
        }
        return callback.apply(this, arguments);
    }
    var theLog = [];
    loggingCallbackWrapper.log = function writeLog(msg) {
        theLog.push(msg);
    };
    loggingCallbackWrapper.stack = options.stack;
    loggingCallbackWrapper.missing = options.missing;
    return loggingCallbackWrapper;
}
module.exports = function (options) {
    return {
        apply: doApply.bind(this, options)
    };
};
// 延时输出日志
var msgBuffer = '';
var logDelay = lodash_1.default.debounce(function () {
    console.log(msgBuffer);
    msgBuffer = '';
}, 1000);
function log(msg) {
    msgBuffer += msg + "\n";
    logDelay();
}
function doApply(options, resolver) {
    resolver.plugin('described-resolve', function (request, callback) {
        var innerRequest = request.request;
        if (!innerRequest)
            return callback();
        var conf = require('./debug');
        conf.__logged = conf.__logged || {};
        for (var key in conf.alias) {
            var name_1 = key;
            var alias = conf.alias[key].path;
            if (innerRequest === name_1 || innerRequest.startsWith(name_1 + '/')) {
                if (innerRequest !== alias && !innerRequest.startsWith(alias + '/')) {
                    var newRequestStr = alias;
                    if (innerRequest === name_1 && conf.alias[key].main) {
                        newRequestStr += conf.alias[key].main;
                    }
                    else {
                        newRequestStr += innerRequest.substr(name_1.length);
                    }
                    var obj = Object.assign({}, request, {
                        request: newRequestStr
                    });
                    if (!conf.__logged[name_1]) {
                        var msg = chalk_1.default.yellow(name_1) + " is in debug mode:\npath -> " + chalk_1.default.gray(conf.alias[key].path) + "\nmain -> " + (conf.alias[key].main ? chalk_1.default.green(conf.alias[key].main.replace(/^\//, '')) : chalk_1.default.gray('not set')) + "\n";
                        conf.__logged[name_1] = true;
                        log(msg);
                    }
                    return resolver.doResolve('resolve', obj, null, createInnerCallback(function (err, result) {
                        if (arguments.length > 0)
                            return callback(err, result);
                        // don't allow other aliasing or raw request
                        callback(null, null);
                    }, callback));
                }
            }
        }
        return callback();
    });
}
