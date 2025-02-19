const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;


app.use(cors({
    origin: [
        "http://localhost:5173",
        "https://job-portal-63338.web.app",
        "https://job-portal-63338.firebaseapp.com"
    ],
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const logger = async (req, res, next) => {
    // console.log('inside the logger')
    next();
}
const verifyToken = async (req, res, next) => {
    // console.log('inside the verify token middleware', req.cookies)
    const token = req?.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized access' })
    }
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: "Unauthorized acccess" })
        }
        req.user = decoded;

        next()
    })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5hy3n.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// console.log(uri)
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const jobsCollection = client.db('jobPortal').collection('jobs');
        const jobApplicationCollection = client.db('jobPortal').collection('job_applications')

        // auth related APIs 
        app.post('/user/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV=== "production",
                    sameSite: process.env.NODE_ENV=== "production" ? "none": "strict"
                })
                .send({ success: true })
        })
        app.post('/user/logout', (req, res) => {
            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV=== "production",
                sameSite: process.env.NODE_ENV=== "production" ? "none": "strict"
            })
                .send({ success: true })
        })
        app.get('/jobs', logger, async (req, res) => {
            // console.log('inside the api callback now')
            const email = req.query.email;
            const sort = req.query?.sort;
            const search = req.query?.search;
            const min = req.query?.min;
            const max = req.query?.max;

            let sortQuery = {};
            let query = {};
            if (email) {
                query = { hr_email: email }
            }
            if(sort=="true"){
                sortQuery = {'salaryRange.min' : -1}
            }
            if(search){
                query.location = {$regex: search, $options: "i"}
            }
            if(min && max){
                query = {
                    ...query,
                    "salaryRange.min":{$gte: min},
                    "salaryRange.max":{$lte: max}
                }
            }
            // console.log(query)
            const cursor = jobsCollection.find(query).sort(sortQuery);
            const result = await cursor.toArray();
            res.send(result)
        })
        app.get('/jobs/jobs-details/:id', async (req, res) => {
            try {
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ message: "Invalid job id" });
                }
                const query = { _id: new ObjectId(id) };
                const result = await jobsCollection.findOne(query);
                if (!result) {
                    return res.status(404).send({ message: "Job not found" })
                }
                res.send(result)
            } catch (error) {
                // console.log("Error fetching job details", error);
                res.status(500).send({ message: "An error happen while job details fetching" })
            }
        })
        // job adding 
        app.post('/apis/jobs', async (req, res) => {
            const newJob = req.body;
            const result = await jobsCollection.insertOne(newJob);
            res.send(result)
        })

        app.get('/recruiter/view-applications/:job_Id', async (req, res) => {
            const jobId = req.params.job_Id;
            const query = { job_id: jobId };
            const result = await jobApplicationCollection.find(query).toArray();
            res.send(result)
        })

        // application related apis 
        app.get('/user/job-application', verifyToken, async (req, res) => {
            const email = req.query.email;
            const query = { applicant_email: email };

            if (req.user.email !== req.query.email) {
                return res.status(403).send({ message: "Forbidden access" })
            }

            // console.log("creadentials cookies", req.cookies)

            const result = await jobApplicationCollection.find(query).toArray();
            //  not best way
            for (const appliaction of result) {
                // console.log(appliaction.job_id)
                const query1 = { _id: new ObjectId(appliaction.job_id) };
                const job = await jobsCollection.findOne(query1);
                if (job) {
                    appliaction.title = job.title;
                    appliaction.location = job.location;
                    appliaction.company = job.company;
                    appliaction.company_logo = job.company_logo
                }
            }
            res.send(result)
        })
        app.post('/job-applications', async (req, res) => {
            try {
                const applications = req.body;
                const result = await jobApplicationCollection.insertOne(applications);

                if (!result.acknowledged) {
                    return res.status(500).send({ message: "Failed to submit job application" });
                }

                const jobId = applications.job_id;
                const jobQuery = { _id: new ObjectId(jobId) };
                const job = await jobsCollection.findOne(jobQuery);

                if (!job) {
                    return res.status(404).send({ message: "Job not found" });
                }

                let jobCount = 0;
                if (job.appliactionCount) {
                    jobCount = job.appliactionCount + 1;
                } else {
                    jobCount = 1;
                }
                // update the job info 
                const filter = { _id: new ObjectId(jobId) }
                const updatedDoc = {
                    $set: {
                        appliactionCount: jobCount
                    }
                }
                const updatedResult = await jobsCollection.updateOne(filter, updatedDoc)
                // console.log("Updated Job:", updatedResult);
                // console.log(job)

                res.status(201).send({
                    message: "Job application submitted successfully",
                    result
                })
            } catch (error) {
                // console.error("Error submitting job application", error);
                res.status(500).send({ message: "An error occurred while submitting the job application" });
            }
        })

        app.patch('/recruiter/view-applications/set-status/:id', async (req, res) => {
            const id = req.params.id;
            const data = req.body;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: data.status
                }
            }
            const result = await jobApplicationCollection.updateOne(filter, updateDoc);
            res.send(result)
        })

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', async (req, res) => {
    res.send('The Job Portal server is running');
})

app.listen(port, () => {
    console.log(`Jobs are waiting for server running on: ${port}`)
})