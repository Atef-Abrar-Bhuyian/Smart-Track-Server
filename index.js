require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require("mongodb");

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.68dnu.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const hrCollection = client.db("smartTrack").collection("users");

    // users related api
    // hr
    app.get("/users", async (req, res) => {
      const result = await hrCollection.find().toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
        const user = req.body;
        console.log(user);
        // insert Email if user doesn't exists.
        // we can do this in many ways(1. email unique, 2. usert, 3. simple checking)
        const query = { email: user?.email };
        const existingUser = await hrCollection.findOne(query);
        if (existingUser) {
          return res.send({ message: "User Already Exists", insertedId: null });
        }
        const result = await hrCollection.insertOne(user);
        res.send(result);
      });








    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("SmartTrack Server is Running");
});

app.listen(port, () => {
  console.log(`SmartTrack Server is Running on Port: ${port}`);
});
