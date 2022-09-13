/*
 * API sub-router for courses collection endpoints.
 */

const { Router, raw } = require('express')

const { validateAgainstSchema, extractValidFields } = require('../lib/validation')
const { getDbReference } = require('../lib/mongo')
const { ObjectId } = require('mongodb')
const {
    CourseSchema,
    EnrollSchema,
    getCoursesPage,
    insertNewCourse,
    getCourseById,
    updateCourseById,
    deleteCourseById,
    enrollStudent,
    getCourseStudentIds,
    getRoster,
    getAssignments
} = require('../models/courses')
const fs = require('fs')
const json2csv = require('json2csv').parse
const { checkAdmin, checkInstructor } = require('../lib/auth')

const router = Router()

/*
 * Returns the list of all Courses. This list should be paginated.
 * The Courses returned should not contain the list of students in 
 * the Course or the list of Assignments for the Course.
 */
router.get('/', async function(req, res, next) {
    try {
        /*
         * Fetch page info, generate HATEOAS links for surrounding pages and then
         * send response.
         */
        const coursePage = await getCoursesPage(parseInt(req.query.page) || 1)
        coursePage.links = {}
        if (coursePage.page < coursePage.totalPages) {
            coursePage.links.nextPage = `/courses?page=${coursePage.page + 1}`
            coursePage.links.lastPage = `/courses?page=${coursePage.totalPages}`
        }
        if (coursePage.page > 1) {
            coursePage.links.prevPage = `/courses?page=${coursePage.page - 1}`
            coursePage.links.firstPage = '/courses?page=1'
        }
        res.status(200).send(coursePage)
    } catch (err) {
        console.error(err)
        res.status(500).send({
            error: "Error fetching courses list.  Please try again later."
        })
    }
})

/*
 * Creates a new Course with specified data and adds it to the 
 * application's database. Only an authenticated User with 'admin' 
 * role can create a new Course.
 */
router.post('/', checkAdmin, async function(req, res, next) {
    try {
        if (validateAgainstSchema(req.body, CourseSchema)) {
            if (req.admin) {
                const id = await insertNewCourse(req.body)
                res.status(201).send({ _id: id })
            } else
                res.status(403).send({ error: "Invalid Credentials" })
        } else {
            res.status(400).send({
                error: "Request body is not a valid course object."
            })
        }
    } catch (err) {
        console.error(err)
        res.status(500).send({
            error: "Error inserting course into DB.  Please try again later."
        })
    }
})

/*
 * Returns summary data about the course, excluding the list of 
 * students enrolled in the course and the list of Assignments for 
 * the course.
 */
router.get('/:id', async function(req, res, next) {
    try {
        const course = await getCourseById(req.params.id)
        if (course)
            res.status(200).send(course)
        else
            next()
    } catch (err) {
        console.error(err)
        res.status(500).send({
            error: "Unable to fetch course.  Please try again later."
        })
    }
})

/*
 * Performs a partial update on the data for the Course. Note that
 * enrolled students and assignments cannot be modified via this endpoint.
 * Only an authenticated User with 'admin' role or an authenticated
 * 'instructor' User whose ID matches the instructorId of the Course can
 * update Course information.
 */
router.patch('/:id', checkAdmin, checkInstructor, async function(req, res, next) {
    try {
        const updateFields = extractValidFields(req.body, CourseSchema)
        if (updateFields && !updateFields.enrolled) {
            const id = req.params.id
            const course = await getCourseById(id)
            if (req.admin || (req.instructor && req.instructorId == course.instructorId)) {
                if (course) {
                    const result = await updateCourseById(id, updateFields)
                    res.status(200).send()
                } else
                    next()
            } else
                res.status(403).send({ error: "Invalid Credentials" })
        } else
            res.status(400).send({
                error: "Request body is not a valid course object."
            })
    } catch (err) {
        console.error(err)
        res.status(500).send({
            error: "Unable to update course.  Please try again later."
        })
    }
})

/*
 * Completely removes the data for the specified Course, including all
 * enrolled students, all Assignments, etc. Only an authenticated User
 * with 'admin' role can remove a Course.*/
router.delete('/:id', checkAdmin, async function(req, res, next) {
    try {
        if (req.admin) {
            const course = await getCourseById(req.params.id)
            if (course) {
                const successful = await deleteCourseById(req.params.id)
                if (successful)
                    res.status(204).send()
                else
                    next()
            } else
                next()
        } else
            res.status(403).send({ error: "Invalid Credentials" })
    } catch (err) {
        console.error(err)
        res.status(500).send({
            error: "Error deleting course from DB.  Please try again later."
        })
    }
})

/*Returns a list containing the User IDs of all students 
currently enrolled in the Course. Only an authenticated 
User with 'admin' role or an authenticated 'instructor' 
User whose ID matches the instructorId of the Course 
can fetch the list of enrolled students.*/
router.get('/:id/students', checkAdmin, checkInstructor, async function(req, res, next) {
    try {
        if (req.admin || req.instructor) {
            const course = await getCourseById(req.params.id)
            if (course && (req.admin || req.instructorId == course.instructorId)) {
                const students = await getCourseStudentIds(req.params.id)
                if (students) {
                    res.status(200).send({
                        students: students
                    })
                } else {
                    next()
                }
            } else {
                next()
            }
        } else {
            res.status(403).send({ error: "Invalid Credentials" })
        }
    } catch (err) {
        console.error(err)
        res.status(500).send({
            error: "Error fetching list of students for this course"
        })
    }
})

/*Enrolls and/or unenrolls students from a Course. Only an 
authenticated User with 'admin' role or an authenticated 
'instructor' User whose ID matches the instructorId of the
Course can update the students enrolled in the Course.*/
router.post('/:id/students', checkAdmin, checkInstructor, async function(req, res, next) {
    if (validateAgainstSchema(req.body, EnrollSchema)) {
        try {

            const db = getDbReference()
            const usersCollection = db.collection('users')
            const userResults = await usersCollection.find({}).toArray()
            const addIds = userResults.map(x => x._id.toString())

            var containsAll = true;
            if (req.body.add.length != 0) {
                // if req.body.add contains ids that userRests does not have send 404
                containsAll = req.body.add.every(element => {

                    return addIds.includes(element);
                });
            }

            if (containsAll) {

                if (req.admin || req.instructor) {
                    const course = await getCourseById(req.params.id)
                    if (course && (req.admin || req.instructorId == course.instructorId)) {
                        const result = await enrollStudent(req.params.id, req.body.add, req.body.remove)
                        res.status(201).send({
                            result: result
                        })
                    } else {
                        next()
                    }
                } else {
                    res.status(403).send({ error: "Invalid Credentials" })
                }

            } else {
                res.status(404).send({
                    error: "Request body error"
                })
            }

        } catch (err) {
            console.error(err)
            res.status(500).send({
                error: "Error enrolling student for this course"
            })
        }
    } else {
        res.status(400).send({
            error: "Request body is not a valid student object."
        })
    }
})

/*Returns a CSV file containing information about all of the 
students currently enrolled in the Course, including names, 
IDs, and email addresses. Only an authenticated User with 
'admin' role or an authenticated 'instructor' User whose ID 
matches the instructorId of the Course can fetch the course 
roster.*/
router.get('/:id/roster', checkAdmin, checkInstructor, async function(req, res, next) {
    try {
        if (req.admin || req.instructor) {
            const course = await getCourseById(req.params.id)
            if (course && (req.admin || req.instructorId == course.instructorId)) {
                const students = await getCourseStudentIds(req.params.id)
                if (students) {
                    const studentRoster = await getRoster(students)
                    if (studentRoster) {
                        // https://stackoverflow.com/a/53291189
                        const csv = json2csv(studentRoster)
                        res.setHeader('Content-disposition', 'attachment; filename=roster.csv')
                        res.set('Content-Type', 'text/csv')
                        res.status(200).send(csv)
                    } else {
                        next()
                    }
                } else {
                    next()
                }
            } else {
                next()
            }
        } else {
            res.status(403).send({ error: "Invalid Credentials" })
        }
    } catch (err) {
        console.error(err)
        res.status(500).send({
            error: "Error fetching list of students for this course"
        })
    }
})

/*Returns a list containing the Assignment IDs of all 
Assignments for the Course.*/
router.get('/:id/assignments', async function(req, res, next) {
    try {
        const assignments = await getAssignments(req.params.id)
        if (assignments && assignments.length > 0) {
            res.status(200).send({ assignments: assignments })
        } else {
            next()
        }
    } catch (err) {
        console.error(err)
        res.status(500).send({
            error: "Error fetching list of assignments for this course"
        })
    }
})

module.exports = router