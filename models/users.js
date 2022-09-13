/*
 * Users schema and data accessor methods
 */

const { ObjectId, GridFSBucket } = require('mongodb')

const { getDbReference } = require('../lib/mongo')
const { extractValidFields } = require('../lib/validation')
const bcrypt = require('bcryptjs')

/*
 * Schema describing required/optional fields of a users object.
 */
const UsersSchema = {
    name: { required: true },
    email: { required: true },
    password: { required: true },
    role: { required: true }
  }
  exports.UsersSchema = UsersSchema

async function getAllUsers(){
  const db = getDbReference()
  const collection = db.collection('users')
  const results = await collection.find({}).toArray()
    return {
        users : results
    }
}
exports.getAllUsers = getAllUsers

/*
 * Executes a DB query to insert a new user into the database.  Returns
 * a Promise that resolves to the ID of the newly-created user entry.
 */
async function insertNewUser(user) {
  userToInsert = extractValidFields(user, UsersSchema)
    userToInsert.password = await bcrypt.hash(userToInsert.password, 8)
    const db = getDbReference()
    const collection = db.collection('users')
    const result = await collection.insertOne(userToInsert)
    return result.insertedId
  }
  exports.insertNewUser = insertNewUser

async function findUserByEmail(email){
  const db = getDbReference()
    const collection = db.collection('users')
    const results = await collection.aggregate([
      { $match: { email: email } }
    ]).toArray()
    if(results.length > 0){
      return results[0]
    }
    else {
      return null
    }
}
exports.findUserByEmail = findUserByEmail

async function getUserById(id) {
  const db = getDbReference()
  const collection = db.collection('users')
  if (!ObjectId.isValid(id)) {
    return null
  } else {
    const results = await collection.aggregate([
      { $match: { _id: new ObjectId(id) } }
    ]).toArray()
    // console.log(results)
    return results[0]
  }
}
exports.getUserById = getUserById

async function bulkInsertNewUsers(users) {
  const usersToInsert = users.map(function (user) {
    return extractValidFields(user, UsersSchema)
  })
  usersToInsert.forEach(async function(element) {
    element.password = bcrypt.hashSync(element.password, 8)
  })
  const db = getDbReference()
  const collection = db.collection('users')
  const result = await collection.insertMany(usersToInsert)
  return result.insertedIds
}
exports.bulkInsertNewUsers = bulkInsertNewUsers