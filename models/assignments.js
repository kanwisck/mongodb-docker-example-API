/*
 * Assignments schema and data accessor methods
 */

const { ObjectId, GridFSBucket } = require('mongodb')

const { getDbReference } = require('../lib/mongo')
const { extractValidFields } = require('../lib/validation')

/*
 * Schema describing required/optional fields of a users object.
 */
const AssignmentSchema = {
    courseId: { required: true },
    title: { required: true },
    points: { required: true },
    due: { required: true }
}
exports.AssignmentSchema = AssignmentSchema

const gradeSchema = {
    grade: { required: true },
}
exports.gradeSchema = gradeSchema

async function bulkInsertNewAssignments(assignments) {
    const assignmentsToInsert = assignments.map(function(assignment) {
        return extractValidFields(assignment, AssignmentSchema)
    })
    const db = getDbReference()
    const collection = db.collection('assignments')
    const result = await collection.insertMany(assignmentsToInsert)
    return result.insertedIds
}
exports.bulkInsertNewAssignments = bulkInsertNewAssignments