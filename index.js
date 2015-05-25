/** Proxy Cache for Packages
 *
 *  @copyright  Copyright (C) 2015 by Yieme
 *  @module     proxy-cache-packages
 */

'use strict';
var _                     = require('lodash')
var fsurl                 = require('fsurl')
var fbkey                 = require('firebase-safekey')
var proxyCacheMultiDomain = require('proxy-cache-multi-domain')
var logger      = {
  info:  function(msg) { console.log('info:', msg) },
  debug: function(msg) { console.log('debug:', msg) },
  warn:  function(msg) { console.warn('warn:', msg) },
  error: function(msg) { console.error('error:', msg) },
  log:   console.log,
}
var options               = {
  mainfilesTail:    '?',
  groupSeperator:   ',',
  domainSeperator:  ':',
  versionSeperator: '@',
  packageSeperator: '/',
  fileSeperator:    '+',
  dir:              './tmp',
  keymap:           { '.': ':' },
  logger:           logger,
  packageDataUrl:   [ 'cdnall_data.json' ]
}
var packages, remappedPackages


function bootswatchFileHelper(path) {
  if (path.indexOf('.') < 0) {
    if (path.substr(path.length -1, 1) != '/') path += '/'
    path += 'bootstrap.min.css'
  }
  return path
}


function loadPackages(path, callback) {
  if (callback) {
    logger.debug('loadPackages: ' + path)
    fsurl(path, function fsurlLoad(err, data) {
      if (err) return callback(err)
      callback(null, fbkey.restore(data.packages))
    })
  } else {
    var data = fsurl.sync(path)
    return fbkey.restore(data.packages)
  }
}


function init() {
  fbkey.config(options.keymap)
  packages = { packages: {} }
  var list = (_.isArray(options.packageDataUrl)) ? options.packageDataUrl : [ options.packageDataUrl ]
  for (var i=0; i < list.length; i++) {
    var loadedPackages = loadPackages(list[i])
    packages = _.extend(packages, loadedPackages)
    if (packages.packages && !packages.packages.cdn) delete packages.packages
  }
  return packages
}


function compare(a, b) {
  var avalue, bvalue
  try {
    avalue = parseInt(a || '0')
    bvalue = parseInt(b || '0')
  } catch (e) {
    avalue = a
    bvalue = b
  }
  if (avalue == bvalue) return 0 // equal
  if (avalue >  bvalue) return 1 // greater than
  return -1 // less than
}

function isGt(a, b) {
  a = a.split('.')
  b = b.split('.')
  var test = compare(a[0], b[0])
  if (test > 0) return true
  if (test < 0) return false
  test = compare(a[1], b[1])
  if (test > 0) return true
  if (test < 0) return false
  test = compare(a[2], b[2])
  if (test > 0) return true
  return false
}


function isOk(a, b) {
  a = a.split('.')
  b = b.split('.')
  var test = compare(a[0], b[0])
  if (test != 0) return false
  if (a[1] == 'x' || a[1] == '*') return true
  test = compare(a[1], b[1])
  if (test != 0) return false
  if (a[2] == 'x' || a[2] == '*') return true
  test = compare(a[2], b[2])
  return (test == 0)
}


function findBestVersion(getversion, versions) {
  var best = false
  var first = getversion.substr(0,1)
  if (getversion.indexOf('.x') < 0 && getversion.indexOf('.*') < 0) getversion += '.x'
  _.forIn(versions, function(value, key) {
    first = key.substr(0,1)
    if (first >= '0' && first <= '9' && isOk(getversion, key) && (!best || isGt(key, best))) best = key
  })
  return best
}


function firstCdn(packver) {
  for (var i in packver) {
    return i
  }
  return null
}


function getPackageVersionFiles(packname, version) {
  var pack = packages[packname]
  if (!pack) return
  var packver = pack[version]
  var cdn     = firstCdn(packver)
  if (_.isObject(cdn) && cdn.file) return pack.files[cdn.file]
  return pack.files[cdn]
}

function getPackageVersionFiles(packname, version) {
  var pack = packages[packname]
  logger.debug('proxyCachePackages.getPackageVersionFiles.name: ' + packname)
  if (!pack) return
  logger.debug('proxyCachePackages.getPackageVersionFiles.version: ' + version)
  var packver = pack[version]
  logger.debug('proxyCachePackages.getPackageVersionFiles.packver: ' + JSON.stringify(packver))
  var cdn     = firstCdn(packver)
  logger.debug('proxyCachePackages.getPackageVersionFiles.cdn: ' + cdn)
  var main    = packver[cdn]
  logger.debug('proxyCachePackages.getPackageVersionFiles.getPackageVersionFiles: ' + JSON.stringify(main)) // TODO: HERE!
  if (_.isObject(main) && main.file) return pack.files[main.file]
  logger.debug('proxyCachePackages.getPackageVersionFiles.files[0]: ' + pack.files[0])
  return pack.files[0]
}



function getMainFile(packname, version) {
  var pack = packages[packname]
  logger.debug('proxyCachePackages.getMainFile.name: ' + packname)
  if (!pack) return
  logger.debug('proxyCachePackages.getMainFile.version: ' + version)
  var packver = pack[version]
  logger.debug('proxyCachePackages.getMainFile.packver: ' + JSON.stringify(packver))
  var cdn     = firstCdn(packver)
  logger.debug('proxyCachePackages.getMainFile.cdn: ' + cdn)
  var main    = packver[cdn]
  logger.debug('proxyCachePackages.getMainFile.main: ' + JSON.stringify(main))
  if (_.isObject(main) && main.main) return pack.mains[main.main]
  logger.debug('proxyCachePackages.getMainFile.mains[0]: ' + pack.mains[0])
  return pack.mains[0]
}


function identifyVersionAndDomain(packageVersion) {
  var domain, name, version
  if (!packageVersion) return {}
  var part = packageVersion.split(options.versionSeperator)
  name = part[0].replace('/', '') // remove leading slash /
  if (!name) return {}
  var pack = packages[name]
  if (!pack) return {}
  if (part[1]) { // version supplied
    version = part[1]
    if (!pack[version]) { // not exact match therefore find nearest version
      version = findBestVersion(version, pack)
      if (!version) return { name: name }
    }
  } else {
    version = pack.latest
  }

  domain   = _.keys(pack[version])[0] // first CDN
//  var file = getMainFile(name, version)
  return { domain: domain, name: name, version: version }
}



function buildPackage(url) {
  var domainPos    = url.indexOf(options.domainSeperator)
  if (domainPos >= 0) return url
  var seperatorPos = url.indexOf(options.packageSeperator, 1) // skip early slash
  var pack
  if (seperatorPos < 0 || seperatorPos == (url.length -1)) { // is there a seperator between package and file(s)
    pack      = identifyVersionAndDomain(url)
    if (!pack.name) return pack
    pack.file = getMainFile(pack.name, pack.version)
    if (pack.file.indexOf('/') >= 0 && pack.file.indexOf('.js') < 0) pack.redirect = true
  } else {
    pack          = identifyVersionAndDomain(url.substr(0, seperatorPos))
//    pack.origFile = url.substr(seperatorPos + 1, url.length - seperatorPos)
    if (!pack.name) return pack
    pack.file = url.substr(seperatorPos + 1, url.length - seperatorPos - 1)
    if (!pack.file || (pack.file.indexOf('.') < 0) && pack.name != 'bootswatch') pack.file = getMainFile(pack.name, pack.version)
  }
  if (!pack.name) return pack
  if (pack.domain == 'bootstrap') pack.file = bootswatchFileHelper(pack.file)
  if (pack.name && pack.file) {
    var part    = pack.file.split('/')
    var i       = part.length - 1
    if (part[i][0] == '.') {
      part[i]   = pack.name + part[i]
      pack.file = part.join('/')
    }
  }
  return pack
}


function isFileInPackage(file, packname, version) {
  options.logger.debug('proxyCachePackages.isFileInPackage: ' + file + ' in ' + packname + '@' + version)
  var files  = ',' + getPackageVersionFiles(packname, version) + ','
  var search = ',' + file + ','
  file = file.split('?')[0]
  var search2 = ',' + file + ','
  return (files.indexOf(search) >= 0 || files.indexOf(search2) >= 0)
}

function packToUrl(pack) {
  var packurl = pack.domain + options.domainSeperator
  packurl    += pack.name + options.versionSeperator + pack.version + options.packageSeperator
  if (pack.file) packurl += pack.file
  return packurl
}


function proxyCachePackages(req, callback) {
  function callbackError(param) {
    param.in  = (param.in) ? 'proxyCachePackages' + '.' + param.in : 'proxyCachePackages'
    param.url = req.url
    logger.warn(JSON.stringify(param))
    return callback(null, { headers: { code: 404 }, body: '{ "error": "Not Found" }' })
  }

  if (!callback) {
    req     = req || {}
    options = _.extend(options, req)
    proxyCacheMultiDomain(options)
    if (!options.skipInit) init()
    return proxyCachePackages
  }

  var reqPackages = req.url
  var reqend = reqPackages.length - 1
  var forceMainsRequest = (reqPackages.substr(reqend, 1) == options.mainfilesTail)
  if (forceMainsRequest) {
    reqPackages = reqPackages.substr(0, reqend)
  }

  if (!reqPackages) return callbackError({ err: 'Missing Package(s)' })

  if ('string' == typeof reqPackages) {
    reqPackages = reqPackages.split(options.groupSeperator)
  }
  options.logger.debug('proxyCachePackages: ' + JSON.stringify(reqPackages))

  var packs = []
  for (var i=0, len=reqPackages.length; i < len; i++) {
    var packRequest = reqPackages[i]
    var pack = buildPackage(packRequest)
    if (!pack)           return callbackError({ err: 'Invalid Package', pack: packRequest })
    if ('string' !== typeof pack) {
      if (!pack.name)    return callbackError({ err: 'Package Not Found', pack: packRequest })
      if (!pack.version) return callbackError({ err: 'Version Not Found', pack: packRequest })
      if (!pack.domain)  return callbackError({ err: 'Domain Not Found', pack: packRequest })
      if (pack.redirect) {
        var url = packToUrl(pack)
        return callback(null, { redirect: '../' + url.split(':')[1] + options.mainfilesTail })
      }
    }
    packs.push(pack)
  }

  var packageUrls = []
  var len = packs.length
  for (var i=0; i < len; i++) packageUrls.push(packToUrl(packs[i]))

  if (len > 1 && !forceMainsRequest) { // multiple packages and not a main bundle force
    var file = pack[len-1].file
    var names = []
    for (i = len-1; i >= 0; i--) {
      pack = packs[i] // last package file
      if (!isFileInPackage(file, pack.name, pack.version)) { // if the file isn't one for the last package
        packageUrls = [ packToUrl(pack) ] // only load this file
        i = -1 // done
      }
      names.push(pack.name + '@' + pack.version)
    }
    return callbackError({ err: 'File Not Found', file: file, in: names })
  } else {
    for (var i=0; i < len; i++) {
      pack = packs[i]
      if (!isFileInPackage(pack.file, pack.name, pack.version)) { // if the file isn't one for the last package
        return callbackError({ err: 'File Not Found', file: file, in: pack.name + '@' + pack.version })
      }
    }
  }



  proxyCacheMultiDomain({url: packageUrls}, callback)
}



module.exports          = proxyCachePackages
module.exports.init     = init
