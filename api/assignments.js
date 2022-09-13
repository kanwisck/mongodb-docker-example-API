/*
 * API sub-router for assignments collection endpoints.
 */

const { Router } = require('express')

const { ObjectId, GridFSBucket } = require('mongodb')

const multer = require('multer')
const crypto = require('crypto')
const fs = require('fs')
const { validateAgainstSchema, extractValidFields } = require('../lib/validation')

const { checkAdmin, checkInstructor, checkStudent } = require('../lib/auth')

const { getDbReference } = require('../lib/mongo')
const {
    AssignmentSchema,
    gradeSchema
} = require('../models/assignments')

const router = Router()

/*Create and store a new Assignment with specified data 
and adds it to the application's database. Only an 
authenticated User with 'admin' role or an authenticated 
'instructor' User whose ID matches the instructorId of the 
Course corresponding to the Assignment's courseId can 
create an Assignment.*/
router.post('/', checkAdmin, checkInstructor, async function(req, res, next) {

    try {

        const db = getDbReference()

        //get instructorid from course
        const collection = db.collection('courses')
        const courseResults = await collection.find({ _id: new ObjectId(req.body.courseId) }).toArray()

        //check courseResults, authentication, validate data, then procede
        if (courseResults.length > 0) {
            if (((req.instructorId == courseResults[0].instructorId) || req.admin)) {
                if (validateAgainstSchema(req.body, AssignmentSchema)) {

                    const collection = db.collection('assignments')
                    assignment = extractValidFields(req.body, AssignmentSchema)

                    const result = await collection.insertOne(assignment)
                    res.status(201).send({ _id: result.insertedId })

                } else {
                    res.status(400).send({
                        error: "Invalid Body"
                    })
                }
            } else {
                res.status(401).send({
                    error: "Invalid Credentials"
                })
            }
        } else {
            res.status(400).send({
                error: "Invalid CourseID"
            })
        }
    } catch (err) {
        console.error(err)
        res.status(500).send({
            error: "Unable to post assignment. Please try again later."
        })
    }

})

/*Returns summary data about the Assignment, excluding 
the list of Submissions.*/
router.get('/:id', async function(req, res, next) {

    const id = req.params.id
    const db = getDbReference()
    const collection = db.collection('assignments')

    try {
        if (!ObjectId.isValid(id)) {
            next()
        } else {
            const results = await collection.find({ _id: new ObjectId(id) }).toArray()
            if (results.length > 0) {
                res.status(200).send(results[0])
            } else {
                res.status(400).send({
                    error: "Invalid Assignment ID"
                })
            }
        }

    } catch (err) {
        console.error(err)
        res.status(500).send({
            error: "Unable to fetch assignment.  Please try again later."
        })
    }

})

/*Performs a partial update on the data for the Assignment. 
Note that submissions cannot be modified via this endpoint. 
Only an authenticated User with 'admin' role or an 
authenticated 'instructor' User whose ID matches the 
instructorId of the Course corresponding to the 
Assignment's courseId can update an Assignment.*/
router.patch('/:id', checkAdmin, checkInstructor, async function(req, res, next) {
    try {
        const id = req.params.id
        const db = getDbReference()
        if (!ObjectId.isValid(id)) {
            next()
        } else {
            //get courseid from assignment
            const collection = db.collection('assignments')
            const assignmentResults = await collection.find({ _id: new ObjectId(id) }).toArray()
            if (assignmentResults.length > 0) {
                //get instructorid from course
                const collection2 = db.collection('courses')
                const courseResults = await collection2.find({ _id: new ObjectId(assignmentResults[0].courseId) }).toArray()
                if (courseResults.length > 0) {
                    //check authentication then procede
                    if (((req.instructorId == courseResults[0].instructorId) || req.admin)) {
                        const updateFields = extractValidFields(req.body, AssignmentSchema)
                        if (updateFields.courseId || updateFields.title || updateFields.points || updateFields.due) {
                            const collection = db.collection('assignments')
                            const result = await collection.update({ _id: ObjectId(id) }, { $set: req.body })
                            res.status(200).send({ result })
                        } else {
                            res.status(400).send({
                                error: "Invalid Body"
                            })
                        }
                    } else {
                        res.status(401).send({
                            error: "Invalid Credentials"
                        })
                    }
                } else {
                    next()
                }
            } else {
                next()
            }
        }
    } catch (err) {
        console.error(err)
        res.status(500).send({
            error: "Unable to update assignment. Please try again later."
        })
    }
})

/*Completely removes the data for the specified Assignment, 
including all submissions. Only an authenticated User with 
'admin' role or an authenticated 'instructor' User whose ID 
matches the instructorId of the Course corresponding to the 
Assignment's courseId can delete an Assignment.*/
router.delete('/:id', checkAdmin, checkInstructor, async function(req, res, next) {

    try {
        const assignmentId = req.params.id
        const db = getDbReference()

        //get courseid from assignment
        const assignmentCollection = db.collection('assignments')
        const assignmentResults = await assignmentCollection.find({ _id: new ObjectId(assignmentId) }).toArray()

        if (assignmentResults.length != 0) {

            //get instructorid from course
            const collection2 = db.collection('courses')
            const courseResults = await collection2.find({ _id: new ObjectId(assignmentResults[0].courseId) }).toArray()

            //check authentication then procede
            if (((req.instructorId == courseResults[0].instructorId) || req.admin)) {

                const result = await assignmentCollection.deleteOne({ _id: ObjectId(assignmentId) })

                const submissionCollection = db.collection('submissions')
                const result2 = await submissionCollection.deleteMany({ "metadata.assignmentId": assignmentId })
                res.status(204).end();

            } else {
                res.status(403).send({
                    error: "Invalid Credentials."
                })
            }

        } else {
            res.status(404).send({
                error: "Specified assignment could not be found."
            })
        }

    } catch (err) {
        console.error(err)
        res.status(500).send({
            error: "Unable to delete assignment. Please try again later."
        })
    }

})

//Helper functions start
const fileTypes = {
    'application/pdf': 'pdf'
}

const upload = multer({
    storage: multer.diskStorage({
        destination: `${__dirname}/uploads`,
        filename: function(req, file, callback) {
            const ext = fileTypes[file.mimetype]
            const filename = crypto.pseudoRandomBytes(16).toString('hex')
            callback(null, `${filename}.${ext}`)
        }
    }),
    fileFilter: function(req, file, callback) {
        callback(null, !!fileTypes[file.mimetype])
    }
})

function getFileDownloadStream(filename) {
    const db = getDbReference()
    const bucket = new GridFSBucket(db, { bucketName: 'submissions' })
    return bucket.openDownloadStreamByName(filename)
}

function saveFile(file) {
    return new Promise(function(resolve, reject) {
        const db = getDbReference()
        const bucket = new GridFSBucket(db, { bucketName: 'submissions' })

        const metadata = {
            assignmentId: file.assignmentId,
            studentId: file.studentId,
            timestamp: file.timestamp,
            grade: null,
            mimetype: file.mimetype,
            url: `/submissions/file/${file.filename}`,
        }
        const uploadStream = bucket.openUploadStream(file.filename, {
            metadata: metadata
        })
        fs.createReadStream(file.path).pipe(uploadStream)
            .on('error', function(err) {
                reject(err)
            })
            .on('finish', function(result) {
                console.log("== stream result:", result)
                resolve(result._id)
            })
    })
}

router.get('/submissions/file/:filename', function(req, res, next) {
    getFileDownloadStream(req.params.filename)
        .on('file', function(file) {
            res.status(200).type(file.metadata.mimetype)
        })
        .on('error', function(err) {
            if (err.code === 'ENOENT') {
                next()
            } else {
                next(err)
            }
        })
        .pipe(res)
})

async function getSubmissionPage(page, id) {
    const db = getDbReference()
    const bucket = new GridFSBucket(db, { bucketName: 'submissions' })
    const lengthResults = await bucket.find({ "metadata.assignmentId": id }).toArray()
    const count = lengthResults.length

    /*
     * Compute last page number and make sure page is within allowed bounds.
     * Compute offset into collection.
     */
    const pageSize = 2
    const lastPage = Math.ceil(count / pageSize)
    page = page > lastPage ? lastPage : page
    page = page < 1 ? 1 : page
    const offset = (page - 1) * pageSize

    const results = await bucket.find({ "metadata.assignmentId": id })
        .sort({ _id: 1 })
        .skip(offset)
        .limit(pageSize)
        .toArray()

    return {
        submissions: results,
        page: page,
        totalPages: lastPage,
        pageSize: pageSize,
        count: count
    }
}
//Helper funcitons end

/*Returns the list of all Submissions for an Assignment. 
This list should be paginated. Only an authenticated User 
with 'admin' role or an authenticated 'instructor' User whose 
ID matches the instructorId of the Course corresponding to 
the Assignment's courseId can fetch the Submissions for an 
Assignment.*/
router.get('/:assignmentId/submission', checkAdmin, checkInstructor, async function(req, res, next) {

    try {

        const assignmentId = req.params.assignmentId
        const db = getDbReference()

        const collection = db.collection('assignments')
        const assignmentResults = await collection.find({ _id: new ObjectId(assignmentId) }).toArray()

        if (assignmentResults.length != 0) {

            //get instructorid from course
            const collection2 = db.collection('courses')
            const courseResults = await collection2.find({ _id: new ObjectId(assignmentResults[0].courseId) }).toArray()

            if ((req.instructorId == courseResults[0].instructorId) || req.admin) {

                const submissionPage = await getSubmissionPage(parseInt(req.query.page) || 1, assignmentId)
                submissionPage.links = {}
                if (submissionPage.page < submissionPage.totalPages) {
                    submissionPage.links.nextPage = `/${assignmentId}/submission?page=${submissionPage.page + 1}`
                    submissionPage.links.lastPage = `/${assignmentId}/submission?page=${submissionPage.totalPages}`
                }
                if (submissionPage.page > 1) {
                    submissionPage.links.prevPage = `/${assignmentId}/submission?page=${submissionPage.page - 1}`
                    submissionPage.links.firstPage = `/${assignmentId}/submission?page=1`
                }
                res.status(200).send(submissionPage)
            } else {
                res.status(403).send({
                    error: "Invalid credentials."
                })
            }
        } else {

            res.status(404).send({
                error: "Specified assignment could not be found."
            })
        }

    } catch (err) {
        console.error(err)
        res.status(500).send({
            error: "Unable to get submissions. Please try again later."
        })
    }

})


/*Create and store a new Assignment Submission with specified data and 
adds it to the application's database. Only an authenticated 
User with 'student' role who is enrolled in the Course 
corresponding to the Assignment's courseId can create a 
Submission.*/
router.post('/:id/submission', checkStudent, upload.single('file'), async function(req, res, next) {

    console.log("== req.file:", req.file)
    console.log("== req.body:", req.body)

    try {
        const id = req.params.id
        const db = getDbReference()

        if (req.file) {

            //get courseid from assignment
            const collection = db.collection('assignments')
            const assignmentResults = await collection.find({ _id: new ObjectId(id) }).toArray()

            if (assignmentResults.length != 0) {

                //get enrolled students from course
                const collection2 = db.collection('courses')
                const courseResults = await collection2.find({ _id: new ObjectId(assignmentResults[0].courseId) }).toArray()

                let enrolledFlag = false;

                //check if student is enrolled in the specified class
                courseResults[0].enrolled.forEach(element => {

                    if (element.toString() == req.studentId.toString()) {
                        enrolledFlag = true;
                    }
                });

                if (enrolledFlag) {

                    const d = new Date();
                    let dateString = d.toString();

                    const file = {
                        assignmentId: req.params.id,
                        studentId: req.studentId,
                        timestamp: dateString,
                        path: req.file.path,
                        filename: req.file.filename,
                        mimetype: req.file.mimetype
                    }

                    const id = await saveFile(file)

                    res.status(201).send({ id: id })

                } else {
                    res.status(403).send({
                        error: "Student is not enrolled in this class."
                    })
                }
            } else {
                res.status(401).send({
                    error: "Specified assignment could not be found."
                })
            }
        } else {
            res.status(400).send({
                error: "Invalid request object."
            })
        }
    } catch (err) {
        console.error(err)
        res.status(500).send({
            error: "Unable to post submission. Please try again later."
        })
    }

})

router.patch('/:assignmentId/submission/:submissionId', checkAdmin, checkInstructor, async function(req, res, next) {
    try {
        const assignmentId = req.params.assignmentId
        const submissionId = req.params.submissionId
        const db = getDbReference()

        if (validateAgainstSchema(req.body, gradeSchema)) {
            //get courseid from assignment
            const assignmentCollection = db.collection('assignments')
            const assignmentResults = await assignmentCollection.find({ _id: new ObjectId(assignmentId) }).toArray()

            if (assignmentResults.length != 0) {

                const submissionCollection = db.collection('submissions.files')
                const submissionResult = await submissionCollection.find({ _id: ObjectId(submissionId) }).toArray()
                console.log("=====sub", submissionResult)

                if (submissionResult.length != 0) {

                    //get instructorid from course
                    const courseCollection = db.collection('courses')
                    const courseResults = await courseCollection.find({ _id: new ObjectId(assignmentResults[0].courseId) }).toArray()

                    //check authentication then procede
                    if (((req.instructorId == courseResults[0].instructorId) || req.admin)) {
                        if (req.body) {
                            const collection = db.collection('submissions.files')
                            const result = await collection.updateOne({ _id: ObjectId(submissionId) }, { $set: { "metadata.grade": req.body.grade } })
                            res.status(200).send({ result })
                        }

                    } else {
                        res.status(403).send({
                            error: "Invalid Credentials"
                        })
                    }
                } else {
                    res.status(401).send({
                        error: "Specified submission could not be found."
                    })
                }
            } else {
                res.status(401).send({
                    error: "Specified assignment could not be found."
                })
            }
        } else {
            res.status(400).send({
                error: "Invalid request object."
            })
        }
    } catch (err) {
        console.error(err)
        res.status(500).send({
            error: "Unable to update submission grade. Please try again later."
        })
    }
})


module.exports = router