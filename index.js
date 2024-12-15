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
            const cursor = jobsCollection.find();
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

        // application related apis 
        app.get('/user/job-application', async (req, res) => {
            const email = req.query.email;
            const query = {applicant_email: email};
            const result = await jobApplicationCollection.find(query).toArray();
            res.send(result)
        })
        app.post('/job-applications', async (req, res) => {
            try {
                const applications = req.body;
                const result = await jobApplicationCollection.insertOne(applications);

                if (!result.acknowledged) {
                    return res.status(500).send({ message: "Failed to submit job application" });
                }

                res.status(201).send({
                    message: "Job application submitted successfully",
                    result
                })
            } catch (error) {
                console.error("Error submitting job application", error);
                res.status(500).send({ message: "An error occurred while submitting the job application" });
            }
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