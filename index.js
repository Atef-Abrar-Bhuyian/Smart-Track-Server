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
    const userCollection = client.db("smartTrack").collection("users");
    const assetsCollection = client.db("smartTrack").collection("assets");

    // users related api
    // hr

    // Users Get
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // Users Post
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User Already Exists", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // Assets Post
    app.post("/assets", async (req, res) => {
      const asset = req.body;
      const query = {  productName: asset?.productName };
      const existingAsset = await assetsCollection.findOne(query);
      if (existingAsset) {
        return res.send({ message: "Asset Already Exists", insertedId: null });
      }
      const result = await assetsCollection.insertOne(asset);
      res.send(result);
    });

    // Admin Check
    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;

      // // checkign token email and user email same or not
      // if (email !== req.decoded.email) {
      //   return res.status(403).send({ message: "Forbidden Access" });
      // }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user.role === "HR";
      }
      res.send({ admin });
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
