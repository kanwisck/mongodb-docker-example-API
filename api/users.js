/*
 * API sub-router for users collection endpoints.
 */

const { Router } = require('express')

const { validateAgainstSchema } = require('../lib/validation')
const {
    UsersSchema,
    insertNewUser,
    getAllUsers,
    getUserById
} = require('../models/users')

const { getStudentCourses } = require('../models/courses')

const { getDbReference } = require('../lib/mongo')
const bcrypt = require('bcryptjs')
const { generateAuthToken, creationAdminCheck, verfiyUser } = require('../lib/auth')

const router = Router()

router.get('/', async function (req, res, next) {
  const users = await getAllUsers()
  res.status(200).send(users)
})

/*
 * POST /businesses - Create and store a new application User 
                        with specified data and adds it to the 
                        application's database. Only an 
                        authenticated User with 'admin' role 
                        can create users with the 'admin' or 
                        'instructor' roles.
 */
router.post('/', creationAdminCheck, async function (req, res, next) {
    if (validateAgainstSchema(req.body, UsersSchema)) {
      if(req.admin || req.body.role === 'student'){
        try {
          const id = await insertNewUser(req.body)
          res.status(201).send({
            id: id
          })
        } catch (err) {
          console.error(err)
          res.status(500).send({
            error: "Error inserting users into DB.  Please try again later."
          })
        }
      }
    } else {
      res.status(400).send({
        error: "Request body is not a valid business object."
      })
    }
  })

/*Authenticate a specific User with their email address and password.*/
router.post('/login', async function(req, res) {
  if(req.body && req.body.email && req.body.password) {
    const db = getDbReference()
    const collection = db.collection('users')
    const results = await collection.aggregate([
      { $match: { email: req.body.email } }
    ]).toArray()
    if(results.length > 0){
      const user = results[0]
      const authenticated = user && await bcrypt.compare(req.body.password, user.password)
      if(authenticated){
        const token = generateAuthToken(user._id)
        res.status(200).send({ token: token })
      }
      else {
        res.status(401).send({
          error: "Invalid Credentials"
        })
      }
    } else{
      res.status(401).send({
        error: "Invalid Credentials"
      })
    }
  }
  else {
    res.status(400).send({
      error : "Request needs user email and password!"
  })
  }
})

/*Returns information about the specified User. If the User has 
the 'instructor' role, the response should include a list of the 
IDs of the Courses the User teaches (i.e. Courses whose instructorId 
field matches the ID of this User). If the User has the 'student' role, 
the response should include a list of the IDs of the Courses the User 
is enrolled in. Only an authenticated User whose ID matches the ID of 
the requested User can fetch this information.*/
router.get('/:id', verfiyUser, async function(req, res, next){
  const db = getDbReference()
  const collection = db.collection('courses')
  try {
    const user = await getUserById(req.params.id)
    if (user) {
        if (user.role === 'student') {
          console.log(user)
          user.courses = await getStudentCourses(user._id.toString())
        }
        if (user.role === 'instructor') {
        const results = await collection.find({ instructorId: user._id.toString()})
        .project({ _id: true })
        .toArray()
          console.log(user)
          user.courses = results
        }
        res.status(200).send(user)
    }
    else
        next()
  } catch (err) {
    console.error(err)
    res.status(500).send({
        error: "Unable to fetch user.  Please try again later."
    })
  }
})

module.exports = router