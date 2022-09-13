/*
 * Courses schema and data accessor methods
 */

const { ObjectId } = require('mongodb')

const { getDbReference } = require('../lib/mongo')
const { extractValidFields } = require('../lib/validation')
    /*
     * Schema describing required/optional fields of a users object.
     */
const CourseSchema = {
    subject: { required: true },
    number: { required: true },
    title: { required: true },
    term: { required: true },
    instructorId: { required: true },
    enrolled: { required: true }
}
exports.CourseSchema = CourseSchema

const EnrollSchema = {
    add: { required: true },
    remove: { required: true }
}
exports.EnrollSchema = EnrollSchema

async function bulkInsertNewCourses(courses) {
    const coursesToInsert = courses.map(function(course) {
        return extractValidFields(course, CourseSchema)
    })
    const db = getDbReference()
    const collection = db.collection('courses')
    const result = await collection.insertMany(coursesToInsert)
    return result.insertedIds
}
exports.bulkInsertNewCourses = bulkInsertNewCourses

/*
 * Executes a DB query to return a single page of courses. Returns a
 * Promise that resolves to an array containing the fetched page of courses.
 */
async function getCoursesPage(page) {
    const db = getDbReference()
    const collection = db.collection('courses')
    const count = await collection.countDocuments()

    /*
     * Compute last page number and make sure page is within allowed bounds.
     * Compute offset into collection.
     */
    const pageSize = 10
    const lastPage = Math.ceil(count / pageSize)
    page = page > lastPage ? lastPage : page
    page = page < 1 ? 1 : page
    const offset = (page - 1) * pageSize

    const results = await collection.find({})
        .sort({ _id: 1 })
        .skip(offset)
        .limit(pageSize)
        .project({ enrolled: false })
        .toArray()

    return {
        courses: results,
        page: page,
        totalPages: lastPage,
        pageSize: pageSize,
        count: count
    }
}
exports.getCoursesPage = getCoursesPage

/*
 * Executes a DB query to insert a new course into the database. Returns
 * a Promise that resolves to the ID of the newly-created course entry.
 */
async function insertNewCourse(course) {
    const db = getDbReference()
    const collection = db.collection('courses')

    course = extractValidFields(course, CourseSchema)
    const result = await collection.insertOne(course)
    return result.insertedId
}
exports.insertNewCourse = insertNewCourse

/*
 * Executes a DB query to fetch detailed information about a single
 * specified course based on its ID. Returns a Promise that resolves to an
 * object containing information about the requested course. If no course 
 * with the specified ID exists, the returned Promise will resolve to null.
 */
async function getCourseById(id) {
    const db = getDbReference()
    const collection = db.collection('courses')

    if (!ObjectId.isValid(id))
        return null
    else {
        const results = await collection.find({ _id: new ObjectId(id) })
            .project({ enrolled: false })
            .toArray()
        return results[0]
    }
}
exports.getCourseById = getCourseById

/** 
 * Executes a DB query on courses collection. Takes the desired
 * course to lookup as an argument. Returns a promise that resolves
 * into an array of enrolled students for the given course
 */
async function getCourseStudentIds(courseId) {
    const db = getDbReference()
    const collection = db.collection('courses')
    if (!ObjectId.isValid(courseId)) {
        return null
    } else {
        const results = await collection.aggregate([
            { $match: { _id: new ObjectId(courseId) } }
        ]).toArray()
        return results[0].enrolled
    }
}
exports.getCourseStudentIds = getCourseStudentIds

/**
 * Executes a DB query on courses collection. Must be passed both 
 * a courseId and userId. Returns a promise that resolves into 
 * the acknowledgement of a user being enrolled into the desired course
 */
async function enrollStudent(courseId, addArray, removeArray) {
    const db = getDbReference()
    const collection = db.collection('courses')
    const addIds = addArray.map(x => new ObjectId(x))
    const removeIds = removeArray.map(x => new ObjectId(x))
    const result = await collection.updateOne({ _id: new ObjectId(courseId) }, { $pull: { enrolled: { $in: removeIds } } })

    const result2 = await collection.updateOne({ _id: new ObjectId(courseId) }, { $push: { enrolled: { $each: addIds } } })

    // Ensure studentId is a real student in insomnia
    // Fake userIds will show up in get :id/students
    // but will not show up in :id/roster
    // This is because it queries the users collection with those ids
    // and that query filters out fake IDs
    return result
}
exports.enrollStudent = enrollStudent

/**
 * Executes a DB query on users collection. Must provide an array
 * of userIds as the argument. Returns promise that resolves
 * to an array of user objects for the userIds provided 
 * (excluding passwords)
 */
async function getRoster(studentIdArr) {
    // Convert studentIdArr strings into array of ObjectIds
    const idArray = studentIdArr.map(x => new ObjectId(x))
    const db = getDbReference()
    const collection = db.collection('users')
    const results = await collection.find({ _id: { $in: idArray } })
        .project({ password: false })
        .toArray()
    return results
}
exports.getRoster = getRoster

/*
 * Executes a db query on assignments collection. Returns promise
 * that resolves to an array of assignments matching the provided
 * course ID
 */
async function getAssignments(id) {
    const db = getDbReference()
    const collection = db.collection('assignments')
    const results = await collection.find({ courseId: id }).toArray()
    return results
}
exports.getAssignments = getAssignments

/*
 * Executes a DB query to perform a partial update on a single specified
 * course based on its ID. Returns a promise that resolves to the ID of 
 * the updated course.
 */
async function updateCourseById(id, course) {
    const db = getDbReference()
    const collection = db.collection('courses')

    course = extractValidFields(course, CourseSchema)
    const result = await collection.updateOne({ _id: new ObjectId(id) }, { $set: course }, { upsert: true })
    return result.upsertedId
}
exports.updateCourseById = updateCourseById

/*
 * Executes a DB query that deletes a single specified course based on 
 * its ID, including all of the course's assignments. Returns a promise
 * that resolves to a boolean showing the course was deleted.
 */
async function deleteCourseById(id) {
    const db = getDbReference()
    const collection = db.collection('courses')
    const assignments = db.collection('assignments')

    const deleted = await assignments.deleteMany({ courseId: new ObjectId(id) })

    const result = await collection.deleteOne({ _id: new ObjectId(id) })
    return result.deletedCount > 0
}
exports.deleteCourseById = deleteCourseById

async function getStudentCourses(studentId) {
    console.log("==id in getStudentCourses", studentId)
    const db = getDbReference()
    const collection = db.collection('courses')
    var output = []
    const calc = await collection.find({}).map(function(p) {
        console.log("==p.enrolled", p.enrolled)
        p.enrolled.forEach(element => {
            console.log("===element", element)
            console.log("===studentId", studentId)
            if (element === studentId) {
                console.log("match")
                output.push(p._id.toString())
            }
        })
        return output
    }).toArray()
    console.log("===calc", calc)
    console.log("===output", output)
    return output

}
exports.getStudentCourses = getStudentCourses