require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
    const teamCollection = client.db("smartTrack").collection("teams");

    // users related api
    // hr

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
      const query = {
        hrEmail: asset?.hrEmail,
        productName: asset?.productName,
      };
      const existingAsset = await assetsCollection.findOne(query);
      if (existingAsset) {
        return res.send({ message: "Asset Already Exists", insertedId: null });
      }
      const result = await assetsCollection.insertOne(asset);
      res.send(result);
    });

    // Assets Get
    app.get("/assetsList/:email", async (req, res) => {
      const hrEmail = req.params.email;
      const query = { hrEmail: hrEmail };
      const result = await assetsCollection.find(query).toArray();
      res.send(result);
    });

    // employees not in team
    app.get("/usersNotInTeam", async (req, res) => {
      // Fetch all users
      const allUsers = await userCollection.find().toArray();

      // Fetch all employee_ids from the teamCollection using aggregation
      const teams = await teamCollection
        .aggregate([
          { $unwind: "$employees" },
          { $project: { "employees.employee_id": 1 } },
        ])
        .toArray();
      // Extract employee_ids
      const teamMemberIds = teams.map((team) => team.employees?.employee_id);

      // Filter users who are not in any team and do not have the role 'HR'
      const usersNotInTeam = allUsers.filter(
        (user) =>
          !teamMemberIds.includes(user._id.toString()) && user.role !== "HR"
      );

      // Send the filtered users
      res.send(usersNotInTeam);
    });

    // employee add in team
    app.post("/addToTeam", async (req, res) => {
      const { employee_id, hrEmail, employeeName, employeePhoto } = req.body;

      const query = { email: hrEmail };
      const hrInfo = userCollection.find(query);
      const hrPackage = await hrInfo
        .map((package) => package.selectedPackage)
        .toArray();

      const packageValue = hrPackage[0];

      // Check if the employee is already in any team
      const existingTeam = await teamCollection.findOne({
        "employees.employee_id": employee_id,
      });

      if (existingTeam) {
        return res
          .status(400)
          .send({ message: "Employee is already in a team" });
      }
      // Check if the HR already exists in the database
      const existingHRTeam = await teamCollection.findOne({ hrEmail });

      if (packageValue === "basic" && existingHRTeam?.employees.length === 5) {
        return res.status(400).send({ message: "limit reached" });
      }

      if (packageValue === "advance" && existingHRTeam?.employees.length === 10) {
        return res.send({ message: "limit reached" });
      }

      if (packageValue === "ultimate" && existingHRTeam?.employees.length === 20) {
        return res.send({ message: "limit reached" });
      }

      if (existingHRTeam) {
        // HR exists, directly add the employee to the 'employees' array
        await teamCollection.updateOne(
          { hrEmail },
          { $push: { employees: { employee_id, employeeName, employeePhoto } } }
        );

        return res
          .status(200)
          .send({ message: "Successfully Added", insertedId: true });
      }

      // If HR team does not exist, create a new team and add the employee
      const result = await teamCollection.insertOne({
        hrEmail,
        employees: [{ employee_id, employeeName, employeePhoto }],
      });

      res
        .status(200)
        .send({ message: "Successfully Added", insertedId: result.insertedId });
    });

    // get my team's employees
    app.get("/myTeam/:email", async (req, res) => {
      const email = req.params.email;
      const query = { hrEmail: email };
      const result = await teamCollection.find(query).toArray();
      res.send(result);
    });

    // Delete an employee from team
    app.delete("/myTeam/:email", async (req, res) => {
      const { deleteUserId } = req.body;
      const query = { "employees.employee_id": deleteUserId };
      const update = { $pull: { employees: { employee_id: deleteUserId } } };

      const result = await teamCollection.updateOne(query, update);
      res.send(result);
    });

    // Delete an Asset
    app.delete("/assetsList/:email", async (req, res) => {
      const { id } = req.body;
      const query = { _id: new ObjectId(id) };
      const result = await assetsCollection.deleteOne(query);
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
