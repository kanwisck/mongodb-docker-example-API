const express = require('express')
const morgan = require('morgan')
const jwt = require('jsonwebtoken')

const api = require('./api')
const { connectToDb } = require('./lib/mongo')

const { getUserById } = require('./models/users')

const redis = require('redis')

const app = express()
const port = process.env.PORT || 8000

const redisHost = process.env.REDIS_HOST || 'redis'
const redisPort = process.env.REDIS_PORT || 6379
// console.log("==redisHost", redisHost)
const redisClient = redis.createClient({url: `redis://${redisHost}:${redisPort}`})

const rateLimitMaxRequestsIp = 10
const rateLimitMaxRequestsUser = 30
const rateLimitWindowMs = 60000

const secret = "SuperSecret"

/*
 * Morgan is a popular logger.
 */
app.use(morgan('dev'))

app.use(express.json())
app.use(express.static('public'))


async function rateLimit(req, res, next) {
  const authHeader = req.get('authorization') || ''
  const authParts = authHeader.split(' ')
  const token = authParts[0] === 'Bearer' ? authParts[1] : null
  try {
      const payload = jwt.verify(token, secret)
      req.user = payload.sub
      const user = await getUserById(req.user)
      // console.log("==user", user)
      // console.log('==ip', req.ip)
      rateLimitUser(req, res, next, user)
  }
  catch (err) {
    console.log("Invalid Auth Token")
    rateLimitIp(req, res, next)
  }
}

async function rateLimitIp(req, res, next) {
  const ip = req.ip

  let tokenBucket
  try {
    tokenBucket = await redisClient.hGetAll(ip)
  } catch (e) {
    next()
    return
  }
  console.log("== tokenBucket:", tokenBucket)
  tokenBucket = {
    tokens: parseFloat(tokenBucket.tokens) || rateLimitMaxRequestsIp,
    last: parseInt(tokenBucket.last) || Date.now()
  }
  console.log("== tokenBucket:", tokenBucket)

  const now = Date.now()
  const ellapsedMs = now - tokenBucket.last
  tokenBucket.tokens += ellapsedMs * (rateLimitMaxRequestsIp / rateLimitWindowMs)
  tokenBucket.tokens = Math.min(rateLimitMaxRequestsIp, tokenBucket.tokens)
  tokenBucket.last = now

  if (tokenBucket.tokens >= 1) {
    tokenBucket.tokens -= 1
    await redisClient.hSet(ip, [['tokens', tokenBucket.tokens], ['last', tokenBucket.last]])
    next()
  } else {
    await redisClient.hSet(ip, [['tokens', tokenBucket.tokens], ['last', tokenBucket.last]])
    res.status(429).send({
      err: "Too many requests per minute"
    })
  }
}

async function rateLimitUser(req, res, next, user) {
  let tokenBucket
  try {
    tokenBucket = await redisClient.hGetAll(user._id.toString())
  } catch (e) {
    console.log(e)
    next()
    return
  }
  console.log("== tokenBucket:", tokenBucket)
  tokenBucket = {
    tokens: parseFloat(tokenBucket.tokens) || rateLimitMaxRequestsUser,
    last: parseInt(tokenBucket.last) || Date.now()
  }
  console.log("== tokenBucket:", tokenBucket)

  const now = Date.now()
  const ellapsedMs = now - tokenBucket.last
  tokenBucket.tokens += ellapsedMs * (rateLimitMaxRequestsUser / rateLimitWindowMs)
  tokenBucket.tokens = Math.min(rateLimitMaxRequestsUser, tokenBucket.tokens)
  tokenBucket.last = now

  if (tokenBucket.tokens >= 1) {
    tokenBucket.tokens -= 1
    await redisClient.hSet(user._id.toString(), [['tokens', tokenBucket.tokens], ['last', tokenBucket.last]])
    next()
  } else {
    await redisClient.hSet(user._id.toString(), [['tokens', tokenBucket.tokens], ['last', tokenBucket.last]])
    res.status(429).send({
      err: "Too many requests per minute"
    })
  }
}

/*
 * All routes for the API are written in modules in the api/ directory.  The
 * top-level router lives in api/index.js.  That's what we include here, and
 * it provides all of the routes.
 */
app.use(rateLimit)

app.use('/', api)

app.use('*', function (req, res, next) {
    res.status(404).json({
      error: "Requested resource " + req.originalUrl + " does not exist"
    })
  })

/*
 * This route will catch any errors thrown from our API endpoints and return
 * a response with a 500 status to the client.
 */
app.use('*', function (err, req, res, next) {
    console.error("== Error:", err)
    res.status(500).send({
        error: "Server error.  Please try again later."
    })
  })
  
connectToDb(async function () {
  redisClient.connect().then(function () {
    app.listen(port, function () {
      console.log("== Server is running on port", port)
    })
  })
})

