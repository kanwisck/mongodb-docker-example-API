/*
 * This file contains a simple script to populate the database with initial
 * data from the files in the data/ directory.  The following environment
 * variables must be set to run this script:
 *
 *   MONGO_DB_NAME - The name of the database into which to insert data.
 *   MONGO_USER - The user to use to connect to the MongoDB server.
 *   MONGO_PASSWORD - The password for the specified user.
 *   MONGO_AUTH_DB_NAME - The database where the credentials are stored for
 *     the specified user.
 *
 * In addition, you may set the following environment variables to create a
 * new user with permissions on the database specified in MONGO_DB_NAME:
 *
 *   MONGO_CREATE_USER - The name of the user to create.
 *   MONGO_CREATE_PASSWORD - The password for the user.
 */

const { connectToDb, getDbReference, closeDbConnection } = require('./lib/mongo')
const { bulkInsertNewUsers } = require('./models/users')
const { bulkInsertNewAssignments } = require('./models/assignments')
const { bulkInsertNewCourses } = require('./models/courses')

const { ObjectId } = require('mongodb')

const userData = require('./data/users.json')
const courseData = require('./data/courses.json')
const assignmentData = require('./data/assignments.json')

const mongoCreateUser = process.env.MONGO_CREATE_USER
const mongoCreatePassword = process.env.MONGO_CREATE_PASSWORD

connectToDb(async function() {
    /*
     * Insert initial business data into the database
     */
    const userids = await bulkInsertNewUsers(userData)
    console.log("== Inserted users with IDs:", userids)

    courseData[0].instructorId = new ObjectId(userids[1])
    courseData[0].enrolled.push(new ObjectId(userids[3]))
    courseData[0].enrolled.push(new ObjectId(userids[4]))

    courseData[1].instructorId = new ObjectId(userids[2])
    courseData[1].enrolled.push(new ObjectId(userids[3]))
    courseData[1].enrolled.push(new ObjectId(userids[4]))

    courseData[2].instructorId = new ObjectId(userids[1])
    courseData[2].enrolled.push(new ObjectId(userids[5]))

    const courseids = await bulkInsertNewCourses(courseData)
    console.log("== Inserted courses with IDs:", courseids)

    assignmentData[0].courseId = new ObjectId(courseids[0])

    const assignmentids = await bulkInsertNewAssignments(assignmentData)
    console.log("== Inserted assignments with IDs:", assignmentids)

    /*
     * Create a new, lower-privileged database user if the correct environment
     * variables were specified.
     */
    if (mongoCreateUser && mongoCreatePassword) {
        const db = getDbReference()
        const result = await db.addUser(mongoCreateUser, mongoCreatePassword, {
            roles: "readWrite"
        })
        console.log("== New user created:", result)
    }

    closeDbConnection(function() {
        console.log("== DB connection closed")
    })
})