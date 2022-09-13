const { findUserByEmail, getUserById } = require('../models/users')
const jwt = require('jsonwebtoken')

const secret = "SuperSecret"

function generateAuthToken(userId) {
    const payload = { sub: userId }
    return jwt.sign(payload, secret, { expiresIn: '24h' })
}

exports.generateAuthToken = generateAuthToken

async function creationAdminCheck(req, res, next) {
    if (req.body.role === 'admin' || req.body.role === 'instructor') {
        const authHeader = req.get('authorization') || ''
        const authParts = authHeader.split(' ')
        const token = authParts[0] === 'Bearer' ? authParts[1] : null
        try {
            const payload = jwt.verify(token, secret)
            req.user = payload.sub
            const user = await getUserById(req.user)
            if (user.role === 'admin') {
                req.admin = true
            } else {
                req.admin = false
            }
            next()
        } catch (err) {
            res.status(401).send({
                err: "Invalid Auth Token"
            })
        }
    } else {
        next()
    }

}

exports.creationAdminCheck = creationAdminCheck

async function checkAdmin(req, res, next) {
    const authHeader = req.get('authorization') || ''
    const authParts = authHeader.split(' ')
    const token = authParts[0] === 'Bearer' ? authParts[1] : null
    try {
        const payload = jwt.verify(token, secret)
        req.user = payload.sub
        const user = await getUserById(req.user)
        if (user.role === 'admin')
            req.admin = true
        else
            req.admin = false
        next()
    } catch (err) {
        res.status(401).send({
            err: "Invalid Auth Token"
        })
    }
}

exports.checkAdmin = checkAdmin

async function checkInstructor(req, res, next) {
    const authHeader = req.get('authorization') || ''
    const authParts = authHeader.split(' ')
    const token = authParts[0] === 'Bearer' ? authParts[1] : null
    try {
        const payload = jwt.verify(token, secret)
        req.user = payload.sub
        const user = await getUserById(req.user)
        console.log(user)
        if (user.role === 'instructor') {
            req.instructor = true
            req.instructorId = user._id
        } else
            req.instructor = false
        next()
    } catch (err) {
        res.status(401).send({
            err: "Invalid Auth Token"
        })
    }
}

exports.checkInstructor = checkInstructor


async function checkStudent(req, res, next) {
    const authHeader = req.get('authorization') || ''
    const authParts = authHeader.split(' ')
    const token = authParts[0] === 'Bearer' ? authParts[1] : null
    try {
        const payload = jwt.verify(token, secret)
        req.user = payload.sub
        const user = await getUserById(req.user)
        console.log(user)
        if (user.role === 'student') {
            req.student = true
            req.studentId = user._id
        } else
            req.instructor = false
        next()
    } catch (err) {
        res.status(401).send({
            err: "Invalid Auth Token"
        })
    }
}

exports.checkStudent = checkStudent

async function verfiyUser(req, res, next) {
    const authHeader = req.get('authorization') || ''
    const authParts = authHeader.split(' ')
    const token = authParts[0] === 'Bearer' ? authParts[1] : null
    try {
        const payload = jwt.verify(token, secret)
        req.user = payload.sub
        const user = await getUserById(req.user)
        console.log(user)
        if (user._id.toString() === req.params.id.toString()) {
            next()
        } else {
            res.status(404).json({
                error: "Requested resource " + req.originalUrl + " does not exist"
              })
        }
    } catch (err) {
        res.status(401).send({
            err: "Invalid Auth Token"
        })
    }
}

exports.verfiyUser = verfiyUser