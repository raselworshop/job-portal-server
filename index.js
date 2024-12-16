const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;


app.use(cors());
app.use(express.json());

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
        await client.connect();

        const jobsCollection = client.db('jobPortal').collection('jobs');
        const jobApplicationCollection = client.db('jobPortal').collection('job_applications')

        app.get('/jobs', async (req, res) => {
            const email = req.query.email;
            let query = {};
            if (email) {
                query = { hr_email: email }
            }
            const cursor = jobsCollection.find(query);
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
                console.log("Error fetching job details", error);
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
            const query = {job_id:jobId};
            const result = await jobApplicationCollection.find(query).toArray();
            res.send(result)
        })

        // application related apis 
        app.get('/user/job-application', async (req, res) => {
            const email = req.query.email;
            const query = { applicant_email: email };
            const result = await jobApplicationCollection.find(query).toArray();
            for (const appliaction of result) {
                console.log(appliaction.job_id)
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
                console.log("Updated Job:", updatedResult);
                console.log(job)

                res.status(201).send({
                    message: "Job application submitted successfully",
                    result
                })
            } catch (error) {
                console.error("Error submitting job application", error);
                res.status(500).send({ message: "An error occurred while submitting the job application" });
            }
        })

        app.patch('/recruiter/view-applications/set-status/:id', async (req, res) => {
            const id = req.params.id;
            const data= req.body;
            const filter = {_id: new ObjectId(id)};
            const updateDoc = {
                $set:{
                    status: data.status
                }
            }
            const result = await jobApplicationCollection.updateOne(filter, updateDoc);
            res.send(result)
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
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