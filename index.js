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
  groupSeperator:   ',',
  domainSeperator:  ':',
  versionSeperator: '@',
  packageSeperator: '/',
  fileSeperator:    '+',
  dir:              './tmp',
  keymap:           { '.': ':' },
  logger:           logger,
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
  if (!pack) return
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
  if (seperatorPos < 0 || seperatorPos == (url.length -1)) {
    pack      = identifyVersionAndDomain(url)
    pack.file = getMainFile(pack.name, pack.version)
    if (pack.file.indexOf('/') >= 0 && pack.file.indexOf('.js') < 0) pack.redirect = true
  } else {
    pack      = identifyVersionAndDomain(url.substr(0, seperatorPos))
    pack.file = url.substr(seperatorPos + 1, url.length - seperatorPos - 1)
    if (!pack.file || (pack.file.indexOf('.') < 0) && pack.name != 'bootswatch') pack.file = getMainFile(pack.name, pack.version)
  }
  if (!pack.name) return pack
  if (pack.domain == 'bootstrap') pack.file = bootswatchFileHelper(pack.file)
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
    if (!options.skipInit) init()
    return proxyCachePackages
  }

  var reqPackages = req.url
  if (!reqPackages) callback('Missing Package(s)')

  if ('string' == typeof reqPackages) {
    reqPackages = reqPackages.split(options.groupSeperator)
  }
  options.logger.debug('proxyCachePackages: ' + JSON.stringify(reqPackages))

  var packageUrls = []
  for (var i=0, len=reqPackages.length; i < len; i++) {
    var packRequest = reqPackages[i]
    var pack = buildPackage(packRequest)
    if (!pack)           return callback(new Error('Invalid Package: '   + packRequest))
    if ('string' !== typeof pack) {
      if (!pack.name)    return callback('Package Not Found: ' + packRequest)
      if (!pack.version) return callback('Version Not Found: ' + packRequest)
      if (!pack.domain)  return callback('Domain Not Found: '  + packRequest)
      var packurl = pack.domain + options.domainSeperator
      packurl += pack.name + options.versionSeperator + pack.version + options.packageSeperator
      if (pack.file) packurl += pack.file
      if (pack.redirect) return callback(null, { redirect: '../' + packurl.split(':')[1] })
    }
    packageUrls.push(packurl)
  }

  proxyCacheMultiDomain({url: packageUrls}, callback)
}



module.exports          = proxyCachePackages
module.exports.init     = init
