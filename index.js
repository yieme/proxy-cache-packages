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
var options               = {
  groupSeperator:   ',',
  domainSeperator:  ':',
  versionSeperator: '@',
  packageSeperator: '/',
  fileSeperator:    '+',
  dir:              './tmp',
  keymap:           { '.': ':' },
//  packageDataUrl:   'https://pub.firebaseio.com/cdn',
  packageDataUrl:   'cdnall_data.json',
}
var packages


function bootswatchFileHelper(path) {
  if (path.indexOf('.') < 0) {
    if (path.substr(path.length -1, 1) != '/') path += '/'
    path += 'bootstrap.min.css'
  }
  return path
}


function loadPackages(path, callback) {
  if (callback) {
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
  packages = loadPackages(options.packageDataUrl)
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

function isGt(a, b, depth) {
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


function isOk(a, b, depth) {
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


function getMainFile(pack, version) {
  pack = packages[pack]
  var packver = pack[version]
  if (_.isObject(packver) && packver.main) {
    return pack.mains[packver.main]
  } else {
    return pack.mains[0]
  }
}

function identifyVersionAndDomain(packageVersion) {
  var domain, name, version
  if (!packageVersion) return {}
  var part = packageVersion.split(options.versionSeperator)
  name = part[0].replace('/', '')
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
  var file = getMainFile(name, version)
  return { domain: domain, name: name, version: version, file: file }
}



function buildPackage(url) {
  var domainPos    = url.indexOf(options.domainSeperator)
  if (domainPos >= 0) return url
  var seperatorPos = url.indexOf(options.packageSeperator, 1) // skip early slash
  var pack
  if (seperatorPos < 0) {
    pack      = identifyVersionAndDomain(url)
    pack.file = getMainFile(pack.name, pack.version)
  } else {
    pack      = identifyVersionAndDomain(url.substr(0, seperatorPos))
    pack.file = url.substr(seperatorPos + 1, url.length - seperatorPos - 1)
  }
  if (!pack.name) return pack
  if (pack.domain =='bootstrap') pack.file = bootswatchFileHelper(pack.file)
  if (pack.name && pack.file) {
    var part = pack.file.split('/')
    var i = part.length - 1
    if (part[i][0] == '.') {
      part[i] = pack.name + part[i]
      pack.file = part.join('/')
    }
  }
  return pack
}



function proxyCachePackages(req, callback) {
  if (!callback) {
    req     = req || {}
    options = _.extend(options, req)
    proxyCacheMultiDomain(options)
    init()
    return proxyCachePackages
  }

  var packages = req.url
  if (!packages) callback(new Error('Missing Package(s)'))

  if ('string' == typeof packages) {
    packages = packages.split(options.groupSeperator)
  }
  if (options.logRequest) {
    var logger = (req.locals && req.locals._log) ? req.locals._log : console
    logger.info('proxyCachePackages:', packages)
  }
  var packageUrls = []
  for (var i=0, len=packages.length; i < len; i++) {
    var pack = buildPackage(packages[i])
    if (!pack)           return callback(new Error('Invalid Package: '         + packages[i]))
    if ('string' !== typeof pack) {
      if (!pack.name)    return callback(new Error('Invalid Package Name: '    + packages[i]))
      if (!pack.version) return callback(new Error('Invalid Package Version: ' + packages[i]))
      if (!pack.domain)  return callback(new Error('Invalid Package Domain: '  + packages[i]))
      var packurl = pack.domain + options.domainSeperator
      packurl += pack.name + options.versionSeperator + pack.version + options.packageSeperator
      if (pack.file) packurl += pack.file
    }
    packageUrls.push(packurl)
  }

  proxyCacheMultiDomain({url: packageUrls}, callback)
}



module.exports          = proxyCachePackages
module.exports.init     = init
